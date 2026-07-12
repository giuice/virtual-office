import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/presence/location/route';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_SESSION_ID = '77777777-7777-4777-8777-777777777777';
const SESSION_ID = '99999999-9999-4999-8999-999999999999';
const TRANSITION_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const KNOCK_REQUEST_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  requireVerifiedPresenceAuth: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/presence/verified-session', () => ({
  requireVerifiedPresenceAuth: mocks.requireVerifiedPresenceAuth,
}));

function primeAuth(): void {
  mocks.requireVerifiedPresenceAuth.mockResolvedValue({
    ok: true,
    identity: {
      appUserId: APP_USER_ID,
      companyId: '55555555-5555-4555-8555-555555555555',
      authSessionId: AUTH_SESSION_ID,
    },
    admin: {
      rpc: (name: string, args: Record<string, unknown>) => mocks.rpc(name, args),
    },
    supabase: {},
  });
}

function jsonRequest(body: unknown): Request {
  return new Request('http://test.local/api/presence/location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function defaultBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: SESSION_ID,
    transitionId: TRANSITION_ID,
    spaceId: SPACE_ID,
    reason: 'manual-enter',
    knockRequestId: null,
    expectedLocationVersion: null,
    ...overrides,
  };
}

function rpcRow(
  code: string,
  ok: boolean,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ok,
    code,
    message: 'ignored stable route message wins',
    transition_id: TRANSITION_ID,
    previous_space_id: null,
    current_space_id: ok ? SPACE_ID : null,
    location_version: ok ? 12 : null,
    already_applied: false,
    authorized_by: null,
    ...overrides,
  };
}

