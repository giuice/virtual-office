import { NextResponse } from 'next/server';
import { IInvitationRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

/**
 * AC8: Revoke Invitation API
 * POST /api/invitations/revoke
 * Sets invitation status to 'expired' AND deletes the unconfirmed Supabase Auth user
 * Only company admins can revoke
 */
export async function POST(request: Request) {
  const [supabaseClient, supabaseAdmin] = await Promise.all([
    createSupabaseServerClient(),
    createSupabaseServerClient('service_role'),
  ]);
  const repo: IInvitationRepository = new SupabaseInvitationRepository(supabaseAdmin);

  try {
    const body = await request.json();
    const { invitationId } = body;

    if (!invitationId) {
      return NextResponse.json(
        { error: 'invitationId is required' },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    // Get the invitation to verify ownership (include email for Auth user lookup)
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('invitations')
      .select('id, token, company_id, status, email')
      .eq('id', invitationId)
      .single();

    if (invitationError || !invitation) {
      return NextResponse.json(
        { error: 'Convite não encontrado' },
        { status: 404 }
      );
    }

    // Check if invitation is already expired or accepted
    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Este convite já foi processado e não pode ser revogado' },
        { status: 400 }
      );
    }

    // Check if current user is admin of the invitation's company
    const { data: currentUserRecord } = await supabaseClient
      .from('users')
      .select('id, role, company_id')
      .eq('supabase_uid', currentUser.id)
      .single();

    if (!currentUserRecord || currentUserRecord.company_id !== invitation.company_id) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    const isAdmin = currentUserRecord.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Apenas administradores podem revogar convites' },
        { status: 403 }
      );
    }

    // AC8: Update invitation status to 'expired' using repository
    const updatedInvitation = await repo.updateStatus(invitation.token, 'expired');

    if (!updatedInvitation) {
      return NextResponse.json(
        { error: 'Falha ao revogar convite' },
        { status: 500 }
      );
    }

    // Optionally: Delete the unconfirmed Supabase Auth user to invalidate the token
    // This is done in a try-catch because it's a "nice to have" cleanup
    // The invitation is already marked expired, so even if Auth deletion fails,
    // the /join page should check invitation status before allowing signup
    let authUserDeleted = false;
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const unconfirmedAuthUser = usersData?.users?.find(
        (u: { email?: string; email_confirmed_at?: string | null }) => 
          u.email === invitation.email && !u.email_confirmed_at
      );

      if (unconfirmedAuthUser) {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
          unconfirmedAuthUser.id
        );
        if (!deleteError) {
          authUserDeleted = true;
          console.log(`[API /invitations/revoke] Deleted unconfirmed Auth user ${unconfirmedAuthUser.id}`);
        }
      }
    } catch (authError) {
      // Don't fail the revoke - invitation is already marked expired
      console.warn('[API /invitations/revoke] Could not delete Auth user:', authError);
    }

    console.log(`[API /invitations/revoke] Invitation ${invitationId} revoked by user ${currentUserRecord.id}`);

    return NextResponse.json({
      success: true,
      message: 'Convite revogado com sucesso',
      invitation: {
        id: updatedInvitation.id,
        email: updatedInvitation.email,
        status: updatedInvitation.status,
      },
      authUserDeleted,
    });
  } catch (error) {
    console.error('[API /invitations/revoke] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao revogar convite' },
      { status: 500 }
    );
  }
}
