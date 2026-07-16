import { NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import {
  beginLegacyPresenceWrite,
  completionStatusForResponse,
  isLegacyPresenceWriteGateError,
  type LegacyPresenceCompletionStatus,
  type LegacyPresenceWriteGate,
} from '@/lib/presence/legacy-write-gate';
import type { User } from '@/types/database';
import { z } from 'zod';

const updateLocationSchema = z.object({
  userId: z.string().uuid(),
  spaceId: z.string().uuid().nullable(),
  offline: z.boolean().optional(),
  knockRequestId: z.string().uuid().optional(),
});

export const dynamic = 'force-dynamic';
const SPACE_REJOIN_GRACE_MS = 5 * 60 * 1000;

interface SpaceAccessControl {
  isPublic?: unknown;
  allowedUsers?: unknown;
  allowedRoles?: unknown;
  ownerId?: unknown;
}

interface SpaceRow {
  id: string;
  company_id: string;
  status: string;
  capacity: number;
  access_control: unknown;
  presence_access_revision: number;
}

interface KnockAuthorizationRow {
  id: string;
  responder_id: string | null;
  requester_location_version: number;
  requester_access_revision: number;
  space_access_revision: number;
  responder_access_revision: number | null;
  company_id: string;
}

interface PriorOccupancyRow {
  exited_at: string;
}

type SpaceAccessClassification = 'public' | 'restricted' | 'invalid';

function classifySpaceAccessControl(accessControl: unknown): SpaceAccessClassification {
  if (accessControl === null) {
    return 'public';
  }

  if (typeof accessControl !== 'object' || Array.isArray(accessControl)) {
    return 'invalid';
  }

  const accessControlRecord = accessControl as SpaceAccessControl;
  if (Object.keys(accessControlRecord).length === 0) {
    return 'public';
  }

  if (accessControlRecord.isPublic === true) {
    return 'public';
  }

  if (accessControlRecord.isPublic === false) {
    return 'restricted';
  }

  return 'invalid';
}

function userHasDirectSpaceAccess(user: User, accessControl: SpaceAccessControl): boolean {
  const allowedUsers = Array.isArray(accessControl.allowedUsers) ? accessControl.allowedUsers : [];
  const allowedRoles = Array.isArray(accessControl.allowedRoles) ? accessControl.allowedRoles : [];

  return Boolean(
    user.role === 'admin' ||
    accessControl.ownerId === user.id ||
    allowedUsers.includes(user.id) ||
    (user.role && allowedRoles.includes(user.role))
  );
}

async function parseLocationBody(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('text/plain')) {
    const text = await request.text();
    return JSON.parse(text);
  }

  return request.json();
}

async function syncSpacePresenceLog(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  previousSpaceId: string | null;
  nextSpaceId: string | null;
  timestamp: string;
  authorizedByUserId?: string | null;
  writeGate: LegacyPresenceWriteGate;
}) {
  const { supabase, userId, previousSpaceId, nextSpaceId, timestamp, authorizedByUserId = null, writeGate } = params;

  if (previousSpaceId && previousSpaceId !== nextSpaceId) {
    writeGate.assertCanStartDatabaseOperation();
    const { error: exitLogError } = await supabase
      .from('space_presence_log')
      .update({ exited_at: timestamp })
      .eq('user_id', userId)
      .eq('space_id', previousSpaceId)
      .is('exited_at', null);

    if (exitLogError) {
      throw new Error(`Failed to close space presence log: ${exitLogError.message}`);
    }
  }

  if (nextSpaceId && previousSpaceId !== nextSpaceId) {
    writeGate.assertCanStartDatabaseOperation();
    const { error: entryLogError } = await supabase
      .from('space_presence_log')
      .insert({
        user_id: userId,
        space_id: nextSpaceId,
        entered_at: timestamp,
        authorized_by: authorizedByUserId,
      });

    if (entryLogError) {
      throw new Error(`Failed to create space presence log: ${entryLogError.message}`);
    }
  }
}

async function getAuthenticatedAppUser(writeGate: LegacyPresenceWriteGate) {
  const [supabase, supabaseAdmin] = await Promise.all([
    createSupabaseServerClient(),
    createSupabaseServerClient('service_role'),
  ]);
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      ),
    };
  }

  const userRepository = new SupabaseUserRepository(supabaseAdmin);
  writeGate.assertCanStartDatabaseOperation();
  const authenticatedUser = await userRepository.findBySupabaseUid(authData.user.id);

  if (!authenticatedUser) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Authenticated user profile not found' },
        { status: 404 }
      ),
    };
  }

  return {
    supabase,
    supabaseAdmin,
    userRepository,
    authenticatedUser,
  };
}

