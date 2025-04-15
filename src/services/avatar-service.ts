import { User } from '@/types/database';
import { getUserInitials, generateAvatarDataUri } from '@/lib/avatar-utils'; // Temporary import, will be replaced/integrated
// import { supabase } from '@/lib/supabase/client'; // Example import
// import { serverAvatarStorage } from '@/server/avatar-storage'; // Example import for server-side logic if needed

/**
 * Central service for all avatar-related operations.
 * Contains logic for getting avatar URLs, uploading, removing, and managing avatars.
 */
export class AvatarService {

  /**
   * Get avatar URL following standard priority:
   * 1. Custom uploaded avatar (user.avatarUrl)
   * 2. Social login avatar (user.photoURL) - Assuming photoURL holds social avatar
   * 3. Generated fallback avatar (using initials)
   *
   * @param user The user object.
   * @returns The determined avatar URL string.
   */
  static getAvatarUrl(user: User | null | undefined): string {
    if (!user) {
      // Generate a default fallback if user is null/undefined
      return generateAvatarDataUri({ displayName: '' });
    }

    // 1. Custom uploaded avatar (highest priority)
    if (user.avatarUrl) {
      // TODO: Add cache-busting logic here if needed
      // TODO: Validate if the URL is still valid (optional)
      return user.avatarUrl;
    }

    // 2. Social login avatar (e.g., from Google, stored in photoURL)
    // Adjust the property name if social avatar URL is stored differently
    const photoURL = (user as any).photoURL;
    if (photoURL) {
      // TODO: Potentially check for CORS issues or use a proxy if needed for external URLs
      return photoURL;
    }

    // 3. Generated fallback avatar (lowest priority)
    return generateAvatarDataUri(user);
  }

  /**
   * Upload a new avatar for the user.
   * This typically involves calling an API endpoint.
   *
   * @param userId The ID of the user.
   * @param file The avatar file to upload.
   * @returns The URL of the newly uploaded avatar.
   * @throws If the upload fails.
   */
  static async uploadAvatar(userId: string, file: File): Promise<string> {
    console.log(`[AvatarService] Uploading avatar for user ${userId}...`);
    const formData = new FormData();
    formData.append('avatar', file);
    // Add userId if your API needs it in the form data
    // formData.append('userId', userId);

    try {
      // Replace with your actual API endpoint
      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        body: formData,
        // Add authentication headers if required
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to parse error
        console.error('[AvatarService] Upload failed:', response.status, errorData);
        throw new Error(`Failed to upload avatar: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      console.log(`[AvatarService] Upload successful for user ${userId}. URL: ${data.avatarUrl}`);
      // TODO: Invalidate relevant cache after successful upload
      return data.avatarUrl; // Assuming the API returns the new URL
    } catch (error) {
      console.error('[AvatarService] Error during avatar upload:', error);
      throw error; // Re-throw the error for the caller to handle
    }
  }

  /**
   * Remove the custom avatar for the user.
   * This typically involves calling an API endpoint.
   *
   * @param userId The ID of the user.
   * @throws If the removal fails.
   */
  static async removeAvatar(userId: string): Promise<void> {
    console.log(`[AvatarService] Removing custom avatar for user ${userId}...`);
    try {
      // Replace with your actual API endpoint
      const response = await fetch('/api/users/avatar', { // Assuming DELETE on the same endpoint
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          // Add authentication headers if required
        },
        // Send userId in the body if required by your API
        // body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[AvatarService] Removal failed:', response.status, errorData);
        throw new Error(`Failed to remove avatar: ${errorData.error || response.statusText}`);
      }

      console.log(`[AvatarService] Custom avatar removed successfully for user ${userId}.`);
      // TODO: Invalidate relevant cache after successful removal
    } catch (error) {
      console.error('[AvatarService] Error during avatar removal:', error);
      throw error; // Re-throw the error
    }
  }

  // --- Helper methods (can be integrated or kept separate) ---

  /**
   * Generates a data URI for a fallback avatar with initials.
   * (This might be moved from avatar-utils or kept here)
   */
  private static generateFallbackDataUri(user: User): string {
    return generateAvatarDataUri(user);
  }

  /**
   * Gets user initials.
   * (This might be moved from avatar-utils or kept here)
   */
  private static getInitials(name: string): string {
    return getUserInitials(name);
  }

  // TODO: Add cache-busting logic if required
  // static addCacheBusting(url: string): string { ... }

  // TODO: Integrate avatar-debug logic if needed
  // static logDiagnostics(url: string, userId: string, component: string) { ... }

  // TODO: Add cleanupOrphanedAvatars method if required by the plan
  // static async cleanupOrphanedAvatars(): Promise<string[]> { ... }
}
