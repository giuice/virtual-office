// src/app/api/conversations/read/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { IConversationRepository } from '@/repositories/interfaces';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';
import { isAuthzFailure, jsonError, requireConversationParticipant } from '@/lib/auth/authorize';

export async function PATCH(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }

    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    if (!conversationId) {
      return jsonError(400, 'BAD_REQUEST', 'Missing required field: conversationId');
    }

    // Audit B-01: participants hold DB UUIDs, so the participant check must use
    // dbUser.id — the gate already compares the right identity. The legacy route
    // compared the Supabase UID and returned a permanent 403.
    const ctx = await requireConversationParticipant(conversationId);
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }

    const conversationRepository: IConversationRepository = new SupabaseConversationRepository(
      ctx.serviceClient
    );
    // Phase 2.2: atomic RPC — sets conversation_members.last_read_at and
    // writes per-message read receipts in one transaction.
    const success = await conversationRepository.markConversationRead(conversationId, ctx.dbUser.id);

    if (!success) {
      return jsonError(500, 'INTERNAL_ERROR', 'Failed to mark conversation as read');
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Internal Server Error');
  }
}
