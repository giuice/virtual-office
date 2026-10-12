// src/lib/messaging/outbox/outbox-view.ts
// Phase 5 T8: renders outbox items through the sender's pending store
// (['messages-pending', users.id, conversationId], T7) — the outbox is the
// durable source, the pending query only its render view.
import type { QueryClient } from '@tanstack/react-query';

import { MessageStatus, MessageType, type Message, type MessageDeliveryState } from '@/types/messaging';
import type { OutboxItem } from '@/types/message-outbox';
import {
  appendMessageToPages,
  isMessageDeleted,
  isPendingMessage,
  keepMessageThroughInflightFetch,
  normalizeClientMessageId,
  pendingMessagesQueryKey,
  PENDING_MESSAGE_ID_PREFIX,
  type MessagesInfiniteData,
} from '@/lib/messaging/message-cache';

const deliveryStateOf = (item: OutboxItem): MessageDeliveryState => {
  switch (item.state) {
    case 'waiting':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      // claimed / unknown: an attempt is (or may still be) in progress (FR-005).
      return 'sending';
  }
};

export function outboxItemToPendingMessage(item: OutboxItem): Message {
  const deliveryState = deliveryStateOf(item);
  return {
    id: `${PENDING_MESSAGE_ID_PREFIX}${item.clientMessageId}`,
    conversationId: item.conversationId,
    senderId: item.ownerId,
    content: item.content,
    timestamp: new Date(item.pressedSendAt),
    type: MessageType.TEXT,
    status: deliveryState === 'failed' || deliveryState === 'expired' ? MessageStatus.FAILED : MessageStatus.SENDING,
    replyToId: item.replyToId ?? undefined,
    reactions: [],
    isEdited: false,
    clientMessageId: item.clientMessageId,
    // Phase 5 T17: the requested mentions render on the sender's pending copy.
    ...(item.mentionIds.length > 0 ? { mentionedUserIds: [...item.mentionIds] } : {}),
    deliveryState,
    cancellable: item.state === 'waiting' && item.attemptGeneration === 0,
  };
}

/**
 * Replaces the outbox copies of a conversation's pending view with `items`
 * (in creation order), keeping the pending copies that are not outbox items
 * (attachment/voice sends, which are never queued).
 */
export function writeOutboxView(
  queryClient: QueryClient,
  ownerId: string,
  conversationId: string,
  items: readonly OutboxItem[]
): void {
  const outboxCopies = [...items].sort((a, b) => a.order - b.order).map(outboxItemToPendingMessage);
  const outboxKeys = new Set(outboxCopies.map((message) => message.clientMessageId));
  queryClient.setQueryData<Message[]>(pendingMessagesQueryKey(ownerId, conversationId), (current) => {
    const others = (current ?? []).filter(
      (message) =>
        message.deliveryState === undefined && !outboxKeys.has(normalizeClientMessageId(message.clientMessageId) ?? '')
    );
    if (others.length === 0) return outboxCopies;
    return [...others, ...outboxCopies].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });
}

/**
 * T12 (FR-013): empties every pending view of the owner (all conversations),
 * for "Sair mesmo". The queries stay (their observers keep working) but hold
 * no copy.
 */
export function clearOutboxViews(queryClient: QueryClient, ownerId: string): void {
  queryClient.setQueriesData<Message[]>({ queryKey: ['messages-pending', ownerId] }, []);
}

/**
 * Shows one just-committed item in its conversation's pending view (added, or
 * replacing its earlier copy), without reading the outbox again.
 */
export function publishOutboxItem(queryClient: QueryClient, item: OutboxItem): void {
  const copy = outboxItemToPendingMessage(item);
  queryClient.setQueryData<Message[]>(pendingMessagesQueryKey(item.ownerId, item.conversationId), (current) =>
    [
      ...(current ?? []).filter(
        (message) => normalizeClientMessageId(message.clientMessageId) !== item.clientMessageId
      ),
      copy,
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  );
}

/**
 * The server confirmed the item (`message` stored or replayed; null when it
 * was deleted since). As for a direct send (useMessages.sendMessage): unless
 * the feed already observed the key or this client saw the message deleted,
 * merge the stored message into a loaded (or loading) feed first, then drop
 * the pending copy — never two bubbles, never none.
 */
export function showConfirmedOutboxMessage(
  queryClient: QueryClient,
  ownerId: string,
  conversationId: string,
  clientMessageId: string,
  message: Message | null
): void {
  const pendingKey = pendingMessagesQueryKey(ownerId, conversationId);
  const feedKey = ['messages', conversationId] as const;
  const unresolved = isPendingMessage(queryClient.getQueryData<Message[]>(pendingKey), clientMessageId);
  const feed = queryClient.getQueryCache().find<MessagesInfiniteData>({ queryKey: feedKey, exact: true });
  // A feed never loaded is fetched (with this message) when it is opened; a
  // cache built from this one message would hide the older history.
  const feedPresent = Boolean(feed?.state.data) || feed?.state.fetchStatus === 'fetching';
  if (message && unresolved && feedPresent && !isMessageDeleted(queryClient, message.id)) {
    const confirmed: Message = {
      ...message,
      clientMessageId: normalizeClientMessageId(message.clientMessageId) ?? clientMessageId,
    };
    queryClient.setQueryData<MessagesInfiniteData | undefined>(feedKey, (oldData) =>
      appendMessageToPages(oldData, confirmed)
    );
    keepMessageThroughInflightFetch(queryClient, conversationId, confirmed);
  }
  queryClient.setQueryData<Message[]>(pendingKey, (current) =>
    (current ?? []).filter((pending) => normalizeClientMessageId(pending.clientMessageId) !== clientMessageId)
  );
}
