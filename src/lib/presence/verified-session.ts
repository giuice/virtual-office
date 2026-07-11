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
  | { ok: true; identity: VerifiedPresenceIdentity; admin: SupabaseClient }
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

export async function requireVerifiedPresenceAuth(): Promise<VerifiedPresenceAuthResult> {
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

  const { data: revokedFence, error: fenceError } = await admin
    .from('revoked_presence_auth_sessions')
    .select('auth_session_id')
    .eq('user_id', appUser.id)
    .eq('auth_session_id', parsedSessionId.data)
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

  return {
    ok: true,
    identity: {
      appUserId: appUser.id,
      companyId: appUser.companyId,
      authSessionId: parsedSessionId.data,
    },
    admin,
  };
}
