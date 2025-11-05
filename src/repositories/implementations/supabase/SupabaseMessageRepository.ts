// src/repositories/implementations/supabase/SupabaseMessageRepository.ts
import { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import { Message, FileAttachment, MessageReaction, MessageType, MessageStatus, ReadReceipt, MessagePin, MessageStar } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';
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

// Map DB snake_case to ReadReceipt type (camelCase)
function mapReadReceiptToCamelCase(data: { id: string; message_id: string; user_id: string; read_at: string }): ReadReceipt {
  if (!data) return data;
  return {
    id: data.id,
    messageId: data.message_id,
    userId: data.user_id,
    readAt: new Date(data.read_at)
  };
}

// Map DB snake_case to MessagePin type (camelCase)
function mapMessagePinToCamelCase(data: { id: string; message_id: string; user_id: string; pinned_at: string }): MessagePin {
  if (!data) return data;
  return {
    id: data.id,
    messageId: data.message_id,
    userId: data.user_id,
    pinnedAt: new Date(data.pinned_at)
  };
}

// Map DB snake_case to MessageStar type (camelCase)
function mapMessageStarToCamelCase(data: { id: string; message_id: string; user_id: string; starred_at: string }): MessageStar {
  if (!data) return data;
  return {
    id: data.id,
    messageId: data.message_id,
    userId: data.user_id,
    starredAt: new Date(data.starred_at)
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
function mapReadReceiptArrayToCamelCase(dataArray: { id: string; message_id: string; user_id: string; read_at: string }[]): ReadReceipt[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapReadReceiptToCamelCase(item));
}


export class SupabaseMessageRepository implements IMessageRepository {
  private MSG_TABLE_NAME = 'messages'; // Ensure this matches your Supabase table name
  private REACTION_TABLE_NAME = 'message_reactions'; // Assuming separate table
  private ATTACHMENT_TABLE_NAME = 'message_attachments'; // Assuming separate table
  private READ_RECEIPT_TABLE_NAME = 'message_read_receipts'; // Read receipts table
  private MESSAGE_PIN_TABLE_NAME = 'message_pins'; // Message pins table
  private MESSAGE_STAR_TABLE_NAME = 'message_stars'; // Message stars table
  private supabaseClient: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabaseClient = supabaseClient;
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

  async findByConversation(conversationId: string, options?: PaginationOptions): Promise<PaginatedResult<Message>> {
    const limit = options?.limit ?? 50; // Default limit for messages

    // Keyset pagination by timestamp when provided
    const hasCursorBefore = !!options?.cursorBefore;
    const hasCursorAfter = !!options?.cursorAfter;

    let data: any[] | null = null;
    let error: any | null = null;

    if (hasCursorBefore || hasCursorAfter) {
      // Use keyset pagination - fetch limit + 1 to check for more results
      let query = this.supabaseClient
        .from(this.MSG_TABLE_NAME)
        .select('*')
        .eq('conversation_id', conversationId);

      if (hasCursorBefore) {
        query = query.lt('timestamp', options!.cursorBefore!);
        // Get older messages relative to cursorBefore, newest-first to apply limit
        query = query.order('timestamp', { ascending: false }).limit(limit + 1);
      } else if (hasCursorAfter) {
        query = query.gt('timestamp', options!.cursorAfter!);
        // Get newer messages relative to cursorAfter, oldest-first for append
        query = query.order('timestamp', { ascending: true }).limit(limit + 1);
      }

      const res = await query;
      data = res.data as any[] | null;
      error = res.error;
      if (error) {
        console.error('Error fetching messages by conversation (keyset):', error);
        throw error;
      }
      // For cursorBefore branch, data is DESC; reverse to ASC for rendering
      if (hasCursorBefore && data) {
        data = [...data].reverse();
      }
    } else {
      // Initial load: fetch most recent messages, newest first
      const res = await this.supabaseClient
        .from(this.MSG_TABLE_NAME)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: false })
        .limit(limit + 1);
      data = res.data as any[] | null;
      error = res.error;
      if (error) {
        console.error('Error fetching messages by conversation (initial):', error);
        throw error;
      }
      // Reverse to oldest-first for UI rendering
      if (data) {
        data = [...data].reverse();
      }
    }

    if (!data || data.length === 0) {
      return {
        items: [],
        hasMore: false,
        nextCursor: null
      };
    }

    // Check if we have more results
    const hasMore = data.length > limit;
    // Trim to actual limit
    const trimmedData = hasMore ? data.slice(0, limit) : data;

    // Map core message data
    const messages = mapMessageArrayToCamelCase(trimmedData);
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

    // Determine nextCursor based on pagination type
    let nextCursor: string | number | null = null;
    if (hasMore) {
      if (hasCursorBefore || hasCursorAfter) {
        // For keyset pagination, use the timestamp of the last message
        const lastMessage = messages[messages.length - 1];
        nextCursor = lastMessage.timestamp.toISOString();
      } else {
        // For offset pagination, use the next offset
        const currentOffset = typeof options?.cursor === 'number' ? options.cursor : 0;
        nextCursor = currentOffset + limit;
      }
    }

    return {
      items: messages,
      hasMore,
      nextCursor
    };
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

  // --- Read Receipt Methods ---

  async addReadReceipt(messageId: string, userId: string, readAt?: Date): Promise<ReadReceipt> {
    const dbData = {
      message_id: messageId,
      user_id: userId,
      read_at: readAt ? readAt.toISOString() : new Date().toISOString()
    };

    const { data, error } = await this.supabaseClient
      .from(this.READ_RECEIPT_TABLE_NAME)
      .upsert(dbData, { onConflict: 'message_id, user_id' })
      .select()
      .single();

    if (error || !data) {
      console.error('Error adding read receipt:', error);
      throw error || new Error('Failed to add read receipt or retrieve created data.');
    }

    return mapReadReceiptToCamelCase(data);
  }

  async getReadReceipts(messageId: string): Promise<ReadReceipt[]> {
    const { data, error } = await this.supabaseClient
      .from(this.READ_RECEIPT_TABLE_NAME)
      .select('*')
      .eq('message_id', messageId)
      .order('read_at', { ascending: false });

    if (error) {
      console.error('Error fetching read receipts:', error);
      throw error;
    }

    return mapReadReceiptArrayToCamelCase(data || []);
  }

  async getUnreadMessages(conversationId: string, userId: string, since?: Date): Promise<Message[]> {
    // Get all messages in the conversation
    let query = this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (since) {
      query = query.gt('timestamp', since.toISOString());
    }

    const { data: messagesData, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching messages for unread check:', messagesError);
      throw messagesError;
    }

    if (!messagesData || messagesData.length === 0) {
      return [];
    }

    // Get message IDs
    const messageIds = messagesData.map((m: any) => m.id);

    // Get read receipts for this user
    const { data: receiptsData, error: receiptsError } = await this.supabaseClient
      .from(this.READ_RECEIPT_TABLE_NAME)
      .select('message_id')
      .in('message_id', messageIds)
      .eq('user_id', userId);

    if (receiptsError) {
      console.error('Error fetching read receipts for unread check:', receiptsError);
      throw receiptsError;
    }

    // Create a set of read message IDs
    const readMessageIds = new Set((receiptsData || []).map((r: any) => r.message_id));

    // Filter to only unread messages
    const unreadMessagesData = messagesData.filter((m: any) => !readMessageIds.has(m.id));

    // Map to Message objects
    const messages = mapMessageArrayToCamelCase(unreadMessagesData);

    // Fetch attachments and reactions for unread messages (similar to findByConversation)
    if (messages.length > 0) {
      const unreadMessageIds = messages.map(m => m.id);

      // Fetch attachments
      const { data: attachmentsData } = await this.supabaseClient
        .from(this.ATTACHMENT_TABLE_NAME)
        .select('*')
        .in('message_id', unreadMessageIds);

      type AttachmentRow = { id: string; message_id: string; name: string; type: string; size: number; url: string; thumbnail_url?: string | null };
      const attachmentsByMessageId = (attachmentsData as AttachmentRow[] | null || []).reduce((acc: Record<string, FileAttachment[]>, row: AttachmentRow) => {
        const msgId = row.message_id as string;
        if (!acc[msgId]) acc[msgId] = [];
        acc[msgId].push(mapAttachmentToCamelCase(row));
        return acc;
      }, {} as Record<string, FileAttachment[]>);

      // Fetch reactions
      const { data: reactionsData } = await this.supabaseClient
        .from(this.REACTION_TABLE_NAME)
        .select('*')
        .in('message_id', unreadMessageIds);

      type ReactionRow = { message_id: string; user_id: string; emoji: string; timestamp: string };
      const reactionsByMessageId = (reactionsData as ReactionRow[] | null || []).reduce((acc: Record<string, MessageReaction[]>, row: ReactionRow) => {
        const msgId = row.message_id as string;
        if (!acc[msgId]) acc[msgId] = [];
        acc[msgId].push(mapReactionToCamelCase(row));
        return acc;
      }, {} as Record<string, MessageReaction[]>);

      // Populate messages with attachments and reactions
      messages.forEach(message => {
        message.attachments = attachmentsByMessageId[message.id] || [];
        message.reactions = reactionsByMessageId[message.id] || [];
      });
    }

    return messages;
  }

  // --- Message Pin Methods ---

  async pinMessage(messageId: string, userId: string): Promise<MessagePin> {
    const dbData = {
      message_id: messageId,
      user_id: userId,
      pinned_at: new Date().toISOString()
    };

    const { data, error } = await this.supabaseClient
      .from(this.MESSAGE_PIN_TABLE_NAME)
      .upsert(dbData, { onConflict: 'message_id, user_id' })
      .select()
      .single();

    if (error || !data) {
      console.error('Error pinning message:', error);
      throw error || new Error('Failed to pin message or retrieve created data.');
    }

    return mapMessagePinToCamelCase(data);
  }

  async unpinMessage(messageId: string, userId: string): Promise<boolean> {
    const { error, count } = await this.supabaseClient
      .from(this.MESSAGE_PIN_TABLE_NAME)
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error unpinning message:', error);
      return false;
    }

    return (count ?? 0) > 0;
  }

  async getPinnedMessages(conversationId: string, userId: string): Promise<Message[]> {
    // First, get the pinned message IDs for this user in this conversation
    const { data: pinsData, error: pinsError } = await this.supabaseClient
      .from(this.MESSAGE_PIN_TABLE_NAME)
      .select('message_id')
      .eq('user_id', userId);

    if (pinsError) {
      console.error('Error fetching pinned message IDs:', pinsError);
      throw pinsError;
    }

    if (!pinsData || pinsData.length === 0) {
      return [];
    }

    const pinnedMessageIds = pinsData.map((p: any) => p.message_id);

    // Fetch the actual messages
    const { data: messagesData, error: messagesError } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .select('*')
      .eq('conversation_id', conversationId)
      .in('id', pinnedMessageIds)
      .order('timestamp', { ascending: false });

    if (messagesError) {
      console.error('Error fetching pinned messages:', messagesError);
      throw messagesError;
    }

    if (!messagesData || messagesData.length === 0) {
      return [];
    }

    // Map to Message objects
    const messages = mapMessageArrayToCamelCase(messagesData);
    const messageIds = messages.map(m => m.id);

    // Fetch attachments and reactions (similar to findByConversation)
    const { data: attachmentsData } = await this.supabaseClient
      .from(this.ATTACHMENT_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

    type AttachmentRow = { id: string; message_id: string; name: string; type: string; size: number; url: string; thumbnail_url?: string | null };
    const attachmentsByMessageId = (attachmentsData as AttachmentRow[] | null || []).reduce((acc: Record<string, FileAttachment[]>, row: AttachmentRow) => {
      const msgId = row.message_id as string;
      if (!acc[msgId]) acc[msgId] = [];
      acc[msgId].push(mapAttachmentToCamelCase(row));
      return acc;
    }, {} as Record<string, FileAttachment[]>);

    const { data: reactionsData } = await this.supabaseClient
      .from(this.REACTION_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

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

  // --- Message Star Methods ---

  async starMessage(messageId: string, userId: string): Promise<MessageStar> {
    const dbData = {
      message_id: messageId,
      user_id: userId,
      starred_at: new Date().toISOString()
    };

    const { data, error } = await this.supabaseClient
      .from(this.MESSAGE_STAR_TABLE_NAME)
      .upsert(dbData, { onConflict: 'message_id, user_id' })
      .select()
      .single();

    if (error || !data) {
      console.error('Error starring message:', error);
      throw error || new Error('Failed to star message or retrieve created data.');
    }

    return mapMessageStarToCamelCase(data);
  }

  async unstarMessage(messageId: string, userId: string): Promise<boolean> {
    const { error, count } = await this.supabaseClient
      .from(this.MESSAGE_STAR_TABLE_NAME)
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error unstarring message:', error);
      return false;
    }

    return (count ?? 0) > 0;
  }

  async getStarredMessages(userId: string, conversationId?: string): Promise<Message[]> {
    // First, get the starred message IDs for this user
    const { data: starsData, error: starsError } = await this.supabaseClient
      .from(this.MESSAGE_STAR_TABLE_NAME)
      .select('message_id')
      .eq('user_id', userId)
      .order('starred_at', { ascending: false });

    if (starsError) {
      console.error('Error fetching starred message IDs:', starsError);
      throw starsError;
    }

    if (!starsData || starsData.length === 0) {
      return [];
    }

    const starredMessageIds = starsData.map((s: any) => s.message_id);

    // Fetch the actual messages
    let query = this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .select('*')
      .in('id', starredMessageIds);

    // Filter by conversation if specified
    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    query = query.order('timestamp', { ascending: false });

    const { data: messagesData, error: messagesError } = await query;

    if (messagesError) {
      console.error('Error fetching starred messages:', messagesError);
      throw messagesError;
    }

    if (!messagesData || messagesData.length === 0) {
      return [];
    }

    // Map to Message objects
    const messages = mapMessageArrayToCamelCase(messagesData);
    const messageIds = messages.map(m => m.id);

    // Fetch attachments and reactions
    const { data: attachmentsData } = await this.supabaseClient
      .from(this.ATTACHMENT_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

    type AttachmentRow = { id: string; message_id: string; name: string; type: string; size: number; url: string; thumbnail_url?: string | null };
    const attachmentsByMessageId = (attachmentsData as AttachmentRow[] | null || []).reduce((acc: Record<string, FileAttachment[]>, row: AttachmentRow) => {
      const msgId = row.message_id as string;
      if (!acc[msgId]) acc[msgId] = [];
      acc[msgId].push(mapAttachmentToCamelCase(row));
      return acc;
    }, {} as Record<string, FileAttachment[]>);

    const { data: reactionsData } = await this.supabaseClient
      .from(this.REACTION_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

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
}
