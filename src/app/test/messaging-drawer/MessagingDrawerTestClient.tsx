'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthContextType } from '@/types/auth';
import type { CompanyContextType } from '@/contexts/CompanyContext';
import { AuthContext } from '@/contexts/AuthContext';
import { CompanyContext } from '@/contexts/CompanyContext';
import { MessagingContext, useMessaging as useMessagingContext } from '@/contexts/messaging/MessagingContext';
import type { MessagingContextType, DrawerView } from '@/contexts/messaging/types';
import { MessagingDrawer } from '@/components/messaging/MessagingDrawer';
import {
  Conversation,
  ConversationType,
  Message,
  MessageStatus,
  MessageType,
} from '@/types/messaging';
import type { FileAttachment } from '@/types/messaging';
import type { Company, Space, User } from '@/types/database';
import { Button } from '@/components/ui/button';

const VIEWER_ID = 'user-1';
const TIMESTAMP = new Date('2025-10-20T10:00:00.000Z');

const baseUsers: User[] = [
  {
    id: VIEWER_ID,
    companyId: 'company-1',
    supabase_uid: 'auth-user-1',
    email: 'alex.rivera@example.com',
    displayName: 'Alex Rivera',
    avatarUrl: undefined,
    status: 'online',
    statusMessage: 'Focusing',
    preferences: {},
    role: 'admin',
    lastActive: TIMESTAMP.toISOString(),
    createdAt: TIMESTAMP.toISOString(),
    currentSpaceId: null,
  },
  {
    id: 'user-2',
    companyId: 'company-1',
    supabase_uid: 'auth-user-2',
    email: 'taylor.silva@example.com',
    displayName: 'Taylor Silva',
    avatarUrl: undefined,
    status: 'away',
    statusMessage: 'Heads down',
    preferences: {},
    role: 'member',
    lastActive: TIMESTAMP.toISOString(),
    createdAt: TIMESTAMP.toISOString(),
    currentSpaceId: 'space-team-sync',
  },
  {
    id: 'user-3',
    companyId: 'company-1',
    supabase_uid: 'auth-user-3',
    email: 'jamie.lee@example.com',
    displayName: 'Jamie Lee',
    avatarUrl: undefined,
    status: 'online',
    statusMessage: 'Ready to pair',
    preferences: {},
    role: 'member',
    lastActive: TIMESTAMP.toISOString(),
    createdAt: TIMESTAMP.toISOString(),
    currentSpaceId: 'space-product-hub',
  },
];

const baseSpaces: Space[] = [
  {
    id: 'space-team-sync',
    companyId: 'company-1',
    name: 'Team Sync Room',
    type: 'conference',
    status: 'active',
    capacity: 8,
    features: ['whiteboard', 'screen-share'],
    position: { x: 0, y: 0, width: 200, height: 120 },
    description: 'Daily stand-up hub',
    accessControl: { isPublic: true },
    createdBy: VIEWER_ID,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    isTemplate: false,
  },
  {
    id: 'space-product-hub',
    companyId: 'company-1',
    name: 'Product Planning Room',
    type: 'workspace',
    status: 'available',
    capacity: 12,
    features: ['projector'],
    position: { x: 240, y: 0, width: 220, height: 140 },
    description: 'Roadmap workshops and backlog grooming',
    accessControl: { isPublic: true },
    createdBy: 'user-2',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    isTemplate: false,
  },
];

const baseCompany: Company = {
  id: 'company-1',
  name: 'Virtual Office Testers',
  adminIds: ['auth-user-1'],
  createdAt: TIMESTAMP.toISOString(),
  settings: {
    allowGuestAccess: true,
    maxRooms: 12,
  },
};

