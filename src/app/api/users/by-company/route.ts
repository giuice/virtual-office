import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing required companyId parameter' },
        { status: 400 }
      );
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