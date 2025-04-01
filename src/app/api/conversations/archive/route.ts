// src/app/api/conversations/archive/route.ts
import { NextResponse } from 'next/server';
import { IConversationRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase'; // Import implementation
// import { getAuth } from '@clerk/nextjs/server'; // TODO: Revisit auth import/implementation

export async function PATCH(request: Request) {
  // TODO: Implement proper authentication and authorization
  // const { userId: authenticatedUserId } = getAuth(request); // TODO: Revisit auth
  const authenticatedUserId = 'placeholder-auth-user-id'; // Placeholder for now

  if (!authenticatedUserId) {
    return NextResponse.json({ error: 'Unauthorized (Placeholder)' }, { status: 401 });
  }

  const conversationRepository: IConversationRepository = new SupabaseConversationRepository(); // Instantiate repository

  try {
    const { conversationId, isArchived } = await request.json();
    const userId = authenticatedUserId; // Keep authenticated user ID for potential authorization checks

    // Basic validation
    if (!conversationId || typeof isArchived !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields: conversationId, isArchived (boolean)' }, { status: 400 });
    }

    // Authorization check: Ensure the authenticated user matches the userId performing the action
    // This check is implicitly handled by using authenticatedUserId directly now.

    // TODO: Add further authorization: Is the user actually a participant in this conversation?
    // This check might be handled within the repository method or needs to be added here by fetching the conversation first.

    console.log(`API: Setting global archive status for conversation ${conversationId} to ${isArchived} (initiated by user ${userId})`);

    // Call the repository method to update the global archive status
    const updatedConversation = await conversationRepository.setArchiveStatus(conversationId, isArchived);
    const success = !!updatedConversation; // Check if the update returned the updated object

    if (!success) {
        // Handle cases where the update failed (e.g., conversation not found)
        // The repository method should return null if not found.
        return NextResponse.json({ error: 'Failed to update archive status. Conversation not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error setting conversation archive status:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    // Consider more specific error handling based on repository errors
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
