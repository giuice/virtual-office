# Avatar System Enhancements

This directory contains enhanced avatar components and utilities for the virtual office application. These components provide a modern, interactive user experience for avatars throughout the application.

## Components

### 1. ProfileAvatar

`ProfileAvatar.tsx` - A feature-rich avatar component with upload capabilities:

- Hover controls for uploading and removing avatars
- User status indicator
- Loading states during upload
- Error handling
- Size variants (sm, md, lg, xl)

### 2. EnhancedUserProfile

`EnhancedUserProfile.tsx` - A modernized user profile page that incorporates the ProfileAvatar:

- Direct avatar upload from the profile page
- Visual feedback during upload
- Status selection
- Form field validation
- Responsive layout

### 3. UploadableAvatar

`UploadableAvatar.tsx` - A specialized avatar component focused on the upload experience:

- Progress tracking during upload
- Image validation and error handling
- Visual state indicators
- Tooltips for additional information
- Confirmation dialog for removal
- Built on top of the useImageUpload hook

## API Integration

The avatar system integrates with the following API endpoints:

- `/api/users/avatar` - Upload a new avatar
- `/api/users/avatar/remove` - Remove an existing avatar

Both endpoints include authentication and permission checks.

## Utilities

These avatar components are supported by utility functions and hooks:

- `useImageUpload` - A hook for handling image uploads with validation, compression, and progress tracking
- `image-upload.ts` - Utilities for image validation, compression, and upload

## Integration Examples

### Dashboard Header

The dashboard header has been enhanced to use the new avatar system:

```tsx
// In dashboard-header.tsx
<EnhancedUserMenu />
```

### Settings Page

The settings page can optionally use the enhanced user profile:

```tsx
// In settings/page.tsx
{useEnhancedProfile ? (
  <EnhancedUserProfile />
) : (
  <UserProfile />
)}
```

### Avatar Demo Page

A dedicated demo page showcases all avatar components and variations:

```
/avatar-demo
```

## Usage

To use the enhanced avatar components in your own components:

```tsx
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

// Basic usage
<ProfileAvatar
  user={currentUserProfile}
  size="md"
/>

// With upload capability
<ProfileAvatar
  user={currentUserProfile}
  onAvatarChange={handleAvatarChange}
  size="lg"
  uploading={isUploading}
/>
```

For advanced image upload handling:

```tsx
import { useImageUpload } from '@/hooks/useImageUpload';

// In your component
const { 
  upload, 
  state, 
  progress, 
  preview, 
  error 
} = useImageUpload({
  endpoint: '/api/users/avatar',
  validation: {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  onSuccess: (response) => {
    // Handle success
  },
});

// Use the hook
const handleFileChange = async (e) => {
  const file = e.target.files?.[0];
  if (file) {
    await upload(file);
  }
};
```

## Styling

The avatar components use Tailwind CSS and are designed to work seamlessly with the application's design system. You can customize the appearance by:

1. Modifying the size variants in each component
2. Adjusting the color variables in the theme
3. Extending the components with additional variants
