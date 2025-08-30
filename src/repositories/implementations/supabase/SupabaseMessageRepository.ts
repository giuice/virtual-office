// src/repositories/implementations/supabase/SupabaseMessageRepository.ts
import { supabase } from '@/lib/supabase/client';
import { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import { Message, FileAttachment, MessageReaction, MessageType, MessageStatus } from '@/types/messaging';
import { PaginationOptions } from '@/types/common'; // Assuming common types exist
import { SupabaseClient } from '@supabase/supabase-js';

// --- Helper Functions ---

// Map DB snake_case to Message type (camelCase)
// Note: attachments and reactions are handled separately or fetched later
type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  timestamp: string;
  type: string;
  status: string;
  reply_to_id: string | null;
  is_edited: boolean;
};
function mapMessageToCamelCase(data: MessageRow): Message {
  if (!data) return data;
  return {
    id: data.id,
    conversationId: data.conversation_id,
    senderId: data.sender_id,
    content: data.content,
    timestamp: new Date(data.timestamp), // Convert DB timestamp string/obj to Date
    type: data.type as MessageType,
    status: data.status as MessageStatus,
  replyToId: data.reply_to_id || undefined,
    isEdited: data.is_edited,
    attachments: [], // Placeholder - fetch separately
    reactions: []    // Placeholder - fetch separately
  };
}

// Map DB snake_case to FileAttachment type (camelCase)
function mapAttachmentToCamelCase(data: { id: string; name: string; type: string; size: number; url: string; thumbnail_url?: string | null }): FileAttachment {
    if (!data) return data;
    return {
        id: data.id,
        name: data.name,
        type: data.type,
        size: data.size,
        url: data.url,
  thumbnailUrl: data.thumbnail_url || undefined
    };
}

// Map DB snake_case to MessageReaction type (camelCase)
function mapReactionToCamelCase(data: { emoji: string; user_id: string; timestamp: string }): MessageReaction {
    if (!data) return data;
    return {
        // Assuming reaction table doesn't have its own ID in the type, or map data.id if it does
        emoji: data.emoji,
        userId: data.user_id,
        timestamp: new Date(data.timestamp) // Convert DB timestamp string/obj to Date
    };
}

// Map array helpers
function mapMessageArrayToCamelCase(dataArray: MessageRow[]): Message[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapMessageToCamelCase(item));
}
function mapAttachmentArrayToCamelCase(dataArray: { id: string; name: string; type: string; size: number; url: string; thumbnail_url?: string | null }[]): FileAttachment[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapAttachmentToCamelCase(item));
}
function mapReactionArrayToCamelCase(dataArray: { emoji: string; user_id: string; timestamp: string }[]): MessageReaction[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapReactionToCamelCase(item));
}


