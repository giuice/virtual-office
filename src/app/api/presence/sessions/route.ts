import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  PRESENCE_SESSION_RPC_ERROR_STATUS,
  registerPresenceSessionRpcSchema,
  registerSessionBodySchema,
} from '@/lib/presence/session-schemas';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

function presenceSessionErrorResponse(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

function validationErrorResponse(): NextResponse {
  return presenceSessionErrorResponse(400, 'VALIDATION_ERROR', 'Invalid presence session request');
}

function sanitizedOperationErrorResponse(): NextResponse {
  return presenceSessionErrorResponse(
    500,
    'PRESENCE_SESSION_ERROR',
    'Presence session operation failed'
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return presenceSessionErrorResponse(auth.status, auth.code, auth.error);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationErrorResponse();
    }

    const parsedBody = registerSessionBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return validationErrorResponse();
    }

    const { data, error } = await auth.admin.rpc('register_presence_session', {
      p_user_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_registration_id: parsedBody.data.registrationId,
    });

    if (error) {
      return sanitizedOperationErrorResponse();
    }

    const parsedRpc = registerPresenceSessionRpcSchema.safeParse(data);
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

    return NextResponse.json({
      sessionId: parsedRpc.data.sessionId,
      registrationId: parsedRpc.data.registrationId,
      expiresAt: parsedRpc.data.expiresAt,
      sessionSpaceId: parsedRpc.data.sessionSpaceId,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResponse();
    }

    console.error('Presence session registration failed:', error);
    return sanitizedOperationErrorResponse();
  }
}
