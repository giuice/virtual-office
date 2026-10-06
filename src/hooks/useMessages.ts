// src/hooks/useMessages.ts
import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Message,
  MessageStatus,
  MessageType,
  FileAttachment,
  type MessageHistorySearchResult,
} from '@/types/messaging';
import { messagingApi } from '@/lib/messaging-api';
import { toggleReactionInPages } from '@/lib/messaging/reaction-cache';
import { attachmentMessageType } from '@/lib/messaging/attachment-policy';
import {
  appendMessageToPages,
  keepMessageThroughInflightFetch,
  replaceMessageInPages,
  type MessagesInfiniteData,
} from '@/lib/messaging/message-cache';
import { debugLogger } from '@/utils/debug-logger';
import { toast } from 'sonner';

const getTimestamp = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const createTraceId = (prefix: string): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    // Ignore and fallback to timestamp-based identifier
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const MESSAGES_PAGE_SIZE = 20;

/**
 * Upper bound on fetch rounds while searching history for one message (each
 * round loads an older page or waits for a fetch already running): about
 * MAX_HISTORY_SEARCH_ROUNDS * MESSAGES_PAGE_SIZE messages.
 */
const MAX_HISTORY_SEARCH_ROUNDS = 100;

const pagesContainMessage = (data: MessagesInfiniteData | undefined, messageId: string): boolean =>
  data?.pages.some((page) => page.messages.some((message) => message.id === messageId)) ?? false;

