import { NextResponse } from 'next/server';
import { IInvitationRepository, IUserRepository, ICompanyRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseUserRepository, SupabaseCompanyRepository } from '@/repositories/implementations/supabase';
import { Invitation, UserRole } from '@/types/database';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import crypto from 'crypto';

export async function POST(request: Request) {
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();
  const companyRepository: ICompanyRepository = new SupabaseCompanyRepository();
  
  try {
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

    // Verify companyId exists and requesting user is an admin
    const company = await companyRepository.findById(companyId);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check if user is admin by checking if they're in the company's admin list
    const isAdmin = company.adminIds.includes(currentUser.id);
    if (!isAdmin) {
      return NextResponse.json({ 
        error: 'Forbidden - Only admins can create invitations' 
      }, { status: 403 });
    }

    // Verify the user is trying to create invitation for their own company
    if (currentUser.companyId !== companyId) {
      return NextResponse.json({ 
        error: 'Forbidden - Can only create invitations for your own company' 
      }, { status: 403 });
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration time (e.g., 7 days from now)
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    // Create the invitation
    const invitation: Omit<Invitation, 'id' | 'createdAt'> = {
      email,
      companyId,
      role: role as UserRole,
      token,
      status: 'pending',
      expiresAt
    };

    const createdInvitation = await invitationRepository.create(invitation);
    
    if (!createdInvitation) {
      throw new Error('Failed to create invitation');
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Invitation created successfully',
      invitation: {
        companyId: createdInvitation.companyId,
        email: createdInvitation.email,
        token: createdInvitation.token,
        expiresAt: createdInvitation.expiresAt
      }
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error creating invitation:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invitation'
    }, { status: 500 });
  }
}