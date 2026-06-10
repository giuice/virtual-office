// src/contexts/messaging/MessagingContext.tsx
'use client';

import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Conversation,
  Message,
  MessageType,
  FileAttachment,
} from '@/types/messaging';
import { MessagingContextType, DrawerView } from './types';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';
import { useMessageSubscription } from '@/hooks/realtime/useMessageSubscription';
import { debugLogger, messagingFeatureFlags } from '@/utils/debug-logger';

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
    markConversationAsRead,
    totalUnreadCount,
    updateConversationWithMessage,
    clearLastActiveConversation,
  } = useConversations();
  const { currentUserProfile } = useCompany();
  const [isMessagingV2Enabled, setIsMessagingV2Enabled] = useState(() => messagingFeatureFlags.isV2Enabled());

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

  useEffect(() => {
    const handler = () => {
      setIsMessagingV2Enabled(messagingFeatureFlags.isV2Enabled());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handler);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handler);
      }
    };
  }, []);

  useEffect(() => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext', 'flag:messaging_v2', {
        enabled: isMessagingV2Enabled,
      });
    }
  }, [isMessagingV2Enabled]);

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

  // Audit B-01: mark the active conversation read while it is actually visible.
  // Unread is derived from the query cache (the activeConversation object is a
  // stale snapshot), and gated on drawer visibility because the localStorage
  // restore sets an active conversation without opening the drawer.
  const activeConversationId = activeConversation?.id ?? null;
  const currentUserId = currentUserProfile?.id ?? null;
  const activeUnreadCount = useMemo(() => {
    if (!activeConversationId || !currentUserId) return 0;
    const listed = conversations.find((c) => c.id === activeConversationId);
    return listed?.unreadCount?.[currentUserId] ?? 0;
  }, [activeConversationId, currentUserId, conversations]);

  useEffect(() => {
    if (!isDrawerOpen || isMinimized) return;
    if (!activeConversationId || activeUnreadCount <= 0) return;
    void markConversationAsRead(activeConversationId);
  }, [isDrawerOpen, isMinimized, activeConversationId, activeUnreadCount, markConversationAsRead]);

  // Ensure an incoming message opens its conversation. Auto-opening the drawer
  // for received DMs is an explicit product requirement.
  const ensureOpenForMessage = useCallback(async (message: { conversationId: string; senderId: string }) => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'start', {
        activeId: activeConversation?.id,
        ...message,
      });
    }

    const openConversation = (conversation: Conversation) => {
      updateConversationWithMessage(conversation.id, message, message.senderId);
      setActiveConversation(conversation);
      setIsDrawerOpen(true);
    };

    // 1) Skip if already viewing
    if (activeConversation?.id === message.conversationId) return;

    // 2) Try the query cache
    let existing = getCachedConversations().find((c) => c.id === message.conversationId);
    if (existing) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'hit:local', {
          conversationId: message.conversationId,
        });
      }
      openConversation(existing);
      return;
    }

    // 3) Hard refresh, then re-read the cache imperatively (audit B-07: the
    // render-closure list never reflected the refresh)
    await refreshConversations();
    existing = getCachedConversations().find((c) => c.id === message.conversationId);
    if (existing) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'hit:after-refresh', {
          conversationId: message.conversationId,
        });
      }
      openConversation(existing);
      return;
    }

    // 4) As a last resort, try resolving a DM with the sender (covers direct DMs)
    try {
      const dm = await getOrCreateUserConversation(message.senderId);
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'created:dm', {
          conversationId: dm.id,
        });
      }
      openConversation(dm);
      return;
    } catch { }

    // 5) Retry loop with backoff in case replication delay prevents immediate discovery
    const delays = [200, 500, 1000];
    const retryFindConversation = async (attempt: number): Promise<boolean> => {
      const delay = delays[attempt];
      if (delay === undefined) {
        return false;
      }

      await new Promise((r) => setTimeout(r, delay));
      await refreshConversations();
      const found = getCachedConversations().find((c) => c.id === message.conversationId);
      if (found) {
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'hit:retry', {
            conversationId: found.id,
            delay,
          });
        }
        openConversation(found);
        return true;
      }
      return retryFindConversation(attempt + 1);
    };

    if (await retryFindConversation(0)) return;

    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.warn('MessagingContext.ensureOpenForMessage', 'miss:unresolved', {
        conversationId: message.conversationId,
      });
    }
  }, [
    activeConversation?.id,
    getCachedConversations,
    refreshConversations,
    getOrCreateUserConversation,
    updateConversationWithMessage,
    setActiveConversation,
  ]);

  const conversationIds = useMemo(() => {
    const ids = conversations.flatMap((c) => c.id ? [c.id] : []);
    ids.sort();
    return ids;
  }, [conversations]);

  const shouldSubscribeToAll = conversationIds.length > 0;

  const handleConversationInsert = useCallback((message: Message) => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext', 'onInsert:conversation', {
        conversationId: message.conversationId,
        senderId: message.senderId,
      });
    }
    void ensureOpenForMessage({ conversationId: message.conversationId, senderId: message.senderId });
  }, [ensureOpenForMessage]);

  const { status: focusedConversationStatus } = useMessageSubscription(
    activeConversation?.id || null,
    {
      isActive: Boolean(activeConversation?.id) && !shouldSubscribeToAll,
    }
  );

  const { status: allConversationStatus } = useMessageSubscription(
    shouldSubscribeToAll ? conversationIds : null,
    {
      isActive: shouldSubscribeToAll,
      ignoreSenderId: currentUserProfile?.id,
      onInsert: handleConversationInsert,
    }
  );

  const realtimeStatus = allConversationStatus ?? focusedConversationStatus ?? null;

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
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
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
    markConversationAsRead,
    totalUnreadCount,
    refreshConversations,
    closeDrawer,
    // Messages
    messages,
    loadingMessages,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    refreshMessages,
    sendMessage,
    addReaction,
    removeReaction,
    uploadAttachment,
    // Realtime
    connectionStatus: realtimeStatus,
    isMessagingV2Enabled,
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
    markConversationAsRead,
    totalUnreadCount,
    refreshConversations,
    closeDrawer,
    messages,
    loadingMessages,
    errorMessages,
    hasMoreMessages,
    loadMoreMessages,
    refreshMessages,
    sendMessage,
    addReaction,
    removeReaction,
    uploadAttachment,
    realtimeStatus,
    isMessagingV2Enabled,
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
