// src/lib/messaging/reaction-cache.ts
import { Message, MessageReaction } from '@/types/messaging';

interface ToggleReactionOptions {
  message: Message;
  messageId: string;
  emoji: string;
  userId: string;
  timestamp?: Date;
  mode?: 'toggle' | 'add' | 'remove';
}

interface TogglePagesOptions<TPage extends { messages: Message[] }> {
  pages: TPage[];
  messageId: string;
  emoji: string;
  userId: string;
  timestamp?: Date;
  mode?: 'toggle' | 'add' | 'remove';
}

const ensureDate = (value: Date | string | number): Date => {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0);
  }
  return parsed;
};

const sortByTimestampAsc = (a: MessageReaction, b: MessageReaction) => {
  return ensureDate(a.timestamp).getTime() - ensureDate(b.timestamp).getTime();
};

export const toggleReactionOnMessage = ({
  message,
  messageId,
  emoji,
  userId,
  timestamp = new Date(),
  mode = 'toggle',
}: ToggleReactionOptions): Message => {
  if (message.id !== messageId) {
    return message;
  }

  const targetKey = `${userId}:${emoji}`;
  const dedupMap = new Map<string, MessageReaction>();

  for (const reaction of message.reactions ?? []) {
    const key = `${reaction.userId}:${reaction.emoji}`;
    const normalizedReaction: MessageReaction = {
      ...reaction,
      timestamp: ensureDate(reaction.timestamp),
    };

    const existing = dedupMap.get(key);
    if (!existing || ensureDate(existing.timestamp) < normalizedReaction.timestamp) {
      dedupMap.set(key, normalizedReaction);
    }
  }

  if (mode === 'remove') {
    dedupMap.delete(targetKey);
  } else if (mode === 'add') {
    dedupMap.set(targetKey, { emoji, userId, timestamp });
  } else if (dedupMap.has(targetKey)) {
    dedupMap.delete(targetKey);
  } else {
    dedupMap.set(targetKey, { emoji, userId, timestamp });
  }

  const nextReactions = Array.from(dedupMap.values()).sort(sortByTimestampAsc);

  // If nothing changed, return the original message reference
  const original = message.reactions ?? [];
  if (
    original.length === nextReactions.length &&
    original.every((reaction, index) => {
      const next = nextReactions[index];
      return (
        reaction.emoji === next.emoji &&
        reaction.userId === next.userId &&
        ensureDate(reaction.timestamp).getTime() === ensureDate(next.timestamp).getTime()
      );
    })
  ) {
    return message;
  }

  return {
    ...message,
    reactions: nextReactions,
  };
};

export const toggleReactionInPages = <TPage extends { messages: Message[] }>({
  pages,
  messageId,
  emoji,
  userId,
  timestamp,
  mode = 'toggle',
}: TogglePagesOptions<TPage>): TPage[] => {
  let hasChanges = false;

  const nextPages = pages.map((page) => {
    let pageChanged = false;

    const nextMessages = page.messages.map((message) => {
      const updated = toggleReactionOnMessage({
        message,
        messageId,
        emoji,
        userId,
        timestamp,
        mode,
      });

      if (updated !== message) {
        pageChanged = true;
      }

      return updated;
    });

    if (!pageChanged) {
      return page;
    }

    hasChanges = true;
    return {
      ...page,
      messages: nextMessages,
    } as TPage;
  });

  return hasChanges ? nextPages : pages;
};
