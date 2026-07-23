import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getActiveScreenShare } from '@/app/api/spaces/[spaceId]/screen-share/active/route';
import { POST as claimScreenShare } from '@/app/api/spaces/[spaceId]/screen-share/claim/route';
import { POST as releaseScreenShare } from '@/app/api/spaces/[spaceId]/screen-share/release/route';
import {
  screenShareClaimRequestSchema,
  screenSharePublicShareSchema,
  screenShareSignalingPayloadSchema,
} from '@/lib/webrtc/screen-share-contract';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const PRESENTER_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_ID = '44444444-4444-4444-8444-444444444444';
const PRESENCE_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SHARE_ID = '66666666-6666-4666-8666-666666666666';
const EXPIRES_AT = '2026-07-23T12:00:00.000Z';

describe('screen-share contract boundaries', () => {
  it('accepts only client-fence IDs for claims', () => {
    expect(screenShareClaimRequestSchema.safeParse({
      presenceSessionId: PRESENCE_SESSION_ID,
      shareId: SHARE_ID,
    }).success).toBe(true);

    expect(screenShareClaimRequestSchema.safeParse({
      presenceSessionId: PRESENCE_SESSION_ID,
      shareId: SHARE_ID,
      companyId: COMPANY_ID,
    }).success).toBe(false);
    expect(screenShareClaimRequestSchema.safeParse({ shareId: SHARE_ID }).success).toBe(false);
  });

  it('keeps canonical public presentation data limited to safe fields', () => {
    const publicShare = {
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      presenterUserId: PRESENTER_ID,
      presenterName: 'Presenter',
      shareId: SHARE_ID,
      expiresAt: EXPIRES_AT,
    };

    expect(screenSharePublicShareSchema.safeParse(publicShare).success).toBe(true);
    expect(screenSharePublicShareSchema.safeParse({
      ...publicShare,
      authSessionId: PRESENCE_SESSION_ID,
    }).success).toBe(false);
  });

  it.each([
    {
      type: 'handshake',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
    },
    {
      type: 'description',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      description: { type: 'offer', sdp: 'v=0' },
    },
    {
      type: 'ice',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
    },
    {
      type: 'presenter-hint',
      sourceUserId: PRESENTER_ID,
      targetUserId: TARGET_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      presenterUserId: PRESENTER_ID,
      presenterName: 'Presenter',
      expiresAt: EXPIRES_AT,
    },
  ])('parses scoped $type signaling payloads', (payload) => {
    expect(screenShareSignalingPayloadSchema.safeParse(payload).success).toBe(true);
    expect(screenShareSignalingPayloadSchema.safeParse({ ...payload, revision: 7 }).success).toBe(false);
  });
});

const AUTH_USER_ID = '77777777-7777-4777-8777-777777777777';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

function routeContext(spaceId: string): { params: Promise<{ spaceId: string }> } {
  return { params: Promise.resolve({ spaceId }) };
}

function postRequest(body: unknown): Request {
  return new Request('http://test.local/api/spaces/placeholder/screen-share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function activeRequest(sessionId = PRESENCE_SESSION_ID): Request {
  return new Request(
    `http://test.local/api/spaces/${SPACE_ID}/screen-share/active?presenceSessionId=${sessionId}`,
  );
}

function claimBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { presenceSessionId: PRESENCE_SESSION_ID, shareId: SHARE_ID, ...overrides };
}

function primeAuth(): void {
  mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
  mocks.requireVerifiedPresenceAuth.mockResolvedValue({
    ok: true,
    identity: {
      appUserId: PRESENTER_ID,
      companyId: COMPANY_ID,
      authSessionId: '88888888-8888-4888-8888-888888888888',
    },
    admin: {
      rpc: mocks.rpc,
      from: mocks.from,
    },
    supabase: {
      auth: { getUser: mocks.getUser },
    },
  });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { display_name: 'Presenter' }, error: null });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const routeOperations = [
  {
    name: 'claim',
    invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)),
  },
  {
    name: 'release',
    invoke: () => releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)),
  },
  {
    name: 'active',
    invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)),
  },
] as const;

function noCompanyAuth() {
  return {
    ok: true as const,
    identity: {
      appUserId: PRESENTER_ID,
      companyId: null,
      authSessionId: '88888888-8888-4888-8888-888888888888',
    },
    admin: { rpc: mocks.rpc, from: mocks.from },
    supabase: { auth: { getUser: mocks.getUser } },
  };
}

