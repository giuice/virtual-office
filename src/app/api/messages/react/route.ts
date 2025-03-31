import { NextRequest, NextResponse } from 'next/server';
// Corrected imports for specific functions and new structure
import { addReactionToMessage, removeReactionFromMessage } from '@/lib/dynamo/messages';
import { getDocument } from '@/lib/dynamo/operations'; // Import getDocument from operations
import { TABLES } from '@/lib/dynamo/utils'; // Import TABLES from utils
import { Message } from '@/types/database'; // Message type now in database.ts
// MessageReaction type from messaging.ts is no longer used directly here
// TODO: Import and use actual authentication logic (e.g., verifyFirebaseAuth)
// import { verifyFirebaseAuth } from '@/lib/firebase/firebaseAdmin'; // Example import

export async function POST(request: NextRequest) {
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
    // 1. Fetch the message to check current reaction state
    const message = await getDocument<Message>(TABLES.MESSAGES, messageId);

    if (!message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    // 2. Determine if user is adding or removing reaction based on new structure
    const userHasReacted = message.reactions?.[emoji]?.includes(userId);
    let action: 'added' | 'removed';

    try {
      if (userHasReacted) {
        // User is removing their reaction
        await removeReactionFromMessage(messageId, userId, emoji);
        action = 'removed';
      } else {
        // User is adding a new reaction
        await addReactionToMessage(messageId, userId, emoji);
        action = 'added';
      }
    } catch (dbError) {
       console.error(`Database error during reaction ${userHasReacted ? 'removal' : 'addition'}:`, dbError);
       return NextResponse.json({ message: 'Database error processing reaction' }, { status: 500 });
    }
    // --- End Database Logic ---

    console.log(`API: Reaction ${action} for message ${messageId} by user ${userId}`);
    // Optionally fetch the updated message again to return the latest reaction state,
    // or simply return success as the client might handle optimistic updates.
    // For now, just return success.
    return NextResponse.json({ message: `Reaction ${action} successfully` }, { status: 200 });

  } catch (error) {
    console.error('Error processing reaction:', error);
    // Check if the error is from DynamoDB (e.g., validation error)
    if (error instanceof Error && error.name === 'ValidationException') {
       return NextResponse.json({ message: `Validation Error: ${error.message}` }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}