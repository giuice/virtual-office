import { NextRequest, NextResponse } from 'next/server';
import { IInvitationRepository, ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseCompanyRepository } from '@/repositories/implementations/supabase';

export async function GET(req: NextRequest) {
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();

  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    // Validate input
    if (!token) {
      return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
    }

    // Get invitation by token
    const invitation = await invitationRepository.findByToken(token);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Check if invitation is still valid
    if (invitation.status !== 'pending') {
      return NextResponse.json({ 
        error: 'Invitation is no longer valid',
        status: invitation.status 
      }, { status: 410 });
    }

    // Check expiration (expiresAt is Unix timestamp in seconds)
    const now = Math.floor(Date.now() / 1000);
    if (invitation.expiresAt < now) {
      // Update invitation status to expired
      await invitationRepository.updateStatus(token, 'expired');
      return NextResponse.json({ 
        error: 'Invitation has expired',
        status: 'expired'
      }, { status: 410 });
    }

    // Get company details
    let companyName = 'Unknown Company';
    try {
      const company = await companyRepository.findById(invitation.companyId);
      if (company) {
        companyName = company.name;
      }
    } catch (companyError) {
      console.warn('Could not fetch company details:', companyError);
      // Continue without company name
    }

    // Return invitation details (without sensitive information)
    return NextResponse.json({
      valid: true,
      invitation: {
        email: invitation.email,
        companyName,
        role: invitation.role,
        expiresAt: invitation.expiresAt
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error validating invitation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to validate invitation';
    return NextResponse.json({
      error: errorMessage
    }, { status: 500 });
  }
}