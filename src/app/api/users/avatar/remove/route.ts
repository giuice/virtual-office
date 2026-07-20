import { NextRequest, NextResponse } from 'next/server';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';
import { requireAuthUser } from '@/lib/auth/session';
import { IUserRepository } from '@/repositories/interfaces';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { extractUserUploadsPath } from '@/lib/user-uploads-storage';
import { removeAvatarSchema } from '@/lib/presence/user-write-contracts';

export async function POST(req: NextRequest) {
  try {
    const authContext = await requireAuthUser();
    if ('errorResponse' in authContext) {
      return authContext.errorResponse;
    }

    const { dbUser } = authContext;

    // Callers may still send a userId, but it can only target the caller's own profile
    const parsedBody = removeAvatarSchema.safeParse(
      await req.json().catch(() => ({}))
    );
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid avatar removal request' }, { status: 400 });
    }
    if (parsedBody.data.userId && parsedBody.data.userId !== dbUser.id) {
      return NextResponse.json(
        { error: 'You do not have permission to update this profile' },
        { status: 403 }
      );
    }

    const oldAvatarPath = extractUserUploadsPath(dbUser.avatarUrl);

    // Update user profile to remove avatar URL
    const serviceRoleSupabase = await createSupabaseServerClient('service_role');
    const userRepository: IUserRepository = new SupabaseUserRepository(serviceRoleSupabase);
    const updateOk = await userRepository.update(dbUser.id, {
      avatarUrl: null
    });

    if (!updateOk) {
      console.error('Error updating user avatar:', dbUser.id);
      return NextResponse.json(
        { error: 'Error updating user avatar' },
        { status: 500 }
      );
    }

    if (oldAvatarPath) {
      const { error: removeAvatarError } = await serviceRoleSupabase.storage
        .from('user-uploads')
        .remove([oldAvatarPath]);

      if (removeAvatarError) {
        console.warn('Failed to remove avatar object:', removeAvatarError.message);
      }
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
