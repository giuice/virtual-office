import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getPending } from '@/app/api/spaces/knock/pending/route';
import { GET as getStatus } from '@/app/api/spaces/knock/status/[requestId]/route';

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

describe('canonical knock read routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireVerifiedPresenceAuth.mockResolvedValue({
      ok: true,
      identity: { appUserId: USER_ID, authSessionId: AUTH_SESSION_ID, companyId: SPACE_ID },
      admin: { rpc: mocks.rpc },
    });
  });

  it('reads requester status through the exact authenticated tab session', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'KNOCK_STATUS',
        requestId: REQUEST_ID,
        spaceId: SPACE_ID,
        status: 'approved',
        decision: 'APPROVE',
        responderId: USER_ID,
        expiresAt: '2026-07-16T12:00:30.000Z',
        consumedAt: null,
        requesterLocationVersion: 3,
      },
      error: null,
    });

    const response = await getStatus(
      new Request(`http://localhost/api/spaces/knock/status/${REQUEST_ID}?sessionId=${SESSION_ID}`),
      { params: Promise.resolve({ requestId: REQUEST_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('get_knock_request_status_observed', {
      p_requester_id: USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
      p_request_id: REQUEST_ID,
    });
  });

  it('does not expose another request through a not-found result', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, code: 'KNOCK_NOT_FOUND' }, error: null });

    const response = await getStatus(
      new Request(`http://localhost/api/spaces/knock/status/${REQUEST_ID}?sessionId=${SESSION_ID}`),
      { params: Promise.resolve({ requestId: REQUEST_ID }) }
    );

    expect(response.status).toBe(404);
  });

  it('lists only safe pending fields for the exact current occupant session', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'KNOCK_PENDING_LIST',
        requests: [{
          requestId: REQUEST_ID,
          requester: { id: USER_ID, displayName: 'Taylor', avatarUrl: null },
          spaceId: SPACE_ID,
          createdAt: '2026-07-16T12:00:00.000Z',
          expiresAt: '2026-07-16T12:00:30.000Z',
        }],
      },
      error: null,
    });

    const response = await getPending(new Request(
      `http://localhost/api/spaces/knock/pending?spaceId=${SPACE_ID}&sessionId=${SESSION_ID}`
    ));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('get_pending_knock_requests_for_session', {
      p_responder_id: USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
      p_space_id: SPACE_ID,
    });
  });

  it('rejects a missing responder session id before the RPC', async () => {
    const response = await getPending(new Request(
      `http://localhost/api/spaces/knock/pending?spaceId=${SPACE_ID}`
    ));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
