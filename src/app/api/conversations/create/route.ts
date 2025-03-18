// src/app/api/conversations/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Conversation, ConversationType } from '@/types/messaging';
import { v4 as uuidv4 } from 'uuid';

// Mock database
// In a real application, this would be stored in a database
let conversations: Conversation[] = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.type || !body.participants || !body.participants.length) {
      return NextResponse.json(
        { error: 'Missing required fields: type, participants' },
        { status: 400 }
      );
    }
    
    // For room conversations, validate roomId and name
    if (body.type === ConversationType.ROOM && (!body.roomId || !body.name)) {
      return NextResponse.json(
        { error: 'Room conversations require roomId and name' },
        { status: 400 }
      );
    }
    
    // Create new conversation
    const newConversation: Conversation = {
      id: uuidv4(),
      type: body.type,
      participants: body.participants,
      lastActivity: new Date(body.lastActivity || new Date()),
      name: body.name,
      isArchived: false,
      unreadCount: {},
      ...(body.type === ConversationType.ROOM && { roomId: body.roomId })
    };
    
    // Add to mock database
    conversations.push(newConversation);
    
    // TODO: In a real implementation, emit Socket.io event for real-time updates
    
    return NextResponse.json({ conversation: newConversation }, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
