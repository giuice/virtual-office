// src/repositories/implementations/supabase/message-attempt-rpc.ts
// Phase 5 T2: typed calls to the fenced create / fence RPCs
// (migration 20261007095045_message_send_attempt_fencing). Service role only.
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import {
  AttemptSupersededError,
  InsertionRateLimitError,
  MessageDeletedError,
  NotParticipantError,
  type ClientMessageKey,
} from '@/repositories/interfaces/IMessageRepository';
import {
  AttachmentLinkError,
  type AttachmentLinkFailureCode,
} from '@/repositories/interfaces/IMessageAttachmentUploadRepository';
import { parseStoredComposition } from '@/lib/messaging/message-composition';
import type {
  InsertionQuota,
  Message,
  MessageAttempt,
  MessageAttemptFenceResult,
  MessageComposition,
} from '@/types/messaging';

export interface CreateMessageAttemptInput {
  data: Pick<Message, 'conversationId' | 'senderId' | 'content' | 'type' | 'replyToId'>;
  clientMessageId?: string;
  attempt?: MessageAttempt;
  uploadIds: readonly string[];
  /**
   * Phase 5 T3 (migration 20261007114454): charged by a winning insertion in
   * its own transaction; null = no charge.
   */
  insertQuota: InsertionQuota | null;
}

export interface CreateMessageAttemptResult {
  messageId: string;
  created: boolean;
  storedComposition: MessageComposition | null;
  /**
   * Phase 5 T3: on a winning insertion, the created messages row (snake_case,
   * built in the insertion's own transaction); null on a replay.
   */
  createdRow: Record<string, unknown> | null;
  /**
   * Phase 5 T4 (migration 20261007153119): on a winning insertion, the users
   * (users.id) the message mentions as stored in that transaction, sorted;
   * null on a replay (read the stored message instead).
   */
  mentionedUserIds: string[] | null;
}

/** Raised by the RPC call; carries the PostgREST error for caller-specific mapping. */
export class MessageAttemptRpcError extends Error {
  constructor(readonly postgrestError: PostgrestError) {
    super(postgrestError.message);
    this.name = 'MessageAttemptRpcError';
  }
}

const LINK_FAILURE_CODES: readonly AttachmentLinkFailureCode[] = [
  'ATTACHMENT_UPLOAD_NOT_FOUND',
  'ATTACHMENT_COUNT_INVALID',
  'ATTACHMENT_DUPLICATE',
  'INVALID_REPLY_TARGET',
  'VOICE_NOTE_NOT_ALONE',
];

/**
 * The database's explicit membership refusal (Phase 5 T3, migration
 * 20261007114454). Any other 42501 — a revoked EXECUTE or table grant — is an
 * infrastructure failure, never a membership answer.
 */
function isMembershipRefusal(error: PostgrestError): boolean {
  return error.code === '42501' && error.message === 'NOT_PARTICIPANT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Calls public.create_message_attempt. Throws AttemptSupersededError when the
 * attempt was fenced (nothing stored), MessageDeletedError when a
 * generation-carrying create would recreate a deleted message,
 * InsertionRateLimitError when the winning insertion could not be charged to
 * the insertion quota (exhausted or uncheckable; rolled back),
 * AttachmentLinkError for the
 * database's validation refusals (reply target, explicit membership refusal,
 * uploads), and MessageAttemptRpcError for anything else (including grant
 * failures).
 */
export async function createMessageAttempt(
  client: SupabaseClient,
  input: CreateMessageAttemptInput
): Promise<CreateMessageAttemptResult> {
  const { data, error } = await client.rpc('create_message_attempt', {
    p_conversation_id: input.data.conversationId,
    p_sender_id: input.data.senderId,
    p_content: input.data.content,
    p_type: input.data.type,
    p_reply_to_id: input.data.replyToId ?? null,
    p_client_message_id: input.clientMessageId ?? null,
    p_attempt_generation: input.attempt?.generation ?? null,
    // Phase 5 T4: the composition carries the requested mention ids, which
    // the function stores (members other than the sender) with the insertion.
    p_composition: input.clientMessageId && input.attempt ? input.attempt.composition : null,
    p_upload_ids: [...input.uploadIds],
    p_insert_quota_limit: input.insertQuota?.limit ?? null,
    p_insert_quota_window_seconds: input.insertQuota?.windowSeconds ?? null,
  });

  if (error) {
    if (error.code === 'P0001' && error.message === 'RATE_LIMITED') {
      throw new InsertionRateLimitError('exceeded');
    }
    if (error.code === 'P0001' && error.message === 'RATE_LIMIT_UNAVAILABLE') {
      console.error('Insertion quota could not be charged in create_message_attempt:', error);
      throw new InsertionRateLimitError('unavailable');
    }
    if (error.message === 'ATTEMPT_SUPERSEDED') {
      throw new AttemptSupersededError();
    }
    if (error.message === 'MESSAGE_DELETED') {
      throw new MessageDeletedError();
    }
    const linkFailure = LINK_FAILURE_CODES.find((code) => error.message === code);
    if (error.code === '22023' && linkFailure) {
      throw new AttachmentLinkError(linkFailure);
    }
    if (isMembershipRefusal(error)) {
      throw new AttachmentLinkError('NOT_PARTICIPANT');
    }
    console.error('Error in create_message_attempt RPC:', error);
    throw new MessageAttemptRpcError(error);
  }
  if (!isRecord(data) || typeof data.message_id !== 'string' || typeof data.created !== 'boolean') {
    throw new Error('create_message_attempt returned an unexpected result');
  }
  return {
    messageId: data.message_id,
    created: data.created,
    storedComposition: data.created ? null : parseStoredComposition(data.composition),
    createdRow: data.created && isRecord(data.message) ? data.message : null,
    mentionedUserIds: data.created && isStringArray(data.mentioned_user_ids) ? data.mentioned_user_ids : null,
  };
}

/**
 * Calls public.fence_message_attempt. Throws NotParticipantError for the
 * database's explicit membership refusal and MessageAttemptRpcError for
 * anything else (including grant failures).
 */
export async function fenceMessageAttempt(
  client: SupabaseClient,
  key: ClientMessageKey,
  generation: number
): Promise<MessageAttemptFenceResult> {
  const { data, error } = await client.rpc('fence_message_attempt', {
    p_sender_id: key.senderId,
    p_conversation_id: key.conversationId,
    p_client_message_id: key.clientMessageId,
    p_attempt_generation: generation,
  });

  if (error) {
    if (isMembershipRefusal(error)) {
      throw new NotParticipantError();
    }
    console.error('Error in fence_message_attempt RPC:', error);
    throw new MessageAttemptRpcError(error);
  }
  if (isRecord(data)) {
    if (data.outcome === 'superseded' || data.outcome === 'not_stored') {
      return { outcome: data.outcome };
    }
    if (data.outcome === 'stored' && (typeof data.message_id === 'string' || data.message_id === null)) {
      return { outcome: 'stored', messageId: data.message_id };
    }
  }
  throw new Error('fence_message_attempt returned an unexpected result');
}
