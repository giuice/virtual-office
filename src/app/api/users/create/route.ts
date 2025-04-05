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

    // Check if user with this email already exists
    try {
      const existingUserByEmail = await userRepository.findByEmail(userData.email);
      if (existingUserByEmail) {
        // If user exists but has a different firebase_uid, update the firebase_uid
        if (existingUserByEmail.firebase_uid !== userData.firebase_uid) {
          const updatedUser = await userRepository.update(existingUserByEmail.id, {
            firebase_uid: userData.firebase_uid,
            // Update other fields if needed
            displayName: userData.displayName || existingUserByEmail.displayName,
            status: userData.status || existingUserByEmail.status
          });
          
          return NextResponse.json({
            success: true,
            user: updatedUser,
            message: 'User found by email and firebase_uid updated'
          }, { status: 200 });
        }
        
        // If user exists with same firebase_uid, just return it
        return NextResponse.json({
          success: true,
          user: existingUserByEmail,
          message: 'User already exists'
        }, { status: 200 });
      }
    } catch (error) {
      console.error('Error checking for existing user by email:', error);
      // Continue with creation attempt if the check fails
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
    
    // Handle specific database errors
    if (error instanceof Error && 'code' in error) {
      const dbError = error as any;
      
      // Handle duplicate key violation
      if (dbError.code === '23505' && dbError.message.includes('users_email_key')) {
        return NextResponse.json({ 
          success: false, 
          error: 'A user with this email already exists',
          details: dbError
        }, { status: 409 }); // 409 Conflict
      }
    }
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create user',
      details: error
    }, { status: 500 });
  }
}