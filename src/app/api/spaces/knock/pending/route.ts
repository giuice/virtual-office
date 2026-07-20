import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  knockErrorMessage,
  knockErrorStatus,
  knockPendingQuerySchema,
  knockRpcResultSchema,
} from '@/lib/presence/knock-contract';
import { emitPresenceEvent } from '@/lib/presence/observability';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let appUserId: string | null = null;
  let companyId: string | null = null;
  let presenceSessionId: string | null = null;
  let spaceId: string | null = null;
  const observe = (resultCode: string): void => {
    emitPresenceEvent({
      category: 'knock',
      action: 'pending',
      resultCode,
      correlationId,
      durationMs: Date.now() - startedAt,
      appUserId,
      companyId,
      presenceSessionId,
      responderUserId: appUserId,
      spaceId,
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

    const searchParams = new URL(request.url).searchParams;
    const parsedQuery = knockPendingQuerySchema.safeParse({
      sessionId: searchParams.get('sessionId'),
      spaceId: searchParams.get('spaceId'),
    });

    if (!parsedQuery.success) {
      observe('INVALID_REQUEST');
      return NextResponse.json(
        { error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    presenceSessionId = parsedQuery.data.sessionId;
    spaceId = parsedQuery.data.spaceId;

    const { data, error } = await auth.admin.rpc('get_pending_knock_requests_for_session', {
      p_responder_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedQuery.data.sessionId,
      p_space_id: parsedQuery.data.spaceId,
    });

    if (error) throw new Error('get_pending_knock_requests_for_session RPC failed');

    const parsedResult = knockRpcResultSchema.safeParse(data);
    if (!parsedResult.success) throw new Error('get_pending_knock_requests_for_session returned an invalid contract');

    if (!parsedResult.data.ok) {
      observe(parsedResult.data.code);
      return NextResponse.json({
        error: knockErrorMessage(parsedResult.data.code),
        ...parsedResult.data,
      }, { status: knockErrorStatus(parsedResult.data.code) });
    }

    observe(parsedResult.data.code);
    return NextResponse.json(parsedResult.data);
  } catch {
    observe('KNOCK_INTERNAL_ERROR');
    return NextResponse.json(
      { error: 'Knock operation failed.', code: 'KNOCK_INTERNAL_ERROR', correlationId },
      { status: 500 }
    );
  }
}
