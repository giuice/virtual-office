// src/app/api/messages/fence/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { IMessageRepository, NotParticipantError } from '@/repositories/interfaces';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { authorizeConversationParticipant, isAuthzFailure, jsonError } from '@/lib/auth/authorize';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { requireAuthUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import {
  attemptSupersededResponse,
  isUuid,
  parseAttemptGeneration,
  parseExpectedSenderId,
} from '@/lib/messaging/message-attempts';

/**
 * POST /api/messages/fence — Phase 5 T2 (FR-006, FR-011, FR-034, BR-001,
 * BR-005; SPEC section 12): fence/lookup of the CALLER'S OWN composition key.
 * Body: { conversationId, clientMessageId, attemptGeneration, expectedSenderId }
 * (all required). The key is always scoped to the authenticated sender
 * (users.id resolved from the session), so another user's key is never read
 * or changed: it is simply a different (empty) key of the caller.
 *
 * 200 { outcome: 'stored', clientMessageId, attemptGeneration, message } — the
 *     key's message is committed (the item resolves as delivered); `message`
 *     is null when it was committed and has been deleted since;
 * 200 { outcome: 'not_stored', clientMessageId, attemptGeneration } — nothing
 *     is stored and no attempt older than attemptGeneration can commit any more;
 * 409 ATTEMPT_SUPERSEDED — a newer generation exists (nothing changed);
 * 403 SENDER_MISMATCH (expectedSenderId is not the authenticated user; nothing
 *     fenced), 403 NOT_PARTICIPANT (incl. a missing conversation), 401 when not
 *     signed in, 400 for malformed fields, 429 when rate limited.
 * Never creates a message.
 *
 * Phase 5 T3 (FR-008): authenticated first (401, nobody charged); every
 * authenticated call — malformed ones included — then consumes the caller's
 * fence budget ('message:fence', shared with the fence step of
 * generation-carrying creates). Exhausted, or not checkable (fail-closed):
 * 429 `rate_limited`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthUser();
    if ('errorResponse' in auth) {
      return auth.errorResponse;
    }
    const serviceClient = await createSupabaseServerClient('service_role');
    const overFenceBudget = await enforceRateLimit(serviceClient, auth.dbUser.id, 'message:fence');
    if (overFenceBudget) {
      return overFenceBudget;
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON payload');
    }

    if (!isUuid(body.conversationId)) {
      return jsonError(400, 'BAD_REQUEST', 'conversationId must be a UUID');
    }
    const conversationId = body.conversationId.toLowerCase();
    if (!isUuid(body.clientMessageId)) {
      return jsonError(400, 'INVALID_CLIENT_MESSAGE_ID', 'clientMessageId must be a UUID');
    }
    const clientMessageId = body.clientMessageId.toLowerCase();
    if (body.attemptGeneration === undefined || body.attemptGeneration === null) {
      return jsonError(400, 'INVALID_ATTEMPT_GENERATION', 'attemptGeneration is required');
    }
    const attemptGeneration = parseAttemptGeneration(body.attemptGeneration, true);
    if (!attemptGeneration.ok) {
      return attemptGeneration.response;
    }
    const generation = attemptGeneration.value as number;
    const expectedSenderId = parseExpectedSenderId(body.expectedSenderId, true);
    if (!expectedSenderId.ok) {
      return expectedSenderId.response;
    }

    const ctx = await authorizeConversationParticipant(auth, serviceClient, conversationId, {
      expectedSenderId: expectedSenderId.value,
      missingConversationAsNotParticipant: true,
    });
    if (isAuthzFailure(ctx)) {
      return ctx.errorResponse;
    }
    const { dbUser, conversation } = ctx;

    const messageRepository: IMessageRepository = new SupabaseMessageRepository(serviceClient);
    let fence;
    try {
      fence = await messageRepository.fenceClientMessage(
        { senderId: dbUser.id, conversationId: conversation.id, clientMessageId },
        generation
      );
    } catch (error) {
      // Only the database's explicit membership refusal is a 403; a grant or
      // other infrastructure failure answers 500 (recoverable).
      if (error instanceof NotParticipantError) {
        return jsonError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation');
      }
      throw error;
    }

    if (fence.outcome === 'superseded') {
      return attemptSupersededResponse();
    }
    if (fence.outcome === 'not_stored') {
      return NextResponse.json(
        { outcome: 'not_stored', clientMessageId, attemptGeneration: generation },
        { status: 200 }
      );
    }

    const stored = fence.messageId ? await messageRepository.findById(fence.messageId) : null;
    if (!stored) {
      // Committed under the key and deleted since: delivered, never resent.
      return NextResponse.json(
        { outcome: 'stored', clientMessageId, attemptGeneration: generation, message: null },
        { status: 200 }
      );
    }
    return NextResponse.json(
      {
        outcome: 'stored',
        clientMessageId,
        attemptGeneration: generation,
        // Not other users' pins or stars, which findById (service client) loads.
        message: { ...stored, pins: undefined, stars: undefined, clientMessageId },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fencing message attempt:', error);
    return jsonError(500, 'INTERNAL_ERROR', 'Failed to fence message attempt');
  }
}
