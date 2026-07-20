import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  knockErrorMessage,
  knockErrorStatus,
  knockExpiryResult,
  knockRequestBodySchema,
  knockRpcResultSchema,
  type KnockRpcResult,
  toPublicKnockRpcResult,
} from '@/lib/presence/knock-contract';
import { broadcastKnockInvalidated } from '@/lib/presence/knock-broadcast';
import { emitPresenceEvent } from '@/lib/presence/observability';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

const MAX_LOCK_SET_ATTEMPTS = 4;

class KnockLockSetExhaustedError extends Error {
  constructor() {
    super('create_knock_request lock set did not stabilize');
    this.name = 'KnockLockSetExhaustedError';
  }
}

type VerifiedPresenceAuth = Extract<
  Awaited<ReturnType<typeof requireVerifiedPresenceAuth>>,
  { ok: true }
>;

async function createKnockWithStableLockSet(
  auth: VerifiedPresenceAuth,
  input: {
    readonly sessionId: string;
    readonly spaceId: string;
    readonly requestId: string;
  },
): Promise<KnockRpcResult> {
  const rpcArguments = {
    p_requester_id: auth.identity.appUserId,
    p_auth_session_id: auth.identity.authSessionId,
    p_session_id: input.sessionId,
    p_space_id: input.spaceId,
    p_request_id: input.requestId,
  };

  for (let attempt = 0; attempt < MAX_LOCK_SET_ATTEMPTS; attempt += 1) {
    const { data, error } = await auth.admin.rpc(
      'create_knock_request_observed',
      rpcArguments,
    );

    if (error) {
      throw new Error('create_knock_request RPC failed');
    }

    const parsedResult = knockRpcResultSchema.safeParse(data);
    if (!parsedResult.success) {
      throw new Error('create_knock_request returned an invalid contract');
    }

    if (parsedResult.data.code !== 'RETRY_LOCK_SET') {
      return parsedResult.data;
    }
  }

  throw new KnockLockSetExhaustedError();
}

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let appUserId: string | null = null;
  let companyId: string | null = null;
  let presenceSessionId: string | null = null;
  let requestId: string | null = null;
  let spaceId: string | null = null;
  const observe = (
    resultCode: string,
    result?: KnockRpcResult,
  ): void => {
    emitPresenceEvent({
      category: 'knock',
      action: 'request',
      resultCode,
      correlationId,
      durationMs: Date.now() - startedAt,
      appUserId,
      companyId,
      presenceSessionId,
      requestId,
      requesterUserId: appUserId,
      spaceId,
      stateTransition: result?.status ? `create:${result.status}` : null,
      requesterLocationVersionAfter:
        result?.requesterLocationVersionAfter ?? result?.requesterLocationVersion ?? null,
      requesterLocationVersionBefore: result?.requesterLocationVersionBefore ?? null,
      requesterAccessRevision: result?.requesterAccessRevision ?? null,
      spaceAccessRevision: result?.spaceAccessRevision ?? null,
      expiryResult: knockExpiryResult(result),
      idempotentReplay: result?.alreadyApplied ?? null,
      retryable: resultCode === 'KNOCK_RATE_LIMITED' || resultCode === 'KNOCK_INTERNAL_ERROR',
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
    const parsedBody = knockRequestBodySchema.safeParse(body);
    if (!parsedBody.success) {
      observe('INVALID_REQUEST');
      return NextResponse.json(
        { error: knockErrorMessage('INVALID_REQUEST'), code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    presenceSessionId = parsedBody.data.sessionId;
    requestId = parsedBody.data.requestId;
    spaceId = parsedBody.data.spaceId;

    const result = await createKnockWithStableLockSet(auth, parsedBody.data);

    if (!result.ok) {
      const status = knockErrorStatus(result.code);
      observe(result.code, result);
      return NextResponse.json({
        error: knockErrorMessage(result.code),
        ...toPublicKnockRpcResult(result),
      }, {
        status,
        headers: result.retryAfterSeconds
          ? { 'Retry-After': String(result.retryAfterSeconds) }
          : undefined,
      });
    }

    if (!result.alreadyApplied) {
      await broadcastKnockInvalidated(auth.admin, auth.identity.companyId);
    }

    observe(result.code, result);
    return NextResponse.json(toPublicKnockRpcResult(result));
  } catch (error) {
    const lockSetExhausted = error instanceof KnockLockSetExhaustedError;
    observe('KNOCK_INTERNAL_ERROR');
    return NextResponse.json(
      { error: 'Knock operation failed.', code: 'KNOCK_INTERNAL_ERROR', correlationId },
      {
        status: lockSetExhausted ? 503 : 500,
        headers: lockSetExhausted ? { 'Retry-After': '1' } : undefined,
      }
    );
  }
}
