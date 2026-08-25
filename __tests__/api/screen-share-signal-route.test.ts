import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as sendScreenShareSignal } from '@/app/api/spaces/[id]/screen-share/signal/route';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';
const PRESENCE_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const CONNECTION_ID = '66666666-6666-4666-8666-666666666666';
const SHARE_ID = '77777777-7777-4777-8777-777777777777';
const TARGET_SESSION_ID = '88888888-8888-4888-8888-888888888888';
const TARGET_CONNECTION_ID = '99999999-9999-4999-8999-999999999999';

const mocks = vi.hoisted(() => ({
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
  broadcastScreenShareSignal: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

vi.mock('@/lib/webrtc/screen-share-signal-broadcast', () => ({
  broadcastScreenShareSignal: mocks.broadcastScreenShareSignal,
}));

function context(id = SPACE_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown, headers?: HeadersInit): Request {
  return new Request('http://test.local/screen-share/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function descriptionBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'description',
    presenceSessionId: PRESENCE_SESSION_ID,
    connectionId: CONNECTION_ID,
    shareId: SHARE_ID,
    targetUserId: OTHER_USER_ID,
    targetPresenceSessionId: TARGET_SESSION_ID,
    targetConnectionId: TARGET_CONNECTION_ID,
    description: { type: 'offer', sdp: 'v=0' },
    ...overrides,
  };
}

function activeResult(presenterUserId = USER_ID, shareId = SHARE_ID) {
  return {
    ok: true,
    code: 'ACTIVE_READ',
    active: {
      spaceId: SPACE_ID,
      presenterUserId,
      presenterName: 'Presenter',
      shareId,
      expiresAt: '2026-08-01T16:00:00.000Z',
    },
  };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe('screen-share server-mediated signaling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireVerifiedPresenceAuth.mockResolvedValue({
      ok: true,
      identity: {
        appUserId: USER_ID,
        authSubject: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        companyId: COMPANY_ID,
        displayName: 'Presenter',
      },
      admin: { rpc: mocks.rpc },
    });
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: activeResult(), error: null });
    mocks.broadcastScreenShareSignal.mockResolvedValue(undefined);
  });

  it('injects all sender authority from verified server state', async () => {
    const response = await sendScreenShareSignal(request(descriptionBody()), context());

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ success: true, code: 'SIGNAL_SENT' });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'get_active_screen_share_observed', {
      p_auth_subject: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_auth_session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_presence_session_id: PRESENCE_SESSION_ID,
      p_space_id: SPACE_ID,
    });
    expect(mocks.broadcastScreenShareSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUserId: USER_ID,
        sourcePresenceSessionId: PRESENCE_SESSION_ID,
        sourceConnectionId: CONNECTION_ID,
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        shareId: SHARE_ID,
      }),
    );
  });

  it.each(['sourceUserId', 'companyId', 'spaceId', 'sourcePresenceSessionId'])(
    'rejects forged client authority field %s',
    async (field) => {
      const response = await sendScreenShareSignal(
        request(descriptionBody({ [field]: OTHER_USER_ID })),
        context(),
      );
      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.broadcastScreenShareSignal).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-presenter screen signal with the active share ID', async () => {
    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: activeResult(OTHER_USER_ID), error: null });

    const response = await sendScreenShareSignal(request(descriptionBody()), context());

    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ code: 'LEASE_NOT_OWNER', retryable: false });
    expect(mocks.broadcastScreenShareSignal).not.toHaveBeenCalled();
  });

  it('allows occupant audio signaling only with a null share ID', async () => {
    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { ok: true, code: 'ACTIVE_READ', active: null }, error: null });

    const response = await sendScreenShareSignal(
      request(descriptionBody({ shareId: null })),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.broadcastScreenShareSignal).toHaveBeenCalledTimes(1);
  });

  it('rejects non-null handshakes and oversized bodies before publishing', async () => {
    const invalidHandshake = await sendScreenShareSignal(request({
      type: 'handshake',
      presenceSessionId: PRESENCE_SESSION_ID,
      connectionId: CONNECTION_ID,
      shareId: SHARE_ID,
    }), context());
    expect(invalidHandshake.status).toBe(400);

    const oversized = await sendScreenShareSignal(request(
      descriptionBody({ description: { type: 'offer', sdp: 'x'.repeat(110_001) } }),
    ), context());
    expect(oversized.status).toBe(400);
    expect(mocks.broadcastScreenShareSignal).not.toHaveBeenCalled();
  });

  it('fails closed for unauthenticated, rate-limited, and publish-failure requests', async () => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce({
      ok: false,
      code: 'UNAUTHORIZED',
      status: 401,
      error: 'Authentication required',
    });
    expect((await sendScreenShareSignal(request(descriptionBody()), context())).status).toBe(401);

    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await sendScreenShareSignal(request(descriptionBody()), context())).status).toBe(429);

    mocks.rpc.mockReset();
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: activeResult(), error: null });
    mocks.broadcastScreenShareSignal.mockRejectedValueOnce(new Error('timeout'));
    expect((await sendScreenShareSignal(request(descriptionBody()), context())).status).toBe(500);
  });

  it('fails closed when the rate-limit RPC returns a malformed contract', async () => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await sendScreenShareSignal(request(descriptionBody()), context());

    expect(response.status).toBe(426);
    expect(await body(response)).toMatchObject({
      code: 'DATABASE_CONTRACT_INCOMPATIBLE',
      retryable: false,
    });
    expect(mocks.broadcastScreenShareSignal).not.toHaveBeenCalled();
  });
});
