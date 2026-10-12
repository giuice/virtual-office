import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeSystemPayload } from '@supabase/supabase-js';
import {
  createJoinCatchUp,
  isPostgresChangeOf,
  startRecoveringChannel,
  type MessagingRealtimeHealth,
} from '@/lib/messaging/realtime-health';
import { conversationMembersQueryKey, conversationMembersQueryPrefix } from '@/hooks/queries/useConversationMembers';
import { recordMembershipRemoval } from '@/lib/messaging/membership-removals';
import type { Conversation } from '@/types/messaging';

const CHANNEL_NAME = 'conversations-changes';

/** A new topic for every join of the stream (T13: a left channel's topic is never reused). */
function createChannelTopic(userId: string): string {
  const entropy = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${CHANNEL_NAME}:${userId}:${entropy}`;
}

/**
 * T15 (FR-019, BR-009): a conversation_members row was deleted. Realtime
 * cannot evaluate RLS on a deleted row, so every subscriber receives every
 * DELETE with the row id only; the viewer's own row ids come with its
 * conversation list (`preferences.id`). On the viewer's own removal its
 * roster is refetched (403 -> typing leaves the topic) and the list
 * refreshed (the conversation leaves it); block C fix F1: the removal is
 * also recorded at once (membership-removals.ts), so a notification decided
 * meanwhile is dropped before those refetches land. Any other deletion may be
 * another member leaving an open conversation (block C fix F6: the "@" list
 * and typing names) or the viewer's removal from a conversation whose own row
 * id the list does not carry (archived, beyond the first page): open rosters
 * are re-checked.
 */
function handleMembershipRowDeleted(queryClient: QueryClient, userId: string, rowId: unknown): void {
  if (typeof rowId !== 'string') return;
  const conversations = queryClient.getQueryData<Conversation[]>(['conversations', userId]) ?? [];
  const removedFrom = conversations.find((conversation) => conversation.preferences?.id === rowId);
  if (removedFrom) {
    recordMembershipRemoval(userId, removedFrom.id);
    void queryClient.invalidateQueries({ queryKey: conversationMembersQueryKey(userId, removedFrom.id) });
    void queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
    return;
  }
  void queryClient.invalidateQueries({
    queryKey: conversationMembersQueryPrefix(userId),
    refetchType: 'active',
  });
}

/**
 * Subscribe to real-time conversation changes and keep React Query caches fresh.
 * Expects `userId` to be the Database User ID (not Supabase UID).
 *
 * T13 (FR-015): the conversation-list stream rejoins after an error, a
 * timeout or a terminal closure with capped backoff (realtime-health.ts) and
 * reports its health as stream 'list'; every (re)join the server confirms
 * refetches the list (catch-up).
 *
 * T15 (FR-019): the same channel carries the viewer's own membership changes
 * (conversation_members DELETE / own INSERT), the removal signal that typing
 * relies on whether or not the conversation is open.
 */
export function useConversationRealtime(userId: string | undefined, health: MessagingRealtimeHealth) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    // Changes committed before this channel was streaming (between the list's
    // first fetch and the join, or while reconnecting) never arrive as events,
    // so unread counts and order would stay stale: the list refetches once
    // per (re)join, when it is both SUBSCRIBED and server-confirmed (block B
    // fix F5: whichever comes second); open rosters too (a removal missed
    // meanwhile, T15).
    const joinCatchUp = createJoinCatchUp(() => {
      void queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      void queryClient.invalidateQueries({
        queryKey: conversationMembersQueryPrefix(userId),
        refetchType: 'active',
      });
    });

    return startRecoveringChannel({
      stream: 'list',
      health,
      traceScope: 'useConversationRealtime',
      traceChannel: CHANNEL_NAME,
      createTopic: () => createChannelTopic(userId),
      onStatus: joinCatchUp.status,
      bind: (channel, isCurrent) => {
        joinCatchUp.joinStarted();
        return channel
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'conversations' },
            (payload) => {
              if (!isCurrent() || !isPostgresChangeOf(payload, 'conversations', ['INSERT'])) return;
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
              if (!isCurrent() || !isPostgresChangeOf(payload, 'conversations', ['UPDATE'])) return;
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
              if (!isCurrent() || !isPostgresChangeOf(payload, 'conversations', ['DELETE'])) return;
              const row = payload.old as any;
              const participants: string[] = row?.participants ?? [];
              if (participants.includes(userId)) {
                queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
                queryClient.removeQueries({ queryKey: ['conversation', row.id] });
              }
            }
          )
          // T15: the viewer's own membership changes -- a signal that does not
          // depend on still having access to the conversation (the typing
          // topic's authorization is cached per join).
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'conversation_members' },
            (payload) => {
              if (!isCurrent() || !isPostgresChangeOf(payload, 'conversation_members', ['DELETE'])) return;
              handleMembershipRowDeleted(queryClient, userId, (payload.old as { id?: unknown } | null)?.id);
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` },
            (payload) => {
              if (!isCurrent() || !isPostgresChangeOf(payload, 'conversation_members', ['INSERT'])) return;
              const conversationId = (payload.new as { conversation_id?: unknown } | null)?.conversation_id;
              if (typeof conversationId === 'string') {
                void queryClient.invalidateQueries({ queryKey: conversationMembersQueryKey(userId, conversationId) });
              }
            }
          )
          // The server confirmed this join's postgres_changes stream (catch-up above).
          .on('system', {}, (payload: RealtimeSystemPayload) => {
            if (isCurrent() && payload.extension === 'postgres_changes' && payload.status === 'ok') {
              joinCatchUp.confirmed();
            }
          });
      },
    });
  }, [health, queryClient, userId]);
}
