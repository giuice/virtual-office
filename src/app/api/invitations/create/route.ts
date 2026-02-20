import { NextResponse } from 'next/server';
import { IInvitationRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository } from '@/repositories/implementations/supabase';
import { Invitation, UserRole } from '@/types/database';
import crypto from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

function resolveAppBaseUrl(request: Request): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) {
    try {
      return new URL(configuredAppUrl).origin;
    } catch (error) {
      console.warn('[API /invitations/create] Invalid NEXT_PUBLIC_APP_URL, falling back to request origin:', error);
    }
  }

  try {
    return new URL(request.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Formato de email inválido' },
        { status: 400 }
      );
    }

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
      .select('id, role, company_id')
      .eq('supabase_uid', currentUser.id)
      .single();

    const isCompanyAdminByRole =
      currentUserRecord?.role === 'admin' &&
      currentUserRecord?.company_id === companyId;

    const isCompanyAdminByList =
      Array.isArray(company.admin_ids) &&
      currentUserRecord?.id !== undefined &&
      company.admin_ids.includes(currentUserRecord.id);

    const isAdmin = Boolean(isCompanyAdminByRole || isCompanyAdminByList);

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Apenas administradores podem enviar convites' },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const baseUrl = resolveAppBaseUrl(request);

    // Keep invitation status consistent before limit checks and listing.
    const { error: expireError } = await supabaseClient
      .from('invitations')
      .update({ status: 'expired' })
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .lte('expires_at', nowIso);

    if (expireError) {
      console.warn('[API /invitations/create] Failed to expire stale invitations:', expireError);
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
      .eq('status', 'pending')
      .gt('expires_at', nowIso);

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
    const { data: existingInvite, error: existingInviteError } = await supabaseClient
      .from('invitations')
      .select('token, expires_at')
      .eq('company_id', companyId)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInviteError) {
      console.warn('[API /invitations/create] Error checking existing invite:', existingInviteError);
    }

    if (existingInvite?.token) {
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
    const redirectTo = `${baseUrl}/join?token=${token}`;

    // Create the invitation record in our database FIRST.
    // Even if email sending is rate-limited, the admin can still share the link manually.
    const invitation: Omit<Invitation, 'id' | 'createdAt' | 'status'> = {
      email: normalizedEmail,
      companyId,
      role: role as UserRole,
      token,
      expiresAt: expiresAtMs // Unix timestamp in ms
    };

    let createdInvitation;
    try {
      createdInvitation = await invitationRepository.create(invitation);
      console.log('[API /invitations/create] Invitation record created:', createdInvitation?.id);
    } catch (dbError) {
      const dbErrorCode =
        typeof dbError === 'object' &&
        dbError !== null &&
        'code' in dbError
          ? String((dbError as { code?: unknown }).code ?? '')
          : '';

      // If a concurrent request created the same pending invite, reuse it.
      if (dbErrorCode === '23505') {
        const { data: concurrentInvite, error: concurrentInviteError } = await supabaseClient
          .from('invitations')
          .select('token, expires_at')
          .eq('company_id', companyId)
          .eq('email', normalizedEmail)
          .eq('status', 'pending')
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!concurrentInviteError && concurrentInvite?.token) {
          return NextResponse.json({
            success: true,
            message: 'Convite já existente (pendente). Reutilizando link para evitar duplicidade.',
            invitation: {
              companyId,
              email: normalizedEmail,
              token: concurrentInvite.token,
              expiresAt: new Date(concurrentInvite.expires_at).toISOString(),
              inviteUrl: `${baseUrl}/join?token=${concurrentInvite.token}`,
              emailSent: false,
            },
            limit,
            remaining: Math.max(0, limit - totalCount - 1),
          }, { status: 200 });
        }
      }

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
