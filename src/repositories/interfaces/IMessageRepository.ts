// src/repositories/interfaces/IMessageRepository.ts
import { Message, FileAttachment, MessageReaction, MessageReader, MessagePin, MessageStar, MessageCreateResult, MessageAttempt, MessageAttemptFenceResult, InsertionQuota } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';

/**
 * Phase 5 T2 (FR-006, BR-004): the database refused to commit a keyed create
 * because a newer attempt generation (or, for a generation-less create, any
 * fence state) exists for its key. Nothing was stored.
 */
export class AttemptSupersededError extends Error {
  readonly code = 'ATTEMPT_SUPERSEDED';

  constructor() {
    super('ATTEMPT_SUPERSEDED');
    this.name = 'AttemptSupersededError';
  }
}

/**
 * Phase 5 T2: a generation-carrying create found that the message committed
 * under its key was deleted since; nothing was stored (the outbox item was
 * delivered and must not be resent).
 */
export class MessageDeletedError extends Error {
  readonly code = 'MESSAGE_DELETED';

  constructor() {
    super('MESSAGE_DELETED');
    this.name = 'MessageDeletedError';
  }
}

/**
 * Phase 5 T3 (FR-008): the database refused a winning insertion because the
 * sender's insertion quota is exhausted (`exceeded`) or could not be charged
 * (`unavailable`: limiter missing, revoked or failing — fail-closed). The
 * insertion was rolled back: nothing was stored. Both are transient.
 */
export class InsertionRateLimitError extends Error {
  readonly code = 'RATE_LIMITED';

  constructor(readonly reason: 'exceeded' | 'unavailable') {
    super(reason === 'exceeded' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE');
    this.name = 'InsertionRateLimitError';
  }
}

/**
 * Phase 5 T3: the database refused the sender as a non-member of the
 * conversation (its explicit NOT_PARTICIPANT marker). Only this refusal maps to
 * 403 NOT_PARTICIPANT; any other permission error is an infrastructure failure.
 */
export class NotParticipantError extends Error {
  readonly code = 'NOT_PARTICIPANT';

  constructor() {
    super('NOT_PARTICIPANT');
    this.name = 'NotParticipantError';
  }
}

/** A client key is scoped to its sender (users.id) and conversation. */
export interface ClientMessageKey {
  senderId: string;
  conversationId: string;
  clientMessageId: string;
}

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(conversationId: string, options?: PaginationOptions): Promise<PaginatedResult<Message>>;
  create(messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>): Promise<Message>;
  // Phase 5 T3 (FR-008): unkeyed create through the transactional create
  // function, charging `insertQuota` only when the insertion commits
  // (InsertionRateLimitError, nothing stored, when exhausted or uncheckable).
  // Throws AttachmentLinkError for the database's validation refusals.
  createUnkeyed(
    messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>,
    insertQuota: InsertionQuota
  ): Promise<Message>;
  // Idempotent create keyed by the client's composition key (FR-024): returns
  // the message already stored with this key for the same sender and
  // conversation (created: false) instead of inserting another.
  // Phase 5 T2: commits only while the attempt is current for the key at
  // commit time (throws AttemptSupersededError otherwise) and records the
  // attempt's composition; replays return the recorded composition.
  // Phase 5 T3 (FR-008): a winning insertion charges `insertQuota` in its own
  // transaction (null = no charge); an exhausted or uncheckable quota throws
  // InsertionRateLimitError and stores nothing. Replays are never charged.
  createWithClientKey(
    messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>,
    clientMessageId: string,
    attempt: MessageAttempt | undefined,
    insertQuota: InsertionQuota | null
  ): Promise<MessageCreateResult>;
  // Phase 5 T2 (FR-006): fence/lookup of the sender's own key. Never creates a
  // message. Callers must authorize the sender (users.id) and membership.
  fenceClientMessage(key: ClientMessageKey, generation: number): Promise<MessageAttemptFenceResult>;
  update(id: string, updates: Partial<Pick<Message, 'content' | 'status' | 'isEdited'>>): Promise<Message | null>;
  deleteById(id: string): Promise<boolean>;

  // Attachment specific methods
  addAttachment(messageId: string, attachmentData: Omit<FileAttachment, 'id'>): Promise<FileAttachment>;
  // removeAttachment might be needed depending on requirements

  // Reaction specific methods
  addReaction(messageId: string, reactionData: Omit<MessageReaction, 'timestamp'>): Promise<MessageReaction>;
  removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean>;
  findReactions(messageId: string): Promise<MessageReaction[]>;

  // Read receipt methods. Receipts are written exclusively by service_role RPCs
  // (see IConversationRepository.markConversationRead / markMessagesRead).
  // Reader details are for the message's sender only (BR-003): callers must
  // authorize the sender before calling.
  getMessageReaders(messageId: string, senderId: string): Promise<MessageReader[]>;

  // Message pin methods (user-specific, per-conversation)
  pinMessage(messageId: string, conversationId: string, userId: string): Promise<MessagePin>;
  unpinMessage(messageId: string, userId: string): Promise<boolean>;
  getPinnedMessages(conversationId: string, userId: string): Promise<Message[]>;

  // Message star methods (user-specific bookmarks)
  starMessage(messageId: string, conversationId: string, userId: string): Promise<MessageStar>;
  unstarMessage(messageId: string, userId: string): Promise<boolean>;
  // The user's starred messages in one conversation, newest message first,
  // keyset-paginated with the feed's composite cursor (FR-021). Callers must
  // authorize conversation membership and validate cursorBefore (it is
  // interpolated into a PostgREST filter) before calling.
  getStarredMessages(
    userId: string,
    conversationId: string,
    options?: Pick<PaginationOptions, 'limit' | 'cursorBefore'>
  ): Promise<PaginatedResult<Message>>;
}
