// src/lib/messaging/message-cache.ts
// Shared cache-merge helper for the ['messages', conversationId] infinite
// query (audit B-04). Page 0 holds the NEWEST window (pages go newer ->
// older), so incoming messages must land in page 0 — appending to the last
// page renders them in the middle of history once older pages are loaded.
import type { QueryClient } from '@tanstack/react-query';

import { Message } from '@/types/messaging';

export interface MessagesPage {
  messages: Message[];
  hasMoreOlder?: boolean;
  nextCursorBefore?: string;
}

export interface MessagesInfiniteData {
  pages: MessagesPage[];
  pageParams: unknown[];
}

/** Query key of the sender's pending (not yet confirmed) messages of a conversation. */
export const pendingMessagesQueryKey = (userId: string, conversationId: string) =>
  ['messages-pending', userId, conversationId] as const;

/** Prefix of a pending message's id (`temp-<clientMessageId>`); never a stored id. */
export const PENDING_MESSAGE_ID_PREFIX = 'temp-';

/** A composition key in canonical form (lowercase), or null when absent. */
export const normalizeClientMessageId = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.length > 0 ? value.toLowerCase() : null;

const correlationKey = (message: Message): string | null => {
  const key = normalizeClientMessageId(message.clientMessageId);
  return key ? `${message.senderId}:${key}` : null;
};

/**
 * Phase 5 FR-034: the pending messages still to show next to the stored feed.
 * A pending message is matched to a stored one ONLY by its sender and
 * `clientMessageId` (the server stores at most one message per sender,
 * conversation and key): once the feed holds the stored message — from a
 * Realtime INSERT, a feed fetch or the create response, in any order — the
 * pending copy is hidden, so the message is one bubble. Content, timestamps
 * and reply targets are never compared; a stored message without a key (an
 * unkeyed or pre-Phase-4 create) matches nothing.
 */
export function visiblePendingMessages(stored: readonly Message[], pending: readonly Message[]): Message[] {
  if (pending.length === 0) return [];
  const storedKeys = new Set<string>();
  for (const message of stored) {
    const key = correlationKey(message);
    if (key) storedKeys.add(key);
  }
  return pending.filter((message) => {
    const key = correlationKey(message);
    return key === null || !storedKeys.has(key);
  });
}

type StoredMessageObserver = (conversationId: string, stored: readonly Message[]) => void;
const storedMessageObservers = new WeakMap<QueryClient, Set<StoredMessageObserver>>();

/**
 * Phase 5 T8: calls `observer` with every batch of stored keyed messages
 * that resolvePendingMessages sees (a Realtime INSERT, the rendered feed after
 * a fetch), so the durable outbox confirms an item the first time its stored
 * key is observed from any source. Returns the unsubscribe function.
 */
export function observeStoredMessages(queryClient: QueryClient, observer: StoredMessageObserver): () => void {
  let observers = storedMessageObservers.get(queryClient);
  if (!observers) {
    observers = new Set();
    storedMessageObservers.set(queryClient, observers);
  }
  observers.add(observer);
  return () => {
    storedMessageObservers.get(queryClient)?.delete(observer);
  };
}

/**
 * Phase 5 FR-034: retires the sender's pending messages of a conversation
 * whose stored message has been observed (`stored`: a Realtime INSERT just
 * merged, or the feed as rendered after a fetch). A pending message is
 * resolved the first time its key is seen: it is removed from every pending
 * list of that conversation, so it is not shown again as "sending" if the
 * stored message later leaves the feed (for example a Realtime DELETE). Call
 * it only after the stored message is in the feed cache, so no render shows
 * neither copy.
 */
export function resolvePendingMessages(
  queryClient: QueryClient,
  conversationId: string,
  stored: readonly Message[]
): void {
  const storedKeys = new Set<string>();
  for (const message of stored) {
    const key = correlationKey(message);
    if (key) storedKeys.add(key);
  }
  if (storedKeys.size === 0) return;
  // Phase 5 T8: the outbox confirms (and deletes) the items of these keys.
  storedMessageObservers.get(queryClient)?.forEach((observer) => observer(conversationId, stored));
  queryClient
    .getQueriesData<Message[]>({ queryKey: ['messages-pending'] })
    .forEach(([queryKey, pending]) => {
      if (queryKey[2] !== conversationId || !pending?.length) return;
      const remaining = pending.filter((message) => {
        const key = correlationKey(message);
        return key === null || !storedKeys.has(key);
      });
      if (remaining.length !== pending.length) {
        queryClient.setQueryData<Message[]>(queryKey, remaining);
      }
    });
}

