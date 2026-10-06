// src/repositories/implementations/supabase/SupabaseMessageAttachmentUploadRepository.ts
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AttachmentLinkError,
  type AttachmentLinkFailureCode,
  type IMessageAttachmentUploadRepository,
  type MessageWithAttachmentsCreateData,
} from '@/repositories/interfaces/IMessageAttachmentUploadRepository';
import type { MessageWithAttachmentsCreateResult, PendingAttachmentUpload } from '@/types/messaging';

interface PendingUploadRow {
  id: string;
  conversation_id: string;
  uploader_id: string;
  storage_path: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  duration: number | null;
  waveform_data: unknown;
}

const COLUMNS = 'id, conversation_id, uploader_id, storage_path, name, type, size, created_at, duration, waveform_data';

const LINK_FAILURE_CODES: readonly AttachmentLinkFailureCode[] = [
  'ATTACHMENT_UPLOAD_NOT_FOUND',
  'ATTACHMENT_COUNT_INVALID',
  'ATTACHMENT_DUPLICATE',
  'INVALID_REPLY_TARGET',
  'VOICE_NOTE_NOT_ALONE',
];

function mapRow(row: PendingUploadRow): PendingAttachmentUpload {
  const upload: PendingAttachmentUpload = {
    id: row.id,
    conversationId: row.conversation_id,
    uploaderId: row.uploader_id,
    storagePath: row.storage_path,
    name: row.name,
    type: row.type,
    size: row.size,
    createdAt: new Date(row.created_at),
  };
  // Voice notes (Phase 4 T15): the database guarantees both or neither.
  if (row.duration !== null) {
    upload.duration = row.duration;
    upload.waveformData = Array.isArray(row.waveform_data) ? (row.waveform_data as number[]) : [];
  }
  return upload;
}

function isLinkResult(value: unknown): value is { message_id: string; created: boolean } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message_id?: unknown }).message_id === 'string' &&
    typeof (value as { created?: unknown }).created === 'boolean'
  );
}

/** Requires the service-role client (the table has no client policies). */
export class SupabaseMessageAttachmentUploadRepository implements IMessageAttachmentUploadRepository {
  private readonly TABLE_NAME = 'message_attachment_uploads';

  constructor(private readonly supabaseClient: SupabaseClient) {}

  async create(upload: Omit<PendingAttachmentUpload, 'createdAt'>): Promise<PendingAttachmentUpload> {
    const { data, error } = await this.supabaseClient
      .from(this.TABLE_NAME)
      .insert({
        id: upload.id,
        conversation_id: upload.conversationId,
        uploader_id: upload.uploaderId,
        storage_path: upload.storagePath,
        name: upload.name,
        type: upload.type,
        size: upload.size,
        duration: upload.duration ?? null,
        waveform_data: upload.waveformData ?? null,
      })
      .select(COLUMNS)
      .single();

    if (error || !data) {
      console.error('Error recording pending attachment upload:', error);
      throw error ?? new Error('Failed to record pending attachment upload');
    }
    return mapRow(data as PendingUploadRow);
  }

  async findOwned(
    ids: readonly string[],
    uploaderId: string,
    conversationId: string
  ): Promise<PendingAttachmentUpload[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabaseClient
      .from(this.TABLE_NAME)
      .select(COLUMNS)
      .in('id', [...ids])
      .eq('uploader_id', uploaderId)
      .eq('conversation_id', conversationId);

    if (error) {
      console.error('Error loading pending attachment uploads:', error);
      throw error;
    }
    return ((data ?? []) as PendingUploadRow[]).map(mapRow);
  }

  async deleteOwned(id: string, uploaderId: string): Promise<PendingAttachmentUpload | null> {
    const { data, error } = await this.supabaseClient
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id)
      .eq('uploader_id', uploaderId)
      .select(COLUMNS);

    if (error) {
      console.error('Error deleting pending attachment upload:', error);
      throw error;
    }
    const rows = (data ?? []) as PendingUploadRow[];
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  async deleteStaleOwned(uploaderId: string, olderThan: Date, limit: number): Promise<PendingAttachmentUpload[]> {
    const cutoff = olderThan.toISOString();
    const { data: candidates, error: selectError } = await this.supabaseClient
      .from(this.TABLE_NAME)
      .select('id')
      .eq('uploader_id', uploaderId)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (selectError) {
      console.error('Error listing stale pending attachment uploads:', selectError);
      throw selectError;
    }
    const ids = ((candidates ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) return [];

    // Re-filter on delete: a row linked or cancelled meanwhile is not returned.
    const { data, error } = await this.supabaseClient
      .from(this.TABLE_NAME)
      .delete()
      .in('id', ids)
      .eq('uploader_id', uploaderId)
      .lt('created_at', cutoff)
      .select(COLUMNS);

    if (error) {
      console.error('Error deleting stale pending attachment uploads:', error);
      throw error;
    }
    return ((data ?? []) as PendingUploadRow[]).map(mapRow);
  }

  async listLinkedAttachmentIds(messageId: string): Promise<string[]> {
    const { data, error } = await this.supabaseClient
      .from('message_attachments')
      .select('id')
      .eq('message_id', messageId);

    if (error) {
      console.error('Error listing message attachments:', error);
      throw error;
    }
    return ((data ?? []) as { id: string }[]).map((row) => row.id);
  }

  async createMessageWithAttachments(
    data: MessageWithAttachmentsCreateData,
    uploadIds: readonly string[],
    clientMessageId?: string
  ): Promise<MessageWithAttachmentsCreateResult> {
    const { data: result, error } = await this.supabaseClient.rpc('create_message_with_attachments', {
      p_conversation_id: data.conversationId,
      p_sender_id: data.senderId,
      p_content: data.content,
      p_type: data.type,
      p_reply_to_id: data.replyToId ?? null,
      p_client_message_id: clientMessageId ?? null,
      p_upload_ids: [...uploadIds],
    });

    if (error) {
      const linkFailure = LINK_FAILURE_CODES.find((code) => error.message === code);
      if (error.code === '22023' && linkFailure) {
        throw new AttachmentLinkError(linkFailure);
      }
      if (error.code === '42501') {
        throw new AttachmentLinkError('NOT_PARTICIPANT');
      }
      console.error('Error in create_message_with_attachments RPC:', error);
      throw error;
    }
    if (!isLinkResult(result)) {
      throw new Error('create_message_with_attachments returned an unexpected result');
    }
    return { messageId: result.message_id, created: result.created };
  }
}
