import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';
import { NextResponse } from 'next/server';

// Instantiate the repository
const userRepository: IUserRepository = new SupabaseUserRepository();

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const userData: Partial<User> = await req.json();

    // Validate required fields - firebase_uid is crucial!
    if (!userData.email || !userData.firebase_uid) {
      return NextResponse.json(
        { error: 'Missing required fields: email and firebase_uid are required.' },
        { status: 400 }
      );
    }

    // Create the user using the repository
    const createdUser = await userRepository.create(userData as Omit<User, 'id' | 'createdAt' | 'lastActive'>);
    
    // Return success with the created user object
    return NextResponse.json({
      success: true,
      user: createdUser,
      message: 'User created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create user' 
    }, { status: 500 });
  }
}