// src/app/api/messages/attachments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { validateUserSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

/**
 * GET handler to retrieve all attachments for a specific message
 */
export async function GET(request: NextRequest) {
  try {
    // Validate user session
    const { userDbId, error: sessionError } = await validateUserSession();
    
    if (sessionError || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }
    
  // Get repositories with request-scoped client
    const serverSupabase = await createSupabaseServerClient();
    const { messageRepository } = await getSupabaseRepositories(serverSupabase);
    
    // Get messageId from query params
    const searchParams = request.nextUrl.searchParams;
    const messageId = searchParams.get('messageId');
    
    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }
    
    // Get the message to verify it exists and user has access
    const message = await messageRepository.findById(messageId);
    
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    
    // Check if user has access to the conversation
    const { data: conversation, error: convError } = await serverSupabase
      .from('conversations')
      .select('participants')
      .eq('id', message.conversationId)
      .single();
      
    if (convError || !conversation) {
      console.error('Error fetching conversation:', convError);
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Verify user is a participant in the conversation (DB IDs)
    if (!conversation.participants.includes(userDbId)) {
      return NextResponse.json({ error: 'Not authorized to access this message' }, { status: 403 });
    }
    
    // Get attachments directly from the message if already populated, or fetch them
    const attachments = message.attachments || [];
    
    return NextResponse.json({ 
      success: true,
      attachments 
    });
    
  } catch (error) {
    console.error('Error fetching message attachments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
