// src/app/api/conversations/read/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { validateUserSession } from '@/lib/auth/session';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';

export async function PATCH(request: Request) {
  try {
    // Validate user session to handle Firebase UID vs Database UUID mismatch
    const { supabaseUid, userDbId, error: sessionError } = await validateUserSession();
    
    if (sessionError || !supabaseUid || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }
    
    const { conversationId } = await request.json();
    
    // Basic validation
    if (!conversationId) {
      return NextResponse.json({ error: 'Missing required field: conversationId' }, { status: 400 });
    }
    
    // Get repositories
    const { conversationRepository } = await getSupabaseRepositories();
    
    // Check if the conversation exists and if the user is a participant
    const supabase = createRouteHandlerClient({ cookies });
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('participants')
      .eq('id', conversationId)
      .single();
      
    if (convError || !conversation) {
      console.error('Error fetching conversation:', convError);
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Verify user is a participant in the conversation
    // participants field likely contains Supabase UIDs, so compare with userId (not userDbId)
    if (!conversation.participants.includes(supabaseUid)) {
      return NextResponse.json({ error: 'Not authorized to modify this conversation' }, { status: 403 });
    }
    
    console.log(`API: Marking conversation ${conversationId} as read for user ${supabaseUid} (DB ID: ${userDbId})`);
    
    // Call the repository method to mark as read
    // Use userDbId (Database UUID) for database operations where required by repository
    const success = await conversationRepository.markAsRead(conversationId, userDbId);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to mark conversation as read' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
    
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
