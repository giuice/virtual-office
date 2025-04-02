// src/repositories/implementations/supabase/SupabaseConversationRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { Conversation, ConversationType } from '@/types/messaging'; // Assuming ConversationType is needed
import { TimeStampType } from '@/types/database'; // Assuming timestamps match
import { PaginationOptions, PaginatedResult } from '@/types/common';

// Helper function to map DB snake_case to TS camelCase
// Note: Adjust based on the actual Conversation type definition in @/types/messaging
function mapToCamelCase(data: any): Conversation {
  if (!data) return data;
  return {
    id: data.id,
    type: data.type as ConversationType, // Cast if needed
    participants: data.participants || [],
    lastActivity: data.last_activity, // Map last_activity
    name: data.name,
    isArchived: data.is_archived, // Map is_archived
    unreadCount: data.unread_count || {}, // Map unread_count, ensure object
    roomId: data.room_id // Map room_id
    // createdAt is in the DB but not in the Conversation type from @/types/messaging
  };
}

// Helper function to map an array
function mapArrayToCamelCase(dataArray: any[]): Conversation[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapToCamelCase(item));
}


export class SupabaseConversationRepository implements IConversationRepository {
  private TABLE_NAME = 'conversations'; // Ensure this matches your Supabase table name

  async findById(id: string): Promise<Conversation | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching conversation by ID:', error);
      throw error;
    }
    // Map DB response (snake_case) to Conversation type (camelCase)
    return data ? mapToCamelCase(data) : null;
  }

  async findByUser(userId: string, options?: PaginationOptions): Promise<PaginatedResult<Conversation>> {
    const limit = options?.limit ?? 20; // Default limit
    // Supabase range is inclusive [from, to]
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    // Query conversations where the user is a participant
    // Ordering by lastActivity descending to get recent conversations first
    const { data, error, count } = await supabase
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact' }) // Request total count
      .contains('participants', [userId]) // Check if userId is in the participants array
      .order('last_activity', { ascending: false }) // Assuming snake_case
      .range(from, to);

    if (error) {
      console.error('Error fetching conversations by user:', error);
      throw error;
    }

    // Map DB response array
    const items = mapArrayToCamelCase(data || []);
    const nextCursor = items.length === limit ? to + 1 : null; // Calculate next cursor/offset

    return {
      items: items,
      nextCursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined, // Use the exact count if available
    };
  }

  // Assuming Conversation type has camelCase properties corresponding to snake_case DB columns
  async create(conversationData: Omit<Conversation, 'id' | 'createdAt' | 'lastActivity' | 'unreadCount' /* Adjust Omit based on actual type */>): Promise<Conversation> {
     // Map Conversation type (camelCase) to DB schema (snake_case)
     const dbData = {
        type: conversationData.type,
        participants: conversationData.participants || [],
        name: conversationData.name,
        is_archived: conversationData.isArchived || false, // Default if not provided
        room_id: conversationData.roomId,
        // last_activity, created_at handled by Supabase defaults/triggers
        // unread_count initialized by default or trigger (or should be set explicitly if needed)
     };

    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating conversation:', error);
      throw error || new Error('Failed to create conversation or retrieve created data.');
    }
     // Map DB response back to Conversation type
    return mapToCamelCase(data);
  }

  // Assuming only 'name' is updatable via this general method per interface
  async update(id: string, updates: Partial<Pick<Conversation, 'name'>>): Promise<Conversation | null> {
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
    // Map DB response back to Conversation type
    return data ? mapToCamelCase(data) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  async setArchiveStatus(id: string, isArchived: boolean): Promise<Conversation | null> {
    // Assuming snake_case column 'is_archived'
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
    // Map DB response back to Conversation type
    return data ? mapToCamelCase(data) : null;
  }

  async markAsRead(id: string, userId: string): Promise<boolean> {
    // This requires updating a JSONB field (`unread_count`) for a specific key (`userId`).
    // This is often best done with an RPC function in Supabase for atomicity.
    // Example RPC function `mark_conversation_read(conv_id UUID, user_id_to_mark UUID)`
    // update conversations set unread_count = unread_count - user_id_to_mark where id = conv_id;
    // Or: update conversations set unread_count = jsonb_set(unread_count, '{user_id_to_mark}', '0'::jsonb) where id = conv_id;

    // Calling the hypothetical RPC function:
    const { error } = await supabase.rpc('mark_conversation_read', {
      conv_id: id,
      user_id_to_mark: userId,
    });

    if (error) {
      console.error(`Error marking conversation ${id} as read for user ${userId}:`, error);
      return false;
    }
    return true;
    // --- Alternative without RPC (less safe due to potential race conditions) ---
    // 1. Fetch the conversation
    // 2. Modify the unreadCount object in code
    // 3. Update the conversation with the modified object
    // This is generally not recommended for counters.
  }

  async updateLastActivityTimestamp(id: string, timestamp?: string): Promise<Conversation | null> {
     // Update 'last_activity' timestamp. If no specific timestamp is provided, use current time.
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
      console.error('Error updating last message timestamp:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    // Map DB response back to Conversation type
    return data ? mapToCamelCase(data) : null;
  }

  async incrementUnreadCount(id: string, userIdsToIncrement: string[]): Promise<boolean> {
    // Similar to markAsRead, this is best done with an RPC function for atomicity.
    // Example RPC function `increment_unread_counts(conv_id UUID, user_ids UUID[])`
    // This function would loop through user_ids and increment the count in the JSONB field.

    // Calling the hypothetical RPC function:
    const { error } = await supabase.rpc('increment_unread_counts', {
      conv_id: id,
      user_ids: userIdsToIncrement,
    });

    if (error) {
      console.error(`Error incrementing unread counts for conversation ${id}:`, error);
      return false;
    }
    return true;
  }

  // Implement other methods defined in IConversationRepository if any...
}
