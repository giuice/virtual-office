// src/contexts/messaging/MessagingContext.tsx
'use client';

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useMessagingMetrics } from '@/hooks/realtime/useMessagingMetrics';
import { useMessagingPollingFallback } from '@/hooks/realtime/useMessagingPollingFallback';
import { useIncomingMessageNotifications } from '@/hooks/ui/use-message-notifications';
import { useMessageOutbox } from '@/hooks/useMessageOutbox';
import { isSocketOutage, MessagingRealtimeHealth } from '@/lib/messaging/realtime-health';
import {
  isRestoringPageLoad,
  readSavedDrawer,
  removeLegacyDrawerKeys,
  saveDrawer,
} from '@/lib/messaging/drawer-restore';
import { debugLogger } from '@/utils/debug-logger';

// Create the context with a default undefined value
const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

function useMessagingProviderValue(): MessagingContextType {
  // T13 (FR-014, FR-015): health of this tab's messaging Realtime streams
  // (the list stream reports from useConversations, the messages stream from
  // useMessageSubscription); read by the drawer banner and later consumers.
  const [realtimeHealth] = useState(() => new MessagingRealtimeHealth());
  // Conversation list lives in TanStack Query (key ['conversations', userId]);
  // useConversationRealtime invalidations keep it fresh; it is polled only
  // while Realtime is unhealthy (T14, useMessagingPollingFallback).
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
  } = useConversations(realtimeHealth);
  const { company, currentUserProfile } = useCompany();

  const ownerId = currentUserProfile?.id;

  // Drawer state; restored after a reload per users.id (T20, below).
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<DrawerView>('list');

  // Drawer explicit open state (decoupled from activeConversation)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

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

  // Get message management hooks
  const messagesManager = useMessages(activeConversation?.id || null);
  // Phase 5 T8: the signed-in user's durable outbox (text/reply sends).
  // T11: owned by users.id; its auth identity is the same row's supabase_uid.
  const {
    queueTextMessage,
    retryOutboxMessage,
    discardOutboxMessage,
    cancelOutboxMessage,
    countUnsentOutboxMessages,
    beginOutboxSignOut,
    resumeOutboxDrains,
    noteOutboxConnectivityLost,
  } = useMessageOutbox(
    currentUserProfile?.id,
    currentUserProfile?.supabase_uid
  );

  // Block B fix F3 (FR-002, FR-004): the messages stream failing with this
  // tab's socket down is a connectivity loss; its recovery then advances the
  // outbox's shared recovery epoch (handleMessagesRecovered → resumeDrains).
  useEffect(
    () =>
      realtimeHealth.subscribe(() => {
        if (isSocketOutage(realtimeHealth.get('messages'))) noteOutboxConnectivityLost();
      }),
    [realtimeHealth, noteOutboxConnectivityLost]
  );

  // The conversation whose feed the drawer shows (same choice as
  // MessagingDrawer), or null when the drawer is closed, minimized, or on the
  // list/search view.
  const displayedConversationId = (activeConversation ?? lastActiveConversation)?.id ?? null;
  const viewedConversationId = isDrawerOpen && !isMinimized && activeView === 'conversation'
    ? displayedConversationId
    : null;

  // T20 (FR-031, BR-016): drawer restore (src/lib/messaging/drawer-restore.ts).
  // One decision per page load, for the first user signed in on it: after a
  // reload, that user's drawer reopens if it was open there — on the same
  // conversation while it is still in their list, otherwise on the list; on
  // any other load it starts closed. From then on this tab's drawer is saved
  // for that user. The record is read once, so another tab never moves this
  // tab's drawer (T16 tab jump). When the tab switches to another user in
  // place, the previous user's conversation leaves the drawer.
  const conversationsSettled = hasLoadedConversations || errorConversations !== null;
  // The user whose drawer this tab saves (null until the load's decision).
  const drawerOwnerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ownerId || drawerOwnerRef.current === ownerId) return;
    if (drawerOwnerRef.current !== null) {
      drawerOwnerRef.current = ownerId;
      setActiveConversation(null);
      clearLastActiveConversation();
      setActiveView('list');
      return;
    }
    const restoring = isRestoringPageLoad();
    if (restoring && !conversationsSettled) return;
    drawerOwnerRef.current = ownerId;
    removeLegacyDrawerKeys();
    // A fresh load, or the user opened the drawer before the list arrived.
    if (!restoring || isDrawerOpen || activeConversation) return;
    const saved = readSavedDrawer(ownerId);
    if (!saved) return;
    const conversation = saved.conversationId
      ? conversations.find((c) => c.id === saved.conversationId)
      : undefined;
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext', 'restore-drawer', {
        view: conversation ? 'conversation' : 'list',
        conversationLost: Boolean(saved.conversationId && !conversation),
      });
    }
    setIsDrawerOpen(true);
    setIsMinimized(saved.minimized);
    if (conversation) {
      setActiveConversation(conversation);
      setActiveView('conversation');
    } else {
      setActiveView('list');
    }
  }, [
    ownerId,
    conversationsSettled,
    conversations,
    isDrawerOpen,
    activeConversation,
    setActiveConversation,
    clearLastActiveConversation,
  ]);

  // Saved after the decision above (same commit included): an open drawer is
  // recorded, a closed one removes the record.
  const savedConversationId = activeView === 'conversation' ? displayedConversationId : null;
  useEffect(() => {
    if (!ownerId || drawerOwnerRef.current !== ownerId) return;
    saveDrawer(
      ownerId,
      isDrawerOpen
        ? {
            minimized: isMinimized,
            view: savedConversationId ? 'conversation' : 'list',
            conversationId: savedConversationId,
          }
        : null
    );
  }, [ownerId, conversationsSettled, isDrawerOpen, isMinimized, savedConversationId]);

  const openConversationFromNotification = useCallback((conversationId: string) => {
    const conversation = getCachedConversations().find((c) => c.id === conversationId);
    if (!conversation) return;
    setIsDrawerOpen(true);
    setIsMinimized(false);
    setActiveConversation(conversation);
    setActiveView('conversation');
  }, [getCachedConversations, setActiveConversation]);

  // Phase 4 FR-023: desktop notifications for live messages from others;
  // Phase 5 T18 (FR-025): mentions, authorized under this users row's auth identity.
  const notifyIncomingMessage = useIncomingMessageNotifications({
    currentUserId: currentUserProfile?.id,
    currentUserAuthUid: currentUserProfile?.supabase_uid,
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

  // T13 (FR-002, FR-015): the messages stream is back after a failure. The
  // feeds catch up on the server's stream confirmation (useMessageSubscription);
  // the list's unread counts and order are refetched, and the outbox drains
  // again through its usual path (owner check, sign-out stop).
  const handleMessagesRecovered = useCallback(() => {
    void refreshConversations();
    resumeOutboxDrains();
  }, [refreshConversations, resumeOutboxDrains]);

  // One channel for every messaging event (audit M-06): RLS scopes rows
  // server-side, so no conversation id list is needed and this status is the
  // real status of the channel delivering messages, receipts and reactions.
  const { status: realtimeStatus } = useMessageSubscription({
    isActive: Boolean(company?.id && currentUserProfile?.id),
    companyId: company?.id,
    currentUserId: currentUserProfile?.id,
    ignoreSenderId: currentUserProfile?.id,
    onInsert: handleConversationInsert,
    health: realtimeHealth,
    onRecovered: handleMessagesRecovered,
  });

  // T14 (FR-016): while a required stream has been unhealthy > 30 s and the
  // tab is visible, the open feed, open reader lists and the list are polled.
  useMessagingPollingFallback({
    health: realtimeHealth,
    userId: currentUserProfile?.id,
    conversationId: activeConversation?.id ?? null,
  });

  // T19 (FR-027, FR-028): this tab's messaging metrics, delivered fire and
  // forget for the signed-in user; stream drops/recoveries from the health store.
  useMessagingMetrics({ health: realtimeHealth, userId: currentUserProfile?.id });

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
    mentionIds?: string[];
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
    queueTextMessage,
    retryOutboxMessage,
    discardOutboxMessage,
    cancelOutboxMessage,
    countUnsentOutboxMessages,
    beginOutboxSignOut,
    addReaction,
    removeReaction,
    uploadAttachment,
    // Realtime
    connectionStatus: realtimeStatus,
    realtimeHealth,
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
    queueTextMessage,
    retryOutboxMessage,
    discardOutboxMessage,
    cancelOutboxMessage,
    countUnsentOutboxMessages,
    beginOutboxSignOut,
    addReaction,
    removeReaction,
    uploadAttachment,
    realtimeStatus,
    realtimeHealth,
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
