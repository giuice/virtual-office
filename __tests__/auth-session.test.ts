import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/database';
import { requireAuthUser, validateUserSession } from '@/lib/auth/session';

// vitest.setup.ts mocks '@/lib/auth/session' globally; this suite tests the real module.
vi.unmock('@/lib/auth/session');

const AUTH_USER_ID = 'auth-user-1';
const APP_USER_ID = 'app-user-1';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  usersSingle: vi.fn(),
  findBySupabaseUid: vi.fn(),
  serverClientOptions: undefined as { onAuthCookiesSet?: () => void } | undefined,
}));

// The mocked client intentionally has NO getSession: if the implementation
// regresses to session-based auth, these tests fail.
vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (
    _role?: 'service_role',
    options?: { onAuthCookiesSet?: () => void }
  ) => {
    mocks.serverClientOptions = options;
    return {
      auth: {
        getUser: () => mocks.getUser(),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => mocks.usersSingle(),
          }),
        }),
      }),
    };
  }),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mocks.findBySupabaseUid(uid),
    };
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: APP_USER_ID,
    companyId: 'company-1',
    supabase_uid: AUTH_USER_ID,
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    status: 'online',
    preferences: {},
    role: 'member',
    lastActive: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentSpaceId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serverClientOptions = undefined;
  mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
  mocks.usersSingle.mockResolvedValue({ data: { id: APP_USER_ID }, error: null });
  mocks.findBySupabaseUid.mockResolvedValue(makeUser());
});

describe('validateUserSession', () => {
  it('returns both ids when the auth server validates the user', async () => {
    const result = await validateUserSession();

    expect(result).toEqual({ supabaseUid: AUTH_USER_ID, userDbId: APP_USER_ID });
  });

  it('returns an error when there is no authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await validateUserSession();

    expect(result.error).toBe('No active session');
    expect(result.userDbId).toBeUndefined();
  });
});

describe('requireAuthUser', () => {
  it('returns a 401 errorResponse when there is no authenticated user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(401);
    }
    expect(mocks.findBySupabaseUid).not.toHaveBeenCalled();
  });

  it('preserves an Auth 429 as a rate-limited envelope and logs the Auth code', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: {
        status: 429,
        code: 'over_request_rate_limit',
        message: 'Request rate limit reached',
      },
    });

    const result = await requireAuthUser({ correlationId: 'correlation-429' });

    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(429);
      expect(await result.errorResponse.json()).toEqual({
        error: 'Authentication service rate limit reached',
        code: 'RATE_LIMITED',
        correlationId: 'correlation-429',
      });
    }
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('over_request_rate_limit'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('correlation-429'));
    expect(mocks.findBySupabaseUid).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('returns a 404 errorResponse when the authenticated user has no app profile', async () => {
    mocks.findBySupabaseUid.mockResolvedValue(null);

    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(404);
    }
  });

  it('returns a 500 errorResponse instead of throwing when the profile lookup fails', async () => {
    mocks.findBySupabaseUid.mockRejectedValue(new Error('connection reset'));

    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(500);
    }
  });

  it('returns the auth context when the user is authenticated and has a profile', async () => {
    const result = await requireAuthUser();

    expect('errorResponse' in result).toBe(false);
    if (!('errorResponse' in result)) {
      expect(result.dbUser.id).toBe(APP_USER_ID);
      expect(result.authUser.id).toBe(AUTH_USER_ID);
      expect(mocks.findBySupabaseUid).toHaveBeenCalledWith(AUTH_USER_ID);
    }
  });

  it('emits one correlated route validation event when metrics are enabled', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await requireAuthUser({
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      pathname: '/api/companies/get',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual({
      event: 'auth_validation',
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      boundary: 'route',
      pathname: '/api/companies/get',
      authMethod: 'getUser',
      authStatus: 'authenticated',
      refreshed: false,
    });
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it('records a route refresh when the SSR client writes auth cookies', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.getUser.mockImplementation(async () => {
      mocks.serverClientOptions?.onAuthCookiesSet?.();
      return { data: { user: { id: AUTH_USER_ID } }, error: null };
    });

    await requireAuthUser({
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      pathname: '/api/spaces',
    });

    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      refreshed: true,
    });
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it('classifies a returned Auth error as an error metric', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 429, code: 'over_request_rate_limit' },
    });

    await requireAuthUser({ correlationId: 'correlation-error', pathname: '/api/spaces' });

    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      authStatus: 'error',
      authErrorCode: 'over_request_rate_limit',
    });
    vi.unstubAllEnvs();
  });
});
