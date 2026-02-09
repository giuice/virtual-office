import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  spaceId: z.string().uuid(),
  requestId: z.string().min(1),
  requesterName: z.string().min(1).max(200),
  requesterAvatarUrl: z.union([z.string().url(), z.literal('')]).optional(),
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

    const { spaceId, requestId, requesterName } = parsed.data;
    const requesterAvatarUrl = parsed.data.requesterAvatarUrl || undefined;

    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRepository = new SupabaseUserRepository(supabase);
    const requester = await userRepository.findBySupabaseUid(authData.user.id);

    if (!requester) {
      return NextResponse.json({ error: 'Requester profile not found' }, { status: 404 });
    }

    const { data: space, error: spaceError } = await supabase
      .from('spaces')
      .select('id, company_id')
      .eq('id', spaceId)
      .maybeSingle();

    if (spaceError || !space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    if (!requester.companyId || requester.companyId !== space.company_id) {
      return NextResponse.json({ error: 'Cross-company knock request is not allowed' }, { status: 403 });
    }

    const { count, error: recipientsError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('current_space_id', spaceId)
      .neq('id', requester.id);

    if (recipientsError) {
      return NextResponse.json({ error: 'Failed to determine knock recipients' }, { status: 500 });
    }

    const recipientCount = count ?? 0;

    const payload = {
      type: 'KNOCK_REQUEST' as const,
      requestId,
      requesterId: requester.id,
      requesterName,
      requesterAvatarUrl,
      spaceId,
      timestamp: Date.now(),
    };

    const channel = supabase.channel(`knock:space:${spaceId}`);
    try {
      await waitForSubscription(channel);
      const sendResult = await channel.send({
        type: 'broadcast',
        event: 'knock',
        payload,
      });

      if (sendResult !== 'ok') {
        throw new Error(`Realtime knock request broadcast failed: ${sendResult}`);
      }
    } finally {
      supabase.removeChannel(channel);
    }

    return NextResponse.json(
      { ok: true, requestId, recipientCount },
      { status: 200 }
    );
  } catch (error) {
    console.error('[knock/request] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to process knock request' },
      { status: 500 }
    );
  }
}
