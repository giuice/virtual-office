// src/contexts/messaging/MessagingContext.tsx
'use client';

import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Message,
  MessageType,
  FileAttachment,
} from '@/types/messaging';
import { MessagingContextType, DrawerView } from './types';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';
import { useMessageSubscription } from '@/hooks/realtime/useMessageSubscription';
import { useIncomingMessageNotifications } from '@/hooks/ui/use-message-notifications';
import { debugLogger } from '@/utils/debug-logger';

// LocalStorage keys for drawer state persistence
const DRAWER_STORAGE_KEYS = {
  IS_MINIMIZED: 'messaging_drawer_minimized',
  ACTIVE_VIEW: 'messaging_drawer_active_view',
  ACTIVE_CONVERSATION_ID: 'messaging_active_conversation_id',
} as const;

// Create the context with a default undefined value
const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

function useMessagingProviderValue(): MessagingContextType {
  // Conversation list lives in TanStack Query (key ['conversations', userId]);
  // useConversationRealtime invalidations keep it fresh — no polling (audit B-06).
  const {
    conversations,
    activeConversation,
    lastActiveConversation,
    setActiveConversation,
    loadingConversations,
    refreshingConversations,
    hasLoadedConversations,
    errorConversations,
    refreshConversations,
    getCachedConversations,
    getOrCreateRoomConversation,
    getOrCreateUserConversation,
    archiveConversation,
    unarchiveConversation,
    pinConversation,
    unpinConversation,
    markMessagesAsRead,
    totalUnreadCount,
    updateConversationWithMessage,
    clearLastActiveConversation,
  } = useConversations();
  const { company, currentUserProfile } = useCompany();

  // Drawer state with localStorage persistence
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(DRAWER_STORAGE_KEYS.IS_MINIMIZED);
    return stored === 'true';
  });

  const [activeView, setActiveView] = useState<DrawerView>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = localStorage.getItem(DRAWER_STORAGE_KEYS.ACTIVE_VIEW);
    return (stored as DrawerView) || 'list';
  });

  // Drawer explicit open state (decoupled from activeConversation)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Persist drawer state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DRAWER_STORAGE_KEYS.IS_MINIMIZED, String(isMinimized));
    }
  }, [isMinimized]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DRAWER_STORAGE_KEYS.ACTIVE_VIEW, activeView);
    }
  }, [activeView]);

  // Persist active conversation ID to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (activeConversation?.id) {
        localStorage.setItem(DRAWER_STORAGE_KEYS.ACTIVE_CONVERSATION_ID, activeConversation.id);
      } else {
        localStorage.removeItem(DRAWER_STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
      }
    }
  }, [activeConversation?.id]);

  // Drawer control functions
  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
    // Default to list view when no active conversation
    if (!activeConversation) {
      setActiveView('list');
    }
    // Optionally restore last active conversation
    if (!activeConversation && lastActiveConversation) {
      setActiveConversation(lastActiveConversation);
    }
  }, [activeConversation, lastActiveConversation, setActiveConversation]);

  const toggleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext.toggleMinimize', 'toggled', {
        isMinimized: !isMinimized,
      });
    }
  }, [isMinimized]);

  // Restore active conversation from localStorage on mount
  useEffect(() => {
    // Only restore if we have conversations loaded and no active conversation yet
    if (
      typeof window !== 'undefined' &&
      conversations.length > 0 &&
      !activeConversation
    ) {
      const storedConversationId = localStorage.getItem(DRAWER_STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
      if (storedConversationId) {
        const conversation = conversations.find(
          (c) => c.id === storedConversationId
        );
        if (conversation) {
          if (debugLogger.messaging.enabled()) {
            debugLogger.messaging.event('MessagingContext', 'restore-active-conversation', {
              conversationId: conversation.id,
            });
          }
          setActiveConversation(conversation);
        } else {
          // Conversation not found, clear from localStorage
          localStorage.removeItem(DRAWER_STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
        }
      }
    }
  }, [conversations, activeConversation, setActiveConversation]);

  // Get message management hooks
  const messagesManager = useMessages(activeConversation?.id || null);

  // The conversation whose feed the drawer shows (same choice as
  // MessagingDrawer), or null when the drawer is closed, minimized, or on the
  // list/search view.
  const displayedConversationId = (activeConversation ?? lastActiveConversation)?.id ?? null;
  const viewedConversationId = isDrawerOpen && !isMinimized && activeView === 'conversation'
    ? displayedConversationId
    : null;

  const openConversationFromNotification = useCallback((conversationId: string) => {
    const conversation = getCachedConversations().find((c) => c.id === conversationId);
    if (!conversation) return;
    setIsDrawerOpen(true);
    setIsMinimized(false);
    setActiveConversation(conversation);
    setActiveView('conversation');
  }, [getCachedConversations, setActiveConversation]);

  // Phase 4 FR-023: desktop notifications for live messages from others.
  const notifyIncomingMessage = useIncomingMessageNotifications({
    currentUserId: currentUserProfile?.id,
    conversationsLoaded: hasLoadedConversations,
    getCachedConversations,
    viewedConversationId,
    onOpenConversation: openConversationFromNotification,
  });

  // Read receipts come from the message feed, for the messages actually
  // visible on screen (useVisibleMessageReceipts). Opening a conversation does
  // not mark anything read by itself.

  // An incoming message from someone else updates its conversation in the
  // list (activity time, unread count, order). It never switches the active
  // conversation or opens the drawer: the recipient's unread state must stay
  // intact until they actually see the message.
  const trackIncomingMessage = useCallback(async (message: Message) => {
    const instrumentationEnabled = debugLogger.messaging.enabled();
    if (instrumentationEnabled) {
      debugLogger.messaging.event('MessagingContext.trackIncomingMessage', 'start', {
        activeId: activeConversation?.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
      });
    }

    const findListed = () =>
      getCachedConversations().find((c) => c.id === message.conversationId);

    const listed = findListed();
    if (listed) {
      updateConversationWithMessage(message.conversationId, message, message.senderId);
      void notifyIncomingMessage(message, listed);
      return;
    }

    // Unknown conversation (e.g. a DM someone just started): refetch the list,
    // which carries the server's activity time and unread count. Retry with
    // backoff in case replication delay hides it from the first refetch
    // (audit B-07: re-read the cache imperatively, not the render closure).
    const delays = [0, 200, 500, 1000];
    for (const delay of delays) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      await refreshConversations();
      const refreshed = findListed();
      if (refreshed) {
        void notifyIncomingMessage(message, refreshed);
        if (instrumentationEnabled) {
          debugLogger.messaging.event('MessagingContext.trackIncomingMessage', 'hit:after-refresh', {
            conversationId: message.conversationId,
            delay,
          });
        }
        return;
      }
    }

    if (instrumentationEnabled) {
      debugLogger.messaging.warn('MessagingContext.trackIncomingMessage', 'miss:unresolved', {
        conversationId: message.conversationId,
      });
    }
  }, [
    activeConversation?.id,
    getCachedConversations,
    notifyIncomingMessage,
    refreshConversations,
    updateConversationWithMessage,
  ]);

  const handleConversationInsert = useCallback((message: Message) => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext', 'onInsert:conversation', {
        conversationId: message.conversationId,
        senderId: message.senderId,
      });
    }
    void trackIncomingMessage(message);
  }, [trackIncomingMessage]);

  // One channel for every messaging event (audit M-06): RLS scopes rows
  // server-side, so no conversation id list is needed and this status is the
  // real status of the channel delivering messages, receipts and reactions.
  const { status: realtimeStatus } = useMessageSubscription({
    isActive: Boolean(company?.id && currentUserProfile?.id),
    companyId: company?.id,
    currentUserId: currentUserProfile?.id,
    ignoreSenderId: currentUserProfile?.id,
    onInsert: handleConversationInsert,
  });

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    if (!root) {
      return;
    }

    if (!realtimeStatus) {
      root.removeAttribute('data-messaging-realtime-status');
      root.removeAttribute('data-messaging-realtime-ready');
      return;
    }

    root.setAttribute('data-messaging-realtime-status', realtimeStatus);

    if (realtimeStatus === 'SUBSCRIBED') {
      root.setAttribute('data-messaging-realtime-ready', 'true');
    } else {
      root.removeAttribute('data-messaging-realtime-ready');
    }
  }, [realtimeStatus]);

  const {
    messages,
    loadingMessages,
    loadingMoreMessages,
    loadMoreMessagesFailed,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    loadHistoryUntilMessage,
    refreshMessages,
    sendMessage: sendMessageToActiveConversation,
    addReaction,
    removeReaction,
    uploadAttachment,
  } = messagesManager;

  // Wrapper function for sendMessage that guards on an active conversation
  const sendMessage = useCallback(async (content: string, options?: {
    replyToId?: string;
    attachments?: FileAttachment[];
    type?: MessageType;
    clientMessageId?: string;
  }) => {
    if (!activeConversation) return;

    return await sendMessageToActiveConversation(content, options);
  }, [activeConversation, sendMessageToActiveConversation]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setActiveConversation(null);
    clearLastActiveConversation();
    setIsMinimized(false);
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext.closeDrawer', 'closed', {});
    }
  }, [setActiveConversation, clearLastActiveConversation]);

  // Memoized context value (audit M-05): consumers only re-render when one of
  // the listed pieces actually changes.
  const value: MessagingContextType = useMemo(() => ({
    // Drawer state
    isDrawerOpen,
    isMinimized,
    activeView,
    openDrawer,
    toggleMinimize,
    setActiveView,
    // Conversations
    conversations,
    activeConversation,
    lastActiveConversation,
    loadingConversations,
    refreshingConversations,
    hasLoadedConversations,
    errorConversations,
    setActiveConversation,
    getOrCreateRoomConversation,
    getOrCreateUserConversation,
    archiveConversation,
    unarchiveConversation,
    pinConversation,
    unpinConversation,
    markMessagesAsRead,
    totalUnreadCount,
    refreshConversations,
    closeDrawer,
    // Messages
    messages,
    loadingMessages,
    loadingMoreMessages,
    loadMoreMessagesFailed,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    loadHistoryUntilMessage,
    refreshMessages,
    sendMessage,
    addReaction,
    removeReaction,
    uploadAttachment,
    // Realtime
    connectionStatus: realtimeStatus,
  }), [
    isDrawerOpen,
    isMinimized,
    activeView,
    openDrawer,
    toggleMinimize,
    conversations,
    activeConversation,
    lastActiveConversation,
    loadingConversations,
    refreshingConversations,
    hasLoadedConversations,
    errorConversations,
    setActiveConversation,
    getOrCreateRoomConversation,
    getOrCreateUserConversation,
    archiveConversation,
    unarchiveConversation,
    pinConversation,
    unpinConversation,
    markMessagesAsRead,
    totalUnreadCount,
    refreshConversations,
    closeDrawer,
    messages,
    loadingMessages,
    loadingMoreMessages,
    loadMoreMessagesFailed,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    loadHistoryUntilMessage,
    refreshMessages,
    sendMessage,
    addReaction,
    removeReaction,
    uploadAttachment,
    realtimeStatus,
  ]);

  return value;
}

// Provider component
export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const value = useMessagingProviderValue();

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}

// Custom hook to use the messaging context
export function useMessaging() { const context = use(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider'); }
  return context;
}
