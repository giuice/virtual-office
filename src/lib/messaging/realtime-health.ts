// src/lib/messaging/realtime-health.ts
// Phase 5 T13 (FR-014, FR-015): application-level health and recovery of the
// messaging Realtime streams.
//
// - MessagingRealtimeHealth: one small store of per-stream health (this tab,
//   the signed-in user's messaging provider). Consumers: the drawer's
//   connection banner (T13), polling fallback (T14), typing (T15), metrics
//   (T19). It holds no identity or message data, only channel states.
// - startRecoveringChannel(): the lifecycle of one stream's channel. After an
//   error, a timeout or a terminal closure the channel is left and a new one
//   joined (a new topic each time, or the same RLS-authorized topic for
//   typing) with capped exponential backoff — beyond the SDK's own rejoins,
//   which never follow a CLOSED channel. The stream's own handlers catch up
//   (refetch) when the server confirms the rejoined changes stream;
//   `onRecovered` reports a recovery to the owner. A failure the owner
//   classifies as access loss (a refused private join) stops the stream
//   instead of retrying it (T15).
// Only messaging channels go through here; Presence keeps its own lifecycle
// on the shared socket (the socket is never closed or reconnected here).
import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import { debugLogger } from '@/utils/debug-logger';

export type MessagingRealtimeStream = 'messages' | 'list' | 'typing';

/** The streams whose health the drawer banner follows (FR-014); typing is not required. */
export const REQUIRED_MESSAGING_STREAMS: readonly MessagingRealtimeStream[] = ['messages', 'list'];

export interface MessagingStreamHealth {
  /** Last status of the current channel's subscribe callback; null while its first join is pending. */
  status: string | null;
  /** The current channel is SUBSCRIBED. */
  healthy: boolean;
  /**
   * When the stream stopped being healthy (its start, or its first failure
   * after being healthy); null while healthy.
   */
  unhealthySince: number | null;
  /** Failures since the stream was last stable (they set the backoff). */
  failures: number;
  /** Delay before the latest rejoin attempt (ms); null before any. */
  lastRetryDelayMs: number | null;
  /** Times the stream became healthy again after a failure. */
  recoveries: number;
}

type Listener = () => void;

/**
 * Per-stream health of the messaging Realtime streams of this tab. A stream
 * with no entry is idle (not started: signed out, or its hook inactive).
 */
export class MessagingRealtimeHealth {
  private entries: Partial<Record<MessagingRealtimeStream, MessagingStreamHealth>> = {};
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Immutable snapshot (a new object after every change; use with useSyncExternalStore). */
  getSnapshot = (): Partial<Record<MessagingRealtimeStream, MessagingStreamHealth>> => this.entries;

  get(stream: MessagingRealtimeStream): MessagingStreamHealth | null {
    return this.entries[stream] ?? null;
  }

  /** @internal startRecoveringChannel */
  update(stream: MessagingRealtimeStream, next: MessagingStreamHealth | null): void {
    const entries = { ...this.entries };
    if (next) {
      entries[stream] = next;
    } else {
      delete entries[stream];
    }
    this.entries = entries;
    this.listeners.forEach((listener) => listener());
  }
}

/**
 * Block B fix F3: the stream failed because this tab's shared Realtime socket
 * itself is down (a connectivity loss), not only its channel.
 */
export function isSocketOutage(entry: MessagingStreamHealth | null): boolean {
  return Boolean(entry && !entry.healthy && entry.failures > 0 && !supabase.realtime.isConnected());
}

/** The earliest moment any of `streams` became unhealthy (null when all are healthy or idle). */
export function unhealthySince(
  snapshot: Partial<Record<MessagingRealtimeStream, MessagingStreamHealth>>,
  streams: readonly MessagingRealtimeStream[]
): number | null {
  let earliest: number | null = null;
  for (const stream of streams) {
    const since = snapshot[stream]?.unhealthySince ?? null;
    if (since !== null && (earliest === null || since < earliest)) earliest = since;
  }
  return earliest;
}

/**
 * Whether a postgres_changes payload is a change of `table` (and, when given,
 * of one of `events`). realtime-js routes a channel's postgres_changes to its
 * bindings by the server-assigned binding ids from the join reply; until that
 * reply arrives (a join whose reply was lost or delayed — the server may
 * already stream), every '*' binding receives every change of the channel
 * (RealtimeChannel `_updateFilterMessage`). Handlers therefore check that the
 * payload is their own before using it.
 */
export function isPostgresChangeOf(
  payload: { table?: string; eventType?: string },
  table: string,
  events?: readonly string[]
): boolean {
  return payload.table === table && (events === undefined || events.includes(payload.eventType ?? ''));
}

