import { useQuery } from '@tanstack/react-query';

import { messagingApi } from '@/lib/messaging-api';
import type { MessageReader } from '@/types/messaging';

export interface MessageReadersData {
  readCount: number;
  readers: MessageReader[];
}

/** Prefix shared by every message's reader-list key (Realtime catch-up). */
export const MESSAGE_READERS_QUERY_KEY = ['message-readers'] as const;

/**
 * Cache key of a message's reader list. Kept outside ['messages', ...] so the
 * feed's page updaters never touch it; the Realtime receipt handler
 * invalidates it per message, and every (re)join of the messaging channel
 * invalidates them all (useMessageSubscription).
 */
export const messageReadersQueryKey = (messageId: string) =>
  [...MESSAGE_READERS_QUERY_KEY, messageId] as const;

/**
 * Who read one of the viewer's own messages, most recent first (Phase 4
 * FR-002). Fetched only while the reader list is open (`enabled`), so the feed
 * never issues one request per message; the "Lida por N" summary comes from
 * the feed payload instead.
 */
export function useMessageReaders(messageId: string, enabled: boolean) {
  return useQuery<MessageReadersData, Error>({
    queryKey: messageReadersQueryKey(messageId),
    queryFn: () => messagingApi.getMessageReaders(messageId),
    enabled,
    // Always refetch on open: a receipt may have arrived while it was closed.
    staleTime: 0,
    retry: false,
  });
}
