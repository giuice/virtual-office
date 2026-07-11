import { NextResponse } from 'next/server';
import {
  heartbeatPresenceSessionRpcSchema,
  PRESENCE_SESSION_RPC_ERROR_STATUS,
  sessionIdParamSchema,
} from '@/lib/presence/session-schemas';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{
    sessionId: string;
  }>;
}

function presenceSessionErrorResponse(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

function sanitizedOperationErrorResponse(): NextResponse {
  return presenceSessionErrorResponse(
    500,
    'PRESENCE_SESSION_ERROR',
    'Presence session operation failed'
  );
}

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    void request;

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return presenceSessionErrorResponse(auth.status, auth.code, auth.error);
    }

    const { sessionId } = await params;
    const parsedSessionId = sessionIdParamSchema.safeParse(sessionId);
    if (!parsedSessionId.success) {
      return presenceSessionErrorResponse(400, 'VALIDATION_ERROR', 'Invalid presence session id');
    }

    const { data, error } = await auth.admin.rpc('heartbeat_presence_session', {
      p_user_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedSessionId.data,
    });

    if (error) {
      return sanitizedOperationErrorResponse();
    }

    const parsedRpc = heartbeatPresenceSessionRpcSchema.safeParse(data);
    if (!parsedRpc.success) {
      return sanitizedOperationErrorResponse();
    }

    if (!parsedRpc.data.ok) {
      return presenceSessionErrorResponse(
        PRESENCE_SESSION_RPC_ERROR_STATUS[parsedRpc.data.code],
        parsedRpc.data.code,
        'Presence session operation failed'
      );
    }

    return NextResponse.json({ expiresAt: parsedRpc.data.expiresAt });
  } catch (error) {
    console.error('Presence session heartbeat failed:', error);
    return sanitizedOperationErrorResponse();
  }
}