export function useMessages(activeConversationId: string | null) {
  const queryClient = useQueryClient();
  const { currentUserProfile } = useCompany();

  // Realtime is handled by a dedicated hook: useMessageSubscription.
  // Audit M-07: caches for other conversations are intentionally kept —
  // switching back reuses them; TanStack's gcTime evicts idle ones.

  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['messages', activeConversationId],
    enabled: !!activeConversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!activeConversationId) {
        return { messages: [], hasMoreOlder: false, nextCursorBefore: undefined };
      }
      // When pageParam is provided, it is an opaque keyset cursor produced by
      // the server (composite "timestamp|id")
      const res = await messagingApi.getMessages(activeConversationId, {
        limit: MESSAGES_PAGE_SIZE,
        cursorBefore: pageParam,
      });
      return res; // { messages, hasMoreOlder, nextCursorBefore }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursorBefore,
  });

  const messages: Message[] = useMemo(() => {
    if (!data?.pages) return [];
    // Pages are returned Newest -> Oldest (Page 0 is newest)
    // We want to display Oldest -> Newest
    // So we reverse the pages array before flattening
    const flattened = [...data.pages].reverse().flatMap((p) => p.messages);
    return flattened;
  }, [data]);

  // Initial load only. Background refetches (realtime/receipt invalidations,
  // focus) and older-page fetches must not swap the feed for a skeleton: that
  // unmounts the composer and discards whatever the user is typing.
  const loadingMessages = isLoading;
  const loadingMoreMessages = isFetchingNextPage;
  // A failed "Load more" keeps the loaded feed (below); the feed says so next
  // to the button until the user retries or opens another conversation. Kept
  // here rather than read from the query: a background refetch of the loaded
  // pages (e.g. a receipt invalidation) would clear the query error first.
  const [loadMoreFailedConversationId, setLoadMoreFailedConversationId] = useState<string | null>(null);
  const loadMoreMessagesFailed =
    activeConversationId !== null && loadMoreFailedConversationId === activeConversationId;
  // Only a conversation that never loaded shows the error state. Once the
  // feed has messages, a failed older page or background refetch keeps them
  // on screen (a member who lost access keeps a stable feed, FR-022).
  const errorMessages = error && !data ? (error as Error).message : null;
  const hasMoreMessages = !!hasNextPage;

  const refreshMessages = useCallback(async () => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('useMessages.refreshMessages', 'start', {
        conversationId: activeConversationId,
      });
    }

    await refetch();

    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('useMessages.refreshMessages', 'finish', {
        conversationId: activeConversationId,
      });
    }
  }, [activeConversationId, refetch]);

  const loadMoreMessages = useCallback(async () => {
    if (!hasNextPage) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useMessages.loadMoreMessages', 'skip:no-more-pages', {
          conversationId: activeConversationId,
        });
      }
      return;
    }

    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('useMessages.loadMoreMessages', 'start', {
        conversationId: activeConversationId,
      });
    }

    setLoadMoreFailedConversationId(null);
    const result = await fetchNextPage();
    if (result.isError) setLoadMoreFailedConversationId(activeConversationId);

    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('useMessages.loadMoreMessages', 'finish', {
        conversationId: activeConversationId,
        failed: result.isError,
      });
    }
  }, [activeConversationId, fetchNextPage, hasNextPage]);

  /**
   * Loads older pages of the active conversation until `messageId` is in the
   * feed (Phase 4 FR-022). Every round re-reads the cache, so it survives
   * fetches it does not own: a refetch that cancels its older-page request
   * (or one already running) is awaited and the search continues from the
   * pages the cache then holds. It stops when the message is loaded, the
   * history ends without it, a page fails (e.g. 403 after losing access),
   * `signal` aborts, or after MAX_HISTORY_SEARCH_ROUNDS rounds.
   */
  const loadHistoryUntilMessage = useCallback(
    async (messageId: string, signal: AbortSignal): Promise<MessageHistorySearchResult> => {
      if (!activeConversationId) return 'unavailable';
      const queryKey = ['messages', activeConversationId];

      for (let round = 0; round < MAX_HISTORY_SEARCH_ROUNDS; round += 1) {
        if (signal.aborted) return 'cancelled';
        const query = queryClient.getQueryCache().find({ queryKey, exact: true });
        if (!query) return 'unavailable';
        const data = query.state.data as MessagesInfiniteData | undefined;
        if (pagesContainMessage(data, messageId)) return 'found';

        const isFetching = query.state.fetchStatus === 'fetching';
        if (!isFetching && !data?.pages.at(-1)?.nextCursorBefore) {
          // History exhausted (or never loaded) without the message.
          return 'unavailable';
        }

        const failuresBefore = query.state.errorUpdateCount;
        // Without cancelRefetch a fetch already in flight is awaited instead
        // of being cancelled; the next round then loads the next older page.
        await fetchNextPage({ cancelRefetch: false });
        if (query.state.errorUpdateCount > failuresBefore) {
          if (signal.aborted) return 'cancelled';
          return pagesContainMessage(
            queryClient.getQueryData<MessagesInfiniteData>(queryKey),
            messageId
          )
            ? 'found'
            : 'unavailable';
        }
      }

      if (signal.aborted) return 'cancelled';
      return pagesContainMessage(queryClient.getQueryData<MessagesInfiniteData>(queryKey), messageId)
        ? 'found'
        : 'unavailable';
    },
    [activeConversationId, fetchNextPage, queryClient]
  );

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        replyToId?: string;
        attachments?: FileAttachment[];
        type?: MessageType;
        // Composition key (FR-024): a retry with the same key gets back the
        // message already stored, which then replaces this optimistic copy.
        clientMessageId?: string;
      }
    ) => {
      const trimmedContent = content.trim();
      const attachments = options?.attachments?.length ? options.attachments : undefined;
      // Attachment messages take their type from their files, as the server
      // derives it (all images → image, otherwise file).
      const messageType = attachments
        ? attachmentMessageType(attachments.map((attachment) => attachment.type))
        : options?.type || MessageType.TEXT;
      const instrumentationEnabled = debugLogger.messaging.enabled();
      const traceId = instrumentationEnabled ? createTraceId('hook-send') : '';

      if (!currentUserProfile?.id || !activeConversationId || (!trimmedContent && !attachments)) {
        if (instrumentationEnabled) {
          debugLogger.messaging.trace('useMessages.sendMessage', 'skip:missing-context', {
            traceId,
            hasProfile: Boolean(currentUserProfile?.id),
            conversationId: activeConversationId,
            hasContent: Boolean(trimmedContent),
          });
        }
        return;
      }

      const start = instrumentationEnabled ? getTimestamp() : 0;
      if (instrumentationEnabled) {
        debugLogger.messaging.event('useMessages.sendMessage', 'optimistic:start', {
          traceId,
          conversationId: activeConversationId,
          contentLength: trimmedContent.length,
          type: messageType,
          attachments: attachments?.length || 0,
        });
      }

      const now = new Date();
      const optimisticMessage: Message = {
        id: `temp-${now.getTime()}`,
        conversationId: activeConversationId,
        senderId: currentUserProfile.id, // DB ID for UI representation
        content: trimmedContent,
        timestamp: now,
        status: MessageStatus.SENDING,
        type: messageType,
        replyToId: options?.replyToId,
        attachments,
        reactions: [],
        isEdited: false,
      };

      // Optimistically add to page 0 (newest window) via the shared helper (B-04)
      queryClient.setQueryData<MessagesInfiniteData | undefined>(
        ['messages', activeConversationId],
        (oldData) => appendMessageToPages(oldData, optimisticMessage)
      );

      if (instrumentationEnabled) {
        debugLogger.messaging.event('useMessages.sendMessage', 'optimistic:applied', {
          traceId,
          optimisticId: optimisticMessage.id,
          conversationId: activeConversationId,
        });
      }

      try {
        // Server derives sender from session; do not send senderId
        const savedMessage = await messagingApi.sendMessage(
          {
            conversationId: activeConversationId,
            content: trimmedContent,
            replyToId: options?.replyToId,
            type: messageType,
          },
          {
            clientMessageId: options?.clientMessageId,
            attachmentIds: attachments?.map((attachment) => attachment.id),
          }
        );

        if (instrumentationEnabled) {
          const duration = start ? getTimestamp() - start : 0;
          if (start) {
            debugLogger.messaging.metric('useMessages.sendMessage', 'roundtrip', duration, {
              traceId,
              conversationId: activeConversationId,
              messageId: savedMessage.id,
            });
          }
          debugLogger.messaging.event('useMessages.sendMessage', 'api:success', {
            traceId,
            messageId: savedMessage.id,
            status: savedMessage.status,
          });
        }

        // Replace optimistic with saved (drops the temp copy if realtime
        // already delivered the saved id)
        queryClient.setQueryData<MessagesInfiniteData | undefined>(
          ['messages', activeConversationId],
          (oldData) => replaceMessageInPages(oldData, optimisticMessage.id, savedMessage)
        );
        keepMessageThroughInflightFetch(queryClient, activeConversationId, savedMessage);
        return savedMessage;
      } catch (err) {
        if (instrumentationEnabled) {
          const duration = start ? getTimestamp() - start : 0;
          debugLogger.messaging.error('useMessages.sendMessage', 'api:error', {
            traceId,
            conversationId: activeConversationId,
            duration,
            error: err instanceof Error ? err.message : err,
          });
        }
        // Remove the optimistic message on failure so UI does not show a failed temp message
        queryClient.setQueryData<MessagesInfiniteData | undefined>(
          ['messages', activeConversationId],
          (oldData) => {
            if (!oldData || !oldData.pages) return oldData;
            const updatedPages = oldData.pages.map((page) => ({
              ...page,
              messages: page.messages.filter((m) => m.id !== optimisticMessage.id),
            }));
            return { ...oldData, pages: updatedPages };
          }
        );
        throw err;
      }
    },
    [activeConversationId, currentUserProfile?.id, queryClient]
  );

  const updateMessageStatusLocal = useCallback(
    (messageId: string, status: MessageStatus) => {
      if (!activeConversationId) {
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useMessages.updateMessageStatusLocal', 'skip:no-active-conversation', {
            messageId,
            status,
          });
        }
        return;
      }

      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useMessages.updateMessageStatusLocal', 'apply', {
          conversationId: activeConversationId,
          messageId,
          status,
        });
      }
      queryClient.setQueryData(
        ['messages', activeConversationId],
        (oldData:
          | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
          | undefined) => {
          if (!oldData || !oldData.pages) return oldData;
          const updatedPages = oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (m.id === messageId ? { ...m, status } : m)),
          }));
          return { ...oldData, pages: updatedPages };
        }
      );
    },
    [activeConversationId, queryClient]
  );

  const addMessage = useCallback(
    (message: Message) => {
      if (!activeConversationId) {
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useMessages.addMessage', 'skip:no-active-conversation', {
            messageId: message.id,
            incomingConversationId: message.conversationId,
          });
        }
        return;
      }

      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('useMessages.addMessage', 'incoming', {
          conversationId: activeConversationId,
          messageId: message.id,
          status: message.status,
          senderId: message.senderId,
        });
      }
      queryClient.setQueryData<MessagesInfiniteData | undefined>(
        ['messages', activeConversationId],
        (oldData) => appendMessageToPages(oldData, message)
      );
    },
    [activeConversationId, queryClient]
  );

  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserProfile?.id || !activeConversationId) return;

      const instrumentationEnabled = debugLogger.messaging.enabled();
      if (instrumentationEnabled) {
        debugLogger.messaging.event('useMessages.addReaction', 'toggle-start', {
          messageId,
          emoji,
          conversationId: activeConversationId,
        });
      }

      // Snapshot current state for rollback
      const previousData = queryClient.getQueryData(['messages', activeConversationId]);

      try {
        // Optimistic toggle
        queryClient.setQueryData(
          ['messages', activeConversationId],
          (oldData:
            | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
            | undefined) => {
            if (!oldData || !oldData.pages) return oldData;

            const nextPages = toggleReactionInPages({
              pages: oldData.pages,
              messageId,
              emoji,
              userId: currentUserProfile.id,
              timestamp: new Date(),
              mode: 'toggle',
            });

            if (nextPages === oldData.pages) {
              return oldData;
            }

            return { ...oldData, pages: nextPages };
          }
        );

        const result = await messagingApi.toggleReaction(messageId, emoji);

        if (instrumentationEnabled) {
          debugLogger.messaging.event('useMessages.addReaction', 'toggle-success', {
            messageId,
            emoji,
            action: result.action,
          });
        }
      } catch (error) {
        // Rollback optimistic update
        queryClient.setQueryData(['messages', activeConversationId], previousData);

        debugLogger.messaging.error('useMessages.addReaction', 'toggle-error', {
          messageId,
          emoji,
          error: error instanceof Error ? error.message : String(error),
        });

        console.error('Error toggling reaction:', error);
        toast.error('Failed to update reaction', {
          description: error instanceof Error ? error.message : String(error),
          action: {
            label: 'Retry',
            onClick: () => addReaction(messageId, emoji),
          },
        });
        throw error;
      }
    },
    [activeConversationId, currentUserProfile?.id, queryClient]
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      // Delegate to addReaction since the API handles toggle logic
      return addReaction(messageId, emoji);
    },
    [addReaction]
  );

  const uploadAttachment = useCallback(
    async (file: File, messageId?: string): Promise<FileAttachment> => {
      if (!activeConversationId) {
        throw new Error('No active conversation');
      }
      try {
        return await messagingApi.uploadMessageAttachment(file, activeConversationId, messageId);
      } catch (error) {
        console.error('Error uploading attachment:', error);
        throw error as Error;
      }
    },
    [activeConversationId]
  );

  return {
    messages,
    loadingMessages,
    loadingMoreMessages,
    loadMoreMessagesFailed,
    errorMessages,
    hasMoreMessages,
    refreshMessages,
    loadMoreMessages,
    loadHistoryUntilMessage,
    sendMessage,
    updateMessageStatusLocal,
    addMessage,
    addReaction,
    removeReaction,
    uploadAttachment,
  };
}
