// src/contexts/messaging/MessagingContext.tsx
'use client';

import { createContext, useContext, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  MessageType, 
  FileAttachment,
} from '@/types/messaging';
import { MessagingContextType } from './types';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';

// Create the context with a default undefined value
const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

// Provider component
export function MessagingProvider({ children }: { children: React.ReactNode }) {
  // Get conversation management hooks
  const conversationsManager = useConversations();
  const { user } = useAuth();
  const { 
    activeConversation,
    setActiveConversation
  } = conversationsManager;
  
  // Get message management hooks
  const messagesManager = useMessages(activeConversation?.id || null);
  
  // Wrapper function for sendMessage that also clears the draft
  const sendMessage = useCallback(async (content: string, options?: {
    replyToId?: string;
    attachments?: FileAttachment[];
    type?: MessageType;
  }) => {
    if (!activeConversation) return;
    
    // Send the message
    return await messagesManager.sendMessage(content, options);
  }, [activeConversation, messagesManager.sendMessage]);
  
  // Create context value by combining all the hooks
  const value: MessagingContextType = {
    // Conversations (from conversationsManager)
    conversations: conversationsManager.conversations,
    activeConversation: conversationsManager.activeConversation,
    loadingConversations: conversationsManager.loadingConversations,
    errorConversations: conversationsManager.errorConversations,
    setActiveConversation: conversationsManager.setActiveConversation,
    getOrCreateRoomConversation: conversationsManager.getOrCreateRoomConversation,
    getOrCreateUserConversation: conversationsManager.getOrCreateUserConversation,
    archiveConversation: conversationsManager.archiveConversation,
    unarchiveConversation: conversationsManager.unarchiveConversation,
    markConversationAsRead: conversationsManager.markConversationAsRead,
    totalUnreadCount: conversationsManager.totalUnreadCount,
    refreshConversations: conversationsManager.refreshConversations,
    
    // Messages (from messagesManager)
    messages: messagesManager.messages,
    loadingMessages: messagesManager.loadingMessages,
    errorMessages: messagesManager.errorMessages,
    hasMoreMessages: messagesManager.hasMoreMessages,
    loadMoreMessages: messagesManager.loadMoreMessages,
    refreshMessages: messagesManager.refreshMessages,
    sendMessage,
    addReaction: messagesManager.addReaction,
    removeReaction: messagesManager.removeReaction,
    uploadAttachment: messagesManager.uploadAttachment,
  };
  
  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

// Custom hook to use the messaging context
export function useMessaging() {
  const context = useContext(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
}
