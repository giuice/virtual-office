import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  heartbeatPresenceSessionRpcSchema,
  PRESENCE_SESSION_RPC_ERROR_STATUS,
  sessionIdParamSchema,
} from '@/lib/presence/session-schemas';
import { emitPresenceEvent } from '@/lib/presence/observability';
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
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let appUserId: string | null = null;
  let presenceSessionId: string | null = null;
  const observe = (
    resultCode: string,
    retryable = false,
    activeSessionCount: number | null = null,
  ): void => {
    emitPresenceEvent({
      category: 'session',
      action: 'heartbeat',
      resultCode,
      correlationId,
      durationMs: Date.now() - startedAt,
      retryable,
      appUserId,
      presenceSessionId,
      activeSessionCount,
    });
  };

  try {
    void request;

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      observe(auth.code, auth.status >= 500);
      return presenceSessionErrorResponse(auth.status, auth.code, auth.error);
    }
    appUserId = auth.identity.appUserId;

    const { sessionId } = await params;
    const parsedSessionId = sessionIdParamSchema.safeParse(sessionId);
    if (!parsedSessionId.success) {
      observe('VALIDATION_ERROR');
      return presenceSessionErrorResponse(400, 'VALIDATION_ERROR', 'Invalid presence session id');
    }
    presenceSessionId = parsedSessionId.data;

    const { data, error } = await auth.admin.rpc('heartbeat_presence_session_observed', {
      p_user_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_session_id: parsedSessionId.data,
    });

    if (error) {
      observe('PRESENCE_SESSION_ERROR', true);
      return sanitizedOperationErrorResponse();
    }

    const parsedRpc = heartbeatPresenceSessionRpcSchema.safeParse(data);
    if (!parsedRpc.success) {
      observe('PRESENCE_SESSION_ERROR', true);
      return sanitizedOperationErrorResponse();
    }

    if (!parsedRpc.data.ok) {
      observe(parsedRpc.data.code, false, parsedRpc.data.activeSessionCount);
      return presenceSessionErrorResponse(
        PRESENCE_SESSION_RPC_ERROR_STATUS[parsedRpc.data.code],
        parsedRpc.data.code,
        'Presence session operation failed'
      );
    }

    observe('SESSION_HEARTBEAT', false, parsedRpc.data.activeSessionCount);
    return NextResponse.json({ expiresAt: parsedRpc.data.expiresAt });
  } catch {
    observe('PRESENCE_SESSION_ERROR', true);
    return sanitizedOperationErrorResponse();
  }
}