function buildConversationFixtures(): Conversation[] {
  return [
    {
      id: 'conv-pinned-direct',
      type: ConversationType.DIRECT,
      participants: [VIEWER_ID, 'user-2'],
      lastActivity: new Date('2025-10-20T14:00:00.000Z'),
      name: 'Pinned Direct Channel',
      isArchived: false,
      unreadCount: { [VIEWER_ID]: 3 },
      roomId: undefined,
      visibility: undefined,
      preferences: {
        id: 'pref-pinned-direct',
        conversationId: 'conv-pinned-direct',
        userId: VIEWER_ID,
        isPinned: true,
        pinnedOrder: 1,
        isStarred: true,
        isArchived: false,
        notificationsEnabled: true,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    },
    {
      id: 'conv-room-team-sync',
      type: ConversationType.ROOM,
      participants: [VIEWER_ID, 'user-2', 'user-3'],
      lastActivity: new Date('2025-10-20T13:15:00.000Z'),
      name: 'Team Sync Room',
      isArchived: false,
      unreadCount: { [VIEWER_ID]: 0 },
      roomId: 'space-team-sync',
      visibility: undefined,
      preferences: {
        id: 'pref-team-sync',
        conversationId: 'conv-room-team-sync',
        userId: VIEWER_ID,
        isPinned: false,
        pinnedOrder: null,
        isStarred: false,
        isArchived: false,
        notificationsEnabled: true,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    },
    {
      id: 'conv-direct-jamie',
      type: ConversationType.DIRECT,
      participants: [VIEWER_ID, 'user-3'],
      lastActivity: new Date('2025-10-19T22:45:00.000Z'),
      name: 'Jamie Lee',
      isArchived: false,
      unreadCount: { [VIEWER_ID]: 1 },
      roomId: undefined,
      visibility: undefined,
      preferences: {
        id: 'pref-direct-jamie',
        conversationId: 'conv-direct-jamie',
        userId: VIEWER_ID,
        isPinned: false,
        pinnedOrder: null,
        isStarred: false,
        isArchived: false,
        notificationsEnabled: true,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    },
    {
      id: 'conv-room-product',
      type: ConversationType.ROOM,
      participants: [VIEWER_ID, 'user-2', 'user-3'],
      lastActivity: new Date('2025-10-20T08:30:00.000Z'),
      name: 'Product Planning Room',
      isArchived: false,
      unreadCount: { [VIEWER_ID]: 5 },
      roomId: 'space-product-hub',
      visibility: undefined,
      preferences: {
        id: 'pref-room-product',
        conversationId: 'conv-room-product',
        userId: VIEWER_ID,
        isPinned: false,
        pinnedOrder: null,
        isStarred: false,
        isArchived: false,
        notificationsEnabled: true,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    },
  ];
}

const baseMessages = new Map<string, Message[]>([
  [
    'conv-pinned-direct',
    [
      {
        id: 'msg-direct-1',
        conversationId: 'conv-pinned-direct',
        senderId: 'user-2',
        content: 'Don\'t forget to review the quarterly plan.',
        timestamp: new Date('2025-10-20T13:50:00.000Z'),
        type: MessageType.TEXT,
        status: MessageStatus.READ,
        reactions: [],
        attachments: [],
        replyToId: undefined,
        readReceipts: [],
        pins: [],
        stars: [],
        isEdited: false,
      },
    ],
  ],
  [
    'conv-room-team-sync',
    [
      {
        id: 'msg-room-1',
        conversationId: 'conv-room-team-sync',
        senderId: 'user-3',
        content: 'Agenda: blockers, roadmap headlines, celebrations.',
        timestamp: new Date('2025-10-20T13:10:00.000Z'),
        type: MessageType.TEXT,
        status: MessageStatus.DELIVERED,
        reactions: [],
        attachments: [],
        replyToId: undefined,
        readReceipts: [],
        pins: [],
        stars: [],
        isEdited: false,
      },
    ],
  ],
  [
    'conv-direct-jamie',
    [
      {
        id: 'msg-direct-2',
        conversationId: 'conv-direct-jamie',
        senderId: VIEWER_ID,
        content: 'Can we review the prototype tomorrow?',
        timestamp: new Date('2025-10-19T22:30:00.000Z'),
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        reactions: [],
        attachments: [],
        replyToId: undefined,
        readReceipts: [],
        pins: [],
        stars: [],
        isEdited: false,
      },
    ],
  ],
  [
    'conv-room-product',
    [
      {
        id: 'msg-room-2',
        conversationId: 'conv-room-product',
        senderId: 'user-2',
        content: 'Drafted the backlog refinement outline—feedback welcome!',
        timestamp: new Date('2025-10-20T08:25:00.000Z'),
        type: MessageType.TEXT,
        status: MessageStatus.READ,
        reactions: [],
        attachments: [],
        replyToId: undefined,
        readReceipts: [],
        pins: [],
        stars: [],
        isEdited: false,
      },
    ],
  ],
]);

interface TestMessagingProviderProps {
  children: React.ReactNode;
  filterPinnedOnly: boolean;
  initialConversations: Conversation[];
}

function cloneConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    lastActivity: new Date(conversation.lastActivity),
    preferences: conversation.preferences
      ? {
          ...conversation.preferences,
          createdAt: new Date(conversation.preferences.createdAt),
          updatedAt: new Date(conversation.preferences.updatedAt),
        }
      : undefined,
  };
}

function TestMessagingProvider({ children, filterPinnedOnly, initialConversations }: TestMessagingProviderProps) {
  const [allConversations, setAllConversations] = useState<Conversation[]>(() =>
    initialConversations.map((conversation) => cloneConversation(conversation))
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [lastConversationId, setLastConversationId] = useState<string | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState(() => new Map(baseMessages));
  const [activeView, setActiveView] = useState<DrawerView>('list');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);

  const visibleConversations = useMemo(() => {
    return allConversations.filter((conversation) => {
      if (!filterPinnedOnly) return true;
      return Boolean(conversation.preferences?.isPinned);
    });
  }, [allConversations, filterPinnedOnly]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return null;
    return (
      allConversations.find((conversation) => conversation.id === activeConversationId) ?? null
    );
  }, [activeConversationId, allConversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    const stillVisible = visibleConversations.some((conversation) => conversation.id === activeConversationId);
    if (!stillVisible) {
      setActiveView('list');
    }
  }, [activeConversationId, visibleConversations]);

  const ensureConversationExists = useCallback((conversation: Conversation) => {
    setAllConversations((prev) => {
      const exists = prev.some((item) => item.id === conversation.id);
      if (exists) {
        return prev.map((item) => (item.id === conversation.id ? { ...conversation } : item));
      }
      return [conversation, ...prev];
    });
  }, []);

  const totalUnreadCount = useMemo(() => {
    return allConversations.reduce((total, conversation) => {
      return total + (conversation.unreadCount[VIEWER_ID] ?? 0);
    }, 0);
  }, [allConversations]);

  const messages: Message[] = useMemo(() => {
    if (!activeConversationId) return [];
    return messagesByConversation.get(activeConversationId) ?? [];
  }, [activeConversationId, messagesByConversation]);

  const setActiveConversationValue = useCallback((conversation: Conversation | null) => {
    if (conversation) {
      ensureConversationExists(conversation);
      setActiveConversationId(conversation.id);
      setLastConversationId(conversation.id);
      setIsDrawerOpen(true);
    } else {
      setActiveConversationId(null);
    }
  }, [ensureConversationExists]);

  const getOrCreateRoomConversation = useCallback(async (roomId: string, roomName: string) => {
    const existing = allConversations.find((conversation) => conversation.roomId === roomId);
    if (existing) {
      ensureConversationExists(existing);
      return existing;
    }

    const newConversation: Conversation = {
      id: `conv-room-${roomId}`,
      type: ConversationType.ROOM,
      participants: [VIEWER_ID, 'user-2', 'user-3'],
      lastActivity: new Date(),
      name: roomName,
      isArchived: false,
      unreadCount: { [VIEWER_ID]: 0 },
      roomId,
      visibility: undefined,
      preferences: {
        id: `pref-${roomId}`,
        conversationId: `conv-room-${roomId}`,
        userId: VIEWER_ID,
        isPinned: false,
        pinnedOrder: null,
        isStarred: false,
        isArchived: false,
        notificationsEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    ensureConversationExists(newConversation);
    return newConversation;
  }, [allConversations, ensureConversationExists]);

  const getOrCreateUserConversation = useCallback(async (userId: string) => {
    const existing = allConversations.find((conversation) => {
      return (
        conversation.type === ConversationType.DIRECT &&
        conversation.participants.includes(userId) &&
        conversation.participants.includes(VIEWER_ID)
      );
    });

    if (existing) {
      ensureConversationExists(existing);
      return existing;
    }

    const newConversation: Conversation = {
      id: `conv-direct-${userId}`,
      type: ConversationType.DIRECT,
      participants: [VIEWER_ID, userId],
      lastActivity: new Date(),
      name: baseUsers.find((user) => user.id === userId)?.displayName ?? 'New Direct Message',
      isArchived: false,
      unreadCount: { [VIEWER_ID]: 0 },
      roomId: undefined,
      visibility: undefined,
      preferences: {
        id: `pref-direct-${userId}`,
        conversationId: `conv-direct-${userId}`,
        userId: VIEWER_ID,
        isPinned: false,
        pinnedOrder: null,
        isStarred: false,
        isArchived: false,
        notificationsEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    ensureConversationExists(newConversation);
    setMessagesByConversation((prev) => {
      const next = new Map(prev);
      next.set(newConversation.id, []);
      return next;
    });

    return newConversation;
  }, [allConversations, ensureConversationExists]);

  const markConversationAsRead = useCallback(async (conversationId: string) => {
    setAllConversations((prev) => prev.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      return {
        ...conversation,
        unreadCount: { ...conversation.unreadCount, [VIEWER_ID]: 0 },
      };
    }));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeConversationId) return undefined;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      conversationId: activeConversationId,
      senderId: VIEWER_ID,
      content,
      timestamp: new Date(),
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      reactions: [],
      attachments: [],
      replyToId: undefined,
      readReceipts: [],
      pins: [],
      stars: [],
      isEdited: false,
    };

    setMessagesByConversation((prev) => {
      const next = new Map(prev);
      const existingMessages = next.get(activeConversationId) ?? [];
      next.set(activeConversationId, [...existingMessages, newMessage]);
      return next;
    });

    setAllConversations((prev) => prev.map((conversation) => {
      if (conversation.id !== activeConversationId) return conversation;
      return {
        ...conversation,
        lastActivity: newMessage.timestamp,
      };
    }));

    return newMessage;
  }, [activeConversationId]);

  const updateReactions = useCallback((messageId: string, emoji: string, add: boolean) => {
    if (!activeConversationId) return;
    setMessagesByConversation((prev) => {
      const next = new Map(prev);
      const existingMessages = next.get(activeConversationId) ?? [];
      next.set(
        activeConversationId,
        existingMessages.map((message) => {
          if (message.id !== messageId) return message;
          const reactions = message.reactions ?? [];
          if (add) {
            return {
              ...message,
              reactions: [...reactions, { emoji, userId: VIEWER_ID, timestamp: new Date() }],
            };
          }
          return {
            ...message,
            reactions: reactions.filter((reaction) => !(reaction.emoji === emoji && reaction.userId === VIEWER_ID)),
          };
        }),
      );
      return next;
    });
  }, [activeConversationId]);

  const value: MessagingContextType = {
    isDrawerOpen,
    isMinimized,
    activeView,
    openDrawer: () => setIsDrawerOpen(true),
    toggleMinimize: () => setIsMinimized((previous) => !previous),
    setActiveView,
    conversations: visibleConversations,
    activeConversation,
    lastActiveConversation: lastConversationId
      ? allConversations.find((conversation) => conversation.id === lastConversationId) ?? null
      : null,
    loadingConversations: false,
    errorConversations: null,
    setActiveConversation: setActiveConversationValue,
    getOrCreateRoomConversation,
    getOrCreateUserConversation,
    archiveConversation: async () => {},
    unarchiveConversation: async () => {},
    markConversationAsRead,
    totalUnreadCount,
    refreshConversations: async () => {},
    closeDrawer: () => {
      setIsDrawerOpen(false);
      setActiveConversationId(null);
      setActiveView('list');
    },
    messages,
    loadingMessages: false,
    errorMessages: null,
    hasMoreMessages: false,
    loadMoreMessages: async () => {},
    refreshMessages: async () => {},
    sendMessage,
    addReaction: async (messageId: string, emoji: string) => updateReactions(messageId, emoji, true),
    removeReaction: async (messageId: string, emoji: string) => updateReactions(messageId, emoji, false),
    uploadAttachment: async (file: File) => {
      const attachment: FileAttachment = {
        id: `attachment-${Date.now()}`,
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      };
      return attachment;
    },
    connectionStatus: 'connected',
    isMessagingV2Enabled: true,
  };

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

interface HarnessControlsProps {
  showPinnedOnly: boolean;
  onTogglePinned: () => void;
  fixtures: Conversation[];
}

function HarnessControls({ showPinnedOnly, onTogglePinned, fixtures }: HarnessControlsProps) {
  const messaging = useMessagingProxy(fixtures);

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="messaging-harness-controls">
      <Button data-testid="toggle-pinned-filter" variant="outline" size="sm" onClick={onTogglePinned}>
        {showPinnedOnly ? 'Show all conversations' : 'Show pinned only'}
      </Button>
      <Button
        data-testid="floor-nav-team-sync"
        variant="outline"
        size="sm"
        onClick={() => void messaging.navigateToConversation('conv-room-team-sync')}
      >
        Switch to Team Sync Room
      </Button>
      <Button
        data-testid="floor-nav-product-hub"
        variant="outline"
        size="sm"
        onClick={() => void messaging.navigateToConversation('conv-room-product')}
      >
        Switch to Product Planning Room
      </Button>
      <Button
        data-testid="reset-conversation-state"
        variant="outline"
        size="sm"
        onClick={() => messaging.resetToListView()}
      >
        Return to conversation list
      </Button>
    </div>
  );
}

function useMessagingProxy(fixtures: Conversation[]) {
  const context = useMessagingContext();
  const navigateToConversation = useCallback(
    async (conversationId: string) => {
      const target = context.conversations.find((conversation) => conversation.id === conversationId);
      if (target) {
        context.setActiveConversation(target);
        context.setActiveView('conversation');
        context.openDrawer();
        return;
      }

      const fixture = fixtures.find((conversation) => conversation.id === conversationId);
      if (fixture) {
        context.setActiveConversation(fixture);
        context.setActiveView('conversation');
        context.openDrawer();
        return;
      }

      context.openDrawer();
    },
    [context, fixtures]
  );

  const resetToListView = useCallback(() => {
    context.setActiveView('list');
    context.setActiveConversation(null);
    context.openDrawer();
  }, [context]);

  return { navigateToConversation, resetToListView };
}

export function MessagingDrawerTestClient() {
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const initialConversations = useMemo(() => buildConversationFixtures(), []);

  const authValue: AuthContextType = useMemo(() => ({
    session: null,
    user: {
      id: 'auth-user-1',
      aud: 'authenticated',
      email: 'alex.rivera@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { name: 'Alex Rivera' },
      created_at: TIMESTAMP.toISOString(),
      role: 'authenticated',
      updated_at: TIMESTAMP.toISOString(),
      identities: [],
    } as unknown as AuthContextType['user'],
    loading: false,
    error: null,
    signIn: async () => {},
    signOut: async () => {},
    signUp: async () => {},
    signInWithGoogle: async () => {},
    actionLoading: false,
    actionError: null,
  }), []);

  const companyValue: CompanyContextType = useMemo(() => ({
    company: baseCompany,
    companyUsers: baseUsers,
    spaces: baseSpaces,
    currentUserProfile: baseUsers[0],
    isLoading: false,
    error: null,
    createNewCompany: async () => baseCompany.id,
    updateCompanyDetails: async () => {},
    updateUserProfile: async () => {},
    updateUserRole: async () => {},
    removeUserFromCompany: async () => {},
    loadCompanyData: async () => {},
  }), []);

  return (
    <AuthContext.Provider value={authValue}>
      <CompanyContext.Provider value={companyValue}>
        <TestMessagingProvider
          filterPinnedOnly={showPinnedOnly}
          initialConversations={initialConversations}
        >
          <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
              <header className="space-y-1">
                <h1 className="text-2xl font-semibold">Messaging Drawer Playwright Harness</h1>
                <p className="text-sm text-muted-foreground">
                  Deterministic fixture surface for automated end-to-end drawer validation. Use the controls below to emulate floor-plan navigation and pinned filters.
                </p>
              </header>

              <HarnessControls
                showPinnedOnly={showPinnedOnly}
                onTogglePinned={() => setShowPinnedOnly((prev) => !prev)}
                fixtures={initialConversations}
              />

              <div data-testid="messaging-drawer-root" className="relative flex justify-end">
                <MessagingDrawer />
              </div>
            </div>
          </div>
        </TestMessagingProvider>
      </CompanyContext.Provider>
    </AuthContext.Provider>
  );
}
