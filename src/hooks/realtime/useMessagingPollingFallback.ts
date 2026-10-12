// src/hooks/realtime/useMessagingPollingFallback.ts
"use client";

import { useEffect, useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { MESSAGE_READERS_QUERY_KEY } from '@/hooks/queries/useMessageReaders';
import { conversationsQueryKey, fetchConversationList } from '@/hooks/useConversations';
import {
  REQUIRED_MESSAGING_STREAMS,
  unhealthySince,
  type MessagingRealtimeHealth,
} from '@/lib/messaging/realtime-health';
import { metricCount, metricDurationMs, recordMessagingMetric } from '@/lib/messaging/metrics-recorder';
import {
  POLL_AFTER_UNHEALTHY_MS,
  POLL_INTERVAL_MS,
  POLL_ROUND_DEADLINE_MS,
  pollConversationFeed,
  pollQueryIfUnchanged,
  type PollRequestControl,
} from '@/lib/messaging/polling-fallback';
import { debugLogger } from '@/utils/debug-logger';

interface UseMessagingPollingFallbackOptions {
  /** This tab's messaging stream health (T13). */
  health: MessagingRealtimeHealth;
  /** The signed-in user's users.id (null/undefined: signed out, nothing polls). */
  userId: string | null | undefined;
  /** The open conversation, whose feed is polled (null: none open). */
  conversationId: string | null;
}

const isTabVisible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

const subscribeVisibility = (listener: () => void): (() => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

/** T19 (FR-027): the polling episode in progress — when its first round started, and its rounds. */
interface PollingEpisode {
  startedAt: number;
  rounds: number;
}

/** T19: a round starts; the first one of an episode records `polling_start`. */
function notePollingRound(episode: MutableRefObject<PollingEpisode | null>): void {
  if (!episode.current) {
    episode.current = { startedAt: Date.now(), rounds: 0 };
    recordMessagingMetric({ type: 'polling_start' });
  }
  episode.current.rounds += 1;
}

/** T19: the episode ends (streams healthy again, user changed, unmounted): `polling_stop` with its duration and rounds. */
function endPollingEpisode(episode: MutableRefObject<PollingEpisode | null>): void {
  const current = episode.current;
  if (!current) return;
  episode.current = null;
  const durationMs = metricDurationMs(current.startedAt, Date.now());
  if (durationMs !== null) recordMessagingMetric({ type: 'polling_stop', durationMs, count: metricCount(current.rounds) });
}

/**
 * One polling round: the open feed, open reader lists, and the conversation
 * list, together. Block B fix F6: it ends at its deadline (`control.signal`
 * aborted) whatever is still running — the feed and list requests are
 * aborted; a reader-list refetch left running belongs to its own query.
 */
async function pollOnce(
  queryClient: QueryClient,
  userId: string,
  conversationId: string | null,
  control: PollRequestControl
): Promise<void> {
  if (debugLogger.messaging.enabled()) {
    debugLogger.messaging.event('useMessagingPollingFallback', 'poll', { conversationId });
  }
  const deadline = new Promise<void>((resolve) => {
    if (control.signal.aborted) resolve();
    else control.signal.addEventListener('abort', () => resolve(), { once: true });
  });
  await Promise.race([
    deadline,
    Promise.allSettled([
      conversationId ? pollConversationFeed(queryClient, conversationId, control) : Promise.resolve(),
      // An open reader list refetches through its own query: a Realtime
      // receipt reconciles after a fetch in flight (useMessageSubscription,
      // F7), so a stale poll never stands.
      queryClient.refetchQueries({ queryKey: MESSAGE_READERS_QUERY_KEY, type: 'active' }, { cancelRefetch: false }),
      pollQueryIfUnchanged(
        queryClient,
        conversationsQueryKey(userId),
        (signal) => fetchConversationList(userId, 'poll', signal),
        control
      ),
    ]),
  ]);
}

/**
 * Phase 5 T14 (FR-016, BR-012): polling fallback while Realtime is unhealthy.
 * Once any required messaging stream (messages, list) has been unhealthy for
 * more than 30 s and the tab is visible, the open conversation's feed (new
 * messages, receipt summaries of its loaded messages), any open reader list
 * and the conversation list are fetched every 15 s; on becoming visible while
 * that holds, at once. Nothing polls while the tab is hidden, and no round
 * starts once every required stream is healthy again (a round in flight
 * finishes; its results merge without replacing newer state; a multi-page
 * feed read starts no further page then, F11). A round ends within 10 s
 * (block B fix F6: its requests are aborted at that deadline) and blocks only
 * the next round of the same signed-in identity. Health is this
 * tab's (T13: healthy means SUBSCRIBED, not "no event missed"); there is no
 * reconciliation while the streams are healthy.
 */
export function useMessagingPollingFallback({ health, userId, conversationId }: UseMessagingPollingFallbackOptions): void {
  const queryClient = useQueryClient();
  const snapshot = useSyncExternalStore(health.subscribe, health.getSnapshot, health.getSnapshot);
  const since = unhealthySince(snapshot, REQUIRED_MESSAGING_STREAMS);
  const visible = useSyncExternalStore(subscribeVisibility, isTabVisible, () => true);

  const userRef = useRef(userId);
  const conversationRef = useRef(conversationId);
  /** Block B fix F6: identity generation — a new one on every user change (A → C → A included). */
  const generationRef = useRef(0);
  /** T19: metrics of the polling episode in progress (null: not polling). */
  const episodeRef = useRef<PollingEpisode | null>(null);
  useEffect(() => () => endPollingEpisode(episodeRef), []);

  useEffect(() => {
    if (userRef.current !== userId) {
      generationRef.current += 1;
      endPollingEpisode(episodeRef);
    }
    userRef.current = userId;
    conversationRef.current = conversationId;
  }, [userId, conversationId]);

  const lastRoundAtRef = useRef<number | null>(null);
  /** The round in flight and the identity generation it belongs to (F6). */
  const roundRef = useRef<{ generation: number; controller: AbortController } | null>(null);
  const wasHiddenRef = useRef(false);

  useEffect(() => {
    // T19: the episode ends once every required stream is healthy again
    // (whether or not the tab is visible), or without a user.
    if (!userId || since === null) endPollingEpisode(episodeRef);
    if (!visible) {
      wasHiddenRef.current = true;
      return;
    }
    const becameVisible = wasHiddenRef.current;
    wasHiddenRef.current = false;
    if (!userId || since === null) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (delay: number) => {
      timer = setTimeout(tick, Math.max(0, delay));
    };

    function tick() {
      timer = null;
      if (stopped || !userId) return;
      // Read at fire time (the store can change before React re-runs this effect).
      const unhealthyFrom = unhealthySince(health.getSnapshot(), REQUIRED_MESSAGING_STREAMS);
      if (unhealthyFrom === null || !isTabVisible()) return;
      const dueAt = unhealthyFrom + POLL_AFTER_UNHEALTHY_MS;
      if (Date.now() < dueAt) {
        schedule(dueAt - Date.now());
        return;
      }
      schedule(POLL_INTERVAL_MS);
      // One round at a time per identity (F6): a round of a previous identity
      // never blocks this one — it is aborted (its results are dropped anyway).
      const generation = generationRef.current;
      const inFlight = roundRef.current;
      if (inFlight?.generation === generation) return;
      inFlight?.controller.abort();
      const controller = new AbortController();
      const round = { generation, controller };
      roundRef.current = round;
      lastRoundAtRef.current = Date.now();
      notePollingRound(episodeRef);
      const pollUser = userId;
      const isCurrent = () => userRef.current === pollUser && generationRef.current === generation;
      const control: PollRequestControl = {
        isCurrent,
        // F11: before each further request, the round must still be eligible.
        mayRequest: () =>
          isCurrent()
          && !controller.signal.aborted
          && isTabVisible()
          && unhealthySince(health.getSnapshot(), REQUIRED_MESSAGING_STREAMS) !== null,
        signal: controller.signal,
      };
      const deadline = setTimeout(() => controller.abort(), POLL_ROUND_DEADLINE_MS);
      void pollOnce(queryClient, pollUser, conversationRef.current, control).finally(() => {
        clearTimeout(deadline);
        // Only this round releases its own slot (an obsolete one never frees a newer round's).
        if (roundRef.current === round) roundRef.current = null;
      });
    }

    const now = Date.now();
    const eligibleAt = since + POLL_AFTER_UNHEALTHY_MS;
    const lastRoundAt = lastRoundAtRef.current;
    const at = becameVisible || lastRoundAt === null
      ? Math.max(now, eligibleAt)
      : Math.max(eligibleAt, lastRoundAt + POLL_INTERVAL_MS);
    schedule(at - now);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [health, queryClient, since, userId, visible]);
}
