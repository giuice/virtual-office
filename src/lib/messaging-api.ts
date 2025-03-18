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
  }
};