async function getSpaceForValidation(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  spaceId: string,
  writeGate: LegacyPresenceWriteGate
): Promise<SpaceRow | null> {
  writeGate.assertCanStartDatabaseOperation();
  const { data: space, error } = await supabase
    .from('spaces')
    .select('id, company_id, status, capacity, access_control, presence_access_revision')
    .eq('id', spaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load target space: ${error.message}`);
  }

  return space;
}

async function getApprovedKnockAuthorization(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  spaceId: string,
  userId: string,
  knockRequestId: string,
  writeGate: LegacyPresenceWriteGate
): Promise<KnockAuthorizationRow | null> {
  writeGate.assertCanStartDatabaseOperation();
  const { data: knockAuthorization, error } = await supabase
    .from('knock_requests')
    .select('id, responder_id, requester_location_version, requester_access_revision, space_access_revision, responder_access_revision, company_id')
    .eq('id', knockRequestId)
    .eq('requester_id', userId)
    .eq('space_id', spaceId)
    .eq('status', 'approved')
    .eq('decision', 'APPROVE')
    .not('responder_id', 'is', null)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify private space approval: ${error.message}`);
  }

  if (!knockAuthorization?.responder_id || knockAuthorization.responder_access_revision === null) {
    return null;
  }

  writeGate.assertCanStartDatabaseOperation();
  const [{ data: requesterState, error: requesterError }, { data: responderState, error: responderError }] =
    await Promise.all([
      supabase
        .from('users')
        .select('company_id, location_version, presence_access_revision')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('users')
        .select('company_id, current_space_id, presence_access_revision')
        .eq('id', knockAuthorization.responder_id)
        .maybeSingle(),
    ]);

  if (requesterError || responderError) {
    throw new Error('Failed to verify current knock participants');
  }

  if (!requesterState || !responderState) return null;
  if (requesterState.company_id !== knockAuthorization.company_id) return null;
  if (requesterState.location_version !== knockAuthorization.requester_location_version) return null;
  if (requesterState.presence_access_revision !== knockAuthorization.requester_access_revision) return null;
  if (responderState.company_id !== knockAuthorization.company_id) return null;
  if (responderState.current_space_id !== spaceId) return null;
  if (responderState.presence_access_revision !== knockAuthorization.responder_access_revision) return null;

  writeGate.assertCanStartDatabaseOperation();
  const { count: activeResponderSessions, error: sessionError } = await supabase
    .from('user_presence_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', knockAuthorization.responder_id)
    .is('retired_at', null)
    .gt('expires_at', new Date().toISOString());

  if (sessionError) throw new Error('Failed to verify current knock responder session');
  if (!activeResponderSessions) return null;

  return knockAuthorization;
}

async function getMostRecentPriorOccupancy(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  spaceId: string,
  userId: string,
  writeGate: LegacyPresenceWriteGate
): Promise<PriorOccupancyRow | null> {
  writeGate.assertCanStartDatabaseOperation();
  const { data: priorOccupancy, error } = await supabase
    .from('space_presence_log')
    .select('exited_at')
    .eq('user_id', userId)
    .eq('space_id', spaceId)
    .not('exited_at', 'is', null)
    .order('exited_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify prior occupancy: ${error.message}`);
  }

  return priorOccupancy;
}

