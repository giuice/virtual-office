import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Message } from '@/types/messaging';

/**
 * Hook to subscribe to real-time updates for messages within a conversation
 * Automatically updates React Query cache when messages are updated
 * 
 * @param conversationId The ID of the conversation to subscribe to message updates for
 * @returns void
 */
export function useMessageRealtime(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    console.log(`[useMessageRealtime] Setting up subscription for conversation: ${conversationId}`);

    // Set up subscription for the messages table
    const subscription = supabase
      .channel(`messages-changes:${conversationId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: '' } // No presence features needed
        }
      })
      .on('postgres_changes', {
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'messages',
        // Filter to messages in this conversation only
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        console.log('[useMessageRealtime] Message update:', payload);
        
        // Handle different event types
        switch (payload.eventType) {
          case 'INSERT': {
            const newMessage = payload.new as any;
            
            // Avoid duplicate inserts for messages we've already optimistically added
            if (newMessage.id.startsWith('temp-')) {
              return;
            }
            
            // Add message to the local cache if it doesn't exist
            queryClient.setQueryData(['messages', conversationId], 
              (oldData: { messages: Message[], hasMore: boolean, nextCursor?: string } | undefined) => {
                if (!oldData) {
                  return { messages: [newMessage], hasMore: false };
                }
                
                // Check if message already exists in the cache
                const messageExists = oldData.messages.some(msg => msg.id === newMessage.id);
                
                if (messageExists) {
                  return oldData;
                }
                
                // Convert the database record to our Message type
                const message: Message = {
                  id: newMessage.id,
                  conversationId: newMessage.conversation_id,
                  senderId: newMessage.sender_id,
                  content: newMessage.content,
                  timestamp: new Date(newMessage.timestamp),
                  status: newMessage.status,
                  type: newMessage.type,
                  replyToId: newMessage.reply_to_id,
                  attachments: newMessage.attachments || [],
                  reactions: newMessage.reactions || [],
                  isEdited: newMessage.is_edited || false,
                };
                
                return {
                  ...oldData,
                  messages: [...oldData.messages, message]
                };
              }
            );
            break;
          }
            
          case 'UPDATE': {
            const updatedMessage = payload.new as any;
            
            // Update message in cache if it exists
            queryClient.setQueryData(['messages', conversationId], 
              (oldData: { messages: Message[], hasMore: boolean, nextCursor?: string } | undefined) => {
                if (!oldData) return oldData;
                
                // Update the message in the array
                const updatedMessages = oldData.messages.map(message => {
                  if (message.id === updatedMessage.id) {
                    return {
                      ...message,
                      content: updatedMessage.content,
                      status: updatedMessage.status,
                      reactions: updatedMessage.reactions || message.reactions,
                      isEdited: updatedMessage.is_edited || message.isEdited,
                    };
                  }
                  return message;
                });
                
                return {
                  ...oldData,
                  messages: updatedMessages
                };
              }
            );
            break;
          }
            
          case 'DELETE': {
            const deletedMessage = payload.old as any;
            
            // Remove message from cache if it exists
            queryClient.setQueryData(['messages', conversationId], 
              (oldData: { messages: Message[], hasMore: boolean, nextCursor?: string } | undefined) => {
                if (!oldData) return oldData;
                
                return {
                  ...oldData,
                  messages: oldData.messages.filter(message => message.id !== deletedMessage.id)
                };
              }
            );
            break;
          }
        }
      })
      .subscribe((status) => {
        console.log(`[useMessageRealtime] Subscription status: ${status}`);
        setConnectionStatus(status);
        
        if (status === 'SUBSCRIBED') {
          console.log('[useMessageRealtime] Successfully subscribed to message updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[useMessageRealtime] Channel error occurred - will retry connection');
          // We'll rely on Supabase's built-in retry mechanism
        } else if (status === 'TIMED_OUT') {
          console.error('[useMessageRealtime] Subscription timed out - will retry connection');
          // We'll rely on Supabase's built-in retry mechanism
        }
      });

    // Clean up subscription when component unmounts
    return () => {
      console.log(`[useMessageRealtime] Cleaning up subscription for conversation ${conversationId}`);
      subscription.unsubscribe();
    };
  }, [queryClient, conversationId]);

  return { connectionStatus };
}