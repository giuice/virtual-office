import { useQuery } from '@tanstack/react-query';

import { messagingApi } from '@/lib/messaging-api';
import type { ConversationMember } from '@/types/messaging';

/** Prefix of every roster key of a viewer (users.id). */
export const conversationMembersQueryPrefix = (viewerId: string) => ['conversation-members', viewerId] as const;

/** Cache key of one conversation's roster as seen by `viewerId` (users.id). */
export const conversationMembersQueryKey = (viewerId: string, conversationId: string) =>
  [...conversationMembersQueryPrefix(viewerId), conversationId] as const;

/**
 * Phase 5 T15: the current members of a conversation (users.id, display
 * names) — typing names (FR-018) and the viewer's own membership (FR-019).
 * `null` data: the viewer is not (or no longer) a member. Refetched when the
 * viewer's own membership changes (useConversationRealtime) and on every
 * conversation-list (re)join.
 */
export function useConversationMembers(conversationId: string | null, viewerId: string | null) {
  return useQuery<ConversationMember[] | null, Error>({
    queryKey: conversationMembersQueryKey(viewerId ?? '', conversationId ?? ''),
    queryFn: () => messagingApi.getConversationMembers(conversationId as string),
    enabled: Boolean(conversationId && viewerId),
    staleTime: 60_000,
  });
}
