// src/lib/auth/rate-limit.ts
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/auth/authorize';

// Audit M-09: per-user fixed-window limits for messaging mutations.
// Enforced by the service-role-only check_rate_limit RPC (shared Postgres
// counter, safe across serverless instances).
const RATE_LIMITS = {
  'message:create': { limit: 30, windowSeconds: 60 },
  'message:react': { limit: 60, windowSeconds: 60 },
  'message:upload': { limit: 10, windowSeconds: 60 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

/**
 * Returns a 429 response when the user exceeded the action's limit,
 * null when the request may proceed. Call AFTER the authz check, with the
 * authenticated user's DB id (users.id, not supabase_uid).
 *
 * Fails open: an RPC error (e.g. migration not applied yet) is logged and
 * the request is allowed — rate limiting must never take messaging down.
 */
export async function enforceRateLimit(
  serviceClient: SupabaseClient,
  userDbId: string,
  action: RateLimitedAction
): Promise<NextResponse | null> {
  const { limit, windowSeconds } = RATE_LIMITS[action];

  try {
    const { data: allowed, error } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: userDbId,
      p_action: action,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error(`Rate limit check failed for ${action}:`, error);
      return null;
    }

    if (allowed === false) {
      return jsonError(429, 'rate_limited', 'Too many requests. Please slow down.');
    }

    return null;
  } catch (error) {
    console.error(`Rate limit check threw for ${action}:`, error);
    return null;
  }
}
