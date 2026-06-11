// src/app/api/messages/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message } from '@/types/messaging';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { PaginationOptions, PaginatedResult } from '@/types/common'; // Assuming path
import { isAuthzFailure, requireConversationParticipant } from '@/lib/auth/authorize';

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const cursorBefore = searchParams.get('cursorBefore');
    const cursorAfter = searchParams.get('cursorAfter');

    // Validate required parameters
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      );
    }

    // Validate limit range
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const messageRepository: IMessageRepository = new SupabaseMessageRepository(ctx.supabase);
    const paginationOptions: PaginationOptions = {
      limit,
      cursorBefore: cursorBefore || undefined,
      cursorAfter: cursorAfter || undefined,
    };

    const result: PaginatedResult<Message> = await messageRepository.findByConversation(
      conversationId,
      paginationOptions
    );

    // Audit M-03: the repository already fetches limit + 1 and computes
    // hasMore plus a composite (timestamp, id) cursor — no probe query.
    // nextCursorBefore is only set when older messages actually exist, so the
    // client's hasNextPage matches reality.
    const isPagingNewer = Boolean(cursorAfter);
    const hasMoreOlder = !isPagingNewer && result.hasMore;
    const nextCursorBefore =
      hasMoreOlder && typeof result.nextCursor === 'string' ? result.nextCursor : undefined;

    return NextResponse.json({
      messages: result.items,
      nextCursorBefore,
      hasMoreOlder,
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}
