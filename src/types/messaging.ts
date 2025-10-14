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

// Message Pin Type (user-specific pinned messages within a conversation)
export interface MessagePin {
  id: string;
  messageId: string;
  userId: string;
  pinnedAt: Date;
}

// Message Star Type (user-specific starred/bookmarked messages across conversations)
export interface MessageStar {
  id: string;
  messageId: string;
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
  pins?: MessagePin[]; // Optional: user-specific pins for this message
  stars?: MessageStar[]; // Optional: user-specific stars for this message
  isEdited: boolean;
}

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
  unreadCount: Record<string, number>; // Map of user IDs to unread counts
  roomId?: string; // Only for room conversations
  visibility?: ConversationVisibility; // For room conversations
  preferences?: ConversationPreferences; // Optional: current user's preferences
}

// Grouped Conversations Result
export interface GroupedConversations {
  direct: Conversation[];
  rooms: Conversation[];
}

// Unread Summary
export interface UnreadSummary {
  totalUnread: number;
  directUnread: number;
  roomUnread: number;
}
