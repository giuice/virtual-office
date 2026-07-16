import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/spaces/knock/request/route';

const mocks = vi.hoisted(() => ({
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

const USER_ID = '55555555-5555-4555-8555-555555555555';
const AUTH_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/spaces/knock/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/spaces/knock/request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireVerifiedPresenceAuth.mockResolvedValue({
      ok: true,
      identity: { appUserId: USER_ID, authSessionId: AUTH_SESSION_ID, companyId: SPACE_ID },
      admin: { rpc: mocks.rpc },
    });
  });

  it('creates a canonical server-owned knock using only authenticated identity', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'KNOCK_CREATED',
        requestId: REQUEST_ID,
        status: 'pending',
        expiresAt: '2026-07-16T12:00:30.000Z',
        recipientCount: 1,
        requesterLocationVersion: 7,
        alreadyApplied: false,
      },
      error: null,
    });

    const response = await POST(createRequest({
      sessionId: SESSION_ID,
      spaceId: SPACE_ID,
      requestId: REQUEST_ID,
      requesterName: 'forged client name',
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('create_knock_request', {
      p_requester_id: USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
      p_space_id: SPACE_ID,
      p_request_id: REQUEST_ID,
    });
  });

  it('rejects malformed exact-session input before the RPC', async () => {
    const response = await POST(createRequest({ spaceId: SPACE_ID, requestId: REQUEST_ID }));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns authentication failures without touching the RPC', async () => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      error: 'Authentication required',
    });

    const response = await POST(createRequest({
      sessionId: SESSION_ID,
      spaceId: SPACE_ID,
      requestId: REQUEST_ID,
    }));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps rate limiting to 429 and Retry-After', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: false, code: 'KNOCK_RATE_LIMITED', retryAfterSeconds: 12 },
      error: null,
    });

    const response = await POST(createRequest({
      sessionId: SESSION_ID,
      spaceId: SPACE_ID,
      requestId: REQUEST_ID,
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
  });
});
