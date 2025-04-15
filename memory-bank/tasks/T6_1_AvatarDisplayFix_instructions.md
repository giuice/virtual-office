# T6_1_AvatarDisplayFix Instructions

## Objective
Fix the issue where custom user avatars are not displaying properly in the UI despite being successfully uploaded and stored in Supabase storage.

## Context
[Implementation Plan: IP6_AvatarSystemFixes]

Custom avatars are currently being uploaded and saved to Supabase storage successfully, as confirmed by checking the storage bucket. However, these images are not being properly displayed in the application UI. This problem affects both the dashboard header and the modern avatar components. The issue may be related to URL construction, cache invalidation, CORS settings, or proper handling of Supabase public URLs.

## Dependencies
- Supabase client configuration (`src/lib/supabase/client.ts`)
- Avatar components:
  - `src/components/ui/avatar-with-fallback.tsx`
  - `src/components/floor-plan/modern/ModernUserAvatar.tsx`
- Avatar upload API (`src/app/api/users/avatar/route.ts`)
- User repository (`src/repositories/implementations/supabase/SupabaseUserRepository.ts`)
- Avatar utilities (`src/lib/avatar-utils.ts`)
- Dashboard header (`src/components/shell/dashboard-header.tsx`)
- Enhanced user menu (`src/components/shell/enhanced-user-menu.tsx`)

## Steps
1. ✅ **Investigate URL Formats and Access:**
   - Debug avatar URL formats in console logs to verify structure
   - Check if URLs are correctly constructed with proper public access settings
   - Verify that URLs can be accessed directly in a browser
   - Add diagnostic logging to avatar components to track loading states

2. ✅ **Fix URL Construction and Public Access:**
   - Update the avatar upload API to ensure properly formatted public URLs
   - Check and fix any discrepancies in how Supabase bucket public URLs are generated
   - Confirm CORS settings for the storage bucket are properly configured

3. ✅ **Enhance Image Loading and Error Handling:**
   - Update avatar components to handle various URL formats (including Supabase storage URLs)
   - Improve error state handling when avatar images fail to load
   - Add more robust fallback mechanisms with proper logging
   - Implement better caching strategies for avatar images

4. ✅ **Add Cache Invalidation for Image Updates:**
   - Implement cache-busting techniques for updated avatar images
   - Add appropriate cache headers or URL parameters
   - Force re-render of avatar components when avatar URL changes
   - Test across different browsers to ensure consistent behavior

5. ✅ **Verify and Test Fixes:**
   - Upload new test avatars and verify proper display
   - Test with different image types (JPG, PNG, WebP)
   - Confirm avatar rendering in all places where avatars appear:
     - Dashboard header
     - User profile
     - Floor plan avatars
     - Avatar groups
   - Check fallback behavior when images are unavailable

## Expected Output
- Custom avatars are properly displayed throughout the application
- Avatar components handle error states gracefully with appropriate fallbacks
- Console logs show no errors related to avatar loading
- Changes to user avatars are immediately visible in the UI
- Consistent behavior across different browsers and device types
- Detailed logging for debugging any future issues
