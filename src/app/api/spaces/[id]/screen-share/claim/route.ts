import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  screenShareClaimRequestSchema,
  screenShareClaimResponseSchema,
  screenShareClaimRpcResultSchema,
  screenShareErrorContract,
  screenShareLegacyClaimCommittedResultSchema,
  screenShareReleaseRpcResultSchema,
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
  const { code, error, retryable } = screenShareErrorContract('INTERNAL_ERROR');
  console.warn('screen_share_route', {
    correlationId,
    operation: 'claim',
    outcome: code,
    retryable,
  });
  return NextResponse.json({
    success: false,
    code,
    error,
    retryable,
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
        retryable: false,
      }, { status: 400 });
    }

    const auth = await requireVerifiedPresenceAuth();
    if (!auth.ok) {
      const { code, status, error, retryable } = screenShareErrorContract(auth.code);
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }

    if (!auth.identity.companyId) {
      const { code, status, error, retryable } = screenShareErrorContract('MEMBERSHIP_SCOPE_INVALID');
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }

    const rpcArgs = {
      p_auth_subject: auth.identity.authSubject,
      p_auth_session_id: auth.identity.authSessionId,
      p_presence_session_id: parsedBody.data.presenceSessionId,
      p_space_id: parsedParams.data.spaceId,
      p_share_id: parsedBody.data.shareId,
    };
    const compensateExactClaim = async (
      shareId: string,
    ): Promise<'released' | 'already-released' | 'failed'> => {
      try {
        const release = await callObservedScreenShareRpc(
          () => auth.admin.rpc('release_screen_share_observed', {
            ...rpcArgs,
            p_share_id: shareId,
          }),
          screenShareReleaseRpcResultSchema,
        );
        if (release.kind === 'result' && release.result.ok) {
          return release.result.alreadyReleased ? 'already-released' : 'released';
        }
      } catch {
        // The claim outcome remains authoritative even when cleanup fails.
      }
      return 'failed';
    };
    let committedShareId: string | null = null;
    let abortCompensation: Promise<'released' | 'already-released' | 'failed'> | null = null;
    const compensateAbortedClaimOnce = (): Promise<'released' | 'already-released' | 'failed'> | null => {
      if (!committedShareId) return null;
      if (abortCompensation) return abortCompensation;
      abortCompensation = compensateExactClaim(committedShareId).then((compensation) => {
        console.info('screen_share_route', {
          correlationId,
          operation: 'claim',
          outcome: 'CLIENT_DISCONNECTED',
          retryable: false,
          compensation,
        });
        return compensation;
      }).catch(() => {
        // compensateExactClaim is fail-closed, but retain a handled fallback
        // so an observer/logging failure cannot become an unhandled rejection.
        return 'failed' as const;
      });
      return abortCompensation;
    };
    request.signal.addEventListener('abort', () => {
      void compensateAbortedClaimOnce();
    }, { once: true });
    const rpc = await callObservedScreenShareRpc(
      () => auth.admin.rpc('claim_screen_share_observed', rpcArgs),
      screenShareClaimRpcResultSchema,
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
      const { code, status, error, retryable } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      const legacyCommitted = screenShareLegacyClaimCommittedResultSchema.safeParse(rpc.value);
      if (
        legacyCommitted.success
        && legacyCommitted.data.shareId === parsedBody.data.shareId
      ) {
        const compensation = await compensateExactClaim(legacyCommitted.data.shareId);
        console.info('screen_share_route', {
          correlationId,
          operation: 'claim',
          outcome: code,
          retryable,
          compensation,
        });
      }
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }

    if (!rpc.result.ok) {
      const { code, status, error, retryable } = screenShareErrorContract(rpc.result.code);
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }
    if (rpc.result.shareId !== parsedBody.data.shareId) {
      const { code, status, error, retryable } = screenShareErrorContract('DATABASE_CONTRACT_INCOMPATIBLE');
      return NextResponse.json({ success: false, code, error, retryable }, { status });
    }

    committedShareId = rpc.result.shareId;
    if (request.signal.aborted) {
      await compensateAbortedClaimOnce();
      // The transport is already retired. Keep the fallback response within
      // the strict public contract and never claim success for a compensated lease.
      const aborted = screenShareErrorContract('INVALID_REQUEST');
      return NextResponse.json({
        success: false,
        code: aborted.code,
        error: aborted.error,
        retryable: aborted.retryable,
      }, { status: aborted.status });
    }

    const response = screenShareClaimResponseSchema.parse({
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
    });
    console.info('screen_share_route', {
      correlationId,
      operation: 'claim',
      outcome: response.code,
      retryable: false,
    });
    return NextResponse.json(response);
  } catch {
    return internalError(correlationId);
  }
}
