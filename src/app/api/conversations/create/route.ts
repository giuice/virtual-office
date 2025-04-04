// src/app/api/conversations/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Conversation, ConversationType } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces'; // Import interface
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase'; // Import implementation
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Get the Firebase UID from the Authorization header
    const authHeader = request.headers.get('Authorization');
    let userId = '';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Extract the token
      const token = authHeader.substring(7);
      // In a real implementation, you would verify this token
      // For now, we'll assume it's the Firebase UID directly for simplicity
      userId = token;
    }
    
    // If no Authorization header, try to get userId from the request body
    if (!userId && body.userId) {
      userId = body.userId;
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Missing user ID' }, { status: 401 });
    }
    
    const conversationRepository: IConversationRepository = new SupabaseConversationRepository();
    const userRepository: IUserRepository = new SupabaseUserRepository();
    
    // Get the database UUID for this user if needed
    let userDatabaseId = userId;
    
    // Check if the ID is a Firebase UID (not a UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      // This is a Firebase UID, get the corresponding database ID
      const user = await userRepository.findByFirebaseUid(userId);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      userDatabaseId = user.id;
    }

    // Validate required fields
    if (!body.type || !body.participants || !Array.isArray(body.participants) || body.participants.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid required fields: type (string), participants (non-empty array)' },
        { status: 400 }
      );
    }

    // Ensure user is part of the conversation participants
    if (!body.participants.includes(userDatabaseId) && !body.participants.includes(userId)) {
      // Add the user to participants automatically
      body.participants.push(userDatabaseId);
    }
    
    // Replace any Firebase UIDs with database UUIDs in participants
    const updatedParticipants = [...body.participants];
    for (let i = 0; i < updatedParticipants.length; i++) {
      const participantId = updatedParticipants[i];
      // Check if this is a Firebase UID
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(participantId)) {
        // Get the database UUID
        const user = await userRepository.findByFirebaseUid(participantId);
        if (user) {
          updatedParticipants[i] = user.id;
        }
      }
    }

    // Prepare data for repository create method
    const conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'> = {
      type: body.type as ConversationType,
      participants: updatedParticipants,
      name: body.name, // Optional, usually for group/room
      roomId: body.type === ConversationType.ROOM ? body.roomId : undefined, // Conditional based on type
      isArchived: false, // Default value
      lastActivity: new Date(), // Set initial activity timestamp
    };

    // Validate room-specific fields if type is ROOM
    if (conversationData.type === ConversationType.ROOM && !conversationData.roomId) {
      return NextResponse.json(
        { error: 'Room conversations require roomId' },
        { status: 400 }
      );
    }

    // Call repository to create the conversation
    const newConversation = await conversationRepository.create(conversationData);

    return NextResponse.json({ conversation: newConversation }, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to create conversation', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
