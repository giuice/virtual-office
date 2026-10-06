// src/hooks/realtime/useMessageSubscription.ts
"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { hashKey, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Message } from '@/types/messaging';
import { debugLogger } from '@/utils/debug-logger';
import { toggleReactionInPages } from '@/lib/messaging/reaction-cache';
import {
  appendMessageToPages,
  keepMessageThroughInflightFetch,
  type MessagesInfiniteData,
} from '@/lib/messaging/message-cache';
import { MESSAGE_READERS_QUERY_KEY, messageReadersQueryKey } from '@/hooks/queries/useMessageReaders';
import { STARRED_MESSAGES_QUERY_KEY } from '@/hooks/queries/useStarredMessages';
import {
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
  type RealtimeSystemPayload,
} from '@supabase/supabase-js';

interface UseMessageSubscriptionOptions {
  isActive?: boolean;
  companyId?: string;
  currentUserId?: string;
  onInsert?: (message: Message) => void;
  ignoreSenderId?: string;
}

const CHANNEL_NAME = 'messaging-db-changes';
const FAILURE_STATUSES = new Set(['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED']);
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 5000;
const RETRY_STABLE_AFTER_MS = 30_000;
// A mark-read writes one receipt row per message; each row is its own event.
const RECEIPT_REFETCH_DELAY_MS = 100;
let channelTopicSequence = 0;

