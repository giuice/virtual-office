// src/app/api/messages/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageStatus, MessageType } from '@/types/messaging';
import { IMessageRepository, IConversationRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository, SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, jsonError, requireConversationParticipant } from '@/lib/auth/authorize';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

// Audit S-04: cap message payload size server-side.
const MAX_CONTENT_LENGTH = 8192;

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    if (!conversationId || typeof body.content !== 'string') {
      return jsonError(400, 'BAD_REQUEST', 'Missing required fields: conversationId, content');
    }

    const trimmedContent = body.content.trim();
    if (trimmedContent.length === 0) {
      return jsonError(400, 'BAD_REQUEST', 'Content must not be empty');
    }
    if (trimmedContent.length > MAX_CONTENT_LENGTH) {
      return jsonError(413, 'CONTENT_TOO_LARGE', `Content exceeds the ${MAX_CONTENT_LENGTH} character limit`);
    }

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }
    const { serviceClient, dbUser, conversation } = ctx;

    const rateLimited = await enforceRateLimit(serviceClient, dbUser.id, 'message:create');
    if (rateLimited) {
      return rateLimited;
    }

    const messageRepository: IMessageRepository = new SupabaseMessageRepository(serviceClient);
    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(serviceClient);

    // Audit S-04: replyToId must reference a message in the SAME conversation.
    let replyToId: string | undefined;
    if (body.replyToId !== undefined && body.replyToId !== null) {
      if (typeof body.replyToId !== 'string') {
        return jsonError(400, 'BAD_REQUEST', 'replyToId must be a string');
      }
      const { data: replyTarget, error: replyError } = await serviceClient
        .from('messages')
        .select('id, conversation_id')
        .eq('id', body.replyToId)
        .maybeSingle();
      if (replyError) {
        console.error('Failed to validate replyToId:', replyError.message);
        return jsonError(500, 'INTERNAL_ERROR', 'Failed to create message');
      }
      if (!replyTarget || replyTarget.conversation_id !== conversation.id) {
        return jsonError(400, 'INVALID_REPLY_TARGET', 'replyToId must reference a message in the same conversation');
      }
      replyToId = replyTarget.id;
    }

    const safeType: MessageType = Object.values(MessageType).includes(body.type as MessageType)
      ? (body.type as MessageType)
      : MessageType.TEXT;

    const messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'> = {
      conversationId: conversation.id,
      senderId: dbUser.id,
      content: trimmedContent,
      type: safeType,
      // Audit S-04: never trust client-supplied status (pre-marked read/delivered).
      status: MessageStatus.SENT,
      replyToId,
    };

    const createdMessage = await messageRepository.create(messageData);

    // Update conversation last activity. Besides ordering the list, this
    // UPDATE on conversations is what fires useConversationRealtime's cache
    // invalidation so recipients' unread badges refresh. Unread counts are
    // derived from conversation_members.last_read_at (Phase 2.2) — nothing
    // to increment here.
    try {
      await conversationRepository.updateLastActivityTimestamp(conversation.id);
    } catch (updateError) {
      console.warn('Failed to update conversation activity:', updateError);
      // Don't fail the request if conversation update fails
    }

    return NextResponse.json({ message: createdMessage }, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to create message');
  }
}
