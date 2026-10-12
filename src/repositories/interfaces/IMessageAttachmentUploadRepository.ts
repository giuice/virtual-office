// src/repositories/interfaces/IMessageAttachmentUploadRepository.ts
import type {
  InsertionQuota,
  Message,
  MessageAttempt,
  MessageWithAttachmentsCreateResult,
  PendingAttachmentUpload,
} from '@/types/messaging';

export type MessageWithAttachmentsCreateData = Pick<
  Message,
  'conversationId' | 'senderId' | 'content' | 'type' | 'replyToId'
>;

/**
 * Reasons the database refused to link pending uploads to a new message, or
 * (Phase 5 T2, create_message_attempt) to create a keyed text message
 * (INVALID_REPLY_TARGET, NOT_PARTICIPANT).
 */
export type AttachmentLinkFailureCode =
  | 'ATTACHMENT_UPLOAD_NOT_FOUND'
  | 'ATTACHMENT_COUNT_INVALID'
  | 'ATTACHMENT_DUPLICATE'
  | 'INVALID_REPLY_TARGET'
  | 'VOICE_NOTE_NOT_ALONE'
  | 'NOT_PARTICIPANT';

export class AttachmentLinkError extends Error {
  constructor(readonly code: AttachmentLinkFailureCode) {
    super(code);
    this.name = 'AttachmentLinkError';
  }
}

/**
 * Pending (not yet sent) message attachment uploads (Phase 4 T12). Service
 * role only: callers authorize the user (users.id) and membership first.
 */
export interface IMessageAttachmentUploadRepository {
  create(upload: Omit<PendingAttachmentUpload, 'createdAt'>): Promise<PendingAttachmentUpload>;
  /** The given uploads that belong to this uploader and conversation. */
  findOwned(ids: readonly string[], uploaderId: string, conversationId: string): Promise<PendingAttachmentUpload[]>;
  /** Deletes one of the uploader's pending uploads; null when there is none. */
  deleteOwned(id: string, uploaderId: string): Promise<PendingAttachmentUpload | null>;
  /** Deletes up to `limit` of the uploader's pending uploads created before `olderThan`. */
  deleteStaleOwned(uploaderId: string, olderThan: Date, limit: number): Promise<PendingAttachmentUpload[]>;
  /** Ids of the attachments linked to a message; throws when they cannot be read. */
  listLinkedAttachmentIds(messageId: string): Promise<string[]>;
  /**
   * Atomically creates the message and links the uploads (attachment id =
   * upload id). With a client key already stored for the sender and
   * conversation, links nothing and returns that message (created: false).
   * Throws AttachmentLinkError when the uploads cannot be linked, and
   * AttemptSupersededError (Phase 5 T2) when a keyed create is fenced.
   * Phase 5 T3 (FR-008): a winning insertion charges `insertQuota` in its own
   * transaction (null = no charge); an exhausted or uncheckable quota throws
   * InsertionRateLimitError and stores and links nothing.
   */
  createMessageWithAttachments(
    data: MessageWithAttachmentsCreateData,
    uploadIds: readonly string[],
    clientMessageId: string | undefined,
    attempt: MessageAttempt | undefined,
    insertQuota: InsertionQuota | null
  ): Promise<MessageWithAttachmentsCreateResult>;
}
