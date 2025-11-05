// src/hooks/realtime/useMessageSubscription.ts
"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Message } from '@/types/messaging';
import { debugLogger, messagingFeatureFlags } from '@/utils/debug-logger';
import { toggleReactionInPages } from '@/lib/messaging/reaction-cache';
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
  type RealtimePostgresChangesFilter,
} from '@supabase/supabase-js';

interface UseMessageSubscriptionOptions {
  isActive?: boolean;
  onInsert?: (message: Message) => void;
  ignoreSenderId?: string;
}

type MessagesInfiniteData = {
  pages: Array<{
    messages: Message[];
    hasMoreOlder?: boolean;
    nextCursorBefore?: string;
  }>;
  pageParams: unknown[];
};

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
  attachments: row.attachments ?? [],
  reactions: row.reactions ?? [],
  isEdited: Boolean(row.is_edited),
});

const isOptimisticMatch = (existing: Message, incoming: Message) => {
  if (!existing.id.startsWith('temp-')) {
    return false;
  }
  if (existing.senderId !== incoming.senderId) {
    return false;
  }
  if (existing.content !== incoming.content) {
    return false;
  }

  const existingTime = existing.timestamp instanceof Date
    ? existing.timestamp.getTime()
    : new Date(existing.timestamp).getTime();
  const incomingTime = incoming.timestamp instanceof Date
    ? incoming.timestamp.getTime()
    : new Date(incoming.timestamp).getTime();

  return Number.isFinite(existingTime) && Number.isFinite(incomingTime) && Math.abs(existingTime - incomingTime) <= 1000;
};

const dedupeMessages = (messages: Message[]): Message[] => {
  const seen = new Set<string>();
  const result: Message[] = [];

  for (const msg of messages) {
    if (seen.has(msg.id)) {
      continue;
    }
    seen.add(msg.id);
    result.push(msg);
  }

  return result;
};

