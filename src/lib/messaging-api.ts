// src/lib/messaging-api.ts
import { Message, Conversation, MessageType, MessageStatus, ConversationType } from '@/types/messaging';

/**
 * API client for messaging system
 */
export const messagingApi = {
  /**
   * Send a new message
   */
  async sendMessage(message: Partial<Message>): Promise<Message> {
    try {
      const response = await fetch('/api/messages/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      return data.message;
    } catch (error) {
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
      cursor?: string;
      direction?: 'older' | 'newer';
    }
  ): Promise<{
    messages: Message[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    try {
      const params = new URLSearchParams();
      params.append('conversationId', conversationId);
      
      if (options?.limit) {
        params.append('limit', options.limit.toString());
      }
      
      if (options?.cursor) {
        params.append('cursor', options.cursor);
      }
      
      if (options?.direction) {
        params.append('direction', options.direction);
      }
      
      const response = await fetch(`/api/messages/get?${params.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch messages');
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  },

  /**
   * Create a new conversation
   */
  async createConversation(conversation: Partial<Conversation>): Promise<Conversation> {
    try {
      const response = await fetch('/api/conversations/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(conversation),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create conversation');
      }

      const data = await response.json();
      return data.conversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
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
    try {
      const params = new URLSearchParams();
      params.append('userId', userId);
      
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
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch conversations');
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
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
      return await this.createConversation({
        type: ConversationType.ROOM,
        participants,
        name: roomName,
        roomId,
        isArchived: false,
        unreadCount: {}
      });
    } catch (error) {
      console.error('Error getting or creating room conversation:', error);
      throw error;
    }
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
        method: 'DELETE', // Assuming DELETE removes a reaction
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
  }
};
