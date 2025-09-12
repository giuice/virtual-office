// src/app/api/messages/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageStatus, MessageType } from '@/types/messaging'; // Use Message from messaging types
// Removed duplicate import line
import { IMessageRepository, IConversationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository, SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Authenticate the user
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }
    
    const messageRepository: IMessageRepository = new SupabaseMessageRepository(supabase);
    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);

    // Validate required fields
    if (!body.conversationId || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, content' },
        { status: 400 }
      );
    }
    const trimmedContent = body.content.trim();
    if (trimmedContent.length === 0) {
      return NextResponse.json(
        { error: 'Content must not be empty' },
        { status: 400 }
      );
    }
    
    // Get the database user record using Supabase UID
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    
    const userRecord = await userRepository.findBySupabaseUid(user.id);
    if (!userRecord) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Prepare message data for repository using the Message type from messaging.ts
    // Apply Omit based on the structure of messaging.ts#Message
    // Clamp enums to valid values; fallback to safe defaults
    const safeType: MessageType = Object.values(MessageType).includes(body.type)
      ? body.type
      : MessageType.TEXT;
    const safeStatus: MessageStatus = Object.values(MessageStatus).includes(body.status)
      ? body.status
      : MessageStatus.SENT;

    const messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'> = {
      conversationId: body.conversationId,
      senderId: userRecord.id, // Use the database user ID as sender
      content: trimmedContent,
      type: safeType,
      status: safeStatus,
      replyToId: body.replyToId,
      // attachments need separate handling/linking after creation if provided
    };

    // Create message using repository
    const createdMessage = await messageRepository.create(messageData);

    // Update conversation last activity
    try {
      // Update conversation last activity - commented out due to interface mismatch
      // await conversationRepository.update(body.conversationId, { 
      //   lastActivity: new Date(),
      // });
      // TODO: Update conversation lastActivity when repository supports partial updates
    } catch (updateError) {
      console.warn('Failed to update conversation last activity:', updateError);
      // Don't fail the request if conversation update fails
    }
    
    return NextResponse.json({ message: createdMessage }, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
