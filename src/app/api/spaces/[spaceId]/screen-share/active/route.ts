import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  screenShareActiveQuerySchema,
  screenShareActiveResponseSchema,
  screenShareActiveRpcResultSchema,
  screenShareErrorContract,
  screenShareRpcContractError,
  screenShareSpaceParamsSchema,
  toPublicScreenShare,
} from '@/lib/webrtc/screen-share-contract';
import { callObservedScreenShareRpc } from '@/lib/webrtc/observed-screen-share-rpc';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface ActiveRouteContext {
  params: Promise<{ spaceId: string }>;
}

function internalError(correlationId: string): NextResponse {
  return NextResponse.json({
    success: false,
    code: 'INTERNAL_ERROR',
    error: 'Screen share operation failed.',
    correlationId,
  }, { status: 500 });
}

function queryInput(request: Request): unknown {
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.size !== 1 || searchParams.getAll('presenceSessionId').length !== 1) {
    return null;
  }

  return Object.fromEntries(searchParams.entries());
}

export async function GET(request: Request, context: ActiveRouteContext): Promise<NextResponse> {
  const correlationId = randomUUID();

  try {
    const parsedParams = screenShareSpaceParamsSchema.safeParse(await context.params);
    const parsedQuery = screenShareActiveQuerySchema.safeParse(queryInput(request));
    if (!parsedParams.success || !parsedQuery.success) {
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
      p_presence_session_id: parsedQuery.data.presenceSessionId,
      p_space_id: parsedParams.data.spaceId,
    };
    const rpc = await callObservedScreenShareRpc(
      () => auth.admin.rpc('get_active_screen_share_observed', rpcArgs),
      screenShareActiveRpcResultSchema,
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
    if (!rpc.result.active) {
      return NextResponse.json(screenShareActiveResponseSchema.parse({
        success: true,
        code: 'ACTIVE_READ',
        active: null,
      }));
    }
    if (rpc.result.active.spaceId !== parsedParams.data.spaceId) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    return NextResponse.json(screenShareActiveResponseSchema.parse({
      success: true,
      code: 'ACTIVE_READ',
      active: toPublicScreenShare({
        companyId: auth.identity.companyId,
        spaceId: rpc.result.active.spaceId,
        presenterUserId: rpc.result.active.presenterUserId,
        presenterName: rpc.result.active.presenterName,
        shareId: rpc.result.active.shareId,
        expiresAt: rpc.result.active.expiresAt,
      }),
    }));
  } catch {
    return internalError(correlationId);
  }
}
