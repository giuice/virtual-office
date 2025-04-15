// Centralized avatar storage utility for server-side operations
// This module should be used by API routes and services for avatar file handling
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

const BUCKET_NAME = 'user-uploads';
const AVATAR_FOLDER = 'avatars';

export class AvatarStorage {

  /**
   * Lists all avatar files associated with a specific user ID in the storage bucket.
   * @param userDbId The database ID of the user.
   * @returns A promise that resolves to an array of file paths (e.g., 'avatars/avatar-123.jpg').
   * @throws If there's an error listing files.
   */
  static async listUserAvatars(userDbId: string | number): Promise<string[]> {
    console.log(`[AvatarStorage] Listing avatars for user ${userDbId}`);
    const supabase = await createSupabaseServerClient('service_role');
    const searchPrefix = `avatar-${userDbId}.`;
    try {
      const { data: files, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(AVATAR_FOLDER, { search: searchPrefix });

      if (error) {
        console.error(`[AvatarStorage] Error listing avatars for user ${userDbId}:`, error);
        throw new Error(`Failed to list avatar files: ${error.message}`);
      }

      const filePaths = (files || []).map(file => `${AVATAR_FOLDER}/${file.name}`);
      console.log(`[AvatarStorage] Found ${filePaths.length} avatar(s) for user ${userDbId}`);
      return filePaths;
    } catch (err) {
      console.error(`[AvatarStorage] Unexpected error in listUserAvatars for user ${userDbId}:`, err);
      throw err; // Re-throw unexpected errors
    }
  }

  /**
   * Removes specific avatar files from storage.
   * @param filePaths An array of full file paths to remove (e.g., ['avatars/avatar-123.jpg']).
   * @returns A promise that resolves when removal is complete.
   * @throws If there's an error removing files.
   */
  static async removeAvatars(filePaths: string[]): Promise<void> {
    if (!filePaths || filePaths.length === 0) {
      console.log('[AvatarStorage] No files specified for removal.');
      return;
    }
    console.log(`[AvatarStorage] Attempting to remove ${filePaths.length} avatar file(s): ${filePaths.join(', ')}`);
    const supabase = await createSupabaseServerClient('service_role');
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(filePaths);

      if (error) {
        console.error(`[AvatarStorage] Error removing avatar file(s):`, error);
        throw new Error(`Failed to remove avatar file(s): ${error.message}`);
      }
      console.log(`[AvatarStorage] Successfully removed ${data?.length || 0} avatar file(s).`);
    } catch (err) {
      console.error(`[AvatarStorage] Unexpected error in removeAvatars:`, err);
      throw err;
    }
  }

  /**
   * Removes all avatar files associated with a specific user ID.
   * @param userDbId The database ID of the user.
   * @returns A promise that resolves when removal is complete.
   * @throws If there's an error listing or removing files.
   */
  static async removeAllUserAvatars(userDbId: string | number): Promise<void> {
    console.log(`[AvatarStorage] Removing all avatars for user ${userDbId}`);
    try {
      const filesToRemove = await this.listUserAvatars(userDbId);
      if (filesToRemove.length > 0) {
        await this.removeAvatars(filesToRemove);
      } else {
        console.log(`[AvatarStorage] No avatars found to remove for user ${userDbId}.`);
      }
    } catch (error) {
      console.error(`[AvatarStorage] Failed to remove all avatars for user ${userDbId}:`, error);
      // Decide if this should throw or just log
      throw error;
    }
  }

  /**
   * Uploads an avatar file to storage, overwriting if it exists (upsert).
   * @param filePath The full path within the bucket (e.g., 'avatars/avatar-123.jpg').
   * @param fileBuffer The file content as a Buffer or ArrayBuffer.
   * @param contentType The MIME type of the file (e.g., 'image/jpeg').
   * @returns A promise that resolves when the upload is complete.
   * @throws If the upload fails.
   */
  static async uploadAvatar(filePath: string, fileBuffer: Buffer | ArrayBuffer, contentType: string): Promise<void> {
    console.log(`[AvatarStorage] Uploading avatar to ${filePath} (${contentType})`);
    const supabase = await createSupabaseServerClient('service_role');
    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, fileBuffer, {
          contentType: contentType,
          upsert: true, // Replace if exists
        });

      if (error) {
        console.error(`[AvatarStorage] Error uploading file ${filePath}:`, error);
        throw new Error(`Failed to upload avatar file: ${error.message}`);
      }
      console.log(`[AvatarStorage] Successfully uploaded ${filePath}`);
    } catch (err) {
      console.error(`[AvatarStorage] Unexpected error in uploadAvatar for ${filePath}:`, err);
      throw err;
    }
  }

  /**
   * Gets the public URL for a file in storage.
   * @param filePath The full path within the bucket (e.g., 'avatars/avatar-123.jpg').
   * @returns The public URL string.
   * @throws If the URL cannot be generated.
   */
  static async getPublicUrl(filePath: string): Promise<string> {
    console.log(`[AvatarStorage] Getting public URL for ${filePath}`);
    // Use the non-service_role client for public URL generation as it reflects public access rules
    const supabase = await createSupabaseServerClient();
    try {
      const { data } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      if (!data || !data.publicUrl) {
        console.error(`[AvatarStorage] Failed to get public URL for ${filePath}. Check if file exists and bucket permissions.`);
        throw new Error('Failed to retrieve public URL for avatar.');
      }
      console.log(`[AvatarStorage] Generated public URL: ${data.publicUrl}`);
      return data.publicUrl;
    } catch (err) {
      console.error(`[AvatarStorage] Unexpected error in getPublicUrl for ${filePath}:`, err);
      throw err;
    }
  }
}
