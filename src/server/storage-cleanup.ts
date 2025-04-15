// src/server/storage-cleanup.ts
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { IUserRepository } from '@/repositories/interfaces';
import { SupabaseUserRepository } from '@/repositories/implementations/supabase';

const AVATAR_BUCKET = 'avatars';
const AVATAR_PREFIX = 'avatar-';

/**
 * Identifies and removes orphaned avatar files from Supabase storage.
 * Orphaned files are those whose names suggest a user ID that no longer exists in the database.
 */
export async function cleanupOrphanedAvatars() {
  console.log('[StorageCleanup] Starting orphaned avatar cleanup...');

  try {
    const supabase = await createSupabaseServerClient(); // Use server client for admin operations
    const userRepository: IUserRepository = new SupabaseUserRepository();

    // 1. List all files in the avatar bucket
    const { data: files, error: listError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list('', { limit: 10000 }); // Adjust limit if you have more avatars

    if (listError) {
      console.error('[StorageCleanup] Error listing files in bucket:', listError);
      throw listError;
    }

    if (!files || files.length === 0) {
      console.log('[StorageCleanup] No files found in the avatar bucket. Cleanup finished.');
      return { checked: 0, orphansFound: 0, deleted: 0 };
    }

    console.log(`[StorageCleanup] Found ${files.length} files in the bucket.`);

    // 2. Get all user IDs from the database
    // Assuming findAll() is efficient enough. If not, optimize to fetch only IDs.
    const allUsers = await userRepository.findAll();
    const existingUserIds = new Set(allUsers.map(user => user.id));
    console.log(`[StorageCleanup] Found ${existingUserIds.size} users in the database.`);

    // 3. Identify orphaned files
    const orphanedFiles: string[] = [];
    const avatarFiles = files.filter(file => file.name.startsWith(AVATAR_PREFIX));

    for (const file of avatarFiles) {
      // Extract potential user ID from filename: avatar-{userId}.{extension}
      const nameWithoutPrefix = file.name.substring(AVATAR_PREFIX.length);
      const dotIndex = nameWithoutPrefix.lastIndexOf('.');
      const potentialUserId = dotIndex > 0 ? nameWithoutPrefix.substring(0, dotIndex) : null;

      if (potentialUserId && !existingUserIds.has(potentialUserId)) {
        orphanedFiles.push(file.name);
      } else if (!potentialUserId) {
         console.warn(`[StorageCleanup] Could not parse user ID from filename: ${file.name}`);
      }
    }

    console.log(`[StorageCleanup] Identified ${orphanedFiles.length} potential orphaned files.`);

    // 4. Delete orphaned files
    if (orphanedFiles.length > 0) {
      const { data: deleteData, error: deleteError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove(orphanedFiles);

      if (deleteError) {
        console.error('[StorageCleanup] Error deleting orphaned files:', deleteError);
        // Decide if you want to throw or just log the error and continue
        // throw deleteError; 
      } else {
        console.log(`[StorageCleanup] Successfully deleted ${deleteData?.length || 0} orphaned files.`);
      }
       return { checked: files.length, orphansFound: orphanedFiles.length, deleted: deleteData?.length || 0 };
    } else {
      console.log('[StorageCleanup] No orphaned files to delete.');
       return { checked: files.length, orphansFound: 0, deleted: 0 };
    }

  } catch (error) {
    console.error('[StorageCleanup] An unexpected error occurred during cleanup:', error);
     return { checked: 0, orphansFound: 0, deleted: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

// Example of how you might trigger this (e.g., in a script or admin endpoint)
/*
async function runCleanup() {
  const result = await cleanupOrphanedAvatars();
  console.log('[StorageCleanup] Cleanup process finished.', result);
}

runCleanup().catch(err => console.error('Failed to run cleanup:', err));
*/
