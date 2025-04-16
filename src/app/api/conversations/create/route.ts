// src/app/api/conversations/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Conversation, ConversationType } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { validateUserSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { supabaseUid: userId, userDbId, error: sessionError } = await validateUserSession();

    if (sessionError || !userId || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized: Missing user ID' }, { status: 401 });
    }

    console.log('Creating conversation with user ID:', userId);

    // Create repository instances
    const conversationRepository: IConversationRepository = new SupabaseConversationRepository();
    const userRepository: IUserRepository = new SupabaseUserRepository();

    // Get the database UUID for this user if needed
    let userDatabaseId = userId;

    // Check if the ID is a Firebase UID (not a UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      // This is a Firebase UID, get the corresponding database ID
      const user = await userRepository.findBySupabaseUid(userId);
      if (!user) {
        console.error('User not found with Firebase UID:', userId);
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      userDatabaseId = user.id;
      console.log('Found user database ID:', userDatabaseId);
    }

    // Validate required fields
    if (!body.type || !body.participants || !Array.isArray(body.participants) || body.participants.length === 0) {
      console.error('Invalid request body:', JSON.stringify(body, null, 2));
      return NextResponse.json(
        { error: 'Missing or invalid required fields: type (string), participants (non-empty array)' },
        { status: 400 }
      );
    }

    // Ensure user is part of the conversation participants
    let participants = [...body.participants];
    if (!participants.includes(userDatabaseId) && !participants.includes(userId)) {
      // Add the user to participants automatically
      participants.push(userDatabaseId);
      console.log('Added current user to participants:', userDatabaseId);
    }

    // Replace any Firebase UIDs with database UUIDs in participants
    const updatedParticipants = [...participants];
    for (let i = 0; i < updatedParticipants.length; i++) {
      const participantId = updatedParticipants[i];
      // Check if this is a Firebase UID
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(participantId)) {
        // Get the database UUID
        const user = await userRepository.findBySupabaseUid(participantId);
        if (user) {
          updatedParticipants[i] = user.id;
          console.log(`Replaced Firebase UID ${participantId} with database ID ${user.id}`);
        } else {
          console.warn(`No user found for Firebase UID ${participantId} - keeping as is`);
        }
      }
    }

    // Prepare data for repository create method
    const conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'> = {
      type: body.type as ConversationType,
      participants: updatedParticipants,
      name: body.name || undefined, // Optional, ensure it's undefined if falsy
      roomId: body.type === ConversationType.ROOM ? body.roomId : undefined, // Conditional based on type
      isArchived: false, // Default value
      lastActivity: new Date(), // Set initial activity timestamp
    };

    console.log('Creating conversation with data:', JSON.stringify(conversationData, null, 2));

    // Validate room-specific fields if type is ROOM
    if (conversationData.type === ConversationType.ROOM && !conversationData.roomId) {
      console.error('Room conversation missing roomId:', JSON.stringify(body, null, 2));
      return NextResponse.json(
        { error: 'Room conversations require roomId' },
        { status: 400 }
      );
    }

    // Call repository to create the conversation
    const newConversation = await conversationRepository.create(conversationData);
    console.log('Conversation created successfully:', JSON.stringify(newConversation, null, 2));

    return NextResponse.json({ conversation: newConversation }, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);

    // Detailed error for debugging
    let errorDetails = '';
    if (error instanceof Error) {
      errorDetails = `${error.name}: ${error.message}`;
      if (error.stack) {
        errorDetails += `\nStack: ${error.stack}`;
      }
    } else {
      errorDetails = String(error);
    }

    console.error('Error details:', errorDetails);

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: 'Failed to create conversation',
        message: error instanceof Error ? error.message : String(error),
        details: errorDetails
      },
      { status: 500 }
    );
  }
}
