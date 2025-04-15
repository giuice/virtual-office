# Avatar System Fix Plan

## Current Issues

1. **Inconsistent avatar display across components**:
   - Social login avatars show in some components but not others
   - Custom avatars sometimes replace social avatars when they shouldn't
   - Space components don't correctly show user avatars

2. **Inconsistent priority order**:
   - Different components have different priority logic for which avatar to display
   - No clear, application-wide standard for avatar precedence

3. **Inefficient storage and management**:
   - Duplicate avatars stored when users update their profile pictures
   - No proper cleanup of orphaned avatar files
   - No easy way to remove custom avatars and revert to social/default

4. **UI inconsistencies in components**:
   - AvatarGroup overlap styling issues
   - Different components using different fallback mechanisms

## User Type Complexity Issues

A significant part of the problem is the variety of inconsistent user types across the application:

1. **Auth User** - From Supabase Auth (`User` from `@supabase/auth-helpers-nextjs`)
   - Contains: `id`, `email`, `user_metadata` (includes social login avatar)
   - Location: Available from `useAuth()` hook as `user`

2. **Database User** - From Supabase Database (`User` from `@/types/database`)
   - Contains: `id`, `email`, `displayName`, `avatarUrl`, `status`, etc.
   - Location: Available from `useCompany()` hook as `currentUserProfile`

3. **UI User** - Custom type for UI components (`UIUser` from `@/types/ui`)
   - Contains: combination of Auth and DB user properties
   - Used in: Various UI components

4. **UserPresenceData** - For real-time presence tracking
   - Contains: `id`, `displayName`, `avatarUrl`, `status`, `current_space_id`, etc.
   - Used in: `AvatarGroup`, `ModernSpaceCard`, `ModernFloorPlan`, etc.
   - Location: From `usePresence()` hook

This type fragmentation leads to inconsistent avatar handling, as each component may receive a different user type with different avatar-related properties.

### Proposed Type Consolidation

We need to standardize how user data is handled throughout the application:

1. **Create a unified `AvatarUser` interface**:

```typescript
// In src/types/avatar.ts
export interface AvatarUser {
  id: string;
  displayName?: string;
  avatarUrl?: string;    // Custom avatar URL
  photoURL?: string;     // Social login avatar URL
  status?: string;       // User status for avatar indicators
  user_metadata?: {
    avatar_url?: string; // From auth metadata
  };
}
```

2. **Create adapter functions** to convert from each user type to `AvatarUser`:

```typescript
// In src/services/avatar-service.ts
export function toAvatarUser(user: User | UIUser | UserPresenceData): AvatarUser {
  return {
    id: user.id,
    displayName: user.displayName || (user as any).name || 'User',
    avatarUrl: user.avatarUrl,
    photoURL: (user as any).photoURL,
    status: user.status,
    user_metadata: (user as any).user_metadata
  };
}
```

3. **Update component interfaces** to use `AvatarUser` where possible:

```typescript
export const BaseAvatar: React.FC<{
  user: AvatarUser;
  // Other props
}> = (props) => {
  // Implementation
};
```

4. **Consider context composition**:

```typescript
export const UserDataProvider: React.FC = ({ children }) => {
  const { user } = useAuth();
  const { currentUserProfile } = useCompany();
  
  // Combine auth and database user data
  const combinedUser = useMemo(() => {
    if (!user || !currentUserProfile) return null;
    
    return {
      ...currentUserProfile,
      photoURL: user.user_metadata?.avatar_url || user.photoURL,
      user_metadata: user.user_metadata
    };
  }, [user, currentUserProfile]);
  
  return <UserDataContext.Provider value={{ user: combinedUser }}>{children}</UserDataContext.Provider>;
};
```

This approach will dramatically simplify avatar handling by ensuring all components work with the same user data structure and have access to all necessary avatar sources.

## Agreed Priority Order

1. **User Custom Avatar** (highest priority) - Explicitly uploaded by the user
2. **Social Login Avatar** (medium priority) - From Google, etc.
3. **Default Generated Avatar** (lowest priority) - Fallback with initials

## Proposed Workflow and Best Practices

### 1. Centralized Avatar Management

Create a single source of truth for avatar handling in the application by implementing:

#### A. Avatar Service (`src/services/avatar-service.ts`)

