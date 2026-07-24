import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  screenShareClaimRequestSchema,
  screenShareClaimResponseSchema,
  screenShareClaimRpcResultSchema,
  screenShareErrorContract,
  screenShareRpcContractError,
  screenShareSpaceParamsSchema,
  toPublicScreenShare,
} from '@/lib/webrtc/screen-share-contract';
import { callObservedScreenShareRpc } from '@/lib/webrtc/observed-screen-share-rpc';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface ClaimRouteContext {
  params: Promise<{ id: string }>;
}

function internalError(correlationId: string): NextResponse {
  return NextResponse.json({
    success: false,
    code: 'INTERNAL_ERROR',
    error: 'Screen share operation failed.',
    correlationId,
  }, { status: 500 });
}

export async function POST(request: Request, context: ClaimRouteContext): Promise<NextResponse> {
  const correlationId = randomUUID();

  try {
    const { id } = await context.params;
    const parsedParams = screenShareSpaceParamsSchema.safeParse({ spaceId: id });
    const body = await request.json().catch(() => null);
    const parsedBody = screenShareClaimRequestSchema.safeParse(body);
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({
        success: false,
        code: 'INVALID_REQUEST',
        error: 'Invalid screen share request.',
      }, { status: 400 });
    }

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      return NextResponse.json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Authentication required',
      }, { status: auth.status });
    }

    if (!auth.identity.companyId) {
      const { code, status, error } = screenShareErrorContract('MEMBERSHIP_SCOPE_INVALID');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    const rpcArgs = {
      p_auth_subject: auth.identity.authSubject,
      p_auth_session_id: auth.identity.authSessionId,
      p_presence_session_id: parsedBody.data.presenceSessionId,
      p_space_id: parsedParams.data.spaceId,
      p_share_id: parsedBody.data.shareId,
    };
    const rpc = await callObservedScreenShareRpc(
      () => auth.admin.rpc('claim_screen_share_observed', rpcArgs),
      screenShareClaimRpcResultSchema,
    );
    if (rpc.kind === 'provider-error') {
      const compatibilityError = screenShareRpcContractError(rpc.error);
      if (compatibilityError) {
        const { code, status, error } = compatibilityError;
        return NextResponse.json({ success: false, code, error }, { status });
      }
      return internalError(correlationId);
    }
    if (rpc.kind === 'malformed') {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (!rpc.result.ok) {
      const { code, status, error } = screenShareErrorContract(rpc.result.code);
      return NextResponse.json({ success: false, code, error }, { status });
    }
    if (rpc.result.shareId !== parsedBody.data.shareId) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    return NextResponse.json(screenShareClaimResponseSchema.parse({
      success: true,
      code: 'CLAIMED',
      share: toPublicScreenShare({
        companyId: auth.identity.companyId,
        spaceId: parsedParams.data.spaceId,
        presenterUserId: auth.identity.appUserId,
        presenterName: rpc.result.presenterName,
        shareId: rpc.result.shareId,
        expiresAt: rpc.result.expiresAt,
      }),
    }));
  } catch {
    return internalError(correlationId);
  }
}
