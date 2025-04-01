// src/repositories/implementations/supabase/SupabaseConversationRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IConversationRepository } from '@/repositories/interfaces/IConversationRepository';
import { Conversation } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';

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
    // TODO: Map DB response (snake_case) to Conversation type (camelCase) if needed
    return data as Conversation | null;
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

    const items = (data as Conversation[]) || [];
    const nextCursor = items.length === limit ? to + 1 : null; // Calculate next cursor/offset

    // TODO: Map DB response array if needed (snake_case to camelCase)

    return {
      items: items,
      nextCursor: nextCursor,
      hasMore: nextCursor !== null,
      totalCount: count ?? undefined, // Use the exact count if available
    };
  }

  async create(conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'>): Promise<Conversation> {
     // TODO: Map Conversation type (camelCase) to DB schema (snake_case) if needed
     const dbData = {
        type: conversationData.type,
        participants: conversationData.participants,
        name: conversationData.name, // Optional field
        is_archived: conversationData.isArchived, // Assuming snake_case
        room_id: conversationData.roomId, // Assuming snake_case
        // last_activity, created_at, updated_at handled by Supabase defaults/triggers
        // unread_count initialized by default or trigger
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
     // TODO: Map DB response back to Conversation type if needed
    return data as Conversation;
  }

  async update(id: string, updates: Partial<Pick<Conversation, 'name'>>): Promise<Conversation | null> {
    // Only allowing 'name' update for now based on interface correction
    // TODO: Map updates if needed (e.g., name to name)
    const dbUpdates = { ...updates };

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
    // TODO: Map DB response back to Conversation type if needed
    return data as Conversation | null;
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
    // TODO: Map DB response back to Conversation type if needed
    return data as Conversation | null;
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

  async updateLastMessageTimestamp(id: string, lastMessageTimestamp: string): Promise<Conversation | null> {
     // Assuming snake_case column 'last_message_timestamp'
     // Also update 'last_activity' at the same time
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update({
          last_message_timestamp: lastMessageTimestamp,
          last_activity: new Date().toISOString() // Update general activity timestamp too
       })
      .eq('id', id)
      .select()
      .single();

     if (error) {
      console.error('Error updating last message timestamp:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    // TODO: Map DB response back to Conversation type if needed
    return data as Conversation | null;
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