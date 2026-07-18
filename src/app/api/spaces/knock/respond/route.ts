import { NextResponse } from 'next/server';
import {
  knockErrorMessage,
  knockErrorStatus,
  knockResponseBodySchema,
  knockRpcResultSchema,
} from '@/lib/presence/knock-contract';
import { broadcastKnockInvalidated } from '@/lib/presence/knock-broadcast';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const parsedBody = knockResponseBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    const { data, error } = await auth.admin.rpc('respond_to_knock', {
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
      return NextResponse.json({
        error: knockErrorMessage(parsedResult.data.code),
        ...parsedResult.data,
      }, { status: knockErrorStatus(parsedResult.data.code) });
    }

    if (!parsedResult.data.alreadyApplied) {
      await broadcastKnockInvalidated(auth.admin, auth.identity.companyId);
    }

    return NextResponse.json(parsedResult.data);
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error('Knock response failed', { correlationId, error });
    return NextResponse.json(
      { error: 'Knock operation failed.', code: 'KNOCK_INTERNAL_ERROR', correlationId },
      { status: 500 }
    );
  }
}
