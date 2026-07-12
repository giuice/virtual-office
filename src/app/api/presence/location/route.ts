import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  extractParsedTransitionId,
  locationTransitionBodySchema,
  parseTransitionRpcRow,
  PRESENCE_TRANSITION_CODE_CONTRACT,
  transitionErrorResponse,
  transitionSuccessResponse,
  validateReasonShape,
} from '@/lib/presence/transition-contract';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

function sanitizedInternalError(transitionId: string | null): NextResponse {
  return transitionErrorResponse('INTERNAL_ERROR', transitionId);
}

function authErrorResponse(code: 'UNAUTHORIZED' | 'AUTH_SESSION_REVOKED', transitionId: string | null): NextResponse {
  return transitionErrorResponse(code, transitionId);
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
    const parsedBody = locationTransitionBodySchema.safeParse(body);
    if (!parsedBody.success || !validateReasonShape(parsedBody.data)) {
      return transitionErrorResponse('INVALID_REQUEST', transitionId);
    }

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return auth.code === 'AUTH_SESSION_REVOKED'
        ? authErrorResponse('AUTH_SESSION_REVOKED', transitionId)
        : authErrorResponse('UNAUTHORIZED', transitionId);
    }

    const { data, error } = await auth.admin.rpc('transition_user_location', {
      p_user_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedBody.data.sessionId,
      p_transition_id: parsedBody.data.transitionId,
      p_target_space_id: parsedBody.data.spaceId,
      p_reason: parsedBody.data.reason,
      p_knock_request_id: parsedBody.data.knockRequestId,
      p_expected_location_version: parsedBody.data.expectedLocationVersion ?? null,
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

    if (isSuccessCode) {
      return transitionSuccessResponse(rpcRow);
    }

    const contract = PRESENCE_TRANSITION_CODE_CONTRACT[rpcRow.code];
    return transitionErrorResponse(rpcRow.code, rpcRow.transition_id, contract.status);
  } catch (error) {
    const correlationId = randomUUID();
    console.error('Presence location transition failed', { correlationId, error });
    return sanitizedInternalError(transitionId);
  }
}
