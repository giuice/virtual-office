import { NextResponse } from 'next/server';
import {
  knockErrorMessage,
  knockErrorStatus,
  knockRequestIdSchema,
  knockRpcResultSchema,
  knockStatusQuerySchema,
} from '@/lib/presence/knock-contract';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ requestId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
    }

    const { requestId } = await context.params;
    const parsedRequestId = knockRequestIdSchema.safeParse(requestId);
    const parsedQuery = knockStatusQuerySchema.safeParse({
      sessionId: new URL(request.url).searchParams.get('sessionId'),
    });

    if (!parsedRequestId.success || !parsedQuery.success) {
      return NextResponse.json(
        { error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    const { data, error } = await auth.admin.rpc('get_knock_request_status', {
      p_requester_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedQuery.data.sessionId,
      p_request_id: parsedRequestId.data,
    });

    if (error) throw new Error('get_knock_request_status RPC failed');

    const parsedResult = knockRpcResultSchema.safeParse(data);
    if (!parsedResult.success) throw new Error('get_knock_request_status returned an invalid contract');

    if (!parsedResult.data.ok) {
      return NextResponse.json({
        error: knockErrorMessage(parsedResult.data.code),
        ...parsedResult.data,
      }, { status: knockErrorStatus(parsedResult.data.code) });
    }

    return NextResponse.json(parsedResult.data);
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error('Knock status read failed', { correlationId, error });
    return NextResponse.json(
      { error: 'Knock operation failed.', code: 'KNOCK_INTERNAL_ERROR', correlationId },
      { status: 500 }
    );
  }
}
