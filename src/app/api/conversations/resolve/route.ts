// src/app/api/conversations/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ConversationType } from '@/types/messaging';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseConversationRepository, SupabaseSpaceRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { ConversationResolverError, ConversationResolverService } from '@/lib/services/ConversationResolverService';
import { requireAuthUser } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    const auth = await requireAuthUser();
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }
    const requesterProfile = auth.dbUser;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (typeof payload !== 'object' || payload === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const body = payload as Record<string, unknown>;
    const type = body.type;

    if (type !== ConversationType.DIRECT && type !== ConversationType.ROOM) {
      return NextResponse.json({ error: 'Unsupported conversation type' }, { status: 400 });
    }

    const serviceClient = await createSupabaseServerClient('service_role');

    const conversationRepository = new SupabaseConversationRepository(auth.supabase);
    const adminConversationRepository = new SupabaseConversationRepository(serviceClient);
    const userRepository = new SupabaseUserRepository(serviceClient);
    const spaceRepository = new SupabaseSpaceRepository(serviceClient);

    const resolver = new ConversationResolverService({
      conversationRepository,
      adminConversationRepository,
      userRepository,
      spaceRepository,
    });

    if (type === ConversationType.DIRECT) {
      const targetUserId = typeof body.userId === 'string' ? body.userId : null;
      if (!targetUserId) {
        return NextResponse.json({ error: 'userId is required for direct conversations' }, { status: 400 });
      }

      try {
        const conversation = await resolver.resolve({
          type: ConversationType.DIRECT,
          requesterId: requesterProfile.id,
          targetUserId,
        });

        return NextResponse.json({ conversation }, { status: 200 });
      } catch (error) {
        if (error instanceof ConversationResolverError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    }

    const roomId = typeof body.roomId === 'string' ? body.roomId : null;
    if (!roomId) {
      return NextResponse.json({ error: 'roomId is required for room conversations' }, { status: 400 });
    }

    try {
      const conversation = await resolver.resolve({
        type: ConversationType.ROOM,
        requesterId: requesterProfile.id,
        roomId,
      });

      return NextResponse.json({ conversation }, { status: 200 });
    } catch (error) {
      if (error instanceof ConversationResolverError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  } catch (error) {
    console.error('[ConversationResolverRoute] Unexpected error', {
      error,
      payload,
    });
    return NextResponse.json({ error: 'Failed to resolve conversation' }, { status: 500 });
  }
}
