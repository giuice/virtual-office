# Avatar Component Consolidation Plan

## Current State Analysis

### Identified Avatar Components

1. **src/components/examples/AvatarShowcase.tsx** - Demo/showcase component
2. **src/components/floor-plan/user-avatar.tsx** - Floor plan specific avatar with popover
3. **src/components/floor-plan/UserAvatarPresence.tsx** - Avatar with presence indicator
4. **src/components/floor-plan/modern/ModernUserAvatar.tsx** - Modern design avatar with comprehensive features
5. **src/components/profile/ProfileAvatar.tsx** - Profile page avatar with upload functionality
6. **src/components/profile/UploadableAvatar.tsx** - Advanced uploadable avatar with progress tracking
7. **src/components/ui/avatar-with-fallback.tsx** - Basic avatar with fallback handling
8. **src/components/ui/avatar.tsx** - Base Radix UI avatar component (keep as-is)
9. **src/components/ui/enhanced-avatar-v2.tsx** - Most comprehensive avatar implementation
10. **src/components/ui/enhanced-avatar.tsx** - Earlier version of enhanced avatar
11. **src/components/ui/status-avatar.tsx** - Avatar with status indicator

### Avatar Utilities and Services

1. **src/lib/avatar-utils.ts** - Comprehensive avatar utilities (canonical)
2. **src/lib/avatar-debug.ts** - Debug utilities for avatar testing
3. **src/lib/services/avatar-sync-service.ts** - Avatar synchronization service
4. **src/lib/services/google-avatar-service.ts** - Google OAuth avatar handling
5. **src/hooks/useImageUpload.ts** - Image upload hook (used by avatar components)

## Consolidation Strategy

### Phase 1: Identify Canonical Implementations

#### Primary Avatar Component: `EnhancedAvatarV2`
**Location**: `src/components/ui/enhanced-avatar-v2.tsx`
**Rationale**: 
- Most comprehensive feature set
- Proper error handling and retry logic
- Loading states and fallback handling
- Size variants and status indicators
- Accessibility support
- Performance optimizations
- Uses centralized avatar utilities

#### Primary Upload Component: `UploadableAvatar`
**Location**: `src/components/profile/UploadableAvatar.tsx`
**Rationale**:
- Advanced upload functionality with progress tracking
- Proper error handling and validation
- Uses the image upload hook
- Comprehensive UI states
- Accessibility support

#### Primary Utilities: `avatar-utils.ts`
**Location**: `src/lib/avatar-utils.ts`
**Rationale**:
- Comprehensive avatar URL resolution
- Caching and performance optimization
- Error handling and logging
- Google OAuth integration
- Fallback generation

### Phase 2: Component Consolidation Plan

#### Components to Keep (Canonical)
1. **src/components/ui/avatar.tsx** - Base Radix UI component (foundation)
2. **src/components/ui/enhanced-avatar-v2.tsx** - Primary display avatar
3. **src/components/profile/UploadableAvatar.tsx** - Primary upload avatar
4. **src/lib/avatar-utils.ts** - Primary utilities
5. **src/lib/services/avatar-sync-service.ts** - Sync service
6. **src/lib/services/google-avatar-service.ts** - Google integration
7. **src/hooks/useImageUpload.ts** - Upload hook

#### Components to Consolidate/Remove

##### High Priority Duplicates (Remove)
1. **src/components/ui/enhanced-avatar.tsx** → Replace with `enhanced-avatar-v2.tsx`
2. **src/components/ui/avatar-with-fallback.tsx** → Replace with `enhanced-avatar-v2.tsx`
3. **src/components/ui/status-avatar.tsx** → Replace with `enhanced-avatar-v2.tsx` (has status support)

##### Medium Priority Duplicates (Refactor)
1. **src/components/floor-plan/UserAvatarPresence.tsx** → Refactor to use `enhanced-avatar-v2.tsx`
2. **src/components/floor-plan/modern/ModernUserAvatar.tsx** → Refactor to use `enhanced-avatar-v2.tsx`
3. **src/components/profile/ProfileAvatar.tsx** → Replace with `UploadableAvatar.tsx`

##### Low Priority Duplicates (Refactor)
1. **src/components/floor-plan/user-avatar.tsx** → Refactor to use `enhanced-avatar-v2.tsx`
2. **src/components/examples/AvatarShowcase.tsx** → Update to showcase canonical components

