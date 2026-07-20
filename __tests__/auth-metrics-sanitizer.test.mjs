import { describe, expect, it } from 'vitest';
import {
  sanitizeAuthMetric,
  sanitizeAuthMetricLine,
} from '../scripts/auth-metrics-sanitizer.mjs';

const VALID_METRIC = {
  event: 'auth_validation',
  correlationId: '550e8400-e29b-41d4-a716-446655440000',
  boundary: 'proxy',
  pathname: '/floor-plan',
  authMethod: 'getUser',
  authStatus: 'authenticated',
  refreshed: false,
};

describe('auth metric artifact sanitizer', () => {
  it('returns an explicit copy of a valid allowlisted metric', () => {
    const sanitized = sanitizeAuthMetric(VALID_METRIC);

    expect(sanitized).toEqual(VALID_METRIC);
    expect(sanitized).not.toBe(VALID_METRIC);
  });

  it.each([
    { ...VALID_METRIC, session: { access_token: 'secret' } },
    { ...VALID_METRIC, correlationId: 'not-a-uuid' },
    { ...VALID_METRIC, pathname: '/users/ada@example.com' },
    { ...VALID_METRIC, pathname: '/floor-plan?access_token=secret' },
    { ...VALID_METRIC, authErrorCode: 'eyJhbGciOiJIUzI1NiJ9' },
    { ...VALID_METRIC, authErrorCode: 'contains spaces' },
    { ...VALID_METRIC, authErrorCode: 'x'.repeat(65) },
    { ...VALID_METRIC, refreshed: 'false' },
  ])('rejects unknown, malformed, or secret-shaped data', (candidate) => {
    expect(sanitizeAuthMetric(candidate)).toBeNull();
  });

  it('extracts a valid JSON metric from a prefixed dev-server line', () => {
    expect(sanitizeAuthMetricLine(`server-prefix ${JSON.stringify(VALID_METRIC)}`))
      .toEqual(VALID_METRIC);
    expect(sanitizeAuthMetricLine('ordinary output')).toBeNull();
  });
});
