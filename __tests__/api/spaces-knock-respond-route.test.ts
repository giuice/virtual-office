import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/spaces/knock/respond/route';

const mocks = vi.hoisted(() => ({
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
  broadcastKnockInvalidated: vi.fn(),
  emitPresenceEvent: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

vi.mock('@/lib/presence/knock-broadcast', () => ({
  broadcastKnockInvalidated: mocks.broadcastKnockInvalidated,
}));

vi.mock('@/lib/presence/observability', () => ({
  emitPresenceEvent: mocks.emitPresenceEvent,
}));

const RESPONDER_ID = '55555555-5555-4555-8555-555555555555';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const REQUESTER_ID = '77777777-7777-4777-8777-777777777777';
const SPACE_ID = '88888888-8888-4888-8888-888888888888';

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/spaces/knock/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/spaces/knock/respond', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireVerifiedPresenceAuth.mockResolvedValue({
      ok: true,
      identity: { appUserId: RESPONDER_ID, authSessionId: AUTH_SESSION_ID, companyId: COMPANY_ID },
      admin: { rpc: mocks.rpc },
    });
  });

  it('derives responder identity and request details on the server', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'KNOCK_RESPONDED',
        requestId: REQUEST_ID,
        status: 'approved',
        decision: 'APPROVE',
        responderId: RESPONDER_ID,
        expiresAt: '2026-07-16T12:00:30.000Z',
        usable: true,
        alreadyApplied: false,
        requesterUserId: REQUESTER_ID,
        spaceId: SPACE_ID,
        requesterLocationVersionAfter: 7,
        requesterAccessRevision: 2,
        responderAccessRevision: 4,
        spaceAccessRevision: 3,
      },
      error: null,
    });

    const response = await POST(createRequest({
      sessionId: SESSION_ID,
      requestId: REQUEST_ID,
      decision: 'APPROVE',
      requesterId: '77777777-7777-4777-8777-777777777777',
      spaceId: '88888888-8888-4888-8888-888888888888',
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('respond_to_knock_observed', {
      p_responder_id: RESPONDER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
      p_request_id: REQUEST_ID,
      p_decision: 'APPROVE',
    });
    expect(mocks.broadcastKnockInvalidated).toHaveBeenCalledWith(
      expect.objectContaining({ rpc: mocks.rpc }),
      COMPANY_ID,
    );
    const body = await response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('requesterUserId');
    expect(body).not.toHaveProperty('responderAccessRevision');
    expect(mocks.emitPresenceEvent).toHaveBeenCalledWith(expect.objectContaining({
      requesterUserId: REQUESTER_ID,
      responderUserId: RESPONDER_ID,
      spaceId: SPACE_ID,
      requesterLocationVersionAfter: 7,
      requesterAccessRevision: 2,
      responderAccessRevision: 4,
      spaceAccessRevision: 3,
      expiryResult: 'usable',
    }));
  });

  it('does not broadcast an idempotent replay', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        code: 'KNOCK_RESPONDED',
        requestId: REQUEST_ID,
        status: 'denied',
        decision: 'DENY',
        responderId: RESPONDER_ID,
        expiresAt: '2026-07-16T12:00:30.000Z',
        usable: false,
        alreadyApplied: true,
      },
      error: null,
    });

    const response = await POST(createRequest({
      sessionId: SESSION_ID,
      requestId: REQUEST_ID,
      decision: 'DENY',
    }));

    expect(response.status).toBe(200);
    expect(mocks.broadcastKnockInvalidated).not.toHaveBeenCalled();
  });

  it('rejects malformed decisions before the RPC', async () => {
    const response = await POST(createRequest({
      sessionId: SESSION_ID,
      requestId: REQUEST_ID,
      decision: 'LET_THEM_IN',
    }));
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
      requestId: REQUEST_ID,
      decision: 'DENY',
    }));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps a concurrent second response to conflict', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: false, code: 'KNOCK_ALREADY_RESOLVED' },
      error: null,
    });

    const response = await POST(createRequest({
      sessionId: SESSION_ID,
      requestId: REQUEST_ID,
      decision: 'DENY',
    }));

    expect(response.status).toBe(409);
  });
});
