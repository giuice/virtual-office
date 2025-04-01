import { NextRequest, NextResponse } from 'next/server';
import { Message } from '@/types/messaging'; // Use Message type consistent with other routes
import { IMessageRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
// Assuming MessageReaction structure is { userId: string, emoji: string } or similar based on repo methods
// TODO: Import and use actual authentication logic (e.g., verifyFirebaseAuth)
// import { verifyFirebaseAuth } from '@/lib/firebase/firebaseAdmin'; // Example import

export async function POST(request: NextRequest) {
  const messageRepository: IMessageRepository = new SupabaseMessageRepository();
  try {
    // --- Authentication ---
    // Replace this placeholder with actual authentication
    // const { userId } = await verifyFirebaseAuth(request); // Example
    const userId = 'temp-user-id-from-auth'; // Placeholder - MUST BE REPLACED
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    // --- End Authentication ---

    const { messageId, emoji } = await request.json();

    // --- Input Validation ---
    if (!messageId || typeof messageId !== 'string' || !emoji || typeof emoji !== 'string') {
      return NextResponse.json({ message: 'Missing or invalid messageId or emoji' }, { status: 400 });
    }
    // --- End Input Validation ---

    // --- Database Logic ---
    // --- Repository Logic ---
    // 1. Fetch the message using the repository to check current reaction state
    // TODO: Add findById method to IMessageRepository if it doesn't exist
    const message = await messageRepository.findById(messageId); // Assuming findById exists

    if (!message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    // 2. Determine if user is adding or removing reaction
    // Assuming message.reactions is { [emoji: string]: string[] } as before
    const reactions = message.reactions;
    // Using type assertion 'as any' as a workaround for potential type definition issues
    const userHasReacted = reactions &&
                           Object.prototype.hasOwnProperty.call(reactions, emoji) &&
                           Array.isArray((reactions as any)[emoji]) &&
                           (reactions as any)[emoji].includes(userId);
    let action: 'added' | 'removed';

    try {
      if (userHasReacted) {
        // User is removing their reaction
        await messageRepository.removeReaction(messageId, userId, emoji);
        action = 'removed';
      } else {
        // User is adding a new reaction
        // Pass reaction data as an object { userId, emoji } if required by addReaction
        await messageRepository.addReaction(messageId, { userId, emoji });
        action = 'added';
      }
    } catch (repoError) {
       console.error(`Repository error during reaction ${userHasReacted ? 'removal' : 'addition'}:`, repoError);
       // Consider more specific error handling based on repoError type if possible
       return NextResponse.json({ message: 'Error processing reaction' }, { status: 500 });
    }
    // --- End Database Logic ---

    console.log(`API: Reaction ${action} for message ${messageId} by user ${userId}`);
    // Optionally fetch the updated message again to return the latest reaction state,
    // or simply return success as the client might handle optimistic updates.
    // For now, just return success.
    return NextResponse.json({ message: `Reaction ${action} successfully` }, { status: 200 });

  } catch (error) {
    console.error('Error processing reaction request:', error);
    // General error handling, specific repo errors handled above
    return NextResponse.json({ message: 'Internal Server Error processing reaction request' }, { status: 500 });
  }
}