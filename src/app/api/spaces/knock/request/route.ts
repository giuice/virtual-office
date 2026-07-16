import { NextResponse } from 'next/server';
import {
  knockErrorMessage,
  knockErrorStatus,
  knockRequestBodySchema,
  knockRpcResultSchema,
} from '@/lib/presence/knock-contract';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const parsedBody = knockRequestBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    const { data, error } = await auth.admin.rpc('create_knock_request', {
      p_requester_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedBody.data.sessionId,
      p_space_id: parsedBody.data.spaceId,
      p_request_id: parsedBody.data.requestId,
    });

    if (error) {
      throw new Error('create_knock_request RPC failed');
    }

    const parsedResult = knockRpcResultSchema.safeParse(data);
    if (!parsedResult.success) {
      throw new Error('create_knock_request returned an invalid contract');
    }

    if (!parsedResult.data.ok) {
      const status = knockErrorStatus(parsedResult.data.code);
      return NextResponse.json({
        error: knockErrorMessage(parsedResult.data.code),
        ...parsedResult.data,
      }, {
        status,
        headers: parsedResult.data.retryAfterSeconds
          ? { 'Retry-After': String(parsedResult.data.retryAfterSeconds) }
          : undefined,
      });
    }

    return NextResponse.json(parsedResult.data);
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error('Knock request failed', { correlationId, error });
    return NextResponse.json(
      { error: 'Knock operation failed.', code: 'KNOCK_INTERNAL_ERROR', correlationId },
      { status: 500 }
    );
  }
}
