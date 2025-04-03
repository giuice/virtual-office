import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';
import { NextResponse } from 'next/server';

// Instantiate the repository
const userRepository: IUserRepository = new SupabaseUserRepository();

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const firebaseId = searchParams.get('firebaseId');
    
    if (!firebaseId) {
      return NextResponse.json(
        { error: 'Missing or invalid firebaseId parameter' },
        { status: 400 }
      );
    }

    // Get the user using the repository
    const user: User | null = await userRepository.findByFirebaseUid(firebaseId);
    
    if (!user) {
      return NextResponse.json({ 
        success: false, 
        message: 'User not found' 
      }, { status: 404 });
    }
    
    // Return success with the user data
    return NextResponse.json({ 
      success: true, 
      user
    }, { status: 200 });
  } catch (error) {
    console.error('Error getting user:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get user' 
    }, { status: 500 });
  }
}