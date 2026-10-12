// src/lib/messaging/metrics-recorder.ts
// Phase 5 T19 (FR-027, FR-028, BR-013, AC-028, AC-029): the client half of
// the messaging health metrics. Messaging code records events here
// synchronously and never waits for them; this tab delivers them, fire and
// forget, to POST /api/messages/metrics (T6, metrics-contract.ts).
//
// - Bounded buffer: at most MAX_BUFFERED_EVENTS events; when full the oldest
//   one is dropped for each new one.
// - Batches: at most MESSAGING_METRICS_MAX_EVENTS events and
//   MESSAGING_METRICS_MAX_BYTES bytes of JSON body each; the events of a
//   batch leave the buffer when it is sent and are never sent again, whatever
//   the answer (dropped under overload, never retried).
// - At most one request in flight per tab, aborted after REQUEST_TIMEOUT_MS.
//   Requests start at least MIN_REQUEST_INTERVAL_MS apart (the route's budget
//   is 30 requests per minute per user, shared by the user's tabs); after a
//   failure (error status, no answer, abort) the next one waits
//   FAILURE_PAUSE_MS, after a 429 OVERLOAD_PAUSE_MS (one budget window).
// - Never throws into its caller, never logs an error, never shows anything:
//   every failure only drops the batch (debug traces when messaging debug is on).
// - Events carry only the contract's closed enums and bounded integers (no
//   identifiers, names, text, or client times: the server stamps `ts`).
// - Identity: delivery runs only while a user is active (MessagingContext,
//   users.id). Events recorded while no user is active wait in the buffer for
//   the same user; activating another user empties the buffer first.
import {
  MESSAGING_METRICS_MAX_BYTES,
  MESSAGING_METRICS_MAX_COUNT,
  MESSAGING_METRICS_MAX_EVENTS,
  MESSAGING_METRICS_PATH,
  type MessagingMetricEventInput,
} from '@/lib/messaging/metrics-contract';
import { debugLogger } from '@/utils/debug-logger';

/** Most events kept waiting for delivery in this tab (oldest dropped first). */
export const MESSAGING_METRICS_MAX_BUFFERED_EVENTS = 100;
/** A request still unanswered after this long is aborted and its batch dropped. */
export const MESSAGING_METRICS_REQUEST_TIMEOUT_MS = 5_000;
/** Events are gathered this long after the first one waiting before a batch is sent. */
const FLUSH_DELAY_MS = 5_000;
/** Least time between the starts of two requests of this tab (≤ 6 per minute). */
const MIN_REQUEST_INTERVAL_MS = 10_000;
/** After a failed or aborted request. */
const FAILURE_PAUSE_MS = 15_000;
/** After a 429: the route's budget window. */
const OVERLOAD_PAUSE_MS = 60_000;
const SCOPE = 'MessagingMetrics';

/**
 * Scheduling clock: monotonic, so a wall-clock jump (a corrected or changed
 * system time) neither stalls delivery nor bursts it.
 */
const monotonicNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const byteLength = (text: string): number => (encoder ? encoder.encode(text).byteLength : text.length * 3);

const tracing = (): boolean => {
  try {
    return debugLogger.messaging.enabled();
  } catch {
    return false;
  }
};

const trace = (event: string, details: Record<string, unknown>): void => {
  if (tracing()) debugLogger.messaging.event(SCOPE, event, details);
};

/** A non-negative integer duration (ms) of an interval, or null when the clock makes it meaningless. */
export function metricDurationMs(from: number, to: number): number | null {
  const duration = Math.round(to - from);
  return Number.isSafeInteger(duration) && duration >= 0 ? duration : null;
}

/** A count clamped to the contract's bound. */
export const metricCount = (count: number): number =>
  Math.min(MESSAGING_METRICS_MAX_COUNT, Math.max(0, Math.floor(Number.isFinite(count) ? count : 0)));

class MessagingMetricsRecorder {
  private buffer: MessagingMetricEventInput[] = [];
  private dropped = 0;
  /** Whose events the buffer holds (the last activated user). */
  private bufferOwner: string | null = null;
  /** Delivery runs only while that user is active. */
  private active = false;
  private inFlight = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** When the oldest event still waiting arrived (the batch is gathered from then). */
  private waitingSince: number | null = null;
  /** No request starts before this time. */
  private nextRequestAt = 0;

  record(event: MessagingMetricEventInput): void {
    this.buffer.push(event);
    if (this.buffer.length > MESSAGING_METRICS_MAX_BUFFERED_EVENTS) {
      const excess = this.buffer.length - MESSAGING_METRICS_MAX_BUFFERED_EVENTS;
      this.buffer.splice(0, excess);
      this.dropped += excess;
    }
    if (this.waitingSince === null) this.waitingSince = monotonicNow();
    trace('recorded', { type: event.type, buffered: this.buffer.length, dropped: this.dropped });
    this.schedule();
  }

