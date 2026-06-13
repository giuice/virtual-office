import { NextResponse } from 'next/server';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';
import { User } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const userRepository: IUserRepository = new SupabaseUserRepository(authContext.supabase);
    
    const users: User[] = authContext.dbUser.companyId
      ? await userRepository.findByCompany(authContext.dbUser.companyId)
      : [authContext.dbUser];

    return NextResponse.json({
      success: true,
      users,
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching all users:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch users',
    }, { status: 500 });
  }
}
