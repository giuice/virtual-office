import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';
import {
  screenShareErrorContract,
  screenShareRenewRequestSchema,
  screenShareRenewResponseSchema,
  screenShareRenewRpcResultSchema,
  screenShareRpcContractError,
  screenShareSpaceParamsSchema,
} from '@/lib/webrtc/screen-share-contract';
import { callObservedScreenShareRpc } from '@/lib/webrtc/observed-screen-share-rpc';

export const dynamic = 'force-dynamic';

interface RenewRouteContext {
  params: Promise<{ id: string }>;
}

function internalError(correlationId: string): NextResponse {
  const { code, error, retryable } = screenShareErrorContract('INTERNAL_ERROR');
  return NextResponse.json({
    success: false,
    code,
    error,
    retryable,
    correlationId,
  }, { status: 500 });
}

export async function POST(request: Request, context: RenewRouteContext): Promise<NextResponse> {
  const correlationId = randomUUID();

  try {
    const { id } = await context.params;
    const parsedParams = screenShareSpaceParamsSchema.safeParse({ spaceId: id });
    const body = await request.json().catch(() => null);
    const parsedBody = screenShareRenewRequestSchema.safeParse(body);
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'Invalid screen share request.',
        retryable: false,
      }, { status: 400 });
    }

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return NextResponse.json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Authentication required',
        retryable: false,
      }, { status: auth.status });
    }

    if (!auth.identity.companyId) {
      const contract = screenShareErrorContract('MEMBERSHIP_SCOPE_INVALID');
      return NextResponse.json({
        success: false,
        code: contract.code,
        error: contract.error,
        retryable: contract.retryable,
      }, { status: contract.status });
    }

    const rpc = await callObservedScreenShareRpc(
      () => auth.admin.rpc('renew_screen_share_observed', {
        p_auth_subject: auth.identity.authSubject,
        p_auth_session_id: auth.identity.authSessionId,
        p_presence_session_id: parsedBody.data.presenceSessionId,
        p_space_id: parsedParams.data.spaceId,
        p_share_id: parsedBody.data.shareId,
      }),
      screenShareRenewRpcResultSchema,
    );
    if (rpc.kind === 'provider-error') {
      const compatibilityError = screenShareRpcContractError(rpc.error);
      if (compatibilityError) {
        const { code, status, error, retryable } = compatibilityError;
        return NextResponse.json({ success: false, code, error, retryable }, { status });
      }
      return internalError(correlationId);
    }
    if (rpc.kind === 'malformed') {
      const { code, status, error, retryable } = screenShareErrorContract(
        'DATABASE_CONTRACT_INCOMPATIBLE',
      );
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }
    if (!rpc.result.ok) {
      const { code, status, error, retryable } = screenShareErrorContract(rpc.result.code);
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }
    if (rpc.result.shareId !== parsedBody.data.shareId) {
      const { code, status, error, retryable } = screenShareErrorContract(
        'DATABASE_CONTRACT_INCOMPATIBLE',
      );
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }

    return NextResponse.json(screenShareRenewResponseSchema.parse({
      success: true,
      code: 'RENEWED',
      shareId: rpc.result.shareId,
      expiresAt: rpc.result.expiresAt,
    }));
  } catch {
    return internalError(correlationId);
  }
}
