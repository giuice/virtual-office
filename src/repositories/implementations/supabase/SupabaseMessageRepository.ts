// src/repositories/implementations/supabase/SupabaseMessageRepository.ts
import { IMessageRepository } from '@/repositories/interfaces/IMessageRepository';
import { Message, FileAttachment, VoiceNoteAttachment, MessageReaction, MessageType, MessageStatus, MessageReader, MessagePin, MessageStar, MessageCreateResult } from '@/types/messaging';
import { toVoiceNoteWaveform } from '@/lib/messaging/attachment-policy';
import { PaginationOptions, PaginatedResult } from '@/types/common';
import { SupabaseClient } from '@supabase/supabase-js';

// --- Helper Functions ---

// Composite keyset cursor "{raw_pg_timestamp}|{id}" (audit M-03). The raw
// Postgres timestamp keeps microsecond precision; the id breaks ties between
// equal timestamps. Legacy timestamp-only cursors parse with id = null.
function buildCompositeCursor(row: { timestamp: string; id: string }): string {
  return `${row.timestamp}|${row.id}`;
}

function parseCompositeCursor(cursor: string): { ts: string; id: string | null } {
  const sep = cursor.indexOf('|');
  if (sep === -1) {
    return { ts: cursor, id: null };
  }
  return { ts: cursor.slice(0, sep), id: cursor.slice(sep + 1) };
}

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

interface AttachmentFields {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnail_url?: string | null;
  // Voice notes (Phase 4 T15).
  duration?: number | null;
  waveform_data?: unknown;
}

// Map DB snake_case to FileAttachment type (camelCase); voice notes also
// carry duration and waveformData (VoiceNoteAttachment).
function mapAttachmentToCamelCase(data: AttachmentFields): FileAttachment | VoiceNoteAttachment {
  if (!data) return data;
  // Audit S-03: the bucket is private and `url` stores the storage path —
  // expose the authz'd API route, which redirects to a signed URL. Legacy
  // rows holding a full URL pass through (migration rewrites them to paths).
  const isStoragePath = (value: string): boolean => !value.startsWith('http') && !value.startsWith('/');
  const thumbnail = data.thumbnail_url || undefined;
  const attachment: FileAttachment = {
    id: data.id,
    name: data.name,
    type: data.type,
    size: data.size,
    url: isStoragePath(data.url) ? `/api/messages/attachment/${data.id}` : data.url,
    thumbnailUrl: thumbnail && isStoragePath(thumbnail) ? `/api/messages/attachment/${data.id}` : thumbnail
  };
  if (typeof data.duration === 'number') {
    return { ...attachment, duration: data.duration, waveformData: toVoiceNoteWaveform(data.waveform_data) ?? undefined };
  }
  return attachment;
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

// Map DB snake_case to MessagePin type (camelCase)
function mapMessagePinToCamelCase(data: { id: string; message_id: string; conversation_id: string; pinned_by: string; pinned_at: string }): MessagePin {
  if (!data) return data;
  return {
    id: data.id,
    messageId: data.message_id,
    conversationId: data.conversation_id,
    userId: data.pinned_by, // mapped from pinned_by
    pinnedAt: new Date(data.pinned_at)
  };
}

// Map DB snake_case to MessageStar type (camelCase)
function mapMessageStarToCamelCase(data: { id: string; message_id: string; conversation_id: string; user_id: string; starred_at: string }): MessageStar {
  if (!data) return data;
  return {
    id: data.id,
    messageId: data.message_id,
    conversationId: data.conversation_id,
    userId: data.user_id,
    starredAt: new Date(data.starred_at)
  };
}

// Map array helpers
type MessageCreateData = Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'>;

// Map Message type (camelCase) to DB schema (snake_case) for INSERT.
// timestamp, id and is_edited use their column defaults; reactions and
// attachments live in their own tables.
function toMessageInsertRow(messageData: MessageCreateData) {
  return {
    conversation_id: messageData.conversationId,
    sender_id: messageData.senderId,
    content: messageData.content,
    type: messageData.type,
    status: messageData.status,
    reply_to_id: messageData.replyToId,
  };
}

function mapCreatedMessage(row: MessageRow): Message {
  const message = mapMessageToCamelCase(row);
  message.reactions = message.reactions || [];
  message.attachments = message.attachments || [];
  return message;
}

// unique_violation. On a keyed insert the only reachable unique index is
// messages_sender_conversation_client_message_id_key (id is defaulted); the
// caller confirms by reading the winning row and rethrows if there is none.
function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === '23505';
}

