// src/hooks/useConversationPresence.ts
import { useReducerState } from '@/hooks/useReducerState';
import { useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { debugLogger } from '@/utils/debug-logger';

export interface TypingUser {
  userId: string;
  displayName: string;
}

// How long a remote "typing" signal stays visible without a refresh.
const REMOTE_TYPING_TTL_MS = 4000;
// Inactivity window before the local user stops broadcasting "typing".
const LOCAL_TYPING_IDLE_MS = 2000;

/**
 * Single owner of the `conversation:{id}` Realtime channel: presence tracking
 * plus typing indicators over broadcast (audit B-02 — typing is ephemeral and
 * never touches Postgres). Both send and receive run through the ONE
 * subscribed channel; creating a fresh channel per send leaks channel objects
 * and, with Phoenix topics, can kick the subscribed one off the socket.
 */
export function useConversationPresence(conversationId: string | null) {
  const { user } = useAuth();
  const [presenceState, updatePresenceState] = useReducerState<Record<string, any>>({});
  const [typingUsers, updateTypingUsers] = useReducerState<TypingUser[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef(false);
  const remoteTypingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const localTypingRef = useRef(false);
  const localIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTypingIndicator = useCallback((isTyping: boolean) => {
    const channel = channelRef.current;
    if (!channel || !isSubscribedRef.current || !user) return;

    const userDisplayName =
      (user.user_metadata as any)?.full_name ||
      (user.user_metadata as any)?.name ||
      user.email?.split('@')[0] ||
      'User';

    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, userDisplayName, isTyping },
    });
  }, [user]);

  /** Stop broadcasting "typing" for the local user (blur, send, unmount). */
  const stopTyping = useCallback(() => {
    if (localIdleTimerRef.current) {
      clearTimeout(localIdleTimerRef.current);
      localIdleTimerRef.current = null;
    }
    if (localTypingRef.current) {
      localTypingRef.current = false;
      sendTypingIndicator(false);
    }
  }, [sendTypingIndicator]);

  /** Call on every input change; debounces the broadcast and auto-stops. */
  const notifyTyping = useCallback(() => {
    if (!localTypingRef.current) {
      localTypingRef.current = true;
      sendTypingIndicator(true);
    }
    if (localIdleTimerRef.current) {
      clearTimeout(localIdleTimerRef.current);
    }
    localIdleTimerRef.current = setTimeout(stopTyping, LOCAL_TYPING_IDLE_MS);
  }, [sendTypingIndicator, stopTyping]);

  useEffect(() => {
    if (!conversationId || !user) {
      return;
    }

    const remoteTimers = remoteTypingTimersRef.current;

    const clearRemoteTyping = (userId: string) => {
      const timer = remoteTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        remoteTimers.delete(userId);
      }
      updateTypingUsers(prev => prev.filter(t => t.userId !== userId));
    };

    const channel = supabase
      .channel(`conversation:${conversationId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: user.id }
        }
      })
      .on('presence', { event: 'sync' }, () => {
        updatePresenceState(channel.presenceState());
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId, userDisplayName, isTyping } = payload.payload ?? {};
        if (!userId || userId === user.id) return;

        if (!isTyping) {
          clearRemoteTyping(userId);
          return;
        }

        updateTypingUsers(prev =>
          prev.some(t => t.userId === userId)
            ? prev
            : [...prev, { userId, displayName: userDisplayName || 'Someone' }]
        );

        // Reset (not stack) the TTL timer so continuous typing stays visible.
        const existing = remoteTimers.get(userId);
        if (existing) clearTimeout(existing);
        remoteTimers.set(
          userId,
          setTimeout(() => {
            remoteTimers.delete(userId);
            updateTypingUsers(prev => prev.filter(t => t.userId !== userId));
          }, REMOTE_TYPING_TTL_MS)
        );
      })
      .subscribe(async (status) => {
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.trace('useConversationPresence', 'status', {
            conversationId,
            status,
          });
        }

        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
          const userDisplayName =
            (user.user_metadata as any)?.full_name ||
            (user.user_metadata as any)?.name ||
            user.email?.split('@')[0] ||
            'User';
          await channel.track({
            userId: user.id,
            userDisplayName,
            joinedAt: new Date().toISOString()
          });
        } else {
          isSubscribedRef.current = false;
        }
      });

    channelRef.current = channel;

    return () => {
      remoteTimers.forEach((timer) => clearTimeout(timer));
      remoteTimers.clear();
      if (localIdleTimerRef.current) {
        clearTimeout(localIdleTimerRef.current);
        localIdleTimerRef.current = null;
      }
      localTypingRef.current = false;
      isSubscribedRef.current = false;
      channelRef.current = null;
      updateTypingUsers([]);
      void channel.unsubscribe();
      supabase.removeChannel(channel);
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
    notifyTyping,
    stopTyping,
    isPresenceActive: !!conversationId && !!user
  };
}
