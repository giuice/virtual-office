// src/app/api/conversations/read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, jsonError, requireConversationParticipant } from '@/lib/auth/authorize';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

/** Upper bound of visible message ids per request (mirrored by the RPC). */
const MAX_READ_RECEIPT_MESSAGE_IDS = 100;

const messageIdsSchema = z
  .array(z.guid())
  .min(1)
  .max(MAX_READ_RECEIPT_MESSAGE_IDS);

/**
 * PATCH { conversationId }               — legacy mark-all (published clients):
 *   advances last_read_at and receipts every message from others.
 * PATCH { conversationId, messageIds }   — Phase 4 per-message receipts: records
 *   receipts only for the given visible ids of this conversation, never for the
 *   caller's own messages, without moving last_read_at.
 */
export async function PATCH(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      const parsedBody: unknown = await request.json();
      if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
        return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    if (!conversationId) {
      return jsonError(400, 'BAD_REQUEST', 'Missing required field: conversationId');
    }

    let messageIds: string[] | null = null;
    if (body.messageIds !== undefined) {
      const parsed = messageIdsSchema.safeParse(body.messageIds);
      if (!parsed.success) {
        return jsonError(
          400,
          'BAD_REQUEST',
          `messageIds must be 1-${MAX_READ_RECEIPT_MESSAGE_IDS} message UUIDs`
        );
      }
      messageIds = [...new Set(parsed.data.map((id) => id.toLowerCase()))];
    }

    // Audit B-01: participants hold DB UUIDs, so the participant check must use
    // dbUser.id — the gate already compares the right identity. The legacy route
    // compared the Supabase UID and returned a permanent 403.
    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(
      ctx.serviceClient
    );

    if (messageIds) {
      const rateLimited = await enforceRateLimit(
        ctx.serviceClient,
        ctx.dbUser.id,
        'conversation:read-receipts'
      );
      if (rateLimited) {
        return rateLimited;
      }

      const recorded = await conversationRepository.markMessagesRead(
        conversationId,
        ctx.dbUser.id,
        messageIds
      );
      return NextResponse.json({ success: true, recorded }, { status: 200 });
    }

    // Phase 2.2: atomic RPC — sets conversation_members.last_read_at and
    // writes per-message read receipts in one transaction.
    const success = await conversationRepository.markConversationRead(conversationId, ctx.dbUser.id);

    if (!success) {
      return jsonError(500, 'INTERNAL_ERROR', 'Failed to mark conversation as read');
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Internal Server Error');
  }
}
