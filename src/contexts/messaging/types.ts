// src/contexts/messaging/types.ts
import {
  Message,
  Conversation,
  MessageType,
  FileAttachment,
  MessageHistorySearchResult,
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
  refreshingConversations: boolean;
  hasLoadedConversations: boolean;
  errorConversations: string | null;
  setActiveConversation: (conversation: Conversation | null) => void;
  getOrCreateRoomConversation: (roomId: string, roomName: string) => Promise<Conversation>;
  getOrCreateUserConversation: (userId: string) => Promise<Conversation>;
  archiveConversation: (conversationId: string) => Promise<void>;
  unarchiveConversation: (conversationId: string) => Promise<void>;
  pinConversation?: (conversationId: string) => Promise<void>;
  unpinConversation?: (conversationId: string) => Promise<void>;
  /**
   * Records read receipts for messages the viewer actually saw (1-100 ids per
   * call). Rejects on failure so the caller can retry.
   */
  markMessagesAsRead: (conversationId: string, messageIds: readonly string[]) => Promise<void>;
  totalUnreadCount: number;
  refreshConversations: () => Promise<void>;
  closeDrawer: () => void;

  // Messages
  messages: Message[];
  /** True only while the active conversation has no loaded messages yet. */
  loadingMessages: boolean;
  /** True while an older page of history is being fetched. */
  loadingMoreMessages: boolean;
  /** True after the last older-page fetch failed (the loaded feed is kept). */
  loadMoreMessagesFailed: boolean;
  errorMessages: string | null;
  hasMoreMessages: boolean;
  loadMoreMessages: () => Promise<void>;
  /**
   * Loads older history of the active conversation until the message is in
   * the feed; bounded, abortable, and never throws (FR-022).
   */
  loadHistoryUntilMessage: (messageId: string, signal: AbortSignal) => Promise<MessageHistorySearchResult>;
  refreshMessages: () => Promise<void>;
  sendMessage: (content: string, options?: {
    replyToId?: string;
    attachments?: FileAttachment[];
    type?: MessageType;
    /** Composition key; reuse it on a retry so the server never stores a duplicate (FR-024). */
    clientMessageId?: string;
  }) => Promise<Message | undefined>;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  uploadAttachment: (file: File) => Promise<FileAttachment>;

  // Realtime connection
  connectionStatus?: string | null;
}
