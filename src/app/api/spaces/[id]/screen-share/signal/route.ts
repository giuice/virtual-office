import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';
import { callObservedScreenShareRpc } from '@/lib/webrtc/observed-screen-share-rpc';
import {
  screenShareActiveRpcResultSchema,
  screenShareDescriptionPayloadSchema,
  screenShareErrorContract,
  screenShareHandshakePayloadSchema,
  screenShareIcePayloadSchema,
  screenShareRpcContractError,
  screenShareSignalRequestSchema,
  screenShareSignalResponseSchema,
  screenShareSpaceParamsSchema,
  type ScreenShareSignalingPayload,
} from '@/lib/webrtc/screen-share-contract';
import { broadcastScreenShareSignal } from '@/lib/webrtc/screen-share-signal-broadcast';

export const dynamic = 'force-dynamic';

const MAX_SIGNAL_BODY_BYTES = 110_000;
const SIGNALS_PER_SECOND = 120;

interface SignalRouteContext {
  params: Promise<{ id: string }>;
}

function publicError(code: string): NextResponse {
  const contract = screenShareErrorContract(code);
  return NextResponse.json({
    success: false,
    code: contract.code,
    error: contract.error,
    retryable: contract.retryable,
  }, { status: contract.status });
}

function internalError(correlationId: string): NextResponse {
  const contract = screenShareErrorContract('INTERNAL_ERROR');
  console.warn('screen_share_route', {
    correlationId,
    operation: 'signal',
    outcome: contract.code,
    retryable: contract.retryable,
  });
  return NextResponse.json({
    success: false,
    code: contract.code,
    error: contract.error,
    retryable: contract.retryable,
    correlationId,
  }, { status: contract.status });
}

async function readSignalBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_SIGNAL_BODY_BYTES) {
      return null;
    }
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_SIGNAL_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: SignalRouteContext): Promise<NextResponse> {
  const correlationId = randomUUID();

  try {
    const { id } = await context.params;
    const parsedParams = screenShareSpaceParamsSchema.safeParse({ spaceId: id });
    const parsedBody = screenShareSignalRequestSchema.safeParse(await readSignalBody(request));
    if (!parsedParams.success || !parsedBody.success) return publicError('INVALID_REQUEST');

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) return publicError(auth.code);
    if (!auth.identity.companyId) return publicError('MEMBERSHIP_SCOPE_INVALID');

    const rateLimit = await auth.admin.rpc('check_rate_limit', {
      p_user_id: auth.identity.appUserId,
      p_action: `screen-share-signal:${parsedParams.data.spaceId}`,
      p_limit: SIGNALS_PER_SECOND,
      p_window_seconds: 1,
    });
    if (rateLimit.error) {
      const compatibilityError = screenShareRpcContractError(rateLimit.error);
      return compatibilityError ? publicError(compatibilityError.code) : internalError(correlationId);
    }
    if (typeof rateLimit.data !== 'boolean') return publicError('DATABASE_CONTRACT_INCOMPATIBLE');
    if (!rateLimit.data) return publicError('RATE_LIMITED');

    const rpcArgs = {
      p_auth_subject: auth.identity.authSubject,
      p_auth_session_id: auth.identity.authSessionId,
      p_presence_session_id: parsedBody.data.presenceSessionId,
      p_space_id: parsedParams.data.spaceId,
    };
    const authorization = await callObservedScreenShareRpc(
      () => auth.admin.rpc('get_active_screen_share_observed', rpcArgs),
      screenShareActiveRpcResultSchema,
    );
    if (authorization.kind === 'provider-error') {
      const compatibilityError = screenShareRpcContractError(authorization.error);
      return compatibilityError ? publicError(compatibilityError.code) : internalError(correlationId);
    }
    if (authorization.kind === 'malformed') return publicError('DATABASE_CONTRACT_INCOMPATIBLE');
    if (!authorization.result.ok) return publicError(authorization.result.code);

    const signal = parsedBody.data;
    if (signal.type === 'handshake' && signal.shareId !== null) return publicError('INVALID_REQUEST');
    if (signal.type !== 'handshake' && signal.shareId !== null) {
      const active = authorization.result.active;
      if (!active || active.shareId !== signal.shareId) return publicError('LEASE_STALE');
      if (active.presenterUserId !== auth.identity.appUserId) return publicError('LEASE_NOT_OWNER');
    }

    const sourceScope = {
      sourceUserId: auth.identity.appUserId,
      sourcePresenceSessionId: signal.presenceSessionId,
      sourceConnectionId: signal.connectionId,
      companyId: auth.identity.companyId,
      spaceId: parsedParams.data.spaceId,
      shareId: signal.shareId,
    };
    let payload: ScreenShareSignalingPayload;
    if (signal.type === 'handshake') {
      payload = screenShareHandshakePayloadSchema.parse({ type: signal.type, ...sourceScope });
    } else if (signal.type === 'description') {
      payload = screenShareDescriptionPayloadSchema.parse({
        type: signal.type,
        ...sourceScope,
        targetUserId: signal.targetUserId,
        targetPresenceSessionId: signal.targetPresenceSessionId,
        targetConnectionId: signal.targetConnectionId,
        description: signal.description,
      });
    } else {
      payload = screenShareIcePayloadSchema.parse({
        type: signal.type,
        ...sourceScope,
        targetUserId: signal.targetUserId,
        targetPresenceSessionId: signal.targetPresenceSessionId,
        targetConnectionId: signal.targetConnectionId,
        candidate: signal.candidate,
      });
    }

    if (request.signal.aborted) return publicError('INVALID_REQUEST');
    await broadcastScreenShareSignal(payload);

    const response = screenShareSignalResponseSchema.parse({
      success: true,
      code: 'SIGNAL_SENT',
    });
    return NextResponse.json(response);
  } catch {
    return internalError(correlationId);
  }
}
