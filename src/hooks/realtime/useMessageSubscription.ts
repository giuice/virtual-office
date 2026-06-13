// src/hooks/realtime/useMessageSubscription.ts
"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Message } from '@/types/messaging';
import { debugLogger } from '@/utils/debug-logger';
import { toggleReactionInPages } from '@/lib/messaging/reaction-cache';
import { appendMessageToPages, type MessagesInfiniteData } from '@/lib/messaging/message-cache';
import {
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

interface UseMessageSubscriptionOptions {
  isActive?: boolean;
  onInsert?: (message: Message) => void;
  ignoreSenderId?: string;
}

const CHANNEL_NAME = 'messaging-db-changes';
const FAILURE_STATUSES = new Set(['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED']);
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 5000;

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
  queryClient.setQueryData<MessagesInfiniteData | undefined>(
    ['messages', message.conversationId],
    (oldData) => appendMessageToPages(oldData, message)
  );
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
    if (!isActive) {
      return;
    }

    let isMounted = true;
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const handleMessageChange = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      const eventType = payload.eventType;

      if (eventType === 'INSERT' && payload.new) {
        const message = mapRowToMessage(payload.new);
        appendMessageToCache(queryClient, message);

        // M-08: image/file messages arrive without their attachments —
        // refetch the conversation so receivers see them without a reload.
        if (ATTACHMENT_MESSAGE_TYPES.has(message.type as string)) {
          queryClient.invalidateQueries({ queryKey: ['messages', message.conversationId] });
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
    // Refetch derives status from message_read_receipts server-side;
    // TanStack coalesces the burst of invalidations into one refetch.
    const handleReceiptInsert = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      const conversationId = (payload.new as Record<string, unknown> | null)?.conversation_id;
      if (typeof conversationId === 'string') {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      }
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

    const cleanup = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (channel) {
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useMessageSubscription', 'unsubscribe', {
            channel: CHANNEL_NAME,
          });
        }
        void channel.unsubscribe();
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const subscribeChannel = () => {
      if (!isMounted) return;

      cleanup();
      attempt += 1;

      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useMessageSubscription', 'subscribe:attempt', {
          channel: CHANNEL_NAME,
          attempt,
        });
      }

      channel = supabase
        .channel(CHANNEL_NAME)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          handleMessageChange
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'message_read_receipts' },
          handleReceiptInsert
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'message_reactions' },
          handleReactionChange
        );

      channel.subscribe((channelStatus) => {
        if (!isMounted) return;

        publishStatus(channelStatus);

        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useMessageSubscription', 'status', {
            channel: CHANNEL_NAME,
            status: channelStatus,
          });
        }

        if (channelStatus === 'SUBSCRIBED') {
          attempt = 0;
          return;
        }

        if (FAILURE_STATUSES.has(channelStatus)) {
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

          retryTimer = setTimeout(subscribeChannel, delay);
        }
      });
    };

    subscribeChannel();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [isActive, queryClient, publishStatus]);

  return { status: isActive ? status : null };
}
