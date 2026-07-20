// src/lib/auth/authorize.ts
// Single authorization gate for messaging routes (audit S-05).
// Rule: every route resolves the requester, checks participation here, and only
// then may use the service-role client for the mutation. RLS stays as
// defense-in-depth, never the primary gate.
import type { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api/server-error';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { requireAuthUser } from '@/lib/auth/session';
import type { User } from '@/types/database';

export { jsonError } from '@/lib/api/server-error';

export interface ConversationAccess {
  id: string;
  type: string;
  roomId: string | null;
}

export interface ParticipantContext {
  /** User-scoped client — use for reads so RLS still applies. */
  supabase: SupabaseClient;
  /** Service-role client — use ONLY for the mutation after this check passed. */
  serviceClient: SupabaseClient;
  dbUser: User;
  conversation: ConversationAccess;
}

export interface MessageParticipantContext extends ParticipantContext {
  message: {
    id: string;
    conversationId: string;
    senderId: string | null;
  };
}

export interface AuthzFailure {
  errorResponse: NextResponse;
}

export function isAuthzFailure(result: object): result is AuthzFailure {
  return 'errorResponse' in result;
}

async function loadConversationAccess(
  serviceClient: SupabaseClient,
  conversationId: string,
  dbUserId: string
): Promise<{ conversation: ConversationAccess; isMember: boolean } | AuthzFailure> {
  const { data: row, error } = await serviceClient
    .from('conversations')
    .select('id, type, room_id, conversation_members(user_id)')
    .eq('id', conversationId)
    .eq('conversation_members.user_id', dbUserId)
    .maybeSingle();

  if (error) {
    console.error('[authorize] Failed to load conversation:', error.message);
    return { errorResponse: jsonError(500, 'INTERNAL_ERROR', 'Failed to load conversation') };
  }
  if (!row) {
    return { errorResponse: jsonError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found') };
  }

  const conversationMembers = Array.isArray((row as { conversation_members?: unknown }).conversation_members)
    ? ((row as { conversation_members: { user_id: string }[] }).conversation_members ?? [])
    : [];

  return {
    conversation: {
      id: row.id,
      type: row.type,
      roomId: row.room_id ?? null,
    },
    isMember: conversationMembers.length > 0,
  };
}

/**
 * Resolves the session and asserts the requester participates in the
 * conversation. Membership authority is now conversation_members (synced from
 * participants[] by DB trigger; participants[] will be removed in Phase 3).
 */
export async function requireConversationParticipant(
  conversationId: string
): Promise<ParticipantContext | AuthzFailure> {
  if (!conversationId || typeof conversationId !== 'string') {
    return { errorResponse: jsonError(400, 'BAD_REQUEST', 'conversationId is required') };
  }

  const auth = await requireAuthUser();
  if ('errorResponse' in auth) {
    return auth;
  }

  const serviceClient = await createSupabaseServerClient('service_role');
  const access = await loadConversationAccess(serviceClient, conversationId, auth.dbUser.id);
  if (isAuthzFailure(access)) {
    return access;
  }

  if (!access.isMember) {
    return {
      errorResponse: jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation'),
    };
  }

  const { conversation } = access;

  return {
    supabase: auth.supabase,
    serviceClient,
    dbUser: auth.dbUser,
    conversation,
  };
}

/**
 * Same as requireConversationParticipant, but scoped by message — for routes
 * addressed by messageId (react, pin, star, attachment access).
 */
export async function requireMessageParticipant(
  messageId: string
): Promise<MessageParticipantContext | AuthzFailure> {
  if (!messageId || typeof messageId !== 'string') {
    return { errorResponse: jsonError(400, 'BAD_REQUEST', 'messageId is required') };
  }

  const auth = await requireAuthUser();
  if ('errorResponse' in auth) {
    return auth;
  }

  const serviceClient = await createSupabaseServerClient('service_role');
  const { data: messageRow, error: messageError } = await serviceClient
    .from('messages')
    .select('id, conversation_id, sender_id')
    .eq('id', messageId)
    .maybeSingle();

  if (messageError) {
    console.error('[authorize] Failed to load message:', messageError.message);
    return { errorResponse: jsonError(500, 'INTERNAL_ERROR', 'Failed to load message') };
  }
  if (!messageRow) {
    return { errorResponse: jsonError(404, 'MESSAGE_NOT_FOUND', 'Message not found') };
  }

  const access = await loadConversationAccess(serviceClient, messageRow.conversation_id, auth.dbUser.id);
  if (isAuthzFailure(access)) {
    return access;
  }

  if (!access.isMember) {
    return {
      errorResponse: jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation'),
    };
  }

  return {
    supabase: auth.supabase,
    serviceClient,
    dbUser: auth.dbUser,
    conversation: access.conversation,
    message: {
      id: messageRow.id,
      conversationId: messageRow.conversation_id,
      senderId: messageRow.sender_id ?? null,
    },
  };
}
