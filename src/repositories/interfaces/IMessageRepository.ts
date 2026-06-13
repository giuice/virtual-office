// src/repositories/interfaces/IMessageRepository.ts
import { Message, FileAttachment, MessageReaction, ReadReceipt, MessagePin, MessageStar } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(conversationId: string, options?: PaginationOptions): Promise<PaginatedResult<Message>>;
  create(messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>): Promise<Message>;
  update(id: string, updates: Partial<Pick<Message, 'content' | 'status' | 'isEdited'>>): Promise<Message | null>;
  deleteById(id: string): Promise<boolean>;

  // Attachment specific methods
  addAttachment(messageId: string, attachmentData: Omit<FileAttachment, 'id'>): Promise<FileAttachment>;
  // removeAttachment might be needed depending on requirements

  // Reaction specific methods
  addReaction(messageId: string, reactionData: Omit<MessageReaction, 'timestamp'>): Promise<MessageReaction>;
  removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean>;
  findReactions(messageId: string): Promise<MessageReaction[]>;

  // Read receipt methods. Receipts are written exclusively by the
  // mark_conversation_read RPC (see IConversationRepository.markConversationRead).
  getReadReceipts(messageId: string): Promise<ReadReceipt[]>;

  // Message pin methods (user-specific, per-conversation)
  pinMessage(messageId: string, conversationId: string, userId: string): Promise<MessagePin>;
  unpinMessage(messageId: string, userId: string): Promise<boolean>;
  getPinnedMessages(conversationId: string, userId: string): Promise<Message[]>;

  // Message star methods (user-specific, cross-conversation bookmarks)
  starMessage(messageId: string, conversationId: string, userId: string): Promise<MessageStar>;
  unstarMessage(messageId: string, userId: string): Promise<boolean>;
  getStarredMessages(userId: string, conversationId?: string): Promise<Message[]>;
}
