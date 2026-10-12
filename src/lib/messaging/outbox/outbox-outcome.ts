// src/lib/messaging/outbox/outbox-outcome.ts
// Phase 5 T8: outcome classes of one outbox attempt (BR-005).
import type { Message } from '@/types/messaging';
import type { OutboxFailureReason } from '@/types/message-outbox';
import { parseStoredMessage, type AttemptedItem } from './outbox-ack';

export type { AttemptedItem } from './outbox-ack';

/**
 * T19: why a create or fence got no answer — its own deadline (`timeout`),
 * aborted because connectivity returned or failed while the browser is
 * offline (`offline`), or any other network failure (`network`). Metrics only.
 */
export type OutboxRequestFailure = 'timeout' | 'offline' | 'network';

export type OutboxAttemptOutcome =
  /** Stored (201) or replayed (200); `message` is null when it was deleted since (410). */
  | { kind: 'delivered'; message: Message | null }
  /** 429 / 401: retried automatically, in order (FR-008; 401 vs session end → T11). */
  | { kind: 'transient'; status: number }
  /**
   * No usable response (network error, 5xx, any 2xx without this item's
   * stored message — e.g. a 204 or a malformed body): it may be stored, so the
   * item is kept and sent again.
   */
  | { kind: 'unknown'; status: number | null; failure?: OutboxRequestFailure }
  /** 409 ATTEMPT_SUPERSEDED: a newer attempt of the key exists; ignored. */
  | { kind: 'superseded' }
  /** Definitive 4xx: no automatic retry (FR-007). */
  | { kind: 'failed'; status: number; reason: OutboxFailureReason }
  /** Fenced as not stored after its 24 h delivery window: never sent automatically (FR-009). */
  | { kind: 'expired' };

/** What a fence (T27, FR-006) says about an item whose earlier attempt may be stored. */
export type OutboxFenceOutcome =
  /** Stored under the key (`message` null when deleted since): the item is delivered. */
  | { kind: 'delivered'; message: Message | null }
  /** Nothing stored, and no older attempt can commit any more. */
  | { kind: 'not_stored' }
  /**
   * Definitive refusal, e.g. 403 NOT_PARTICIPANT after access was lost: the
   * item fails (BR-005) — it is never treated as not stored (no expiry, no
   * cancel, no create).
   */
  | { kind: 'failed'; status: number; reason: OutboxFailureReason }
  /**
   * Still unknown: no response, 5xx, 429/401, a newer generation exists
   * (409 ATTEMPT_SUPERSEDED), or a 200 that is not this item's answer. The
   * item stays unknown and is fenced again later.
   */
  | { kind: 'unknown'; status: number | null; failure?: OutboxRequestFailure };

export function classifyFenceResponse(
  response: { status: number; code?: string; outcome?: string; message?: unknown },
  item: AttemptedItem
): OutboxFenceOutcome {
  const { status, code, outcome, message } = response;
  if (status === 200 && outcome === 'not_stored') return { kind: 'not_stored' };
  if (status === 200 && outcome === 'stored') {
    if (message === null) return { kind: 'delivered', message: null };
    const stored = parseStoredMessage(message, item);
    return stored ? { kind: 'delivered', message: stored } : { kind: 'unknown', status };
  }
  if (status >= 400 && status < 500 && status !== 401 && status !== 429 && status !== 409) {
    return { kind: 'failed', status, reason: failureReason(status, code) };
  }
  return { kind: 'unknown', status };
}

export function classifyAttemptResponse(
  response: { status: number; code?: string; message?: unknown },
  item: AttemptedItem
): OutboxAttemptOutcome {
  const { status, code, message } = response;
  if (status >= 200 && status < 300) {
    // Only 200/201 carrying this item's stored message (outbox-ack) confirm it.
    const stored = status === 200 || status === 201 ? parseStoredMessage(message, item) : null;
    return stored ? { kind: 'delivered', message: stored } : { kind: 'unknown', status };
  }
  if (status === 410 && code === 'MESSAGE_DELETED') return { kind: 'delivered', message: null };
  if (status === 429 || status === 401) return { kind: 'transient', status };
  if (status >= 500 || status < 200 || (status >= 300 && status < 400)) return { kind: 'unknown', status };
  if (status === 409 && code === 'ATTEMPT_SUPERSEDED') return { kind: 'superseded' };
  return { kind: 'failed', status, reason: failureReason(status, code) };
}

function failureReason(status: number, code: string | undefined): OutboxFailureReason {
  if (status === 403 && code === 'SENDER_MISMATCH') return 'sender_mismatch';
  if (status === 403) return 'not_participant';
  if (status === 409 && code === 'CLIENT_MESSAGE_ID_REUSED') return 'client_message_id_reused';
  if (status === 413) return 'content_too_large';
  if (status === 400) return 'invalid_request';
  return 'rejected';
}
