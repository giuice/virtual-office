import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Conversation } from '@/types/messaging';

/**
 * Hook to subscribe to real-time updates for conversations
 * Automatically updates React Query cache when conversations are updated
 * 
 * @param userId User ID to filter conversation updates by participant
 * @returns Object containing connection status
 */
export function useConversationRealtime(userId?: string) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    console.log(`[useConversationRealtime] Setting up subscription for user: ${userId}`);

    // Set up subscription for the conversations table
    const subscription = supabase
      .channel('conversations-changes', {
        config: {
          broadcast: { self: false },
          presence: { key: '' }, // No presence features needed
          //retryIntervalMs: 5000, // Retry every 5 seconds on failure
          //timeout: 10000 // Wait 10 seconds before timing out
        }
      })
      .on('postgres_changes', {
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'conversations',
        // Filter to conversations where the user is a participant
        // This requires a Postgres function or RLS policy that can filter by JSONB array containment
        // filter: `participants::jsonb @> '["${userId}"]'::jsonb`
      }, (payload) => {
        console.log('[useConversationRealtime] Conversation update:', payload);
        
        // Handle different event types
        switch (payload.eventType) {
          case 'INSERT': {
            // Check if this conversation involves the current user
            const newConversation = payload.new as any;
            const participants = newConversation.participants || [];
            
            if (userId && Array.isArray(participants) && participants.includes(userId)) {
              console.log(`[useConversationRealtime] New conversation (${newConversation.id}) involves current user`);
              // Invalidate conversations list query
              queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
            }
            break;
          }
            
          case 'UPDATE': {
            // Get updated conversation data
            const updatedConversation = payload.new as any;
            const participants = updatedConversation.participants || [];
            
            if (userId && Array.isArray(participants) && participants.includes(userId)) {
              console.log(`[useConversationRealtime] Updated conversation (${updatedConversation.id}) involves current user`);
              // Invalidate specific conversation query
              queryClient.invalidateQueries({ queryKey: ['conversation', updatedConversation.id] });
              
              // Update conversation in cache if it exists
              queryClient.setQueryData(['conversation', updatedConversation.id], 
                (oldData: Conversation | undefined) => {
                  if (!oldData) return oldData;
                  
                  return {
                    ...oldData,
                    lastActivity: updatedConversation.last_activity,
                    name: updatedConversation.name,
                    isArchived: updatedConversation.is_archived,
                    unreadCount: updatedConversation.unread_count,
                  };
                }
              );
              
              // Also update the conversation in the conversations list if it exists
              queryClient.setQueryData(['conversations', userId], 
                (oldData: { conversations: Conversation[] } | undefined) => {
                  if (!oldData) return oldData;
                  
                  const updatedConversations = oldData.conversations.map((conversation) => {
                    if (conversation.id === updatedConversation.id) {
                      return {
                        ...conversation,
                        lastActivity: updatedConversation.last_activity,
                        name: updatedConversation.name,
                        isArchived: updatedConversation.is_archived,
                        unreadCount: updatedConversation.unread_count,
                      };
                    }
                    return conversation;
                  });
                  
                  return {
                    ...oldData,
                    conversations: updatedConversations,
                  };
                }
              );
            }
            break;
          }
            
          case 'DELETE': {
            // Check if this was a conversation the user was part of
            const deletedConversation = payload.old as any;
            const participants = deletedConversation.participants || [];
            
            if (userId && Array.isArray(participants) && participants.includes(userId)) {
              console.log(`[useConversationRealtime] Deleted conversation (${deletedConversation.id}) involved current user`);
              // Remove conversation from cache
              queryClient.removeQueries({ queryKey: ['conversation', deletedConversation.id] });
              
              // Update the conversations list to remove this conversation
              queryClient.setQueryData(['conversations', userId], 
                (oldData: { conversations: Conversation[] } | undefined) => {
                  if (!oldData) return oldData;
                  
                  return {
                    ...oldData,
                    conversations: oldData.conversations.filter(
                      (conversation) => conversation.id !== deletedConversation.id
                    ),
                  };
                }
              );
            }
            break;
          }
        }
      })
      .subscribe((status) => {
        console.log(`[useConversationRealtime] Subscription status: ${status}`);
        setConnectionStatus(status);
        
        if (status === 'SUBSCRIBED') {
          console.log('[useConversationRealtime] Successfully subscribed to conversation updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[useConversationRealtime] Channel error occurred - will retry connection');
          // We'll rely on Supabase's built-in retry mechanism
        } else if (status === 'TIMED_OUT') {
          console.error('[useConversationRealtime] Subscription timed out - will retry connection');
          // We'll rely on Supabase's built-in retry mechanism
        }
      });

    // Clean up subscription when component unmounts
    return () => {
      console.log(`[useConversationRealtime] Cleaning up subscription for user ${userId}`);
      subscription.unsubscribe();
    };
  }, [queryClient, userId]);

  // Return connection status for potential UI feedback
  return { connectionStatus };
}