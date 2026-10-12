// src/lib/messaging/outbox/outbox-metrics.ts
// Phase 5 T19 (FR-027, FR-028): the outbox's metric events, recorded at its
// trace points (message-outbox.ts, outbox-sign-out.ts) — send latency from
// the original press (kept by a manual retry, FR-009), time waited in the
// outbox before the successful dispatch, and every outcome by reason. Only
// closed enums and durations leave here (no key, conversation, or text).
//
// Explicit mapping of the outbox's outcomes onto the contract's reasons (the
// T6 enums have no separate value for these):
// - a 401 while the client still holds a session (retried, BR-005) and a
//   fence answered 401 -> `session_ended` (the server refused the request's
//   session);
// - a definitive 4xx without a specific reason (`rejected`) -> `invalid_request`;
// - no answer: the request's own deadline -> `timeout`; aborted because
//   connectivity returned, or failed while the browser is offline ->
//   `offline`; any other network failure -> `network_error`;
// - 5xx and any answer that confirms nothing -> `server_error`;
// - 409 ATTEMPT_SUPERSEDED (a newer attempt of the key exists, possibly in
//   another tab) is not an outcome of the send and is not recorded; a claim
//   taken over after its lease ended is recorded by the tab that takes it
//   over, through that tab's own outcome.
import type { MessagingSendOutcomeReason } from '@/lib/messaging/metrics-contract';
import { metricDurationMs, recordMessagingMetric } from '@/lib/messaging/metrics-recorder';
import type { OutboxFailureReason, OutboxItem } from '@/types/message-outbox';
import type { OutboxAttemptOutcome, OutboxRequestFailure } from './outbox-outcome';

const FAILURE_REASONS: Record<OutboxFailureReason, MessagingSendOutcomeReason> = {
  not_participant: 'lost_access',
  sender_mismatch: 'sender_mismatch',
  client_message_id_reused: 'key_reused',
  content_too_large: 'content_too_large',
  invalid_request: 'invalid_request',
  rejected: 'invalid_request',
};

const REQUEST_FAILURE_REASONS: Record<OutboxRequestFailure, MessagingSendOutcomeReason> = {
  timeout: 'timeout',
  offline: 'offline',
  network: 'network_error',
};

/** The contract reason of an attempt's outcome, or null when it is not a send outcome (superseded). */
export function sendOutcomeReason(outcome: OutboxAttemptOutcome): MessagingSendOutcomeReason | null {
  switch (outcome.kind) {
    case 'delivered':
      return 'delivered';
    case 'expired':
      return 'expired';
    case 'superseded':
      return null;
    case 'failed':
      return FAILURE_REASONS[outcome.reason];
    case 'transient':
    case 'unknown': {
      const { status } = outcome;
      if (status === null) return REQUEST_FAILURE_REASONS[(outcome.kind === 'unknown' && outcome.failure) || 'network'];
      if (status === 429) return 'rate_limited';
      if (status === 401) return 'session_ended';
      if (status === 409) return null;
      return 'server_error';
    }
  }
}

function recordOutcome(reason: MessagingSendOutcomeReason): void {
  recordMessagingMetric({ type: 'send_outcome', reason });
}

/**
 * One answered (or failed) attempt of `item` in this tab. Delivered: also its
 * latency from the original press to the confirmation (`confirmedAt`) and its
 * wait in the outbox until the dispatch that succeeded (`dispatchedAt`).
 */
export function recordAttemptMetrics(
  item: OutboxItem,
  outcome: OutboxAttemptOutcome,
  dispatchedAt: number,
  confirmedAt: number
): void {
  const reason = sendOutcomeReason(outcome);
  if (reason === null) return;
  if (reason === 'delivered') {
    recordDeliveredMetrics(item, confirmedAt, dispatchedAt);
    return;
  }
  recordOutcome(reason);
}

/**
 * `item` was confirmed at `confirmedAt` (a create/fence answer, or its stored
 * message observed in the feed); `dispatchedAt` is null when the dispatch
 * that stored it is not known here.
 */
export function recordDeliveredMetrics(item: OutboxItem, confirmedAt: number, dispatchedAt: number | null): void {
  const latency = metricDurationMs(item.pressedSendAt, confirmedAt);
  if (latency !== null) recordMessagingMetric({ type: 'send_latency', durationMs: latency });
  const wait = dispatchedAt === null ? null : metricDurationMs(item.pressedSendAt, dispatchedAt);
  if (wait !== null) recordMessagingMetric({ type: 'outbox_wait', durationMs: wait });
  recordOutcome('delivered');
}

/** A send queued while the browser is offline (FR-001): its immediate outcome. */
export function recordQueuedOfflineMetric(): void {
  recordOutcome('offline');
}

/** Unsent items removed by the user: "Cancelar" (one) or "Sair mesmo" (`count`). */
export function recordCancelledMetrics(count = 1): void {
  const recorded = Math.min(Math.max(0, Math.floor(count)), 50);
  for (let index = 0; index < recorded; index += 1) recordOutcome('cancelled');
}
