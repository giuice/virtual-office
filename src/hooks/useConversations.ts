// src/contexts/messaging/useConversations.ts
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Conversation, ConversationType } from '@/types/messaging';
import { messagingApi } from '@/lib/messaging-api';
import { useConversationRealtime } from '@/hooks/realtime/useConversationRealtime';
import { supabase } from '@/lib/supabase/client';

export function useConversations() {
  const { user } = useAuth();
  const { company, currentUserProfile } = useCompany();
  
  // State for conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [errorConversations, setErrorConversations] = useState<string | null>(null);
  
  // Subscribe to realtime updates using the Database User ID (canonical)
  useConversationRealtime(currentUserProfile?.id);
  
  // Function to refresh conversations
  const refreshConversations = useCallback(async () => {
  if (!currentUserProfile?.id) return;
    
    try {
      setLoadingConversations(true);
      setErrorConversations(null);

  // Query conversations by Database User ID
  const result = await messagingApi.getConversations(currentUserProfile.id); // DB ID
      setConversations(result.conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setErrorConversations('Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [currentUserProfile?.id]);
  
  // Function to get or create a room conversation
  const getOrCreateRoomConversation = useCallback(async (roomId: string, roomName: string): Promise<Conversation> => {
    if (!currentUserProfile?.id) {
      throw new Error('User not authenticated');
    }
    
    try {
      // Use a functional state update to get current conversations and check if one exists
      let existingConversation: Conversation | null = null;
      
      setConversations(prev => {
        // Check if conversation already exists
        existingConversation = prev.find(
          c => c.type === ConversationType.ROOM && 'roomId' in c && c.roomId === roomId
        ) || null;
        
        // Return previous state without modification for now
        return prev;
      });
      
      if (existingConversation) {
        return existingConversation;
      }
      
      // Create new room conversation
      const newConversation = await messagingApi.createConversation({ 
        type: ConversationType.ROOM,
        // Participants are Database User IDs
        participants: [currentUserProfile.id],
        name: roomName,
        roomId,
        userId: currentUserProfile.id, // Optional; server derives from session
      });
      
      // Add to conversations list using functional update
      setConversations(prev => {
        // Double-check that the conversation doesn't exist (in case of race condition)
        const stillExists = prev.find(
          c => c.type === ConversationType.ROOM && 'roomId' in c && c.roomId === roomId
        );
        
        if (stillExists) {
          return prev; // Don't add duplicate
        }
        
        return [newConversation, ...prev];
      });
      
      return newConversation;
    } catch (error) {
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
    
    try {
      // Use functional state update to check for existing conversation
      let existingConversation: Conversation | null = null;
      
      setConversations(prev => {
        // Check if conversation already exists
        existingConversation = prev.find(
          c => c.type === ConversationType.DIRECT && 
               c.participants.includes(currentUserProfile.id) && 
               c.participants.includes(otherUserId) &&
               c.participants.length === 2
        ) || null;
        
        // Return previous state without modification
        return prev;
      });
      
      if (existingConversation) {
        return existingConversation;
      }
      
      // Create new direct conversation
      // NOTE: getOrCreateDirectConversation is NOT in messaging-api.ts! 
      // We need to use messagingApi.createConversation or adjust logic.
      // For now, let's assume we need to call createConversation.
      // This might need further refinement based on backend capabilities.
      console.warn("getOrCreateDirectConversation not found in API, using createConversation as placeholder");
    const newConversation = await messagingApi.createConversation({ 
         type: ConversationType.DIRECT,
      // Participants are Database User IDs
      participants: [currentUserProfile.id, otherUserId],
      userId: currentUserProfile.id,
         // Name might be handled differently for direct messages
      });
      
      // Add to conversations list using functional update
      setConversations(prev => {
        // Double-check for race conditions
        const stillExists = prev.find(
          c => c.type === ConversationType.DIRECT && 
               c.participants.includes(currentUserProfile.id) && 
               c.participants.includes(otherUserId) &&
               c.participants.length === 2
        );
        
        if (stillExists) {
          return prev; // Don't add duplicate
        }
        
        return [newConversation, ...prev];
      });
      
      return newConversation;
    } catch (error) {
      console.error('Error creating direct conversation:', error);
      throw error;
    }
  }, [currentUserProfile?.id]); // Removed conversations dependency
  
  // Function to archive a conversation
  const archiveConversation = useCallback(async (conversationId: string) => {
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
    } catch (error) {
      console.error('Error archiving conversation:', error);
      throw error;
    }
  }, [activeConversation, currentUserProfile?.id]);
  
  // Function to unarchive a conversation
  const unarchiveConversation = useCallback(async (conversationId: string) => {
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
    } catch (error) {
      console.error('Error unarchiving conversation:', error);
    }
  }, [currentUserProfile?.id]);
  
  // Function to mark a conversation as read
  const markConversationAsRead = useCallback(async (conversationId: string) => {
  if (!currentUserProfile?.id) return;
    
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
    } catch (error) {
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
    setConversations(prev => {
      const updatedConversations = [...prev];
      const conversationIndex = updatedConversations.findIndex(
        c => c.id === conversationId
      );
      
      if (conversationIndex !== -1) {
        const conversation = { ...updatedConversations[conversationIndex] };
        // conversation.lastMessage = lastMessage; // Property doesn't exist on type
        conversation.lastActivity = lastMessage.timestamp;
        
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
          }
        }
        
        // Move conversation to top of list
        updatedConversations.splice(conversationIndex, 1);
        updatedConversations.unshift(conversation);
      }
      
      return updatedConversations;
    });
  }, [activeConversation, currentUserProfile?.id]);
  
  return {
    conversations,
    activeConversation,
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
    updateConversationWithMessage
  };
}