import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';

export interface VerifiedPresenceIdentity {
  appUserId: string;
  companyId: string | null;
  authSessionId: string;
}

export type VerifiedPresenceAuthResult =
  | {
      ok: true;
      identity: VerifiedPresenceIdentity;
      admin: SupabaseClient;
      supabase: SupabaseClient;
    }
  | {
      ok: false;
      status: number;
      code: 'UNAUTHORIZED' | 'AUTH_SESSION_REVOKED' | 'USER_NOT_FOUND';
      error: string;
    };

export type VerifiedPresenceLogoutAuthResult =
  | {
      ok: true;
      identity: VerifiedPresenceIdentity;
      admin: SupabaseClient;
      supabase: SupabaseClient;
      fencedReplay: boolean;
    }
  | {
      ok: false;
      status: number;
      code: 'UNAUTHORIZED' | 'AUTH_SESSION_REVOKED' | 'USER_NOT_FOUND';
      error: string;
    };

const sessionIdClaimSchema = z.string().uuid();

interface ClaimsData {
  claims?: {
    sub?: unknown;
    session_id?: unknown;
  } | null;
}

async function deriveVerifiedPresenceIdentity(): Promise<VerifiedPresenceAuthResult> {
  const [supabase, admin] = await Promise.all([
    createSupabaseServerClient(),
    createSupabaseServerClient('service_role'),
  ]);

  const { data, error } = await supabase.auth.getClaims();
  const claims = (data as ClaimsData | null)?.claims;

  if (error || !claims || typeof claims.sub !== 'string' || claims.sub.length === 0) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
    };
  }

  const parsedSessionId = sessionIdClaimSchema.safeParse(claims.session_id);
  if (!parsedSessionId.success) {
    console.warn('Verified Supabase session claim unavailable for presence auth');
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
    };
  }

  const userRepository = new SupabaseUserRepository(admin);
  const appUser = await userRepository.findBySupabaseUid(claims.sub);

  if (!appUser) {
    return {
      ok: false,
      status: 404,
      code: 'USER_NOT_FOUND',
      error: 'Authenticated user profile not found',
    };
  }

  return {
    ok: true,
    identity: {
      appUserId: appUser.id,
      companyId: appUser.companyId,
      authSessionId: parsedSessionId.data,
    },
    admin,
    supabase,
  };
}

export async function requireVerifiedPresenceAuth(): Promise<VerifiedPresenceAuthResult> {
  const auth = await deriveVerifiedPresenceIdentity();
  if (!auth.ok) {
    return auth;
  }

  const { data: revokedFence, error: fenceError } = await auth.admin
    .from('revoked_presence_auth_sessions')
    .select('auth_session_id')
    .eq('user_id', auth.identity.appUserId)
    .eq('auth_session_id', auth.identity.authSessionId)
    .maybeSingle();

  if (fenceError) {
    throw new Error('Failed to verify presence auth session fence');
  }

  if (revokedFence) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_SESSION_REVOKED',
      error: 'Authentication session revoked',
    };
  }

  return auth;
}

export async function requireVerifiedPresenceLogoutAuth(
  transitionId: string
): Promise<VerifiedPresenceLogoutAuthResult> {
  const auth = await deriveVerifiedPresenceIdentity();
  if (!auth.ok) {
    return auth;
  }

  const { data: revokedFence, error: fenceError } = await auth.admin
    .from('revoked_presence_auth_sessions')
    .select('auth_session_id')
    .eq('user_id', auth.identity.appUserId)
    .eq('auth_session_id', auth.identity.authSessionId)
    .maybeSingle();

  if (fenceError) {
    throw new Error('Failed to verify presence auth session fence');
  }

  if (!revokedFence) {
    return { ...auth, fencedReplay: false };
  }

  const { data: storedLogout, error: replayError } = await auth.admin
    .from('location_transition_requests')
    .select('transition_id')
    .eq('user_id', auth.identity.appUserId)
    .eq('transition_id', transitionId)
    .eq('auth_session_id', auth.identity.authSessionId)
    .eq('reason', 'logout')
    .is('requested_space_id', null)
    .is('knock_request_id', null)
    .is('expected_location_version', null)
    .not('result', 'is', null)
    .maybeSingle();

  if (replayError) {
    throw new Error('Failed to verify logout replay request');
  }

  if (!storedLogout) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_SESSION_REVOKED',
      error: 'Authentication session revoked',
    };
  }

  return { ...auth, fencedReplay: true };
}
