# User Types Consolidation Plan

**Date:** 2025-09-03  
**Status:** Planning Phase  
**Priority:** High - Architectural Issue  

## Problem Statement

The Virtual Office codebase has **architectural chaos** with **11+ different user type representations**:

1. `User` (database.ts) - Main database interface
2. `UIUser` (ui.ts) - UI-specific interface  
3. `UserPresenceData` (database.ts) - Presence system
4. `AvatarUser` (avatar-utils.ts) - Avatar system
5. `GoogleOAuthUser` (google-avatar-service.ts) - Google OAuth
6. `UserRow` (SupabaseUserRepository.ts) - Database row type
7. Multiple component prop interfaces (UserHoverCardProps, ModernUserAvatarProps, etc.)

**Current Issues:**
- **Maintenance nightmare**: Changing one user field requires updating 11+ types
- **Type confusion**: Developers don't know which type to use
- **Endless adapters**: Need adapters between every type combination
- **Runtime errors**: Missing fields when converting between incompatible types
- **Duplicate functions**: Same conversion logic scattered across multiple files

## Solution Strategy: Single Source of Truth Pattern

### Core Principle
**One canonical `User` type + context-specific views using TypeScript utilities**

### Consolidated Type Architecture

```typescript
// KEEP: Single canonical user type
export interface User {
  id: string;
  companyId: string | null;
  supabase_uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
  statusMessage?: string;
  preferences: UserPreferences;
  role: UserRole;
  lastActive: TimeStampType;
  createdAt: TimeStampType;
  currentSpaceId?: string | null;
}

// KEEP: Minimal presence data (real-time only)
export interface UserPresenceData {
  id: string;
  displayName: string;
  avatarUrl?: string;
  status?: UserStatus;
  currentSpaceId?: string | null;
}

// NEW: Context-specific views using Pick<User>
export type UserAvatarData = Pick<User, 'id' | 'displayName' | 'avatarUrl' | 'status'>;
export type UserBasicInfo = Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
export type UserMessageSender = Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
```

### Elimination Plan

**REMOVE these redundant types:**
- `UIUser` (ui.ts) → Use `User` directly
- `AvatarUser` (avatar-utils.ts) → Use `UserAvatarData`
- `GoogleOAuthUser` → Use `Partial<User>` for OAuth data
- Component-specific user prop interfaces → Use `Pick<User, ...>`

**CONSOLIDATE functions:**
- Keep only essential conversions in `user-type-adapters.ts`
- Remove duplicates from `ui.ts`
- Standardize naming with `map*` prefix

## Implementation Plan

### Phase 1: Clean Up Duplicate Functions ✅
- [x] Remove duplicate functions from `src/types/ui.ts`
- [x] Keep only `user-type-adapters.ts` as single conversion source
- [x] Standardize function naming

### Phase 2: Define Context-Specific Types
- [ ] Add `Pick<User>` type aliases to `src/types/database.ts`
- [ ] Create utility types for common user data patterns
- [ ] Document when to use each type

### Phase 3: Update Component Interfaces
- [ ] Replace custom user prop interfaces with `Pick<User>` patterns
- [ ] Update avatar components to use `UserAvatarData`
- [ ] Update message components to use `UserMessageSender`

### Phase 4: Fix MessageItem Type Issue
- [ ] Update `MessageItem` sender prop to use `UserMessageSender`
- [ ] Update `InteractiveUserAvatar` to accept `UserAvatarData | User`
- [ ] Remove complex spread operations

### Phase 5: Migration & Cleanup
- [ ] Update all imports to use consolidated types
- [ ] Remove unused type definitions
- [ ] Update documentation

### Phase 6: Testing & Validation
- [ ] Run TypeScript compilation
- [ ] Test avatar display functionality
- [ ] Test messaging functionality
- [ ] Verify no runtime errors

## Expected Benefits

1. **Reduced Complexity**: 11+ types → 3 core types + utility types
2. **Type Safety**: Clear type relationships, no more guessing
3. **Maintainability**: Change user schema once, types auto-update
4. **Developer Experience**: Clear patterns, obvious choices
5. **Runtime Reliability**: Fewer conversion errors
6. **Code Reuse**: Shared type utilities across components

## Risk Mitigation

- **Gradual Migration**: Implement phase by phase to avoid breaking changes
- **Backward Compatibility**: Keep old types temporarily with deprecation warnings
- **Testing**: Comprehensive testing at each phase
- **Documentation**: Clear migration guide for developers

## Success Criteria

- [ ] TypeScript compilation succeeds with no type errors
- [ ] All avatar functionality works correctly
- [ ] All messaging functionality works correctly  
- [ ] No runtime type-related errors
- [ ] Developer confusion eliminated (documented patterns)
- [ ] Code coverage maintained or improved

---

**Next Actions:**
1. Execute Phase 1: Clean up duplicate functions
2. Define context-specific types in Phase 2
3. Begin component interface updates in Phase 3