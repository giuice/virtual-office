import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  PRESENCE_SESSION_RPC_ERROR_STATUS,
  registerPresenceSessionRpcSchema,
  registerSessionBodySchema,
} from '@/lib/presence/session-schemas';
import { emitPresenceEvent } from '@/lib/presence/observability';
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
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let appUserId: string | null = null;
  let companyId: string | null = null;
  let presenceSessionId: string | null = null;
  const observe = (
    resultCode: string,
    retryable = false,
    activeSessionCount: number | null = null,
  ): void => {
    emitPresenceEvent({
      category: 'session',
      action: 'register',
      resultCode,
      correlationId,
      durationMs: Date.now() - startedAt,
      retryable,
      appUserId,
      companyId,
      presenceSessionId,
      activeSessionCount,
    });
  };

  try {
    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      observe(auth.code, auth.status >= 500);
      return presenceSessionErrorResponse(auth.status, auth.code, auth.error);
    }
    appUserId = auth.identity.appUserId;
    companyId = auth.identity.companyId;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      observe('VALIDATION_ERROR');
      return validationErrorResponse();
    }

    const parsedBody = registerSessionBodySchema.safeParse(body);
    if (!parsedBody.success) {
      observe('VALIDATION_ERROR');
      return validationErrorResponse();
    }

    if (!auth.identity.companyId) {
      observe('NO_COMPANY');
      return presenceSessionErrorResponse(
        403,
        'NO_COMPANY',
        'Presence session operation failed',
      );
    }
    if (auth.identity.companyId !== parsedBody.data.expectedCompanyId) {
      observe('PRESENCE_COMPANY_SCOPE_CHANGED');
      return presenceSessionErrorResponse(
        409,
        'PRESENCE_COMPANY_SCOPE_CHANGED',
        'Presence company scope changed',
      );
    }

    const { data, error } = await auth.admin.rpc('register_presence_session_observed', {
      p_user_id: auth.identity.appUserId,
      p_auth_session_id: auth.identity.authSessionId,
      p_registration_id: parsedBody.data.registrationId,
      p_expected_company_id: parsedBody.data.expectedCompanyId,
    });

    if (error) {
      observe('PRESENCE_SESSION_ERROR', true);
      return sanitizedOperationErrorResponse();
    }

    const parsedRpc = registerPresenceSessionRpcSchema.safeParse(data);
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

    presenceSessionId = parsedRpc.data.sessionId;
    observe(
      parsedRpc.data.refreshed ? 'SESSION_REFRESHED' : 'SESSION_REGISTERED',
      false,
      parsedRpc.data.activeSessionCount,
    );

    return NextResponse.json({
      sessionId: parsedRpc.data.sessionId,
      companyId: parsedRpc.data.companyId,
      registrationId: parsedRpc.data.registrationId,
      expiresAt: parsedRpc.data.expiresAt,
      sessionSpaceId: parsedRpc.data.sessionSpaceId,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      observe('VALIDATION_ERROR');
      return validationErrorResponse();
    }

    observe('PRESENCE_SESSION_ERROR', true);
    return sanitizedOperationErrorResponse();
  }
}
