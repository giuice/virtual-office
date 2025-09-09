// src/hooks/useMessages.ts
import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Message,
  MessageStatus,
  MessageType,
  FileAttachment,
} from '@/types/messaging';
import { messagingApi } from '@/lib/messaging-api';
import { useMessageRealtime } from '@/hooks/realtime/useMessageRealtime';

export function useMessages(activeConversationId: string | null) {
  const queryClient = useQueryClient();
  const { currentUserProfile } = useCompany();

  // Subscribe to realtime updates that write into the cache
  useMessageRealtime(activeConversationId);

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
        return { messages: [], hasMore: false, nextCursor: undefined };
      }
      const res = await messagingApi.getMessages(activeConversationId, {
        limit: 20,
        direction: 'older',
        cursor: pageParam,
      });
      return res; // { messages, hasMore, nextCursor }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const messages: Message[] = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((p) => p.messages);
  }, [data]);

  const loadingMessages = isLoading || isFetching;
  const errorMessages = error ? (error as Error).message : null;
  const hasMoreMessages = !!hasNextPage;

  const refreshMessages = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const loadMoreMessages = useCallback(async () => {
    if (!hasNextPage) return;
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage]);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        replyToId?: string;
        attachments?: FileAttachment[];
        type?: MessageType;
      }
    ) => {
      if (!currentUserProfile?.id || !activeConversationId || !content.trim()) return;

      const now = new Date();
      const optimisticMessage: Message = {
        id: `temp-${now.getTime()}`,
        conversationId: activeConversationId,
        senderId: currentUserProfile.id, // DB ID for UI representation
        content: content.trim(),
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

      try {
        // Server derives sender from session; do not send senderId
        const savedMessage = await messagingApi.sendMessage({
          conversationId: activeConversationId,
          content: content.trim(),
          replyToId: options?.replyToId,
          attachments: options?.attachments,
          type: options?.type || MessageType.TEXT,
        });

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
      if (!activeConversationId) return;
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
      if (!activeConversationId) return;
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