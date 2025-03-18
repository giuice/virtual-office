 // src/app/api/conversations/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Conversation, ConversationType } from '@/types/messaging';

// Access the mock database
// In a real application, this would be fetched from a database
// We're using the shared mock conversations from create route
// @ts-ignore - Accessing external variable from another route file
import { conversations } from '../create/route';

export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor');
    
    // Validate required parameters
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // Filter conversations by participant
    let filteredConversations = conversations.filter(conversation => 
      conversation.participants.includes(userId) && 
      (includeArchived || !conversation.isArchived) &&
      (!type || conversation.type === type)
    );
    
    // Sort conversations by lastActivity
    filteredConversations.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
    
    // Apply cursor-based pagination
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = filteredConversations.findIndex(conv => conv.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }
    
    // Get paginated conversations
    const paginatedConversations = filteredConversations.slice(startIndex, startIndex + limit);
    
    // Determine if there are more conversations
    const hasMore = startIndex + limit < filteredConversations.length;
    
    // Get next cursor
    const nextCursor = hasMore ? paginatedConversations[paginatedConversations.length - 1]?.id : undefined;
    
    return NextResponse.json({
      conversations: paginatedConversations,
      nextCursor,
      hasMore
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve conversations' },
      { status: 500 }
    );
  }
}
