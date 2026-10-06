import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeSystemPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

/**
 * Subscribe to real-time conversation changes and keep React Query caches fresh.
 * Expects `userId` to be the Database User ID (not Supabase UID).
 */
export function useConversationRealtime(userId?: string) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        (payload) => {
          const row = payload.new as any;
          const participants: string[] = row?.participants ?? [];
          if (participants.includes(userId)) {
            queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const row = payload.new as any;
          const participants: string[] = row?.participants ?? [];
          if (participants.includes(userId)) {
            queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
            queryClient.invalidateQueries({ queryKey: ['conversation', row.id] });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'conversations' },
        (payload) => {
          const row = payload.old as any;
          const participants: string[] = row?.participants ?? [];
          if (participants.includes(userId)) {
            queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
            queryClient.removeQueries({ queryKey: ['conversation', row.id] });
          }
        }
      )
      // Changes committed before this channel was streaming (between the
      // list's first fetch and the join, or while reconnecting) never arrive
      // as events, so unread counts and order would stay stale. Refetch once
      // the server confirms the postgres_changes stream for each (re)join.
      .on('system', {}, (payload: RealtimeSystemPayload) => {
        if (payload.extension === 'postgres_changes' && payload.status === 'ok') {
          void queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
        }
      });

    const subscription = channel.subscribe((status) => {
      setConnectionStatus(status);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient, userId]);

  return { connectionStatus };
}