/** Whether `pending` still holds the pending message of `clientMessageId` (not yet resolved). */
export function isPendingMessage(pending: readonly Message[] | undefined, clientMessageId: string): boolean {
  return Boolean(pending?.some((message) => normalizeClientMessageId(message.clientMessageId) === clientMessageId));
}

// Ids of messages this client saw deleted through a Realtime DELETE event, per
// query client, bounded to the last 1000 (the oldest are forgotten first).
// Only three merges consult it: a create response (useMessages), a Realtime
// INSERT (useMessageSubscription) and the re-merge after an in-flight fetch
// (keepMessageThroughInflightFetch). It does not reconcile deletions this
// client missed (e.g. during a Realtime stream gap), and fetched pages are
// not filtered by it: a feed GET that read the row before it was deleted can
// still return it. No product path deletes stored messages today; the only
// deletion is a sender's own Data API delete under RLS (delete_own_messages).
const MAX_REMEMBERED_DELETIONS = 1000;
const deletedMessageIds = new WeakMap<QueryClient, Set<string>>();

export function markMessageDeleted(queryClient: QueryClient, messageId: string): void {
  let ids = deletedMessageIds.get(queryClient);
  if (!ids) {
    ids = new Set();
    deletedMessageIds.set(queryClient, ids);
  }
  ids.delete(messageId);
  ids.add(messageId);
  if (ids.size > MAX_REMEMBERED_DELETIONS) {
    const oldest = ids.values().next().value;
    if (oldest !== undefined) ids.delete(oldest);
  }
}

export function isMessageDeleted(queryClient: QueryClient, messageId: string): boolean {
  return deletedMessageIds.get(queryClient)?.has(messageId) ?? false;
}

/**
 * Merges a stored message (a Realtime INSERT, a create response) into the
 * infinite-query cache:
 * - id already present in ANY page → no-op (realtime echo / duplicate event);
 * - otherwise → appended to page 0, the newest window.
 * Pending messages live outside this cache (pendingMessagesQueryKey) and are
 * matched to stored ones by key only (visiblePendingMessages).
 */
export function appendMessageToPages(
  oldData: MessagesInfiniteData | undefined,
  message: Message
): MessagesInfiniteData {
  if (!oldData || !oldData.pages || oldData.pages.length === 0) {
    return { pages: [{ messages: [message] }], pageParams: [undefined] };
  }

  for (const page of oldData.pages) {
    if (page.messages.some((existing) => existing.id === message.id)) {
      return oldData;
    }
  }

  const pages = [...oldData.pages];
  pages[0] = { ...pages[0], messages: [...pages[0].messages, message] };
  return { ...oldData, pages };
}

const messagesQueryKey = (conversationId: string) => ['messages', conversationId] as const;

const isMessageCached = (data: MessagesInfiniteData | undefined, messageId: string): boolean =>
  Boolean(data?.pages?.some((page) => page.messages.some((existing) => existing.id === messageId)));

/**
 * Whether a conversation's feed cache holds the message right now. Components
 * render the feed from a provider that re-renders only once TanStack Query
 * delivers its (deferred) observer notification, so the rendered list can
 * briefly lag behind the cache.
 */
export function isMessageInFeedCache(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string
): boolean {
  return isMessageCached(
    queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId)),
    messageId
  );
}

/**
 * Phase 5 T17: mentions are not in Realtime payloads (TRACK T4), so a live
 * INSERT reaches the feed without `mentionedUserIds`. A message whose text has
 * an "@" may mention someone (the composer writes every chosen mention as
 * "@<name>"); while the feed's copy of it lacks the stored mentions (no create
 * response or fetch delivered them yet), the feed must be refetched to get
 * them. A message without "@" is never refetched for this.
 */
export function lacksStoredMentions(queryClient: QueryClient, message: Message): boolean {
  if (typeof message.content !== 'string' || !message.content.includes('@')) return false;
  const data = queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey(message.conversationId));
  for (const page of data?.pages ?? []) {
    const cached = page.messages.find((existing) => existing.id === message.id);
    if (cached) return cached.mentionedUserIds === undefined;
  }
  return false;
}

