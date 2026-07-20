import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthErrorCode,
  recordAuthValidation,
  type AuthValidationMetric,
} from '@/lib/auth/auth-metrics';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const METRIC: AuthValidationMetric = {
  correlationId: '550e8400-e29b-41d4-a716-446655440000',
  boundary: 'route',
  pathname: '/api/spaces',
  authMethod: 'getUser',
  authStatus: 'authenticated',
};

describe('auth validation metrics', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VO_AUTH_METRICS', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('emits one structured JSON line with the allowlisted validation fields', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    recordAuthValidation({ ...METRIC, refreshed: false });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toEqual({
      event: 'auth_validation',
      ...METRIC,
      refreshed: false,
    });
  });

  it('is dormant without the explicit flag and in production', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    vi.stubEnv('VO_AUTH_METRICS', '0');
    recordAuthValidation(METRIC);
    vi.stubEnv('VO_AUTH_METRICS', '1');
    vi.stubEnv('NODE_ENV', 'production');
    recordAuthValidation(METRIC);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('extracts only the Auth error code and never its message', () => {
    expect(getAuthErrorCode({ code: 'over_request_rate_limit', message: 'sensitive detail' }))
      .toBe('over_request_rate_limit');
    expect(getAuthErrorCode(new Error('sensitive detail'))).toBeUndefined();
  });

  it('normalizes unsafe raw log values and ignores runtime extra fields', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    recordAuthValidation({
      ...METRIC,
      correlationId: 'not-a-uuid',
      pathname: '/users/ada@example.com',
      authErrorCode: 'eyJhbGciOiJIUzI1NiJ9',
      session: { access_token: 'secret' },
    } as AuthValidationMetric & { session: { access_token: string } });

    const event = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(event.correlationId).toMatch(UUID_PATTERN);
    expect(event.pathname).toBe('/redacted');
    expect(event.authErrorCode).toBeUndefined();
    expect(event.session).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain('ada@example.com');
    expect(JSON.stringify(event)).not.toContain('secret');
  });
});