async function expectJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('/api/presence/location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAuth();
    mocks.rpc.mockResolvedValue({
      data: rpcRow('LOCATION_UPDATED', true),
      error: null,
    });
  });

  it.each([
    ['malformed JSON', '{', null],
    ['extra userId', defaultBody({ userId: APP_USER_ID }), TRANSITION_ID],
    ['manual-enter without a space', defaultBody({ spaceId: null }), TRANSITION_ID],
    ['manual-enter with expected version', defaultBody({ expectedLocationVersion: 1 }), TRANSITION_ID],
    ['manual-leave with a space', defaultBody({ reason: 'manual-leave' }), TRANSITION_ID],
    [
      'knock-enter without knock request',
      defaultBody({ reason: 'knock-enter', expectedLocationVersion: 1 }),
      TRANSITION_ID,
    ],
    [
      'auto-rejoin without expected version',
      defaultBody({ reason: 'auto-rejoin' }),
      TRANSITION_ID,
    ],
    ['bad transition id', defaultBody({ transitionId: 'not-a-uuid' }), null],
    // 'logout' is reserved for /api/presence/logout; accepting it here would
    // let a client fence its auth session skipping the sign-out flow.
    [
      'logout reason is rejected by the location endpoint',
      defaultBody({ reason: 'logout', spaceId: null, knockRequestId: null }),
      TRANSITION_ID,
    ],
  ])('rejects invalid body: %s', async (_label, body, expectedTransitionId) => {
    const request =
      typeof body === 'string'
        ? new Request('http://test.local/api/presence/location', { method: 'POST', body })
        : jsonRequest(body);

    const response = await POST(request);
    const data = await expectJson(response);

    expect(response.status).toBe(400);
    expect(data).toEqual({
      success: false,
      code: 'INVALID_REQUEST',
      message: 'Invalid location transition request',
      retryable: false,
      transitionId: expectedTransitionId,
    });
    expect(mocks.requireVerifiedPresenceAuth).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('calls the transition rpc with server-derived identity', async () => {
    const response = await POST(jsonRequest(defaultBody()));
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      code: 'LOCATION_UPDATED',
      transitionId: TRANSITION_ID,
      previousSpaceId: null,
      currentSpaceId: SPACE_ID,
      locationVersion: 12,
      alreadyApplied: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('transition_user_location', {
      p_user_id: APP_USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
      p_transition_id: TRANSITION_ID,
      p_target_space_id: SPACE_ID,
      p_reason: 'manual-enter',
      p_knock_request_id: null,
      p_expected_location_version: null,
    });
  });

  it('accepts knock-enter with exact reason shape', async () => {
    const response = await POST(
      jsonRequest(
        defaultBody({
          reason: 'knock-enter',
          knockRequestId: KNOCK_REQUEST_ID,
          expectedLocationVersion: 3,
        })
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'transition_user_location',
      expect.objectContaining({
        p_reason: 'knock-enter',
        p_knock_request_id: KNOCK_REQUEST_ID,
        p_expected_location_version: 3,
      })
    );
  });

  it('returns 401 when the verified auth session is fenced', async () => {
    mocks.requireVerifiedPresenceAuth.mockResolvedValueOnce({
      ok: false,
      status: 401,
      code: 'AUTH_SESSION_REVOKED',
      error: 'Authentication session revoked',
    });

    const response = await POST(jsonRequest(defaultBody()));
    const data = await expectJson(response);

    expect(response.status).toBe(401);
    expect(data).toMatchObject({
      success: false,
      code: 'AUTH_SESSION_REVOKED',
      retryable: false,
      transitionId: TRANSITION_ID,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_REQUEST', 400, false],
    ['UNAUTHORIZED', 401, true],
    ['AUTH_SESSION_REVOKED', 401, false],
    ['SESSION_INVALID', 409, true],
    ['SPACE_NOT_FOUND', 404, false],
    ['CROSS_COMPANY_SPACE', 403, false],
    ['SPACE_UNAVAILABLE', 409, false],
    ['SPACE_FULL', 409, false],
    ['SPACE_ACCESS_DENIED', 403, false],
    ['SPACE_ACCESS_CONFIGURATION_INVALID', 409, false],
    ['KNOCK_INVALID', 403, false],
    ['KNOCK_NOT_READY', 409, true],
    ['KNOCK_EXPIRED', 410, false],
    ['KNOCK_ALREADY_CONSUMED', 409, false],
    ['KNOCK_SUPERSEDED', 409, false],
    ['IDEMPOTENCY_CONFLICT', 409, false],
    ['LOCATION_SUPERSEDED', 409, false],
    ['PRESENCE_MAINTENANCE', 503, true],
    ['LEGACY_AUDIT_UNAVAILABLE', 503, true],
    ['CLIENT_UPGRADE_REQUIRED', 426, false],
    ['INTERNAL_ERROR', 500, true],
  ])('maps rpc code %s to HTTP %i', async (code, status, retryable) => {
    mocks.rpc.mockResolvedValueOnce({ data: rpcRow(code, false), error: null });

    const response = await POST(jsonRequest(defaultBody()));
    const data = await expectJson(response);

    expect(response.status).toBe(status);
    expect(data).toMatchObject({
      success: false,
      code,
      retryable,
      transitionId: TRANSITION_ID,
    });
    expect(JSON.stringify(data)).not.toContain('ignored stable route message wins');
  });

  it('maps LOCATION_UNCHANGED to a success body with alreadyApplied', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: rpcRow('LOCATION_UNCHANGED', true, {
        current_space_id: null,
        location_version: 13,
        already_applied: true,
      }),
      error: null,
    });

    const response = await POST(jsonRequest(defaultBody()));
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      code: 'LOCATION_UNCHANGED',
      transitionId: TRANSITION_ID,
      previousSpaceId: null,
      currentSpaceId: null,
      locationVersion: 13,
      alreadyApplied: true,
    });
  });

  it('returns a sanitized 500 when the rpc transport fails', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'deadlock detected on private table' },
    });

    const response = await POST(jsonRequest(defaultBody()));
    const data = await expectJson(response);

    expect(response.status).toBe(500);
    expect(data).toMatchObject({
      success: false,
      code: 'INTERNAL_ERROR',
      retryable: true,
      transitionId: TRANSITION_ID,
    });
    expect(JSON.stringify(data)).not.toContain('deadlock');
  });
});
