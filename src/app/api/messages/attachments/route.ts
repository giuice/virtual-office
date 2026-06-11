// src/app/api/messages/attachments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { isAuthzFailure, requireMessageParticipant } from '@/lib/auth/authorize';

/**
 * GET handler to retrieve all attachments for a specific message
 */
export async function GET(request: NextRequest) {
  try {
    // Get messageId from query params
    const searchParams = request.nextUrl.searchParams;
    const messageId = searchParams.get('messageId');
    
    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const ctx = await requireMessageParticipant(messageId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const { messageRepository } = await getSupabaseRepositories(ctx.supabase);
    
    // Get the message to verify it exists and user has access
    const message = await messageRepository.findById(messageId);
    
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
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
