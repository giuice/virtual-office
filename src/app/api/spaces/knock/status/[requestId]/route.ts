import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  knockErrorMessage,
  knockErrorStatus,
  knockExpiryResult,
  knockRequestIdSchema,
  knockRpcResultSchema,
  knockStatusQuerySchema,
  type KnockRpcResult,
  toPublicKnockRpcResult,
} from '@/lib/presence/knock-contract';
import { emitPresenceEvent } from '@/lib/presence/observability';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ requestId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let appUserId: string | null = null;
  let companyId: string | null = null;
  let presenceSessionId: string | null = null;
  let requestId: string | null = null;
  const observe = (resultCode: string, result?: KnockRpcResult): void => {
    emitPresenceEvent({
      category: 'knock',
      action: 'status',
      resultCode,
      correlationId,
      durationMs: Date.now() - startedAt,
      appUserId,
      companyId,
      presenceSessionId,
      requestId,
      requesterUserId: appUserId,
      responderUserId: result?.responderId ?? null,
      spaceId: result?.spaceId ?? null,
      stateTransition: result?.status ? `read:${result.status}` : null,
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

    const { requestId: routeRequestId } = await context.params;
    const parsedRequestId = knockRequestIdSchema.safeParse(routeRequestId);
    const parsedQuery = knockStatusQuerySchema.safeParse({
      sessionId: new URL(request.url).searchParams.get('sessionId'),
    });

    if (!parsedRequestId.success || !parsedQuery.success) {
      observe('INVALID_REQUEST');
      return NextResponse.json(
        { error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    requestId = parsedRequestId.data;
    presenceSessionId = parsedQuery.data.sessionId;

    const { data, error } = await auth.admin.rpc('get_knock_request_status_observed', {
      p_requester_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedQuery.data.sessionId,
      p_request_id: parsedRequestId.data,
    });

    if (error) throw new Error('get_knock_request_status RPC failed');

    const parsedResult = knockRpcResultSchema.safeParse(data);
    if (!parsedResult.success) throw new Error('get_knock_request_status returned an invalid contract');

    if (!parsedResult.data.ok) {
      observe(parsedResult.data.code, parsedResult.data);
      return NextResponse.json({
        error: knockErrorMessage(parsedResult.data.code),
        ...toPublicKnockRpcResult(parsedResult.data),
      }, { status: knockErrorStatus(parsedResult.data.code) });
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
