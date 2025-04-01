// src/app/api/messages/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageStatus, MessageType } from '@/types/messaging'; // Use Message from messaging types
// Removed duplicate import line
import { IMessageRepository, IConversationRepository } from '@/repositories/interfaces';
import { SupabaseMessageRepository, SupabaseConversationRepository } from '@/repositories/implementations/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messageRepository: IMessageRepository = new SupabaseMessageRepository();
    const conversationRepository: IConversationRepository = new SupabaseConversationRepository();

    // Validate required fields
    if (!body.conversationId || !body.senderId || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Prepare message data for repository using the Message type from messaging.ts
    // Apply Omit based on the structure of messaging.ts#Message
    const messageData: Omit<Message, 'id' | 'timestamp' | 'reactions' | 'attachments' | 'isEdited'> = {
      conversationId: body.conversationId, // Assuming this exists in messaging.ts#Message
      senderId: body.senderId,
      content: body.content,
      type: body.type || 'TEXT', // Use string literal for type
      status: body.status || MessageStatus.SENT, // Assuming MessageStatus is an enum/const from messaging.ts
      replyToId: body.replyToId,
      // attachments need separate handling/linking after creation if provided
    };

    // Create message using repository
    const createdMessage = await messageRepository.create(messageData);

    // Update conversation last activity
    // TODO: Update IConversationRepository.update or Conversation type to allow updating lastActivity
    // await conversationRepository.update(body.conversationId, { lastActivity: new Date() });
    
    // TODO: In a real implementation, emit Socket.io event for real-time updates
    
    return NextResponse.json({ message: createdMessage }, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
