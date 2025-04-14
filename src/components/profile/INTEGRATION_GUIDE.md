# Avatar Integration Guide

This guide explains how to integrate the modern avatar components with your application's profile management system.

## Components Overview

1. **ModernUserAvatar**: Enhanced avatar component for the floor plan UI
2. **ProfileAvatar**: Full-featured avatar component with upload capabilities
3. **EnhancedUserProfile**: Sample implementation of a profile page with avatar uploads

## Integration Steps

### 1. Use ModernUserAvatar in Floor Plan UI

The `ModernUserAvatar` component has been updated to use the native Shadcn/UI avatar component with proper fallback handling:

```tsx
import { ModernUserAvatar } from '@/components/floor-plan/modern';

// Inside your component
<ModernUserAvatar 
  user={user}
  size="md"
  onClick={handleUserClick}
/>
```

### 2. Replace Avatar in User Profile Page

To add avatar upload capabilities to the user profile page, replace the current avatar implementation with the new `ProfileAvatar` component:

```tsx
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

// Inside your component
<ProfileAvatar
  user={currentUserProfile}
  onAvatarChange={handleAvatarChange}
  size="xl"
/>
```

### 3. Handle Avatar Uploads

Implement the avatar upload handler in your profile component:

```tsx
const handleAvatarChange = async (file: File) => {
  if (!user || !currentUserProfile) return;
  
  setIsUploading(true);
  try {
    // Create a FormData object
    const formData = new FormData();
    formData.append('avatar', file);
    
    // Send to your API
    const response = await fetch('/api/users/avatar', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload avatar');
    }
    
    const data = await response.json();
    
    // Update UI if needed
    showSuccess({ description: 'Avatar updated successfully' });
  } catch (error) {
    showError({
      description: error instanceof Error ? error.message : 'Failed to update avatar',
    });
  } finally {
    setIsUploading(false);
  }
};
```

### 4. Set Up the API Endpoint

We've provided a sample API endpoint at `/api/users/avatar/route.ts` that:

1. Validates the uploaded file (image type, max size)
2. Uploads it to Supabase Storage
3. Updates the user's profile with the new avatar URL

Make sure your Supabase configuration is set up correctly and that you've created a storage bucket named 'user-uploads' with appropriate permissions.

### 5. Update Database Schema

Ensure your `users` table has an `avatarUrl` column to store the avatar image URL.

## Additional Notes

- The avatars use the `getUserInitials()` function to generate fallback text when no image is available.
- The implementation handles loading states, errors, and previews during uploads.
- You can easily customize the avatar sizes, colors, and status indicators to match your design.
- The avatar upload UI displays controls on hover for a clean user experience.

## Complete Example

For a complete implementation, see:
- `EnhancedUserProfile.tsx` - A sample profile page with avatar upload
- `ProfileAvatar.tsx` - The main avatar component with upload UI
- `/api/users/avatar/route.ts` - API endpoint for handling uploads

## Troubleshooting

If you encounter issues:

1. Check browser console for errors
2. Verify that the Supabase storage bucket exists and has proper permissions
3. Ensure your API route is correctly configured
4. Verify that the user has the necessary permissions to update their profile
