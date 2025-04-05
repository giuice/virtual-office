// src/app/api/conversations/archive/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { validateUserSession } from '@/lib/auth/session';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';

export async function PATCH(request: Request) {
  try {
    // Validate user session to handle Firebase UID vs Database UUID mismatch
    const { userId, userDbId, error: sessionError } = await validateUserSession();
    
    if (sessionError || !userId || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }
    
    const { conversationId, isArchived } = await request.json();
    
    // Basic validation
    if (!conversationId || typeof isArchived !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields: conversationId, isArchived (boolean)' }, { status: 400 });
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
    // participants field likely contains Firebase UIDs, so compare with userId (not userDbId)
    if (!conversation.participants.includes(userId)) {
      return NextResponse.json({ error: 'Not authorized to modify this conversation' }, { status: 403 });
    }
    
    console.log(`API: Setting archive status for conversation ${conversationId} to ${isArchived} for user ${userId}`);
    
    // Call the repository method to update the archive status
    // Repository only accepts conversation ID and isArchived status per interface
    const result = await conversationRepository.setArchiveStatus(conversationId, isArchived);
    
    if (!result) {
      return NextResponse.json({ error: 'Failed to update archive status' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
    
  } catch (error) {
    console.error('Error setting conversation archive status:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
