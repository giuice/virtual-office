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

// Message Reaction Type
export interface MessageReaction {
  emoji: string;
  userId: string;
  timestamp: Date;
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
// Conversation Interface
export interface Conversation {
  id: string;
  type: ConversationType;
  participants: string[]; // User IDs
  lastActivity: Date;
  name?: string; // For group and room conversations
  isArchived: boolean;
  unreadCount: Record<string, number>; // Map of user IDs to unread counts
  roomId?: string; // Only for room conversations
  visibility?: ConversationVisibility; // For room conversations
}
