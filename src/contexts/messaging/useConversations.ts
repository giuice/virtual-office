// src/contexts/messaging/useConversations.ts
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Conversation, ConversationType } from '@/types/messaging';
import {
  getConversations,
  createConversation,
  getOrCreateDirectConversation,
  setConversationArchiveStatus,
  markConversationAsRead as apiMarkConversationAsRead
} from '@/lib/messaging-api';

export function useConversations() {
  const { user } = useAuth();
  const { company } = useCompany();
  
  // State for conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState<boolean>(false);
  const [errorConversations, setErrorConversations] = useState<string | null>(null);
  
  // Function to refresh conversations
  const refreshConversations = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoadingConversations(true);
      setErrorConversations(null);
      
      const result = await getConversations(user.uid);
      setConversations(result.conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      setErrorConversations('Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [user]);
  
  // Function to get or create a room conversation
  const getOrCreateRoomConversation = useCallback(async (roomId: string, roomName: string): Promise<Conversation> => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    try {
      // Check if conversation already exists
      const existingConversation = conversations.find(
        c => c.type === ConversationType.ROOM && 'roomId' in c && c.roomId === roomId
      );
      
      if (existingConversation) {
        return existingConversation;
      }
      
      // Create new room conversation
      const newConversation = await createConversation({
        type: ConversationType.ROOM,
        participants: [user.uid], // Start with just the current user
        name: roomName,
        roomId,
      });
      
      // Add to conversations list
      setConversations(prev => [newConversation, ...prev]);
      
      return newConversation;
    } catch (error) {
      console.error('Error creating room conversation:', error);
      throw error;
    }
  }, [user, conversations]);
  
  // Function to get or create a direct conversation with another user
  const getOrCreateUserConversation = useCallback(async (otherUserId: string): Promise<Conversation> => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    if (user.uid === otherUserId) {
      throw new Error('Cannot create conversation with yourself');
    }
    
    try {
      // Check if conversation already exists
      const existingConversation = conversations.find(
        c => c.type === ConversationType.DIRECT && 
             c.participants.includes(user.uid) && 
             c.participants.includes(otherUserId) &&
             c.participants.length === 2
      );
      
      if (existingConversation) {
        return existingConversation;
      }
      
      // Create new direct conversation
      const newConversation = await getOrCreateDirectConversation(user.uid, otherUserId);
      
      // Add to conversations list
      setConversations(prev => [newConversation, ...prev]);
      
      return newConversation;
    } catch (error) {
      console.error('Error creating direct conversation:', error);
      throw error;
    }
  }, [user, conversations]);
  
  // Function to archive a conversation
  const archiveConversation = useCallback(async (conversationId: string) => {
    try {
      await setConversationArchiveStatus(conversationId, true);
      
      // Update local state
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
  }, [activeConversation]);
  
  // Function to unarchive a conversation
  const unarchiveConversation = useCallback(async (conversationId: string) => {
    try {
      await setConversationArchiveStatus(conversationId, false);
      
      // Update local state
      setConversations(prev => 
        prev.map(conversation => 
          conversation.id === conversationId 
            ? { ...conversation, isArchived: false } 
            : conversation
        )
      );
    } catch (error) {
      console.error('Error unarchiving conversation:', error);
      throw error;
    }
  }, []);
  
  // Function to mark a conversation as read
  const markConversationAsRead = useCallback(async (conversationId: string) => {
    if (!user) return;
    
    try {
      await apiMarkConversationAsRead(conversationId, user.uid);
      
      // Update local state
      setConversations(prev => 
        prev.map(conversation => {
          if (conversation.id === conversationId && conversation.unreadCount) {
            const updatedUnreadCount = { ...conversation.unreadCount };
            delete updatedUnreadCount[user.uid];
            
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
  }, [user]);
  
  // Calculate total unread count
  const totalUnreadCount = conversations.reduce((count, conversation) => {
    if (user && conversation.unreadCount && conversation.unreadCount[user.uid]) {
      return count + conversation.unreadCount[user.uid];
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
        conversation.lastMessage = lastMessage;
        conversation.lastActivity = lastMessage.timestamp;
        
        // Update unread count if not the active conversation
        if (
          (!activeConversation || activeConversation.id !== conversation.id) && 
          senderId !== user?.uid
        ) {
          if (!conversation.unreadCount) {
            conversation.unreadCount = {};
          }
          conversation.unreadCount[user?.uid || ''] = (conversation.unreadCount[user?.uid || ''] || 0) + 1;
        }
        
        // Move conversation to top of list
        updatedConversations.splice(conversationIndex, 1);
        updatedConversations.unshift(conversation);
      }
      
      return updatedConversations;
    });
  }, [activeConversation, user]);
  
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
