// src/contexts/messaging/types.ts
import {
  Message,
  Conversation,
  ConversationType,
  MessageType,
  MessageStatus,
  FileAttachment,
} from '@/types/messaging';

// Drawer view types
export type DrawerView = 'list' | 'conversation' | 'search';

// Define the context type
export interface MessagingContextType {
  // Drawer state
  isDrawerOpen: boolean;
  isMinimized: boolean;
  activeView: DrawerView;
  openDrawer: () => void;
  toggleMinimize: () => void;
  setActiveView: (view: DrawerView) => void;

  // Conversations
  conversations: Conversation[];
  activeConversation: Conversation | null;
  lastActiveConversation?: Conversation | null;
  loadingConversations: boolean;
  errorConversations: string | null;
  setActiveConversation: (conversation: Conversation | null) => void;
  getOrCreateRoomConversation: (roomId: string, roomName: string) => Promise<Conversation>;
  getOrCreateUserConversation: (userId: string) => Promise<Conversation>;
  archiveConversation: (conversationId: string) => Promise<void>;
  unarchiveConversation: (conversationId: string) => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  totalUnreadCount: number;
  refreshConversations: () => Promise<void>;
  closeDrawer: () => void;

  // Messages
  messages: Message[];
  loadingMessages: boolean;
  errorMessages: string | null;
  hasMoreMessages: boolean;
  loadMoreMessages: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  sendMessage: (content: string, options?: {
    replyToId?: string;
    attachments?: FileAttachment[];
    type?: MessageType;
  }) => Promise<Message | undefined>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  uploadAttachment: (file: File) => Promise<FileAttachment>;

  // Realtime connection
  connectionStatus?: string | null;

  // Feature flags
  isMessagingV2Enabled: boolean;
}
