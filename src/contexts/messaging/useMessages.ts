// src/contexts/messaging/useMessages.ts
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Message, 
  MessageStatus, 
  MessageType, 
  MessageAttachment,
  PaginationOptions
} from '@/types/messaging';
import {
  getMessages,
  createMessage,
  updateMessageStatus,
  uploadMessageAttachment,
  addMessageReaction,
  removeMessageReaction
} from '@/lib/messaging-api';

export function useMessages(activeConversationId: string | null) {
  const { user } = useAuth();
  
  // State for messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [errorMessages, setErrorMessages] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [messagePagination, setMessagePagination] = useState<PaginationOptions>({
    limit: 20,
    direction: 'older',
  });
  
  // Function to refresh messages
  const refreshMessages = useCallback(async () => {
    if (!activeConversationId) return;
    
    try {
      setLoadingMessages(true);
      setErrorMessages(null);
      
      const result = await getMessages(activeConversationId, {
        pagination: {
          limit: 20,
          direction: 'older',
        },
      });
      
      setMessages(result.messages);
      setHasMoreMessages(result.hasMore);
      setMessagePagination({
        limit: 20,
        direction: 'older',
        cursor: result.nextCursor,
      });
    } catch (error) {
      console.error('Error loading messages:', error);
      setErrorMessages('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [activeConversationId]);
  
  // Reset messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      refreshMessages();
    } else {
      setMessages([]);
      setHasMoreMessages(false);
      setMessagePagination({
        limit: 20,
        direction: 'older',
      });
    }
  }, [activeConversationId, refreshMessages]);
  
  // Function to load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!activeConversationId || !hasMoreMessages || !messagePagination.cursor) return;
    
    try {
      setLoadingMessages(true);
      
      const result = await getMessages(activeConversationId, {
        pagination: messagePagination,
      });
      
      setMessages(prev => [...result.messages, ...prev]);
      setHasMoreMessages(result.hasMore);
      setMessagePagination({
        ...messagePagination,
        cursor: result.nextCursor,
      });
    } catch (error) {
      console.error('Error loading more messages:', error);
      setErrorMessages('Failed to load more messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [activeConversationId, hasMoreMessages, messagePagination]);
  
  // Function to send a message
  const sendMessage = useCallback(async (content: string, options?: {
    replyToId?: string;
    attachments?: MessageAttachment[];
    type?: MessageType;
  }) => {
    if (!user || !activeConversationId || !content.trim()) return;
    
    try {
      const messageData = {
        conversationId: activeConversationId,
        senderId: user.uid,
        content: content.trim(),
        replyToId: options?.replyToId,
        attachments: options?.attachments,
        type: options?.type || MessageType.TEXT,
      };
      
      // Optimistically add message to UI
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        ...messageData,
        timestamp: new Date(),
        status: MessageStatus.SENDING,
        type: options?.type || MessageType.TEXT,
      };
      
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Send message to server
      const savedMessage = await createMessage(messageData);
      
      // Replace optimistic message with saved message
      setMessages(prev => 
        prev.map(message => 
          message.id === optimisticMessage.id ? savedMessage : message
        )
      );
      
      return savedMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Mark optimistic message as failed
      setMessages(prev => 
        prev.map(message => 
          message.id.startsWith('temp-') 
            ? { ...message, status: MessageStatus.FAILED } 
            : message
        )
      );
      
      throw error;
    }
  }, [user, activeConversationId]);
  
  // Function to update message status
  const updateMessageStatusLocal = useCallback((messageId: string, status: MessageStatus) => {
    setMessages(prev => 
      prev.map(message => 
        message.id === messageId 
          ? { ...message, status } 
          : message
      )
    );
  }, []);
  
  // Function to add message
  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);
  
  // Function to add a reaction to a message
  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    
    try {
      await addMessageReaction(messageId, user.uid, emoji);
      
      // Update local state
      setMessages(prev => 
        prev.map(message => {
          if (message.id === messageId) {
            const reactions = [...(message.reactions || [])];
            const existingReaction = reactions.find(
              r => r.userId === user.uid && r.emoji === emoji
            );
            
            if (!existingReaction) {
              reactions.push({
                userId: user.uid,
                emoji,
                timestamp: new Date(),
              });
            }
            
            return {
              ...message,
              reactions,
            };
          }
          return message;
        })
      );
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }, [user]);
  
  // Function to remove a reaction from a message
  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    
    try {
      await removeMessageReaction(messageId, user.uid, emoji);
      
      // Update local state
      setMessages(prev => 
        prev.map(message => {
          if (message.id === messageId && message.reactions) {
            const reactions = message.reactions.filter(
              r => !(r.userId === user.uid && r.emoji === emoji)
            );
            
            return {
              ...message,
              reactions,
            };
          }
          return message;
        })
      );
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  }, [user]);
  
  // Function to upload an attachment
  const uploadAttachment = useCallback(async (file: File): Promise<MessageAttachment> => {
    if (!activeConversationId) {
      throw new Error('No active conversation');
    }
    
    try {
      return await uploadMessageAttachment(file, activeConversationId);
    } catch (error) {
      console.error('Error uploading attachment:', error);
      throw error;
    }
  }, [activeConversationId]);
  
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
    uploadAttachment
  };
}