/**
 * Block B fix F5: when a postgres_changes stream catches up (refetches what
 * it may have missed) after a (re)join. realtime-js routes a change to the
 * specific-event bindings only once the join reply (SUBSCRIBED) installed
 * their binding ids, and the server streams only once it confirmed the
 * stream (`system` postgres_changes ok); the two arrive in either order (a
 * late join reply comes after the confirmation). The catch-up runs once per
 * join, when the second of them arrives — after the window in which a change
 * could be missed — so one recovery fetches once. A failure or stop of the
 * channel, or a new join, starts over.
 */
export interface JoinCatchUp {
  /** A new channel is being joined (call from `bind`). */
  joinStarted(): void;
  /** Every subscribe-callback status of the current channel (pass `onStatus` through). */
  status(status: string | null): void;
  /** The server confirmed the current channel's postgres_changes stream. */
  confirmed(): void;
}

export function createJoinCatchUp(catchUp: () => void): JoinCatchUp {
  let subscribed = false;
  let streamConfirmed = false;
  const reset = () => {
    subscribed = false;
    streamConfirmed = false;
  };
  return {
    joinStarted: reset,
    status(status) {
      if (status !== 'SUBSCRIBED') {
        if (status === null || FAILURE_STATUSES.has(status)) reset();
        return;
      }
      if (subscribed) return;
      subscribed = true;
      if (streamConfirmed) catchUp();
    },
    confirmed() {
      streamConfirmed = true;
      if (subscribed) catchUp();
    },
  };
}

export const REALTIME_RETRY_BASE_MS = 250;
/**
 * Growth of the backoff. 1.5 rather than 2 keeps an attempt within ~0.3 s
 * after a 3 s outage (attempts at 0.25, 0.63, 1.19, 2.03, 3.30 s…), so a
 * Realtime blip that short heals — the join itself takes ~1 s — before the
 * 5 s "Reconectando…" threshold (FR-014); the cap is reached after ~12 s.
 */
export const REALTIME_RETRY_FACTOR = 1.5;
export const REALTIME_RETRY_MAX_MS = 5_000;
/** A channel SUBSCRIBED this long resets the backoff. */
const RETRY_STABLE_AFTER_MS = 30_000;
/** Block B fix F1: while the socket is not connected, a first join checks again this often. */
const SOCKET_WAIT_POLL_MS = 250;
const FAILURE_STATUSES = new Set(['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED']);

export interface RecoveringChannelOptions {
  stream: MessagingRealtimeStream;
  health: MessagingRealtimeHealth;
  /** Debug-trace scope and channel label (`[<scope>:trace] status` is read by the T25 harness). */
  traceScope: string;
  traceChannel: string;
  /**
   * The topic of each join: a new one every time (a left channel's topic is
   * never reused), except where authorization fixes the topic name (typing,
   * T15) — leaving a channel removes it from the client synchronously
   * (Phoenix leave closes at once on the client), so the same name can be
   * joined again right after.
   */
  createTopic: () => string;
  /** Channel options (e.g. `{ config: { private: true } }` for an RLS-authorized topic). */
  channelOptions?: RealtimeChannelOptions;
  /** Adds the stream's bindings; their handlers must do nothing unless `isCurrent()`. */
  bind: (channel: RealtimeChannel, isCurrent: () => boolean) => RealtimeChannel;
  /** Every subscribe-callback status of the current channel (null: stopped). */
  onStatus?: (status: string | null) => void;
  /** The stream is SUBSCRIBED again after a failure (never on its first join). */
  onRecovered?: () => void;
  /**
   * A failure that means the user no longer has access (e.g. the server
   * refused the join of a private topic). The stream then stops — no
   * rejoin, it becomes idle — and `onAccessLost` is called once; any other
   * failure is retried with backoff.
   */
  isAccessLoss?: (status: string, error: Error | undefined) => boolean;
  onAccessLost?: () => void;
}

/**
 * Joins the stream's channel and keeps it joined: after CHANNEL_ERROR,
 * TIMED_OUT or CLOSED the channel is left and a new one joined after
 * min(REALTIME_RETRY_MAX_MS, round(REALTIME_RETRY_BASE_MS · 1.5^(failures − 1))) —
 * unless the socket itself is down, when no channel is joined (an errored one
 * is rejoined by the SDK on reconnect; the first join waits for the socket,
 * block B fix F1); the failure count resets once a channel has
 * been SUBSCRIBED for 30 s. Returns the stop function (leaves the channel;
 * the stream becomes idle).
 */
