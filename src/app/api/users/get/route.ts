import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';
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
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing or invalid id parameter' },
        { status: 400 }
      );
    }

    // Get the user using the repository
    const user: User | null = await userRepository.findById(id);
    
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        message: 'User not found' 
      }, { status: 404 });
    }

    const canAccessUser = user.id === authContext.dbUser.id ||
      (authContext.dbUser.companyId !== null && user.companyId === authContext.dbUser.companyId);

    if (!canAccessUser) {
      return NextResponse.json({ success: false, error: 'Cannot access users outside your company' }, { status: 403 });
    }
    
    // Return success with the user data
    return NextResponse.json({ 
      success: true, 
      user
    }, { status: 200 });
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get user' 
    }, { status: 500 });
  }
}
