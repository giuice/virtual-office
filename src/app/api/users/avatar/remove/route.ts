import { NextRequest, NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { getServerSession } from '@/lib/auth';
import { IUserRepository } from '@/repositories/interfaces';

export async function POST(req: NextRequest) {
  try {
    // Get the authenticated user session
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { userId } = body;

    // Verify user has permission to update this profile
    if (userId !== session.user.id) {
      const isAdmin = session.user.role === 'admin';
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'You do not have permission to update this profile' },
          { status: 403 }
        );
      }
    }

  const userRepository: IUserRepository = new SupabaseUserRepository();

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