const appendMessageToCache = (queryClient: QueryClient, message: Message) => {
  queryClient.setQueryData<MessagesInfiniteData | undefined>(
    ['messages', message.conversationId],
    (oldData) => {
      if (!oldData || !oldData.pages || oldData.pages.length === 0) {
        return { pages: [{ messages: [message] }], pageParams: [undefined] };
      }

      const pages = [...oldData.pages];
      const lastIndex = pages.length - 1;
      const lastPage = pages[lastIndex];
      const messages = [...lastPage.messages];

      const optimisticIndex = messages.findIndex((existing) => isOptimisticMatch(existing, message));

      if (optimisticIndex >= 0) {
        messages[optimisticIndex] = message;
      } else {
        const exists = messages.some((existing) => existing.id === message.id);
        if (exists) {
          return oldData;
        }

        messages.push(message);
      }

      pages[lastIndex] = {
        ...lastPage,
        messages: dedupeMessages(messages),
      };

      return { ...oldData, pages };
    }
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

const removeMessageFromCache = (queryClient: QueryClient, conversationId: string, row: any) => {
  queryClient.setQueryData<MessagesInfiniteData | undefined>(
    ['messages', conversationId],
    (oldData) => {
      if (!oldData || !oldData.pages) {
        return oldData;
      }

      const pages = oldData.pages.map((page) => ({
        ...page,
        messages: page.messages.filter((existing) => existing.id !== row.id),
      }));

      return { ...oldData, pages };
    }
  );
};

export function useMessageSubscription(
  conversationIds: string | string[] | null,
  options?: UseMessageSubscriptionOptions
) {
  const isActive = options?.isActive ?? true;
  const ignoreSenderId = options?.ignoreSenderId;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);

  const onInsertRef = useRef(options?.onInsert);

  useEffect(() => {
    onInsertRef.current = options?.onInsert;
  }, [options?.onInsert]);

  const stableIds = useMemo(() => {
    if (!conversationIds) return [] as string[];
    const raw = Array.isArray(conversationIds) ? conversationIds : [conversationIds];
    const filtered = raw.filter(Boolean) as string[];
    const unique = Array.from(new Set(filtered));
    unique.sort();
    return unique;
  }, [conversationIds]);

  const subscriptionKey = useMemo(() => stableIds.join('|'), [stableIds]);

  useEffect(() => {
    if (!isActive) {
      setStatus(null);
      return;
    }

    const ids = stableIds;
    const featureFlagEnabled = messagingFeatureFlags.isV2Enabled();
    let isMounted = true;
    const teardownFns: Array<() => void> = [];

    const subscribeWithRetry = <E extends `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT}`>(
      channelName: string,
      filter: RealtimePostgresChangesFilter<E>,
      handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
    ) => {
      let channel: RealtimeChannel | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let attempt = 0;

      const cleanup = () => {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (channel) {
          if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useMessageSubscription', 'unsubscribe', {
          channel: channelName,
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
        channel = supabase.channel(channelName);

        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useMessageSubscription', 'subscribe:attempt', {
            channel: channelName,
            attempt,
          });
        }

        channel.on('postgres_changes', filter as any, handler as any);

        channel.subscribe((channelStatus) => {
          if (!isMounted) return;

          setStatus(channelStatus);

          if (debugLogger.messaging.enabled()) {
            debugLogger.messaging.trace('useMessageSubscription', 'status', {
              channel: channelName,
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
                channel: channelName,
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
        cleanup();
      };
    };

    const handleGlobalInsert = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      if (!payload.new) return;
      const message = mapRowToMessage(payload.new);

      appendMessageToCache(queryClient, message);

      if (ignoreSenderId && message.senderId === ignoreSenderId) {
        return;
      }

      const callback = onInsertRef.current;
      if (callback) {
        callback(message);
      }
    };

    const handleConversationChange =
      (conversationId: string) =>
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const eventType = payload.eventType;

        if (eventType === 'INSERT' && payload.new) {
          const message = mapRowToMessage(payload.new);
          appendMessageToCache(queryClient, message);

          const callback = onInsertRef.current;
          if (!ignoreSenderId || message.senderId !== ignoreSenderId) {
            if (callback) {
              callback(message);
            }
          }
          return;
        }

        if (eventType === 'UPDATE' && payload.new) {
          updateMessageInCache(queryClient, conversationId, payload.new);
          return;
        }

        if (eventType === 'DELETE' && payload.old) {
          removeMessageFromCache(queryClient, conversationId, payload.old);
        }
      };

    const shouldSubscribeGlobally = featureFlagEnabled || ids.length === 0;
    if (shouldSubscribeGlobally) {
      teardownFns.push(
        subscribeWithRetry(
          'messages:all',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          handleGlobalInsert
        )
      );
    }

    ids.forEach((conversationId) => {
      teardownFns.push(
        subscribeWithRetry(
          `messages:${conversationId}`,
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          handleConversationChange(conversationId)
        )
      );
    });

    // Subscribe to reaction changes globally to handle reactions across all visible messages
    const handleReactionChange = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      const eventType = payload.eventType;
      
      if (eventType === 'INSERT' && payload.new) {
        const messageId = payload.new.message_id as string;
        const userId = payload.new.user_id as string;
        const emoji = payload.new.emoji as string;
        const timestampValue = payload.new.created_at ?? payload.new.timestamp;
        const timestamp = timestampValue ? new Date(timestampValue as string) : new Date();
        handleReactionUpdate(queryClient, messageId, userId, emoji, 'INSERT', timestamp);
      } else if (eventType === 'DELETE' && payload.old) {
        const messageId = payload.old.message_id as string;
        const userId = payload.old.user_id as string;
        const emoji = payload.old.emoji as string;
        handleReactionUpdate(queryClient, messageId, userId, emoji, 'DELETE', new Date());
      }
    };

    teardownFns.push(
      subscribeWithRetry(
        'message_reactions:all',
        { event: '*', schema: 'public', table: 'message_reactions' },
        handleReactionChange
      )
    );

    return () => {
      isMounted = false;
      teardownFns.forEach((teardown) => teardown());
      setStatus(null);
    };
  }, [subscriptionKey, ignoreSenderId, isActive, queryClient]);

  return { status };
}
