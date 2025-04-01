// src/app/api/conversations/read/route.ts
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
    // The user marking the conversation as read is the authenticated user.
    const { conversationId } = await request.json();
    const userId = authenticatedUserId;

    // Basic validation
    if (!conversationId) {
      return NextResponse.json({ error: 'Missing required field: conversationId' }, { status: 400 });
    }

    // Authorization check (implicit via using authenticatedUserId)

    // TODO: Add further authorization: Is the user actually a participant in this conversation?
    // This check might be handled within the repository method or needs to be added here.

    console.log(`API: Marking conversation ${conversationId} as read for user ${userId}`);

    // Call the repository method to mark as read
    const success = await conversationRepository.markAsRead(conversationId, userId);

    if (!success) {
        // Handle cases where the update failed (e.g., conversation not found, user not participant)
        // The repository method should return false in these cases.
        return NextResponse.json({ error: 'Failed to mark conversation as read. Conversation not found or user not a participant.' }, { status: 404 }); // Or 403?
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error marking conversation as read:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    // Consider more specific error handling based on repository errors
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
