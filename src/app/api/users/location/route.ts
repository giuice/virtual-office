import { NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import type { User } from '@/types/database';
import { z } from 'zod';

const updateLocationSchema = z.object({
  userId: z.string().uuid(),
  spaceId: z.string().uuid().nullable(),
  offline: z.boolean().optional(),
});

export const dynamic = 'force-dynamic';
const SPACE_REJOIN_GRACE_MS = 5 * 60 * 1000;

interface SpaceAccessControl {
  isPublic?: boolean;
  allowedUsers?: string[];
  allowedRoles?: string[];
  ownerId?: string;
}

interface SpaceRow {
  id: string;
  company_id: string;
  status: string;
  capacity: number;
  access_control: SpaceAccessControl | null;
}

interface KnockAuthorizationRow {
  id: string;
  responder_id: string | null;
}

interface PriorOccupancyRow {
  exited_at: string;
}

function userHasDirectSpaceAccess(user: User, accessControl: SpaceAccessControl | null): boolean {
  if (accessControl?.isPublic !== false) {
    return true;
  }

  return Boolean(
    user.role === 'admin' ||
    accessControl.ownerId === user.id ||
    accessControl.allowedUsers?.includes(user.id) ||
    (user.role && accessControl.allowedRoles?.includes(user.role))
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
}) {
  const { supabase, userId, previousSpaceId, nextSpaceId, timestamp, authorizedByUserId = null } = params;

  if (previousSpaceId && previousSpaceId !== nextSpaceId) {
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

async function getAuthenticatedAppUser() {
  const supabase = await createSupabaseServerClient();
  const supabaseAdmin = await createSupabaseServerClient('service_role');
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
  spaceId: string
): Promise<SpaceRow | null> {
  const { data: space, error } = await supabase
    .from('spaces')
    .select('id, company_id, status, capacity, access_control')
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
  userId: string
): Promise<KnockAuthorizationRow | null> {
  const { data: knockAuthorization, error } = await supabase
    .from('knock_requests')
    .select('id, responder_id')
    .eq('space_id', spaceId)
    .eq('requester_id', userId)
    .eq('status', 'approved')
    .eq('decision', 'APPROVE')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify private space approval: ${error.message}`);
  }

  return knockAuthorization;
}

async function getMostRecentPriorOccupancy(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  spaceId: string,
  userId: string
): Promise<PriorOccupancyRow | null> {
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
}) {
  const { supabase, authenticatedUser, targetSpace, spaceId } = params;

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

  const isRestrictedSpace = targetSpace.access_control?.isPublic === false;
  if (!isRestrictedSpace) {
    return { authorizedByUserId: null, consumedKnockRequestId: null };
  }

  const isAlreadyInSpace = authenticatedUser.currentSpaceId === spaceId;

  if (userHasDirectSpaceAccess(authenticatedUser, targetSpace.access_control) || isAlreadyInSpace) {
    return { authorizedByUserId: null, consumedKnockRequestId: null };
  }

  const priorOccupancy = await getMostRecentPriorOccupancy(supabase, spaceId, authenticatedUser.id);

  // Primary check: exited_at from space_presence_log
  const hasGraceRejoinByExitLog = Boolean(
    priorOccupancy?.exited_at &&
      Date.now() - new Date(priorOccupancy.exited_at).getTime() < SPACE_REJOIN_GRACE_MS
  );

  // Secondary check: last_active from users table (handles beacon POST race)
  // If user was recently active AND had this space as their previous space,
  // they are likely rejoining after a reload where the beacon hasn't committed yet
  const hasGraceRejoinByLastActive = Boolean(
    !hasGraceRejoinByExitLog &&
      authenticatedUser.lastActive &&
      Date.now() - new Date(authenticatedUser.lastActive).getTime() < SPACE_REJOIN_GRACE_MS
  );

  // Also check if there is an OPEN (no exited_at) presence log for this user+space
  // This handles the case where the user was in the space and reloaded before beacon
  let hasOpenPresenceLog = false;
  if (!hasGraceRejoinByExitLog && !hasGraceRejoinByLastActive) {
    const { data: openLog } = await supabase
      .from('space_presence_log')
      .select('id')
      .eq('user_id', authenticatedUser.id)
      .eq('space_id', spaceId)
      .is('exited_at', null)
      .limit(1)
      .maybeSingle();
    hasOpenPresenceLog = Boolean(openLog);
  }

  if (hasGraceRejoinByExitLog || hasGraceRejoinByLastActive || hasOpenPresenceLog) {
    return { authorizedByUserId: null, consumedKnockRequestId: null };
  }

  const approvedKnock = await getApprovedKnockAuthorization(supabase, spaceId, authenticatedUser.id);
  if (approvedKnock) {
    return {
      authorizedByUserId: approvedKnock.responder_id,
      consumedKnockRequestId: approvedKnock.id,
    };
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
  try {
    const authContext = await getAuthenticatedAppUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const {
      supabaseAdmin,
      userRepository,
      authenticatedUser,
    } = authContext;

    let requestBody;
    try {
      requestBody = await parseLocationBody(request);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validationResult = updateLocationSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return NextResponse.json({ 
        error: 'Invalid input', 
        details: validationResult.error.errors 
      }, { status: 400 });
    }

    const { userId, spaceId, offline = false } = validationResult.data;

    if (userId !== authenticatedUser.id) {
      return NextResponse.json(
        {
          error: 'Authenticated user does not match requested location update target',
          code: 'USER_MISMATCH',
        },
        { status: 403 }
      );
    }

    // Offline beacon (tab close / reload): only mark status offline, preserve space.
    // The user's current_space_id stays set so they reappear in the same space on
    // reload (no grace-rejoin race). Offline users are filtered from space avatars
    // on the client, so stale positions don't affect other users' views.
    if (offline) {
      const offlineUser = await userRepository.update(authenticatedUser.id, {
        status: 'offline',
      });

      if (!offlineUser) {
        return NextResponse.json({ error: 'Failed to update offline status' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        user: offlineUser,
        message: 'User marked offline',
      }, { status: 200 });
    }

    const previousSpaceId = authenticatedUser.currentSpaceId ?? null;
    const spaceChanged = previousSpaceId !== spaceId;
    const timestamp = new Date().toISOString();
    let authorizedByUserId: string | null = null;
    let consumedKnockRequestId: string | null = null;

    if (spaceId) {
      const targetSpace = await getSpaceForValidation(supabaseAdmin, spaceId);

      if (!targetSpace) {
        return NextResponse.json({ error: 'Space not found' }, { status: 404 });
      }

      const authorization = await enforceSpaceAuthorization({
        supabase: supabaseAdmin,
        authenticatedUser,
        targetSpace,
        spaceId,
      });

      if ('errorResponse' in authorization) {
        return authorization.errorResponse;
      }

      authorizedByUserId = authorization.authorizedByUserId ?? null;
      consumedKnockRequestId = authorization.consumedKnockRequestId ?? null;
    }

    const updatedUser = await userRepository.updateLocation(authenticatedUser.id, spaceId);

    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update user location' }, { status: 500 });
    }

    // Reload beacons mark users offline while preserving current_space_id. Reconnect
    // refreshes liveness in DB so server-side knock/responder checks stay accurate.
    let responseUser = updatedUser;
    if (spaceId && authenticatedUser.status === 'offline') {
      const reactivatedUser = await userRepository.update(authenticatedUser.id, {
        status: 'online',
      });
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
      });
    }

    if (consumedKnockRequestId) {
      const { error: deleteKnockError } = await supabaseAdmin
        .from('knock_requests')
        .delete()
        .eq('id', consumedKnockRequestId);

      if (deleteKnockError) {
        throw new Error(`Failed to consume approved knock authorization: ${deleteKnockError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      user: responseUser,
      message: 'Location updated successfully',
    }, { status: 200 });

  } catch (error) {
    console.error('Error updating user location:', error);
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update location',
      details: error 
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return handleLocationUpdate(request);
}

export async function POST(request: Request) {
  return handleLocationUpdate(request);
}
