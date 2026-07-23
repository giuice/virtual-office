import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  screenShareActiveQuerySchema,
  screenShareActiveResponseSchema,
  screenShareActiveRpcResultSchema,
  screenShareErrorContract,
  screenSharePresenterNameSchema,
  screenShareRpcContractError,
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

type PresenterNameLookupResult =
  | { kind: 'found'; name: string }
  | { kind: 'profile-invalid' }
  | { kind: 'infrastructure-error' };

async function presenterName(
  auth: VerifiedPresenceAuth,
  presenterUserId: string,
): Promise<PresenterNameLookupResult> {
  const { data, error } = await auth.admin
    .from('users')
    .select('display_name')
    .eq('id', presenterUserId)
    .eq('company_id', auth.identity.companyId)
    .maybeSingle<PresenterNameRow>();

  if (error) return { kind: 'infrastructure-error' };
  if (!data) return { kind: 'profile-invalid' };

  const parsedName = screenSharePresenterNameSchema.safeParse(data.display_name);
  return parsedName.success
    ? { kind: 'found', name: parsedName.data }
    : { kind: 'profile-invalid' };
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
    const firstRpc = await auth.admin.rpc('get_active_screen_share_observed', rpcArgs);
    if (firstRpc.error) {
      const compatibilityError = screenShareRpcContractError(firstRpc.error);
      if (compatibilityError) {
        const { code, status, error } = compatibilityError;
        return NextResponse.json({ success: false, code, error }, { status });
      }
      return internalError(correlationId);
    }

    const firstResult = screenShareActiveRpcResultSchema.safeParse(firstRpc.data);
    if (!firstResult.success) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (!firstResult.data.ok) {
      const { code, status, error } = screenShareErrorContract(firstResult.data.code);
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (!firstResult.data.active) {
      return NextResponse.json(screenShareActiveResponseSchema.parse({
        success: true,
        code: 'ACTIVE_READ',
        active: null,
      }));
    }

    if (firstResult.data.active.spaceId !== parsedParams.data.spaceId) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    const lookedUpName = await presenterName(auth, firstResult.data.active.presenterUserId);

    const finalRpc = await auth.admin.rpc('get_active_screen_share_observed', rpcArgs);
    if (finalRpc.error) {
      const compatibilityError = screenShareRpcContractError(finalRpc.error);
      if (compatibilityError) {
        const { code, status, error } = compatibilityError;
        return NextResponse.json({ success: false, code, error }, { status });
      }
      return internalError(correlationId);
    }

    const finalResult = screenShareActiveRpcResultSchema.safeParse(finalRpc.data);
    if (!finalResult.success) {
      const { code, status, error } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (!finalResult.data.ok) {
      const { code, status, error } = screenShareErrorContract(finalResult.data.code);
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (!finalResult.data.active) {
      return NextResponse.json(screenShareActiveResponseSchema.parse({
        success: true,
        code: 'ACTIVE_READ',
        active: null,
      }));
    }

    const firstActive = firstResult.data.active;
    const finalActive = finalResult.data.active;
    if (
      finalActive.spaceId !== parsedParams.data.spaceId ||
      finalActive.spaceId !== firstActive.spaceId ||
      finalActive.presenterUserId !== firstActive.presenterUserId ||
      finalActive.shareId !== firstActive.shareId
    ) {
      const { code, status, error } = screenShareErrorContract('RETRY_LOCK_SET');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    if (lookedUpName.kind === 'infrastructure-error') {
      return internalError(correlationId);
    }
    if (lookedUpName.kind === 'profile-invalid') {
      const { code, status, error } = screenShareErrorContract('PRESENTER_PROFILE_INVALID');
      return NextResponse.json({ success: false, code, error }, { status });
    }

    return NextResponse.json(screenShareActiveResponseSchema.parse({
      success: true,
      code: 'ACTIVE_READ',
      active: toPublicScreenShare({
        companyId: auth.identity.companyId,
        spaceId: finalActive.spaceId,
        presenterUserId: finalActive.presenterUserId,
        presenterName: lookedUpName.name,
        shareId: finalActive.shareId,
        expiresAt: finalActive.expiresAt,
      }),
    }));
  } catch {
    return internalError(correlationId);
  }
}
