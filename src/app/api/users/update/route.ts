import { NextResponse } from 'next/server';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { User } from '@/types/database';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
) {
  try {
    const supabase = await createSupabaseServerClient();
    const userRepository: IUserRepository = new SupabaseUserRepository(supabase);
    // Get ID from query parameters
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid id query parameter' }, { status: 400 });
    }

    // Get user data from request body
    // Ensure lastActive is excluded if present, as the repository handles it.
    const { lastActive, ...userData }: Partial<User> = await request.json();

    
    
    let userId = id;
    
    

    // Update the user using the repository with the correct UUID
    // The repository's update method handles mapping camelCase to snake_case
    // and automatically sets last_active.
    const updatedUser = await userRepository.update(userId, userData);

    if (!updatedUser) {
      return NextResponse.json({ success: false, message: 'User not found or update failed' }, { status: 404 });
    }

    // Return success with the updated user object (mapped back to camelCase by repository)
    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully'
    }, { status: 200 });

  } catch (error) {
    console.error('Error updating user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update user';
    // Check specifically for the schema cache error
    if (typeof errorMessage === 'string' && errorMessage.includes("Could not find the 'lastActive' column")) {
      console.error("Potential Supabase schema cache issue detected for 'last_active'. Consider refreshing the schema cache in Supabase.");
      return NextResponse.json({
        success: false,
        error: `Database schema cache error: ${errorMessage}. Please try again later or refresh the Supabase schema cache.`
      }, { status: 500 });
    }
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}