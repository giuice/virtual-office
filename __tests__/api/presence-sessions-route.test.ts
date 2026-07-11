import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { POST as registerSession } from '@/app/api/presence/sessions/route';
import { POST as heartbeatSession } from '@/app/api/presence/sessions/[sessionId]/heartbeat/route';
import { POST as disconnectSession } from '@/app/api/presence/sessions/[sessionId]/disconnect/route';

const AUTH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_SESSION_ID = '77777777-7777-4777-8777-777777777777';
const REGISTRATION_ID = '88888888-8888-4888-8888-888888888888';
const SESSION_ID = '99999999-9999-4999-8999-999999999999';
const EXPIRES_AT = '2026-07-11T12:01:30.000Z';
const RETIRED_AT = '2026-07-11T12:00:00.000Z';

const mockAuthGetClaims = vi.fn();
const mockFindBySupabaseUid = vi.fn();
const mockFenceMaybeSingle = vi.fn();
const mockRpc = vi.fn();

const mockAuthedClient = {
  auth: {
    getClaims: () => mockAuthGetClaims(),
  },
};

const mockAdminFrom = vi.fn((table: string) => {
  if (table !== 'revoked_presence_auth_sessions') {
    throw new Error(`Unexpected service-role table: ${table}`);
  }

  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: () => mockFenceMaybeSingle(),
        })),
      })),
    })),
  };
});

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (role?: 'service_role') => {
    if (role === 'service_role') {
      return {
        from: (table: string) => mockAdminFrom(table),
        rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
      };
    }

    return mockAuthedClient;
  }),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mockFindBySupabaseUid(uid),
    };
  },
}));

function makeAuthenticatedUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
    companyId: COMPANY_ID,
    supabase_uid: AUTH_USER_ID,
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2026-07-11T12:00:00.000Z',
    createdAt: '2026-07-11T11:00:00.000Z',
    currentSpaceId: null,
    ...overrides,
  };
}

function primeAuth(): void {
  mockAuthGetClaims.mockResolvedValue({
    data: {
      claims: {
        sub: AUTH_USER_ID,
        session_id: AUTH_SESSION_ID,
      },
    },
    error: null,
  });
  mockFindBySupabaseUid.mockResolvedValue(makeAuthenticatedUser());
  mockFenceMaybeSingle.mockResolvedValue({ data: null, error: null });
}

