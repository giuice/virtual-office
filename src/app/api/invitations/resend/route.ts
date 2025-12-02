import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  // Use service_role client for admin operations (sending invite emails)
  const supabaseAdmin = await createSupabaseServerClient('service_role');
  // Use regular client for DB operations with RLS
  const supabaseClient = await createSupabaseServerClient();
  
  try {
    const body = await request.json();
    const { invitationId } = body;

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Missing required field: invitationId' },
        { status: 400 }
      );
    }

    console.log('[API /invitations/resend] Received request:', { invitationId });

    // Verify requesting user is authenticated
    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    // Get the invitation
    const { data: invitation, error: inviteError } = await supabaseClient
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Convite não encontrado' },
        { status: 404 }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Apenas convites pendentes podem ser reenviados' },
        { status: 400 }
      );
    }

    // Verify company exists and user is admin
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('id, admin_ids')
      .eq('id', invitation.company_id)
      .single();
    
    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Empresa não encontrada' },
        { status: 404 }
      );
    }

    // Check if current user is admin of this company
    const { data: currentUserRecord } = await supabaseClient
      .from('users')
      .select('id, role')
      .eq('supabase_uid', currentUser.id)
      .single();
    
    const isAdmin = currentUserRecord?.role === 'admin' || 
                    (company.admin_ids && company.admin_ids.includes(currentUserRecord?.id));
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Apenas administradores podem reenviar convites' },
        { status: 403 }
      );
    }

    // Build redirect URL for after email confirmation
    const headersList = await headers();
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectTo = `${protocol}://${host}/join?token=${invitation.token}`;

    console.log('[API /invitations/resend] Resending invite email via Supabase Auth...');

    // Resend invitation email via Supabase Auth Admin API
    const { data: inviteData, error: resendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      invitation.email,
      {
        redirectTo,
        data: {
          invitation_token: invitation.token,
          invited_company_id: invitation.company_id,
          invited_role: invitation.role,
        }
      }
    );

    if (resendError) {
      console.error('[API /invitations/resend] Supabase resend error:', resendError);
      
      // Handle specific errors
      if (resendError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'Este email já está cadastrado no sistema. O usuário pode fazer login diretamente.' },
          { status: 409 }
        );
      }
      
      throw new Error(`Falha ao reenviar email: ${resendError.message}`);
    }

    console.log('[API /invitations/resend] Invite email resent successfully');

    return NextResponse.json({
      success: true,
      message: 'Email de convite reenviado com sucesso',
    }, { status: 200 });
    
  } catch (error) {
    console.error('[API /invitations/resend] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao reenviar email'
    }, { status: 500 });
  }
}
