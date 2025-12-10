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

    // Generate a secure random token for our records
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration time (7 days from now as Unix timestamp in milliseconds)
    const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // Build redirect URL for after email confirmation
    const headersList = await headers();
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectTo = `${protocol}://${host}/join?token=${token}`;

    console.log('[API /invitations/create] Sending invite email via Supabase Auth...');
    
    // Send invitation email via Supabase Auth Admin API
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          // Store metadata in user's raw_user_meta_data
          invitation_token: token,
          invited_company_id: companyId,
          invited_role: role,
        }
      }
    );

    if (inviteError) {
      console.error('[API /invitations/create] Supabase invite error:', inviteError);
      
      // Handle specific errors
      if (inviteError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'Este email já está cadastrado no sistema' },
          { status: 409 }
        );
      }
      
      throw new Error(`Falha ao enviar email de convite: ${inviteError.message}`);
    }

    console.log('[API /invitations/create] Invite email sent successfully:', inviteData?.user?.id);

    // Create the invitation record in our database
    const invitation: Omit<Invitation, 'id' | 'createdAt'> = {
      email,
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
      console.error('[API /invitations/create] CRITICAL: Email sent but DB insert failed:', dbError);
      return NextResponse.json({
        success: false,
        error: 'Convite enviado por email, mas falha ao salvar no banco. Contate o administrador.',
      }, { status: 500 });
    }

    // Build the full invite URL for the admin to share
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
    const inviteUrl = `${baseUrl}/join?token=${token}`;

    // Return success response (token included for admin to share the link)
    return NextResponse.json({
      success: true,
      message: 'Convite enviado com sucesso',
      invitation: {
        id: createdInvitation?.id,
        companyId: companyId,
        email: email,
        token: token, // Admin needs this to share the invitation link
        expiresAt: new Date(expiresAtMs).toISOString(),
        inviteUrl: inviteUrl, // AC6: Full URL for copying
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
