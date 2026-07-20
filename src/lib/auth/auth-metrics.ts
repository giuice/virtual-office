export type AuthBoundary = 'proxy' | 'route';
export type AuthMethod = 'getClaims' | 'getUser';
export type AuthStatus = 'authenticated' | 'unauthenticated' | 'error';

export interface AuthValidationMetric {
  correlationId: string;
  boundary: AuthBoundary;
  pathname: string;
  authMethod: AuthMethod;
  authStatus: AuthStatus;
  authErrorCode?: string;
  refreshed?: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATHNAME_PATTERN = /^\/[A-Za-z0-9/_.-]*$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SECRET_PATTERN = /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\beyJ[A-Za-z0-9_-]{8,}|bearer\s+|access[_-]?token|refresh[_-]?token|provider[_-]?token|service[_-]?role|sb_secret_)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createAuthCorrelationId(): string {
  return globalThis.crypto.randomUUID();
}

export function getAuthErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * Auth metrics are intentionally process-local log events, not counters. A
 * collector can aggregate them without mixing HMR workers or concurrent users.
 * Production remains dormant even if VO_AUTH_METRICS is accidentally retained.
 */
export function recordAuthValidation(metric: AuthValidationMetric): void {
  if (process.env.VO_AUTH_METRICS !== '1' || process.env.NODE_ENV === 'production') {
    return;
  }

  const correlationId = typeof metric.correlationId === 'string' &&
    UUID_PATTERN.test(metric.correlationId)
    ? metric.correlationId
    : createAuthCorrelationId();
  const pathname = typeof metric.pathname === 'string' &&
    metric.pathname.length <= 256 &&
    PATHNAME_PATTERN.test(metric.pathname) &&
    !SECRET_PATTERN.test(metric.pathname)
    ? metric.pathname
    : '/redacted';
  const authErrorCode = typeof metric.authErrorCode === 'string' &&
    ERROR_CODE_PATTERN.test(metric.authErrorCode) &&
    !SECRET_PATTERN.test(metric.authErrorCode)
    ? metric.authErrorCode
    : undefined;
  const boundary: AuthBoundary = ['proxy', 'route'].includes(metric.boundary)
    ? metric.boundary
    : 'route';
  const authMethod: AuthMethod = ['getClaims', 'getUser'].includes(metric.authMethod)
    ? metric.authMethod
    : 'getUser';
  const authStatus: AuthStatus = ['authenticated', 'unauthenticated', 'error'].includes(
    metric.authStatus
  ) ? metric.authStatus : 'error';

  const event: AuthValidationMetric & { event: 'auth_validation' } = {
    event: 'auth_validation' as const,
    correlationId,
    boundary,
    pathname,
    authMethod,
    authStatus,
  };
  if (authErrorCode !== undefined) event.authErrorCode = authErrorCode;
  if (typeof metric.refreshed === 'boolean') event.refreshed = metric.refreshed;
  console.info(JSON.stringify(event));
}
