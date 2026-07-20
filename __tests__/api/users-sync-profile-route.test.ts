import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/users/sync-profile/route';

const AUTH_USER = { id: 'auth-user-1', email: 'ada@example.com' };

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findBySupabaseUid: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  recordLegacyRoute: vi.fn(),
  serverClientOptions: undefined as { onAuthCookiesSet?: () => void } | undefined,
}));

vi.mock('@/lib/presence/legacy-route-audit', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/presence/legacy-route-audit')>();
  return {
    ...actual,
    recordLegacyPresenceRouteCall: (...args: unknown[]) => mocks.recordLegacyRoute(...args),
  };
});

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: vi.fn(async (
    role?: 'service_role',
    options?: { onAuthCookiesSet?: () => void }
  ) => {
    if (role === 'service_role') return { client: 'admin' };
    mocks.serverClientOptions = options;
    return { auth: { getUser: () => mocks.getUser() } };
  }),
}));

vi.mock('@/repositories/implementations/supabase', () => ({
  SupabaseUserRepository: function MockUserRepository() {
    return {
      findBySupabaseUid: (uid: string) => mocks.findBySupabaseUid(uid),
      create: (data: unknown) => mocks.create(data),
      update: (id: string, data: unknown) => mocks.update(id, data),
    };
  },
}));

function request(body: unknown): Request {
  return new Request('https://example.com/api/users/sync-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/users/sync-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverClientOptions = undefined;
    mocks.getUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
    mocks.findBySupabaseUid.mockResolvedValue({
      id: 'app-user-1',
      supabase_uid: AUTH_USER.id,
      email: AUTH_USER.email,
      avatarUrl: undefined,
    });
    mocks.recordLegacyRoute.mockResolvedValue(undefined);
  });

  it('keeps the existing-user success shape', async () => {
    const response = await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      user: { id: 'app-user-1', supabase_uid: AUTH_USER.id },
      message: 'User profile already exists',
    });
  });

  it('rejects legacy offline and unknown profile-sync fields', async () => {
    const response = await POST(request({
      supabaseUid: AUTH_USER.id,
      email: AUTH_USER.email,
      status: 'offline',
    }));

    expect(response.status).toBe(400);
    expect(mocks.recordLegacyRoute).toHaveBeenCalledWith('users-offline-status');
    expect(mocks.findBySupabaseUid).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('fails closed when the legacy offline receipt cannot be recorded', async () => {
    const { LegacyPresenceRouteAuditError } = await import('@/lib/presence/legacy-route-audit');
    mocks.recordLegacyRoute.mockRejectedValue(new LegacyPresenceRouteAuditError());

    const response = await POST(request({
      supabaseUid: AUTH_USER.id,
      email: AUTH_USER.email,
      status: 'offline',
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'LEGACY_AUDIT_UNAVAILABLE' });
    expect(mocks.findBySupabaseUid).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('derives a Google avatar from verified Auth metadata', async () => {
    const avatarUrl = 'https://lh3.googleusercontent.com/a/verified-avatar';
    mocks.getUser.mockResolvedValue({
      data: { user: { ...AUTH_USER, user_metadata: { picture: avatarUrl } } },
      error: null,
    });
    mocks.update.mockResolvedValue({
      id: 'app-user-1',
      supabase_uid: AUTH_USER.id,
      email: AUTH_USER.email,
      avatarUrl,
    });

    const response = await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith('app-user-1', { avatarUrl });
  });

  it('does not persist an OAuth avatar from a lookalike Google hostname', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          ...AUTH_USER,
          user_metadata: { picture: 'https://evilgoogle.com/avatar.png' },
        },
      },
      error: null,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));

    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns a safe correlated envelope for a PostgREST-shaped failure', async () => {
    mocks.findBySupabaseUid.mockRejectedValue({
      code: '42P01',
      message: 'relation users does not exist',
      details: 'private schema detail',
      hint: 'private schema hint',
    });

    const response = await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toMatchObject({
      error: 'Failed to sync user profile',
      code: 'INTERNAL_ERROR',
      correlationId: expect.any(String),
    });
    expect(JSON.stringify(data)).not.toContain('42P01');
    expect(JSON.stringify(data)).not.toContain('private schema');
  });

  it('maps Auth rate limiting by status rather than message text', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 429, code: 'custom_auth_rate_code', message: 'arbitrary text' },
    });

    const response = await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data).toMatchObject({
      error: 'Authentication service rate limit reached',
      code: 'RATE_LIMITED',
      correlationId: expect.any(String),
    });
  });

  it('emits one correlated metric for its auth-only validation', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      event: 'auth_validation',
      correlationId: expect.any(String),
      boundary: 'route',
      pathname: '/api/users/sync-profile',
      authMethod: 'getUser',
      authStatus: 'authenticated',
    });
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it('emits one error metric when getUser throws', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getUser.mockRejectedValue({ code: 'auth_transport_failure' });

    const response = await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));

    expect(response.status).toBe(500);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      authStatus: 'error',
      authErrorCode: 'auth_transport_failure',
      pathname: '/api/users/sync-profile',
    });
    vi.unstubAllEnvs();
  });

  it('records a refresh when getUser writes replacement auth cookies', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.getUser.mockImplementation(async () => {
      mocks.serverClientOptions?.onAuthCookiesSet?.();
      return { data: { user: AUTH_USER }, error: null };
    });

    await POST(request({ supabaseUid: AUTH_USER.id, email: AUTH_USER.email }));

    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({ refreshed: true });
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });
});