  /** Delivery runs for `userId` (users.id) until deactivated; another user's events are discarded first. */
  activate(userId: string): void {
    if (this.bufferOwner !== null && this.bufferOwner !== userId) {
      this.clearTimer();
      if (this.buffer.length > 0) trace('discarded', { buffered: this.buffer.length });
      this.buffer = [];
      this.waitingSince = null;
    }
    this.bufferOwner = userId;
    this.active = true;
    this.schedule();
  }

  deactivate(userId: string): void {
    if (this.bufferOwner !== userId) return;
    this.active = false;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (!this.active || this.inFlight || this.timer || this.buffer.length === 0) return;
    const now = monotonicNow();
    const gathered = this.buffer.length >= MESSAGING_METRICS_MAX_EVENTS ? now : (this.waitingSince ?? now) + FLUSH_DELAY_MS;
    const delay = Math.max(0, this.nextRequestAt - now, gathered - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, delay);
  }

  /** Takes the oldest events that fit one batch (by count and body size) out of the buffer. */
  private takeBatch(): { body: string; size: number } | null {
    let count = 0;
    let body = '';
    const most = Math.min(this.buffer.length, MESSAGING_METRICS_MAX_EVENTS);
    for (let size = 1; size <= most; size += 1) {
      const candidate = JSON.stringify({ events: this.buffer.slice(0, size) });
      if (byteLength(candidate) > MESSAGING_METRICS_MAX_BYTES) break;
      body = candidate;
      count = size;
    }
    if (count === 0) {
      // An event that cannot fit any batch (never with the contract's fields) is dropped.
      this.buffer.shift();
      this.dropped += 1;
      return null;
    }
    this.buffer.splice(0, count);
    this.waitingSince = this.buffer.length > 0 ? monotonicNow() : null;
    return { body, size: count };
  }

  private flush(): void {
    if (!this.active || this.inFlight || this.buffer.length === 0) return;
    if (typeof fetch !== 'function') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Offline: the batch would only fail; checked again later.
      this.pause(monotonicNow() + FLUSH_DELAY_MS);
      this.schedule();
      return;
    }
    const batch = this.takeBatch();
    if (!batch) {
      this.schedule();
      return;
    }
    const startedAt = monotonicNow();
    this.inFlight = true;
    this.nextRequestAt = startedAt + MIN_REQUEST_INTERVAL_MS;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const deadline = setTimeout(() => controller?.abort(), MESSAGING_METRICS_REQUEST_TIMEOUT_MS);
    trace('send', { events: batch.size, buffered: this.buffer.length, dropped: this.dropped });
    let request: Promise<Response>;
    try {
      request = fetch(MESSAGING_METRICS_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: batch.body,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller?.signal,
      });
    } catch {
      request = Promise.reject(new Error('fetch failed'));
    }
    request
      .then((response) => {
        const status = response.status;
        // The body is never needed; release the connection.
        void response.body?.cancel().catch(() => undefined);
        if (status === 429) {
          this.pause(startedAt + OVERLOAD_PAUSE_MS);
        } else if (status < 200 || status >= 300) {
          this.pause(monotonicNow() + FAILURE_PAUSE_MS);
        }
        trace('sent', { status, events: batch.size });
      })
      .catch((error: unknown) => {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        this.pause(monotonicNow() + FAILURE_PAUSE_MS);
        trace('send-failed', { aborted, events: batch.size, elapsedMs: Math.round(monotonicNow() - startedAt) });
      })
      .finally(() => {
        clearTimeout(deadline);
        this.inFlight = false;
        this.schedule();
      });
  }

  private pause(until: number): void {
    this.nextRequestAt = Math.max(this.nextRequestAt, until);
  }
}

let recorder: MessagingMetricsRecorder | null = null;

const currentRecorder = (): MessagingMetricsRecorder | null => {
  if (typeof window === 'undefined') return null;
  recorder ??= new MessagingMetricsRecorder();
  return recorder;
};

/**
 * Records one metric event of this tab (FR-027). Synchronous, never throws,
 * never waits for delivery (FR-028).
 */
export function recordMessagingMetric(event: MessagingMetricEventInput): void {
  try {
    currentRecorder()?.record(event);
  } catch {
    // Metrics never affect messaging.
  }
}

/**
 * Delivers this tab's metrics while `userId` (users.id) is the messaging
 * user; returns the function that stops delivery for that user.
 */
export function activateMessagingMetrics(userId: string): () => void {
  try {
    currentRecorder()?.activate(userId);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      currentRecorder()?.deactivate(userId);
    } catch {
      // Metrics never affect messaging.
    }
  };
}
