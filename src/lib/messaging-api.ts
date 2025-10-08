// src/lib/messaging-api.ts
import { Message, Conversation, MessageType, MessageStatus, ConversationType, FileAttachment } from '@/types/messaging';
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
    isArchived: Boolean(raw?.isArchived),
    unreadCount: raw?.unreadCount ?? raw?.unread_count ?? {},
    roomId: raw?.roomId ?? raw?.room_id ?? undefined,
    visibility: raw?.visibility,
  } as Conversation;
}

/**
 * API client for messaging system
 */
export const messagingApi = {
  /**
   * Send a new message
   */
  async sendMessage(message: Partial<Message>): Promise<Message> {
    const scope = 'messagingApi.sendMessage';
    const requestId = createRequestId('msg-send');
    const start = getTimestamp();
    debugLogger.messaging.event(scope, 'fetch:start', {
      requestId,
      conversationId: message.conversationId,
      hasAttachments: Array.isArray(message.attachments) && message.attachments.length > 0,
      type: message.type,
    });

    try {
      const response = await fetch('/api/messages/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
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
        data.messages = data.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
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

  /**
   * Create a new conversation
   */
  async createConversation(conversation: Partial<Conversation> & { userId?: string }): Promise<Conversation> {
    if (!conversation.type) {
      throw new Error('Conversation type is required');
    }

    if (conversation.type === ConversationType.DIRECT) {
      const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
      const requesterId = conversation.userId || participants[0];
      const targetUserId = participants.find(id => id !== requesterId);

      if (!requesterId || !targetUserId) {
        throw new Error('Direct conversations require requester and target user ids');
      }

      return this.resolveConversation({ type: ConversationType.DIRECT, userId: targetUserId });
    }

    if (conversation.type === ConversationType.ROOM) {
      if (!conversation.roomId) {
        throw new Error('Room conversations require a roomId');
      }

      return this.resolveConversation({ type: ConversationType.ROOM, roomId: conversation.roomId });
    }

    throw new Error(`Unsupported conversation type: ${conversation.type}`);
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
      // First try to find an existing room conversation
      const userId = participants[0]; // Use the first participant as the userId for querying
      const { conversations } = await this.getConversations(userId, {
        type: ConversationType.ROOM
      });
      
      const existingConversation = conversations.find(c => c.roomId === roomId);
      
      if (existingConversation) {
        return existingConversation;
      }
      
      // Create a new room conversation if one doesn't exist
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
   * Add a reaction to a message
   */
  async addReaction(messageId: string, reaction: string, userId: string): Promise<void> {
    try {
      const response = await fetch('/api/messages/react', {
        method: 'POST', // Assuming POST adds a reaction
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId, reaction, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add reaction');
      }
      // No specific data expected on success for adding reaction
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  },

  /**
   * Remove a reaction from a message
   */
  async removeReaction(messageId: string, reaction: string, userId: string): Promise<void> {
    try {
      // Assuming DELETE method or a flag in body distinguishes removal.
      // Let's try DELETE first, adjust if backend expects differently.
      const response = await fetch('/api/messages/react', {
        method: 'POST', // Backend handles add/remove logic via POST based on current state
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId, reaction, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove reaction');
      }
      // No specific data expected on success for removing reaction
    } catch (error) {
      console.error('Error removing reaction:', error);
      throw error;
    }
  },

  /**
   * Update the status of a message (e.g., delivered, read)
   */
  async updateMessageStatus(messageId: string, status: MessageStatus, userId: string): Promise<void> {
    try {
      const response = await fetch('/api/messages/status', { // Assuming this endpoint
        method: 'PATCH', // Assuming PATCH for status update
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId, status, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update message status');
      }
      // No specific data expected on success
    } catch (error) {
      console.error('Error updating message status:', error);
      throw error;
    }
  },

  /**
   * Send a typing indicator for a conversation
   */
  async sendTypingIndicator(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    try {
      // This might be handled purely via sockets, but adding an API call placeholder
      const response = await fetch('/api/messages/typing', { // Assuming this endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationId, userId, isTyping }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send typing indicator');
      }
      // No specific data expected on success
    } catch (error) {
      console.error('Error sending typing indicator:', error);
      // Don't necessarily throw for typing indicators, might fail silently
      // throw error; 
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
   * Mark a conversation as read for a specific user
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
  }
};
