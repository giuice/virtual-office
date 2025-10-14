// src/app/api/conversations/archive/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { IConversationRepository } from '@/repositories/interfaces';

export async function PATCH(request: Request) {
  try {
    // Get authenticated user
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, isArchived } = await request.json();

    // Basic validation
    if (!conversationId || typeof isArchived !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, isArchived (boolean)' },
        { status: 400 }
      );
    }

    // Get user database record
    const serviceSupabase = await createSupabaseServerClient('service_role');
    const userRepository = new SupabaseUserRepository(serviceSupabase);
    const userProfile = await userRepository.findBySupabaseUid(authData.user.id);

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);

    // Check if the conversation exists and if the user is a participant
    const conversation = await conversationRepository.findById(conversationId);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Verify user is a participant in the conversation
    if (!conversation.participants.includes(userProfile.id)) {
      return NextResponse.json({ error: 'Not authorized to modify this conversation' }, { status: 403 });
    }

    console.log(
      `API: Setting per-user archive status for conversation ${conversationId} to ${isArchived} for user ${userProfile.id}`
    );

    // NEW: Use per-user preference instead of global archive status
    const preferences = await conversationRepository.setUserPreference(conversationId, userProfile.id, {
      isArchived,
    });

    if (!preferences) {
      return NextResponse.json({ error: 'Failed to update archive status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, preferences }, { status: 200 });
  } catch (error) {
    console.error('Error setting conversation archive status:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
