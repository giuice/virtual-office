// src/types/messaging.ts

// Message Types
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  SYSTEM = 'system',
  ANNOUNCEMENT = 'announcement'
}

// Message Status
export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

// File Attachment Type
export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

/**
 * A file uploaded for a conversation and not yet linked to a sent message
 * (Phase 4 T12). Visible to no one; `id` becomes the attachment id when the
 * message is created with it, or it is removed by cancelling the upload.
 */
export interface PendingAttachmentUpload {
  id: string;
  conversationId: string;
  uploaderId: string; // users.id
  storagePath: string;
  name: string;
  type: string;
  size: number;
  createdAt: Date;
  /** Voice notes only (Phase 4 T15): whole seconds, 1-120. */
  duration?: number;
  /** Voice notes only: 1-256 amplitudes in [0, 1]. */
  waveformData?: number[];
}

/** Outcome of creating a message together with its attachments. */
export interface MessageWithAttachmentsCreateResult {
  messageId: string;
  created: boolean;
  /**
   * Phase 5 T2: on a replay (created: false), the original composition
   * recorded when the message was created under its key; null when none was
   * recorded (keyed messages created before Phase 5).
   */
  storedComposition?: MessageComposition | null;
}

/**
 * Phase 5 T2 (FR-024): the original submitted composition of a keyed create,
 * normalized by the create route, which replays of the same key are compared
 * against. `type` is null for attachment messages (their type derives from
 * the attachments); `attachmentIds` is sorted. Phase 5 T4: `mentionIds` are
 * the REQUESTED mention user ids (users.id; lowercase, distinct, sorted), not
 * only the stored ones; a stored composition without them (created before T4)
 * means none were requested, like an empty list.
 */
export interface MessageComposition {
  content: string;
  type: MessageType | null;
  replyToId: string | null;
  attachmentIds: string[];
  mentionIds: string[];
}

/**
 * Phase 5 T2 (FR-006): one dispatch of a keyed composition. `generation` is
 * monotonic per (sender, conversation, clientMessageId); absent for Phase 4
 * clients, whose keyed creates commit only while the key has no fence state.
 */
export interface MessageAttempt {
  generation?: number;
  composition: MessageComposition;
}

/**
 * Phase 5 T3 (FR-008, D1): the sender's message insertion quota (at most
 * `limit` stored messages per fixed `windowSeconds` window). The database
 * charges it in the transaction of a winning insertion only; replays, lost
 * same-key races and refused creates never consume it.
 */
export interface InsertionQuota {
  limit: number;
  windowSeconds: number;
}

/**
 * Phase 5 T2: result of fencing/looking up the caller's own key. `superseded`
 * means a newer generation exists (nothing was changed). `stored` with a null
 * messageId: a message was committed under the key and deleted since.
 */
export type MessageAttemptFenceResult =
  | { outcome: 'superseded' }
  | { outcome: 'stored'; messageId: string | null }
  | { outcome: 'not_stored' };

// Voice Note Attachment (extends FileAttachment with voice-specific metadata)
export interface VoiceNoteAttachment extends FileAttachment {
  duration: number; // Duration in seconds
  waveformData?: number[]; // Amplitude array for waveform visualization
  transcription?: string; // Optional text transcription of voice message
}

// Message Reaction Type
export interface MessageReaction {
  emoji: string;
  userId: string;
  timestamp: Date;
}

// Read Receipt Type (tracks when users read messages)
export interface ReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: Date;
}

// Reader of a message, exposed only to the message's sender (Phase 4 BR-003)
export interface MessageReader {
  userId: string; // users.id
  displayName: string | null;
  avatarUrl: string | null;
  readAt: Date;
}

// Message Pin Type (user-specific pinned messages within a conversation)
export interface MessagePin {
  id: string;
  messageId: string;
  conversationId: string;
  userId: string; // pinnedBy
  pinnedAt: Date;
}

// Message Star Type (user-specific starred/bookmarked messages across conversations)
export interface MessageStar {
  id: string;
  messageId: string;
  conversationId: string;
  userId: string;
  starredAt: Date;
}

// Message Interface
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: MessageType;
  status: MessageStatus;
  replyToId?: string;
  attachments?: FileAttachment[];
  reactions: MessageReaction[];
  readReceipts?: ReadReceipt[]; // Optional: populated when fetching with read receipt data
  // Distinct non-sender readers ("Lida por N", Phase 4 FR-001). Sent by the
  // feed only on the viewer's own messages; absent means 0.
  readCount?: number;
  pins?: MessagePin[]; // Optional: user-specific pins for this message
  stars?: MessageStar[]; // Optional: user-specific stars for this message
  isEdited: boolean;
  // Phase 5 FR-034: the sender's composition key (messages.client_message_id),
  // absent on unkeyed messages. Carried by the create and fence responses,
  // the feed (own messages only), Realtime INSERTs and pending messages; a
  // pending message is matched to its stored message only by this key.
  clientMessageId?: string;
  // Phase 5 T4 (FR-024): users (users.id) this message mentions, stored with
  // its first creation (members other than the sender at that time), sorted.
  // Set on messages read by the repository (feed, create/fence responses).
  mentionedUserIds?: string[];
  // Phase 5 T8 (client only, never sent by the server): delivery state of the
  // sender's outbox copy of a text message, shown as a text label.
  deliveryState?: MessageDeliveryState;
  // Phase 5 T10 (client only): the outbox copy is known not to be stored
  // (waiting, never dispatched), so it may be cancelled (FR-005).
  cancellable?: boolean;
}

/**
 * Phase 5 T8: label state of a pending outbox copy — `pending` (waiting to
 * be sent), `sending` (an attempt is or may be in progress), `failed`
 * (definitively rejected), `expired` (not sent within 24 h, T9).
 */
export type MessageDeliveryState = 'pending' | 'sending' | 'failed' | 'expired';

/**
 * Phase 5 T4 (FR-023): a current member of a conversation
 * (public.conversation_members), as listed to other current members.
 */
export interface ConversationMember {
  userId: string; // users.id
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Outcome of an idempotent message create (Phase 4 FR-024): `created` is
 * false when the request repeated a composition key already stored for the
 * same sender and conversation, and `message` is that stored message.
 */
export interface MessageCreateResult {
  message: Message;
  created: boolean;
  /** Phase 5 T2: see MessageWithAttachmentsCreateResult.storedComposition. */
  storedComposition?: MessageComposition | null;
}

/**
 * Outcome of loading a conversation's history until a given message is in the
 * feed: it is loaded; it can no longer be reached (history exhausted without
 * it, access lost, or a page failed); or the search was abandoned.
 */
export type MessageHistorySearchResult = 'found' | 'unavailable' | 'cancelled';

// Conversation Types
export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group',
  ROOM = 'room'
}

export enum ConversationVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  DIRECT = 'direct'
}
// Conversation Preferences (per-user settings)
export interface ConversationPreferences {
  id: string;
  conversationId: string;
  userId: string;
  isPinned: boolean;
  pinnedOrder: number | null; // NULL = not pinned, 0-N for user-defined order
  isStarred: boolean;
  isArchived: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Conversation Interface
export interface Conversation {
  id: string;
  type: ConversationType;
  participants: string[]; // User IDs
  lastActivity: Date;
  name?: string; // For group and room conversations
  isArchived: boolean; // DEPRECATED: Use preferences.isArchived for per-user control
  unreadCount: number; // Viewer's unread count, server-computed from conversation_members.last_read_at
  roomId?: string; // Only for room conversations
  visibility?: ConversationVisibility; // For room conversations
  preferences?: ConversationPreferences; // Optional: current user's preferences
}