### Phase 3: Migration Plan

#### Step 1: Update Import References
Search and replace all imports of deprecated components:

```typescript
// Replace these imports:
import { EnhancedAvatar } from '@/components/ui/enhanced-avatar'
import { AvatarWithFallback } from '@/components/ui/avatar-with-fallback'
import { StatusAvatar } from '@/components/ui/status-avatar'

// With:
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2'
```

#### Step 2: Update Component Usage
Map old component props to new component props:

```typescript
// Old usage:
<EnhancedAvatar user={user} size="md" showStatus />
<AvatarWithFallback src={avatarUrl} alt={name} size="md" />
<StatusAvatar user={user} showStatusIndicator />

// New usage:
<EnhancedAvatarV2 user={user} size="md" showStatus />
<EnhancedAvatarV2 user={user} size="md" showStatus />
<EnhancedAvatarV2 user={user} size="md" showStatus />
```

#### Step 3: Refactor Specialized Components
Update floor-plan and other specialized components to use canonical implementations while preserving their specific functionality:

```typescript
// UserAvatarPresence.tsx - Keep wrapper but use EnhancedAvatarV2 internally
export function UserAvatarPresence({ user, onClick }: UserAvatarPresenceProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div onClick={() => onClick?.(user.id)}>
            <EnhancedAvatarV2 
              user={user} 
              size="md" 
              showStatus 
              onClick={() => onClick?.(user.id)}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{user.displayName}</p>
          <p className="text-xs capitalize">{user.status}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

### Phase 4: File Removal Strategy

#### Safe Removal Process
1. **Create backup branch** before starting removal
2. **Update all references** to use canonical components
3. **Run comprehensive tests** to ensure no breakage
4. **Remove deprecated files** one by one
5. **Verify build and tests** after each removal

#### Files to Remove (After Migration)
1. `src/components/ui/enhanced-avatar.tsx`
2. `src/components/ui/avatar-with-fallback.tsx`
3. `src/components/ui/status-avatar.tsx`
4. `src/components/profile/ProfileAvatar.tsx` (replace with UploadableAvatar)

#### Files to Refactor (Keep but Simplify)
1. `src/components/floor-plan/UserAvatarPresence.tsx` - Simplify to use EnhancedAvatarV2
2. `src/components/floor-plan/modern/ModernUserAvatar.tsx` - Simplify to use EnhancedAvatarV2
3. `src/components/floor-plan/user-avatar.tsx` - Simplify to use EnhancedAvatarV2

## Implementation Benefits

### Reduced Complexity
- Single source of truth for avatar display logic
- Consistent behavior across the application
- Easier maintenance and bug fixes

### Improved Performance
- Centralized caching and optimization
- Reduced bundle size from duplicate code
- Better loading and error handling

### Enhanced Developer Experience
- Clear component hierarchy and usage patterns
- Comprehensive documentation and examples
- Consistent API across all avatar use cases

### Better User Experience
- Consistent avatar behavior and appearance
- Improved loading states and error handling
- Better accessibility support

## Risk Assessment

### Low Risk
- Base avatar component replacement (enhanced-avatar → enhanced-avatar-v2)
- Utility consolidation (already centralized)

### Medium Risk
- Floor-plan component refactoring (specialized functionality)
- Profile component replacement (upload functionality)

### High Risk
- Complete removal of working components without thorough testing
- Breaking existing integrations with specialized avatar features

## Testing Strategy

### Unit Tests
- Test all canonical components with various props
- Test avatar utility functions
- Test upload functionality

### Integration Tests
- Test avatar display in floor-plan components
- Test avatar upload in profile components
- Test Google OAuth avatar integration

### Visual Regression Tests
- Ensure avatar appearance remains consistent
- Test all size variants and status indicators
- Test loading and error states

## Success Metrics

### Code Quality
- Reduce avatar-related files from 11 to 7 (36% reduction)
- Eliminate duplicate functionality
- Improve test coverage

### Performance
- Reduce bundle size from duplicate code elimination
- Improve avatar loading performance with centralized caching
- Better error handling and retry logic

### Maintainability
- Single source of truth for avatar logic
- Consistent API across all avatar components
- Clear documentation and usage patterns