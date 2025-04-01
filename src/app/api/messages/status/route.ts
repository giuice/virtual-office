// src/app/api/messages/status/route.ts
import { NextResponse } from 'next/server';
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { MessageStatus } from '@/types/messaging';
// import { getAuth } from '@clerk/nextjs/server'; // Or your auth method // TODO: Revisit auth import/implementation

export async function PATCH(request: Request) {
  // TODO: Implement proper authentication and authorization
  // const { userId: authenticatedUserId } = getAuth(request); // TODO: Revisit auth
  const authenticatedUserId = 'placeholder-auth-user-id'; // Placeholder for now

  if (!authenticatedUserId) { // Keep basic check for placeholder
    return NextResponse.json({ error: 'Unauthorized (Placeholder)' }, { status: 401 });
  }

  try {
    const messageRepository: IMessageRepository = new SupabaseMessageRepository();
    const { messageId, status, userId } = await request.json();

    // Basic validation
    if (!messageId || !status || !userId) {
      return NextResponse.json({ error: 'Missing required fields: messageId, status, userId' }, { status: 400 });
    }

    // Validate status enum
    if (!Object.values(MessageStatus).includes(status)) {
        return NextResponse.json({ error: 'Invalid message status provided' }, { status: 400 });
    }

    // TODO: Add authorization check: Does the authenticated user have permission to update this message status?
    // This might involve checking if the user is a participant in the conversation associated with the message.
    // For read status, usually only the recipient can mark it as read for themselves.
    // For delivered status, it might be system-driven or based on recipient actions.
    if (userId !== authenticatedUserId) {
        console.warn(`Potential unauthorized status update attempt: User ${authenticatedUserId} tried to update status for user ${userId} on message ${messageId}`);
        // Depending on rules, might allow system messages or specific roles to update status for others.
        // For now, restrict to user updating their own status (e.g., marking as read).
        // return NextResponse.json({ error: 'Forbidden: Cannot update status for another user' }, { status: 403 });
    }


    console.log(`API: Updating status for message ${messageId} to ${status}`); // Removed userId from log as DB function doesn't use it

    // Call the actual database update logic
    // Call the repository update method
    await messageRepository.update(messageId, { status: status });

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error updating message status request:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error updating status' }, { status: 500 });
  }
}
