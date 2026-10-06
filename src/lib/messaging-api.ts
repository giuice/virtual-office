// src/lib/messaging-api.ts
import { Message, Conversation, ConversationType, FileAttachment, MessageReaction, MessageReader } from '@/types/messaging';
import { debugLogger } from '@/utils/debug-logger';

const getTimestamp = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const createRequestId = (prefix: string): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    // Ignore crypto errors and fallback to timestamp-based identifier
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const normalizeDate = (value: unknown): Date => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(0);
};

const normalizeReactions = (reactions: unknown): MessageReaction[] => {
  if (!Array.isArray(reactions)) {
    return [];
  }

  return reactions
    .filter((reaction): reaction is MessageReaction => {
      return Boolean(
        reaction &&
          typeof reaction === 'object' &&
          'emoji' in reaction &&
          'userId' in reaction &&
          'timestamp' in reaction
      );
    })
    .map((reaction) => ({
      ...reaction,
      timestamp: normalizeDate(reaction.timestamp),
    }));
};

function normalizeConversation(raw: any): Conversation {
  return {
    id: raw?.id,
    type: raw?.type,
    participants: Array.isArray(raw?.participants) ? raw.participants : [],
    lastActivity: raw?.lastActivity instanceof Date
      ? raw.lastActivity
      : raw?.last_activity
        ? new Date(raw.last_activity)
        : raw?.lastActivity
          ? new Date(raw.lastActivity)
          : new Date(),
    name: raw?.name ?? undefined,
    isArchived: Boolean(raw?.isArchived ?? raw?.is_archived),
    // Phase 2.2: server sends the viewer's count as a number (derived from
    // conversation_members.last_read_at); legacy map payloads coerce to 0.
    unreadCount: typeof raw?.unreadCount === 'number' ? raw.unreadCount : 0,
    roomId: raw?.roomId ?? raw?.room_id ?? undefined,
    visibility: raw?.visibility,
    preferences: raw?.preferences ? {
      id: raw.preferences.id,
      conversationId: raw.preferences.conversationId ?? raw.preferences.conversation_id,
      userId: raw.preferences.userId ?? raw.preferences.user_id,
      isPinned: Boolean(raw.preferences.isPinned ?? raw.preferences.is_pinned),
      pinnedOrder: raw.preferences.pinnedOrder ?? raw.preferences.pinned_order ?? null,
      isStarred: Boolean(raw.preferences.isStarred ?? raw.preferences.is_starred),
      isArchived: Boolean(raw.preferences.isArchived ?? raw.preferences.is_archived),
      notificationsEnabled: raw.preferences.notificationsEnabled ?? raw.preferences.notifications_enabled ?? true,
      createdAt: raw.preferences.createdAt instanceof Date
        ? raw.preferences.createdAt
        : raw.preferences.createdAt
          ? new Date(raw.preferences.createdAt)
          : raw.preferences.created_at
            ? new Date(raw.preferences.created_at)
            : new Date(),
      updatedAt: raw.preferences.updatedAt instanceof Date
        ? raw.preferences.updatedAt
        : raw.preferences.updatedAt
          ? new Date(raw.preferences.updatedAt)
          : raw.preferences.updated_at
            ? new Date(raw.preferences.updated_at)
            : new Date(),
    } : undefined,
  } as Conversation;
}

/**
 * API client for messaging system
 */
