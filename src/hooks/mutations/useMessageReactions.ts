// src/hooks/mutations/useMessageReactions.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Message, MessageReaction } from '@/types/messaging';
import { debugLogger } from '@/utils/debug-logger';
import { toast } from 'sonner';
import { useCompany } from '@/contexts/CompanyContext';

type MessagesInfiniteData = {
  pages: Array<{
    messages: Message[];
    hasMoreOlder?: boolean;
    nextCursorBefore?: string;
  }>;
  pageParams: unknown[];
};

interface ReactionMutationParams {
  messageId: string;
  emoji: string;
}

interface ReactionResponse {
  message: string;
  action: 'added' | 'removed';
}

export function useMessageReactions() {
  const queryClient = useQueryClient();
  const { currentUserProfile } = useCompany();
  
  // Track pending mutations to prevent duplicates
  const pendingMutations = new Map<string, boolean>();

  const addReactionMutation = useMutation<
    ReactionResponse,
    Error,
    ReactionMutationParams,
    { previousData: Array<[any, any]> }
  >({
    mutationFn: async ({ messageId, emoji }) => {
      const response = await fetch('/api/messages/react', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId, emoji }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to add reaction');
      }

      return response.json();
    },
    onMutate: async ({ messageId, emoji }) => {
      debugLogger.messaging.event('reaction-mutation', 'optimistic-update', {
        messageId,
        emoji,
      });

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages'] });

      // Snapshot previous value
      const previousData = queryClient.getQueriesData<MessagesInfiniteData>({
        queryKey: ['messages'],
      });

      // Optimistically update cache
      queryClient.setQueriesData<MessagesInfiniteData>(
        { queryKey: ['messages'] },
        (oldData) => {
          if (!oldData?.pages) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) => {
                if (msg.id !== messageId) return msg;

                const reactions = [...msg.reactions];
                const currentUserId = currentUserProfile?.id;
                
                if (!currentUserId) return msg;
                
                const existingIndex = reactions.findIndex(
                  (r) => r.emoji === emoji && r.userId === currentUserId
                );

                if (existingIndex >= 0) {
                  // Remove reaction
                  reactions.splice(existingIndex, 1);
                } else {
                  // Add reaction
                  reactions.push({
                    emoji,
                    userId: currentUserId,
                    timestamp: new Date(),
                  });
                }

                return {
                  ...msg,
                  reactions,
                };
              }),
            })),
          };
        }
      );

      return { previousData };
    },
    onError: (error, { messageId, emoji }, context) => {
      debugLogger.messaging.error('reaction-mutation', 'failed', {
        messageId,
        emoji,
        error: error.message,
      });

      // Rollback optimistic update
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]: [any, any]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }

      toast.error('Failed to update reaction', {
        description: error.message,
        action: {
          label: 'Retry',
          onClick: () => addReactionMutation.mutate({ messageId, emoji }),
        },
      });
    },
    onSuccess: (data, { messageId, emoji }) => {
      debugLogger.messaging.event('reaction-mutation', 'success', {
        messageId,
        emoji,
        action: data.action,
      });

      // Invalidate to sync with server state
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const toggleReaction = (messageId: string, emoji: string) => {
    const key = `${messageId}-${emoji}`;
    
    // Prevent duplicate mutations for the same message/emoji combination
    if (pendingMutations.get(key)) {
      debugLogger.messaging.event('reaction-mutation', 'debounced', { messageId, emoji });
      return;
    }
    
    pendingMutations.set(key, true);
    addReactionMutation.mutate(
      { messageId, emoji },
      {
        onSettled: () => {
          pendingMutations.delete(key);
        },
      }
    );
  };

  return {
    toggleReaction,
    isLoading: addReactionMutation.isPending,
  };
}