async function enforceSpaceAuthorization(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  authenticatedUser: User;
  targetSpace: SpaceRow;
  spaceId: string;
  knockRequestId?: string;
  writeGate: LegacyPresenceWriteGate;
}) {
  const { supabase, authenticatedUser, targetSpace, spaceId, knockRequestId, writeGate } = params;

  if (!authenticatedUser.companyId || authenticatedUser.companyId !== targetSpace.company_id) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Cross-company space updates are not allowed', code: 'CROSS_COMPANY_SPACE' },
        { status: 403 }
      ),
    };
  }

  if (targetSpace.capacity > 0) {
    // Only count non-offline users toward capacity.
    // Offline users keep their current_space_id set (for reload recovery)
    // but should not block others from joining.
    writeGate.assertCanStartDatabaseOperation();
    const { count, error: countError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('current_space_id', spaceId)
      .neq('id', authenticatedUser.id)
      .neq('status', 'offline');

    if (countError) {
      throw new Error(`Failed to verify space capacity: ${countError.message}`);
    }

    if (count !== null && count >= targetSpace.capacity) {
      return {
        errorResponse: NextResponse.json(
          { error: 'Space is full', code: 'SPACE_FULL' },
          { status: 409 }
        ),
      };
    }
  }

  if (targetSpace.status !== 'active' && targetSpace.status !== 'available') {
    return {
      errorResponse: NextResponse.json(
        { error: `This space is currently ${targetSpace.status}`, code: 'SPACE_UNAVAILABLE' },
        { status: 409 }
      ),
    };
  }

  const accessClassification = classifySpaceAccessControl(targetSpace.access_control);

  if (accessClassification === 'invalid') {
    console.error('Invalid space access_control configuration', {
      spaceId,
      accessControl: targetSpace.access_control,
    });

    return {
      errorResponse: NextResponse.json(
        {
          error: 'Space access configuration is invalid',
          code: 'SPACE_ACCESS_CONFIGURATION_INVALID',
        },
        { status: 403 }
      ),
    };
  }

  // A supplied approval is a social Knock intent even for public/direct-access
  // rooms. Validate and consume that exact grant so a stale approval can never
  // auto-move a user after a newer action.
  if (knockRequestId) {
    const approvedKnock = await getApprovedKnockAuthorization(
      supabase,
      spaceId,
      authenticatedUser.id,
      knockRequestId,
      writeGate
    );

    if (!approvedKnock || approvedKnock.space_access_revision !== targetSpace.presence_access_revision) {
      return {
        errorResponse: NextResponse.json(
          { error: 'This knock approval is no longer valid.', code: 'KNOCK_INVALID' },
          { status: 403 }
        ),
      };
    }

    return {
      authorizedByUserId: approvedKnock.responder_id,
      consumedKnockRequestId: approvedKnock.id,
    };
  }

  if (accessClassification === 'public') {
    return { authorizedByUserId: null, consumedKnockRequestId: null };
  }

  if (userHasDirectSpaceAccess(authenticatedUser, targetSpace.access_control as SpaceAccessControl)) {
    return { authorizedByUserId: null, consumedKnockRequestId: null };
  }

  const priorOccupancy = await getMostRecentPriorOccupancy(supabase, spaceId, authenticatedUser.id, writeGate);

  // Primary check: exited_at from space_presence_log
  const now = Date.now();
  const priorExitAtMs = priorOccupancy?.exited_at
    ? new Date(priorOccupancy.exited_at).getTime()
    : null;
  const hasGraceRejoinByExitLog = Boolean(
    priorExitAtMs !== null &&
      Number.isFinite(priorExitAtMs) &&
      priorExitAtMs <= now &&
      now - priorExitAtMs < SPACE_REJOIN_GRACE_MS
  );

  if (hasGraceRejoinByExitLog) {
    return { authorizedByUserId: null, consumedKnockRequestId: null };
  }

  return {
    errorResponse: NextResponse.json(
      {
        error: 'This private space requires approval or recent occupancy before you can enter.',
        code: 'SPACE_ACCESS_DENIED',
      },
      { status: 403 }
    ),
  };
}

