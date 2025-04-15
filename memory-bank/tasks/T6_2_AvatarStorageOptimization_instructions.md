# T6_2_AvatarStorageOptimization Instructions

## Objective
Optimize the avatar upload process to update existing avatar images rather than creating new ones each time a user updates their profile picture, preventing unnecessary duplication of files in storage.

## Context
[Implementation Plan: IP6_AvatarSystemFixes]

Currently, the avatar upload system creates a new image file in Supabase storage each time a user uploads or updates their avatar. This leads to unnecessary duplication and wasted storage space. Additionally, old avatars are never cleaned up. The system should be modified to use a consistent naming convention based on user ID and replace the existing avatar file when a user updates their profile picture.

## Dependencies
- Avatar upload API (`src/app/api/users/avatar/route.ts`)
- Avatar removal API (`src/app/api/users/avatar/remove/route.ts`)
- User repository (`src/repositories/implementations/supabase/SupabaseUserRepository.ts`) 
- Supabase client configuration (`src/lib/supabase/server-client.ts`)
- Image processing libraries (sharp)

## Steps
1. ✅ **Implement Consistent Avatar Naming Convention:**
   - Modify the avatar filename generation to use a predictable format based solely on user ID
   - Update the `route.ts` file to use a format like `avatar-{userId}.{extension}` instead of including timestamps
   - Ensure that the file extension is preserved from the original upload

2. ✅ **Add Logic to Check for Existing Avatars:**
   - Before uploading a new avatar, check if the user already has an avatar in storage
   - Query the storage bucket for files matching the user's avatar naming pattern
   - Implement this logic in the avatar upload API endpoint

3. ✅ **Implement Avatar Replacement Strategy:**
   - If an existing avatar is found, use the `upsert: true` option to replace it
   - Ensure proper error handling if replacement fails
   - Verify that the public URL remains consistent after replacement

4. ✅ **Add Cleanup for Orphaned Avatars:**
   - Create a utility function to identify and remove orphaned avatar files (`src/server/storage-cleanup.ts`)
   - This could be run periodically or as part of a maintenance task
   - Add logging for any cleanup operations

5. ✅ **Update User Repository Interface:**
   - Modify the user repository to support updating avatar URLs consistently
   - Ensure that the database record is properly updated when an avatar is replaced
   - Add methods to retrieve a user's current avatar information if needed
   *Verification: Existing `update` method in interface and implementation already supports `avatarUrl` updates. No changes needed.*

6. ✅ **Enhance Error Handling and Validation:**
   - Add robust error handling for storage operations (upload, remove, list)
   - Validate uploaded images more thoroughly (size checks before/after processing)
   - Implement fallback mechanisms (use original image if processing fails)
   - Add appropriate logging for debugging and monitoring
   - Add check for user profile existence in DB
   - Add rollback logic for failed DB updates

7. ✅ **Test Optimization with Various Scenarios:**
   - Test initial avatar upload for new users
   - Test avatar updates for existing users
   - Test deletion and re-upload scenarios
   - Verify storage usage before and after optimization
   - Check that avatar URLs remain stable and accessible

## Expected Output
- Avatar uploads replace existing files rather than creating new ones
- Storage usage is optimized with no duplicate avatar files
- Users see their updated avatars immediately after changes
- System gracefully handles failed uploads or replacements
- Database and storage remain in sync for avatar URLs
- Detailed logs are available for troubleshooting any issues
