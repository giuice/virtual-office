// src/lib/messaging/stream-metrics.ts
// Phase 5 T19 (FR-027): drops, recoveries and outage durations of every
// messaging Realtime stream (messages, list, typing), derived from this
// tab's stream health store (T13, realtime-health.ts) — read only, nothing
// in the streams' lifecycle changes.
//
// An outage episode of a stream starts with its first failure after being
// healthy (or after starting): one `<stream>_stream_drop` with the failure's
// reason. It ends when the stream is SUBSCRIBED again: one
// `<stream>_stream_recovery` with the outage duration (from when the stream
// became unhealthy) and the number of failures (rejoin attempts) in it. A
// stream that stops during an outage (signed out, conversation closed,
// access lost) ends its episode without a recovery event.
import type { MessagingStreamDropReason, MessagingMetricType } from '@/lib/messaging/metrics-contract';
import { metricCount, metricDurationMs, recordMessagingMetric } from '@/lib/messaging/metrics-recorder';
import type {
  MessagingRealtimeHealth,
  MessagingRealtimeStream,
  MessagingStreamHealth,
} from '@/lib/messaging/realtime-health';

const STREAMS: readonly MessagingRealtimeStream[] = ['messages', 'list', 'typing'];

const DROP_TYPE: Record<MessagingRealtimeStream, MessagingMetricType> = {
  messages: 'messages_stream_drop',
  list: 'list_stream_drop',
  typing: 'typing_stream_drop',
};

const RECOVERY_TYPE: Record<MessagingRealtimeStream, MessagingMetricType> = {
  messages: 'messages_stream_recovery',
  list: 'list_stream_recovery',
  typing: 'typing_stream_recovery',
};

function dropReason(status: string | null): MessagingStreamDropReason {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (status === 'TIMED_OUT') return 'timeout';
  if (status === 'CLOSED') return 'closed';
  return 'error';
}

const failed = (entry: MessagingStreamHealth): boolean => !entry.healthy && entry.failures > 0;

/** Records stream drop/recovery metrics while subscribed to `health`; returns the unsubscribe function. */
export function observeStreamHealthMetrics(health: MessagingRealtimeHealth): () => void {
  /** Open outage episodes: since when the stream has been unhealthy. */
  const outages = new Map<MessagingRealtimeStream, number>();

  const check = () => {
    try {
      const snapshot = health.getSnapshot();
      for (const stream of STREAMS) {
        const entry = snapshot[stream];
        const since = outages.get(stream);
        if (!entry) {
          outages.delete(stream);
        } else if (since === undefined && failed(entry)) {
          outages.set(stream, entry.unhealthySince ?? Date.now());
          recordMessagingMetric({ type: DROP_TYPE[stream], reason: dropReason(entry.status) });
        } else if (since !== undefined && entry.healthy) {
          outages.delete(stream);
          const durationMs = metricDurationMs(since, Date.now());
          if (durationMs !== null) {
            recordMessagingMetric({ type: RECOVERY_TYPE[stream], durationMs, count: metricCount(entry.failures) });
          }
        }
      }
    } catch {
      // Metrics never affect messaging.
    }
  };

  check();
  return health.subscribe(check);
}
