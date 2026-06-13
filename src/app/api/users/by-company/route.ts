import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { NextResponse } from 'next/server';
import { requireAuthUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const userRepository: IUserRepository = new SupabaseUserRepository(authContext.supabase);
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing required companyId parameter' },
        { status: 400 }
      );
    }

    if (companyId !== authContext.dbUser.companyId) {
      return NextResponse.json({ success: false, error: 'Cannot access users outside your company' }, { status: 403 });
    }

    // Get users using the repository
    const users = await userRepository.findByCompany(companyId);
    
    // Return success with users array
    return NextResponse.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Error getting users by company:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get users' 
    }, { status: 500 });
  }
}
