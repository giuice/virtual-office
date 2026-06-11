// src/app/api/conversations/archive/route.ts
import { NextResponse } from 'next/server';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { IConversationRepository } from '@/repositories/interfaces';
import { isAuthzFailure, requireConversationParticipant } from '@/lib/auth/authorize';

export async function PATCH(request: Request) {
  try {
    const { conversationId, isArchived } = await request.json();

    // Basic validation
    if (!conversationId || typeof isArchived !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, isArchived (boolean)' },
        { status: 400 }
      );
    }

    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(ctx.serviceClient);
    console.log(
      `API: Setting per-user archive status for conversation ${conversationId} to ${isArchived} for user ${ctx.dbUser.id}`
    );

    // NEW: Use per-user preference instead of global archive status
    const preferences = await conversationRepository.setUserPreference(conversationId, ctx.dbUser.id, {
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
