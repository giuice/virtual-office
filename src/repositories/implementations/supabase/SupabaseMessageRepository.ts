// src/repositories/implementations/supabase/SupabaseMessageRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import { Message, FileAttachment, MessageReaction } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common'; // Assuming common types exist

export class SupabaseMessageRepository implements IMessageRepository {
  private MSG_TABLE_NAME = 'messages'; // Ensure this matches your Supabase table name
  private REACTION_TABLE_NAME = 'message_reactions'; // Assuming separate table
  private ATTACHMENT_TABLE_NAME = 'message_attachments'; // Assuming separate table

  async findById(id: string): Promise<Message | null> {
    const { data, error } = await supabase
      .from(this.MSG_TABLE_NAME)
      .select('*') // TODO: Select related reactions/attachments if needed
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching message by ID:', error);
      throw error;
    }
    // TODO: Fetch and merge reactions/attachments if stored separately
    // TODO: Map DB response (snake_case) to Message type (camelCase) if needed
    return data as Message | null;
  }

  async findByConversation(conversationId: string, options?: PaginationOptions): Promise<Message[]> {
    const limit = options?.limit ?? 50; // Default limit for messages
    // Supabase range is inclusive [from, to]
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    // Query messages for the conversation
    // Ordering by timestamp ascending to get oldest first for display
    const { data, error } = await supabase
      .from(this.MSG_TABLE_NAME)
      .select('*') // TODO: Select related reactions/attachments if needed
      .eq('conversation_id', conversationId) // Assuming snake_case
      .order('timestamp', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error fetching messages by conversation:', error);
      throw error;
    }

    // TODO: Fetch and merge reactions/attachments for each message if stored separately
    // TODO: Map DB response array if needed (snake_case to camelCase)
    return (data as Message[]) || [];
  }

  async create(messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>): Promise<Message> {
    // TODO: Map Message type (camelCase) to DB schema (snake_case) if needed
    const dbData = {
        conversation_id: messageData.conversationId,
        sender_id: messageData.senderId,
        content: messageData.content,
        type: messageData.type,
        status: messageData.status,
        reply_to_id: messageData.replyToId, // Assuming snake_case
        // timestamp handled by Supabase default value
        // reactions/attachments handled separately
        // is_edited defaults to false
    };

    const { data, error } = await supabase
      .from(this.MSG_TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating message:', error);
      throw error || new Error('Failed to create message or retrieve created data.');
    }
    // TODO: Map DB response back to Message type if needed
    // Initialize reactions/attachments as empty arrays for the returned object
    const createdMessage = data as Message;
    createdMessage.reactions = [];
    createdMessage.attachments = [];
    return createdMessage;
  }

  async update(id: string, updates: Partial<Pick<Message, 'content' | 'status' | 'isEdited'>>): Promise<Message | null> {
    // TODO: Map updates if needed (e.g., isEdited to is_edited)
    const dbUpdates: Record<string, any> = {};
    if (updates.content !== undefined) dbUpdates.content = updates.content;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.isEdited !== undefined) dbUpdates.is_edited = updates.isEdited; // Assuming snake_case

    if (Object.keys(dbUpdates).length === 0) {
        // If no fields to update, maybe fetch and return current? Or return null?
        // For now, fetch and return current state if no actual update fields provided.
        return this.findById(id);
    }

    const { data, error } = await supabase
      .from(this.MSG_TABLE_NAME)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating message:', error);
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    // TODO: Fetch and merge reactions/attachments if stored separately
    // TODO: Map DB response back to Message type if needed
    return data as Message | null;
  }

  async deleteById(id: string): Promise<boolean> {
    // Consider deleting related reactions/attachments as well (cascade or manual)
    const { error, count } = await supabase
      .from(this.MSG_TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting message:', error);
      return false;
    }
    // TODO: Delete related reactions/attachments
    return (count ?? 0) > 0;
  }

  // --- Attachment Methods ---

  async addAttachment(messageId: string, attachmentData: Omit<FileAttachment, 'id'>): Promise<FileAttachment> {
    const dbData = {
        message_id: messageId, // Foreign key
        name: attachmentData.name,
        type: attachmentData.type,
        size: attachmentData.size,
        url: attachmentData.url,
        thumbnail_url: attachmentData.thumbnailUrl, // Assuming snake_case
    };
    const { data, error } = await supabase
      .from(this.ATTACHMENT_TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error adding attachment:', error);
      throw error || new Error('Failed to add attachment or retrieve created data.');
    }
    // TODO: Map DB response back to FileAttachment type if needed
    return data as FileAttachment;
  }

  // --- Reaction Methods ---

  async addReaction(messageId: string, reactionData: Omit<MessageReaction, 'timestamp'>): Promise<MessageReaction> {
     // Use upsert to handle adding/removing reactions idempotently based on (message_id, user_id, emoji)
     // Requires a unique constraint on these columns in the DB.
     const dbData = {
        message_id: messageId,
        user_id: reactionData.userId, // Assuming snake_case
        emoji: reactionData.emoji,
        // timestamp handled by default value
     };
    const { data, error } = await supabase
      .from(this.REACTION_TABLE_NAME)
      .upsert(dbData, { onConflict: 'message_id, user_id, emoji' }) // Specify conflict target
      .select()
      .single();

     if (error || !data) {
      console.error('Error adding reaction:', error);
      throw error || new Error('Failed to add reaction or retrieve created data.');
    }
     // TODO: Map DB response back to MessageReaction type if needed
    return data as MessageReaction;
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const { error, count } = await supabase
      .from(this.REACTION_TABLE_NAME)
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId) // Assuming snake_case
      .eq('emoji', emoji);

    if (error) {
      console.error('Error removing reaction:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  async findReactions(messageId: string): Promise<MessageReaction[]> {
     const { data, error } = await supabase
      .from(this.REACTION_TABLE_NAME)
      .select('*')
      .eq('message_id', messageId);

    if (error) {
      console.error('Error fetching reactions:', error);
      throw error;
    }
    // TODO: Map DB response array if needed
    return (data as MessageReaction[]) || [];
  }
}