describe('screen-share routes (mocked HTTP boundary evidence only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAuth();
  });

  it('rejects unauthenticated claims without invoking the RPC', async () => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
    });

    const response = await claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid path', SPACE_ID.replace('2222', 'bad'), claimBody()],
    ['extra body authority', SPACE_ID, claimBody({ companyId: COMPANY_ID })],
    ['invalid presence session', SPACE_ID, claimBody({ presenceSessionId: 'not-a-uuid' })],
  ])('rejects %s without invoking the RPC', async (_label, spaceId, body) => {
    const response = await claimScreenShare(postRequest(body), routeContext(spaceId));

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      success: false,
      code: 'INVALID_REQUEST',
      error: 'Invalid screen share request.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('derives claim identity from verified server state and filters authority fields', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, code: 'CLAIMED', shareId: SHARE_ID, expiresAt: EXPIRES_AT },
      error: null,
    });

    const response = await claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_screen_share_observed', {
      p_auth_subject: AUTH_USER_ID,
      p_auth_session_id: '88888888-8888-4888-8888-888888888888',
      p_presence_session_id: PRESENCE_SESSION_ID,
      p_space_id: SPACE_ID,
      p_share_id: SHARE_ID,
    });
    expect(body).toEqual({
      success: true,
      code: 'CLAIMED',
      share: {
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        presenterUserId: PRESENTER_ID,
        presenterName: 'Presenter',
        shareId: SHARE_ID,
        expiresAt: EXPIRES_AT,
      },
    });
    expect(JSON.stringify(body)).not.toContain('88888888');
  });

  it('maps presenter contention to the stable public 409 contract', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'PRESENTER_BUSY' }, error: null });

    const response = await claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      success: false,
      code: 'PRESENTER_BUSY',
      error: 'Another participant is already sharing this space.',
    });
  });

  it('keeps release fenced to the exact verified auth subject and client share IDs', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, code: 'RELEASED', alreadyReleased: true },
      error: null,
    });

    const response = await releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true, code: 'RELEASED', alreadyReleased: true });
    expect(mocks.rpc).toHaveBeenCalledWith('release_screen_share_observed', {
      p_auth_subject: AUTH_USER_ID,
      p_auth_session_id: '88888888-8888-4888-8888-888888888888',
      p_presence_session_id: PRESENCE_SESSION_ID,
      p_space_id: SPACE_ID,
      p_share_id: SHARE_ID,
    });
  });

  it.each([
    ['LEASE_NOT_FOUND', 404, 'LEASE_NOT_FOUND'],
    ['LEASE_NOT_OWNER', 403, 'LEASE_NOT_OWNER'],
    ['LEASE_STALE', 409, 'LEASE_STALE'],
  ])('maps release %s without clearing another presenter', async (rpcCode, status, code) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: rpcCode }, error: null });

    const response = await releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    expect(response.status).toBe(status);
    expect(await json(response)).toMatchObject({ success: false, code });
  });

  it('returns null active state after authenticated authoritative reconciliation', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, code: 'ACTIVE_READ', active: null }, error: null });

    const response = await getActiveScreenShare(activeRequest(), routeContext(SPACE_ID));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true, code: 'ACTIVE_READ', active: null });
    expect(mocks.rpc).toHaveBeenCalledWith('get_active_screen_share_observed', {
      p_auth_subject: AUTH_USER_ID,
      p_auth_session_id: '88888888-8888-4888-8888-888888888888',
      p_presence_session_id: PRESENCE_SESSION_ID,
      p_space_id: SPACE_ID,
    });
  });

  it('sanitizes malformed RPC results and transport failures', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, code: 'PRESENTER_BUSY', authSessionId: 'server-secret' },
      error: null,
    });
    const malformedResponse = await claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private SQL failure' } });
    const failedResponse = await releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    expect(malformedResponse.status).toBe(500);
    expect(failedResponse.status).toBe(500);
    expect(JSON.stringify(await json(malformedResponse))).not.toContain('server-secret');
    expect(JSON.stringify(await json(failedResponse))).not.toContain('private SQL failure');
  });

  it('requires independently verified auth for release and active reads', async () => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
    });
    const releaseResponse = await releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
    });
    const activeResponse = await getActiveScreenShare(activeRequest(), routeContext(SPACE_ID));

    expect(releaseResponse.status).toBe(401);
    expect(activeResponse.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed active query data without invoking the RPC', async () => {
    const response = await getActiveScreenShare(
      new Request(`http://test.local/api/spaces/${SPACE_ID}/screen-share/active?presenceSessionId=${PRESENCE_SESSION_ID}&companyId=${COMPANY_ID}`),
      routeContext(SPACE_ID),
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns an active share only as canonical public data', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        code: 'ACTIVE_READ',
        active: {
          spaceId: SPACE_ID,
          presenterUserId: TARGET_ID,
          shareId: SHARE_ID,
          expiresAt: EXPIRES_AT,
        },
      },
      error: null,
    });

    const response = await getActiveScreenShare(activeRequest(), routeContext(SPACE_ID));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      success: true,
      code: 'ACTIVE_READ',
      active: {
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        presenterUserId: TARGET_ID,
        presenterName: 'Presenter',
        shareId: SHARE_ID,
        expiresAt: EXPIRES_AT,
      },
    });
    expect(mocks.from).toHaveBeenCalledWith('users');
  });

  it.each(routeOperations)('rejects a no-company verified identity for $name without invoking the RPC', async ({ invoke }) => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce(noCompanyAuth());

    const response = await invoke();

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      success: false,
      code: 'MEMBERSHIP_SCOPE_INVALID',
      error: 'Your company membership changed. Refresh before using screen sharing.',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a terminal membership error for an active read that arrives after a membership-scope switch', async () => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce(noCompanyAuth());

    const response = await getActiveScreenShare(activeRequest(), routeContext(SPACE_ID));

    expect(response.status).toBe(403);
    expect(await json(response)).toMatchObject({
      success: false,
      code: 'MEMBERSHIP_SCOPE_INVALID',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['PGRST202', 'missing RPC in the PostgREST schema cache'],
    ['PGRST203', 'incompatible RPC signature in the PostgREST schema cache'],
    ['42883', 'missing PostgreSQL function'],
    ['42501', 'missing EXECUTE grant'],
  ] as const)('returns the same terminal sanitized compatibility error for %s across every route', async (providerCode, _scenario) => {
    for (const { invoke } of routeOperations) {
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: providerCode,
          message: 'raw provider message must never be exposed',
          hint: 'raw provider hint must never be exposed',
          details: 'raw provider details must never be exposed',
        },
      });

      const response = await invoke();
      const body = await json(response);

      expect(response.status).toBe(426);
      expect(body).toEqual({
        success: false,
        code: 'DATABASE_CONTRACT_INCOMPATIBLE',
        error: 'Screen sharing is unavailable until server compatibility is restored.',
      });
      expect(JSON.stringify(body)).not.toContain('raw provider');
      expect(JSON.stringify(body)).not.toContain(providerCode);
    }
  });
});
