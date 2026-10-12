// Messaging health metrics wire contract (Phase 5 FR-027, BR-013, AC-028).
//
// Shared by the client recorder and POST /api/messages/metrics. Everything a
// metric can carry is a closed enum or a bounded integer: the route copies
// only these fields, drops any event with an unknown type or an invalid known
// field, ignores every other field, and adds the server time and the
// server-derived app version itself. A log line carries exactly the BR-013
// fields: ts, appVersion, type, and the optional reason, conversationType,
// durationMs, count, occurredAt (no tag field; a metric line is the JSON
// object with an `appVersion` and a `type` from MESSAGING_METRIC_TYPES).
// No identifier, name, text, or other free-form value can reach a log line.

/** Route path of the metrics sink. */
export const MESSAGING_METRICS_PATH = '/api/messages/metrics';

/** At most this many events per request (larger batches are rejected, 413). */
export const MESSAGING_METRICS_MAX_EVENTS = 50;

/** At most this many bytes of raw request body (larger bodies are rejected, 413). */
export const MESSAGING_METRICS_MAX_BYTES = 16 * 1024;

/**
 * Earliest accepted client time (2026-01-01T00:00:00Z) — a chosen accepted-
 * clock policy, not a guarantee about browsers: the Phase 5 client ships
 * after it, so a correct clock never reports an earlier send or episode. A
 * backward-dated event (e.g. from a client clock set back before this date:
 * an `occurredAt` earlier than it, or a duration longer than the time since
 * it plus the tolerated skew) is dropped whole.
 */
export const MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS = Date.UTC(2026, 0, 1);

/** Tolerated lead of the client clock over the server clock. */
export const MESSAGING_METRICS_MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Upper bound of `durationMs` at server time `now` (epoch ms): the longest
 * interval that can start at or after the earliest supported time and end by
 * `now` plus the tolerated clock skew. There is deliberately no fixed ceiling
 * such as 30 days: an expired item retried manually keeps its original send
 * time (FR-009), so its send latency grows with however long the user waited.
 * A safe integer for any real clock.
 */
export function messagingMetricsMaxDurationMs(now: number): number {
  return Math.max(0, now + MESSAGING_METRICS_MAX_CLOCK_SKEW_MS - MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS);
}

/** Upper bound of `count`. */
export const MESSAGING_METRICS_MAX_COUNT = 10_000;

export const MESSAGING_METRIC_TYPES = [
  // Press → server confirmed (from the original press, also after a manual retry).
  'send_latency',
  // Time an item waited in the outbox before its successful dispatch.
  'outbox_wait',
  // Outcome of a send, by reason.
  'send_outcome',
  // Realtime stream health; the stream is part of the event type.
  'messages_stream_drop',
  'messages_stream_recovery',
  'list_stream_drop',
  'list_stream_recovery',
  'typing_stream_drop',
  'typing_stream_recovery',
  // Polling fallback episodes.
  'polling_start',
  'polling_stop',
] as const;

export type MessagingMetricType = (typeof MESSAGING_METRIC_TYPES)[number];

export const MESSAGING_SEND_OUTCOME_REASONS = [
  'delivered',
  'offline',
  'network_error',
  'timeout',
  'rate_limited',
  'server_error',
  'lost_access',
  'expired',
  'invalid_request',
  'content_too_large',
  'key_reused',
  'sender_mismatch',
  'session_ended',
  'cancelled',
] as const;

export type MessagingSendOutcomeReason = (typeof MESSAGING_SEND_OUTCOME_REASONS)[number];

export const MESSAGING_STREAM_DROP_REASONS = ['error', 'timeout', 'closed', 'offline'] as const;

export type MessagingStreamDropReason = (typeof MESSAGING_STREAM_DROP_REASONS)[number];

export const MESSAGING_METRIC_CONVERSATION_TYPES = ['direct', 'group', 'room'] as const;

export type MessagingMetricConversationType = (typeof MESSAGING_METRIC_CONVERSATION_TYPES)[number];

export type MessagingMetricReason = MessagingSendOutcomeReason | MessagingStreamDropReason;

/** Field rules of one event type: required fields must be present and valid. */
export interface MessagingMetricTypeRule {
  readonly reasons: readonly MessagingMetricReason[] | null;
  readonly reasonRequired: boolean;
  readonly durationRequired: boolean;
  readonly allowsDuration: boolean;
  readonly allowsCount: boolean;
  readonly allowsConversationType: boolean;
}

const SEND_DURATION: MessagingMetricTypeRule = {
  reasons: null,
  reasonRequired: false,
  durationRequired: true,
  allowsDuration: true,
  allowsCount: false,
  allowsConversationType: true,
};

const STREAM_DROP = (allowsConversationType: boolean): MessagingMetricTypeRule => ({
  reasons: MESSAGING_STREAM_DROP_REASONS,
  reasonRequired: true,
  durationRequired: false,
  allowsDuration: false,
  allowsCount: false,
  allowsConversationType,
});

const STREAM_RECOVERY = (allowsConversationType: boolean): MessagingMetricTypeRule => ({
  // durationMs = outage duration; count = rejoin attempts.
  reasons: null,
  reasonRequired: false,
  durationRequired: true,
  allowsDuration: true,
  allowsCount: true,
  allowsConversationType,
});

export const MESSAGING_METRIC_TYPE_RULES: Readonly<Record<MessagingMetricType, MessagingMetricTypeRule>> = {
  send_latency: SEND_DURATION,
  outbox_wait: SEND_DURATION,
  send_outcome: {
    reasons: MESSAGING_SEND_OUTCOME_REASONS,
    reasonRequired: true,
    durationRequired: false,
    allowsDuration: false,
    allowsCount: false,
    allowsConversationType: true,
  },
  messages_stream_drop: STREAM_DROP(true),
  messages_stream_recovery: STREAM_RECOVERY(true),
  list_stream_drop: STREAM_DROP(false),
  list_stream_recovery: STREAM_RECOVERY(false),
  typing_stream_drop: STREAM_DROP(true),
  typing_stream_recovery: STREAM_RECOVERY(true),
  polling_start: {
    reasons: null,
    reasonRequired: false,
    durationRequired: false,
    allowsDuration: false,
    allowsCount: false,
    allowsConversationType: true,
  },
  polling_stop: {
    // durationMs = polling episode duration; count = polling cycles.
    reasons: null,
    reasonRequired: false,
    durationRequired: true,
    allowsDuration: true,
    allowsCount: true,
    allowsConversationType: true,
  },
};

/** One event as the client sends it (`{ events: MessagingMetricEventInput[] }`). */
export interface MessagingMetricEventInput {
  type: MessagingMetricType;
  reason?: MessagingMetricReason;
  conversationType?: MessagingMetricConversationType;
  /** Non-negative integer milliseconds, at most messagingMetricsMaxDurationMs(server now). */
  durationMs?: number;
  /** Non-negative integer, at most MESSAGING_METRICS_MAX_COUNT. */
  count?: number;
  /**
   * Client epoch milliseconds of the event (integer), from
   * MESSAGING_METRICS_EARLIEST_EVENT_TIME_MS to server now + MESSAGING_METRICS_MAX_CLOCK_SKEW_MS.
   */
  occurredAt?: number;
}

/** Request body of POST /api/messages/metrics. */
export interface MessagingMetricsRequest {
  events: MessagingMetricEventInput[];
}

/** 202 response body. */
export interface MessagingMetricsResponse {
  accepted: number;
  dropped: number;
}
