import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getActiveScreenShare } from '@/app/api/spaces/[id]/screen-share/active/route';
import { POST as claimScreenShare } from '@/app/api/spaces/[id]/screen-share/claim/route';
import { POST as releaseScreenShare } from '@/app/api/spaces/[id]/screen-share/release/route';
import {
  screenShareActiveRpcResultSchema,
  screenShareClaimRequestSchema,
  screenShareClaimRpcResultSchema,
  screenSharePresenterNameSchema,
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

function claimRpc(presenterName = 'Locked presenter') {
  return {
    ok: true,
    code: 'CLAIMED',
    shareId: SHARE_ID,
    expiresAt: EXPIRES_AT,
    presenterName,
  };
}

function activeRpc(presenterName = 'Locked presenter', overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    code: 'ACTIVE_READ',
    active: {
      spaceId: SPACE_ID,
      presenterUserId: TARGET_ID,
      shareId: SHARE_ID,
      expiresAt: EXPIRES_AT,
      presenterName,
      ...overrides,
    },
  };
}

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

  it('uses PostgreSQL-compatible Unicode code-point presenter-name limits after trimming', () => {
    const emoji = '😀';

    expect(screenSharePresenterNameSchema.parse(`  ${emoji.repeat(51)}  `)).toBe(emoji.repeat(51));
    expect(screenSharePresenterNameSchema.parse(emoji.repeat(100))).toBe(emoji.repeat(100));
    expect(screenSharePresenterNameSchema.safeParse(emoji.repeat(101)).success).toBe(false);
    expect(screenSharePresenterNameSchema.parse(`  ${'x'.repeat(100)}  `)).toBe('x'.repeat(100));
    expect(screenSharePresenterNameSchema.safeParse('x'.repeat(101)).success).toBe(false);
    expect(screenSharePresenterNameSchema.safeParse('  ').success).toBe(false);
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
      sourcePresenceSessionId: '88888888-8888-4888-8888-888888888888',
      sourceConnectionId: '99999999-9999-4999-8999-999999999999',
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
    },
    {
      type: 'description',
      sourceUserId: PRESENTER_ID,
      sourcePresenceSessionId: '88888888-8888-4888-8888-888888888888',
      sourceConnectionId: '99999999-9999-4999-8999-999999999999',
      targetUserId: TARGET_ID,
      targetPresenceSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      targetConnectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      description: { type: 'offer', sdp: 'v=0' },
    },
    {
      type: 'ice',
      sourceUserId: PRESENTER_ID,
      sourcePresenceSessionId: '88888888-8888-4888-8888-888888888888',
      sourceConnectionId: '99999999-9999-4999-8999-999999999999',
      targetUserId: TARGET_ID,
      targetPresenceSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      targetConnectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
      candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
    },
    {
      type: 'presenter-hint',
      sourceUserId: PRESENTER_ID,
      sourcePresenceSessionId: '88888888-8888-4888-8888-888888888888',
      sourceConnectionId: '99999999-9999-4999-8999-999999999999',
      targetUserId: TARGET_ID,
      targetPresenceSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      targetConnectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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

function routeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
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
  mocks.requireVerifiedPresenceAuth.mockResolvedValue({
    ok: true,
    identity: {
      appUserId: PRESENTER_ID,
      authSubject: AUTH_USER_ID,
      companyId: COMPANY_ID,
      authSessionId: '88888888-8888-4888-8888-888888888888',
      displayName: 'Stale identity snapshot',
    },
    admin: {
      rpc: mocks.rpc,
      from: mocks.from,
    },
  });
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
      authSubject: AUTH_USER_ID,
      companyId: null,
      authSessionId: '88888888-8888-4888-8888-888888888888',
      displayName: 'Presenter',
    },
    admin: { rpc: mocks.rpc, from: mocks.from },
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

  it('derives claim authority from verified server state but takes presenter name only from locked SQL', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: claimRpc(' Locked presenter '), error: null });

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
        presenterName: 'Locked presenter',
        shareId: SHARE_ID,
        expiresAt: EXPIRES_AT,
      },
    });
    expect(JSON.stringify(body)).not.toContain('88888888');
    expect(JSON.stringify(body)).not.toContain('Stale identity snapshot');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'claim', invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), data: claimRpc('😀'.repeat(100)) },
    { name: 'active', invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)), data: activeRpc('😀'.repeat(100)) },
  ])('returns a 100-code-point locked presenter name from the $name HTTP boundary', async ({ invoke, data }) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(JSON.stringify(await json(response))).toContain('😀'.repeat(100));
  });

  it.each([
    { name: 'claim', invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), data: claimRpc('😀'.repeat(101)) },
    { name: 'active', invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)), data: activeRpc('😀'.repeat(101)) },
  ])('rejects a 101-code-point locked presenter name at the $name HTTP boundary', async ({ invoke, data }) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(await json(response)).toMatchObject({ success: false, code: 'DATABASE_CONTRACT_INCOMPATIBLE' });
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

  it('uses only the locked claim RPC presenter name after success', async () => {
    mocks.rpc.mockImplementationOnce(async () => {
      expect(mocks.from).not.toHaveBeenCalled();
      return { data: claimRpc('Post-lock canonical name'), error: null };
    });

    const response = await claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect((await json(response)).share).toMatchObject({ presenterName: 'Post-lock canonical name' });
  });

  it.each(routeOperations)('maps malformed RPC results to the terminal compatibility contract for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, code: 'PRESENTER_BUSY', authSessionId: 'server-secret' },
      error: null,
    });

    const response = await invoke();
    const body = await json(response);

    expect(response.status).toBe(426);
    expect(body).toEqual({
      success: false,
      code: 'DATABASE_CONTRACT_INCOMPATIBLE',
      error: 'Screen sharing is unavailable until server compatibility is restored.',
    });
    expect(JSON.stringify(body)).not.toContain('server-secret');
  });

  it.each(routeOperations)('maps unknown RPC result codes to the terminal compatibility contract for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'UNKNOWN_RESULT' }, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(await json(response)).toEqual({
      success: false,
      code: 'DATABASE_CONTRACT_INCOMPATIBLE',
      error: 'Screen sharing is unavailable until server compatibility is restored.',
    });
  });

  it.each(routeOperations)('keeps unknown provider failures as sanitized internal errors for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private SQL failure' } });

    const response = await invoke();
    const body = await json(response);

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('private SQL failure');
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

  it('returns an active share only from one locked canonical RPC snapshot', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: activeRpc('Post-lock canonical presenter', { expiresAt: '2026-07-23T12:00:30.000Z' }),
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
        presenterName: 'Post-lock canonical presenter',
        shareId: SHARE_ID,
        expiresAt: '2026-07-23T12:00:30.000Z',
      },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
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

  it.each([
    {
      name: 'claim result with a mismatched share ID',
      invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)),
      data: { ...claimRpc(), shareId: TARGET_ID },
      assertOperationSchema: (value: unknown) => expect(screenShareClaimRpcResultSchema.safeParse(value).success).toBe(true),
    },
    {
      name: 'active result for a mismatched space',
      invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)),
      data: {
        ...activeRpc(),
        active: { ...activeRpc().active, spaceId: TARGET_ID },
      },
      assertOperationSchema: (value: unknown) => expect(screenShareActiveRpcResultSchema.safeParse(value).success).toBe(true),
    },
  ])('reaches the $name invariant after a schema-valid RPC fixture', async ({ invoke, data, assertOperationSchema }) => {
    assertOperationSchema(data);
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(await json(response)).toEqual({
      success: false,
      code: 'DATABASE_CONTRACT_INCOMPATIBLE',
      error: 'Screen sharing is unavailable until server compatibility is restored.',
    });
  });

  it('maps a release result with an unknown success code to the terminal sanitized compatibility contract', async () => {
    const data = { ok: true, code: 'CLAIMED', shareId: SHARE_ID, expiresAt: EXPIRES_AT };
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));

    expect(response.status).toBe(426);
    expect(await json(response)).toEqual({
      success: false,
      code: 'DATABASE_CONTRACT_INCOMPATIBLE',
      error: 'Screen sharing is unavailable until server compatibility is restored.',
    });
  });

  it.each(routeOperations)('maps an immediate verified-profile AUTH_INVALID result to membership scope invalid for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'AUTH_INVALID' }, error: null });

    const response = await invoke();

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      success: false,
      code: 'MEMBERSHIP_SCOPE_INVALID',
      error: 'Your company membership changed. Refresh before using screen sharing.',
    });
  });

  it.each([
    { name: 'claim', invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), code: 'LEASE_NOT_OWNER' },
    { name: 'release busy', invoke: () => releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), code: 'PRESENTER_BUSY' },
    { name: 'release stale', invoke: () => releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), code: 'LEASE_STALE' },
    { name: 'active busy', invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)), code: 'PRESENTER_BUSY' },
  ])('rejects impossible $name RPC code as a compatibility failure', async ({ invoke, code }) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code }, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(await json(response)).toEqual({
      success: false,
      code: 'DATABASE_CONTRACT_INCOMPATIBLE',
      error: 'Screen sharing is unavailable until server compatibility is restored.',
    });
  });

  it.each(['   ', 'x'.repeat(101)])('accepts an untrusted $displayName snapshot but maps locked claim profile invalid to a sanitized error', async (displayName) => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce({
      ok: true,
      identity: {
        appUserId: PRESENTER_ID,
        authSubject: AUTH_USER_ID,
        companyId: COMPANY_ID,
        authSessionId: '88888888-8888-4888-8888-888888888888',
        displayName,
      },
      admin: { rpc: mocks.rpc, from: mocks.from },
    });
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'PRESENTER_PROFILE_INVALID' }, error: null });

    const response = await claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID));
    const body = await json(response);

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      code: 'PRESENTER_PROFILE_INVALID',
      error: 'The presenter profile is unavailable for screen sharing.',
    });
    expect(JSON.stringify(body)).not.toContain(displayName);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(['claim', 'active'] as const)('maps locked %s profile invalid terminally without a users query', async (operation) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'PRESENTER_PROFILE_INVALID' }, error: null });

    const response = await (operation === 'claim'
      ? claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID))
      : getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)));

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ success: false, code: 'PRESENTER_PROFILE_INVALID' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not emit stale presenter fields when the single locked active snapshot denies membership', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'AUTH_INVALID' }, error: null });

    const response = await getActiveScreenShare(activeRequest(), routeContext(SPACE_ID));
    const body = await json(response);

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ success: false, code: 'MEMBERSHIP_SCOPE_INVALID' });
    expect(JSON.stringify(body)).not.toContain('Stale identity snapshot');
    expect(JSON.stringify(body)).not.toContain(SHARE_ID);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not emit stale presenter fields when the single locked active snapshot reports a revoked session', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'SESSION_INVALID' }, error: null });

    const response = await getActiveScreenShare(activeRequest(), routeContext(SPACE_ID));
    const body = await json(response);

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, code: 'SESSION_INVALID' });
    expect(JSON.stringify(body)).not.toContain('Stale identity snapshot');
    expect(JSON.stringify(body)).not.toContain(SHARE_ID);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed without stale presenter fields when the locked active snapshot is structurally incompatible', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: activeRpc('Locked name', { spaceId: TARGET_ID }), error: null });

    const response = await getActiveScreenShare(activeRequest(), routeContext(SPACE_ID));
    const body = await json(response);

    expect(response.status).toBe(426);
    expect(body).toMatchObject({ success: false, code: 'DATABASE_CONTRACT_INCOMPATIBLE' });
    expect(JSON.stringify(body)).not.toContain('Locked name');
    expect(JSON.stringify(body)).not.toContain(SHARE_ID);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'claim', invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), data: { ...claimRpc(), presenterName: undefined } },
    { name: 'active', invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)), data: { ...activeRpc(), active: { ...activeRpc().active, presenterName: undefined } } },
  ])('rejects missing locked presenterName from $name as a compatibility failure', async ({ invoke, data }) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(await json(response)).toMatchObject({ success: false, code: 'DATABASE_CONTRACT_INCOMPATIBLE' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'claim', invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), data: claimRpc('   ') },
    { name: 'active', invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)), data: activeRpc('   ') },
  ])('rejects invalid locked presenterName from $name as a compatibility failure', async ({ invoke, data }) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(await json(response)).toMatchObject({ success: false, code: 'DATABASE_CONTRACT_INCOMPATIBLE' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'claim', invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), data: { ...claimRpc(), extra: true } },
    { name: 'active', invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)), data: { ...activeRpc(), extra: true } },
  ])('rejects extra locked presenter fields from $name without retrying', async ({ invoke, data }) => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'claim', invoke: () => claimScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), data: claimRpc() },
    { name: 'release', invoke: () => releaseScreenShare(postRequest(claimBody()), routeContext(SPACE_ID)), data: { ok: true, code: 'RELEASED', alreadyReleased: false } },
    { name: 'active', invoke: () => getActiveScreenShare(activeRequest(), routeContext(SPACE_ID)), data: activeRpc() },
  ])('retries exactly once for strict RETRY_LOCK_SET and returns the second $name result', async ({ invoke, data }) => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET' }, error: null })
      .mockResolvedValueOnce({ data, error: null });

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it.each(routeOperations)('maps a second strict RETRY_LOCK_SET for $name to bounded 503', async ({ invoke }) => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET' }, error: null })
      .mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET' }, error: null });

    const response = await invoke();

    expect(response.status).toBe(503);
    expect(await json(response)).toMatchObject({ success: false, code: 'SERVICE_UNAVAILABLE' });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it.each(routeOperations)('does not retry malformed RETRY_LOCK_SET payloads for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'RETRY_LOCK_SET', extra: true }, error: null });

    const response = await invoke();

    expect(response.status).toBe(426);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(routeOperations)('does not retry provider errors for $name', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private provider failure' } });

    const response = await invoke();

    expect(response.status).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await json(response))).not.toContain('private provider failure');
  });

  it.each(routeOperations)('maps a locked post-snapshot SESSION_INVALID from $name to 409 after exactly one RPC', async ({ invoke }) => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: false, code: 'SESSION_INVALID' }, error: null });

    const response = await invoke();

    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ success: false, code: 'SESSION_INVALID' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
