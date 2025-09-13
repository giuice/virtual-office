// src/app/api/conversations/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { IConversationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';

export async function POST(request: NextRequest) {
  try {
  const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await request.json();
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

  const userRepo: IUserRepository = new SupabaseUserRepository(supabase);
  // Use service_role for conversation repo to bypass RLS when adding participant
  const serviceClient = await createSupabaseServerClient('service_role');
  const convoRepo: IConversationRepository = new SupabaseConversationRepository(serviceClient);

    const userProfile = await userRepo.findBySupabaseUid(user.id);
    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Ensure conversation exists; helps return 404 vs generic failure
    const existing = await convoRepo.findById(conversationId);
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const conversation = await convoRepo.addParticipant(conversationId, userProfile.id);
    if (!conversation) {
      return NextResponse.json({ error: 'Failed to join conversation' }, { status: 500 });
    }

    return NextResponse.json({ conversation }, { status: 200 });
  } catch (error) {
    console.error('Error joining conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
