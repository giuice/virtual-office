// src/app/api/messages/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message } from '@/types/messaging';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { PaginationOptions, PaginatedResult } from '@/types/common'; // Assuming path
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function GET(request: NextRequest) {
  try {
    // Authenticate the user
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }
    
    const messageRepository: IMessageRepository = new SupabaseMessageRepository(supabase);
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const cursor = searchParams.get('cursor');
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
    
    // Keyset pagination flow
    if (cursorBefore || cursorAfter) {
      const paginationOptions: PaginationOptions = {
        limit,
        cursorBefore: cursorBefore || undefined,
        cursorAfter: cursorAfter || undefined,
      };

      const result: PaginatedResult<Message> = await messageRepository.findByConversation(
        conversationId,
        paginationOptions
      );

      // Extract messages array from PaginatedResult
      const messages = result.items;

      // Compute next cursors
      let nextCursorBefore: string | undefined;
      let hasMoreOlder = false;

      if (messages.length > 0) {
        nextCursorBefore = messages[0].timestamp.toISOString(); // oldest in returned window
        // We cannot know hasMoreOlder without one extra fetch; do a cheap probe
        if (!cursorAfter) {
          const probeResult = await messageRepository.findByConversation(conversationId, {
            limit: 1,
            cursorBefore: nextCursorBefore,
          });
          hasMoreOlder = probeResult.items.length > 0;
        }
      }

      return NextResponse.json({
        messages,
        nextCursorBefore,
        hasMoreOlder,
      });
    }

    // Backward-compatible offset-based flow, but emulate last-N initial window
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const paginationOptions: PaginationOptions = {
      limit: limit + 1, // Fetch one extra to determine hasMore
      cursor: offset,
    };

    const result: PaginatedResult<Message> = await messageRepository.findByConversation(
      conversationId,
      paginationOptions
    );

    // Extract messages array from PaginatedResult
    const messages = result.items;

    const hasMore = messages.length > limit;
    const actualMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? offset + limit : undefined;

    return NextResponse.json({
      messages: actualMessages,
      nextCursor: nextCursor?.toString(),
      hasMore,
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}
