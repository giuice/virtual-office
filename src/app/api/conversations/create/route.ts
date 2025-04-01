// src/app/api/conversations/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Conversation, ConversationType } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase'; // Import implementation
// import { getAuth } from '@clerk/nextjs/server'; // TODO: Revisit auth import/implementation

export async function POST(request: NextRequest) {
  // TODO: Implement proper authentication and authorization
  // const { userId: authenticatedUserId } = getAuth(request); // TODO: Revisit auth
  const authenticatedUserId = 'placeholder-auth-user-id'; // Placeholder for now

  if (!authenticatedUserId) {
    return NextResponse.json({ error: 'Unauthorized (Placeholder)' }, { status: 401 });
  }

  const conversationRepository: IConversationRepository = new SupabaseConversationRepository(); // Instantiate repository

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.type || !body.participants || !Array.isArray(body.participants) || body.participants.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid required fields: type (string), participants (non-empty array)' },
        { status: 400 }
      );
    }

    // Ensure authenticated user is part of the conversation participants
    if (!body.participants.includes(authenticatedUserId)) {
        // Depending on use case, you might add the creator automatically or return an error
        // Adding automatically:
        // body.participants.push(authenticatedUserId);
        // Returning error:
         return NextResponse.json({ error: 'Creator must be a participant' }, { status: 403 });
    }


    // Prepare data for repository create method
    // Excludes id, createdAt, updatedAt, lastMessageTimestamp, unreadCount (handled by DB/repo)
    const conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'> = {
      type: body.type as ConversationType,
      participants: body.participants,
      name: body.name, // Optional, usually for group/room
      roomId: body.type === ConversationType.ROOM ? body.roomId : undefined, // Conditional based on type
      isArchived: false, // Default value
      lastActivity: new Date(), // Set initial activity timestamp
      // lastActivity is likely managed via lastMessageTimestamp now, omit here
    };

    // Validate room-specific fields if type is ROOM
    if (conversationData.type === ConversationType.ROOM && !conversationData.roomId) {
      return NextResponse.json(
        { error: 'Room conversations require roomId' },
        { status: 400 }
      );
      // Name validation might also be needed here if required for rooms
    }


    // Call repository to create the conversation
    const newConversation = await conversationRepository.create(conversationData);

    // TODO: Emit Socket.io event for real-time updates

    return NextResponse.json({ conversation: newConversation }, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    // Consider more specific error handling based on repository errors
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
