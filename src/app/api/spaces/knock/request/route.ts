import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase/SupabaseUserRepository';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  spaceId: z.string().uuid(),
  requestId: z.string().min(1),
  requesterName: z.string().min(1).max(200),
  requesterAvatarUrl: z.union([z.string().url(), z.literal('')]).optional(),
});

/**
 * Validates the knock request (auth, company, space), inserts into knock_requests table,
 * and returns recipient count. Real-time notification delivered via postgres_changes.
 */
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
    const supabaseAdmin = await createSupabaseServerClient('service_role');
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRepository = new SupabaseUserRepository(supabaseAdmin);
    const requester = await userRepository.findBySupabaseUid(authData.user.id);

    if (!requester) {
      return NextResponse.json({ error: 'Requester profile not found' }, { status: 404 });
    }

    const { data: space, error: spaceError } = await supabaseAdmin
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

    const { count, error: recipientsError } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('current_space_id', spaceId)
      .neq('id', requester.id);

    if (recipientsError) {
      return NextResponse.json({ error: 'Failed to determine knock recipients' }, { status: 500 });
    }

    const recipientCount = count ?? 0;

    // Clean up old expired/stale knock requests for this space (older than 2 minutes)
    const { error: cleanupError } = await supabaseAdmin
      .from('knock_requests')
      .delete()
      .eq('space_id', spaceId)
      .lt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString());
    if (cleanupError) {
      console.warn('[knock/request] Failed to cleanup stale knock requests:', cleanupError.message);
    }

    // Insert the knock request — triggers postgres_changes for occupants listening
    const { error: insertError } = await supabaseAdmin
      .from('knock_requests')
      .insert({
        id: requestId,
        space_id: spaceId,
        requester_id: requester.id,
        requester_name: requesterName,
        requester_avatar_url: requesterAvatarUrl ?? null,
        status: 'pending',
      });

    if (insertError) {
      console.error('[knock/request] Failed to insert knock request:', insertError.message);
      return NextResponse.json({ error: 'Failed to create knock request', details: insertError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        requestId,
        requesterId: requester.id,
        requesterName,
        requesterAvatarUrl,
        recipientCount,
      },
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
