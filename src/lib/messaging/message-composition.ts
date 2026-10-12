// src/lib/messaging/message-composition.ts
// Phase 5 T2 (FR-024): the original submitted composition of a keyed create,
// stored in private.message_send_attempts and compared against on replay.
// Phase 5 T4: it also carries the requested mention ids. Pure helpers (no
// server or client dependencies).
import { MessageType, type MessageComposition } from '@/types/messaging';

/** Lowercase, distinct, sorted (the stored and compared form of an id set). */
function normalizeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}

export function buildComposition(input: {
  content: string;
  type: MessageType | null;
  replyToId?: string;
  attachmentIds: readonly string[];
  mentionIds?: readonly string[];
}): MessageComposition {
  return {
    content: input.content,
    type: input.type,
    replyToId: input.replyToId ?? null,
    attachmentIds: [...input.attachmentIds].sort(),
    mentionIds: normalizeIds(input.mentionIds ?? []),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * A composition read back from private.message_send_attempts; null when absent
 * or malformed. A composition stored before T4 has no `mentionIds`: none were
 * requested (same as an empty list).
 */
export function parseStoredComposition(value: unknown): MessageComposition | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const type = record.type;
  const replyToId = record.replyToId;
  const mentionIds = record.mentionIds === undefined ? [] : record.mentionIds;
  if (
    typeof record.content !== 'string' ||
    !(type === null || (typeof type === 'string' && (Object.values(MessageType) as string[]).includes(type))) ||
    !(replyToId === null || typeof replyToId === 'string') ||
    !isStringArray(record.attachmentIds) ||
    !isStringArray(mentionIds)
  ) {
    return null;
  }
  return {
    content: record.content,
    type: type as MessageType | null,
    replyToId,
    attachmentIds: [...record.attachmentIds].sort(),
    mentionIds: normalizeIds(mentionIds),
  };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * FR-024: an unchanged replay matches the ORIGINAL submitted composition,
 * including the requested mention ids (T4).
 */
export function isSameStoredComposition(stored: MessageComposition, requested: MessageComposition): boolean {
  return (
    stored.content === requested.content &&
    stored.type === requested.type &&
    stored.replyToId === requested.replyToId &&
    sameIds(stored.attachmentIds, requested.attachmentIds) &&
    sameIds(normalizeIds(stored.mentionIds), normalizeIds(requested.mentionIds))
  );
}