export function startRecoveringChannel(options: RecoveringChannelOptions): () => void {
  const { stream, health, traceScope, traceChannel } = options;
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let generation = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let state: MessagingStreamHealth = {
    status: null,
    healthy: false,
    unhealthySince: Date.now(),
    failures: 0,
    lastRetryDelayMs: null,
    recoveries: 0,
  };
  /** A failure happened since the stream was last healthy (the next SUBSCRIBED is a recovery). */
  let failedSinceHealthy = false;
  const tracing = () => debugLogger.messaging.enabled();

  const publish = (next: MessagingStreamHealth) => {
    state = next;
    health.update(stream, next);
  };
  publish(state);

  const clearTimers = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = null;
  };

  const retire = (owned: RealtimeChannel) => {
    if (channel === owned) {
      channel = null;
      generation += 1;
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = null;
      if (tracing()) debugLogger.messaging.trace(traceScope, 'unsubscribe', { channel: traceChannel });
    }
    void supabase
      .removeChannel(owned)
      .then((status) => {
        if (status !== 'ok') owned.teardown();
      })
      .catch(() => {
        owned.teardown();
      });
  };

  const join = () => {
    if (stopped) return;
    clearTimers();
    if (channel) retire(channel);
    if (tracing()) {
      debugLogger.messaging.trace(traceScope, 'subscribe:attempt', { channel: traceChannel, failures: state.failures });
    }
    generation += 1;
    const owned = generation;
    let next: RealtimeChannel | null = null;
    const isCurrent = (): boolean => !stopped && channel !== null && channel === next && generation === owned;
    next = options.bind(supabase.channel(options.createTopic(), options.channelOptions), isCurrent);
    channel = next;

    const scheduleRejoin = (status: string) => {
      const failures = state.failures + 1;
      const delay = Math.min(
        REALTIME_RETRY_MAX_MS,
        Math.round(REALTIME_RETRY_BASE_MS * REALTIME_RETRY_FACTOR ** (failures - 1))
      );
      publish({
        ...state,
        status,
        healthy: false,
        unhealthySince: state.unhealthySince ?? Date.now(),
        failures,
        lastRetryDelayMs: delay,
      });
      if (tracing()) {
        debugLogger.messaging.warn(traceScope, 'retry', { channel: traceChannel, status, delay, attempt: failures });
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!isCurrent()) return;
        // The socket itself is down: a channel joined now would only queue its
        // join, and leaving it before the socket returns cannot withdraw that
        // queued join (the server would keep an orphan channel streaming to
        // this page). The current channel stays (an errored one is rejoined by
        // the SDK as soon as the socket opens); checked again after the next
        // backoff, when a closed one is replaced.
        if (!supabase.realtime.isConnected()) {
          scheduleRejoin(status);
          return;
        }
        join();
      }, delay);
    };

    next.subscribe((status, error) => {
      if (!isCurrent()) return;
      options.onStatus?.(status);
      if (tracing()) debugLogger.messaging.trace(traceScope, 'status', { channel: traceChannel, status });

      if (FAILURE_STATUSES.has(status) && options.isAccessLoss?.(status, error)) {
        if (tracing()) debugLogger.messaging.warn(traceScope, 'access-lost', { channel: traceChannel, status });
        stop();
        options.onAccessLost?.();
        return;
      }

      if (status === 'SUBSCRIBED') {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        const recovered = failedSinceHealthy;
        failedSinceHealthy = false;
        publish({
          ...state,
          status,
          healthy: true,
          unhealthySince: null,
          recoveries: state.recoveries + (recovered ? 1 : 0),
        });
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(() => {
          stableTimer = null;
          if (isCurrent()) publish({ ...state, failures: 0 });
        }, RETRY_STABLE_AFTER_MS);
        if (recovered) {
          if (tracing()) debugLogger.messaging.event(traceScope, 'recovered', { channel: traceChannel });
          options.onRecovered?.();
        }
        return;
      }

      if (!FAILURE_STATUSES.has(status)) {
        publish({ ...state, status });
        return;
      }
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = null;
      failedSinceHealthy = true;
      // One rejoin per failed channel (it may report several failures).
      if (retryTimer) {
        publish({ ...state, status, healthy: false, unhealthySince: state.unhealthySince ?? Date.now() });
        return;
      }
      scheduleRejoin(status);
    });
  };

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearTimers();
    if (channel) retire(channel);
    options.onStatus?.(null);
    health.update(stream, null);
  }

  // Block B fix F1: the first join waits for the socket as well. A join made
  // while the socket is down is only buffered (Phoenix flushes it on
  // reconnect); a socket error meanwhile resets its join ref, so the leave a
  // stop then queues carries a null ref and cannot withdraw it — the server
  // would keep an orphan channel streaming to this page under the token the
  // join carried (across an account switch, the previous account's). So no
  // join of any kind is pushed until the socket is connected: a socket never
  // started is started here (the same connect() channel.subscribe() makes; a
  // no-op while the SDK is connecting or waiting to reconnect), and a stop
  // meanwhile cancels the wait (nothing was pushed).
  let connectRequested = false;
  const joinWhenConnected = () => {
    retryTimer = null;
    if (stopped) return;
    if (!supabase.realtime.isConnected()) {
      if (!connectRequested) {
        connectRequested = true;
        try {
          supabase.realtime.connect();
        } catch (error) {
          if (tracing()) debugLogger.messaging.warn(traceScope, 'connect-failed', { channel: traceChannel, error: String(error) });
        }
      }
      retryTimer = setTimeout(joinWhenConnected, SOCKET_WAIT_POLL_MS);
      return;
    }
    join();
  };

  joinWhenConnected();

  return stop;
}
