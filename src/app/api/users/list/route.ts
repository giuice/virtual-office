import { NextResponse } from 'next/server';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { User } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Create server client and repository instance
    const supabase = await createSupabaseServerClient();
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    
    const users: User[] = await userRepository.findAll();

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