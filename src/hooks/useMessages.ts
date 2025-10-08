// src/hooks/useMessages.ts
import React, { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Message,
  MessageStatus,
  MessageType,
  FileAttachment,
} from '@/types/messaging';
import { messagingApi } from '@/lib/messaging-api';
import { debugLogger } from '@/utils/debug-logger';

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

export function useMessages(activeConversationId: string | null) {
  const queryClient = useQueryClient();
  const { currentUserProfile } = useCompany();

  // Realtime is handled by a dedicated hook: useMessageSubscription

  // Clear cache when conversation changes to prevent stale data
  React.useEffect(() => {
    if (activeConversationId) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useMessages.cache', 'conversation-change', {
          conversationId: activeConversationId,
        });
      }
      // Optional: Remove queries for all other conversations to save memory
      queryClient.removeQueries({ 
        queryKey: ['messages'], 
        predicate: (query) => {
          const [, conversationId] = query.queryKey;
          return conversationId !== activeConversationId;
        }
      });
    }
  }, [activeConversationId, queryClient]);

  const {
    data,
    isLoading,
    isFetching,
    isRefetching,
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
      // When pageParam is provided, it is the oldest visible timestamp (ISO)
      const res = await messagingApi.getMessages(activeConversationId, {
        limit: 20,
        cursorBefore: pageParam,
      });
      return res; // { messages, hasMoreOlder, nextCursorBefore }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursorBefore,
  });

  const messages: Message[] = useMemo(() => {
    if (!data?.pages) return [];
    // Pages represent windows from older->newer already; flatten preserves order
    return data.pages.flatMap((p) => p.messages);
  }, [data]);

  const loadingMessages = isLoading || isFetching;
  const errorMessages = error ? (error as Error).message : null;
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

    await fetchNextPage();

    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('useMessages.loadMoreMessages', 'finish', {
        conversationId: activeConversationId,
      });
    }
  }, [activeConversationId, fetchNextPage, hasNextPage]);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        replyToId?: string;
        attachments?: FileAttachment[];
        type?: MessageType;
      }
    ) => {
      const trimmedContent = content.trim();
      const instrumentationEnabled = debugLogger.messaging.enabled();
      const traceId = instrumentationEnabled ? createTraceId('hook-send') : '';

      if (!currentUserProfile?.id || !activeConversationId || !trimmedContent) {
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
          type: options?.type || MessageType.TEXT,
          attachments: options?.attachments?.length || 0,
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
        type: options?.type || MessageType.TEXT,
        replyToId: options?.replyToId,
        attachments: options?.attachments,
        reactions: [],
        isEdited: false,
      };

      // Optimistically add to the last page in cache
      queryClient.setQueryData(
        ['messages', activeConversationId],
        (oldData:
          | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
          | undefined) => {
          if (!oldData || !oldData.pages) {
            return { pages: [{ messages: [optimisticMessage], hasMore: false }], pageParams: [undefined] };
          }
          const updatedPages = [...oldData.pages];
          const lastIdx = updatedPages.length - 1;
          updatedPages[lastIdx] = {
            ...updatedPages[lastIdx],
            messages: [...updatedPages[lastIdx].messages, optimisticMessage],
          };
          return { ...oldData, pages: updatedPages };
        }
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
        const savedMessage = await messagingApi.sendMessage({
          conversationId: activeConversationId,
          content: trimmedContent,
          replyToId: options?.replyToId,
          attachments: options?.attachments,
          type: options?.type || MessageType.TEXT,
        });

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

        // Replace optimistic with saved
        queryClient.setQueryData(
          ['messages', activeConversationId],
          (oldData:
            | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
            | undefined) => {
            if (!oldData || !oldData.pages) return oldData;
            const updatedPages = oldData.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => (m.id === optimisticMessage.id ? savedMessage : m)),
            }));
            return { ...oldData, pages: updatedPages };
          }
        );
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
        // Mark optimistic as failed
        queryClient.setQueryData(
          ['messages', activeConversationId],
          (oldData:
            | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
            | undefined) => {
            if (!oldData || !oldData.pages) return oldData;
            const updatedPages = oldData.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === optimisticMessage.id ? { ...m, status: MessageStatus.FAILED } : m
              ),
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
      queryClient.setQueryData(
        ['messages', activeConversationId],
        (oldData:
          | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
          | undefined) => {
          if (!oldData || !oldData.pages) {
            return { pages: [{ messages: [message], hasMore: false }], pageParams: [undefined] };
          }
          const updatedPages = [...oldData.pages];
          const lastIdx = updatedPages.length - 1;
          updatedPages[lastIdx] = {
            ...updatedPages[lastIdx],
            messages: [...updatedPages[lastIdx].messages, message],
          };
          return { ...oldData, pages: updatedPages };
        }
      );
    },
    [activeConversationId, queryClient]
  );

  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserProfile?.id || !activeConversationId) return;
      try {
        // Optimistic add
        queryClient.setQueryData(
          ['messages', activeConversationId],
          (oldData:
            | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
            | undefined) => {
            if (!oldData || !oldData.pages) return oldData;
            const updatedPages = oldData.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== messageId) return m;
                const reactions = [...(m.reactions || [])];
                const exists = reactions.find(
                  (r) => r.userId === currentUserProfile.id && r.emoji === emoji
                );
                if (!exists) {
                  reactions.push({ userId: currentUserProfile.id, emoji, timestamp: new Date() });
                }
                return { ...m, reactions };
              }),
            }));
            return { ...oldData, pages: updatedPages };
          }
        );

        await messagingApi.addReaction(messageId, emoji, currentUserProfile.id);
      } catch (error) {
        // On error, we could revert, but for now just log
        console.error('Error adding reaction:', error);
      }
    },
    [activeConversationId, currentUserProfile?.id, queryClient]
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserProfile?.id || !activeConversationId) return;
      try {
        // Optimistic remove
        queryClient.setQueryData(
          ['messages', activeConversationId],
          (oldData:
            | { pages: Array<{ messages: Message[]; hasMore: boolean; nextCursor?: string }>; pageParams: any[] }
            | undefined) => {
            if (!oldData || !oldData.pages) return oldData;
            const updatedPages = oldData.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => {
                if (m.id !== messageId) return m;
                const reactions = (m.reactions || []).filter(
                  (r) => !(r.userId === currentUserProfile.id && r.emoji === emoji)
                );
                return { ...m, reactions };
              }),
            }));
            return { ...oldData, pages: updatedPages };
          }
        );

        await messagingApi.removeReaction(messageId, emoji, currentUserProfile.id);
      } catch (error) {
        console.error('Error removing reaction:', error);
      }
    },
    [activeConversationId, currentUserProfile?.id, queryClient]
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
    errorMessages,
    hasMoreMessages,
    refreshMessages,
    loadMoreMessages,
    sendMessage,
    updateMessageStatusLocal,
    addMessage,
    addReaction,
    removeReaction,
    uploadAttachment,
  };
}
