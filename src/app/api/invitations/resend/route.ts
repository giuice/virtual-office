import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

function resolveAppBaseUrl(request: Request): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) {
    try {
      return new URL(configuredAppUrl).origin;
    } catch (error) {
      console.warn('[API /invitations/resend] Invalid NEXT_PUBLIC_APP_URL, falling back to request origin:', error);
    }
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

export async function POST(request: Request) {
  const [supabaseAdmin, supabaseClient] = await Promise.all([
    createSupabaseServerClient('service_role'),
    createSupabaseServerClient(),
  ]);
  
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
    const { data: invitation, error: inviteError } = await supabaseAdmin
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
      .select('id, role, company_id')
      .eq('supabase_uid', currentUser.id)
      .single();

    const isCompanyAdminByRole =
      currentUserRecord?.role === 'admin' &&
      currentUserRecord?.company_id === invitation.company_id;

    const isCompanyAdminByList =
      Array.isArray(company.admin_ids) &&
      currentUserRecord?.id !== undefined &&
      company.admin_ids.includes(currentUserRecord.id);

    const isAdmin = Boolean(isCompanyAdminByRole || isCompanyAdminByList);

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Apenas administradores podem reenviar convites' },
        { status: 403 }
      );
    }

    const now = Date.now();
    const expiresAtMs = invitation.expires_at ? new Date(invitation.expires_at).getTime() : 0;
    if (expiresAtMs !== 0 && expiresAtMs <= now) {
      await supabaseAdmin
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', invitationId);

      return NextResponse.json(
        { error: 'Este convite expirou. Crie um novo convite.' },
        { status: 410 }
      );
    }

    // Build redirect URL for after email confirmation
    const baseUrl = resolveAppBaseUrl(request);
    const redirectTo = `${baseUrl}/join?token=${invitation.token}`;
    const normalizedEmail = String(invitation.email).trim().toLowerCase();

    console.log('[API /invitations/resend] Resending invite email via Supabase Auth...');

    // Resend invitation email via Supabase Auth Admin API
    const { data: inviteData, error: resendError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
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
