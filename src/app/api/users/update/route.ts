import { NextResponse } from 'next/server';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { validateUserSession } from '@/lib/auth/session';

const userRepository: IUserRepository = new SupabaseUserRepository();

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
) {
  try {
    const { supabaseUid: userId, userDbId, error: sessionError } = await validateUserSession();

    if (sessionError || !userId || !userDbId) {
      return NextResponse.json({ error: sessionError || 'Unauthorized' }, { status: 401 });
    }

    // Read the update data from the request body
    const updateData = await request.json();
    const { status, statusMessage } = updateData;

    // Basic validation (optional, add more robust validation if needed)
    if (!status || !['online', 'offline', 'away', 'busy'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status provided' }, { status: 400 });
    }

    // Prepare the data payload for the repository update
    // The repository should handle setting last_active automatically
    const payloadToUpdate = {
      status,
      ...(statusMessage !== undefined && { statusMessage }), // Include statusMessage only if provided
    };

    console.log(`Updating user DB ID: ${userDbId} with payload:`, payloadToUpdate);

    // Update the user using the repository with the correct database ID and the payload from the request body
    const updatedUser = await userRepository.update(userDbId, payloadToUpdate);

    if (!updatedUser) {
      // Log the failure reason if possible
      console.error(`Update failed for user DB ID: ${userDbId}`);
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
    const errorMessage = (error as Error).message || 'An error occurred while updating the user.';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}
