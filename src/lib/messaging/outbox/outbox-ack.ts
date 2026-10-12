// src/lib/messaging/outbox/outbox-ack.ts
// Phase 5 T8: reads a create response's `message` as the stored message of
// an outbox item. A response confirms the item only if it parses here; the
// result is built from validated fields only (nothing else is copied), so a
// malformed response can neither confirm a send nor reach the feed renderers.
import {
  MessageStatus,
  MessageType,
  type Message,
  type MessageReaction,
} from '@/types/messaging';

/** The item an attempt was made for: a confirmation must be its own stored message. */
export interface AttemptedItem {
  senderId: string;
  conversationId: string;
  clientMessageId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_TYPES = new Set<string>(Object.values(MessageType));
const MESSAGE_STATUSES = new Set<string>(Object.values(MessageStatus));

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Reactions as the repository maps them: emoji, reacting user (users.id), time. */
function parseReactions(value: unknown): MessageReaction[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const reactions: MessageReaction[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) return null;
    const timestamp = parseDate(entry.timestamp);
    if (typeof entry.emoji !== 'string' || entry.emoji.length === 0 || !isUuid(entry.userId) || !timestamp) {
      return null;
    }
    reactions.push({ emoji: entry.emoji, userId: entry.userId, timestamp });
  }
  return reactions;
}

/** Stored mentions (users.id); absent on responses that carry none. */
function parseMentionedUserIds(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isUuid)) return null;
  return [...value];
}

/**
 * The stored message of `item` in the feed's shape, or null when `raw` is not
 * one. Correlation uses only what never changes for a stored message: a UUID
 * `id`, the sender (users.id), the conversation and the composition key
 * (case-insensitive). The stored text and reply target are not compared with
 * the item's (a replay returns the current row: reply target deleted since,
 * edited text), but must be renderable. Every field copied is checked, with
 * the shapes the create route returns for a created (201) or replayed (200)
 * keyed text message (repository mapper + key):
 * - `content` string; `replyToId` absent, null or a UUID;
 * - `timestamp` parseable; `type` and `status` known values;
 * - `isEdited` absent, null or boolean;
 * - `reactions` absent or a list of {emoji string, userId UUID, timestamp};
 * - `attachments` absent or empty (an outbox item is text only);
 * - `mentionedUserIds` absent or a list of UUIDs;
 * - `readCount` absent or a non-negative integer.
 * Other fields (pins, stars — the route strips them — or anything else) are
 * not copied.
 */
export function parseStoredMessage(raw: unknown, item: AttemptedItem): Message | null {
  if (!isPlainObject(raw)) return null;
  const timestamp = parseDate(raw.timestamp);
  const reactions = parseReactions(raw.reactions);
  const mentionedUserIds = parseMentionedUserIds(raw.mentionedUserIds);
  const correlated =
    isUuid(raw.id) &&
    raw.senderId === item.senderId &&
    raw.conversationId === item.conversationId &&
    typeof raw.clientMessageId === 'string' &&
    raw.clientMessageId.toLowerCase() === item.clientMessageId.toLowerCase();
  const renderable =
    typeof raw.content === 'string' &&
    (raw.replyToId === undefined || raw.replyToId === null || isUuid(raw.replyToId)) &&
    timestamp !== null &&
    typeof raw.type === 'string' &&
    MESSAGE_TYPES.has(raw.type) &&
    typeof raw.status === 'string' &&
    MESSAGE_STATUSES.has(raw.status) &&
    (raw.isEdited === undefined || raw.isEdited === null || typeof raw.isEdited === 'boolean') &&
    reactions !== null &&
    (raw.attachments === undefined || (Array.isArray(raw.attachments) && raw.attachments.length === 0)) &&
    mentionedUserIds !== null &&
    (raw.readCount === undefined ||
      (typeof raw.readCount === 'number' && Number.isInteger(raw.readCount) && raw.readCount >= 0));
  if (!correlated || !renderable || timestamp === null || reactions === null || mentionedUserIds === null) {
    return null;
  }
  return {
    id: raw.id as string,
    conversationId: item.conversationId,
    senderId: item.senderId,
    content: raw.content as string,
    timestamp,
    type: raw.type as MessageType,
    status: raw.status as MessageStatus,
    replyToId: typeof raw.replyToId === 'string' ? raw.replyToId : undefined,
    attachments: [],
    reactions,
    isEdited: raw.isEdited === true,
    clientMessageId: item.clientMessageId.toLowerCase(),
    ...(mentionedUserIds !== undefined ? { mentionedUserIds } : {}),
    ...(typeof raw.readCount === 'number' ? { readCount: raw.readCount } : {}),
  };
}
