// src/lib/auth/rate-limit.ts
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/auth/authorize';
import type { InsertionQuota } from '@/types/messaging';

interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
  /**
   * Phase 5 T3 (D4 planning decision): when the limit cannot be checked (RPC
   * error, missing or revoked function, unexpected result), refuse the request
   * with 429 instead of allowing it. Other actions keep failing open.
   */
  failClosed: boolean;
}

// Audit M-09: per-user fixed-window limits for messaging mutations.
// Enforced by the service-role-only check_rate_limit RPC (shared Postgres
// counter, safe across serverless instances).
//
// Phase 5 T3 (FR-008) message send budgets, all per user and fail-closed:
//   * 'message:create' — INSERTION QUOTA (unchanged 30/60 s; D1 needs a burst
//     of >= 10). Every create of this build (keyed, unkeyed, attachments) is
//     charged by the database in the transaction of a winning insertion only
//     (create_message_attempt → private.charge_message_insertion_quota,
//     migration 20261007114454; serialized per user, rollover-safe):
//     replays, lost same-key races and refused or failed creates never
//     consume it; MESSAGE_INSERTION_QUOTA hands it over. Clients cannot insert
//     messages directly. Phase 4 servers charge the same counter at their
//     route, so both builds share one quota.
//   * 'message:create-request' — REQUEST BUDGET: every authenticated create
//     request (malformed bodies, validation failures, replays, quota losers
//     included), charged first, in its own transaction, so it survives an
//     insertion rollback. 60/60 s = 2x the insertion quota: a full quota of
//     new messages plus one replay or retry each; an outbox drain of 10 items
//     with one replay each uses 20.
//   * 'message:fence' — FENCE BUDGET: every authenticated fence/lookup call
//     plus the fence step of each generation-carrying create. 90/60 s = the
//     request budget's 60 generation-carrying creates plus 30 explicit
//     lookups; a drain of 10 items (create + lookup + replay each) uses 30.
//   Bound on private.message_send_attempts growth: a key row is created only
//   by a fence step (<= 90 per user per minute) or a committed generation-less
//   keyed create (<= 30, insertion quota): <= 120 new rows per user per minute.
const RATE_LIMITS = {
  'message:create': { limit: 30, windowSeconds: 60, failClosed: true },
  'message:create-request': { limit: 60, windowSeconds: 60, failClosed: true },
  'message:react': { limit: 60, windowSeconds: 60, failClosed: false },
  // Phase 4 T13: one upload per file, up to 5 files per message, plus retries
  // of failed uploads; 10/min refused the second full message in a minute.
  // 30/min = six 5-file messages, in line with message:create (each file is
  // still capped at 10 MB and only links to the uploader's own message).
  'message:upload': { limit: 30, windowSeconds: 60, failClosed: false },
  // Phase 4 T12: cancelling pending uploads (composer remove/cancel).
  'message:upload-cancel': { limit: 60, windowSeconds: 60, failClosed: false },
  // Phase 5 T2/T3: fence/lookup of the caller's own composition key (outbox
  // recovery after unknown outcomes), see the budgets above.
  'message:fence': { limit: 90, windowSeconds: 60, failClosed: true },
  // Visible-message receipts are batched by the drawer while it scrolls.
  'conversation:read-receipts': { limit: 120, windowSeconds: 60, failClosed: false },
  // Phase 5 T6 (FR-027, AC-028): messaging metric batches (<= 50 events,
  // <= 16 KB each) from all of the user's tabs, charged on every
  // authenticated request (oversized and malformed ones included). Bounds
  // ADMISSION: at most 30 requests (so at most 30 x 50 = 1,500 metric lines)
  // per user are admitted per fixed 60-second bucket, by admission time; like
  // every fixed window, up to 2x that can be admitted within one rolling
  // minute across a bucket boundary. It does not bound when the admitted
  // lines are emitted: batches admitted just before a rollover may finish
  // logging after it, beside newly admitted ones. check_rate_limit serializes each
  // (user, action) and reads the bucket after its lock (migration
  // 20261008012709), so a delayed check cannot reopen an exhausted bucket.
  // Fail-closed: the client drops a refused batch, so refusing never affects
  // messaging.
  'messaging:metrics': { limit: 30, windowSeconds: 60, failClosed: true },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

/**
 * The message insertion quota handed to the database, which charges it to
 * the 'message:create' counter in the transaction of a winning insertion.
 */
export const MESSAGE_INSERTION_QUOTA: InsertionQuota = {
  limit: RATE_LIMITS['message:create'].limit,
  windowSeconds: RATE_LIMITS['message:create'].windowSeconds,
};

/** 429: the user exhausted a limit (transient). */
export function rateLimitExceededResponse(): NextResponse {
  return jsonError(429, 'rate_limited', 'Too many requests. Please slow down.');
}

/** 429: a fail-closed limit could not be checked (transient). */
export function rateLimitUnavailableResponse(): NextResponse {
  return jsonError(429, 'rate_limited', 'The request could not be rate checked. Please retry shortly.');
}

/**
 * Returns a 429 response when the user exceeded the action's limit,
 * null when the request may proceed. Call AFTER authentication, with the
 * authenticated user's DB id (users.id, not supabase_uid).
 *
 * Fail-open actions: an RPC error (e.g. migration not applied yet) is logged
 * and the request is allowed — rate limiting must never take those down.
 * Fail-closed actions (Phase 5 T3: message send budgets): an RPC error or an
 * unexpected result refuses the request with 429.
 */
export async function enforceRateLimit(
  serviceClient: SupabaseClient,
  userDbId: string,
  action: RateLimitedAction
): Promise<NextResponse | null> {
  const { limit, windowSeconds, failClosed } = RATE_LIMITS[action];

  try {
    const { data: allowed, error } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: userDbId,
      p_action: action,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error(`Rate limit check failed for ${action}:`, error);
      return failClosed ? rateLimitUnavailableResponse() : null;
    }

    if (allowed === false) {
      return rateLimitExceededResponse();
    }

    if (failClosed && allowed !== true) {
      console.error(`Rate limit check returned an unexpected result for ${action}:`, allowed);
      return rateLimitUnavailableResponse();
    }

    return null;
  } catch (error) {
    console.error(`Rate limit check threw for ${action}:`, error);
    return failClosed ? rateLimitUnavailableResponse() : null;
  }
}
