// src/app/api/conversations/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Conversation, ConversationType } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces'; 
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase'; 
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(request: NextRequest) {
  let userId = 'unknown';
  let userDatabaseId = 'unknown';
  let body: any = {};
  
  try {
    body = await request.json();
    
    // Get authenticated user from Supabase session
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }
    
    userId = user.id; // This is the Supabase UID
    
    console.log('Creating conversation with user ID:', userId);
    
    // Create repository instances with server client
    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    
    // Get the database user record using Supabase UID
    const userRecord = await userRepository.findBySupabaseUid(userId);
    if (!userRecord) {
      console.error('User profile not found for Supabase UID:', userId);
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    
    userDatabaseId = userRecord.id;
    console.log('Found user database ID:', userDatabaseId);

    // Validate required fields
    if (!body.type || !body.participants || !Array.isArray(body.participants)) {
      console.error('Invalid request body:', JSON.stringify(body, null, 2));
      return NextResponse.json(
        { error: 'Missing or invalid required fields: type (string), participants (array)' },
        { status: 400 }
      );
    }

    // Ensure user is part of the conversation participants
    let participants = [...body.participants];
    if (!participants.includes(userDatabaseId)) {
      // Add the current user to participants automatically
      participants.push(userDatabaseId);
      console.log('Added current user to participants:', userDatabaseId);
    }
    
    // Validate all participant IDs exist in the database
    const updatedParticipants = [];
    for (const participantId of participants) {
      const participantUser = await userRepository.findById(participantId);
      if (participantUser) {
        updatedParticipants.push(participantUser.id);
      } else {
        console.warn(`Participant not found: ${participantId} - skipping`);
      }
    }
    
    if (updatedParticipants.length === 0) {
      return NextResponse.json({ error: 'No valid participants found' }, { status: 400 });
    }

    // NEW: DM Deduplication - Check if direct conversation already exists
    if (body.type === ConversationType.DIRECT) {
      // Sort participant IDs to create consistent fingerprint
      const sortedParticipants = [...updatedParticipants].sort();
      const fingerprint = sortedParticipants.join(':');

      console.log('Checking for existing DM with fingerprint:', fingerprint);

      // Check if conversation already exists
      const existingDM = await conversationRepository.findDirectByFingerprint(fingerprint);

      if (existingDM) {
        console.log('Found existing DM conversation:', existingDM.id);
        return NextResponse.json(
          {
            conversation: existingDM,
            message: 'Existing conversation returned'
          },
          { status: 200 }
        );
      }
    }

    // Prepare data for repository create method
    const conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'> & {
      participantsFingerprint?: string;
    } = {
      type: body.type as ConversationType,
      participants: updatedParticipants,
      name: body.name || undefined, // Optional, ensure it's undefined if falsy
      roomId: body.type === ConversationType.ROOM ? body.roomId : undefined, // Conditional based on type
      isArchived: false, // Default value
      lastActivity: new Date(), // Set initial activity timestamp
    };

    // NEW: Add fingerprint for direct conversations
    if (body.type === ConversationType.DIRECT) {
      const sortedParticipants = [...updatedParticipants].sort();
      conversationData.participantsFingerprint = sortedParticipants.join(':');
    }

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
    console.error('Request body was:', JSON.stringify(body, null, 2));
    console.error('User ID:', userId);
    console.error('User database ID:', userDatabaseId);
    
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create conversation', 
        message: error instanceof Error ? error.message : String(error),
        details: errorDetails,
        debug: {
          userId,
          requestBody: body
        }
      },
      { status: 500 }
    );
  }
}