/**
 * Keeps a just-merged message (a resolved send, a realtime INSERT) in the
 * feed when a fetch of that feed is already in flight.
 *
 * A fetch resolves with the server rows it read when it started and replaces
 * the cached pages. If the message was committed after that read, the result
 * lacks it and would silently drop it from the feed until some later
 * refetch. Once the in-flight fetch settles the message is merged again
 * (a no-op when the result already has it). If the message leaves the cache
 * while the fetch is still running (deleted, or a failed send rolled back),
 * it is not brought back, and neither is a message this client has seen
 * deleted by a Realtime DELETE (isMessageDeleted) by the time the fetch
 * settles.
 */
export function keepMessageThroughInflightFetch(
  queryClient: QueryClient,
  conversationId: string,
  message: Message
): void {
  const queryKey = messagesQueryKey(conversationId);
  const queryCache = queryClient.getQueryCache();
  const query = queryCache.find<MessagesInfiniteData>({ queryKey, exact: true });
  if (!query || query.state.fetchStatus !== 'fetching') {
    return;
  }

  const unsubscribe = queryCache.subscribe((event) => {
    if (event.query !== query) {
      return;
    }
    if (event.type === 'removed') {
      unsubscribe();
      return;
    }
    if (event.type !== 'updated') {
      return;
    }
    if (query.state.fetchStatus === 'fetching') {
      // Until the fetch settles, data only changes through local updates.
      if (!isMessageCached(query.state.data, message.id)) {
        unsubscribe();
      }
      return;
    }
    unsubscribe();
    if (isMessageDeleted(queryClient, message.id)) {
      return;
    }
    queryClient.setQueryData<MessagesInfiniteData | undefined>(queryKey, (oldData) =>
      oldData ? appendMessageToPages(oldData, message) : oldData
    );
  });
}

/** Feed order: oldest first by timestamp, then id (the server's keyset order). */
const compareFeedOrder = (a: Message, b: Message): number => {
  const byTime = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const sameMessage = (a: Message, b: Message): boolean => JSON.stringify(a) === JSON.stringify(b);

export interface PolledMessagesMerge {
  data: MessagesInfiniteData;
  /** Messages the poll added to page 0 (not cached before). */
  added: Message[];
  changed: boolean;
}

/**
 * Phase 5 T14 (FR-016, AC-048): merges a polling-fallback read of a
 * conversation (`polled`, oldest first) into its cached feed without ever
 * going back to older data:
 * - a message is never duplicated: one already in ANY page is never added
 *   again, and one the cache held when the poll started (`cachedAtStart`) but
 *   no longer holds (removed meanwhile), or seen deleted, is not brought back;
 * - an existing message is replaced by its polled copy only when
 *   `replaceExisting` — the caller's proof that nothing wrote the feed since
 *   the poll started, so the polled copy is the newer state (receipts,
 *   reactions, attachments, mentions); otherwise the cached copy is kept;
 * - a new message is placed in page 0 (the newest window) in feed order, and
 *   only when it is not older than page 0's oldest message: an older one
 *   belongs to history that is not loaded. Older pages are never replaced,
 *   dropped or reordered.
 */
export function mergePolledMessages(
  oldData: MessagesInfiniteData,
  polled: readonly Message[],
  options: {
    replaceExisting: boolean;
    cachedAtStart: ReadonlySet<string>;
    isDeleted: (messageId: string) => boolean;
  }
): PolledMessagesMerge {
  const polledById = new Map(polled.map((message) => [message.id, message]));
  const cached = new Set<string>();
  let changed = false;

  const pages = oldData.pages.map((page) => {
    let pageChanged = false;
    const messages = page.messages.map((existing) => {
      cached.add(existing.id);
      if (!options.replaceExisting) return existing;
      const next = polledById.get(existing.id);
      if (!next || options.isDeleted(existing.id) || sameMessage(existing, next)) return existing;
      pageChanged = true;
      return next;
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, messages };
  });

  const newest = pages[0];
  const floor = newest.messages[0] ?? pages.slice(1).find((page) => page.messages.length > 0)?.messages.at(-1);
  const added = polled.filter(
    (message) =>
      !cached.has(message.id) &&
      !options.cachedAtStart.has(message.id) &&
      !options.isDeleted(message.id) &&
      (!floor || compareFeedOrder(message, floor) >= 0)
  );
  if (added.length > 0) {
    const merged = [...newest.messages];
    for (const message of added) {
      const index = merged.findIndex((existing) => compareFeedOrder(existing, message) > 0);
      if (index === -1) merged.push(message);
      else merged.splice(index, 0, message);
    }
    pages[0] = { ...newest, messages: merged };
    changed = true;
  }

  return { data: changed ? { ...oldData, pages } : oldData, added, changed };
}
