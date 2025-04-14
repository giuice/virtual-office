# Modern UI Components Guide

This guide documents the new modern UI components implemented for the virtual office application, including the modern floor plan, enhanced avatar system, and user menu improvements.

## Table of Contents

1. [Modern Floor Plan Components](#modern-floor-plan-components)
2. [Enhanced Avatar System](#enhanced-avatar-system)
3. [User Menu Components](#user-menu-components)
4. [Integration Examples](#integration-examples)

---

## Modern Floor Plan Components

Modern, elegant floor plan components that replace the previous implementation with enhanced visual design and user experience.

### Component Files

| Component | File Path | Description |
|-----------|-----------|-------------|
| Design Tokens | `src/components/floor-plan/modern/designTokens.ts` | Design system tokens and helpers |
| ModernFloorPlan | `src/components/floor-plan/modern/ModernFloorPlan.tsx` | Main floor plan container |
| ModernSpaceCard | `src/components/floor-plan/modern/ModernSpaceCard.tsx` | Card component for individual spaces |
| ModernUserAvatar | `src/components/floor-plan/modern/ModernUserAvatar.tsx` | User avatar for floor plan |
| AvatarGroup | `src/components/floor-plan/modern/AvatarGroup.tsx` | Group of user avatars with overflow handling |
| StatusIndicators | `src/components/floor-plan/modern/StatusIndicators.tsx` | Status badges and indicators |
| Index File | `src/components/floor-plan/modern/index.ts` | Export file for all components |

### Dependencies

- React 18+
- Tailwind CSS 4
- Shadcn/UI components
- Lucide React (for icons)
- `@/lib/utils.ts` (for utility functions)
- `@/types/database.ts` (for type definitions)

### Usage

Import the components from the modern package:

```tsx
import { 
  ModernFloorPlan,
  ModernSpaceCard,
  ModernUserAvatar,
  AvatarGroup,
  SpaceStatusBadge,
  SpaceTypeIndicator,
  CapacityIndicator
} from '@/components/floor-plan/modern';

// Main floor plan usage
<ModernFloorPlan
  spaces={spaces}
  onSpaceSelect={handleSpaceSelect}
  onUserClick={handleUserClick}
  highlightedSpaceId={selectedSpaceId}
  layout="default" // or "compact" or "spaced"
  compactCards={false}
/>

// Individual space card usage
<ModernSpaceCard
  space={space}
  usersInSpace={users}
  onEnterSpace={handleEnterSpace}
  isHighlighted={isSelected}
  compact={false}
/>

// Avatar and status components
<ModernUserAvatar user={user} size="md" />
<AvatarGroup users={roomUsers} max={5} />
<SpaceStatusBadge status="available" />
<SpaceTypeIndicator type="conference" />
<CapacityIndicator current={3} capacity={10} />
```

---

## Enhanced Avatar System

A comprehensive avatar system with upload capabilities, status indicators, and visual feedback.

### Component Files

| Component | File Path | Description |
|-----------|-----------|-------------|
| ProfileAvatar | `src/components/profile/ProfileAvatar.tsx` | Avatar component with upload features |
| EnhancedUserProfile | `src/components/profile/EnhancedUserProfile.tsx` | User profile with avatar upload |
| UploadableAvatar | `src/components/profile/UploadableAvatar.tsx` | Advanced avatar with upload progress |
| useImageUpload | `src/hooks/useImageUpload.ts` | Hook for image upload operations |
| Image Upload Utils | `src/lib/uploads/image-upload.ts` | Image validation and processing utilities |

### API Routes

| API Route | File Path | Description |
|-----------|-----------|-------------|
| Avatar Upload | `src/app/api/users/avatar/route.ts` | Endpoint for uploading avatars |
| Avatar Remove | `src/app/api/users/avatar/remove/route.ts` | Endpoint for removing avatars |

### Dependencies

- React 18+
- Tailwind CSS 4
- Shadcn/UI components
- Lucide React (for icons)
- Next.js App Router
- Supabase (for storage and database)

### Usage

#### Basic ProfileAvatar Usage

```tsx
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

<ProfileAvatar
  user={currentUserProfile}
  onAvatarChange={handleAvatarChange}
  size="lg" // "sm", "md", "lg", or "xl"
  uploading={isUploading}
/>
```

#### Advanced Upload with Hook

```tsx
import { useImageUpload } from '@/hooks/useImageUpload';

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
    allowedTypes: ['image/jpeg', 'image/png']
  },
  onSuccess: (response) => {
    // Handle success
  }
});

// Use in file input handler
const handleFileChange = (e) => {
  const file = e.target.files?.[0];
  if (file) {
    upload(file);
  }
};
```

---

## User Menu Components

Enhanced user menu with avatar upload capabilities and improved user experience.

### Component Files

| Component | File Path | Description |
|-----------|-----------|-------------|
| EnhancedUserMenu | `src/components/shell/enhanced-user-menu.tsx` | Modern user menu with avatar upload |

### Dependencies

- React 18+
- Tailwind CSS 4
- Shadcn/UI components (Popover, Button, etc.)
- `ProfileAvatar` component
- Authentication context

### Usage

Replace the existing user menu in the dashboard header:

```tsx
import { EnhancedUserMenu } from '@/components/shell/enhanced-user-menu';

// In your header component
<div className="flex items-center gap-4">
  <ThemeToggle />
  <NotificationsButton />
  <EnhancedUserMenu />
</div>
```

---

## Integration Examples

### Dashboard Header

Updated dashboard header with enhanced user menu:

```tsx
// In src/components/shell/dashboard-header.tsx
import { EnhancedUserMenu } from './enhanced-user-menu';

// Use feature flag to control adoption
const USE_ENHANCED_USER_MENU = true;

// In the render function
{USE_ENHANCED_USER_MENU ? (
  <EnhancedUserMenu />
) : (
  // Original user menu
)}
```

### Settings Page

Settings page with enhanced profile:

```tsx
// In src/app/(dashboard)/settings/page.tsx
import { EnhancedUserProfile } from '@/components/profile/EnhancedUserProfile';

// Feature flag for controlled rollout
const useEnhancedProfile = true;

// In the render function
{useEnhancedProfile ? (
  <EnhancedUserProfile />
) : (
  <UserProfile />
)}
```

### Floor Plan Page

```tsx
// In your floor plan page
import { ModernFloorPlan } from '@/components/floor-plan/modern';

// In the render function
<ModernFloorPlan
  spaces={spaces}
  onSpaceSelect={handleSpaceSelect}
  onSpaceDoubleClick={handleSpaceDoubleClick}
  highlightedSpaceId={selectedSpaceId}
  layout="default"
/>
```

---

## Complete Component Hierarchy

```
src/
├── components/
│   ├── floor-plan/
│   │   └── modern/
│   │       ├── designTokens.ts
│   │       ├── ModernFloorPlan.tsx
│   │       ├── ModernSpaceCard.tsx
│   │       ├── ModernUserAvatar.tsx
│   │       ├── AvatarGroup.tsx
│   │       ├── StatusIndicators.tsx
│   │       └── index.ts
│   ├── profile/
│   │   ├── ProfileAvatar.tsx
│   │   ├── EnhancedUserProfile.tsx
│   │   ├── UploadableAvatar.tsx
│   │   └── README.md
│   └── shell/
│       └── enhanced-user-menu.tsx
├── hooks/
│   └── useImageUpload.ts
├── lib/
│   └── uploads/
│       └── image-upload.ts
└── app/
    ├── api/
    │   └── users/
    │       └── avatar/
    │           ├── route.ts
    │           └── remove/
    │               └── route.ts
    └── (dashboard)/
        └── avatar-demo/
            └── page.tsx
```

## Recommended Integration Approach

1. **Start with the Floor Plan**
   - Integrate `ModernFloorPlan` component first
   - Test with existing data and functionality
   
2. **Add Enhanced User Menu**
   - Update dashboard header with the `EnhancedUserMenu`
   - Set up avatar upload API endpoints
   
3. **Enhance User Profile**
   - Integrate `EnhancedUserProfile` in settings page
   - Test complete avatar upload flow
   
4. **Explore Demo Page**
   - Visit `/avatar-demo` to see all components in action
   - Use as reference for custom implementations

## Feature Flags for Controlled Rollout

Each modernized component has feature flags for controlled rollout:

```tsx
// Floor plan
const USE_MODERN_FLOOR_PLAN = true;

// User menu
const USE_ENHANCED_USER_MENU = true;

// Profile page
const USE_ENHANCED_PROFILE = true;
```

These flags allow for easy toggling between legacy and modern components during the transition period.
