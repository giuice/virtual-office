// src/contexts/messaging/types.ts
import {
  Message,
  Conversation,
  MessageType,
  FileAttachment,
  MessageHistorySearchResult,
} from '@/types/messaging';
import type { OutboxEnqueueInput } from '@/types/message-outbox';
import type { OutboxSignOut } from '@/lib/messaging/outbox/outbox-sign-out';
import type { MessagingRealtimeHealth } from '@/lib/messaging/realtime-health';

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
    /** Phase 5 T17: requested mentions (users.id); identical on every retry of the key. */
    mentionIds?: string[];
  }) => Promise<Message | undefined>;
  /**
   * Phase 5 T8 (FR-001, BR-002): queues a text or reply message (no files or
   * voice) in the durable outbox; resolves once it is stored and shown as
   * pending, rejects (OutboxStorageError, FR-033) when it cannot be stored —
   * then nothing is sent.
   */
  queueTextMessage: (input: OutboxEnqueueInput) => Promise<void>;
  /**
   * Phase 5 T27: "Tentar de novo" on a failed or expired outbox item — it is
   * fenced first when an earlier attempt may be stored.
   */
  retryOutboxMessage: (clientMessageId: string) => Promise<void>;
  /** Phase 5 T27: "Apagar" — removes a failed or expired outbox item from this browser only. */
  discardOutboxMessage: (clientMessageId: string) => Promise<void>;
  /**
   * Phase 5 T10: "Cancelar" — removes a never-dispatched waiting outbox item
   * in every tab; a no-op when a tab claimed it first.
   */
  cancelOutboxMessage: (clientMessageId: string) => Promise<void>;
  /**
   * Phase 5 T12 (FR-013): the signed-in user's unsent outbox items in this
   * browser, all conversations and tabs (the "Sair" confirmation).
   */
  countUnsentOutboxMessages: () => Promise<number>;
  /**
   * Phase 5 T12 "Sair mesmo": stops the user's drains in every tab now;
   * `discard()` then deletes the user's outbox, `release()` ends the stop
   * after the sign-out. Null when no user owns an outbox.
   */
  beginOutboxSignOut: () => OutboxSignOut | null;
  addReaction: (messageId: string, emoji: string) => Promise<void>;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  uploadAttachment: (file: File) => Promise<FileAttachment>;

  // Realtime connection
  connectionStatus?: string | null;
  /**
   * T13 (FR-014, FR-015): per-stream health of this tab's messaging Realtime
   * streams (messages, list; typing from T15) — the drawer banner, polling
   * (T14) and metrics (T19) read it.
   */
  realtimeHealth: MessagingRealtimeHealth;
}
