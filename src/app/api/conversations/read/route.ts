// src/app/api/conversations/read/route.ts
import { NextResponse } from 'next/server';
import { markConversationAsReadInDB } from '@/lib/dynamo/conversations'; // Corrected import path
// import { getAuth } from '@clerk/nextjs/server'; // TODO: Revisit auth import/implementation

export async function PATCH(request: Request) {
  // TODO: Implement proper authentication and authorization
  // const { userId: authenticatedUserId } = getAuth(request); // TODO: Revisit auth
  const authenticatedUserId = 'placeholder-auth-user-id'; // Placeholder for now

  if (!authenticatedUserId) {
    return NextResponse.json({ error: 'Unauthorized (Placeholder)' }, { status: 401 });
  }

  try {
    const { conversationId, userId } = await request.json();

    // Basic validation
    if (!conversationId || !userId) {
      return NextResponse.json({ error: 'Missing required fields: conversationId, userId' }, { status: 400 });
    }

    // Authorization check: Ensure the authenticated user matches the userId performing the action
    if (userId !== authenticatedUserId) {
        console.warn(`Potential unauthorized read marking: User ${authenticatedUserId} tried to mark read for user ${userId} on conversation ${conversationId}`);
        return NextResponse.json({ error: 'Forbidden: Cannot mark conversation as read for another user' }, { status: 403 });
    }

    // TODO: Add further authorization: Is the user actually a participant in this conversation?

    console.log(`API: Marking conversation ${conversationId} as read for user ${userId}`);

    // Call the actual database update logic
    await markConversationAsReadInDB(conversationId, userId);

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error marking conversation as read:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