function createChannelTopic(companyId: string, currentUserId: string): string {
  channelTopicSequence += 1;
  const entropy = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${channelTopicSequence}`;
  return `${CHANNEL_NAME}:${companyId}:${currentUserId}:${channelTopicSequence}:${entropy}`;
}

const mapRowToMessage = (row: any): Message => ({
  id: row.id,
  conversationId: row.conversation_id,
  senderId: row.sender_id,
  content: row.content,
  timestamp: new Date(row.timestamp),
  type: row.type,
  status: row.status,
  replyToId: row.reply_to_id ?? undefined,
  // Audit M-08: the messages row carries no attachments/reactions (separate
  // tables) — start empty; attachment-bearing types trigger a refetch below.
  attachments: [],
  reactions: [],
  isEdited: Boolean(row.is_edited),
});

// Message types whose payload lives in message_attachments — the realtime
// row can't carry it, so the conversation must refetch to enrich (M-08).
const ATTACHMENT_MESSAGE_TYPES = new Set(['image', 'file']);

// Audit B-04: shared cache-merge with the optimistic send path — page 0 is
// the newest window and dedupe runs across all pages.
const appendMessageToCache = (queryClient: QueryClient, message: Message) => {
  // A conversation whose history was never loaded has no cache entry. Creating
  // one from this single row would make the feed treat it as the whole history
  // (no older-page cursor, 5 min staleTime) and hide every earlier message, so
  // they could never be seen or read. Its first open fetches the history.
  if (!queryClient.getQueryData(['messages', message.conversationId])) {
    return;
  }
  queryClient.setQueryData<MessagesInfiniteData | undefined>(
    ['messages', message.conversationId],
    (oldData) => appendMessageToPages(oldData, message)
  );
  keepMessageThroughInflightFetch(queryClient, message.conversationId, message);
};

const updateMessageInCache = (queryClient: QueryClient, conversationId: string, row: any) => {
  queryClient.setQueryData<MessagesInfiniteData | undefined>(
    ['messages', conversationId],
    (oldData) => {
      if (!oldData || !oldData.pages) {
        return oldData;
      }

      const pages = oldData.pages.map((page) => ({
        ...page,
        messages: page.messages.map((existing) =>
          existing.id === row.id
            ? {
                ...existing,
                content: row.content ?? existing.content,
                status: row.status ?? existing.status,
                isEdited: row.is_edited ?? existing.isEdited,
                reactions: row.reactions ?? existing.reactions,
              }
            : existing
        ),
      }));

      return { ...oldData, pages };
    }
  );
};

const handleReactionUpdate = (
  queryClient: QueryClient,
  messageId: string,
  userId: string,
  emoji: string,
  eventType: 'INSERT' | 'DELETE',
  timestamp: Date
) => {
  if (debugLogger.messaging.enabled()) {
    debugLogger.messaging.trace('useMessageSubscription', 'reaction:event', {
      messageId,
      emoji,
      eventType,
    });
  }

  // Update all conversation caches that might contain this message
  const allMessagesQueries = queryClient.getQueriesData<MessagesInfiniteData>({
    queryKey: ['messages'],
  });

  allMessagesQueries.forEach(([queryKey, oldData]) => {
    if (!oldData?.pages) return;

    const currentPages = oldData.pages;
    const nextPages = toggleReactionInPages({
      pages: currentPages,
      messageId,
      emoji,
      userId,
      timestamp: eventType === 'INSERT' ? timestamp : undefined,
      mode: eventType === 'INSERT' ? 'add' : 'remove',
    });

    if (nextPages === currentPages) {
      return;
    }

    queryClient.setQueryData(queryKey, {
      ...oldData,
      pages: nextPages,
    });
  });
};

// DELETE payloads only carry the primary key under RLS, so the conversation
// is unknown — drop the message from every cached conversation.
const removeMessageFromAllCaches = (queryClient: QueryClient, messageId: string) => {
  const allMessagesQueries = queryClient.getQueriesData<MessagesInfiniteData>({
    queryKey: ['messages'],
  });

  allMessagesQueries.forEach(([queryKey, oldData]) => {
    if (!oldData?.pages) return;

    let changed = false;
    const pages = oldData.pages.map((page) => {
      const filtered = page.messages.filter((existing) => existing.id !== messageId);
      if (filtered.length !== page.messages.length) {
        changed = true;
        return { ...page, messages: filtered };
      }
      return page;
    });

    if (changed) {
      queryClient.setQueryData(queryKey, { ...oldData, pages });
    }
  });
};

/**
 * One realtime channel for the whole messaging domain (audit M-06).
 *
 * Three postgres_changes bindings — messages, message_read_receipts,
 * message_reactions — share a single channel with NO client-side filters:
 * RLS SELECT policies (private.is_conversation_member) scope rows per
 * subscriber on the server, so the hook needs no conversation id list and
 * never re-subscribes when conversations change. The reported status is the
 * real status of the one channel carrying every messaging event.
 */
export function useMessageSubscription(options?: UseMessageSubscriptionOptions) {
  const isActive = options?.isActive ?? true;
  const companyId = options?.companyId;
  const currentUserId = options?.currentUserId;
  const queryClient = useQueryClient();
  const statusRef = useRef<string | null>(null);
  const statusListenersRef = useRef<Set<() => void> | null>(null);
  if (statusListenersRef.current === null) {
    statusListenersRef.current = new Set();
  }
  const statusListeners = statusListenersRef.current;

  const onInsertRef = useRef(options?.onInsert);
  const ignoreSenderIdRef = useRef(options?.ignoreSenderId);

  const publishStatus = useCallback((nextStatus: string | null) => {
    statusRef.current = nextStatus;
    statusListeners.forEach((listener) => listener());
  }, [statusListeners]);

  const subscribeStatus = useCallback((listener: () => void) => {
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }, [statusListeners]);

  const getStatusSnapshot = useCallback(() => statusRef.current, []);
  const status = useSyncExternalStore(subscribeStatus, getStatusSnapshot, getStatusSnapshot);

  useEffect(() => {
    onInsertRef.current = options?.onInsert;
  }, [options?.onInsert]);

  useEffect(() => {
    ignoreSenderIdRef.current = options?.ignoreSenderId;
  }, [options?.ignoreSenderId]);

  useEffect(() => {
    publishStatus(null);
    if (!isActive || !companyId || !currentUserId) {
      return;
    }

    let isMounted = true;
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stableSubscriptionTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let channelGeneration = 0;

    const handleMessageChange = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      const eventType = payload.eventType;

      if (eventType === 'INSERT' && payload.new) {
        const message = mapRowToMessage(payload.new);

        // M-08: image/file messages arrive without their attachments. The
        // bare row is not shown (BR-007: a message is never visible without
        // its files); the feed refetches it with them. The refetch is the
        // deferred, non-cancelling one, so it never aborts an older page the
        // reader is loading.
        if (ATTACHMENT_MESSAGE_TYPES.has(message.type as string)) {
          scheduleFeedRefetch(message.conversationId);
        } else {
          appendMessageToCache(queryClient, message);
        }

        const ignoreSenderId = ignoreSenderIdRef.current;
        if (ignoreSenderId && message.senderId === ignoreSenderId) {
          return;
        }

        const callback = onInsertRef.current;
        if (callback) {
          callback(message);
        }
        return;
      }

      if (eventType === 'UPDATE' && payload.new) {
        updateMessageInCache(queryClient, payload.new.conversation_id as string, payload.new);
        return;
      }

      if (eventType === 'DELETE' && payload.old) {
        removeMessageFromAllCaches(queryClient, payload.old.id as string);
      }
    };

    // Phase 2.2: read-receipt INSERTs (written in bulk by the
    // mark_conversation_read RPC) flip the sender's read indicator.
    // Refetch derives status from message_read_receipts server-side.
    // A burst of receipt events becomes one refetch per conversation, and it
    // never cancels an in-flight fetch: an invalidation with the default
    // cancelRefetch aborts an older page the reader is loading, after which
    // the infinite query refetches only the pages it already had. While a
    // fetch is running the refetch waits for it, so no receipt is lost.
    // The same deferred refetch catches a feed (and an open starred list,
    // which also pages) up after the channel (re)joins.
    const deferredRefetchTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleDeferredRefetch = (queryKey: QueryKey) => {
      const timerKey = hashKey(queryKey);
      if (deferredRefetchTimers.has(timerKey)) return;
      deferredRefetchTimers.set(
        timerKey,
        setTimeout(() => {
          deferredRefetchTimers.delete(timerKey);
          if (!isMounted) return;
          const query = queryClient.getQueryCache().find({ queryKey, exact: true });
          if (query?.state.fetchStatus === 'fetching') {
            scheduleDeferredRefetch(queryKey);
            return;
          }
          void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
        }, RECEIPT_REFETCH_DELAY_MS)
      );
    };
    const scheduleFeedRefetch = (conversationId: string) => {
      scheduleDeferredRefetch(['messages', conversationId]);
    };

    const handleReceiptInsert = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      const row = payload.new as Record<string, unknown> | null;
      const conversationId = row?.conversation_id;
      if (typeof conversationId === 'string') {
        scheduleFeedRefetch(conversationId);
      }
      // Phase 4 FR-005: an open reader list refetches right away (only active
      // queries refetch; a closed one is refetched on its next open). Its
      // request is small and per message, so superseding one in flight —
      // which may predate this receipt — is the safe default.
      const messageId = row?.message_id;
      if (typeof messageId === 'string') {
        void queryClient.invalidateQueries({ queryKey: messageReadersQueryKey(messageId) });
      }
    };

    // Changes committed while the channel was not yet (or no longer) streaming
    // never arrive as events: on first load, a message sent between the
    // initial fetches and the join would leave the unread count and the feed
    // stale until some later event. Once the server confirms the
    // postgres_changes stream for this (re)join, every cached feed refetches
    // (receipt counts, stars, attachment messages), and so do the caches kept
    // outside the feed: an open reader list (receipts) and an open starred
    // list (stars have no Realtime event at all; another session's change
    // shows on the next refetch). Closed ones are only marked stale; they
    // refetch whenever they open. The conversation list catches up in
    // useConversationRealtime.
    const catchUpTimelineCaches = () => {
      const queryCache = queryClient.getQueryCache();
      queryCache
        .findAll({ queryKey: ['messages'] })
        .forEach((query) => {
          const [, conversationId] = query.queryKey;
          if (query.queryKey.length === 2 && typeof conversationId === 'string') {
            scheduleFeedRefetch(conversationId);
          }
        });
      queryCache
        .findAll({ queryKey: STARRED_MESSAGES_QUERY_KEY })
        .forEach((query) => scheduleDeferredRefetch(query.queryKey));
      // Same policy as the receipt handler: a small per-message request, so
      // superseding one in flight (which may predate the reconnect) is safe.
      void queryClient.invalidateQueries({ queryKey: MESSAGE_READERS_QUERY_KEY });
    };

    const handleReactionChange = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      if (payload.eventType === 'INSERT' && payload.new) {
        const messageId = payload.new.message_id as string;
        const userId = payload.new.user_id as string;
        const emoji = payload.new.emoji as string;
        const timestampValue = payload.new.created_at ?? payload.new.timestamp;
        const timestamp = timestampValue ? new Date(timestampValue as string) : new Date();
        handleReactionUpdate(queryClient, messageId, userId, emoji, 'INSERT', timestamp);
        return;
      }

      if (payload.eventType === 'DELETE') {
        // Under RLS the DELETE payload only carries the reaction row's PK, so
        // the affected message is unknown — invalidate and let the active
        // conversation refetch (this is what syncs reaction removal live).
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      }
    };

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const clearStableSubscriptionTimer = () => {
      if (stableSubscriptionTimer) {
        clearTimeout(stableSubscriptionTimer);
        stableSubscriptionTimer = null;
      }
    };

    const retireChannel = (ownedChannel: RealtimeChannel) => {
      if (channel === ownedChannel) {
        channel = null;
        channelGeneration += 1;
        clearStableSubscriptionTimer();
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useMessageSubscription', 'unsubscribe', {
            channel: CHANNEL_NAME,
          });
        }
      }
      void supabase.removeChannel(ownedChannel).then((status) => {
        if (status !== 'ok') ownedChannel.teardown();
      }).catch(() => {
        ownedChannel.teardown();
      });
    };

    const subscribeChannel = () => {
      if (!isMounted) return;

      clearRetryTimer();
      clearStableSubscriptionTimer();
      if (channel) retireChannel(channel);
      attempt += 1;

      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useMessageSubscription', 'subscribe:attempt', {
          channel: CHANNEL_NAME,
          attempt,
        });
      }

      const generation = channelGeneration + 1;
      channelGeneration = generation;
      let nextChannel: RealtimeChannel;
      const isOwnedChannel = (): boolean => (
        isMounted
        && channel === nextChannel
        && channelGeneration === generation
      );
      nextChannel = supabase
        .channel(createChannelTopic(companyId, currentUserId))
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          (payload) => {
            if (isOwnedChannel()) handleMessageChange(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'message_read_receipts' },
          (payload) => {
            if (isOwnedChannel()) handleReceiptInsert(payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'message_reactions' },
          (payload) => {
            if (isOwnedChannel()) handleReactionChange(payload);
          }
        )
        .on('system', {}, (payload: RealtimeSystemPayload) => {
          if (
            isOwnedChannel()
            && payload.extension === 'postgres_changes'
            && payload.status === 'ok'
          ) {
            catchUpTimelineCaches();
          }
        });
      channel = nextChannel;

      nextChannel.subscribe((channelStatus) => {
        if (
          !isMounted
          || channel !== nextChannel
          || channelGeneration !== generation
        ) return;

        publishStatus(channelStatus);

        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useMessageSubscription', 'status', {
            channel: CHANNEL_NAME,
            status: channelStatus,
          });
        }

        if (channelStatus === 'SUBSCRIBED') {
          clearRetryTimer();
          clearStableSubscriptionTimer();
          stableSubscriptionTimer = setTimeout(() => {
            stableSubscriptionTimer = null;
            if (
              !isMounted
              || channel !== nextChannel
              || channelGeneration !== generation
            ) return;
            attempt = 0;
          }, RETRY_STABLE_AFTER_MS);
          return;
        }

        if (FAILURE_STATUSES.has(channelStatus)) {
          clearStableSubscriptionTimer();
          if (retryTimer) return;
          const delay = Math.min(
            RETRY_MAX_DELAY_MS,
            RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(attempt - 1, 0))
          );

          if (debugLogger.messaging.enabled()) {
            debugLogger.messaging.warn('useMessageSubscription', 'retry', {
              channel: CHANNEL_NAME,
              status: channelStatus,
              delay,
              attempt,
            });
          }

          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (
              !isMounted
              || channel !== nextChannel
              || channelGeneration !== generation
            ) return;
            subscribeChannel();
          }, delay);
        }
      });
    };

    subscribeChannel();

    return () => {
      isMounted = false;
      clearRetryTimer();
      clearStableSubscriptionTimer();
      deferredRefetchTimers.forEach((timer) => clearTimeout(timer));
      deferredRefetchTimers.clear();
      if (channel) retireChannel(channel);
      publishStatus(null);
    };
  }, [companyId, currentUserId, isActive, queryClient, publishStatus]);

  return { status: isActive && companyId && currentUserId ? status : null };
}
