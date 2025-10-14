// src/app/api/conversations/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ConversationType, Conversation } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { PaginationOptions } from '@/types/common';
import { debugLogger } from '@/utils/debug-logger';

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

  const instrumentationEnabled = debugLogger.messaging.enabled();

  try {
    const searchParams = new URL(request.url).searchParams;
    const typeParam = searchParams.get('type');
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const limit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') ?? undefined;

    // NEW: Support for grouped queries, pinned, and summary
    const grouped = searchParams.get('grouped') === 'true';
    const pinnedOnly = searchParams.get('pinned') === 'true';
    const summaryOnly = searchParams.get('summary') === 'true';

    const serviceSupabase = await createSupabaseServerClient('service_role');
    const userRepository = new SupabaseUserRepository(serviceSupabase);
    const requesterProfile = await userRepository.findBySupabaseUid(authData.user.id);

    if (!requesterProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);

    // NEW: Handle summary request
    if (summaryOnly) {
      if (instrumentationEnabled) {
        debugLogger.messaging.event('api.conversations.get', 'summary_request', {
          requesterId: requesterProfile.id,
        });
      }

      const summary = await conversationRepository.getUnreadSummary(requesterProfile.id);

      if (instrumentationEnabled) {
        debugLogger.messaging.event('api.conversations.get', 'summary_success', {
          requesterId: requesterProfile.id,
          totalUnread: summary.totalUnread,
        });
      }

      return NextResponse.json({ summary });
    }

    // NEW: Handle pinned conversations request
    if (pinnedOnly) {
      if (instrumentationEnabled) {
        debugLogger.messaging.event('api.conversations.get', 'pinned_request', {
          requesterId: requesterProfile.id,
        });
      }

      const pinnedConversations = await conversationRepository.findPinnedByUser(requesterProfile.id);

      if (instrumentationEnabled) {
        debugLogger.messaging.event('api.conversations.get', 'pinned_success', {
          requesterId: requesterProfile.id,
          count: pinnedConversations.length,
        });
      }

      return NextResponse.json({
        conversations: pinnedConversations.map((conversation) => serializeConversation(conversation)),
      });
    }

    // NEW: Handle grouped request
    if (grouped) {
      if (instrumentationEnabled) {
        debugLogger.messaging.event('api.conversations.get', 'grouped_request', {
          requesterId: requesterProfile.id,
          includeArchived,
        });
      }

      const groupedResult = await conversationRepository.findByUserGrouped(requesterProfile.id, {
        includeArchived,
      });

      if (instrumentationEnabled) {
        debugLogger.messaging.event('api.conversations.get', 'grouped_success', {
          requesterId: requesterProfile.id,
          directCount: groupedResult.direct.length,
          roomCount: groupedResult.rooms.length,
        });
      }

      return NextResponse.json({
        grouped: {
          direct: groupedResult.direct.map((conversation) => serializeConversation(conversation)),
          rooms: groupedResult.rooms.map((conversation) => serializeConversation(conversation)),
        },
      });
    }

    // EXISTING: Standard paginated query
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

    if (instrumentationEnabled) {
      debugLogger.messaging.event('api.conversations.get', 'start', {
        requesterId: requesterProfile.id,
        limit: paginationOptions.limit,
        cursor: paginationOptions.cursor,
        includeArchived,
        type: paginationOptions.type,
      });
    }

    const result = await conversationRepository.findByUser(requesterProfile.id, paginationOptions);

    if (instrumentationEnabled) {
      debugLogger.messaging.event('api.conversations.get', 'success', {
        requesterId: requesterProfile.id,
        returned: result.items.length,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor ?? null,
      });
    }

    return NextResponse.json({
      conversations: result.items.map((conversation) => serializeConversation(conversation)),
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    if (instrumentationEnabled) {
      debugLogger.messaging.error('api.conversations.get', 'failure', {
        error: error instanceof Error ? error.message : error,
      });
    }
    return NextResponse.json({ error: 'Failed to retrieve conversations' }, { status: 500 });
  }
}