async function handleLocationUpdate(request: Request) {
  let writeGate: LegacyPresenceWriteGate | null = null;
  let completionStatus: LegacyPresenceCompletionStatus = 'failed';

  const completeWith = (response: NextResponse): NextResponse => {
    completionStatus = completionStatusForResponse(response);
    return response;
  };

  try {
    writeGate = await beginLegacyPresenceWrite();

    const authContext = await getAuthenticatedAppUser(writeGate);
    if ('errorResponse' in authContext && authContext.errorResponse) {
      return completeWith(authContext.errorResponse);
    }

    const {
      supabaseAdmin,
      userRepository,
      authenticatedUser,
    } = authContext;

    let requestBody;
    try {
      requestBody = await parseLocationBody(request);
    } catch {
      return completeWith(NextResponse.json({ error: 'Invalid request body' }, { status: 400 }));
    }

    const validationResult = updateLocationSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return completeWith(NextResponse.json({
        error: 'Invalid input', 
        details: validationResult.error.issues
      }, { status: 400 }));
    }

    const { userId, spaceId, offline = false, knockRequestId } = validationResult.data;

    if (userId !== authenticatedUser.id) {
      return completeWith(NextResponse.json(
        {
          error: 'Authenticated user does not match requested location update target',
          code: 'USER_MISMATCH',
        },
        { status: 403 }
      ));
    }

    // Offline beacon (tab close / reload): only mark status offline, preserve space.
    // The user's current_space_id stays set so they reappear in the same space on
    // reload (no grace-rejoin race). Offline users are filtered from space avatars
    // on the client, so stale positions don't affect other users' views.
    if (offline) {
      writeGate.assertCanStartDatabaseOperation();
      const offlineUser = await userRepository.update(authenticatedUser.id, {
        status: 'offline',
      }, () => writeGate?.assertCanStartDatabaseOperation());

      if (!offlineUser) {
        return completeWith(NextResponse.json({ error: 'Failed to update offline status' }, { status: 500 }));
      }

      return completeWith(NextResponse.json({
        success: true,
        user: offlineUser,
        message: 'User marked offline',
      }, { status: 200 }));
    }

    const previousSpaceId = authenticatedUser.currentSpaceId ?? null;
    const spaceChanged = previousSpaceId !== spaceId;
    const timestamp = new Date().toISOString();
    let authorizedByUserId: string | null = null;
    let consumedKnockRequestId: string | null = null;

    if (spaceId) {
      const targetSpace = await getSpaceForValidation(supabaseAdmin, spaceId, writeGate);

      if (!targetSpace) {
        return completeWith(NextResponse.json({ error: 'Space not found' }, { status: 404 }));
      }

      const authorization = await enforceSpaceAuthorization({
        supabase: supabaseAdmin,
        authenticatedUser,
        targetSpace,
        spaceId,
        knockRequestId,
        writeGate,
      });

      if ('errorResponse' in authorization && authorization.errorResponse) {
        return completeWith(authorization.errorResponse);
      }

      authorizedByUserId = authorization.authorizedByUserId ?? null;
      consumedKnockRequestId = authorization.consumedKnockRequestId ?? null;
    }

    writeGate.assertCanStartDatabaseOperation();
    const { data: versionState, error: versionError } = await supabaseAdmin
      .from('users')
      .select('location_version')
      .eq('id', authenticatedUser.id)
      .maybeSingle();

    if (versionError || !versionState) {
      throw new Error('Failed to load the current location version');
    }

    const expectedLocationVersion = versionState.location_version;
    const nextLocationVersion = spaceChanged
      ? expectedLocationVersion + 1
      : expectedLocationVersion;

    const updatedUser = await userRepository.updateLocation(
      authenticatedUser.id,
      spaceId,
      () => writeGate?.assertCanStartDatabaseOperation(),
      { expectedLocationVersion, nextLocationVersion }
    );

    if (!updatedUser) {
      return completeWith(NextResponse.json(
        {
          error: 'Location changed before this request could be applied',
          code: 'LOCATION_SUPERSEDED',
        },
        { status: 409 }
      ));
    }

    // Reload beacons mark users offline while preserving current_space_id. Reconnect
    // refreshes liveness in DB so server-side knock/responder checks stay accurate.
    let responseUser = updatedUser;
    if (spaceId && authenticatedUser.status === 'offline') {
      writeGate.assertCanStartDatabaseOperation();
      const reactivatedUser = await userRepository.update(authenticatedUser.id, {
        status: 'online',
      }, () => writeGate?.assertCanStartDatabaseOperation());
      if (reactivatedUser) {
        responseUser = reactivatedUser;
      }
    }

    if (spaceChanged) {
      await syncSpacePresenceLog({
        supabase: supabaseAdmin,
        userId: authenticatedUser.id,
        previousSpaceId,
        nextSpaceId: spaceId,
        timestamp,
        authorizedByUserId,
        writeGate,
      });
    }

    if (consumedKnockRequestId) {
      writeGate.assertCanStartDatabaseOperation();
      const { error: consumeKnockError } = await supabaseAdmin
        .from('knock_requests')
        .update({
          status: 'consumed',
          consumed_at: timestamp,
          updated_at: timestamp,
        })
        .eq('id', consumedKnockRequestId);

      if (consumeKnockError) {
        throw new Error(`Failed to consume approved knock authorization: ${consumeKnockError.message}`);
      }
    }

    return completeWith(NextResponse.json({
      success: true,
      user: responseUser,
      message: 'Location updated successfully',
    }, { status: 200 }));

  } catch (error) {
    if (isLegacyPresenceWriteGateError(error)) {
      completionStatus = error.httpStatus >= 500 ? 'failed' : 'rejected';
      return NextResponse.json(error.toBody(), { status: error.httpStatus });
    }

    // Never serialize raw DB/exception details into a presence response
    // (handoff: stable codes + safe messages only; internals stay in logs).
    const correlationId = crypto.randomUUID();
    console.error('Error updating user location:', { correlationId, error });
    completionStatus = 'failed';
    return NextResponse.json({
      success: false,
      error: 'Failed to update location',
      code: 'INTERNAL_ERROR',
    }, { status: 500 });
  } finally {
    if (writeGate) {
      await writeGate.close(completionStatus);
    }
  }
}

export async function PUT(request: Request) {
  return handleLocationUpdate(request);
}

export async function POST(request: Request) {
  return handleLocationUpdate(request);
}
