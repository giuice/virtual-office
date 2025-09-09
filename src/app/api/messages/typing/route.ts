// src/app/api/messages/typing/route.ts
import { NextResponse } from 'next/server';
import { validateUserSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(request: Request) {
  try {
    // Use the validateUserSession helper to handle Firebase UID vs Database UUID mismatch
  const { userDbId, error: sessionError } = await validateUserSession();
    
    if (sessionError || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }
    
    const { conversationId, isTyping } = await request.json();
    
    // Basic validation
    if (!conversationId || typeof isTyping !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields: conversationId, isTyping (boolean)' }, { status: 400 });
    }
    
  // Create Supabase server client (SSR)
  const supabase = await createSupabaseServerClient();
    
    // Check if user has access to the conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('participants')
      .eq('id', conversationId)
      .single();
      
    if (convError || !conversation) {
      console.error('Error fetching conversation:', convError);
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Verify user is a participant in the conversation (DB IDs)
    if (!conversation.participants.includes(userDbId)) {
      return NextResponse.json({ error: 'Not authorized to send typing indicators in this conversation' }, { status: 403 });
    }
    
  console.log(`API: User ${userDbId} is ${isTyping ? 'typing' : 'stopped typing'} in conversation ${conversationId}`);
    
    // Send real-time typing indicator via Supabase Realtime
    // This approach broadcasts the typing status to all participants in the conversation
    const { error: broadcastError } = await supabase
      .from('typing_indicators')
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userDbId,
          is_typing: isTyping,
          timestamp: new Date().toISOString()
        },
        { onConflict: 'conversation_id,user_id' }
      );
      
    if (broadcastError) {
      console.error('Error broadcasting typing indicator:', broadcastError);
      // Continue even if broadcast fails - don't block the response
    }
    
    // If using Socket.IO alongside Supabase, you might want to also emit a socket event
    // This would require importing a socket server instance
    // socketServer.emit('typing_indicator', { conversationId, userId, isTyping });
    
    return NextResponse.json({ success: true }, { status: 200 });
    
  } catch (error) {
    console.error('Error processing typing indicator:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
