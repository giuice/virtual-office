// src/contexts/messaging/useConversations.ts
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Conversation, ConversationType } from '@/types/messaging';
import { messagingApi } from '@/lib/messaging-api';
import { useConversationRealtime } from '@/hooks/realtime/useConversationRealtime';
import { debugLogger } from '@/utils/debug-logger';
import { set } from 'lodash';

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

export function useConversations() {
  const { user } = useAuth();
  const { company, currentUserProfile } = useCompany();
  
  // State for conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [lastActiveConversation, setLastActiveConversation] = useState<Conversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [errorConversations, setErrorConversations] = useState<string | null>(null);
  
  // Subscribe to realtime updates using the Database User ID (canonical)
  useConversationRealtime(currentUserProfile?.id);

  useEffect(() => {
    if (!debugLogger.messaging.enabled()) {
      return;
    }

    if (!currentUserProfile?.id) {
      debugLogger.messaging.trace('useConversations.realtime', 'skip:no-user');
      return;
    }

    debugLogger.messaging.trace('useConversations.realtime', 'subscribe', {
      userId: currentUserProfile.id,
    });
  }, [currentUserProfile?.id]);

  useEffect(() => {
    if (activeConversation?.type === ConversationType.DIRECT) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useConversations.effect', 'set-last-direct', {
          conversationId: activeConversation.id,
        });
      }
      setLastActiveConversation(activeConversation);
    } else if (debugLogger.messaging.enabled() && !activeConversation) {
      debugLogger.messaging.trace('useConversations.effect', 'clear-active-conversation');
    }
  }, [activeConversation]);
  
  // Function to refresh conversations
  const refreshConversations = useCallback(async () => {
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('conv-refresh') : '';
    const userId = currentUserProfile?.id;

    if (!userId) {
      if (instrumentationEnabled) {
        debugLogger.messaging.trace('useConversations.refresh', 'skip:no-user', {
          traceId,
        });
      }
      return;
    }

    const start = instrumentationEnabled ? getTimestamp() : 0;
    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.refresh', 'start', {
        traceId,
        userId,
      });
    }

    try {
      setLoadingConversations(true);
      setErrorConversations(null);

      // Query conversations by Database User ID
      const result = await messagingApi.getConversations(userId); // DB ID

      if (instrumentationEnabled) {
        const duration = start ? getTimestamp() - start : 0;
        if (start) {
          debugLogger.messaging.metric('useConversations.refresh', 'api', duration, {
            traceId,
            userId,
          });
        }
        debugLogger.messaging.event('useConversations.refresh', 'success', {
          traceId,
          total: result.conversations.length,
        });
      }

      setConversations(result.conversations);
    } catch (error) {
      if (instrumentationEnabled) {
        const duration = start ? getTimestamp() - start : 0;
        debugLogger.messaging.error('useConversations.refresh', 'error', {
          traceId,
          userId,
          duration,
          error: error instanceof Error ? error.message : error,
        });
      }
      console.error('Error loading conversations:', error);
      setErrorConversations('Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [currentUserProfile?.id]);

  const clearLastActiveConversation = useCallback(() => {
    setLastActiveConversation(null);
  }, []);
  
  // Function to get or create a room conversation
  const getOrCreateRoomConversation = useCallback(async (roomId: string, roomName: string): Promise<Conversation> => {
    if (!currentUserProfile?.id) {
      throw new Error('User not authenticated');
    }
    
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('room-conv') : '';
    const userId = currentUserProfile.id;

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.room', 'start', {
        traceId,
        roomId,
        roomName,
        userId,
      });
    }

    try {
      // Use a functional state update to get current conversations and check if one exists
      let existingConversation: Conversation | null = null;
      let existingConversationId: string | null = null;
      
      setConversations(prev => {
        // Check if conversation already exists
        existingConversation = prev.find(
          c => c.type === ConversationType.ROOM && 'roomId' in c && c.roomId === roomId
        ) || null;
        existingConversationId = existingConversation?.id ?? null;
        
        // Return previous state without modification for now
        return prev;
      });
      
      if (existingConversation) {
        if (instrumentationEnabled) {
          debugLogger.messaging.event('useConversations.room', 'hit:existing', {
            traceId,
            roomId,
            conversationId: existingConversationId,
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

      setConversations(prev => {
        const existingIndex = prev.findIndex(c => c.id === resolvedConversation.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = resolvedConversation;
          return updated;
        }
        return [resolvedConversation, ...prev];
      });

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
  }, [currentUserProfile?.id]); // Removed conversations dependency
  
  // Function to get or create a direct conversation with another user
  const getOrCreateUserConversation = useCallback(async (otherUserId: string): Promise<Conversation> => {
    if (!currentUserProfile?.id) {
      throw new Error('User not authenticated');
    }
    // Compare Database User IDs to prevent self-DM
    if (currentUserProfile.id === otherUserId) {
      throw new Error('Cannot create conversation with yourself');
    }
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('direct-conv') : '';
    const userId = currentUserProfile.id;
    
    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.direct', 'start', {
        traceId,
        userId,
        otherUserId,
      });
    }
    
    try {
      // Use functional state update to check for existing conversation
      let existingConversation: Conversation | null = null;
      let existingConversationId: string | null = null;
      
      setConversations(prev => {
        // Check if conversation already exists
        existingConversation = prev.find(
          c => c.type === ConversationType.DIRECT && 
               c.participants.includes(currentUserProfile.id) && 
               c.participants.includes(otherUserId) &&
               c.participants.length === 2
        ) || null;
        existingConversationId = existingConversation?.id ?? null;
        
        // Return previous state without modification
        return prev;
      });
      
      if (existingConversation) {
        if (instrumentationEnabled) {
          debugLogger.messaging.event('useConversations.direct', 'hit:existing', {
            traceId,
            conversationId: existingConversationId,
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

      setConversations(prev => {
        const existingIndex = prev.findIndex(c => c.id === resolvedConversation.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = resolvedConversation;
          return updated;
        }
        return [resolvedConversation, ...prev];
      });

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
  }, [currentUserProfile?.id]); // Removed conversations dependency
  
  // Function to archive a conversation
  const archiveConversation = useCallback(async (conversationId: string) => {
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('archive-conv') : '';
    const userId = currentUserProfile?.id;

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.archive', 'start', {
        traceId,
        conversationId,
        userId,
      });
    }

    try {
      // Call the API to archive the conversation
      await messagingApi.setConversationArchiveStatus(conversationId, currentUserProfile!.id, true);
      // console.warn("setConversationArchiveStatus API call not implemented yet."); // Remove warning

      // Update local state (Optimistic update remains)
      setConversations(prev => 
        prev.map(conversation => 
          conversation.id === conversationId 
            ? { ...conversation, isArchived: true } 
            : conversation
        )
      );
      
      // If this was the active conversation, clear it
      if (activeConversation && activeConversation.id === conversationId) {
        setActiveConversation(null);
      }

      if (instrumentationEnabled) {
        debugLogger.messaging.event('useConversations.archive', 'success', {
          traceId,
          conversationId,
        });
      }
    } catch (error) {
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
  }, [activeConversation, currentUserProfile?.id]);
  
  // Function to unarchive a conversation
  const unarchiveConversation = useCallback(async (conversationId: string) => {
    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('unarchive-conv') : '';
    const userId = currentUserProfile?.id;

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.unarchive', 'start', {
        traceId,
        conversationId,
        userId,
      });
    }
    try {
      // Call the API to unarchive the conversation
      await messagingApi.setConversationArchiveStatus(conversationId, currentUserProfile!.id, false);
      // console.warn("setConversationArchiveStatus API call not implemented yet."); // Remove warning

      // Update local state (Optimistic update remains)
      setConversations(prev => 
        prev.map(conversation => 
          conversation.id === conversationId 
            ? { ...conversation, isArchived: false } 
            : conversation
        )
      );

      if (instrumentationEnabled) {
        debugLogger.messaging.event('useConversations.unarchive', 'success', {
          traceId,
          conversationId,
        });
      }
    } catch (error) {
      if (instrumentationEnabled) {
        debugLogger.messaging.error('useConversations.unarchive', 'error', {
          traceId,
          conversationId,
          error: error instanceof Error ? error.message : error,
        });
      }
      console.error('Error unarchiving conversation:', error);
    }
  }, [currentUserProfile?.id]);
  
  // Function to mark a conversation as read
  const markConversationAsRead = useCallback(async (conversationId: string) => {
    if (!currentUserProfile?.id) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.trace('useConversations.markRead', 'skip:no-user', {
          conversationId,
        });
      }
      return;
    }

    const instrumentationEnabled = debugLogger.messaging.enabled();
    const traceId = instrumentationEnabled ? createTraceId('mark-read') : '';
    const userId = currentUserProfile.id;

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.markRead', 'start', {
        traceId,
        conversationId,
        userId,
      });
    }

    try {
      // Call the API to mark the conversation as read
      await messagingApi.markConversationAsRead(conversationId, currentUserProfile.id);
      // console.warn("markConversationAsRead API call not implemented yet."); // Remove warning

      // Update local state (Optimistic update remains)
      setConversations(prev => 
        prev.map(conversation => {
          if (conversation.id === conversationId && conversation.unreadCount) {
            const updatedUnreadCount = { ...conversation.unreadCount };
            delete updatedUnreadCount[currentUserProfile.id];
            
            return {
              ...conversation,
              unreadCount: updatedUnreadCount,
            };
          }
          return conversation;
        })
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
  }, [currentUserProfile?.id]);
  
  // Calculate total unread count
  const totalUnreadCount = conversations.reduce((count, conversation) => {
    if (currentUserProfile?.id && conversation.unreadCount && conversation.unreadCount[currentUserProfile.id]) {
      return count + conversation.unreadCount[currentUserProfile.id];
    }
    return count;
  }, 0);
  
  // Update conversation with new message
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

    let foundConversation = false;
    let unreadIncremented = false;
    let movedToTop = false;

    setConversations(prev => {
      const updatedConversations = [...prev];
      const conversationIndex = updatedConversations.findIndex(
        c => c.id === conversationId
      );
      
      if (conversationIndex !== -1) {
        const conversation = { ...updatedConversations[conversationIndex] };
        // conversation.lastMessage = lastMessage; // Property doesn't exist on type
        conversation.lastActivity = lastMessage.timestamp;
        foundConversation = true;
        
        // Update unread count if not the active conversation
        if (
          (!activeConversation || activeConversation.id !== conversation.id) && 
          senderId !== currentUserProfile?.id
        ) {
          if (!conversation.unreadCount) {
            conversation.unreadCount = {};
          }
          if (currentUserProfile?.id) {
            const key = currentUserProfile.id;
            conversation.unreadCount[key] = (conversation.unreadCount[key] || 0) + 1;
            unreadIncremented = true;
          }
        }
        
        // Move conversation to top of list
        updatedConversations.splice(conversationIndex, 1);
        updatedConversations.unshift(conversation);
        movedToTop = conversationIndex > 0;
      }
      else if (instrumentationEnabled) {
        debugLogger.messaging.warn('useConversations.updateWithMessage', 'miss:not-found', {
          conversationId,
        });
      }
      
      return updatedConversations;
    });

    if (instrumentationEnabled) {
      debugLogger.messaging.event('useConversations.updateWithMessage', 'applied', {
        conversationId,
        foundConversation,
        unreadIncremented,
        movedToTop,
      });
    }
  }, [activeConversation, currentUserProfile?.id]);
  
  return {
    conversations,
    activeConversation,
    lastActiveConversation,
    setActiveConversation,
    loadingConversations,
    errorConversations,
    refreshConversations,
    getOrCreateRoomConversation,
    getOrCreateUserConversation,
    archiveConversation,
    unarchiveConversation,
    markConversationAsRead,
    totalUnreadCount,
    updateConversationWithMessage,
    clearLastActiveConversation,
  };
}
