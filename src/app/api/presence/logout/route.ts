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

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return transitionErrorResponse('INVALID_REQUEST', null);
    }

    transitionId = extractParsedTransitionId(body);
    const parsedBody = logoutTransitionBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return transitionErrorResponse('INVALID_REQUEST', transitionId);
    }

    const auth = await requireVerifiedPresenceLogoutAuth(parsedBody.data.transitionId);
    if (!auth.ok) {
      return auth.code === 'AUTH_SESSION_REVOKED'
        ? transitionErrorResponse('AUTH_SESSION_REVOKED', transitionId)
        : transitionErrorResponse('UNAUTHORIZED', transitionId);
    }

    const { data, error } = await auth.admin.rpc('transition_user_location', {
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
      return sanitizedInternalError(transitionId);
    }

    const rpcRow = parseTransitionRpcRow(data);
    if (!rpcRow) {
      return sanitizedInternalError(transitionId);
    }

    const isSuccessCode = rpcRow.code === 'LOCATION_UPDATED' || rpcRow.code === 'LOCATION_UNCHANGED';
    if (rpcRow.ok !== isSuccessCode) {
      return sanitizedInternalError(transitionId);
    }

    if (!isSuccessCode) {
      const contract = PRESENCE_TRANSITION_CODE_CONTRACT[rpcRow.code];
      return transitionErrorResponse(rpcRow.code, rpcRow.transition_id, contract.status);
    }

    const { error: signOutError } = await auth.supabase.auth.signOut({ scope: 'local' });
    if (signOutError) {
      console.warn('Presence logout local sign-out failed');
      return sanitizedInternalError(rpcRow.transition_id);
    }

    await confirmRevokedAuthSession(
      auth.admin,
      auth.identity.appUserId,
      auth.identity.authSessionId
    );

    return transitionSuccessResponse(rpcRow);
  } catch (error) {
    const correlationId = randomUUID();
    console.error('Presence logout failed', { correlationId, error });
    return sanitizedInternalError(transitionId);
  }
}
