import { NextResponse } from 'next/server';
import { IInvitationRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

function resolveAppBaseUrl(request: Request): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) {
    try {
      return new URL(configuredAppUrl).origin;
    } catch (error) {
      console.warn('[API /invitations/list] Invalid NEXT_PUBLIC_APP_URL, falling back to request origin:', error);
    }
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

export async function GET(request: Request) {
  const [supabaseClient, supabaseAdmin] = await Promise.all([
    createSupabaseServerClient(),
    createSupabaseServerClient('service_role'),
  ]);
  const repo: IInvitationRepository = new SupabaseInvitationRepository(supabaseAdmin);

  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('companyId');
    const status = url.searchParams.get('status'); // AC7: Optional status filter

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const allowedStatuses = new Set(['pending', 'accepted', 'expired']);
    if (status && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: 'status must be pending, accepted, or expired' }, { status: 400 });
    }

    // Verify user is authenticated and is admin of the company
    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json({ error: 'Usuário não autenticado' }, { status: 401 });
    }

    // Check if current user is admin of this company
    const { data: currentUserRecord } = await supabaseClient
      .from('users')
      .select('id, role, company_id')
      .eq('supabase_uid', currentUser.id)
      .single();

    if (!currentUserRecord || currentUserRecord.company_id !== companyId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const isAdmin = currentUserRecord.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Apenas administradores podem listar convites' }, { status: 403 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    // Fetch invitations
    let invitations = (await repo.findByCompanyId(companyId)).map((invitation) => ({
      ...invitation,
      status: invitation.status === 'pending' && invitation.expiresAt <= nowMs
        ? 'expired' as const
        : invitation.status,
    }));

    // Filter by status if provided (AC7)
    if (status) {
      invitations = invitations.filter(inv => inv.status === status);
    }

    // Build base URL for invitation links
    const baseUrl = resolveAppBaseUrl(request);

    // Add inviteUrl to each invitation (AC7)
    const invitationsWithUrl = invitations.map(inv => ({
      ...inv,
      inviteUrl: `${baseUrl}/join?token=${inv.token}`,
    }));

    // Get user count and pending invitations for limit info (AC4)
    const { count: userCount } = await supabaseClient
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    const { count: pendingCountDb } = await supabaseAdmin
      .from('invitations')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .gt('expires_at', nowIso);

    const pendingCount = pendingCountDb || 0;
    const total = (userCount || 0) + pendingCount;
    const limit = 10;
    const remaining = Math.max(0, limit - total);

    return NextResponse.json({
      invitations: invitationsWithUrl,
      total: invitations.length,
      limit,
      remaining,
      userCount: userCount || 0,
      pendingCount,
    });
  } catch (error) {
    console.error('Error listing invitations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list invitations' },
      { status: 500 }
    );
  }
}
