// src/app/api/conversations/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ConversationType, Conversation } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';
import { PaginationOptions } from '@/types/common';
import { createCorrelationId, jsonSuccess } from '@/lib/api/server-error';

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
  const correlationId = createCorrelationId();
  const auth = await requireAuthUser({
    correlationId,
    pathname: '/api/conversations/get',
  });
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const typeParam = searchParams.get('type');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const limit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') ?? undefined;
    const pinnedOnly = searchParams.get('pinned') === 'true';

    const requesterProfile = auth.dbUser;

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(auth.supabase);

    if (pinnedOnly) {
      const pinnedConversations = await conversationRepository.findPinnedByUser(requesterProfile.id);

      return jsonSuccess({
        conversations: pinnedConversations.map((conversation) => serializeConversation(conversation)),
      }, correlationId);
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

    return jsonSuccess({
      conversations: result.items.map((conversation) => serializeConversation(conversation)),
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore,
    }, correlationId);
  } catch (error) {
    console.error('Error getting conversations:', error);
    return NextResponse.json({ error: 'Failed to retrieve conversations' }, { status: 500 });
  }
}