```typescript
/**
 * Central service for all avatar-related operations
 */
export class AvatarService {
  /**
   * Get avatar URL following standard priority:
   * 1. Custom uploaded avatar (if available)
   * 2. Social login avatar (if available)
   * 3. Generated fallback avatar
   */
  static getAvatarUrl(user: User): string {
    // Check for custom avatar first (highest priority)
    if (user.avatarUrl) {
      return user.avatarUrl;
    }
    
    // Check for social login avatar (second priority)
    if (user.photoURL || (user as any).user_metadata?.avatar_url) {
      return (user as any).user_metadata?.avatar_url || user.photoURL;
    }
    
    // Generate default avatar as fallback (lowest priority)
    return generateDefaultAvatar(user);
  }

  /**
   * Upload new avatar
   */
  static async uploadAvatar(userId: string, file: File): Promise<string> {
    // Implementation details
  }

  /**
   * Remove custom avatar
   */
  static async removeAvatar(userId: string): Promise<void> {
    // Implementation details
  }

  /**
   * Clean up orphaned avatars
   */
  static async cleanupOrphanedAvatars(): Promise<string[]> {
    // Implementation details
  }
}
```

#### B. Avatar Context Provider (`src/contexts/AvatarContext.tsx`)

Provide application-wide avatar state management:

```typescript
export const AvatarProvider: React.FC = ({ children }) => {
  // Cache for avatar URLs
  const [avatarCache, setAvatarCache] = useState<Record<string, string>>({});
  
  // Cache invalidation function
  const invalidateCache = useCallback((userId?: string) => {
    // Implementation
  }, []);
  
  // Context value
  const value = {
    getAvatarUrl: useCallback((user: User) => {
      // Use cache or service
    }, [avatarCache]),
    invalidateCache,
    // Other methods
  };
  
  return (
    <AvatarContext.Provider value={value}>
      {children}
    </AvatarContext.Provider>
  );
};
```

### 2. API Architecture

#### A. Avatar Upload API (`src/app/api/users/avatar/route.ts`)

```typescript
// POST - Upload new avatar
export async function POST(req: Request) {
  try {
    // 1. Validate user authentication
    // 2. Parse FormData for avatar file
    // 3. Validate file type and size
    // 4. Check for existing avatar and remove if found
    // 5. Upload to Supabase storage with consistent naming
    // 6. Update user profile with new avatar URL
    // 7. Return success response
  } catch (error) {
    // Error handling
  }
}

// DELETE - Remove custom avatar
export async function DELETE(req: Request) {
  try {
    // 1. Validate user authentication
    // 2. Find and remove avatar from storage
    // 3. Update user profile to remove avatar URL
    // 4. Return success response
  } catch (error) {
    // Error handling
  }
}
```

#### B. Avatar Removal API (`src/app/api/users/avatar/remove/route.ts`) 

We'll use the existing route or update it if needed:

```typescript
// POST - Remove avatar
export async function POST(req: Request) {
  try {
    // 1. Get authenticated user
    // 2. Remove avatar file from storage
    // 3. Update user record to remove avatarUrl
    // 4. Return success response
  } catch (error) {
    // Error handling
  }
}
```

### 3. Component Architecture

#### A. Base Avatar Component (`src/components/shared/BaseAvatar.tsx`)

```typescript
export const BaseAvatar: React.FC<BaseAvatarProps> = ({
  user,
  size,
  className,
  showStatus,
  // Other props
}) => {
  const { getAvatarUrl } = useAvatar(); // Use context
  
  // Use design tokens from modern components
  const statusColor = floorPlanTokens.avatar.statusIndicator[user.status as keyof typeof floorPlanTokens.avatar.statusIndicator] || 
    floorPlanTokens.avatar.statusIndicator.offline;
  
  // Implementation
};
```

#### B. Uploadable Avatar Component (`src/components/shared/UploadableAvatar.tsx`)

```typescript
export const UploadableAvatar: React.FC<UploadableAvatarProps> = ({
  user,
  onAvatarChange,
  onAvatarRemove,
  size,
  className,
  // Other props
}) => {
  // State for upload UI
  const [isHovered, setIsHovered] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // File input reference
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload handling logic
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      // Call provided callback or service directly
      await onAvatarChange(file);
    } catch (error) {
      console.error('Avatar upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };
  
  // Avatar removal logic
  const handleRemoveAvatar = async () => {
    try {
      // Call provided callback or service directly
      await onAvatarRemove();
    } catch (error) {
      console.error('Avatar removal failed:', error);
    }
  };
  
  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hidden file input */}
      <input 
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileSelect}
      />
      
      {/* Base avatar */}
      <BaseAvatar user={user} size={size} className={className} />
      
      {/* Upload controls overlay */}
      {isHovered && !isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
          {/* Upload button */}
          <button
            type="button"
            className="p-1 bg-background rounded-full"
            onClick={() => fileInputRef.current?.click()}
            title="Upload avatar"
          >
            <UploadIcon className="h-4 w-4" />
          </button>
          
          {/* Remove button - only show if user has custom avatar */}
          {user.avatarUrl && (
            <button
              type="button"
              className="p-1 bg-background rounded-full ml-1"
              onClick={handleRemoveAvatar}
              title="Remove avatar"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      
      {/* Loading indicator */}
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
          <span className="animate-spin">...</span>
        </div>
      )}
    </div>
  );
};
```

