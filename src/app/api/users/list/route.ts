import { NextResponse } from 'next/server';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';

const userRepository: IUserRepository = new SupabaseUserRepository();

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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