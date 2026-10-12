// src/lib/messaging/polling-fallback.ts
// Phase 5 T14 (FR-016, BR-012, AC-016, AC-048): what one polling-fallback
// round fetches while a required messaging Realtime stream is unhealthy, and
// how its results reach the caches without ever replacing newer state. The
// schedule (unhealthy > 30 s, visible tab, every 15 s) lives in
// useMessagingPollingFallback.
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { messagingApi } from '@/lib/messaging-api';
import {
  isMessageDeleted,
  keepMessageThroughInflightFetch,
  mergePolledMessages,
  type MessagesInfiniteData,
} from '@/lib/messaging/message-cache';
import type { Message } from '@/types/messaging';

/** Polling starts once a required stream has been unhealthy this long (BR-012). */
export const POLL_AFTER_UNHEALTHY_MS = 30_000;
/** Interval between polling rounds (BR-012). */
export const POLL_INTERVAL_MS = 15_000;
/** Messages per poll request (the route's maximum). */
const POLL_PAGE_SIZE = 100;
/** Bound on the requests of one feed poll (POLL_PAGE_SIZE messages each). */
const MAX_FEED_POLL_REQUESTS = 10;
/**
 * Block B fix F6: deadline of one polling round; its requests still running
 * then are aborted and the round ends (a stalled request never holds the
 * next round).
 */
export const POLL_ROUND_DEADLINE_MS = 10_000;

/** How a round's requests run (block B fixes F6, F11). */
export interface PollRequestControl {
  /** The round's results still belong to the signed-in user (else they are dropped). */
  isCurrent: () => boolean;
  /**
   * F11: a further request may start now (visible tab, a stream still
   * unhealthy, same user); checked before each page of a multi-page poll.
   */
  mayRequest: () => boolean;
  /** F6: aborted at the round's deadline. */
  signal: AbortSignal;
}

type Snapshot<T> = { data: T | undefined; dataUpdatedAt: number };

const snapshotOf = <T>(queryClient: QueryClient, queryKey: QueryKey): Snapshot<T> | null => {
  const query = queryClient.getQueryCache().find<T>({ queryKey, exact: true });
  return query ? { data: query.state.data, dataUpdatedAt: query.state.dataUpdatedAt } : null;
};

/**
 * Nothing wrote the query since `start` (no Realtime update, fetch, or local
 * change) and no fetch of its own is running (which would replace whatever
 * is written now): a result read by the server after `start` is the newest
 * state the query can hold.
 */
const unchangedSince = <T>(queryClient: QueryClient, queryKey: QueryKey, start: Snapshot<T>): boolean => {
  const query = queryClient.getQueryCache().find<T>({ queryKey, exact: true });
  return Boolean(
    query &&
      query.state.data === start.data &&
      query.state.dataUpdatedAt === start.dataUpdatedAt &&
      query.state.fetchStatus !== 'fetching'
  );
};

const messageTime = (message: Message): number => new Date(message.timestamp).getTime();

/**
 * Polls the open conversation's feed: its new messages and the current state
 * (receipt summaries, reactions, attachments) of its loaded messages, read
 * newest first until the oldest loaded message is covered. Merged by
 * mergePolledMessages: new messages are added once; loaded messages take the
 * polled state only when the feed was not written while the poll ran (a
 * Realtime event, a refetch or a local change that lands first is newer and
 * wins; the next round catches up). A feed never loaded is left to its own
 * first fetch.
 */
export async function pollConversationFeed(
  queryClient: QueryClient,
  conversationId: string,
  { isCurrent, mayRequest, signal }: PollRequestControl
): Promise<void> {
  const queryKey = ['messages', conversationId] as const;
  const start = snapshotOf<MessagesInfiniteData>(queryClient, queryKey);
  const startData = start?.data;
  if (!start || !startData?.pages?.length) return;

  const cachedAtStart = new Set<string>();
  let oldestLoaded: Message | undefined;
  for (const page of startData.pages) {
    for (const message of page.messages) {
      cachedAtStart.add(message.id);
      if (!oldestLoaded || messageTime(message) < messageTime(oldestLoaded)) oldestLoaded = message;
    }
  }

  const polled: Message[] = [];
  let cursorBefore: string | undefined;
  let moreOlder = false;
  for (let request = 0; request < MAX_FEED_POLL_REQUESTS; request += 1) {
    // F11: no further page once the tab is hidden, Realtime recovered or the
    // user changed; a partial read is not merged.
    if (!mayRequest()) return;
    const page = await messagingApi.getMessages(conversationId, {
      limit: POLL_PAGE_SIZE,
      cursorBefore,
      source: 'poll',
      signal,
    });
    if (!isCurrent()) return;
    polled.unshift(...page.messages);
    moreOlder = Boolean(page.hasMoreOlder && page.nextCursorBefore);
    const oldestPolled = page.messages[0];
    if (!moreOlder || !oldestLoaded || (oldestPolled && messageTime(oldestPolled) <= messageTime(oldestLoaded))) {
      break;
    }
    cursorBefore = page.nextCursorBefore;
  }

  // More new messages than the bounded read reaches: merging them would leave
  // a hole between them and the loaded feed. The feed refetches instead
  // (without cancelling a fetch in flight).
  if (moreOlder && !polled.some((message) => cachedAtStart.has(message.id))) {
    void queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
    return;
  }

  const current = queryClient.getQueryData<MessagesInfiniteData>(queryKey);
  if (!current?.pages?.length) return;
  const merge = mergePolledMessages(current, polled, {
    replaceExisting: unchangedSince(queryClient, queryKey, start),
    cachedAtStart,
    isDeleted: (messageId) => isMessageDeleted(queryClient, messageId),
  });
  if (!merge.changed) return;
  queryClient.setQueryData<MessagesInfiniteData>(queryKey, merge.data);
  // A fetch of the feed's own already in flight replaces the pages when it
  // settles; the added messages are merged again after it.
  for (const message of merge.added) keepMessageThroughInflightFetch(queryClient, conversationId, message);
}

/**
 * Polls a whole-result query (the conversation list) with `fetcher` and
 * stores the result only if nothing wrote the query while the poll ran: a
 * Realtime update, local change or fetch of its own that lands first is at
 * least as new and wins (the next round catches up). Returns whether the
 * result was stored.
 */
export async function pollQueryIfUnchanged<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  fetcher: (signal: AbortSignal) => Promise<T>,
  { isCurrent, mayRequest, signal }: PollRequestControl
): Promise<boolean> {
  const start = snapshotOf<T>(queryClient, queryKey);
  if (!start || start.data === undefined || !mayRequest()) return false;
  const result = await fetcher(signal);
  if (!isCurrent() || !unchangedSince(queryClient, queryKey, start)) return false;
  queryClient.setQueryData<T>(queryKey, result);
  return true;
}
