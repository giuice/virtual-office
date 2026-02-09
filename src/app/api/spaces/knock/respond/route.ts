import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  spaceId: z.string().uuid(),
  requestId: z.string().min(1),
  requesterId: z.string().uuid(),
  requesterName: z.string().min(1).max(200),
  decision: z.enum(['APPROVE', 'DENY']),
});

async function waitForSubscription(channel: RealtimeChannel, timeoutMs = 6000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Realtime channel subscription timed out'));
    }, timeoutMs);

    channel.subscribe((status, err) => {
      if (settled) return;
      if (err) {
        settled = true;
        clearTimeout(timer);
        reject(err);
        return;
      }

      if (status === 'SUBSCRIBED') {
        settled = true;
        clearTimeout(timer);
        resolve();
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Realtime channel failed to subscribe: ${status}`));
      }
    });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { spaceId, requestId, requesterId, requesterName, decision } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRepository = new SupabaseUserRepository(supabase);
    const responder = await userRepository.findBySupabaseUid(authData.user.id);

    if (!responder) {
      return NextResponse.json({ error: 'Responder profile not found' }, { status: 404 });
    }

    if (responder.currentSpaceId !== spaceId) {
      return NextResponse.json(
        { error: 'Only occupants currently in this space can respond to knocks' },
        { status: 403 }
      );
    }

    const { data: requester, error: requesterError } = await supabase
      .from('users')
      .select('id, company_id, display_name')
      .eq('id', requesterId)
      .maybeSingle();

    if (requesterError || !requester) {
      return NextResponse.json({ error: 'Requester profile not found' }, { status: 404 });
    }

    if (!responder.companyId || responder.companyId !== requester.company_id) {
      return NextResponse.json({ error: 'Cross-company knock response is not allowed' }, { status: 403 });
    }

    // Best-effort action logging as a room system message.
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('room_id', spaceId)
      .maybeSingle();

    if (conversation?.id) {
      const logMessage =
        decision === 'APPROVE'
          ? `${responder.displayName} approved a knock request from ${requester.display_name ?? requesterName}.`
          : `${responder.displayName} denied a knock request from ${requester.display_name ?? requesterName}.`;

      const { error: logError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_id: responder.id,
        content: logMessage,
        type: 'system',
        status: 'sent',
      });

      if (logError) {
        console.warn('[knock/respond] Failed to write action log message:', logError.message);
      }
    }

    const responsePayload = {
      type: 'KNOCK_RESPONSE' as const,
      requestId,
      decision,
      responderId: responder.id,
      responderName: responder.displayName,
      responderValidated: true,
      requesterId,
      spaceId,
      timestamp: Date.now(),
    };

    const channel = supabase.channel(`knock:space:${spaceId}`);
    try {
      await waitForSubscription(channel);
      const sendResult = await channel.send({
        type: 'broadcast',
        event: 'knock',
        payload: responsePayload,
      });
      if (sendResult !== 'ok') {
        throw new Error(`Realtime knock response broadcast failed: ${sendResult}`);
      }
    } finally {
      supabase.removeChannel(channel);
    }

    return NextResponse.json({ ok: true, response: responsePayload }, { status: 200 });
  } catch (error) {
    console.error('[knock/respond] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to process knock response' },
      { status: 500 }
    );
  }
}
