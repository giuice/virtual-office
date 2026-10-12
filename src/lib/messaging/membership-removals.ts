// src/lib/messaging/membership-removals.ts
// Phase 5 block C fix F1 (FR-025, BR-011, AC-049): the viewer's removals from
// conversations, as this tab received them on the conversation-list stream
// (useConversationRealtime: a conversation_members DELETE of the viewer's own
// row). Recorded synchronously when the event arrives, so a decision already
// in progress (a desktop notification waiting for its authorization read) can
// tell that a removal arrived meanwhile, before the list or roster refetch
// that reflects it has landed.

const removalCounts = new Map<string, number>();

const removalKey = (userId: string, conversationId: string): string =>
  `${userId.toLowerCase()}:${conversationId.toLowerCase()}`;

/** A removal of `userId` (users.id) from the conversation arrived in this tab. */
export function recordMembershipRemoval(userId: string, conversationId: string): void {
  const key = removalKey(userId, conversationId);
  removalCounts.set(key, (removalCounts.get(key) ?? 0) + 1);
}

/**
 * How many removals of `userId` from the conversation this tab has received.
 * Read before and after an awaited step: a change means a removal arrived in between.
 */
export function membershipRemovalCount(userId: string, conversationId: string): number {
  return removalCounts.get(removalKey(userId, conversationId)) ?? 0;
}
