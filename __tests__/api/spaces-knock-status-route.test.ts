import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/spaces/knock/status/[requestId]/route';

const mocks = vi.hoisted(() => ({
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
  emitPresenceEvent: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

vi.mock('@/lib/presence/observability', () => ({
  emitPresenceEvent: mocks.emitPresenceEvent,
}));

const USER_ID = '55555555-5555-4555-8555-555555555555';
const RESPONDER_ID = '77777777-7777-4777-8777-777777777777';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';

describe('/api/spaces/knock/status/[requestId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireVerifiedPresenceAuth.mockResolvedValue({
      ok: true,
      identity: {
        appUserId: USER_ID,
        authSessionId: AUTH_SESSION_ID,
        companyId: COMPANY_ID,
      },
      admin: { rpc: mocks.rpc },
    });
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'KNOCK_STATUS',
        requestId: REQUEST_ID,
        requesterUserId: USER_ID,
        responderId: RESPONDER_ID,
        spaceId: SPACE_ID,
        status: 'approved',
        expiresAt: '2026-07-19T12:00:30.000Z',
        requesterLocationVersion: 7,
        requesterLocationVersionAfter: 7,
        requesterAccessRevision: 2,
        responderAccessRevision: 4,
        spaceAccessRevision: 3,
      },
      error: null,
    });
  });

  it('uses the observed RPC, logs revisions, and keeps them out of the HTTP body', async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/spaces/knock/status/${REQUEST_ID}?sessionId=${SESSION_ID}`,
      ),
      { params: Promise.resolve({ requestId: REQUEST_ID }) },
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('get_knock_request_status_observed', {
      p_requester_id: USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
      p_request_id: REQUEST_ID,
    });
    expect(body).not.toHaveProperty('requesterUserId');
    expect(body).not.toHaveProperty('requesterAccessRevision');
    expect(body).not.toHaveProperty('responderAccessRevision');
    expect(body).not.toHaveProperty('spaceAccessRevision');
    expect(mocks.emitPresenceEvent).toHaveBeenCalledWith(expect.objectContaining({
      requesterUserId: USER_ID,
      responderUserId: RESPONDER_ID,
      spaceId: SPACE_ID,
      requesterLocationVersionAfter: 7,
      requesterAccessRevision: 2,
      responderAccessRevision: 4,
      spaceAccessRevision: 3,
      expiryResult: 'live',
    }));
  });
});