#### C. Higher-level avatar components

Create specialized avatar components that use BaseAvatar or UploadableAvatar internally:

- `ProfileAvatar` - For profile editing (extends UploadableAvatar)
- `UserMenuAvatar` - For user menus
- `SpaceAvatar` - For spaces
- `AvatarGroup` - For groups of avatars

#### D. Design System Integration

Reuse the existing design tokens from the modern components:

```typescript
// Import design tokens
import { floorPlanTokens } from '@/components/floor-plan/modern/designTokens';

// Use them in the base component
const avatarSizeClass = floorPlanTokens.avatar.size[size];
const statusIndicatorClass = floorPlanTokens.avatar.statusIndicator[status];
```

### 4. User Experience Improvements

- Allow users to explicitly choose which avatar to use (social or custom)
- Provide visual indication of the active avatar source
- Implement proper avatar removal functionality
- Add avatar preview in upload dialog

## Files That Need To Be Changed

1. **Core Avatar Service**:
   - Create `src/services/avatar-service.ts`
   - Create `src/contexts/AvatarContext.tsx`
   - Create `src/types/avatar.ts` (for AvatarUser interface)
   - Delete `src/lib/avatar-utils.ts` (replace with service)
   - Delete `src/lib/avatar-debug.ts` (integrate into service)

2. **API Routes**:
   - Update `src/app/api/users/avatar/route.ts` to handle both POST (upload)
   - Use existing `src/app/api/users/avatar/remove/route.ts` for removal
   - Create server utility `src/server/avatar-storage.ts` for storage operations

3. **Components**:
   - Create `src/components/shared/BaseAvatar.tsx`
   - Create `src/components/shared/UploadableAvatar.tsx`
   - Replace or update:
     - `src/components/profile/ProfileAvatar.tsx`
     - `src/components/floor-plan/modern/ModernUserAvatar.tsx`
     - `src/components/floor-plan/modern/AvatarGroup.tsx`
     - `src/components/ui/avatar.tsx` (potentially extend Shadcn component)

4. **UI Components that Use Avatars**:
   - Update `src/components/shell/enhanced-user-menu.tsx`
   - Update `src/components/profile/EnhancedUserProfile.tsx`
   - Update `src/components/floor-plan/modern/ModernSpaceCard.tsx`

5. **Maintain Design System**:
   - Keep and use `src/components/floor-plan/modern/designTokens.ts`
   - Integrate with design tokens in the base components

## Implementation Plan

### Phase 1: Core Infrastructure

1. Develop the avatar service with clear priority logic
2. Create context provider for application-wide avatar state
3. Update API routes to support both upload and removal
4. Create the unified AvatarUser type and conversion utilities

### Phase 2: Component Updates

1. Create base avatar component that uses the service and design tokens
2. Create uploadable avatar component that extends base avatar
3. Update specialized avatar components to use base component
4. Ensure consistent behavior across all implementations

### Phase 3: Testing & Verification

1. Test avatar display across all components
2. Verify social login avatars work correctly
3. Verify custom avatars work correctly
4. Ensure avatar groups render properly
5. Test avatar removal functionality

## Notes About User Experience

- **Avatar Priority**: The system should prioritize custom avatars over social login avatars, as these represent an explicit user choice.
- **Fallback Behavior**: When a custom avatar is removed, the system should automatically fall back to the social login avatar.
- **Transparency**: The UI should clearly indicate which avatar source is being used (custom vs. social).
- **Profile Management**: Users should have a clear way to manage their avatars, including removal and choosing between sources.

## Technical Specifications

- **Storage**: Continue using Supabase storage for avatar files.
- **Naming Convention**: Use `avatar-{userId}.{extension}` for consistent file naming.
- **Caching**: Implement client-side caching with proper invalidation to reduce storage operations.
- **Error Handling**: Provide robust error handling and fallbacks for all avatar operations.
- **Cross-Origin Issues**: Properly handle CORS for third-party avatar URLs.