import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '@/proxy';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  setAll: undefined as undefined | ((cookies: Array<{ name: string; value: string }>) => void),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: typeof mocks.setAll } }
  ) => {
    mocks.setAll = options.cookies.setAll;
    return { auth: { getUser: () => mocks.getUser() } };
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn(() => ({ cookies: { set: vi.fn() } })),
    redirect: vi.fn(() => ({ redirected: true })),
  },
}));

function request(pathname: string) {
  return {
    headers: new Headers(),
    cookies: {
      getAll: vi.fn(() => []),
      set: vi.fn(),
    },
    nextUrl: { pathname },
    url: `https://example.com${pathname}`,
  };
}

describe('proxy auth validation metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('records a cookie refresh without exposing cookie contents', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.getUser.mockImplementation(async () => {
      mocks.setAll?.([{ name: 'sb-token', value: 'secret-cookie' }]);
      return { data: { user: { id: 'auth-user-1' } }, error: null };
    });

    await proxy(request('/floor-plan') as never);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const metricLine = String(logSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(metricLine)).toMatchObject({
      event: 'auth_validation',
      boundary: 'proxy',
      pathname: '/floor-plan',
      authMethod: 'getUser',
      authStatus: 'authenticated',
      refreshed: true,
    });
    expect(metricLine).not.toContain('secret-cookie');
  });

  it('classifies a returned Auth error as an error metric', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'over_request_rate_limit', status: 429 },
    });

    await proxy(request('/login') as never);

    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      authStatus: 'error',
      authErrorCode: 'over_request_rate_limit',
      refreshed: false,
    });
  });

  it('emits one error metric when getUser throws', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mocks.getUser.mockRejectedValue({ code: 'auth_transport_failure' });

    await expect(proxy(request('/floor-plan') as never)).rejects.toEqual({
      code: 'auth_transport_failure',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      authStatus: 'error',
      authErrorCode: 'auth_transport_failure',
    });
  });
});