export class SupabaseMessageRepository implements IMessageRepository {
  private MSG_TABLE_NAME = 'messages'; // Ensure this matches your Supabase table name
  private REACTION_TABLE_NAME = 'message_reactions'; // Assuming separate table
  private ATTACHMENT_TABLE_NAME = 'message_attachments'; // Assuming separate table
  private supabaseClient: SupabaseClient;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabaseClient = supabaseClient || supabase;
  }

  async findById(id: string): Promise<Message | null> {
    const { data, error } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .select('*') // TODO: Select related reactions/attachments if needed
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching message by ID:', error);
      throw error;
    }

    if (!data) {
      return null;
    }

    // Map the core message data
    const message = mapMessageToCamelCase(data);

    // Fetch related attachments
    const { data: attachmentsData, error: attachmentsError } = await this.supabaseClient
      .from(this.ATTACHMENT_TABLE_NAME)
      .select('*')
      .eq('message_id', message.id);

    if (attachmentsError) {
      console.error(`Error fetching attachments for message ID ${message.id}:`, attachmentsError);
      // Decide if you want to throw or return message without attachments
      // For now, return message with empty attachments array on error
      message.attachments = [];
    } else {
      message.attachments = mapAttachmentArrayToCamelCase(attachmentsData || []);
    }

    // Fetch related reactions
    const { data: reactionsData, error: reactionsError } = await this.supabaseClient
      .from(this.REACTION_TABLE_NAME)
      .select('*')
      .eq('message_id', message.id);

    if (reactionsError) {
      console.error(`Error fetching reactions for message ID ${message.id}:`, reactionsError);
      // Return message with empty reactions array on error
      message.reactions = [];
    } else {
      message.reactions = mapReactionArrayToCamelCase(reactionsData || []);
    }

    return message;
  }

  async findByConversation(conversationId: string, options?: PaginationOptions): Promise<Message[]> {
    const limit = options?.limit ?? 50; // Default limit for messages
    // Supabase range is inclusive [from, to]
    const from = typeof options?.cursor === 'number' ? options.cursor : 0;
    const to = from + limit - 1;

    // Query messages for the conversation
    // Ordering by timestamp ascending to get oldest first for display
    const { data, error } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .select('*') // TODO: Select related reactions/attachments if needed
      .eq('conversation_id', conversationId) // Assuming snake_case
      .order('timestamp', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error fetching messages by conversation:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Map core message data
    const messages = mapMessageArrayToCamelCase(data);
    const messageIds = messages.map(m => m.id);

    // Fetch all attachments for these messages in bulk
    const { data: attachmentsData, error: attachmentsError } = await this.supabaseClient
      .from(this.ATTACHMENT_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

    if (attachmentsError) {
      console.error(`Error fetching attachments for conversation ${conversationId}:`, attachmentsError);
      // Continue without attachments if error occurs
    }
    // Group attachments by message_id using raw rows, then map
    type AttachmentRow = { id: string; message_id: string; name: string; type: string; size: number; url: string; thumbnail_url?: string | null };
    const attachmentsByMessageId = (attachmentsData as AttachmentRow[] | null || []).reduce((acc: Record<string, FileAttachment[]>, row: AttachmentRow) => {
      const msgId = row.message_id as string;
      if (!acc[msgId]) acc[msgId] = [];
      acc[msgId].push(mapAttachmentToCamelCase(row));
      return acc;
    }, {} as Record<string, FileAttachment[]>);

    // Fetch all reactions for these messages in bulk
    const { data: reactionsData, error: reactionsError } = await this.supabaseClient
      .from(this.REACTION_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

     if (reactionsError) {
      console.error(`Error fetching reactions for conversation ${conversationId}:`, reactionsError);
      // Continue without reactions if error occurs
    }
    type ReactionRow = { message_id: string; user_id: string; emoji: string; timestamp: string };
    const reactionsByMessageId = (reactionsData as ReactionRow[] | null || []).reduce((acc: Record<string, MessageReaction[]>, row: ReactionRow) => {
      const msgId = row.message_id as string;
      if (!acc[msgId]) acc[msgId] = [];
      acc[msgId].push(mapReactionToCamelCase(row));
      return acc;
    }, {} as Record<string, MessageReaction[]>);


    messages.forEach(message => {
  message.attachments = attachmentsByMessageId[message.id] || [];
  message.reactions = reactionsByMessageId[message.id] || [];
    });

    return messages;
  }

  // Note: Input timestamp is Date object, Supabase handles conversion to TIMESTAMPTZ
  async create(messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>): Promise<Message> {
    // Map Message type (camelCase) to DB schema (snake_case)
    const dbData = {
        conversation_id: messageData.conversationId,
        sender_id: messageData.senderId,
        content: messageData.content,
        type: messageData.type,
        status: messageData.status,
        reply_to_id: messageData.replyToId,
        // timestamp handled by Supabase default value
        // reactions/attachments handled separately
        // is_edited defaults to false
    };

    const { data, error } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating message:', error);
      throw error || new Error('Failed to create message or retrieve created data.');
    }
    // Map DB response back to Message type
    // Initialize reactions/attachments as empty arrays (will be populated later if needed)
    const createdMessage = mapMessageToCamelCase(data);
    // Ensure these arrays exist even if mapping doesn't add them
    createdMessage.reactions = createdMessage.reactions || [];
    createdMessage.attachments = createdMessage.attachments || [];
    return createdMessage;
  }

  async update(id: string, updates: Partial<Pick<Message, 'content' | 'status' | 'isEdited'>>): Promise<Message | null> {
    // Map updates from camelCase to snake_case
  const dbUpdates: Partial<{ content: string; status: MessageStatus; is_edited: boolean }> = {};
    if (updates.content !== undefined) dbUpdates.content = updates.content;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.isEdited !== undefined) dbUpdates.is_edited = updates.isEdited;

    if (Object.keys(dbUpdates).length === 0) {
        // If no fields to update, maybe fetch and return current? Or return null?
        // For now, fetch and return current state if no actual update fields provided.
        return this.findById(id);
    }

    const { data, error } = await this.supabaseClient
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
    // Map DB response back to Message type
    // Note: attachments/reactions won't be populated here, similar to findById pre-fetch
    const updatedMessage = data ? mapMessageToCamelCase(data) : null;
    if (updatedMessage) {
        // Fetch related data if needed, or rely on caller to re-fetch if necessary
        // For simplicity, returning core message data only after update.
        updatedMessage.attachments = []; // Reset placeholders
        updatedMessage.reactions = [];
    }
    return updatedMessage;
  }

  async deleteById(id: string): Promise<boolean> {
    // Consider deleting related reactions/attachments as well (cascade or manual)
    const { error, count } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting message:', error);
      return false;
    }
    // TODO: Delete related reactions/attachments (or rely on DB cascade delete)
    return (count ?? 0) > 0;
  }

  // --- Attachment Methods ---

  // --- Attachment Methods ---

  async addAttachment(messageId: string, attachmentData: Omit<FileAttachment, 'id'>): Promise<FileAttachment> {
    // Map camelCase to snake_case
    const dbData = {
        message_id: messageId,
        name: attachmentData.name,
        type: attachmentData.type,
        size: attachmentData.size,
        url: attachmentData.url,
        thumbnail_url: attachmentData.thumbnailUrl,
    };
    const { data, error } = await this.supabaseClient
      .from(this.ATTACHMENT_TABLE_NAME)
      .insert(dbData)
      .select()
      .single();

    if (error || !data) {
      console.error('Error adding attachment:', error);
      throw error || new Error('Failed to add attachment or retrieve created data.');
    }
    // Map DB response back to FileAttachment type
    return mapAttachmentToCamelCase(data);
  }

  // --- Reaction Methods ---

  // --- Reaction Methods ---

  // Note: Input timestamp is Date object, Supabase handles conversion
  async addReaction(messageId: string, reactionData: Omit<MessageReaction, 'timestamp'>): Promise<MessageReaction> {
     // Map camelCase to snake_case
     const dbData = {
        message_id: messageId,
        user_id: reactionData.userId,
        emoji: reactionData.emoji,
        // timestamp handled by default value
     };
    const { data, error } = await this.supabaseClient
      .from(this.REACTION_TABLE_NAME)
      .upsert(dbData, { onConflict: 'message_id, user_id, emoji' }) // Specify conflict target
      .select()
      .single();

     if (error || !data) {
      console.error('Error adding reaction:', error);
      throw error || new Error('Failed to add reaction or retrieve created data.');
    }
     // Map DB response back to MessageReaction type
    return mapReactionToCamelCase(data);
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    // Map camelCase input to snake_case query
    const { error, count } = await this.supabaseClient
      .from(this.REACTION_TABLE_NAME)
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji);

    if (error) {
      console.error('Error removing reaction:', error);
      return false;
    }
    return (count ?? 0) > 0;
  }

  async findReactions(messageId: string): Promise<MessageReaction[]> {
     const { data, error } = await this.supabaseClient
      .from(this.REACTION_TABLE_NAME)
      .select('*')
      .eq('message_id', messageId);

    if (error) {
      console.error('Error fetching reactions:', error);
      throw error;
    }
    // Map DB response array
    return mapReactionArrayToCamelCase(data || []);
  }
}
