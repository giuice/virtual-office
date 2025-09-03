// src/hooks/useConversationPresence.ts
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook for managing conversation presence and typing indicators
 * Implements Phase 3 of the realtime message integration plan
 */
export function useConversationPresence(conversationId: string | null) {
  const { user } = useAuth();
  const [presenceState, setPresenceState] = useState<Record<string, any>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // Send typing indicator
  const sendTypingIndicator = useCallback((isTyping: boolean) => {
    if (!conversationId || !user) return;

    const channel = supabase.channel(`conversation:${conversationId}`);
    
    if (isTyping) {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { 
          userId: user.id, 
          userDisplayName: user.displayName,
          isTyping: true 
        }
      });
    } else {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { 
          userId: user.id, 
          userDisplayName: user.displayName,
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
      setPresenceState({});
      setTypingUsers([]);
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
        setPresenceState(state);
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
        
        setTypingUsers(prev => {
          if (isTyping) {
            return prev.includes(userId) ? prev : [...prev, userId];
          } else {
            return prev.filter(id => id !== userId);
          }
        });
        
        // Auto-clear typing indicator after 3 seconds
        if (isTyping) {
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(id => id !== userId));
          }, 3000);
        }
      })
      .subscribe(async (status) => {
        console.log(`[useConversationPresence] Subscription status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          // Track presence in this conversation
          await channel.track({
            userId: user.id,
            userDisplayName: user.displayName,
            joinedAt: new Date().toISOString()
          });
        }
      });

    // Clean up subscription
    return () => {
      console.log(`[useConversationPresence] Cleaning up presence for conversation ${conversationId}`);
      channel.unsubscribe();
      setPresenceState({});
      setTypingUsers([]);
    };
  }, [conversationId, user]);

  // Get list of users currently present in conversation
  const presentUsers = Object.keys(presenceState).map(userId => {
    const presence = presenceState[userId][0]; // Get the first presence record
    return {
      userId,
      userDisplayName: presence?.userDisplayName,
      joinedAt: presence?.joinedAt
    };
  }).filter(u => u.userId !== user?.id); // Exclude current user

  return {
    presentUsers,
    typingUsers,
    sendTypingIndicator,
    handleTypingTimeout,
    isPresenceActive: !!conversationId && !!user
  };
}