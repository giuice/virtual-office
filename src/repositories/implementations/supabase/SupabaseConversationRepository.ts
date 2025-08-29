// src/repositories/implementations/supabase/SupabaseConversationRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { Conversation, ConversationType, ConversationVisibility } from '@/types/messaging'; 
import { PaginationOptions, PaginatedResult } from '@/types/common';

// Helper function to map DB snake_case to TS camelCase
type ConversationRow = {
  id: string;
  type: string;
  participants: string[] | null;
  last_activity: string | null;
  name: string | null;
  is_archived: boolean | null;
  unread_count: Record<string, number> | null;
  room_id: string | null;
  visibility: string | null;
};
function mapToCamelCase(data: ConversationRow): Conversation {
  
  // Ensure we have the correct structure with necessary checks
  return {
    id: data.id,
    type: data.type as ConversationType,
    participants: data.participants || [],
    lastActivity: data.last_activity ? new Date(data.last_activity) : new Date(),
    name: data.name || undefined,
    isArchived: Boolean(data.is_archived),
    unreadCount: data.unread_count || {},
    roomId: data.room_id || undefined,
    visibility: (data.visibility as ConversationVisibility) || ConversationVisibility.PUBLIC,
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: ConversationRow[]): Conversation[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}


export class SupabaseConversationRepository implements IConversationRepository {
  private TABLE_NAME = 'conversations'; 

  async findById(id: string): Promise<Conversation | null> {
    try {
      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned - not an error, just no data
          return null;
        }
        console.error('Error fetching conversation by ID:', error);
        throw error;
      }
      
  return data ? mapToCamelCase(data as ConversationRow) : null;
    } catch (error) {
      console.error(`Repository error in findById(${id}):`, error);
      throw error;
    }
  }

  async findByUser(userId: string, options?: PaginationOptions): Promise<PaginatedResult<Conversation>> {
    try {
      const limit = options?.limit ?? 20; // Default limit
      // Supabase range is inclusive [from, to]
      const from = typeof options?.cursor === 'number' ? options.cursor : 0;
      const to = from + limit - 1;

      // Query conversations where the user is a participant
      const { data, error, count } = await supabase
        .from(this.TABLE_NAME)
        .select('*', { count: 'exact' })
        .contains('participants', [userId])
        .order('last_activity', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Error fetching conversations by user:', error);
        throw error;
      }

      // Map DB response array
  const items = mapArrayToCamelCase((data as ConversationRow[]) || []);
      const nextCursor = items.length === limit ? to + 1 : null;

      return {
        items: items,
        nextCursor: nextCursor,
        hasMore: nextCursor !== null,
        totalCount: count ?? undefined,
      };
    } catch (error) {
      console.error(`Repository error in findByUser(${userId}):`, error);
      throw error;
    }
  }

  async create(conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'>): Promise<Conversation> {
    try {
      console.log('Repository creating conversation with data:', JSON.stringify(conversationData, null, 2));
      
      // Map Conversation type (camelCase) to DB schema (snake_case)
      const dbData = {
        type: conversationData.type,
        participants: Array.isArray(conversationData.participants) ? conversationData.participants : [],
        name: conversationData.name || null,
        is_archived: conversationData.isArchived || false,
        room_id: conversationData.roomId || null,
        visibility: conversationData.visibility || ConversationVisibility.PUBLIC,
        // last_activity needs to be set explicitly to ensure consistency
        last_activity: conversationData.lastActivity || new Date().toISOString(),
        unread_count: {} // Initialize empty unread count
      };

      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .insert(dbData)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase error creating conversation:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data) {
        throw new Error('Failed to retrieve created conversation data');
      }
      
      console.log('Created conversation in database:', JSON.stringify(data, null, 2));
      
      // Map DB response back to Conversation type
      return mapToCamelCase(data);
    } catch (error) {
      console.error('Repository error in create():', error);
      throw error;
    }
  }

  async update(id: string, updates: Partial<Pick<Conversation, 'name'>>): Promise<Conversation | null> {
    try {
      // Map updates from camelCase to snake_case (only 'name' here)
      const dbUpdates = { ...updates }; // 'name' matches DB column name

      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating conversation:', error);
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data ? mapToCamelCase(data) : null;
    } catch (error) {
      console.error(`Repository error in update(${id}):`, error);
      throw error;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from(this.TABLE_NAME)
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting conversation:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Repository error in deleteById(${id}):`, error);
      throw error;
    }
  }

  async setArchiveStatus(id: string, isArchived: boolean): Promise<Conversation | null> {
    try {
      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .update({ is_archived: isArchived })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error setting archive status:', error);
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data ? mapToCamelCase(data) : null;
    } catch (error) {
      console.error(`Repository error in setArchiveStatus(${id}, ${isArchived}):`, error);
      throw error;
    }
  }

  async markAsRead(id: string, userId: string): Promise<boolean> {
    try {
      // For simplicity, we'll implement it directly without RPC
      // First, get the current conversation to access the unread_count
      const { data: conversation, error: fetchError } = await supabase
        .from(this.TABLE_NAME)
        .select('unread_count')
        .eq('id', id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching conversation for markAsRead:', fetchError);
        return false;
      }
      
      if (!conversation) {
        return false;
      }
      
      // Create a new unread_count object without the user's entry
      const unreadCount = { ...(conversation.unread_count || {}) };
      delete unreadCount[userId];
      
      // Update the conversation with the new unread_count
      const { error: updateError } = await supabase
        .from(this.TABLE_NAME)
        .update({ unread_count: unreadCount })
        .eq('id', id);
        
      if (updateError) {
        console.error('Error updating unread_count in markAsRead:', updateError);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Repository error in markAsRead(${id}, ${userId}):`, error);
      throw error;
    }
  }

  async updateLastActivityTimestamp(id: string, timestamp?: string): Promise<Conversation | null> {
    try {
      const activityTimestamp = timestamp || new Date().toISOString();
      const { data, error } = await supabase
        .from(this.TABLE_NAME)
        .update({
          last_activity: activityTimestamp
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating last activity timestamp:', error);
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data ? mapToCamelCase(data) : null;
    } catch (error) {
      console.error(`Repository error in updateLastActivityTimestamp(${id}):`, error);
      throw error;
    }
  }

  async incrementUnreadCount(id: string, userIdsToIncrement: string[]): Promise<boolean> {
    try {
      // For simplicity, we'll implement it directly without RPC
      // First, get the current conversation to access the unread_count
      const { data: conversation, error: fetchError } = await supabase
        .from(this.TABLE_NAME)
        .select('unread_count')
        .eq('id', id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching conversation for incrementUnreadCount:', fetchError);
        return false;
      }
      
      if (!conversation) {
        return false;
      }
      
      // Create a new unread_count object with incremented counts
      const unreadCount = { ...(conversation.unread_count || {}) };
      
      for (const userId of userIdsToIncrement) {
        unreadCount[userId] = (unreadCount[userId] || 0) + 1;
      }
      
      // Update the conversation with the new unread_count
      const { error: updateError } = await supabase
        .from(this.TABLE_NAME)
        .update({ unread_count: unreadCount })
        .eq('id', id);
        
      if (updateError) {
        console.error('Error updating unread_count in incrementUnreadCount:', updateError);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Repository error in incrementUnreadCount(${id}, ${userIdsToIncrement}):`, error);
      throw error;
    }
  }
}
