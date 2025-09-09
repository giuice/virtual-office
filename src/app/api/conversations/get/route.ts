// src/app/api/conversations/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Conversation, ConversationType } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { createSupabaseServerClient } from '@/lib/supabase/server-client'; // Import server client
import { PaginationOptions, PaginatedResult } from '@/types/common'; // Import common types
// import { getAuth } from '@clerk/nextjs/server'; // TODO: Revisit auth import/implementation

export async function GET(request: NextRequest) {
  // TODO: Implement proper authentication and authorization
  // const { userId: authenticatedUserId } = getAuth(request); // TODO: Revisit auth
  // For now, get userId from query params for testing repository logic
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId'); // Using query param for now
  const authenticatedUserId = userId; // Assume query param user is authenticated for this refactor

  if (!authenticatedUserId) {
    // In real auth, this check would be more robust
    return NextResponse.json({ error: 'Unauthorized or userId missing' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient(); // Create Supabase server client
  const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase); // Instantiate repository with client

  try {
    // Get query parameters for filtering and pagination
    const type = searchParams.get('type') as ConversationType | null;
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') || undefined; // Use undefined if null

    // Prepare pagination options for the repository
    const paginationOptions: PaginationOptions = { limit, cursor };

    // Fetch paginated conversations for the user from the repository
    const result: PaginatedResult<Conversation> = await conversationRepository.findByUser(authenticatedUserId, paginationOptions);

    // TODO: Enhance repository's findByUser method to support filtering by type and archived status directly in the query.
    // Apply filtering after fetching for now.
    const filteredConversations = result.items.filter(conversation =>
      (includeArchived || !conversation.isArchived) &&
      (!type || conversation.type === type)
    );

    // Note: The repository result already contains pagination info (nextCursor, hasMore).
    // If post-filtering removes all items on the current page but hasMore was true,
    // the client might need logic to auto-fetch the next page.
    // Alternatively, the repository could be enhanced to handle filtering before pagination.

    return NextResponse.json({
      conversations: filteredConversations,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore // Rely on repository's hasMore calculation
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    // Consider more specific error handling based on repository errors
    return NextResponse.json(
      { error: 'Failed to retrieve conversations' },
      { status: 500 }
    );
  }
}
