// src/hooks/useConversations.ts
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompany } from '@/contexts/CompanyContext';
import { Conversation, ConversationType } from '@/types/messaging';
import { messagingApi } from '@/lib/messaging-api';
import { useConversationRealtime } from '@/hooks/realtime/useConversationRealtime';
import { debugLogger } from '@/utils/debug-logger';

// Query key shared with useConversationRealtime invalidations (audit B-06):
// both sides MUST use ['conversations', <DB user id>].
export const conversationsQueryKey = (userId: string | undefined) =>
  ['conversations', userId] as const;

const NO_CONVERSATIONS: Conversation[] = [];

// Archive is a per-user preference (audit M-02); keep the effective flag and
// the preference object in sync on optimistic updates.
const applyArchiveState = (conversation: Conversation, isArchived: boolean): Conversation => ({
  ...conversation,
  isArchived,
  preferences: conversation.preferences
    ? { ...conversation.preferences, isArchived }
    : conversation.preferences,
});

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

export function useConversations() {
  const { currentUserProfile } = useCompany();
  const queryClient = useQueryClient();
  const userId = currentUserProfile?.id;

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const lastActiveConversationRef = useRef<Conversation | null>(null);

  // Subscribe to realtime updates using the Database User ID (canonical).
  // Invalidations target the same query key as the query below.
  useConversationRealtime(userId);

  useEffect(() => {
    if (!debugLogger.messaging.enabled()) {
      return;
    }

    if (!userId) {
      debugLogger.messaging.trace('useConversations.realtime', 'skip:no-user');
      return;
    }

    debugLogger.messaging.trace('useConversations.realtime', 'subscribe', {
      userId,
    });
  }, [userId]);

  if (activeConversation?.type === ConversationType.DIRECT) {
    lastActiveConversationRef.current = activeConversation;
  }
  const lastActiveConversation = activeConversation?.type === ConversationType.DIRECT
    ? activeConversation
    : lastActiveConversationRef.current;

  const conversationsQuery = useQuery<Conversation[], Error>({
    queryKey: conversationsQueryKey(userId),
    queryFn: async () => {
      // Query conversations by Database User ID
      const result = await messagingApi.getConversations(userId!);
      return result.conversations;
    },
    enabled: !!userId,
    // Realtime invalidation (useConversationRealtime) is the primary freshness
    // signal; staleTime only guards against redundant mount refetches.
    staleTime: 30_000,
  });

  const conversations = conversationsQuery.data ?? NO_CONVERSATIONS;
  const loadingConversations = conversationsQuery.isLoading;
  const refreshingConversations = conversationsQuery.isFetching && !conversationsQuery.isLoading;
  const hasLoadedConversations = conversationsQuery.isSuccess;
  const errorConversations = conversationsQuery.isError ? 'Failed to load conversations' : null;

  // Imperative cache reader — the fix for the stale-closure retries in
  // ensureOpenForMessage (audit B-07): always reflects the latest fetch.
  const getCachedConversations = useCallback((): Conversation[] => {
    if (!userId) return NO_CONVERSATIONS;
    return queryClient.getQueryData<Conversation[]>(conversationsQueryKey(userId)) ?? NO_CONVERSATIONS;
  }, [queryClient, userId]);

  const setConversationsData = useCallback(
    (updater: (prev: Conversation[]) => Conversation[]) => {
      if (!userId) return;
      queryClient.setQueryData<Conversation[]>(
        conversationsQueryKey(userId),
        (prev) => updater(prev ?? NO_CONVERSATIONS)
      );
    },
    [queryClient, userId]
  );

  const upsertConversation = useCallback(
    (conversation: Conversation) => {
      setConversationsData((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === conversation.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = conversation;
          return updated;
        }
        return [conversation, ...prev];
      });
    },
    [setConversationsData]
  );

  // Function to refresh conversations (invalidate + refetch via the query)
  const refreshConversations = useCallback(async () => {
    if (!userId) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useConversations.refresh', 'skip:no-user');
      }
      return;
    }
    await queryClient.invalidateQueries({ queryKey: conversationsQueryKey(userId) });
  }, [queryClient, userId]);

  const clearLastActiveConversation = useCallback(() => {
    lastActiveConversationRef.current = null;
  }, []);

  // Function to get or create a room conversation
  const getOrCreateRoomConversation = useCallback(async (roomId: string, roomName: string): Promise<Conversation> => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('room-conv') : '';

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.room', 'start', {
        traceId,
        roomId,
        roomName,
        userId,
      });
    }

    try {
      const existingConversation = getCachedConversations().find(
        (c) => c.type === ConversationType.ROOM && 'roomId' in c && c.roomId === roomId
      );

      if (existingConversation) {
        if (instrumentationEnabled) {
          debugLogger.messaging.event('useConversations.room', 'hit:existing', {
            traceId,
            roomId,
            conversationId: existingConversation.id,
          });
        }
        return existingConversation;
      }

      const resolvedConversation = await messagingApi.resolveConversation({
        type: ConversationType.ROOM,
        roomId,
      });

      if (instrumentationEnabled) {
        debugLogger.messaging.event('useConversations.room', 'created', {
          traceId,
          roomId,
          conversationId: resolvedConversation.id,
        });
      }

      upsertConversation(resolvedConversation);

      return resolvedConversation;
    } catch (error) {
      if (instrumentationEnabled) {
        debugLogger.messaging.error('useConversations.room', 'error', {
          traceId,
          roomId,
          error: error instanceof Error ? error.message : error,
        });
      }
      console.error('Error creating room conversation:', error);
      throw error;
    }
  }, [userId, getCachedConversations, upsertConversation]);

  // Function to get or create a direct conversation with another user
  const getOrCreateUserConversation = useCallback(async (otherUserId: string): Promise<Conversation> => {
    if (!userId) {
      throw new Error('User not authenticated');
    }
    // Compare Database User IDs to prevent self-DM
    if (userId === otherUserId) {
      throw new Error('Cannot create conversation with yourself');
    }
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('direct-conv') : '';

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.direct', 'start', {
        traceId,
        userId,
        otherUserId,
      });
    }

    try {
      const existingConversation = getCachedConversations().find(
        (c) => c.type === ConversationType.DIRECT &&
             c.participants.includes(userId) &&
             c.participants.includes(otherUserId) &&
             c.participants.length === 2
      );

      if (existingConversation) {
        if (instrumentationEnabled) {
          debugLogger.messaging.event('useConversations.direct', 'hit:existing', {
            traceId,
            conversationId: existingConversation.id,
            otherUserId,
          });
        }
        return existingConversation;
      }

      const resolvedConversation = await messagingApi.resolveConversation({
        type: ConversationType.DIRECT,
        userId: otherUserId,
      });

      if (instrumentationEnabled) {
        debugLogger.messaging.event('useConversations.direct', 'created', {
          traceId,
          conversationId: resolvedConversation.id,
          otherUserId,
        });
      }

      upsertConversation(resolvedConversation);

      return resolvedConversation;
    } catch (error) {
      if (instrumentationEnabled) {
        debugLogger.messaging.error('useConversations.direct', 'error', {
          traceId,
          otherUserId,
          error: error instanceof Error ? error.message : error,
        });
      }
      console.error('Error creating direct conversation:', error);
      throw error;
    }
  }, [userId, getCachedConversations, upsertConversation]);

  // Function to archive a conversation
  const archiveConversation = useCallback(async (conversationId: string) => {
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('archive-conv') : '';

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.archive', 'start', {
        traceId,
        conversationId,
        userId,
      });
    }

    // Optimistic update first (archive is per-user — audit M-02: keep the
    // effective flag and the preference in sync)
    setConversationsData((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? applyArchiveState(conversation, true)
          : conversation
      )
    );

    // If this was the active conversation, clear it
    if (activeConversation && activeConversation.id === conversationId) {
      setActiveConversation(null);
    }

    try {
      await messagingApi.setConversationArchiveStatus(conversationId, currentUserProfile!.id, true);
      if (instrumentationEnabled) {
        debugLogger.messaging.event('useConversations.archive', 'success', { traceId, conversationId });
      }
    } catch (error) {
      // Revert on error
      setConversationsData((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? applyArchiveState(conversation, false)
            : conversation
        )
      );
      if (instrumentationEnabled) {
        debugLogger.messaging.error('useConversations.archive', 'error', {
          traceId,
          conversationId,
          error: error instanceof Error ? error.message : error,
        });
      }
      console.error('Error archiving conversation:', error);
      throw error;
    }
  }, [activeConversation, currentUserProfile, userId, setConversationsData]);

  // Function to unarchive a conversation
  const unarchiveConversation = useCallback(async (conversationId: string) => {
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('unarchive-conv') : '';

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.unarchive', 'start', {
        traceId,
        conversationId,
        userId,
      });
    }
    // Optimistic update first
    setConversationsData((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? applyArchiveState(conversation, false)
          : conversation
      )
    );

    try {
      await messagingApi.setConversationArchiveStatus(conversationId, currentUserProfile!.id, false);
      if (instrumentationEnabled) {
        debugLogger.messaging.event('useConversations.unarchive', 'success', { traceId, conversationId });
      }
    } catch (error) {
      // Revert on error
      setConversationsData((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? applyArchiveState(conversation, true)
            : conversation
        )
      );
      if (instrumentationEnabled) {
        debugLogger.messaging.error('useConversations.unarchive', 'error', {
          traceId,
          conversationId,
          error: error instanceof Error ? error.message : error,
        });
      }
      console.error('Error unarchiving conversation:', error);
      throw error;
    }
  }, [currentUserProfile, userId, setConversationsData]);

  // Pin / Unpin conversations with optimistic updates
  const pinConversation = useCallback(async (conversationId: string) => {
    const traceId = debugLogger.messaging.enabled() ? createTraceId('pin-conv') : '';
    // Optimistic update - handle cases where preferences may not exist yet
    setConversationsData((prev) => prev.map((c) => {
      if (c.id !== conversationId) {
        return c;
      }
      // Create preferences if they don't exist
      const existingPrefs = c.preferences || {
        id: '',
        conversationId: c.id,
        userId: userId || '',
        isPinned: false,
        pinnedOrder: null,
        isStarred: false,
        isArchived: false,
        notificationsEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return {
        ...c,
        preferences: {
          ...existingPrefs,
          isPinned: true,
          pinnedOrder: existingPrefs.pinnedOrder ?? 0,
        },
      };
    }));
    try {
      await messagingApi.updateConversationPreferences(conversationId, { isPinned: true });
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('useConversations.pin', 'success', { traceId, conversationId });
      }
      // Refresh to get the real preferences from server
      await refreshConversations();
    } catch (error) {
      // Revert
      setConversationsData((prev) => prev.map((c) => {
        if (c.id !== conversationId) {
          return c;
        }
        if (!c.preferences) {
          return c;
        }
        return {
          ...c,
          preferences: {
            ...c.preferences,
            isPinned: false,
          },
        };
      }));
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.error('useConversations.pin', 'error', { traceId, conversationId, error: error instanceof Error ? error.message : error });
      }
      throw error;
    }
  }, [userId, refreshConversations, setConversationsData]);

  const unpinConversation = useCallback(async (conversationId: string) => {
    const traceId = debugLogger.messaging.enabled() ? createTraceId('unpin-conv') : '';
    // Optimistic update
    setConversationsData((prev) => prev.map((c) => {
      if (c.id !== conversationId) {
        return c;
      }
      if (!c.preferences) {
        return c;
      }
      return {
        ...c,
        preferences: {
          ...c.preferences,
          isPinned: false,
          pinnedOrder: null,
        },
      };
    }));
    try {
      await messagingApi.updateConversationPreferences(conversationId, { isPinned: false });
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('useConversations.unpin', 'success', { traceId, conversationId });
      }
      // Refresh to get the real preferences from server
      await refreshConversations();
    } catch (error) {
      // Revert
      setConversationsData((prev) => prev.map((c) => {
        if (c.id !== conversationId) {
          return c;
        }
        if (!c.preferences) {
          return c;
        }
        return {
          ...c,
          preferences: {
            ...c.preferences,
            isPinned: true,
          },
        };
      }));
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.error('useConversations.unpin', 'error', { traceId, conversationId, error: error instanceof Error ? error.message : error });
      }
      throw error;
    }
  }, [refreshConversations, setConversationsData]);

  // Function to mark a conversation as read
  const markConversationAsRead = useCallback(async (conversationId: string) => {
    if (!userId) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useConversations.markRead', 'skip:no-user', {
          conversationId,
        });
      }
      return;
    }

    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('mark-read') : '';

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.markRead', 'start', {
        traceId,
        conversationId,
        userId,
      });
    }

    try {
      await messagingApi.markConversationAsRead(conversationId, userId);

      // Optimistic update: clear the viewer's unread count
      setConversationsData((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId && conversation.unreadCount > 0
            ? { ...conversation, unreadCount: 0 }
            : conversation
        )
      );

      if (instrumentationEnabled) {
        debugLogger.messaging.event('useConversations.markRead', 'success', {
          traceId,
          conversationId,
        });
      }
    } catch (error) {
      if (instrumentationEnabled) {
        debugLogger.messaging.error('useConversations.markRead', 'error', {
          traceId,
          conversationId,
          error: error instanceof Error ? error.message : error,
        });
      }
      console.error('Error marking conversation as read:', error);
    }
  }, [userId, setConversationsData]);

  // Calculate total unread count (unreadCount is the viewer's own count,
  // server-computed — Phase 2.2)
  const totalUnreadCount = useMemo(() => {
    if (!userId) return 0;
    return conversations.reduce(
      (count, conversation) => count + (conversation.unreadCount || 0),
      0
    );
  }, [conversations, userId]);

  // Update conversation with new message (immutable — audit M-04)
  const updateConversationWithMessage = useCallback((conversationId: string, lastMessage: any, senderId: string) => {
    const instrumentationEnabled = debugLogger.messaging.enabled();
    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.updateWithMessage', 'incoming', {
        conversationId,
        senderId,
        lastActivity: lastMessage?.timestamp,
        activeConversationId: activeConversation?.id,
      });
    }

    setConversationsData((prev) => {
      const conversationIndex = prev.findIndex((c) => c.id === conversationId);

      if (conversationIndex === -1) {
        if (instrumentationEnabled) {
          debugLogger.messaging.warn('useConversations.updateWithMessage', 'miss:not-found', {
            conversationId,
          });
        }
        return prev;
      }

      const conversation: Conversation = {
        ...prev[conversationIndex],
        lastActivity: lastMessage.timestamp,
      };

      // Update unread count if not the active conversation
      if (
        (!activeConversation || activeConversation.id !== conversation.id) &&
        userId &&
        senderId !== userId
      ) {
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
      }

      // Move conversation to top of list
      const updated = [...prev];
      updated.splice(conversationIndex, 1);
      updated.unshift(conversation);
      return updated;
    });
  }, [activeConversation, userId, setConversationsData]);

  return {
    conversations,
    activeConversation,
    lastActiveConversation,
    setActiveConversation,
    loadingConversations,
    refreshingConversations,
    hasLoadedConversations,
    errorConversations,
    refreshConversations,
    getCachedConversations,
    getOrCreateRoomConversation,
    getOrCreateUserConversation,
    archiveConversation,
    unarchiveConversation,
    pinConversation,
    unpinConversation,
    markConversationAsRead,
    totalUnreadCount,
    updateConversationWithMessage,
    clearLastActiveConversation,
  };
}
