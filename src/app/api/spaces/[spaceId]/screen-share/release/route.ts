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
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface ReleaseRouteContext {
  params: Promise<{ spaceId: string }>;
}

type VerifiedPresenceAuth = Extract<
  Awaited<ReturnType<typeof requireVerifiedPresenceAuth>>,
  { ok: true }
>;

async function verifiedAuthSubject(auth: VerifiedPresenceAuth): Promise<string | null> {
  const { data, error } = await auth.supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
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
    const parsedParams = screenShareSpaceParamsSchema.safeParse(await context.params);
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

    const authSubject = await verifiedAuthSubject(auth);
    if (!authSubject) return internalError(correlationId);

    const { data, error } = await auth.admin.rpc('release_screen_share_observed', {
      p_auth_subject: authSubject,
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

    const parsedResult = screenShareReleaseRpcResultSchema.safeParse(data);
    if (!parsedResult.success) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (!parsedResult.data.ok) {
      const { code, status, error: message } = screenShareErrorContract(parsedResult.data.code);
      return NextResponse.json({ success: false, code, error: message }, { status });
    }

    return NextResponse.json(screenShareReleaseResponseSchema.parse({
      success: true,
      code: 'RELEASED',
      alreadyReleased: parsedResult.data.alreadyReleased,
    }));
  } catch {
    return internalError(correlationId);
  }
}
