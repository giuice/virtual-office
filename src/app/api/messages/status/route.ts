// src/app/api/messages/status/route.ts
import { NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/auth/session';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { MessageStatus } from '@/types/messaging';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function PATCH(request: Request) {
  try {
    // Use the validateUserSession helper to handle Firebase UID vs Database UUID mismatch
  const { userDbId, error: sessionError } = await validateUserSession();

    if (sessionError || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }

  const serverSupabase = await createSupabaseServerClient();
  const { messageRepository } = await getSupabaseRepositories(serverSupabase);
    const { messageId, status } = await request.json();

    // Basic validation
    if (!messageId || !status) {
      return NextResponse.json({ error: 'Missing required fields: messageId, status' }, { status: 400 });
    }

    // Validate status enum
    if (!Object.values(MessageStatus).includes(status)) {
      return NextResponse.json({ error: 'Invalid message status provided' }, { status: 400 });
    }

    // Get the message to check permissions
    const message = await messageRepository.findById(messageId);
    
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Authorization checks - different for different status types
    // For DELIVERED and READ, the receiver should be updating their status
    // For SENT, typically system or sender updates
    // For FAILED, typically system updates
    
    // For receiver actions (DELIVERED, READ), user must be a participant in the conversation
    // For system/sender actions, user must be the sender
    if (status === MessageStatus.DELIVERED || status === MessageStatus.READ) {
      // Check if user is a participant in the conversation
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('conversations')
        .select('participants')
        .eq('id', message.conversationId)
        .single();
        
      if (error || !data) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
      
      // Check if the user is a participant in the conversation (DB ID)
      if (!data.participants.includes(userDbId)) {
        return NextResponse.json({ error: 'Unauthorized: Not a participant in this conversation' }, { status: 403 });
      }
    } else if (status === MessageStatus.SENT || status === MessageStatus.FAILED) {
      // For system/sender updates, check if user is the sender
      // sender_id in database likely uses Database UUID, so compare with userDbId
      if (message.senderId !== userDbId) {
        return NextResponse.json({ error: 'Unauthorized: Cannot update status for messages you did not send' }, { status: 403 });
      }
    }

    console.log(`API: Updating status for message ${messageId} to ${status}`);

    // Call the repository update method
    await messageRepository.update(messageId, { status });

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error updating message status request:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error updating status' }, { status: 500 });
  }
}
