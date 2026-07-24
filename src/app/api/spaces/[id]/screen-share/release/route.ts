import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  screenShareErrorContract,
  screenShareRpcContractError,
  screenShareReleaseRequestSchema,
  screenShareReleaseResponseSchema,
  screenShareReleaseRpcResultSchema,
  screenShareSpaceParamsSchema,
} from '@/lib/webrtc/screen-share-contract';
import { callObservedScreenShareRpc } from '@/lib/webrtc/observed-screen-share-rpc';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface ReleaseRouteContext {
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

export async function POST(request: Request, context: ReleaseRouteContext): Promise<NextResponse> {
  const correlationId = randomUUID();

  try {
    const { id } = await context.params;
    const parsedParams = screenShareSpaceParamsSchema.safeParse({ spaceId: id });
    const body = await request.json().catch(() => null);
    const parsedBody = screenShareReleaseRequestSchema.safeParse(body);
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

    const rpc = await callObservedScreenShareRpc(
      () => auth.admin.rpc('release_screen_share_observed', {
        p_auth_subject: auth.identity.authSubject,
        p_auth_session_id: auth.identity.authSessionId,
        p_presence_session_id: parsedBody.data.presenceSessionId,
        p_space_id: parsedParams.data.spaceId,
        p_share_id: parsedBody.data.shareId,
      }),
      screenShareReleaseRpcResultSchema,
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

    return NextResponse.json(screenShareReleaseResponseSchema.parse({
      success: true,
      code: 'RELEASED',
      alreadyReleased: rpc.result.alreadyReleased,
    }));
  } catch {
    return internalError(correlationId);
  }
}
