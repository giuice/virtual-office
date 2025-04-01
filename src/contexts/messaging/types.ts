// src/contexts/messaging/types.ts
import { Socket } from 'socket.io-client';
import {
  Message,
  Conversation,
  ConversationType,
  MessageType,
  MessageStatus,
  // MessageDraft, // Removed - Does not exist in @/types/messaging
  FileAttachment,
  // PaginationOptions // Removed - Does not exist in @/types/messaging
} from '@/types/messaging';

// Define the context type
export interface MessagingContextType {
  // Conversations
  conversations: Conversation[];
  activeConversation: Conversation | null;
  loadingConversations: boolean;
  errorConversations: string | null;
  setActiveConversation: (conversation: Conversation | null) => void;
  getOrCreateRoomConversation: (roomId: string, roomName: string) => Promise<Conversation>;
  getOrCreateUserConversation: (userId: string) => Promise<Conversation>;
  archiveConversation: (conversationId: string) => Promise<void>;
  unarchiveConversation: (conversationId: string) => Promise<void>;
  
  // Messages
  messages: Message[];
  loadingMessages: boolean;
  errorMessages: string | null;
  hasMoreMessages: boolean;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (content: string, options?: {
    replyToId?: string;
    attachments?: FileAttachment[];
    type?: MessageType;
  }) => Promise<void>;
  
  // Message drafts (Removed - Type 'MessageDraft' not defined)
  // messageDrafts: Record<string, MessageDraft>;
  // updateMessageDraft: (conversationId: string, content: string) => void;
  
  // Typing indicators
  typingUsers: Record<string, string[]>; // conversationId -> userIds
  sendTypingIndicator: (conversationId: string) => void;
  
  // Attachments
  uploadAttachment: (file: File) => Promise<FileAttachment>;
  
  // Reactions
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  
  // Unread counts
  totalUnreadCount: number;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  
  // Utilities
  refreshConversations: () => Promise<void>;
  refreshMessages: () => Promise<void>;
}

// Socket.io events
export enum SocketEvents {
  JOIN_CONVERSATION = 'join_conversation',
  LEAVE_CONVERSATION = 'leave_conversation',
  NEW_MESSAGE = 'new_message',
  MESSAGE_STATUS_UPDATED = 'message_status_updated',
  TYPING_INDICATOR = 'typing_indicator',
  CONVERSATION_UPDATED = 'conversation_updated',
}

// Socket references to be used in the context
export interface SocketRefs {
  socket: Socket | null;
  typingTimeouts: Record<string, NodeJS.Timeout>;
}
