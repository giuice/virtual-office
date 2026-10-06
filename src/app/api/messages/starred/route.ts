import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, jsonError, requireConversationParticipant } from '@/lib/auth/authorize';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Composite feed cursor "{raw_pg_timestamp}|{id}" as emitted by the
// repository. Validated strictly because its parts are interpolated into a
// PostgREST filter expression.
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;

const querySchema = z.object({
  conversationId: z.guid(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursorBefore: z
    .string()
    .refine((cursor) => {
      const sep = cursor.indexOf('|');
      if (sep === -1) return false;
      return PG_TIMESTAMP.test(cursor.slice(0, sep)) && z.guid().safeParse(cursor.slice(sep + 1)).success;
    })
    .optional(),
});

/**
 * GET /api/messages/starred?conversationId=&limit=&cursorBefore= — Phase 4
 * FR-021 / BR-009.
 *
 * The caller's own starred messages in one conversation they belong to,
 * ordered by message date, newest first, keyset-paginated:
 * { messages, nextCursorBefore?, hasMoreOlder }. Messages have the feed's
 * shape (attachments, reactions, pins, the caller's `stars`), and readCount
 * only on the caller's own messages (FR-003, same rule as /api/messages/get).
 *
 * Non-member (including a member who left) → 403 NOT_PARTICIPANT; unknown
 * conversation → 404; no session → 401; invalid conversationId, limit (1–50)
 * or cursor → 400.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      conversationId: searchParams.get('conversationId') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      cursorBefore: searchParams.get('cursorBefore') ?? undefined,
    });
    if (!parsed.success) {
      return jsonError(400, 'BAD_REQUEST', 'Invalid conversationId, limit, or cursorBefore');
    }
    const { limit, cursorBefore } = parsed.data;
    const conversationId = parsed.data.conversationId.toLowerCase();

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    // User-scoped client: message RLS (member-only) and star RLS (own stars
    // only) apply behind the membership check above.
    const messageRepository: IMessageRepository = new SupabaseMessageRepository(ctx.supabase);
    const viewerId = ctx.dbUser.id;
    const result = await messageRepository.getStarredMessages(viewerId, conversationId, {
      limit,
      cursorBefore,
    });

    const messages = result.items.map((message) =>
      message.senderId === viewerId ? message : { ...message, readCount: undefined }
    );

    return NextResponse.json(
      {
        messages,
        nextCursorBefore:
          result.hasMore && typeof result.nextCursor === 'string' ? result.nextCursor : undefined,
        hasMoreOlder: result.hasMore,
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error fetching starred messages:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to fetch starred messages');
  }
}
