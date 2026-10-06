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
}

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
}

/**
 * Outcome of an idempotent message create (Phase 4 FR-024): `created` is
 * false when the request repeated a composition key already stored for the
 * same sender and conversation, and `message` is that stored message.
 */
export interface MessageCreateResult {
  message: Message;
  created: boolean;
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

