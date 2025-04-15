import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { invalidateAvatarCache } from '@/lib/avatar-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication and User Identification
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[API/AvatarRemove] Authentication failed:', authError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId: userDbId } = await req.json();
    if (!userDbId) {
        console.warn('[API/AvatarRemove] Missing userId in request body.');
        return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }
    const { userRepository } = await getSupabaseRepositories();
    const userProfile = await userRepository.findBySupabaseUid(user.id);
    if (!userProfile || userProfile.id !== userDbId) {
        console.error(`[API/AvatarRemove] Security Alert: Authenticated user ${user.id} (DB ID: ${userProfile?.id}) attempted to remove avatar for different user ID ${userDbId}.`);
        return NextResponse.json({ error: 'Forbidden: Mismatched user ID.' }, { status: 403 });
    }
    console.log(`[API/AvatarRemove] Processing avatar removal for user DB ID: ${userDbId}`);

    // 2. Remove from Storage
    const serviceRoleSupabase = await createSupabaseServerClient('service_role');
    const storageBucket = 'user-uploads';

    try {
      const { data: existingFiles, error: listError } = await serviceRoleSupabase.storage
        .from(storageBucket)
        .list('avatars', { search: `avatar-${userDbId}.` });

      if (listError) {
        console.error(`[API/AvatarRemove] Error listing avatars for user ${userDbId}:`, listError.message);
      } else if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles.map(file => `avatars/${file.name}`);
        console.log(`[API/AvatarRemove] Found ${filesToRemove.length} avatar file(s) to remove: ${filesToRemove.join(', ')}`);
        const { data: removeData, error: removeError } = await serviceRoleSupabase.storage
          .from(storageBucket)
          .remove(filesToRemove);
        if (removeError) {
          console.error(`[API/AvatarRemove] Error removing avatar file(s) for user ${userDbId}:`, removeError.message);
        } else {
          console.log(`[API/AvatarRemove] Successfully removed ${removeData?.length || 0} avatar file(s) from storage.`);
        }
      } else {
        console.log(`[API/AvatarRemove] No avatar files found in storage for user ${userDbId}.`);
      }
    } catch (storageError) {
      console.error(`[API/AvatarRemove] Unexpected error during storage removal for user ${userDbId}:`, storageError);
    }

    // 3. Update User Profile in Database
    try {
      const updatedUser = await userRepository.update(userDbId, { avatarUrl: undefined }); // Set avatarUrl to undefined

      if (!updatedUser) {
        console.error(`[API/AvatarRemove] Failed to update user profile (DB ID: ${userDbId}) to remove avatar URL.`);
        return NextResponse.json({ error: 'Failed to update user profile.' }, { status: 500 });
      }
      console.log(`[API/AvatarRemove] Successfully set avatarUrl to undefined in database for user ${userDbId}.`);
    } catch (dbError) {
        console.error(`[API/AvatarRemove] Error updating database for user ${userDbId}:`, dbError);
        return NextResponse.json({ error: 'Failed to update user profile database.' }, { status: 500 });
    }

    // 4. Cache Invalidation
    invalidateAvatarCache();
    console.log(`[API/AvatarRemove] Avatar cache invalidated for user ${userDbId}.`);

    // 5. Success Response
    return NextResponse.json({ message: 'Avatar removed successfully' });

  } catch (error) {
    console.error('[API/AvatarRemove] Unexpected error in POST handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ error: `An unexpected error occurred: ${errorMessage}` }, { status: 500 });
  }
}


