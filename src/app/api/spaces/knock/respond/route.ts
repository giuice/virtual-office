import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  knockErrorMessage,
  knockErrorStatus,
  knockExpiryResult,
  knockResponseBodySchema,
  knockRpcResultSchema,
  type KnockRpcResult,
  toPublicKnockRpcResult,
} from '@/lib/presence/knock-contract';
import { broadcastKnockInvalidated } from '@/lib/presence/knock-broadcast';
import { emitPresenceEvent } from '@/lib/presence/observability';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let appUserId: string | null = null;
  let companyId: string | null = null;
  let presenceSessionId: string | null = null;
  let requestId: string | null = null;
  let decision: 'APPROVE' | 'DENY' | null = null;
  const observe = (
    resultCode: string,
    result?: KnockRpcResult,
  ): void => {
    emitPresenceEvent({
      category: 'knock',
      action: 'respond',
      resultCode,
      correlationId,
      durationMs: Date.now() - startedAt,
      appUserId,
      companyId,
      presenceSessionId,
      requestId,
      requesterUserId: result?.requesterUserId ?? null,
      responderUserId: result?.responderId ?? appUserId,
      spaceId: result?.spaceId ?? null,
      stateTransition: result?.status
        ? `${decision === 'APPROVE' ? 'approve' : 'deny'}:${result.status}`
        : null,
      idempotentReplay: result?.alreadyApplied ?? null,
      requesterLocationVersionAfter: result?.requesterLocationVersionAfter ?? null,
      requesterAccessRevision: result?.requesterAccessRevision ?? null,
      responderAccessRevision: result?.responderAccessRevision ?? null,
      spaceAccessRevision: result?.spaceAccessRevision ?? null,
      expiryResult: knockExpiryResult(result),
      retryable: resultCode === 'KNOCK_INTERNAL_ERROR',
    });
  };

  try {
    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      observe(auth.code);
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
    }
    appUserId = auth.identity.appUserId;
    companyId = auth.identity.companyId;

    const body = await request.json().catch(() => null);
    const parsedBody = knockResponseBodySchema.safeParse(body);
    if (!parsedBody.success) {
      observe('INVALID_REQUEST');
      return NextResponse.json(
        { error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    presenceSessionId = parsedBody.data.sessionId;
    requestId = parsedBody.data.requestId;
    decision = parsedBody.data.decision;

    const { data, error } = await auth.admin.rpc('respond_to_knock_observed', {
      p_responder_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedBody.data.sessionId,
      p_request_id: parsedBody.data.requestId,
      p_decision: parsedBody.data.decision,
    });

    if (error) {
      throw new Error('respond_to_knock RPC failed');
    }

    const parsedResult = knockRpcResultSchema.safeParse(data);
    if (!parsedResult.success) {
      throw new Error('respond_to_knock returned an invalid contract');
    }

    if (!parsedResult.data.ok) {
      observe(parsedResult.data.code, parsedResult.data);
      return NextResponse.json({
        error: knockErrorMessage(parsedResult.data.code),
        ...toPublicKnockRpcResult(parsedResult.data),
      }, { status: knockErrorStatus(parsedResult.data.code) });
    }

    if (!parsedResult.data.alreadyApplied) {
      await broadcastKnockInvalidated(auth.admin, auth.identity.companyId);
    }

    observe(parsedResult.data.code, parsedResult.data);
    return NextResponse.json(toPublicKnockRpcResult(parsedResult.data));
  } catch {
    observe('KNOCK_INTERNAL_ERROR');
    return NextResponse.json(
      { error: 'Knock operation failed.', code: 'KNOCK_INTERNAL_ERROR', correlationId },
      { status: 500 }
    );
  }
}
