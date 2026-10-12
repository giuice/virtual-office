// src/app/api/conversations/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { requireAuthUser } from '@/lib/auth/session';
import { jsonError } from '@/lib/auth/authorize';
import { ConversationMembershipError, IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';

/**
 * POST { conversationId } — joins the requester to a ROOM conversation.
 *
 * Phase 5 T28: the membership is written by public.join_room_conversation,
 * which re-checks, under row locks, that the conversation is a room
 * conversation, that the requester passes the room's access rules
 * (ConversationResolverService.assertRoomAccess, mirrored in SQL), and that
 * the requester's membership was not revoked — so a revocation that commits
 * while this request is in flight is never overridden. Direct/group
 * conversations are never joinable (audit S-01). Idempotent for a current
 * member (membership row, not the participants array).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthUser();
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }
    const { dbUser } = auth;

    let body: { conversationId?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    if (!conversationId) {
      return jsonError(400, 'BAD_REQUEST', 'conversationId is required');
    }

    const serviceClient = await createSupabaseServerClient('service_role');
    const convoRepo: IConversationRepository = new SupabaseConversationRepository(serviceClient);

    const existing = await convoRepo.findById(conversationId);
    if (!existing) {
      return jsonError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    }

    try {
      await convoRepo.joinRoomConversation(conversationId, dbUser.id);
    } catch (joinError) {
      if (joinError instanceof ConversationMembershipError) {
        return jsonError(joinError.status, joinError.code, joinMessage(joinError));
      }
      throw joinError;
    }

    const conversation = await convoRepo.findById(conversationId);
    if (!conversation) {
      return jsonError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    }
    return NextResponse.json({ conversation }, { status: 200 });
  } catch (error) {
    console.error('Error joining conversation:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

function joinMessage(error: ConversationMembershipError): string {
  switch (error.code) {
    case 'JOIN_FORBIDDEN':
      return 'Only room conversations can be joined';
    case 'ROOM_ACCESS_DENIED':
      return 'Room conversation not accessible for this user';
    case 'MEMBERSHIP_REVOKED':
      return 'Your membership in this conversation was removed';
    case 'ROOM_NOT_FOUND':
      return 'Room not found';
    case 'USER_NOT_FOUND':
      return 'User not found';
    case 'CONVERSATION_NOT_FOUND':
      return 'Conversation not found';
  }
}
