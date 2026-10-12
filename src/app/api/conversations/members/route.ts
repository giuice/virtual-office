// src/app/api/conversations/members/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { IConversationRepository, NotParticipantError } from '@/repositories/interfaces';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, jsonError, requireConversationParticipant } from '@/lib/auth/authorize';

const conversationIdSchema = z.guid();

/**
 * GET /api/conversations/members?conversationId= — Phase 5 T4 (FR-023).
 *
 * The conversation's CURRENT members (conversation_members; a removed member
 * is not listed), for the mention autocomplete:
 * { members: [{ userId, displayName, avatarUrl }] } — userId is users.id; the
 * caller is included (the composer leaves itself out).
 *
 * Only a current member gets the list: non-member (including a member who
 * left) or missing conversation → 403 NOT_PARTICIPANT; no session → 401;
 * invalid conversationId → 400. The read runs with the caller's own session
 * (public.list_conversation_members re-checks membership for auth.uid()).
 */
export async function GET(request: NextRequest) {
  try {
    const parsed = conversationIdSchema.safeParse(new URL(request.url).searchParams.get('conversationId') ?? undefined);
    if (!parsed.success) {
      return jsonError(400, 'BAD_REQUEST', 'conversationId must be a UUID');
    }
    const conversationId = parsed.data.toLowerCase();

    const ctx = await requireConversationParticipant(conversationId, { missingConversationAsNotParticipant: true });
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    // User-scoped client: the database answers only a current member.
    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(ctx.supabase);
    let members;
    try {
      members = await conversationRepository.listMembers(conversationId);
    } catch (error) {
      if (error instanceof NotParticipantError) {
        // Removed between the check above and the read.
        return jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation');
      }
      throw error;
    }

    return NextResponse.json({ members }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error listing conversation members:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to list conversation members');
  }
}