function mapMessageArrayToCamelCase(dataArray: MessageRow[]): Message[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapMessageToCamelCase(item));
}
function mapAttachmentArrayToCamelCase(dataArray: AttachmentFields[]): FileAttachment[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapAttachmentToCamelCase(item));
}
function mapReactionArrayToCamelCase(dataArray: { emoji: string; user_id: string; timestamp: string }[]): MessageReaction[] {
  if (!dataArray) return [];
  return dataArray.map(item => mapReactionToCamelCase(item));
}

type AttachmentRow = AttachmentFields & { message_id: string };
type ReactionRow = { message_id: string; user_id: string; emoji: string; timestamp: string };
type MessagePinRow = { id: string; message_id: string; conversation_id: string; pinned_by: string; pinned_at: string };
type MessageStarRow = { id: string; message_id: string; conversation_id: string; user_id: string; starred_at: string };
type MessageReaderRow = {
  user_id: string;
  read_at: string;
  reader: { display_name: string | null; avatar_url: string | null } | null;
};


export class SupabaseMessageRepository implements IMessageRepository {
  private MSG_TABLE_NAME = 'messages'; // Ensure this matches your Supabase table name
  private REACTION_TABLE_NAME = 'message_reactions'; // Assuming separate table
  private ATTACHMENT_TABLE_NAME = 'message_attachments'; // Assuming separate table
  private READ_RECEIPT_TABLE_NAME = 'message_read_receipts'; // Read receipts table
  private MESSAGE_PIN_TABLE_NAME = 'pinned_messages'; // Message pins table
  private MESSAGE_STAR_TABLE_NAME = 'starred_messages'; // Message stars table
  private supabaseClient: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabaseClient = supabaseClient;
  }

  private async enrichMessages(messages: Message[]): Promise<Message[]> {
    if (messages.length === 0) {
      return messages;
    }

    const messageIds = messages.map(m => m.id);

    const { data: attachmentsData } = await this.supabaseClient
      .from(this.ATTACHMENT_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

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

  // Full feed enrichment shared by the paginated feed and the starred list
  // (Phase 4 FR-021): attachments, reactions, pins, the viewer's stars
  // (star RLS returns only the caller's own rows), readCount and the derived
  // READ status. Routes still strip readCount from messages the viewer did
  // not send (FR-003).
  private async enrichFeedMessages(messages: Message[], conversationId: string): Promise<Message[]> {
    if (messages.length === 0) {
      return messages;
    }

    const messageIds = messages.map(m => m.id);
    const enrichedMessages = await this.enrichMessages(messages);

    // Fetch all pins for these messages in bulk
    const { data: pinsData, error: pinsError } = await this.supabaseClient
      .from(this.MESSAGE_PIN_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

    if (pinsError) {
      console.error(`Error fetching pins for conversation ${conversationId}:`, pinsError);
    }
    const pinsByMessageId = (pinsData as MessagePinRow[] | null || []).reduce((acc: Record<string, MessagePin[]>, row: MessagePinRow) => {
      const msgId = row.message_id;
      if (!acc[msgId]) acc[msgId] = [];
      acc[msgId].push(mapMessagePinToCamelCase(row));
      return acc;
    }, {} as Record<string, MessagePin[]>);

    // Fetch all stars for these messages in bulk
    const { data: starsData, error: starsError } = await this.supabaseClient
      .from(this.MESSAGE_STAR_TABLE_NAME)
      .select('*')
      .in('message_id', messageIds);

    if (starsError) {
      console.error(`Error fetching stars for conversation ${conversationId}:`, starsError);
    }
    const starsByMessageId = (starsData as MessageStarRow[] | null || []).reduce((acc: Record<string, MessageStar[]>, row: MessageStarRow) => {
      const msgId = row.message_id;
      if (!acc[msgId]) acc[msgId] = [];
      acc[msgId].push(mapMessageStarToCamelCase(row));
      return acc;
    }, {} as Record<string, MessageStar[]>);

    // Audit B-05/Phase 2.2: messages.status is frozen at 'sent' in the DB;
    // the read indicator derives from message_read_receipts. Rule: read if
    // ANY non-sender receipt exists (receipts are only ever written for
    // non-senders). Phase 4 FR-001: readCount is the number of distinct
    // non-sender readers ("Lida por N"); (message_id, user_id) is unique, so
    // counting rows counts readers. Receipt RLS returns every reader's row
    // only to the message's sender (anyone else sees just their own), so the
    // count is exact for the viewer's own messages — the only ones it is
    // shown on.
    const { data: receiptsData, error: receiptsError } = await this.supabaseClient
      .from(this.READ_RECEIPT_TABLE_NAME)
      .select('message_id, user_id')
      .in('message_id', messageIds);

    if (receiptsError) {
      console.error(`Error fetching read receipts for conversation ${conversationId}:`, receiptsError);
    }
    const senderByMessageId = new Map(enrichedMessages.map(message => [message.id, message.senderId]));
    const readCountByMessageId = new Map<string, number>();
    for (const row of (receiptsData || []) as Array<{ message_id: string; user_id: string }>) {
      if (row.user_id === senderByMessageId.get(row.message_id)) continue;
      readCountByMessageId.set(row.message_id, (readCountByMessageId.get(row.message_id) ?? 0) + 1);
    }

    enrichedMessages.forEach(message => {
      message.pins = pinsByMessageId[message.id] || [];
      message.stars = starsByMessageId[message.id] || [];
      message.readCount = readCountByMessageId.get(message.id) ?? 0;
      if (message.readCount > 0 && message.status !== MessageStatus.FAILED) {
        message.status = MessageStatus.READ;
      }
    });

    return enrichedMessages;
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

    const [
      { data: attachmentsData, error: attachmentsError },
      { data: reactionsData, error: reactionsError },
      { data: pinsData, error: pinsError },
      { data: starsData, error: starsError }
    ] = await Promise.all([
      this.supabaseClient
        .from(this.ATTACHMENT_TABLE_NAME)
        .select('*')
        .eq('message_id', message.id),
      this.supabaseClient
        .from(this.REACTION_TABLE_NAME)
        .select('*')
        .eq('message_id', message.id),
      this.supabaseClient
        .from(this.MESSAGE_PIN_TABLE_NAME)
        .select('*')
        .eq('message_id', message.id),
      this.supabaseClient
        .from(this.MESSAGE_STAR_TABLE_NAME)
        .select('*')
        .eq('message_id', message.id)
    ]);

    if (attachmentsError) {
      console.error(`Error fetching attachments for message ID ${message.id}:`, attachmentsError);
      // Decide if you want to throw or return message without attachments
      // For now, return message with empty attachments array on error
      message.attachments = [];
    } else {
      message.attachments = mapAttachmentArrayToCamelCase(attachmentsData || []);
    }

    if (reactionsError) {
      console.error(`Error fetching reactions for message ID ${message.id}:`, reactionsError);
      // Return message with empty reactions array on error
      message.reactions = [];
    } else {
      message.reactions = mapReactionArrayToCamelCase(reactionsData || []);
    }

    if (pinsError) {
      console.error(`Error fetching pins for message ID ${message.id}:`, pinsError);
      message.pins = [];
    } else {
      // Map pins
      message.pins = (pinsData as MessagePinRow[] | null || []).map((p: MessagePinRow) => mapMessagePinToCamelCase(p));
    }

    if (starsError) {
      console.error(`Error fetching stars for message ID ${message.id}:`, starsError);
      message.stars = [];
    } else {
      // Map stars
      message.stars = (starsData as MessageStarRow[] | null || []).map((s: MessageStarRow) => mapMessageStarToCamelCase(s));
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
      // Use keyset pagination - fetch limit + 1 to check for more results.
      // Audit M-03: composite (timestamp, id) cursor so equal timestamps
      // cannot skip or duplicate rows across pages. Legacy timestamp-only
      // cursors are still accepted.
      let query = this.supabaseClient
        .from(this.MSG_TABLE_NAME)
        .select('*')
        .eq('conversation_id', conversationId);

      if (hasCursorBefore) {
        const { ts, id } = parseCompositeCursor(options!.cursorBefore!);
        query = id
          ? query.or(`timestamp.lt."${ts}",and(timestamp.eq."${ts}",id.lt."${id}")`)
          : query.lt('timestamp', ts);
        // Get older messages relative to cursorBefore, newest-first to apply limit
        query = query
          .order('timestamp', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit + 1);
      } else if (hasCursorAfter) {
        const { ts, id } = parseCompositeCursor(options!.cursorAfter!);
        query = id
          ? query.or(`timestamp.gt."${ts}",and(timestamp.eq."${ts}",id.gt."${id}")`)
          : query.gt('timestamp', ts);
        // Get newer messages relative to cursorAfter, oldest-first for append
        query = query
          .order('timestamp', { ascending: true })
          .order('id', { ascending: true })
          .limit(limit + 1);
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
        .order('id', { ascending: false })
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
    // Trim to actual limit, preserving chronological (oldest->newest) order
    const trimmedData = hasMore
      ? (hasCursorAfter ? data.slice(0, limit) : data.slice(data.length - limit))
      : data;

    const enrichedMessages = await this.enrichFeedMessages(
      mapMessageArrayToCamelCase(trimmedData),
      conversationId
    );

    // Determine nextCursor based on pagination direction. Built from the RAW
    // row (full Postgres timestamp precision) — Date#toISOString truncates to
    // milliseconds, which can skip sub-millisecond neighbors at the boundary.
    let nextCursor: string | number | null = null;
    if (hasMore) {
      if (hasCursorAfter) {
        // Paging toward newer messages: continue after the newest returned row
        const newestRow = trimmedData[trimmedData.length - 1];
        nextCursor = buildCompositeCursor(newestRow);
      } else {
        // Initial load or paging toward older messages: continue before the
        // oldest returned row (trimmedData is oldest-first)
        const oldestRow = trimmedData[0];
        nextCursor = buildCompositeCursor(oldestRow);
      }
    }

    return {
      items: enrichedMessages,
      hasMore,
      nextCursor
    };
  }

  // Note: Input timestamp is Date object, Supabase handles conversion to TIMESTAMPTZ
  async create(messageData: MessageCreateData): Promise<Message> {
    const { data, error } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .insert(toMessageInsertRow(messageData))
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating message:', error);
      throw error || new Error('Failed to create message or retrieve created data.');
    }
    return mapCreatedMessage(data as MessageRow);
  }

  // Idempotent create (Phase 4 FR-024): the composition key is unique per
  // (sender_id, conversation_id) through the partial unique index
  // messages_sender_conversation_client_message_id_key. A retry finds the
  // stored row; a concurrent create with the same key loses the INSERT race
  // with a unique violation and reads the winner instead.
  async createWithClientKey(messageData: MessageCreateData, clientMessageId: string): Promise<MessageCreateResult> {
    const stored = await this.findByClientMessageId(messageData, clientMessageId);
    if (stored) {
      return { message: stored, created: false };
    }

    const { data, error } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .insert({ ...toMessageInsertRow(messageData), client_message_id: clientMessageId })
      .select()
      .single();

    if (!error && data) {
      return { message: mapCreatedMessage(data as MessageRow), created: true };
    }

    if (error && isUniqueViolation(error)) {
      const winner = await this.findByClientMessageId(messageData, clientMessageId);
      if (winner) {
        return { message: winner, created: false };
      }
    }

    console.error('Error creating message:', error);
    throw error || new Error('Failed to create message or retrieve created data.');
  }

  private async findByClientMessageId(
    messageData: Pick<MessageCreateData, 'senderId' | 'conversationId'>,
    clientMessageId: string
  ): Promise<Message | null> {
    const { data, error } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .select('*')
      .eq('sender_id', messageData.senderId)
      .eq('conversation_id', messageData.conversationId)
      .eq('client_message_id', clientMessageId)
      .maybeSingle();

    if (error) {
      console.error('Error looking up message by client key:', error);
      throw error;
    }
    return data ? mapCreatedMessage(data as MessageRow) : null;
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
    // Audit M-08: enrich the returned message — returning emptied
    // attachments/reactions corrupts any cache the caller writes it into.
    const updatedMessage = data ? mapMessageToCamelCase(data) : null;
    if (updatedMessage) {
      await this.enrichMessages([updatedMessage]);
    }
    return updatedMessage;
  }

  async deleteById(id: string): Promise<boolean> {
    // Consider deleting related reactions/attachments as well (cascade or manual)
    const { error, count } = await this.supabaseClient
      .from(this.MSG_TABLE_NAME)
      .delete({ count: 'exact' })
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
      .delete({ count: 'exact' })
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
  // Receipts are written exclusively by the service_role-only RPCs
  // mark_conversation_read / mark_messages_read (PATCH /api/conversations/read).

  async getMessageReaders(messageId: string, senderId: string): Promise<MessageReader[]> {
    // One query: receipts joined with the reader's users row, most recent
    // first. The sender's own receipt is excluded defensively (BR-002: the
    // RPCs never write one). Callers must have verified the requester IS the
    // sender (BR-003); on a user-scoped client RLS enforces it again.
    const { data, error } = await this.supabaseClient
      .from(this.READ_RECEIPT_TABLE_NAME)
      .select('user_id, read_at, reader:users!message_read_receipts_user_id_fkey(display_name, avatar_url)')
      .eq('message_id', messageId)
      .neq('user_id', senderId)
      .order('read_at', { ascending: false })
      .order('user_id', { ascending: true })
      .overrideTypes<MessageReaderRow[], { merge: false }>();

    if (error) {
      console.error('Error fetching message readers:', error);
      throw error;
    }

    return (data ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.reader?.display_name ?? null,
      avatarUrl: row.reader?.avatar_url ?? null,
      readAt: new Date(row.read_at),
    }));
  }

  // --- Message Pin Methods ---

  async pinMessage(messageId: string, conversationId: string, userId: string): Promise<MessagePin> {
    const dbData = {
      message_id: messageId,
      conversation_id: conversationId,
      pinned_by: userId, // user_id renamed to pinned_by
      pinned_at: new Date().toISOString()
    };

    const { data, error } = await this.supabaseClient
      .from(this.MESSAGE_PIN_TABLE_NAME)
      .upsert(dbData, { onConflict: 'message_id, pinned_by' }) // Updated conflict target (was user_id)
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
      .delete({ count: 'exact' })
      .eq('message_id', messageId)
      .eq('pinned_by', userId); // Ensure user owns the pinned_by

    if (error) {
      console.error('Error unpinning message:', error);
      return false;
    }

    return (count ?? 0) > 0;
  }

  async getPinnedMessages(conversationId: string, _userId: string): Promise<Message[]> {
    // First, get the pinned message IDs for this conversation (shared pins)
    const { data: pinsData, error: pinsError } = await this.supabaseClient
      .from(this.MESSAGE_PIN_TABLE_NAME)
      .select('message_id')
      .eq('conversation_id', conversationId);
    // .eq('user_id', userId); // Removed user_id filter for shared pins

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
    return this.enrichMessages(messages);
  }

  // --- Message Star Methods ---

  async starMessage(messageId: string, conversationId: string, userId: string): Promise<MessageStar> {
    const dbData = {
      message_id: messageId,
      conversation_id: conversationId,
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
      .delete({ count: 'exact' })
      .eq('message_id', messageId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error unstarring message:', error);
      return false;
    }

    return (count ?? 0) > 0;
  }

  /**
   * Phase 4 FR-021 / BR-009: the caller's starred messages in one
   * conversation, newest MESSAGE first (not star time), keyset-paginated by
   * the feed's composite "{raw_pg_timestamp}|{id}" cursor (`cursorBefore`
   * continues with older messages). Items come back newest-first with full
   * feed enrichment. The caller must authorize conversation membership
   * first; with the user-scoped client, message RLS (member-only) and star
   * RLS (own stars only) also apply.
   */
  async getStarredMessages(
    userId: string,
    conversationId: string,
    options?: Pick<PaginationOptions, 'limit' | 'cursorBefore'>
  ): Promise<PaginatedResult<Message>> {
    const limit = options?.limit ?? 20;

    // Driven from the caller's star rows (bounded by how many they starred),
    // with the starred message as an inner to-one embed: filters, ordering
    // and the keyset cursor apply to the MESSAGE columns, so the cursor is
    // the feed's. Driving from messages instead would scan (and evaluate
    // message RLS on) the whole conversation when stars are sparse.
    // messages.conversation_id is authoritative; the denormalized
    // starred_messages.conversation_id only narrows the star scan.
    let query = this.supabaseClient
      .from(this.MESSAGE_STAR_TABLE_NAME)
      .select('message:messages!message_stars_message_id_fkey!inner(*)')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .eq('message.conversation_id', conversationId);

    if (options?.cursorBefore) {
      const { ts, id } = parseCompositeCursor(options.cursorBefore);
      query = id
        ? query.or(`timestamp.lt."${ts}",and(timestamp.eq."${ts}",id.lt."${id}")`, { referencedTable: 'message' })
        : query.lt('message.timestamp', ts);
    }

    const { data, error } = await query
      .order('message(timestamp)', { ascending: false })
      .order('message(id)', { ascending: false })
      .limit(limit + 1);

    if (error) {
      console.error('Error fetching starred messages:', error);
      throw error;
    }

    const rows = ((data ?? []) as unknown as Array<{ message: MessageRow }>).map((row) => row.message);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = await this.enrichFeedMessages(mapMessageArrayToCamelCase(pageRows), conversationId);
    // Personal stars only, even if a privileged client is ever passed in.
    items.forEach(message => {
      message.stars = (message.stars ?? []).filter(star => star.userId === userId);
    });

    return {
      items,
      hasMore,
      // RAW row timestamp keeps microsecond precision (see findByConversation).
      nextCursor: hasMore ? buildCompositeCursor(pageRows[pageRows.length - 1]) : null,
    };
  }
}
