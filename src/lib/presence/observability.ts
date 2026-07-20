/**
 * Redacted, one-line Presence observability contract.
 *
 * This formatter deliberately copies only the fields declared below. Callers
 * may never pass raw errors, request bodies, JWTs, auth-session IDs, emails,
 * display names, or service credentials to the log sink.
 */

export type PresenceEventCategory =
  | 'location'
  | 'session'
  | 'knock'
  | 'snapshot'
  | 'realtime';

export interface PresenceObservabilityEvent {
  readonly category: PresenceEventCategory;
  readonly action: string;
  readonly resultCode: string;
  readonly occurredAt?: string;
  readonly correlationId?: string | null;
  readonly durationMs?: number | null;
  readonly retryable?: boolean | null;
  readonly transitionId?: string | null;
  readonly appUserId?: string | null;
  /** Server-issued browser-tab lease ID. Never the Supabase auth-session ID. */
  readonly presenceSessionId?: string | null;
  readonly companyId?: string | null;
  readonly reason?: string | null;
  readonly previousSpaceId?: string | null;
  readonly targetSpaceId?: string | null;
  readonly resultSpaceId?: string | null;
  readonly expectedLocationVersion?: number | null;
  readonly previousLocationVersion?: number | null;
  readonly resultLocationVersion?: number | null;
  readonly idempotentReplay?: boolean | null;
  readonly authorizationMode?: 'public' | 'direct' | 'rejoin' | 'knock' | null;
  readonly activeSessionCount?: number | null;
  readonly requestId?: string | null;
  readonly requesterUserId?: string | null;
  readonly responderUserId?: string | null;
  readonly spaceId?: string | null;
  readonly stateTransition?: string | null;
  readonly requesterLocationVersionBefore?: number | null;
  readonly requesterLocationVersionAfter?: number | null;
  readonly requesterAccessRevision?: number | null;
  readonly responderAccessRevision?: number | null;
  readonly spaceAccessRevision?: number | null;
  readonly expiryResult?: 'live' | 'expired' | 'terminal' | 'usable' | 'unusable' | 'unknown' | null;
  readonly consumeResult?:
    | 'consumed'
    | 'not-consumed'
    | 'already-consumed'
    | 'expired'
    | 'superseded'
    | 'invalid'
    | 'not-ready'
    | 'unknown'
    | null;
}

type SafePresenceLogValue = string | number | boolean | null;
type SafePresenceLogEntry = Record<string, SafePresenceLogValue>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_.:/ -]{1,96}$/;

const UUID_FIELDS = [
  'correlationId',
  'transitionId',
  'appUserId',
  'presenceSessionId',
  'companyId',
  'previousSpaceId',
  'targetSpaceId',
  'resultSpaceId',
  'requestId',
  'requesterUserId',
  'responderUserId',
  'spaceId',
] as const satisfies readonly (keyof PresenceObservabilityEvent)[];

const INTEGER_FIELDS = [
  'durationMs',
  'expectedLocationVersion',
  'previousLocationVersion',
  'resultLocationVersion',
  'activeSessionCount',
  'requesterLocationVersionBefore',
  'requesterLocationVersionAfter',
  'requesterAccessRevision',
  'responderAccessRevision',
  'spaceAccessRevision',
] as const satisfies readonly (keyof PresenceObservabilityEvent)[];

const TOKEN_FIELDS = [
  'action',
  'resultCode',
  'reason',
  'authorizationMode',
  'stateTransition',
  'expiryResult',
  'consumeResult',
] as const satisfies readonly (keyof PresenceObservabilityEvent)[];

function safeIsoTimestamp(value: string | undefined): string {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function copyUuid(
  target: SafePresenceLogEntry,
  key: (typeof UUID_FIELDS)[number],
  value: unknown,
): void {
  if (value === null) {
    target[key] = null;
  } else if (typeof value === 'string' && UUID_PATTERN.test(value)) {
    target[key] = value.toLowerCase();
  }
}

function copyInteger(
  target: SafePresenceLogEntry,
  key: (typeof INTEGER_FIELDS)[number],
  value: unknown,
): void {
  if (value === null) {
    target[key] = null;
  } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    target[key] = value;
  }
}

function copyToken(
  target: SafePresenceLogEntry,
  key: (typeof TOKEN_FIELDS)[number],
  value: unknown,
): void {
  if (value === null) {
    target[key] = null;
  } else if (typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value)) {
    target[key] = value;
  }
}

export function toSafePresenceLogEntry(event: PresenceObservabilityEvent): SafePresenceLogEntry {
  const entry: SafePresenceLogEntry = {
    schema: 'presence-observability-v1',
    occurredAt: safeIsoTimestamp(event.occurredAt),
    category: event.category,
  };

  for (const key of TOKEN_FIELDS) copyToken(entry, key, event[key]);
  for (const key of UUID_FIELDS) copyUuid(entry, key, event[key]);
  for (const key of INTEGER_FIELDS) copyInteger(entry, key, event[key]);

  if (typeof event.retryable === 'boolean') entry.retryable = event.retryable;
  if (event.retryable === null) entry.retryable = null;
  if (typeof event.idempotentReplay === 'boolean') {
    entry.idempotentReplay = event.idempotentReplay;
  }
  if (event.idempotentReplay === null) entry.idempotentReplay = null;

  return entry;
}

export function formatPresenceEvent(event: PresenceObservabilityEvent): string {
  return JSON.stringify(toSafePresenceLogEntry(event));
}

export function emitPresenceEvent(
  event: PresenceObservabilityEvent,
  sink?: (line: string) => void,
): void {
  if (!sink && process.env.NODE_ENV === 'test') return;
  try {
    (sink ?? console.info)(formatPresenceEvent(event));
  } catch {
    // Observability is never part of the mutation/response control path. A
    // broken console or future adapter must not turn a committed operation
    // into an HTTP failure and retry.
  }
}
