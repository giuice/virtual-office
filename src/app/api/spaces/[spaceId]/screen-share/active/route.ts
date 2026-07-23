import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  screenShareActiveQuerySchema,
  screenShareActiveResponseSchema,
  screenShareActiveRpcResultSchema,
  screenShareErrorContract,
  screenShareSpaceParamsSchema,
  toPublicScreenShare,
} from '@/lib/webrtc/screen-share-contract';
import { requireVerifiedPresenceAuth } from '@/lib/presence/verified-session';

export const dynamic = 'force-dynamic';

interface ActiveRouteContext {
  params: Promise<{ spaceId: string }>;
}

interface PresenterNameRow {
  display_name: string;
}

type VerifiedPresenceAuth = Extract<
  Awaited<ReturnType<typeof requireVerifiedPresenceAuth>>,
  { ok: true }
>;

async function verifiedAuthSubject(auth: VerifiedPresenceAuth): Promise<string | null> {
  const { data, error } = await auth.supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

async function presenterName(
  auth: VerifiedPresenceAuth,
  presenterUserId: string,
): Promise<string | null> {
  const { data, error } = await auth.admin
    .from('users')
    .select('display_name')
    .eq('id', presenterUserId)
    .eq('company_id', auth.identity.companyId)
    .maybeSingle<PresenterNameRow>();

  return error || !data ? null : data.display_name;
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
  if (
    searchParams.size !== 1 ||
    searchParams.getAll('presenceSessionId').length !== 1
  ) {
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

    const authSubject = await verifiedAuthSubject(auth);
    if (!authSubject || !auth.identity.companyId) return internalError(correlationId);

    const { data, error } = await auth.admin.rpc('get_active_screen_share_observed', {
      p_auth_subject: authSubject,
      p_auth_session_id: auth.identity.authSessionId,
      p_presence_session_id: parsedQuery.data.presenceSessionId,
      p_space_id: parsedParams.data.spaceId,
    });
    if (error) return internalError(correlationId);

    const parsedResult = screenShareActiveRpcResultSchema.safeParse(data);
    if (!parsedResult.success) return internalError(correlationId);

    if (!parsedResult.data.ok) {
      const { code, status, error: message } = screenShareErrorContract(parsedResult.data.code);
      return NextResponse.json({ success: false, code, error: message }, { status });
    }

    if (!parsedResult.data.active) {
      return NextResponse.json(screenShareActiveResponseSchema.parse({
        success: true,
        code: 'ACTIVE_READ',
        active: null,
      }));
    }

    if (parsedResult.data.active.spaceId !== parsedParams.data.spaceId) {
      return internalError(correlationId);
    }

    const name = await presenterName(auth, parsedResult.data.active.presenterUserId);
    if (!name) return internalError(correlationId);

    return NextResponse.json(screenShareActiveResponseSchema.parse({
      success: true,
      code: 'ACTIVE_READ',
      active: toPublicScreenShare({
        companyId: auth.identity.companyId,
        spaceId: parsedResult.data.active.spaceId,
        presenterUserId: parsedResult.data.active.presenterUserId,
        presenterName: name,
        shareId: parsedResult.data.active.shareId,
        expiresAt: parsedResult.data.active.expiresAt,
      }),
    }));
  } catch {
    return internalError(correlationId);
  }
}
