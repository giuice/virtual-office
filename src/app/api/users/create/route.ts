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

    // Validate required fields - supabase_uid and email are crucial!
    if (!userData.email || !userData.supabase_uid) {
      return NextResponse.json(
        { error: 'Missing required fields: email and supabase_uid are required.' },
        { status: 400 }
      );
    }

    // 1. Check if a user profile already exists for this Supabase Auth UID
    try {
      // Assuming findById looks up by supabase_uid (adjust if method name is different, e.g., findBySupabaseUid)
      const existingUserBySupabaseUid = await userRepository.findById(userData.supabase_uid);
      if (existingUserBySupabaseUid) {
        // User profile already exists for this auth user, return it (idempotent)
        return NextResponse.json({
          success: true,
          user: existingUserBySupabaseUid,
          message: 'User profile already exists for this authenticated user.'
        }, { status: 200 });
      }
    } catch (error) {
      // Log error but proceed, as the user might not exist which is expected
      console.warn('Error checking for existing user by supabase_uid (might be expected if user is new):', error);
    }

    // 2. Check if the email address is already linked to a *different* user profile
    try {
      const existingUserByEmail = await userRepository.findByEmail(userData.email);
      if (existingUserByEmail) {
        // Email found, but it wasn't linked to the current supabase_uid (checked above).
        // This means the email is already associated with another account.
        console.warn(`Conflict: Email ${userData.email} already exists for user ${existingUserByEmail.id} (supabase_uid: ${existingUserByEmail.supabase_uid}), but current auth user is ${userData.supabase_uid}.`);
        return NextResponse.json({
          success: false,
          error: 'This email address is already associated with another user account.',
        }, { status: 409 }); // 409 Conflict
      }
    } catch (error) {
      console.error('Error checking for existing user by email:', error);
      // If the check fails, we might proceed cautiously, but it's safer to return an error
      return NextResponse.json({
        success: false,
        error: 'Failed to verify email uniqueness.',
        details: error instanceof Error ? error.message : error
      }, { status: 500 });
    }

    // 3. Create the new user profile
    console.log(`Creating new user profile for email ${userData.email} and supabase_uid ${userData.supabase_uid}`);
    const createdUser = await userRepository.create(userData as Omit<User, 'id' | 'createdAt' | 'lastActive'>);

    // Return success with the created user object
    return NextResponse.json({
      success: true,
      user: createdUser,
      message: 'User created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error during user creation process:', error);

    // Handle specific database errors (e.g., race condition on unique constraints)
    if (error instanceof Error && 'code' in error) {
      const dbError = error as any;
      // Handle duplicate key violation for email or supabase_uid
      if (dbError.code === '23505') {
         let errorMessage = 'A user with these details already exists.';
         if (dbError.constraint?.includes('email')) {
             errorMessage = 'A user with this email already exists.';
         } else if (dbError.constraint?.includes('supabase_uid')) {
             errorMessage = 'A user profile for this authenticated user already exists.';
         }
        return NextResponse.json({
          success: false,
          error: errorMessage,
          details: `Constraint violation: ${dbError.constraint}`
        }, { status: 409 }); // 409 Conflict
      }
    }

    // Generic error fallback
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create user',
      details: error // Include error details for debugging if appropriate
    }, { status: 500 });
  }
}