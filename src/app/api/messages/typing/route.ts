// src/app/api/messages/typing/route.ts
import { NextResponse } from 'next/server';
// import { getAuth } from '@clerk/nextjs/server'; // TODO: Revisit auth import/implementation

export async function POST(request: Request) {
  // TODO: Implement proper authentication and authorization
  // const { userId: authenticatedUserId } = getAuth(request); // TODO: Revisit auth
  const authenticatedUserId = 'placeholder-auth-user-id'; // Placeholder for now

  if (!authenticatedUserId) {
    return NextResponse.json({ error: 'Unauthorized (Placeholder)' }, { status: 401 });
  }

  try {
    const { conversationId, userId, isTyping } = await request.json();

    // Basic validation
    if (!conversationId || !userId || typeof isTyping !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields: conversationId, userId, isTyping (boolean)' }, { status: 400 });
    }

    // Authorization check: Ensure the authenticated user matches the userId sending the indicator
    if (userId !== authenticatedUserId) {
        console.warn(`Potential unauthorized typing indicator: User ${authenticatedUserId} tried to send indicator for user ${userId} in conversation ${conversationId}`);
        return NextResponse.json({ error: 'Forbidden: Cannot send typing indicator for another user' }, { status: 403 });
    }

    console.log(`API: User ${userId} is ${isTyping ? 'typing' : 'stopped typing'} in conversation ${conversationId}`);

    // TODO: Implement logic - likely broadcasting this via WebSockets
    // This HTTP endpoint might just be a trigger or might not be used if sockets handle it directly.
    // For example, broadcast to other participants in conversationId.

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error processing typing indicator:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