export const messagingApi = {
  /**
   * Send a new message. `clientMessageId` is the composition key (Phase 4
   * FR-024): resending it on a retry returns the message the server already
   * stored for it instead of creating a duplicate. `attachmentIds` are the
   * caller's pending uploads (POST /api/messages/upload) linked to the new
   * message in the same transaction (Phase 4 T12/T13).
   */
  async sendMessage(
    message: Partial<Message>,
    options?: { clientMessageId?: string; attachmentIds?: string[] }
  ): Promise<Message> {
    const scope = 'messagingApi.sendMessage';
    const requestId = createRequestId('msg-send');
    const start = getTimestamp();
    debugLogger.messaging.event(scope, 'fetch:start', {
      requestId,
      conversationId: message.conversationId,
      hasAttachments: (options?.attachmentIds?.length ?? 0) > 0,
      type: message.type,
    });

    try {
      const response = await fetch('/api/messages/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...message,
          // Attachments travel as upload ids; the server returns the linked files.
          attachments: undefined,
          ...(options?.clientMessageId ? { clientMessageId: options.clientMessageId } : {}),
          ...(options?.attachmentIds?.length ? { attachmentIds: options.attachmentIds } : {}),
        }),
      });

      const duration = getTimestamp() - start;
      debugLogger.messaging.metric(scope, 'fetch', duration, {
        requestId,
        status: response.status,
      });

      if (!response.ok) {
        const errorData = await response.json();
        debugLogger.messaging.warn(scope, 'fetch:non-ok', {
          requestId,
          status: response.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      debugLogger.messaging.event(scope, 'fetch:success', {
        requestId,
        messageId: data.message?.id,
        status: data.message?.status,
      });
      return data.message;
    } catch (error) {
      const duration = getTimestamp() - start;
      debugLogger.messaging.error(scope, 'fetch:error', {
        requestId,
        duration,
        error: error instanceof Error ? error.message : error,
      });
      console.error('Error sending message:', error);
      throw error;
    }
  },

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    options?: {
      limit?: number;
      cursor?: string; // legacy offset cursor (kept for compatibility)
      cursorBefore?: string; // ISO timestamp for older paging
      cursorAfter?: string; // ISO timestamp for newer paging
    }
  ): Promise<{
    messages: Message[];
    nextCursorBefore?: string;
    hasMoreOlder?: boolean;
    nextCursor?: string; // legacy
    hasMore?: boolean;   // legacy
  }> {
    const scope = 'messagingApi.getMessages';
    const requestId = createRequestId('msg-list');
    const start = getTimestamp();
    debugLogger.messaging.event(scope, 'fetch:start', {
      requestId,
      conversationId,
      limit: options?.limit,
      cursor: options?.cursor,
      cursorBefore: options?.cursorBefore,
      cursorAfter: options?.cursorAfter,
    });

    try {
      const params = new URLSearchParams();
      params.append('conversationId', conversationId);
      
      if (options?.limit) {
        params.append('limit', options.limit.toString());
      }
      
      if (options?.cursor) params.append('cursor', options.cursor);
      if (options?.cursorBefore) params.append('cursorBefore', options.cursorBefore);
      if (options?.cursorAfter) params.append('cursorAfter', options.cursorAfter);
      
      const response = await fetch(`/api/messages/get?${params.toString()}`);
      const duration = getTimestamp() - start;
      debugLogger.messaging.metric(scope, 'fetch', duration, {
        requestId,
        status: response.status,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        debugLogger.messaging.warn(scope, 'fetch:non-ok', {
          requestId,
          status: response.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to fetch messages');
      }
      
      const data = await response.json();
      debugLogger.messaging.event(scope, 'fetch:success', {
        requestId,
        total: Array.isArray(data.messages) ? data.messages.length : 0,
        hasMoreOlder: data.hasMoreOlder,
      });
      // Normalize timestamps to Date for client cache consistency
      if (Array.isArray(data.messages)) {
        data.messages = data.messages.map((m: Message) => ({
          ...m,
          timestamp: normalizeDate(m.timestamp),
          reactions: normalizeReactions(m.reactions),
        }));
      }
      return data;
    } catch (error) {
      const duration = getTimestamp() - start;
      debugLogger.messaging.error(scope, 'fetch:error', {
        requestId,
        duration,
        error: error instanceof Error ? error.message : error,
      });
      console.error('Error fetching messages:', error);
      throw error;
    }
  },

  async resolveConversation(
    params:
      | { type: ConversationType.DIRECT; userId: string }
      | { type: ConversationType.ROOM; roomId: string }
  ): Promise<Conversation> {
    const scope = 'messagingApi.resolveConversation';
    const requestId = createRequestId('conv-resolve');
    const start = getTimestamp();
    debugLogger.messaging.event(scope, 'request:start', {
      requestId,
      type: params.type,
      target: 'userId' in params ? params.userId : params.roomId,
    });

    try {
      const response = await fetch('/api/conversations/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const duration = getTimestamp() - start;
      debugLogger.messaging.metric(scope, 'fetch', duration, {
        requestId,
        status: response.status,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        debugLogger.messaging.warn(scope, 'fetch:non-ok', {
          requestId,
          status: response.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to resolve conversation');
      }

      const data = await response.json();
      debugLogger.messaging.event(scope, 'fetch:success', {
        requestId,
        conversationId: data.conversation?.id,
        type: data.conversation?.type,
      });
      return normalizeConversation(data.conversation);
    } catch (error) {
      const duration = getTimestamp() - start;
      debugLogger.messaging.error(scope, 'fetch:error', {
        requestId,
        duration,
        error: error instanceof Error ? error.message : error,
      });
      console.error('Error resolving conversation:', error);
      throw error;
    }
  },

  /**
   * Get conversations for a user with pagination and filtering
   */
  async getConversations(
    userId: string,
    options?: {
      type?: ConversationType;
      includeArchived?: boolean;
      limit?: number;
      cursor?: string;
    }
  ): Promise<{
    conversations: Conversation[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const scope = 'messagingApi.getConversations';
    const requestId = createRequestId('conv-list');
    const start = getTimestamp();
    debugLogger.messaging.event(scope, 'fetch:start', {
      requestId,
      userId,
      type: options?.type,
      includeArchived: options?.includeArchived,
      limit: options?.limit,
      cursor: options?.cursor,
    });

    try {
      const params = new URLSearchParams();
      
      if (options?.type) {
        params.append('type', options.type);
      }
      
      if (options?.includeArchived !== undefined) {
        params.append('includeArchived', options.includeArchived.toString());
      }
      
      if (options?.limit) {
        params.append('limit', options.limit.toString());
      }
      
      if (options?.cursor) {
        params.append('cursor', options.cursor);
      }
      
      const response = await fetch(`/api/conversations/get?${params.toString()}`);
      const duration = getTimestamp() - start;
      debugLogger.messaging.metric(scope, 'fetch', duration, {
        requestId,
        status: response.status,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        debugLogger.messaging.warn(scope, 'fetch:non-ok', {
          requestId,
          status: response.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to fetch conversations');
      }
      
      const data = await response.json();
      // Normalize Date-like and optional fields so client code can rely on types
      if (Array.isArray(data?.conversations)) {
        data.conversations = data.conversations.map((raw: any) => normalizeConversation(raw));
      }
      debugLogger.messaging.event(scope, 'fetch:success', {
        requestId,
        total: Array.isArray(data.conversations) ? data.conversations.length : 0,
        hasMore: data.hasMore,
        nextCursor: data.nextCursor,
      });
      return data;
    } catch (error) {
      const duration = getTimestamp() - start;
      debugLogger.messaging.error(scope, 'fetch:error', {
        requestId,
        duration,
        error: error instanceof Error ? error.message : error,
      });
      console.error('Error fetching conversations:', error);
      throw error;
    }
  },
  
  /**
   * Get or create a room conversation
   */
  async getOrCreateRoomConversation(
    roomId: string, 
    roomName: string, 
    participants: string[]
  ): Promise<Conversation> {
    try {
      return await this.resolveConversation({
        type: ConversationType.ROOM,
        roomId,
      });
    } catch (error) {
      console.error('Error getting or creating room conversation:', error);
      throw error;
    }
  },

  /**
   * Join an existing conversation by ID (adds current user to participants)
   */
  async joinConversation(conversationId: string): Promise<Conversation> {
    const response = await fetch('/api/conversations/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to join conversation');
    }
    const data = await response.json();
    return data.conversation as Conversation;
  },

  /**
   * Toggle a reaction on a message (add if not present, remove if present)
   * The API endpoint automatically determines whether to add or remove based on current state
   */
  async toggleReaction(messageId: string, emoji: string): Promise<{ action: 'added' | 'removed'; message: string }> {
    const scope = 'messagingApi.toggleReaction';
    const requestId = createRequestId('react-toggle');
    const start = getTimestamp();
    
    debugLogger.messaging.event(scope, 'fetch:start', {
      requestId,
      messageId,
      emoji,
    });

    try {
      const response = await fetch('/api/messages/react', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId, emoji }),
      });

      const duration = getTimestamp() - start;
      debugLogger.messaging.metric(scope, 'fetch', duration, {
        requestId,
        status: response.status,
      });

      if (!response.ok) {
        const errorData = await response.json();
        debugLogger.messaging.warn(scope, 'fetch:non-ok', {
          requestId,
          status: response.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to toggle reaction');
      }

      const data = await response.json();
      debugLogger.messaging.event(scope, 'fetch:success', {
        requestId,
        messageId,
        emoji,
        action: data.action,
      });

      return {
        action: data.action,
        message: data.message ?? '',
      };
    } catch (error) {
      const duration = getTimestamp() - start;
      debugLogger.messaging.error(scope, 'fetch:error', {
        requestId,
        duration,
        error: error instanceof Error ? error.message : error,
      });
      console.error('Error toggling reaction:', error);
      throw error;
    }
  },

  /**
   * Archive or unarchive a conversation
   */
  async setConversationArchiveStatus(conversationId: string, userId: string, isArchived: boolean): Promise<void> {
    try {
      const response = await fetch('/api/conversations/archive', { // Assuming this endpoint
        method: 'PATCH', // Assuming PATCH for updating archive status
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationId, userId, isArchived }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${isArchived ? 'archive' : 'unarchive'} conversation`);
      }
      // No specific data expected on success
    } catch (error) {
      console.error(`Error ${isArchived ? 'archiving' : 'unarchiving'} conversation:`, error);
      throw error;
    }
  },

  /**
   * Record read receipts for messages the viewer actually saw (Phase 4).
   * The server accepts 1-100 ids, ignores the viewer's own messages and ids
   * from other conversations, and is idempotent.
   * @returns how many receipts were newly recorded
   */
  async markMessagesAsRead(conversationId: string, messageIds: readonly string[]): Promise<number> {
    const response = await fetch('/api/conversations/read', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId, messageIds }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null) as { error?: unknown } | null;
      const message = typeof errorData?.error === 'string'
        ? errorData.error
        : `Failed to record read receipts (${response.status})`;
      throw new Error(message);
    }

    const body = await response.json().catch(() => null) as { recorded?: unknown } | null;
    return typeof body?.recorded === 'number' ? body.recorded : 0;
  },

  /**
   * Legacy mark-all: marks every message in the conversation read. Kept for
   * API compatibility only — the drawer reports visible messages through
   * markMessagesAsRead, because "read" means the message was actually seen.
   */
  async markConversationAsRead(conversationId: string, userId: string): Promise<void> {
    try {
      const response = await fetch('/api/conversations/read', { // Assuming this endpoint
        method: 'PATCH', // Assuming PATCH for marking as read
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationId, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark conversation as read');
      }
      // No specific data expected on success
    } catch (error) {
      console.error('Error marking conversation as read:', error);
      throw error;
    }
  },

  /**
   * Upload a file attachment for a message
   * @param file The file to upload
   * @param messageId Optional message ID to associate with the upload (can be assigned later)
   * @param conversationId Conversation ID for organizing uploads
   * @returns Promise resolving to the uploaded file attachment details
   */
  async uploadMessageAttachment(
    file: File,
    conversationId: string,
    messageId?: string
  ): Promise<FileAttachment> {
    try {
      // Create a FormData object to handle file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', conversationId);
      if (messageId) {
        formData.append('messageId', messageId);
      }

      const response = await fetch('/api/messages/upload', {
        method: 'POST',
        // No Content-Type header here - browser sets it with boundary for FormData
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file attachment');
      }

      const data = await response.json();
      return data.attachment;
    } catch (error) {
      console.error('Error uploading file attachment:', error);
      throw error;
    }
  },

  /**
   * Delete a file attachment
   * @param attachmentId ID of the attachment to delete
   * @returns Promise resolving to success status
   */
  async deleteMessageAttachment(attachmentId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/messages/attachment/${attachmentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete file attachment');
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error deleting file attachment:', error);
      throw error;
    }
  },

  /**
   * Who read one of the caller's own messages, most recent first (BR-003).
   * The API answers 403 for anyone but the message's sender.
   */
  async getMessageReaders(messageId: string): Promise<{ readCount: number; readers: MessageReader[] }> {
    const response = await fetch(`/api/messages/${encodeURIComponent(messageId)}/readers`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData: { error?: string } = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get message readers');
    }

    const data: {
      readCount: number;
      readers: { userId: string; displayName: string | null; avatarUrl: string | null; readAt: string }[];
    } = await response.json();

    return {
      readCount: data.readCount,
      readers: data.readers.map((reader) => ({ ...reader, readAt: normalizeDate(reader.readAt) })),
    };
  },

  /**
   * The caller's starred messages in one conversation, newest message first
   * (FR-021). Pass the previous page's `nextCursorBefore` as `cursorBefore`
   * to load older starred messages.
   */
  async getStarredMessages(
    conversationId: string,
    options?: { limit?: number; cursorBefore?: string }
  ): Promise<{ messages: Message[]; nextCursorBefore?: string; hasMoreOlder: boolean }> {
    const params = new URLSearchParams({ conversationId });
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.cursorBefore) params.append('cursorBefore', options.cursorBefore);

    const response = await fetch(`/api/messages/starred?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData: { error?: string } = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get starred messages');
    }

    const data: { messages: Message[]; nextCursorBefore?: string; hasMoreOlder: boolean } =
      await response.json();

    return {
      messages: data.messages.map((message) => ({
        ...message,
        timestamp: normalizeDate(message.timestamp),
        reactions: normalizeReactions(message.reactions),
      })),
      nextCursorBefore: data.nextCursorBefore,
      hasMoreOlder: data.hasMoreOlder,
    };
  },

  /**
   * Get all attachments for a specific message
   * @param messageId ID of the message to get attachments for
   * @returns Promise resolving to an array of file attachments
   */
  async getMessageAttachments(messageId: string): Promise<FileAttachment[]> {
    try {
      const response = await fetch(`/api/messages/attachments?messageId=${messageId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get message attachments');
      }

      const data = await response.json();
      return data.attachments;
    } catch (error) {
      console.error('Error getting message attachments:', error);
      throw error;
    }
  },

  /**
   * Get user's preferences for a conversation
   * @param conversationId The conversation ID
   * @returns Promise resolving to the user's preferences
   */
  async getConversationPreferences(conversationId: string): Promise<any> {
    try {
      const response = await fetch(`/api/conversations/preferences?conversationId=${conversationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get conversation preferences');
      }

      const data = await response.json();
      return data.preferences;
    } catch (error) {
      console.error('Error getting conversation preferences:', error);
      throw error;
    }
  },

  /**
   * Update user's preferences for a conversation
   * @param conversationId The conversation ID
   * @param preferences Partial preferences to update
   * @returns Promise resolving to the updated preferences
   */
  async updateConversationPreferences(
    conversationId: string,
    preferences: {
      isPinned?: boolean;
      pinnedOrder?: number | null;
      isStarred?: boolean;
      notificationsEnabled?: boolean;
    }
  ): Promise<any> {
    try {
      const response = await fetch('/api/conversations/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationId, ...preferences }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update conversation preferences');
      }

      const data = await response.json();
      return data.preferences;
    } catch (error) {
      console.error('Error updating conversation preferences:', error);
      throw error;
    }
  },

  /**
   * Get pinned conversations for the current user
   * @returns Promise resolving to pinned conversations
   */
  async getPinnedConversations(): Promise<Conversation[]> {
    try {
      const params = new URLSearchParams();
      params.append('pinned', 'true');

      const response = await fetch(`/api/conversations/get?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch pinned conversations');
      }

      const data = await response.json();
      return data.conversations || [];
    } catch (error) {
      console.error('Error fetching pinned conversations:', error);
      throw error;
    }
  }
};
