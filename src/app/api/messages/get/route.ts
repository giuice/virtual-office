// src/app/api/messages/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message } from '@/types/messaging';

// Mock database
// In a real application, this would be replaced with a database query
// For simplicity, we're using the shared mock messages from create route
let messages: Message[] = [];

export async function GET(request: NextRequest) {
  try {
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
    
    // Filter messages by conversation
    let filteredMessages = messages.filter(message => 
      message.conversationId === conversationId
    );
    
    // Sort messages by timestamp
    filteredMessages.sort((a, b) => {
      if (direction === 'older') {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      } else {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      }
    });
    
    // Apply cursor-based pagination
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = filteredMessages.findIndex(msg => msg.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }
    
    // Get paginated messages
    const paginatedMessages = filteredMessages.slice(startIndex, startIndex + limit);
    
    // Determine if there are more messages
    const hasMore = startIndex + limit < filteredMessages.length;
    
    // Get next cursor
    const nextCursor = hasMore ? paginatedMessages[paginatedMessages.length - 1]?.id : undefined;
    
    return NextResponse.json({
      messages: paginatedMessages,
      nextCursor,
      hasMore
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve messages' },
      { status: 500 }
    );
  }
}