function jsonRequest(body: unknown): Request {
  return new Request('http://test.local/api/presence/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function emptyRequest(): Request {
  return new Request('http://test.local/api/presence/sessions', {
    method: 'POST',
  });
}

function textRequest(body: string): Request {
  return new Request('http://test.local/api/presence/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
}

function routeParams(sessionId = SESSION_ID): { params: Promise<{ sessionId: string }> } {
  return { params: Promise.resolve({ sessionId }) };
}

async function expectJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('/api/presence/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAuth();
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        sessionId: SESSION_ID,
        registrationId: REGISTRATION_ID,
        expiresAt: EXPIRES_AT,
        sessionSpaceId: null,
        refreshed: false,
      },
      error: null,
    });
  });

  it('returns 401 when verified claims are unavailable', async () => {
    mockAuthGetClaims.mockResolvedValueOnce({ data: null, error: { message: 'no token' } });

    const response = await registerSession(jsonRequest({ registrationId: REGISTRATION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(401);
    expect(data.code).toBe('UNAUTHORIZED');
    expect(mockFindBySupabaseUid).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 401 when the verified session_id claim is missing', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAuthGetClaims.mockResolvedValueOnce({
      data: { claims: { sub: AUTH_USER_ID } },
      error: null,
    });

    try {
      const response = await registerSession(jsonRequest({ registrationId: REGISTRATION_ID }));
      const data = await expectJson(response);

      expect(response.status).toBe(401);
      expect(data.code).toBe('UNAUTHORIZED');
      expect(mockFindBySupabaseUid).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it('returns 401 when the verified session_id claim is malformed', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockAuthGetClaims.mockResolvedValueOnce({
      data: { claims: { sub: AUTH_USER_ID, session_id: 'not-a-uuid' } },
      error: null,
    });

    try {
      const response = await registerSession(jsonRequest({ registrationId: REGISTRATION_ID }));
      const data = await expectJson(response);

      expect(response.status).toBe(401);
      expect(data.code).toBe('UNAUTHORIZED');
      expect(mockFindBySupabaseUid).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it('returns 400 for an invalid registrationId', async () => {
    const response = await registerSession(jsonRequest({ registrationId: 'invalid' }));
    const data = await expectJson(response);

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 400 when the register body includes a sessionId key', async () => {
    const response = await registerSession(
      jsonRequest({ registrationId: REGISTRATION_ID, sessionId: SESSION_ID })
    );
    const data = await expectJson(response);

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns 401 when the auth-session fence pre-check finds a revoked session', async () => {
    mockFenceMaybeSingle.mockResolvedValueOnce({
      data: { auth_session_id: AUTH_SESSION_ID },
      error: null,
    });

    const response = await registerSession(jsonRequest({ registrationId: REGISTRATION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(401);
    expect(data.code).toBe('AUTH_SESSION_REVOKED');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['AUTH_SESSION_REVOKED', 401],
    ['NO_COMPANY', 403],
    ['USER_NOT_FOUND', 404],
    ['SESSION_RETIRED', 409],
    ['REGISTRATION_CONFLICT', 409],
  ])('maps register rpc code %s to HTTP %i', async (code, status) => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, code }, error: null });

    const response = await registerSession(jsonRequest({ registrationId: REGISTRATION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(status);
    expect(data.code).toBe(code);
  });

  it('returns the registered session response on success', async () => {
    const response = await registerSession(jsonRequest({ registrationId: REGISTRATION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({
      sessionId: SESSION_ID,
      registrationId: REGISTRATION_ID,
      expiresAt: EXPIRES_AT,
      sessionSpaceId: null,
    });
    expect(mockRpc).toHaveBeenCalledWith('register_presence_session', {
      p_user_id: APP_USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_registration_id: REGISTRATION_ID,
    });
  });

  it('returns a sanitized 500 when the register rpc transport fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    });

    const response = await registerSession(jsonRequest({ registrationId: REGISTRATION_ID }));
    const data = await expectJson(response);

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Presence session operation failed',
      code: 'PRESENCE_SESSION_ERROR',
    });
    expect(JSON.stringify(data)).not.toContain('duplicate key');
  });
});

describe('/api/presence/sessions/[sessionId]/heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAuth();
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        expiresAt: EXPIRES_AT,
      },
      error: null,
    });
  });

  it('ignores the request body entirely', async () => {
    const request = {
      json: vi.fn(() => {
        throw new Error('body should not be parsed');
      }),
    } as unknown as Request;

    const response = await heartbeatSession(request, routeParams());
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({ expiresAt: EXPIRES_AT });
    expect(request.json).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('heartbeat_presence_session', {
      p_user_id: APP_USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
    });
  });

  it.each([
    ['AUTH_SESSION_REVOKED', 401],
    ['NO_COMPANY', 403],
    ['USER_NOT_FOUND', 404],
    ['SESSION_RETIRED', 409],
    ['REGISTRATION_CONFLICT', 409],
  ])('maps heartbeat rpc code %s to HTTP %i', async (code, status) => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, code }, error: null });

    const response = await heartbeatSession(emptyRequest(), routeParams());
    const data = await expectJson(response);

    expect(response.status).toBe(status);
    expect(data.code).toBe(code);
  });

  it('returns a sanitized 500 when the heartbeat rpc transport fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation public.user_presence_sessions does not exist' },
    });

    const response = await heartbeatSession(emptyRequest(), routeParams());
    const data = await expectJson(response);

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Presence session operation failed',
      code: 'PRESENCE_SESSION_ERROR',
    });
    expect(JSON.stringify(data)).not.toContain('relation public');
  });
});

describe('/api/presence/sessions/[sessionId]/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeAuth();
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        retiredAt: RETIRED_AT,
        alreadyDisconnected: false,
      },
      error: null,
    });
  });

  it('accepts text/plain bodies without parsing JSON', async () => {
    const response = await disconnectSession(textRequest('{}'), routeParams());
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({
      retiredAt: RETIRED_AT,
      alreadyDisconnected: false,
    });
    expect(mockRpc).toHaveBeenCalledWith('disconnect_presence_session', {
      p_user_id: APP_USER_ID,
      p_auth_session_id: AUTH_SESSION_ID,
      p_session_id: SESSION_ID,
    });
  });

  it('accepts empty bodies without parsing JSON', async () => {
    const response = await disconnectSession(emptyRequest(), routeParams());
    const data = await expectJson(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({
      retiredAt: RETIRED_AT,
      alreadyDisconnected: false,
    });
  });

  it.each([
    ['AUTH_SESSION_REVOKED', 401],
    ['NO_COMPANY', 403],
    ['USER_NOT_FOUND', 404],
    ['SESSION_RETIRED', 409],
    ['REGISTRATION_CONFLICT', 409],
  ])('maps disconnect rpc code %s to HTTP %i', async (code, status) => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, code }, error: null });

    const response = await disconnectSession(emptyRequest(), routeParams());
    const data = await expectJson(response);

    expect(response.status).toBe(status);
    expect(data.code).toBe(code);
  });

  it('returns a sanitized 500 when the disconnect rpc transport fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'deadlock detected' },
    });

    const response = await disconnectSession(emptyRequest(), routeParams());
    const data = await expectJson(response);

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Presence session operation failed',
      code: 'PRESENCE_SESSION_ERROR',
    });
    expect(JSON.stringify(data)).not.toContain('deadlock');
  });
});
