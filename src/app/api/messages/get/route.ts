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
    const direction = searchParams.get('direction') || 'older';
    
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
    
    // Prepare pagination options with numeric cursor for offset-based pagination
    const paginationOptions: PaginationOptions = {
      limit: limit + 1, // Fetch one extra to determine hasMore
      cursor: cursor ? parseInt(cursor, 10) : 0,
    };

    // Fetch messages using repository
    const messages: Message[] = await messageRepository.findByConversation(
      conversationId,
      paginationOptions
    );

    // Determine pagination info
    const hasMore = messages.length > limit;
    const actualMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? (paginationOptions.cursor as number) + limit : undefined;

    // Return windowed response structure matching useMessages expectations
    return NextResponse.json({
      messages: actualMessages,
      nextCursor: nextCursor?.toString(),
      hasMore: hasMore,
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}
