import { useInfiniteQuery } from '@tanstack/react-query';

import { messagingApi } from '@/lib/messaging-api';
import type { MessagesPage } from '@/lib/messaging/message-cache';

/** Starred results per request; the server caps it at 50. */
export const STARRED_MESSAGES_PAGE_SIZE = 20;

/** Prefix shared by every conversation's starred-list key (Realtime catch-up). */
export const STARRED_MESSAGES_QUERY_KEY = ['starred-messages'] as const;

/**
 * Cache key of the viewer's starred messages in one conversation. Kept outside
 * ['messages', ...] so the feed's page updaters and invalidations never touch
 * it; useMessageActions keeps it in step with star/unstar, and every (re)join
 * of the messaging channel refetches it (useMessageSubscription), since stars
 * made on another session have no Realtime event.
 */
export const starredMessagesQueryKey = (conversationId: string) =>
  [...STARRED_MESSAGES_QUERY_KEY, conversationId] as const;

/**
 * The viewer's own starred messages in a conversation (Phase 4 FR-021 /
 * BR-009): newest message first, keyset-paginated, including messages older
 * than anything the feed has loaded. Fetched only while the starred view is
 * open (`enabled`) and always refetched on open, so a star added in the feed
 * or on another session shows up the next time the view opens.
 */
export function useStarredMessages(conversationId: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: starredMessagesQueryKey(conversationId ?? ''),
    enabled: enabled && !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }): Promise<MessagesPage> =>
      messagingApi.getStarredMessages(conversationId ?? '', {
        limit: STARRED_MESSAGES_PAGE_SIZE,
        cursorBefore: pageParam,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMoreOlder ? lastPage.nextCursorBefore : undefined),
    staleTime: 0,
    retry: false,
  });
}
