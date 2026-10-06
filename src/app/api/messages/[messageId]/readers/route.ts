import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, jsonError, requireMessageParticipant } from '@/lib/auth/authorize';

const messageIdSchema = z.guid();

/**
 * GET /api/messages/[messageId]/readers — Phase 4 FR-003 / BR-003.
 *
 * Returns who read the message and when (most recent first) ONLY to the
 * message's sender: { readCount, readers: [{ userId, displayName, avatarUrl,
 * readAt }] }. readCount is the number of distinct non-sender readers
 * ("Lida por N", BR-004).
 *
 * A conversation member who is not the sender gets 403 NOT_MESSAGE_SENDER with
 * no reader data; a non-member gets 403 NOT_PARTICIPANT; no session gets 401.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId: rawMessageId } = await params;
    const parsedId = messageIdSchema.safeParse(rawMessageId);
    if (!parsedId.success) {
      return jsonError(400, 'BAD_REQUEST', 'messageId must be a UUID');
    }
    const messageId = parsedId.data.toLowerCase();

    const ctx = await requireMessageParticipant(messageId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    if (!ctx.message.senderId || ctx.message.senderId !== ctx.dbUser.id) {
      return jsonError(403, 'NOT_MESSAGE_SENDER', 'Only the sender can see who read this message');
    }

    // User-scoped client: receipt RLS independently limits reader details to
    // the sender (defense in depth behind the check above).
    const messageRepository: IMessageRepository = new SupabaseMessageRepository(ctx.supabase);
    const readers = await messageRepository.getMessageReaders(messageId, ctx.dbUser.id);

    return NextResponse.json(
      {
        readCount: readers.length,
        readers: readers.map((reader) => ({
          userId: reader.userId,
          displayName: reader.displayName,
          avatarUrl: reader.avatarUrl,
          readAt: reader.readAt.toISOString(),
        })),
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error fetching message readers:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to fetch message readers');
  }
}
