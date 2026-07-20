const ALLOWED_KEYS = new Set([
  'event',
  'correlationId',
  'boundary',
  'pathname',
  'authMethod',
  'authStatus',
  'authErrorCode',
  'refreshed',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATHNAME_PATTERN = /^\/[A-Za-z0-9/_.-]*$/;
const ERROR_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SECRET_PATTERN = /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\beyJ[A-Za-z0-9_-]{8,}|bearer\s+|access[_-]?token|refresh[_-]?token|provider[_-]?token|service[_-]?role|sb_secret_)/i;

function isPlainRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeString(value) {
  return typeof value === 'string' && !SECRET_PATTERN.test(value);
}

export function sanitizeAuthMetric(candidate) {
  if (!isPlainRecord(candidate)) return null;
  if (Object.keys(candidate).some((key) => !ALLOWED_KEYS.has(key))) return null;
  if (candidate.event !== 'auth_validation') return null;
  if (!isSafeString(candidate.correlationId) || !UUID_PATTERN.test(candidate.correlationId)) return null;
  if (!['proxy', 'route'].includes(candidate.boundary)) return null;
  if (
    !isSafeString(candidate.pathname) ||
    candidate.pathname.length > 256 ||
    !PATHNAME_PATTERN.test(candidate.pathname)
  ) return null;
  if (!['getClaims', 'getUser'].includes(candidate.authMethod)) return null;
  if (!['authenticated', 'unauthenticated', 'error'].includes(candidate.authStatus)) return null;
  if (
    candidate.authErrorCode !== undefined &&
    (!isSafeString(candidate.authErrorCode) || !ERROR_CODE_PATTERN.test(candidate.authErrorCode))
  ) return null;
  if (candidate.refreshed !== undefined && typeof candidate.refreshed !== 'boolean') return null;

  const sanitized = {
    event: 'auth_validation',
    correlationId: candidate.correlationId,
    boundary: candidate.boundary,
    pathname: candidate.pathname,
    authMethod: candidate.authMethod,
    authStatus: candidate.authStatus,
  };
  if (candidate.authErrorCode !== undefined) {
    sanitized.authErrorCode = candidate.authErrorCode;
  }
  if (candidate.refreshed !== undefined) {
    sanitized.refreshed = candidate.refreshed;
  }
  return sanitized;
}

export function sanitizeAuthMetricLine(line) {
  const jsonStart = line.indexOf('{');
  const jsonEnd = line.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;

  try {
    return sanitizeAuthMetric(JSON.parse(line.slice(jsonStart, jsonEnd + 1)));
  } catch {
    return null;
  }
}
