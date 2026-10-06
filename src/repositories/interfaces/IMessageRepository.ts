// src/repositories/interfaces/IMessageRepository.ts
import { Message, FileAttachment, MessageReaction, MessageReader, MessagePin, MessageStar, MessageCreateResult } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(conversationId: string, options?: PaginationOptions): Promise<PaginatedResult<Message>>;
  create(messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>): Promise<Message>;
  // Idempotent create keyed by the client's composition key (FR-024): returns
  // the message already stored with this key for the same sender and
  // conversation (created: false) instead of inserting another.
  createWithClientKey(
    messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>,
    clientMessageId: string
  ): Promise<MessageCreateResult>;
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
