import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  extractParsedTransitionId,
  logoutTransitionBodySchema,
  parseTransitionRpcRow,
  PRESENCE_TRANSITION_CODE_CONTRACT,
  transitionErrorResponse,
  transitionSuccessResponse,
} from '@/lib/presence/transition-contract';
import { emitPresenceEvent } from '@/lib/presence/observability';
import { requireVerifiedPresenceLogoutAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

function sanitizedInternalError(transitionId: string | null): NextResponse {
  return transitionErrorResponse('INTERNAL_ERROR', transitionId);
}

async function confirmRevokedAuthSession(
  admin: SupabaseClient,
  appUserId: string,
  authSessionId: string
): Promise<void> {
  const { error } = await admin.rpc('confirm_presence_auth_session_revoked', {
    p_user_id: appUserId,
    p_auth_session_id: authSessionId,
  });

  if (error) {
    console.warn('Presence auth-session revocation confirmation did not complete');
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let transitionId: string | null = null;
  let appUserId: string | null = null;
  const correlationId = randomUUID();
  const startedAt = Date.now();
  const observe = (
    resultCode: string,
    row?: ReturnType<typeof parseTransitionRpcRow>,
  ): void => {
    emitPresenceEvent({
      category: 'location',
      action: 'logout',
      resultCode,
      correlationId,
      durationMs: Date.now() - startedAt,
      transitionId,
      appUserId,
      reason: 'logout',
      previousSpaceId: row?.previous_space_id ?? null,
      resultSpaceId: row?.current_space_id ?? null,
      previousLocationVersion: row?.previous_location_version ?? null,
      resultLocationVersion: row?.location_version ?? null,
      authorizationMode: row?.authorization_mode ?? null,
      idempotentReplay: row?.already_applied ?? null,
      retryable: resultCode === 'INTERNAL_ERROR',
    });
  };

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      observe('INVALID_REQUEST');
      return transitionErrorResponse('INVALID_REQUEST', null);
    }

    transitionId = extractParsedTransitionId(body);
    const parsedBody = logoutTransitionBodySchema.safeParse(body);
    if (!parsedBody.success) {
      observe('INVALID_REQUEST');
      return transitionErrorResponse('INVALID_REQUEST', transitionId);
    }

    const auth = await requireVerifiedPresenceLogoutAuth(parsedBody.data.transitionId);
    if (!auth.ok) {
      observe(auth.code);
      return auth.code === 'AUTH_SESSION_REVOKED'
        ? transitionErrorResponse('AUTH_SESSION_REVOKED', transitionId)
        : transitionErrorResponse('UNAUTHORIZED', transitionId);
    }
    appUserId = auth.identity.appUserId;

    const { data, error } = await auth.admin.rpc('transition_user_location_observed', {
      p_user_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: null,
      p_transition_id: parsedBody.data.transitionId,
      p_target_space_id: null,
      p_reason: 'logout',
      p_knock_request_id: null,
      p_expected_location_version: null,
    });

    if (error) {
      observe('INTERNAL_ERROR');
      return sanitizedInternalError(transitionId);
    }

    const rpcRow = parseTransitionRpcRow(data);
    if (!rpcRow) {
      observe('INTERNAL_ERROR');
      return sanitizedInternalError(transitionId);
    }

    const isSuccessCode = rpcRow.code === 'LOCATION_UPDATED' || rpcRow.code === 'LOCATION_UNCHANGED';
    if (rpcRow.ok !== isSuccessCode) {
      observe('INTERNAL_ERROR');
      return sanitizedInternalError(transitionId);
    }

    if (!isSuccessCode) {
      const contract = PRESENCE_TRANSITION_CODE_CONTRACT[rpcRow.code];
      observe(rpcRow.code, rpcRow);
      return transitionErrorResponse(rpcRow.code, rpcRow.transition_id, contract.status);
    }

    const { error: signOutError } = await auth.supabase.auth.signOut({ scope: 'local' });
    if (signOutError) {
      console.warn('Presence logout local sign-out failed');
      observe('INTERNAL_ERROR', rpcRow);
      return sanitizedInternalError(rpcRow.transition_id);
    }

    await confirmRevokedAuthSession(
      auth.admin,
      auth.identity.appUserId,
      auth.identity.authSessionId
    );

    observe(rpcRow.code, rpcRow);
    return transitionSuccessResponse(rpcRow);
  } catch {
    observe('INTERNAL_ERROR');
    return sanitizedInternalError(transitionId);
  }
}
