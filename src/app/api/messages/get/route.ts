// src/app/api/messages/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message } from '@/types/messaging';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { PaginationOptions, PaginatedResult } from '@/types/common'; // Assuming path

export async function GET(request: NextRequest) {
  try {
    const messageRepository: IMessageRepository = new SupabaseMessageRepository();
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const cursor = searchParams.get('cursor');
    // const direction = searchParams.get('direction') || 'older'; // Repository likely handles sorting
    
    // Validate required parameters
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      );
    }
    
    // Prepare pagination options
    const paginationOptions: PaginationOptions = {
      limit: limit,
      cursor: cursor || undefined, // Pass cursor if it exists
    };

    // Fetch messages using repository
    // TODO: Update IMessageRepository.findByConversation to return PaginatedResult<Message> for proper pagination
    const messages: Message[] = await messageRepository.findByConversation(
      conversationId,
      paginationOptions
    );

    // Temporary response structure until repository method is updated
    return NextResponse.json({
      messages: messages,
      nextCursor: undefined, // Cannot determine next cursor from Message[]
      hasMore: false,       // Cannot determine hasMore from Message[]
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}
