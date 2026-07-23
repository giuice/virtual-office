import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  screenShareClaimRequestSchema,
  screenShareClaimResponseSchema,
  screenShareClaimRpcResultSchema,
  screenShareErrorContract,
  screenSharePresenterNameSchema,
  screenShareRpcContractError,
  screenShareSpaceParamsSchema,
  toPublicScreenShare,
} from '@/lib/webrtc/screen-share-contract';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface ClaimRouteContext {
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

export async function POST(request: Request, context: ClaimRouteContext): Promise<NextResponse> {
  const correlationId = randomUUID();

  try {
    const parsedParams = screenShareSpaceParamsSchema.safeParse(await context.params);
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

    const parsedPresenterName = screenSharePresenterNameSchema.safeParse(auth.identity.displayName);
    if (!parsedPresenterName.success) {
      const { code, status, error } = screenShareErrorContract('PRESENTER_PROFILE_INVALID');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    const { data, error } = await auth.admin.rpc('claim_screen_share_observed', {
      p_auth_subject: auth.identity.authSubject,
      p_auth_session_id: auth.identity.authSessionId,
      p_presence_session_id: parsedBody.data.presenceSessionId,
      p_space_id: parsedParams.data.spaceId,
      p_share_id: parsedBody.data.shareId,
    });
    if (error) {
      const compatibilityError = screenShareRpcContractError(error);
      if (compatibilityError) {
        const { code, status, error: message } = compatibilityError;
        return NextResponse.json({ success: false, code, error: message }, { status });
      }
      return internalError(correlationId);
    }

    const parsedResult = screenShareClaimRpcResultSchema.safeParse(data);
    if (!parsedResult.success) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (!parsedResult.data.ok) {
      const { code, status, error: message } = screenShareErrorContract(parsedResult.data.code);
      return NextResponse.json({ success: false, code, error: message }, { status });
    }

    if (parsedResult.data.shareId !== parsedBody.data.shareId) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    const response = screenShareClaimResponseSchema.parse({
      success: true,
      code: 'CLAIMED',
      share: toPublicScreenShare({
        companyId: auth.identity.companyId,
        spaceId: parsedParams.data.spaceId,
        presenterUserId: auth.identity.appUserId,
        presenterName: parsedPresenterName.data,
        shareId: parsedResult.data.shareId,
        expiresAt: parsedResult.data.expiresAt,
      }),
    });

    return NextResponse.json(response);
  } catch {
    return internalError(correlationId);
  }
}
