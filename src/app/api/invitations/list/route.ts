import { NextResponse } from 'next/server';
import { IInvitationRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { headers } from 'next/headers';

export async function GET(request: Request) {
  const supabaseClient = await createSupabaseServerClient();
  const repo: IInvitationRepository = new SupabaseInvitationRepository(supabaseClient);

  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('companyId');
    const status = url.searchParams.get('status'); // AC7: Optional status filter

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
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

    // Fetch invitations
    let invitations = await repo.findByCompanyId(companyId);

    // Filter by status if provided (AC7)
    if (status) {
      invitations = invitations.filter(inv => inv.status === status);
    }

    // Build base URL for invitation links
    const headersList = await headers();
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

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

    const pendingCount = invitations.filter(inv => inv.status === 'pending').length;
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
