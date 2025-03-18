// src/app/api/messages/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageStatus, MessageType } from '@/types/messaging';
import { v4 as uuidv4 } from 'uuid';

// Mock database
let messages: Message[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.conversationId || !body.senderId || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Create new message
    const newMessage: Message = {
      id: uuidv4(),
      conversationId: body.conversationId,
      senderId: body.senderId,
      content: body.content,
      timestamp: new Date(body.timestamp || new Date()),
      type: body.type || MessageType.TEXT,
      status: body.status || MessageStatus.SENT,
      replyToId: body.replyToId,
      attachments: body.attachments || [],
      reactions: [],
      isEdited: false
    };
    
    // Add to database
    messages.push(newMessage);
    
    // TODO: In a real implementation, emit Socket.io event for real-time updates
    
    return NextResponse.json({ message: newMessage }, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
