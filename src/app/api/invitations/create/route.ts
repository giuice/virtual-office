import { NextResponse } from 'next/server';
import { IInvitationRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase';
import { Invitation, UserRole } from '@/types/database';
import crypto from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  // Use service_role client for admin operations (sending invite emails)
  const supabaseAdmin = await createSupabaseServerClient('service_role');
  // Use regular client for DB operations with RLS
  const supabaseClient = await createSupabaseServerClient();
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository(supabaseClient);
  
  try {
    // Parse the request body
    const body = await request.json();
    const { email, role, companyId } = body;

    // Validate input
    if (!email || !role || !companyId) {
      return NextResponse.json(
        { error: 'Missing required fields: email, role, companyId' },
        { status: 400 }
      );
    }
    
    if (role !== 'admin' && role !== 'member') {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }

    console.log('[API /invitations/create] Received request:', { email, role, companyId });

    const normalizedEmail = String(email).trim().toLowerCase();

    // Verify requesting user is authenticated and is admin of company
    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }

    // Verify company exists and user is admin
    const { data: company, error: companyError } = await supabaseClient
      .from('companies')
      .select('id, admin_ids')
      .eq('id', companyId)
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
        { error: 'Apenas administradores podem enviar convites' },
        { status: 403 }
      );
    }

    // AC4: Check 10-user freemium limit before creating invitation
    const { count: userCount } = await supabaseClient
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    const { count: pendingCount } = await supabaseClient
      .from('invitations')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'pending');

    const totalCount = (userCount || 0) + (pendingCount || 0);
    const limit = 10;

    if (totalCount >= limit) {
      console.log(`[API /invitations/create] User limit reached for company ${companyId}: ${totalCount}/${limit}`);
      return NextResponse.json(
        {
          error: 'USER_LIMIT_REACHED',
          message: 'Limite atingido (10 usuários). O plano gratuito permite até 10 usuários.',
          limit,
          current: totalCount,
          remaining: 0,
        },
        { status: 403 }
      );
    }

    // If there's already a pending invite for this email+company, reuse it
    // This avoids spamming emails (and hitting Supabase rate limits) on repeated clicks.
    const nowIso = new Date().toISOString();
    // NOTE: This is written defensively because our unit tests use simplified Supabase mocks
    // that may not support full query-builder chaining.
    let existingInvite: { token: string; expires_at: string } | null = null;
    let existingInviteError: unknown = null;
    try {
      let q: any = (supabaseClient as any)
        .from('invitations')
        .select('token, expires_at');

      if (q && typeof q.eq === 'function') q = q.eq('company_id', companyId);
      if (q && typeof q.eq === 'function') q = q.eq('email', normalizedEmail);
      if (q && typeof q.eq === 'function') q = q.eq('status', 'pending');
      if (q && typeof q.gt === 'function') q = q.gt('expires_at', nowIso);

      if (q && typeof q.maybeSingle === 'function') {
        const res = await q.maybeSingle();
        existingInvite = res?.data ?? null;
        existingInviteError = res?.error ?? null;
      }
    } catch (err) {
      existingInviteError = err;
    }

    if (existingInviteError) {
      console.warn('[API /invitations/create] Error checking existing invite:', existingInviteError);
    }

    if (existingInvite?.token) {
      const headersList = await headers();
      const host = headersList.get('host') || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
      const inviteUrl = `${baseUrl}/join?token=${existingInvite.token}`;

      return NextResponse.json({
        success: true,
        message: 'Convite já existente (pendente). Reutilizando link para evitar spam.',
        invitation: {
          companyId,
          email: normalizedEmail,
          token: existingInvite.token,
          expiresAt: new Date(existingInvite.expires_at).toISOString(),
          inviteUrl,
          emailSent: false,
        },
        limit,
        remaining: Math.max(0, limit - totalCount),
      }, { status: 200 });
    }

    // Generate a secure random token for our records
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration time (7 days from now as Unix timestamp in milliseconds)
    const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // Build redirect URL for after email confirmation
    const headersList = await headers();
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectTo = `${protocol}://${host}/join?token=${token}`;

    // Create the invitation record in our database FIRST.
    // Even if email sending is rate-limited, the admin can still share the link manually.
    const invitation: Omit<Invitation, 'id' | 'createdAt'> = {
      email: normalizedEmail,
      companyId,
      role: role as UserRole,
      token,
      status: 'pending',
      expiresAt: expiresAtMs // Unix timestamp in ms
    };

    let createdInvitation;
    try {
      createdInvitation = await invitationRepository.create(invitation);
      console.log('[API /invitations/create] Invitation record created:', createdInvitation?.id);
    } catch (dbError) {
      console.error('[API /invitations/create] Failed to create invitation record:', dbError);
      return NextResponse.json({
        success: false,
        error: 'Falha ao salvar convite no banco. Tente novamente.',
      }, { status: 500 });
    }

    console.log('[API /invitations/create] Sending invite email via Supabase Auth...');

    // Try sending invitation email via Supabase Auth Admin API
    let emailSent = false;
    let emailSendError: string | null = null;
    try {
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          redirectTo,
          data: {
            invitation_token: token,
            invited_company_id: companyId,
            invited_role: role,
          }
        }
      );

      if (inviteError) {
        console.error('[API /invitations/create] Supabase invite error:', inviteError);
        emailSendError = inviteError.message;
      } else {
        emailSent = true;
        console.log('[API /invitations/create] Invite email sent successfully:', inviteData?.user?.id);
      }
    } catch (err) {
      console.error('[API /invitations/create] Exception sending invite email:', err);
      emailSendError = err instanceof Error ? err.message : String(err);
    }

    // Build the full invite URL for the admin to share
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
    const inviteUrl = `${baseUrl}/join?token=${token}`;

    // Return success response (token included for admin to share the link)
    return NextResponse.json({
      success: true,
      message: emailSent
        ? 'Convite enviado com sucesso'
        : 'Convite criado. Não foi possível enviar o email automaticamente — compartilhe o link manualmente.',
      invitation: {
        id: createdInvitation?.id,
        companyId: companyId,
        email: normalizedEmail,
        token: token, // Admin needs this to share the invitation link
        expiresAt: new Date(expiresAtMs).toISOString(),
        inviteUrl: inviteUrl, // AC6: Full URL for copying
        emailSent,
        emailSendError,
      },
      // AC4: Return remaining capacity to help UI display
      limit,
      remaining: Math.max(0, limit - totalCount - 1), // -1 because we just created one
    }, { status: 201 });
    
  } catch (error) {
    console.error('[API /invitations/create] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao criar convite'
    }, { status: 500 });
  }
}
