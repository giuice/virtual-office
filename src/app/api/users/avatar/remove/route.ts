import { NextRequest, NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { validateUserSession } from '@/lib/auth/session';
import { IUserRepository } from '@/repositories/interfaces';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export async function POST(req: NextRequest) {
  
  try {
    // Get the authenticated user session
    const { supabaseUid, userDbId, error: sessionError } = await validateUserSession();
    if (sessionError || !supabaseUid || !userDbId) {
      return NextResponse.json(
        { error: sessionError || 'Authentication required' },
        { status: 401 }
      );
    }
      const supabase = await createSupabaseServerClient();

    // Parse request body
    const body = await req.json();
    const { userId } = body;

    // Verify user has permission to update this profile
    if (userId !== userDbId) {
      return NextResponse.json(
        { error: 'You do not have permission to update this profile' },
        { status: 403 }
      );
    }

  const userRepository: IUserRepository = new SupabaseUserRepository(supabase);

    // Update user profile to remove avatar URL
    const updateOk = userRepository.update(userId, {
      avatarUrl: ''
    });

    if (!updateOk) {
      console.error('Error updating user avatar:', userId);
      return NextResponse.json(
        { error: 'Error updating user avatar' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Avatar removed successfully',
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
