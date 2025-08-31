# User Type Consolidation Analysis

## Current User Type Issues Identified

Similar to the avatar consolidation challenge, the codebase has multiple user type definitions that create confusion, maintenance overhead, and type inconsistencies.

## Current User Types Found

### 1. **`User` interface** (`src/types/database.ts`)
- **Purpose**: Database entity representation
- **Fields**: `id`, `companyId`, `supabase_uid`, `email`, `displayName`, `avatarUrl`, `status`, `statusMessage`, `preferences`, `role`, `lastActive`, `createdAt`, `current_space_id`
- **Status**: ✅ **CANONICAL DATABASE TYPE** - This should remain as the primary database user interface

### 2. **`UserPresenceData` interface** (`src/types/database.ts`)
- **Purpose**: Real-time presence data
- **Fields**: `id`, `displayName`, `avatarUrl`, `status`, `current_space_id`, `avatarLoading`, `avatarError`
- **Status**: 🔄 **SPECIALIZED SUBSET** - Valid for presence-specific use cases, derives from User

### 3. **`UIUser` interface** (`src/types/ui.ts`)
- **Purpose**: UI-specific user representation
- **Fields**: `id`, `displayName`, `avatarUrl`, `status`, `statusMessage`, `name` (deprecated), `avatar` (deprecated), `activity` (deprecated)
- **Issues**: 
  - Mixed current and legacy field names
  - Inconsistent with database User interface
  - Has deprecated legacy support fields
- **Status**: 🚨 **NEEDS CONSOLIDATION** - Should be unified with User interface

### 4. **`AvatarUser` interface** (`src/lib/avatar-utils.ts`)
- **Purpose**: Generic avatar-compatible interface
- **Fields**: `id`, `displayName`, `name`, `avatarUrl`, `avatar`, `photoURL`, `status`
- **Issues**:
  - Generic interface to handle multiple user-like objects
  - Multiple field names for same concept (`displayName`/`name`, `avatarUrl`/`avatar`/`photoURL`)
- **Status**: ✅ **KEEP FOR FLEXIBILITY** - Useful generic interface for avatar utilities

### 5. **`GoogleOAuthUser` interface** (`src/lib/services/google-avatar-service.ts`)
- **Purpose**: Google OAuth user data
- **Fields**: Not fully analyzed, appears to be Google-specific
- **Status**: ✅ **KEEP SPECIALIZED** - OAuth-specific type

### 6. **Local inline user types** (found in multiple components)
- **Examples**:
  - `UploadableAvatar` props: `{ id: string; displayName: string; avatarUrl?: string | null; status?: ... }`
  - Multiple components define their own user-like interfaces
- **Issues**: Inconsistent field names and structures
- **Status**: 🚨 **MAJOR CONSOLIDATION NEEDED** - Replace with canonical types

## Root Cause Analysis

### Historical Evolution Problems
1. **Legacy Migration**: `UIUser` has backward compatibility fields (`name`, `avatar`, `activity`)
2. **Database Migration**: Migration from other systems left field naming inconsistencies
3. **Component-Level Definitions**: Components define their own user interfaces instead of using shared types

### Field Naming Inconsistencies
| Concept | Database.User | UIUser | AvatarUser | Components |
|---------|---------------|--------|------------|------------|
| **Name** | `displayName` | `displayName` + `name` (legacy) | `displayName` + `name` | Mixed |
| **Avatar** | `avatarUrl` | `avatarUrl` + `avatar` (legacy) | `avatarUrl` + `avatar` + `photoURL` | Mixed |
| **Activity** | `statusMessage` | `statusMessage` + `activity` (legacy) | `status` | Mixed |

## Consolidation Plan

### Phase 1: Canonical Type Architecture
1. **Keep `User` (database.ts)** as the primary user interface
2. **Keep `UserPresenceData` (database.ts)** for real-time presence
3. **Keep `AvatarUser` (avatar-utils.ts)** as generic avatar interface
4. **Refactor `UIUser`** to align with `User` interface
5. **Remove inline component user types**

### Phase 2: Field Name Standardization
- **Primary Name Field**: `displayName` (matches database)
- **Primary Avatar Field**: `avatarUrl` (matches database)
- **Primary Status Message**: `statusMessage` (matches database)

### Phase 3: Migration Strategy
1. **Update UIUser interface** to remove legacy fields and align with User
2. **Create type adapters** for backward compatibility during transition
3. **Update components** to use canonical User interface
4. **Remove local inline user type definitions**

### Phase 4: Type Utilities
- **User type guards** for runtime type checking
- **Type converters** between User and specialized types
- **Common user utilities** for consistent user data handling

## Components Requiring Updates

### High Priority (Using Local User Types)
- `UploadableAvatar.tsx` - Define user prop with inline interface
- `UserHoverCard.tsx` - Uses `UIUser as User` import alias
- `ModernUserAvatar.tsx` - Comments about AvatarUser compatibility
- `InteractiveUserAvatar.tsx` - Uses local user interface
- `UserInteractionMenu.tsx` - Uses database User but could benefit from consistency

### Medium Priority (Using UIUser)
- `floor-plan/types.ts` - Exports UIUser
- Components importing UIUser from types

### Low Priority (Already Using Canonical Types)
- Components using `User` from `database.ts`
- Components using `UserPresenceData` appropriately

## Expected Benefits

1. **Reduced Complexity**: Eliminate 60%+ of user type definitions
2. **Type Safety**: Consistent field names across components  
3. **Maintainability**: Single source of truth for user data structure
4. **Developer Experience**: Clear guidance on which user type to use
5. **Reduced Bugs**: Eliminate field name mismatches and type errors

## Implementation Priority

1. **Start with UIUser consolidation** - biggest impact, affects multiple components
2. **Update UploadableAvatar** - recent interface issues identified
3. **Migrate floor-plan components** - many user type inconsistencies
4. **Clean up inline component types** - reduce overall type count
5. **Add type utilities** - ensure smooth transitions

This consolidation follows the same successful pattern used for avatar components.