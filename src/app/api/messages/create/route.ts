// src/app/api/messages/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageStatus, MessageType } from '@/types/messaging'; // Use Message from messaging types
// Removed duplicate import line
import { IMessageRepository, IConversationRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository, SupabaseConversationRepository } from '@/repositories/implementations/supabase';
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
    if (!body.conversationId || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, content' },
        { status: 400 }
      );
    }
    
    // Get the database user record using Supabase UID
    const { IUserRepository } = await import('@/repositories/interfaces');
    const { SupabaseUserRepository } = await import('@/repositories/implementations/supabase');
    const userRepository: IUserRepository = new SupabaseUserRepository();
    
    const userRecord = await userRepository.findBySupabaseUid(user.id);
    if (!userRecord) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Prepare message data for repository using the Message type from messaging.ts
    // Apply Omit based on the structure of messaging.ts#Message
    const messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'> = {
      conversationId: body.conversationId,
      senderId: userRecord.id, // Use the database user ID as sender
      content: body.content,
      type: (body.type || 'text') as MessageType, // Use lowercase enum value
      status: (body.status || 'sent') as MessageStatus, // Use lowercase enum value
      replyToId: body.replyToId,
      // attachments need separate handling/linking after creation if provided
    };

    // Create message using repository
    const createdMessage = await messageRepository.create(messageData);

    // Update conversation last activity
    try {
      await conversationRepository.update(body.conversationId, { 
        lastActivity: new Date(),
        // Could also update unread_count here if needed
      });
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
