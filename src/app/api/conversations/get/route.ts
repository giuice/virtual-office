// src/app/api/conversations/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ConversationType, Conversation } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { PaginationOptions } from '@/types/common';

// Helper to serialize conversation dates and preferences
function serializeConversation(conversation: Conversation) {
  return {
    ...conversation,
    lastActivity: conversation.lastActivity.toISOString(),
    preferences: conversation.preferences
      ? {
          ...conversation.preferences,
          createdAt: conversation.preferences.createdAt.toISOString(),
          updatedAt: conversation.preferences.updatedAt.toISOString(),
        }
      : undefined,
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const typeParam = searchParams.get('type');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const limit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') ?? undefined;
    const pinnedOnly = searchParams.get('pinned') === 'true';

    const serviceSupabase = await createSupabaseServerClient('service_role');
    const userRepository = new SupabaseUserRepository(serviceSupabase);
    const requesterProfile = await userRepository.findBySupabaseUid(authData.user.id);

    if (!requesterProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);

    if (pinnedOnly) {
      const pinnedConversations = await conversationRepository.findPinnedByUser(requesterProfile.id);

      return NextResponse.json({
        conversations: pinnedConversations.map((conversation) => serializeConversation(conversation)),
      });
    }

    // Standard paginated query
    const paginationOptions: PaginationOptions & {
      type?: ConversationType;
      includeArchived?: boolean;
    } = {
      limit: Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100),
      cursor,
      includeArchived,
    };

    if (typeParam === ConversationType.DIRECT || typeParam === ConversationType.ROOM) {
      paginationOptions.type = typeParam;
    }

    const result = await conversationRepository.findByUser(requesterProfile.id, paginationOptions);

    return NextResponse.json({
      conversations: result.items.map((conversation) => serializeConversation(conversation)),
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    return NextResponse.json({ error: 'Failed to retrieve conversations' }, { status: 500 });
  }
}
