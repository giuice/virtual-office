// src/app/api/conversations/join/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { requireAuthUser } from '@/lib/auth/session';
import { jsonError } from '@/lib/auth/authorize';
import { ConversationType } from '@/types/messaging';
import { IConversationRepository, ISpaceRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository, SupabaseSpaceRepository } from '@/repositories/implementations/supabase';
import { ConversationResolverError, ConversationResolverService } from '@/lib/services/ConversationResolverService';

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

    // Idempotent: already a participant — nothing to join.
    if (existing.participants.includes(dbUser.id)) {
      return NextResponse.json({ conversation: existing }, { status: 200 });
    }

    // Only room conversations are joinable. Direct/group membership is fixed
    // at creation (resolver/invite paths) — joining someone else's DM would
    // grant full read/write of its history (audit S-01).
    if (existing.type !== ConversationType.ROOM || !existing.roomId) {
      return jsonError(403, 'JOIN_FORBIDDEN', 'Only room conversations can be joined');
    }

    const spaceRepo: ISpaceRepository = new SupabaseSpaceRepository(serviceClient);
    const space = await spaceRepo.findById(existing.roomId);
    if (!space) {
      return jsonError(404, 'ROOM_NOT_FOUND', 'Room not found');
    }

    try {
      ConversationResolverService.assertRoomAccess(dbUser, space);
    } catch (accessError) {
      if (accessError instanceof ConversationResolverError) {
        return jsonError(accessError.status, 'ROOM_ACCESS_DENIED', accessError.message);
      }
      throw accessError;
    }

    const conversation = await convoRepo.addParticipant(conversationId, dbUser.id);
    if (!conversation) {
      return jsonError(500, 'INTERNAL_ERROR', 'Failed to join conversation');
    }

    return NextResponse.json({ conversation }, { status: 200 });
  } catch (error) {
    console.error('Error joining conversation:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}
