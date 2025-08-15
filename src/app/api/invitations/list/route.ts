import { NextRequest, NextResponse } from 'next/server';
import { IInvitationRepository, IUserRepository } from '@/repositories/interfaces';
import { SupabaseInvitationRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function GET(req: NextRequest) {
  const invitationRepository: IInvitationRepository = new SupabaseInvitationRepository();
  const userRepository: IUserRepository = new SupabaseUserRepository();

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
        error: 'Forbidden - Only admins can list invitations' 
      }, { status: 403 });
    }

    // Get query parameters for filtering
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending'; // Default to pending invitations
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate status parameter
    const validStatuses = ['pending', 'accepted', 'expired', 'all'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ 
        error: `Invalid status parameter. Must be one of: ${validStatuses.join(', ')}` 
      }, { status: 400 });
    }

    // Get invitations for the current user's company
    const invitations = await invitationRepository.findByCompany(
      currentUser.companyId!,
      status,
      limit,
      offset
    );

    // Get total count for pagination
    const totalCount = await invitationRepository.countByCompany(
      currentUser.companyId!,
      status
    );

    console.log(`Admin ${currentUser.id} requested invitations list for company ${currentUser.companyId}`);

    return NextResponse.json({
      invitations,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + invitations.length < totalCount
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error listing invitations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to list invitations';
    return NextResponse.json({
      error: errorMessage
    }, { status: 500 });
  }
}