import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  extractParsedTransitionId,
  locationTransitionBodySchema,
  type LocationTransitionBody,
  parseTransitionRpcRow,
  PRESENCE_TRANSITION_CODE_CONTRACT,
  type TransitionRpcRow,
  transitionErrorResponse,
  transitionSuccessResponse,
  validateReasonShape,
} from '@/lib/presence/transition-contract';
import { emitPresenceEvent } from '@/lib/presence/observability';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

function knockConsumeResult(
  reason: LocationTransitionBody['reason'] | undefined,
  code: string,
): 'consumed' | 'not-consumed' | 'already-consumed' | 'expired' | 'superseded' | 'invalid' | 'not-ready' | null {
  if (reason !== 'knock-enter') return null;
  if (code === 'LOCATION_UPDATED' || code === 'LOCATION_UNCHANGED') return 'consumed';
  if (code === 'KNOCK_ALREADY_CONSUMED') return 'already-consumed';
  if (code === 'KNOCK_EXPIRED') return 'expired';
  if (code === 'KNOCK_SUPERSEDED' || code === 'LOCATION_SUPERSEDED') return 'superseded';
  if (code === 'KNOCK_INVALID') return 'invalid';
  if (code === 'KNOCK_NOT_READY') return 'not-ready';
  return 'not-consumed';
}

function sanitizedInternalError(transitionId: string | null): NextResponse {
  return transitionErrorResponse('INTERNAL_ERROR', transitionId);
}

function authErrorResponse(code: 'UNAUTHORIZED' | 'AUTH_SESSION_REVOKED', transitionId: string | null): NextResponse {
  return transitionErrorResponse(code, transitionId);
}

export async function POST(request: Request): Promise<NextResponse> {
  let transitionId: string | null = null;
  let parsedTransition: LocationTransitionBody | null = null;
  let appUserId: string | null = null;
  const correlationId = randomUUID();
  const startedAt = Date.now();

  const observe = (code: string, row?: TransitionRpcRow): void => {
    const contract = code in PRESENCE_TRANSITION_CODE_CONTRACT
      ? PRESENCE_TRANSITION_CODE_CONTRACT[code as keyof typeof PRESENCE_TRANSITION_CODE_CONTRACT]
      : null;
    emitPresenceEvent({
      category: 'location',
      action: 'transition',
      resultCode: code,
      correlationId,
      durationMs: Date.now() - startedAt,
      retryable: contract?.retryable ?? false,
      transitionId,
      appUserId,
      presenceSessionId: parsedTransition?.sessionId ?? null,
      reason: parsedTransition?.reason ?? null,
      targetSpaceId: parsedTransition?.spaceId ?? null,
      expectedLocationVersion: parsedTransition?.expectedLocationVersion ?? null,
      previousSpaceId: row?.previous_space_id ?? null,
      resultSpaceId: row?.current_space_id ?? null,
      resultLocationVersion: row?.location_version ?? null,
      previousLocationVersion: row?.previous_location_version ?? null,
      idempotentReplay: row?.already_applied ?? null,
      authorizationMode: row?.authorization_mode ?? null,
      requestId: parsedTransition?.knockRequestId ?? null,
      requesterUserId: parsedTransition?.reason === 'knock-enter' ? appUserId : null,
      requesterLocationVersionBefore:
        parsedTransition?.reason === 'knock-enter'
          ? parsedTransition.expectedLocationVersion ?? null
          : null,
      requesterLocationVersionAfter:
        parsedTransition?.reason === 'knock-enter' ? row?.location_version ?? null : null,
      consumeResult: knockConsumeResult(parsedTransition?.reason, code),
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
    const parsedBody = locationTransitionBodySchema.safeParse(body);
    if (!parsedBody.success || !validateReasonShape(parsedBody.data)) {
      observe('INVALID_REQUEST');
      return transitionErrorResponse('INVALID_REQUEST', transitionId);
    }
    parsedTransition = parsedBody.data;

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      observe(auth.code);
      return auth.code === 'AUTH_SESSION_REVOKED'
        ? authErrorResponse('AUTH_SESSION_REVOKED', transitionId)
        : authErrorResponse('UNAUTHORIZED', transitionId);
    }
    appUserId = auth.identity.appUserId;

    const { data, error } = await auth.admin.rpc('transition_user_location_observed', {
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

    if (isSuccessCode) {
      observe(rpcRow.code, rpcRow);
      return transitionSuccessResponse(rpcRow);
    }

    const contract = PRESENCE_TRANSITION_CODE_CONTRACT[rpcRow.code];
    observe(rpcRow.code, rpcRow);
    return transitionErrorResponse(rpcRow.code, rpcRow.transition_id, contract.status);
  } catch {
    observe('INTERNAL_ERROR');
    return sanitizedInternalError(transitionId);
  }
}
