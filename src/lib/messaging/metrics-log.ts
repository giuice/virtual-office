import 'server-only';

import packageJson from '../../../package.json';
import {
  MESSAGING_METRIC_CONVERSATION_TYPES,
  MESSAGING_METRIC_TYPES,
  MESSAGING_METRIC_TYPE_RULES,
  MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS,
  MESSAGING_METRICS_MAX_CLOCK_SKEW_MS,
  MESSAGING_METRICS_MAX_COUNT,
  messagingMetricsMaxDurationMs,
  type MessagingMetricConversationType,
  type MessagingMetricReason,
  type MessagingMetricType,
} from '@/lib/messaging/metrics-contract';

/**
 * One metric log line (BR-013): closed-enum event type and reason, bounded
 * duration/count, conversation type, timestamps, and the server-derived app
 * version — and nothing else (no tag field). Built only from validated
 * values, never from client strings.
 */
export interface MessagingMetricLogLine {
  /** Server receive time (ISO 8601). */
  ts: string;
  appVersion: string;
  type: MessagingMetricType;
  reason?: MessagingMetricReason;
  conversationType?: MessagingMetricConversationType;
  durationMs?: number;
  count?: number;
  /** Client event time (ISO 8601), only when within the accepted window. */
  occurredAt?: string;
}

const VERSION_PATTERN = /^[0-9A-Za-z.-]{1,32}$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * App version derived on the server only: the package version plus the
 * deployment's git commit (Vercel system variable VERCEL_GIT_COMMIT_SHA,
 * first 12 hex chars) or `local` when the server runs outside a deployment.
 * Any client-supplied version is ignored.
 */
export function serverAppVersion(): string {
  const version = typeof packageJson.version === 'string' && VERSION_PATTERN.test(packageJson.version)
    ? packageJson.version
    : 'unknown';
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const build = typeof sha === 'string' && COMMIT_SHA_PATTERN.test(sha) ? sha.slice(0, 12).toLowerCase() : 'local';
  return `${version}+${build}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function isBoundedInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

/**
 * Validates one client event against the closed contract and returns its log
 * line, or null when the event must be dropped: not an object, unknown type,
 * a missing required field, or ANY known field present with an invalid value
 * (wrong enum, wrong type, out of range, or not allowed for its type).
 * Unknown fields are ignored and never copied.
 */
export function toMessagingMetricLogLine(
  input: unknown,
  context: { now: number; appVersion: string },
): MessagingMetricLogLine | null {
  if (!isRecord(input) || !isOneOf(MESSAGING_METRIC_TYPES, input.type)) {
    return null;
  }
  const type = input.type;
  const rule = MESSAGING_METRIC_TYPE_RULES[type];
  const line: MessagingMetricLogLine = {
    ts: new Date(context.now).toISOString(),
    appVersion: context.appVersion,
    type,
  };

  if (input.reason !== undefined) {
    if (!rule.reasons || !isOneOf(rule.reasons, input.reason)) return null;
    line.reason = input.reason;
  } else if (rule.reasonRequired) {
    return null;
  }

  if (input.conversationType !== undefined) {
    if (!rule.allowsConversationType || !isOneOf(MESSAGING_METRIC_CONVERSATION_TYPES, input.conversationType)) {
      return null;
    }
    line.conversationType = input.conversationType;
  }

  if (input.durationMs !== undefined) {
    if (!rule.allowsDuration || !isBoundedInteger(input.durationMs, messagingMetricsMaxDurationMs(context.now))) return null;
    line.durationMs = input.durationMs;
  } else if (rule.durationRequired) {
    return null;
  }

  if (input.count !== undefined) {
    if (!rule.allowsCount || !isBoundedInteger(input.count, MESSAGING_METRICS_MAX_COUNT)) return null;
    line.count = input.count;
  }

  if (input.occurredAt !== undefined) {
    const occurredAt = input.occurredAt;
    if (
      typeof occurredAt !== 'number' ||
      !Number.isSafeInteger(occurredAt) ||
      occurredAt < MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS ||
      occurredAt > context.now + MESSAGING_METRICS_MAX_CLOCK_SKEW_MS
    ) {
      return null;
    }
    line.occurredAt = new Date(occurredAt).toISOString();
  }

  return line;
}

/** Writes one structured line per accepted event; logging never fails the request. */
export function writeMessagingMetricLines(lines: readonly MessagingMetricLogLine[]): void {
  for (const line of lines) {
    try {
      console.info(JSON.stringify(line));
    } catch {
      // Observability is never part of the response path.
    }
  }
}

export type BoundedBodyResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'too_large' | 'unreadable' };

/**
 * Reads the raw request body, refusing it as soon as more than `maxBytes`
 * arrive. A declared Content-Length over the limit is refused without
 * reading, but the limit is always enforced on the bytes actually received,
 * so a missing (chunked) or understated Content-Length cannot bypass it.
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBodyResult> {
  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared.trim()) > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    return { ok: false, reason: 'too_large' };
  }
  if (!request.body) {
    return { ok: true, bytes: new Uint8Array(0) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}
