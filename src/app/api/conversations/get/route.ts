// src/app/api/conversations/get/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ConversationType } from '@/types/messaging';
import { IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { PaginationOptions } from '@/types/common';
import { debugLogger } from '@/utils/debug-logger';

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

    const serviceSupabase = await createSupabaseServerClient('service_role');
    const userRepository = new SupabaseUserRepository(serviceSupabase);
    const requesterProfile = await userRepository.findBySupabaseUid(authData.user.id);

    if (!requesterProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
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

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(supabase);
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
      conversations: result.items.map((conversation) => ({
        ...conversation,
        lastActivity: conversation.lastActivity.toISOString(),
      })),
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
