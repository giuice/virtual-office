// src/contexts/messaging/MessagingContext.tsx
'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
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
import { debugLogger, messagingFeatureFlags } from '@/utils/debug-logger';

// LocalStorage keys for drawer state persistence
const DRAWER_STORAGE_KEYS = {
  IS_MINIMIZED: 'messaging_drawer_minimized',
  ACTIVE_VIEW: 'messaging_drawer_active_view',
} as const;

// Create the context with a default undefined value
const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

// Provider component
export function MessagingProvider({ children }: { children: React.ReactNode }) {
  // Get conversation management hooks
  const conversationsManager = useConversations();
  const { currentUserProfile } = useCompany();
  const [isMessagingV2Enabled, setIsMessagingV2Enabled] = useState(() => messagingFeatureFlags.isV2Enabled());
  const {
    activeConversation,
    setActiveConversation,
    lastActiveConversation,
    refreshConversations,
    clearLastActiveConversation,
  } = conversationsManager;

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
    if(currentUserProfile?.id){
      debugLogger.messaging.event('MessagingContext', 'refreshConversations:on-mount', { userId: currentUserProfile.id });
      void refreshConversations();
    }
  }, [currentUserProfile?.id, refreshConversations]);

  useEffect(() => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext', 'flag:messaging_v2', {
        enabled: isMessagingV2Enabled,
      });
    }
  }, [isMessagingV2Enabled]);

  const getLastActivityMs = useCallback((conversation: (typeof conversationsManager.conversations)[number]) => {
    const value = conversation?.lastActivity;
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }, []);

  // Polling to refresh conversations list (but NOT auto-open them)
  // Conversations should only open when:
  // 1. User enters a specific space (floor-plan context)
  // 2. User clicks on a conversation in the list
  // 3. User creates a new conversation from search
  useEffect(() => {
    if (!currentUserProfile?.id) return;
    const defaultMs = 5000;
    const fromEnv = Number(process.env.NEXT_PUBLIC_MESSAGING_POLL_MS || '0');
    const pollMs = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : defaultMs;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        // Refresh conversations to get latest unread counts, but DON'T auto-open
        await refreshConversations();

        if (debugLogger.messaging.enabled()) {
          const uid = currentUserProfile.id;
          const unreadConvs = conversationsManager.conversations
            .filter((c) => (c.unreadCount?.[uid] || 0) > 0);

          if (unreadConvs.length > 0) {
            debugLogger.messaging.event('MessagingContext.poll', 'unread-detected', {
              count: unreadConvs.length,
              conversations: unreadConvs.map(c => ({ id: c.id, unread: c.unreadCount?.[uid] })),
            });
          }
        }

        // NOTE: Removed auto-opening logic - conversations should only open via:
        // - Space navigation (floor-plan)
        // - User clicking in conversation list
        // - User starting new conversation from search
      } catch (e) {
        debugLogger.messaging.warn('MessagingContext.poll', 'error', e);
      } finally {
        if (!stopped) setTimeout(tick, pollMs);
      }
    };

    setTimeout(tick, pollMs);
    return () => {
      stopped = true;
    };
  }, [currentUserProfile?.id, conversationsManager.conversations, refreshConversations]);

  // Get message management hooks
  const messagesManager = useMessages(activeConversation?.id || null);

  
  // Robust: ensure opening a conversation for a received message with retries
  const ensureOpenForMessage = useCallback(async (message: { conversationId: string; senderId: string }) => {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'start', {
        activeId: activeConversation?.id,
        ...message,
      });
    }

    // 1) Skip if already viewing
    if (activeConversation?.id === message.conversationId) return;

    // 2) Try local cache
    let existing = conversationsManager.conversations.find((c) => c.id === message.conversationId);
    if (existing) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'hit:local', {
          conversationId: message.conversationId,
        });
      }
      conversationsManager.updateConversationWithMessage(message.conversationId, message as any, message.senderId);
      setActiveConversation(existing);
      return;
    }

    // 3) Hard refresh conversations
    await refreshConversations();
    existing = conversationsManager.conversations.find((c) => c.id === message.conversationId);
    if (existing) {
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'hit:after-refresh', {
          conversationId: message.conversationId,
        });
      }
      conversationsManager.updateConversationWithMessage(message.conversationId, message as any, message.senderId);
      setActiveConversation(existing);
      return;
    }

    // 4) As a last resort, try resolving a DM with the sender (covers direct DMs)
    try {
      const dm = await conversationsManager.getOrCreateUserConversation(message.senderId);
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'created:dm', {
          conversationId: dm.id,
        });
      }
      conversationsManager.updateConversationWithMessage(dm.id, message as any, message.senderId);
      setActiveConversation(dm);
      return;
    } catch {}

    // 5) Retry loop with backoff in case replication delay prevents immediate discovery
    const delays = [200, 500, 1000];
    for (const delay of delays) {
      await new Promise((r) => setTimeout(r, delay));
      await refreshConversations();
      const found = conversationsManager.conversations.find((c) => c.id === message.conversationId);
      if (found) {
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.event('MessagingContext.ensureOpenForMessage', 'hit:retry', {
            conversationId: found.id,
            delay,
          });
        }
        conversationsManager.updateConversationWithMessage(found.id, message as any, message.senderId);
        setActiveConversation(found);
        return;
      }
    }

    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.warn('MessagingContext.ensureOpenForMessage', 'miss:unresolved', {
        conversationId: message.conversationId,
      });
    }
  }, [activeConversation?.id, conversationsManager, currentUserProfile?.id, refreshConversations, setActiveConversation]);

  const conversationIds = useMemo(() => {
    const ids = conversationsManager.conversations.map((c) => c.id).filter(Boolean) as string[];
    ids.sort();
    return ids;
  }, [conversationsManager.conversations]);

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
  
  // Wrapper function for sendMessage that also clears the draft
  const sendMessage = useCallback(async (content: string, options?: {
    replyToId?: string;
    attachments?: FileAttachment[];
    type?: MessageType;
  }) => {
    if (!activeConversation) return;
    
    // Send the message
    return await messagesManager.sendMessage(content, options);
  }, [activeConversation, messagesManager.sendMessage]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setActiveConversation(null);
    clearLastActiveConversation();
    setIsMinimized(false);
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event('MessagingContext.closeDrawer', 'closed', {});
    }
  }, [setActiveConversation, clearLastActiveConversation]);

  // Create context value by combining all the hooks
  const value: MessagingContextType = {
    // Drawer state
    isDrawerOpen,
    isMinimized,
    activeView,
    openDrawer,
    toggleMinimize,
    setActiveView,
    // Conversations (from conversationsManager)
    conversations: conversationsManager.conversations,
    activeConversation: conversationsManager.activeConversation,
    lastActiveConversation: conversationsManager.lastActiveConversation,
    loadingConversations: conversationsManager.loadingConversations,
    errorConversations: conversationsManager.errorConversations,
    setActiveConversation: conversationsManager.setActiveConversation,
    getOrCreateRoomConversation: conversationsManager.getOrCreateRoomConversation,
    getOrCreateUserConversation: conversationsManager.getOrCreateUserConversation,
    archiveConversation: conversationsManager.archiveConversation,
    unarchiveConversation: conversationsManager.unarchiveConversation,
    pinConversation: conversationsManager.pinConversation,
    unpinConversation: conversationsManager.unpinConversation,
    markConversationAsRead: conversationsManager.markConversationAsRead,
    totalUnreadCount: conversationsManager.totalUnreadCount,
    refreshConversations: conversationsManager.refreshConversations,
    closeDrawer,
    // Messages (from messagesManager)
    messages: messagesManager.messages,
    loadingMessages: messagesManager.loadingMessages,
    errorMessages: messagesManager.errorMessages,
    hasMoreMessages: messagesManager.hasMoreMessages,
    loadMoreMessages: messagesManager.loadMoreMessages,
    refreshMessages: messagesManager.refreshMessages,
    sendMessage,
    addReaction: messagesManager.addReaction,
    removeReaction: messagesManager.removeReaction,
    uploadAttachment: messagesManager.uploadAttachment,
    // Realtime
    connectionStatus: realtimeStatus,
    isMessagingV2Enabled,
  };
  
  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

// Custom hook to use the messaging context
export function useMessaging() {
  const context = useContext(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
}
