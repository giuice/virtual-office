import { NextRequest, NextResponse } from 'next/server';
import { IInvitationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  
  // Get authenticated user from session (AC4 - use real supabaseUid from session)
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !authUser) {
    return NextResponse.json({ 
      success: false,
      error: 'Autenticação necessária. Faça login para aceitar o convite.' 
    }, { status: 401 });
  }
  
  const supabaseUid = authUser.id;
  
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository(supabase);
  const userRepository: IUserRepository = new SupabaseUserRepository(supabase);

  try {
    const { token } = await req.json();

    // Validate input
    if (!token) {
      return NextResponse.json({ error: 'Token de convite é obrigatório' }, { status: 400 });
    }

    // 1. Get and validate invitation using repository
    const invitation = await invitationRepository.findByToken(token);
    if (!invitation) {
      return NextResponse.json({ error: 'Convite não encontrado ou inválido' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Convite já utilizado ou expirado' }, { status: 400 });
    }

    // Check expiration (expiresAt is Unix timestamp in milliseconds)
    const now = Date.now();
    if (invitation.expiresAt < now) {
      await invitationRepository.updateStatus(token, 'expired');
      return NextResponse.json({ error: 'Convite expirado' }, { status: 410 }); // Use 410 Gone for expired
    }

    // Security: Verify invitation email matches authenticated user's email (AC4 security)
    if (invitation.email.toLowerCase() !== authUser.email?.toLowerCase()) {
      return NextResponse.json({ 
        error: 'Este convite foi enviado para outro email. Use a conta correta para aceitar.' 
      }, { status: 403 });
    }

    // 2. Check if user profile already exists for this supabaseUid using repository
    let userProfile = await userRepository.findBySupabaseUid(supabaseUid);
    const userIdToUpdate: string | undefined = userProfile?.id;

    if (userProfile) {
      // 3a. User exists - check if they already belong to a company (AC6)
      if (userProfile.companyId && userProfile.companyId !== invitation.companyId) {
        // Get current company name for the error message
        const { data: currentCompany } = await supabase
          .from('companies')
          .select('name')
          .eq('id', userProfile.companyId)
          .single();
          
        return NextResponse.json({ 
          error: 'Você já pertence a outra empresa',
          companyName: currentCompany?.name || 'uma empresa'
        }, { status: 409 });
      } else if (!userProfile.companyId) {
        // User exists but has no company - update their profile using repository
        console.log(`Updating existing user ${userIdToUpdate} (supabaseUid: ${supabaseUid}) with company ${invitation.companyId} and role ${invitation.role}`);
        const updatedUser = await userRepository.update(userIdToUpdate!, {
          companyId: invitation.companyId,
          role: invitation.role
        });
        if (!updatedUser) {
          throw new Error(`Falha ao associar usuário à empresa`);
        }
        userProfile = updatedUser;
      }
      // If userProfile.companyId === invitation.companyId, user is already in this company
      // This is fine, just mark invitation as accepted
    } else {
      // 3b. User does not exist - this should be handled by handle_new_user() trigger (AC7)
      // But as a fallback, we wait a moment and check again
      // The trigger creates the user with company_id = NULL
      console.log(`User profile not found for supabaseUid ${supabaseUid}, waiting for trigger...`);
      
      // Wait briefly for trigger to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try again
      userProfile = await userRepository.findBySupabaseUid(supabaseUid);
      
      if (userProfile) {
        // Trigger created the user, now update with company info
        const updatedUser = await userRepository.update(userProfile.id, {
          companyId: invitation.companyId,
          role: invitation.role
        });
        if (!updatedUser) {
          throw new Error(`Falha ao associar usuário à empresa`);
        }
        userProfile = updatedUser;
      } else {
        // Trigger didn't create user, this shouldn't happen normally
        // Return error asking user to complete signup first
        return NextResponse.json({ 
          error: 'Perfil de usuário não encontrado. Por favor, complete o cadastro primeiro.' 
        }, { status: 400 });
      }
    }

    // 4. Invalidate the invitation token using repository
    const updatedInvitation = await invitationRepository.updateStatus(token, 'accepted');
    if (!updatedInvitation) {
      console.error(`Failed to update invitation status for token ${token}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Convite aceito com sucesso!',
      user: userProfile,
      redirect: '/dashboard'
    }, { status: 200 });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Falha ao aceitar convite';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}