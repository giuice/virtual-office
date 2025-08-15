import { NextRequest, NextResponse } from 'next/server';
import { IInvitationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

  try {
    const { id: invitationId } = await params;

    // Validate input
    if (!invitationId) {
      return NextResponse.json({ error: 'Missing invitation ID' }, { status: 400 });
    }

    // Get the current user from the session to verify authorization
    const supabase = await createSupabaseServerClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
    }

    // Get the current user's profile to check if they're an admin
    const currentUser = await userRepository.findById(session.user.id);
    if (!currentUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check if user is admin by checking if they're in the company's admin list
    // First get the company to check admin status
    const { ICompanyRepository } = await import('@/repositories/interfaces');
    const { SupabaseCompanyRepository } = await import('@/repositories/implementations/supabase');
    const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
    
    const company = await companyRepository.findById(currentUser.companyId!);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const isAdmin = company.adminIds.includes(currentUser.id);
    if (!isAdmin) {
      return NextResponse.json({
        error: 'Forbidden - Only admins can revoke invitations'
      }, { status: 403 });
    }

    // Find the invitation by token (using the ID as token)
    const invitation = await invitationRepository.findByToken(invitationId);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Verify that the invitation belongs to the same company as the admin
    if (invitation.companyId !== currentUser.companyId) {
      return NextResponse.json({
        error: 'Forbidden - Can only revoke invitations from your own company'
      }, { status: 403 });
    }

    // Check if invitation is already used or expired
    if (invitation.status !== 'pending') {
      return NextResponse.json({
        error: `Cannot revoke invitation - status is already '${invitation.status}'`,
        currentStatus: invitation.status
      }, { status: 400 });
    }

    // Update invitation status to 'expired' (effectively revoking it)
    const updatedInvitation = await invitationRepository.updateStatus(invitationId, 'expired');

    if (!updatedInvitation) {
      return NextResponse.json({
        error: 'Failed to revoke invitation - update operation failed'
      }, { status: 500 });
    }

    console.log(`Invitation ${invitationId} revoked by admin ${currentUser.id} (${currentUser.email})`);

    return NextResponse.json({
      success: true,
      message: 'Invitation revoked successfully',
      invitation: {
        token: updatedInvitation.token,
        email: updatedInvitation.email,
        status: updatedInvitation.status,
        revokedAt: new Date().toISOString()
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error revoking invitation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to revoke invitation';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}

// Optional: GET endpoint to retrieve invitation details (for admin use)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

  try {
    const { id: invitationId } = await params;

    // Validate input
    if (!invitationId) {
      return NextResponse.json({ error: 'Missing invitation ID' }, { status: 400 });
    }

    // Get the current user from the session to verify authorization
    const supabase = await createSupabaseServerClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
    }

    // Get the current user's profile to check if they're an admin
    const currentUser = await userRepository.findById(session.user.id);
    if (!currentUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Check if user is admin by checking if they're in the company's admin list
    // First get the company to check admin status
    const { ICompanyRepository } = await import('@/repositories/interfaces');
    const { SupabaseCompanyRepository } = await import('@/repositories/implementations/supabase');
    const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
    
    const company = await companyRepository.findById(currentUser.companyId!);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const isAdmin = company.adminIds.includes(currentUser.id);
    if (!isAdmin) {
      return NextResponse.json({
        error: 'Forbidden - Only admins can view invitation details'
      }, { status: 403 });
    }

    // Find the invitation by token
    const invitation = await invitationRepository.findByToken(invitationId);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Verify that the invitation belongs to the same company as the admin
    if (invitation.companyId !== currentUser.companyId) {
      return NextResponse.json({
        error: 'Forbidden - Can only view invitations from your own company'
      }, { status: 403 });
    }

    // Return invitation details (excluding sensitive information)
    return NextResponse.json({
      invitation: {
        token: invitation.token,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error retrieving invitation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve invitation';
    return NextResponse.json({
      error: errorMessage
    }, { status: 500 });
  }
}