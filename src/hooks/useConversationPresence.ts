// src/hooks/useConversationPresence.ts
import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook for managing conversation presence and typing indicators
 * Implements Phase 3 of the realtime message integration plan
 */
export function useConversationPresence(conversationId: string | null) {
  const { user } = useAuth();
  const [presenceState, updatePresenceState] = useReducerState<Record<string, any>>({});
  const [typingUsers, updateTypingUsers] = useReducerState<string[]>([]);

  // Send typing indicator
  const sendTypingIndicator = useCallback((isTyping: boolean) => {
    if (!conversationId || !user) return;

    const channel = supabase.channel(`conversation:${conversationId}`);
    const userDisplayName = (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || user.email?.split('@')[0] || 'User';
    
    if (isTyping) {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { 
          userId: user.id, 
          userDisplayName,
          isTyping: true 
        }
      });
    } else {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { 
          userId: user.id, 
          userDisplayName,
          isTyping: false 
        }
      });
    }
  }, [conversationId, user]);

  // Auto-clear typing indicator after delay
  const handleTypingTimeout = useCallback(() => {
    sendTypingIndicator(false);
  }, [sendTypingIndicator]);

  useEffect(() => {
    if (!conversationId || !user) {
      return;
    }

    console.log(`[useConversationPresence] Setting up presence for conversation: ${conversationId}`);

    const channel = supabase
      .channel(`conversation:${conversationId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: user.id }
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('[useConversationPresence] Presence synced:', state);
        updatePresenceState(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[useConversationPresence] User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[useConversationPresence] User left:', key, leftPresences);
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        console.log('[useConversationPresence] Typing event:', payload);
        
        const { userId, isTyping } = payload.payload;
        
        // Don't show typing indicator for current user
        if (userId === user.id) return;
        
        updateTypingUsers(prev => {
          if (isTyping) {
            return prev.includes(userId) ? prev : [...prev, userId];
          } else {
            return prev.filter(id => id !== userId);
          }
        });
        
        // Auto-clear typing indicator after 3 seconds
        if (isTyping) {
          setTimeout(() => {
            updateTypingUsers(prev => prev.filter(id => id !== userId));
          }, 3000);
        }
      })
      .subscribe(async (status) => {
        console.log(`[useConversationPresence] Subscription status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          const userDisplayName = (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || user.email?.split('@')[0] || 'User';
          // Track presence in this conversation
          await channel.track({
            userId: user.id,
            userDisplayName,
            joinedAt: new Date().toISOString()
          });
        }
      });

    // Clean up subscription
    return () => {
      console.log(`[useConversationPresence] Cleaning up presence for conversation ${conversationId}`);
      channel.unsubscribe();
    };
  }, [conversationId, user, updatePresenceState, updateTypingUsers]);

  const activePresenceState = conversationId && user ? presenceState : {};
  const activeTypingUsers = conversationId && user ? typingUsers : [];

  // Get list of users currently present in conversation
  const presentUsers = Object.keys(activePresenceState).flatMap(userId => {
    if (userId === user?.id) return [];
    const presence = activePresenceState[userId][0]; // Get the first presence record
    return [{
      userId,
      userDisplayName: presence?.userDisplayName,
      joinedAt: presence?.joinedAt
    }];
  });

  return {
    presentUsers,
    typingUsers: activeTypingUsers,
    sendTypingIndicator,
    handleTypingTimeout,
    isPresenceActive: !!conversationId && !!user
  };
}
