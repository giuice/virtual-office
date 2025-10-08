// src/contexts/messaging/MessagingContext.tsx
'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { 
  MessageType, 
  FileAttachment,
} from '@/types/messaging';
import { MessagingContextType } from './types';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';
import { useMessageSubscription } from '@/hooks/realtime/useMessageSubscription';
import { debugLogger, messagingFeatureFlags } from '@/utils/debug-logger';

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

  // Fail-safe: polling fallback to detect new conversations/unreads when realtime is unavailable.
  useEffect(() => {
    if (!currentUserProfile?.id) return;
    const defaultMs = 5000;
    const fromEnv = Number(process.env.NEXT_PUBLIC_MESSAGING_POLL_MS || '0');
    const pollMs = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : defaultMs;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        await refreshConversations();
        const uid = currentUserProfile.id;
        const candidate = conversationsManager.conversations
          .filter((c) => (c.unreadCount?.[uid] || 0) > 0)
          .sort((a, b) => getLastActivityMs(b) - getLastActivityMs(a))[0];

        if (candidate && (!activeConversation || activeConversation.id !== candidate.id)) {
          debugLogger.messaging.event('MessagingContext.poll', 'promote:unread', {
            conv: candidate.id,
            lastActivity: candidate.lastActivity instanceof Date ? candidate.lastActivity.toISOString() : undefined,
            unread: candidate.unreadCount?.[uid],
          });
          setActiveConversation(candidate);
        }
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
  }, [activeConversation, conversationsManager.conversations, currentUserProfile?.id, getLastActivityMs, refreshConversations, setActiveConversation]);

  // Get message management hooks
  const messagesManager = useMessages(activeConversation?.id || null);
  // Subscribe to realtime for the active conversation and expose status
  const { status: directConversationStatus } = useMessageSubscription(
    activeConversation?.id || null,
    {
      isActive: Boolean(activeConversation?.id) && !isMessagingV2Enabled,
    }
  );

  
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

  const conversationIds = useMemo(
    () => conversationsManager.conversations.map((c) => c.id).filter(Boolean),
    [conversationsManager.conversations]
  );

  const { status: multiConversationStatus } = useMessageSubscription(
    isMessagingV2Enabled ? conversationIds : null,
    {
      isActive: isMessagingV2Enabled && conversationIds.length > 0,
      ignoreSenderId: currentUserProfile?.id,
      onInsert: (message) => {
        if (debugLogger.messaging.enabled()) {
          debugLogger.messaging.event('MessagingContext', 'onInsert:conversation', {
            conversationId: message.conversationId,
            senderId: message.senderId,
          });
        }
        void ensureOpenForMessage({ conversationId: message.conversationId, senderId: message.senderId });
      },
    }
  );
  
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
    setActiveConversation(null);
    clearLastActiveConversation();
  }, [setActiveConversation, clearLastActiveConversation]);
  
  // Create context value by combining all the hooks
  const value: MessagingContextType = {
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
    connectionStatus: multiConversationStatus ?? directConversationStatus,
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
