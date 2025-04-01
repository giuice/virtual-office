// src/repositories/interfaces/IMessageRepository.ts
import { Message, FileAttachment, MessageReaction } from '@/types/messaging';
import { PaginationOptions } from '@/types/common'; // Assuming PaginationOptions type exists or needs creation

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(conversationId: string, options?: PaginationOptions): Promise<Message[]>;
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
}