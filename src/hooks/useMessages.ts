// src/contexts/messaging/useMessages.ts
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { 
  Message, 
  MessageStatus, 
  MessageType, 
  FileAttachment,
} from '@/types/messaging';
import { messagingApi } from '@/lib/messaging-api';
import { useMessageRealtime } from '@/hooks/realtime/useMessageRealtime';

export function useMessages(activeConversationId: string | null) {
  const { user } = useAuth();
  
  // State for messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [errorMessages, setErrorMessages] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [messagePagination, setMessagePagination] = useState<{
    limit: number;
    direction: 'older' | 'newer';
    cursor?: string;
  }>({
    limit: 20,
    direction: 'older',
  });

  // Use the existing real-time message hook to handle Supabase subscriptions
  useMessageRealtime(activeConversationId);
  
  // Function to refresh messages
  const refreshMessages = useCallback(async () => {
    if (!activeConversationId) return;
    
    try {
      setLoadingMessages(true);
      setErrorMessages(null);
      
      // Pass pagination options directly
      const result = await messagingApi.getMessages(activeConversationId, { 
        limit: 20,
        direction: 'older',
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
      
      // Pass pagination options directly
      const result = await messagingApi.getMessages(activeConversationId, messagePagination); 
      
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
    attachments?: FileAttachment[];
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
        reactions: [],
        isEdited: false,
      };
      
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Send message to server - Use sendMessage
      const savedMessage = await messagingApi.sendMessage(messageData); 
      
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
      // Call the API to add the reaction
      await messagingApi.addReaction(messageId, emoji, user.uid);

      // Update local state (Optimistic update remains)
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
      // Call the API to remove the reaction
      await messagingApi.removeReaction(messageId, emoji, user.uid);
      
      // Update local state (Optimistic update remains)
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
  const uploadAttachment = useCallback(async (file: File): Promise<FileAttachment> => {
    if (!activeConversationId) {
      throw new Error('No active conversation');
    }
    
    try {
      // TODO: Implement uploadMessageAttachment in messagingApi and uncomment
      // return await messagingApi.uploadMessageAttachment(file, activeConversationId); 
      console.warn('uploadMessageAttachment API call not implemented yet.');
      throw new Error('Attachment upload not implemented');
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