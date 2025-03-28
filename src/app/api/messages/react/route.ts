import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateDocument, TABLES } from '@/lib/dynamo'; // Import DB functions
import { Message, MessageReaction } from '@/types/messaging'; // Import types
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
    // 1. Fetch the message
    const message = await getDocument<Message>(TABLES.MESSAGES, messageId);

    if (!message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    // 2. Calculate updated reactions
    const existingReactions = message.reactions || [];
    const userReactionIndex = existingReactions.findIndex(
      (r) => r.userId === userId && r.emoji === emoji
    );

    let updatedReactions: MessageReaction[];
    let action: 'added' | 'removed';

    if (userReactionIndex > -1) {
      // User is removing their reaction
      updatedReactions = existingReactions.filter(
        (_, index) => index !== userReactionIndex
      );
      action = 'removed';
    } else {
      // User is adding a new reaction
      const newReaction: MessageReaction = {
        emoji,
        userId,
        // Use Date object; dynamo.ts's convertDates handles serialization
        timestamp: new Date(), 
      };
      updatedReactions = [...existingReactions, newReaction];
      action = 'added';
    }

    // 3. Update the message in the database
    // Note: updateDocument in dynamo.ts handles date conversion
    await updateDocument<Message>(TABLES.MESSAGES, messageId, {
      reactions: updatedReactions,
    });
    // --- End Database Logic ---

    console.log(`API: Reaction ${action} for message ${messageId} by user ${userId}`);
    // Return the updated reactions array along with the success message
    return NextResponse.json({ message: `Reaction ${action} successfully`, reactions: updatedReactions }, { status: 200 });

  } catch (error) {
    console.error('Error processing reaction:', error);
    // Check if the error is from DynamoDB (e.g., validation error)
    if (error instanceof Error && error.name === 'ValidationException') {
       return NextResponse.json({ message: `Validation Error: ${error.message}` }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}