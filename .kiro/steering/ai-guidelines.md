# AI Development Guidelines

## Overview
These guidelines are specifically designed to prevent code duplication and maintain architectural consistency when working with AI assistants on the Virtual Office project. Following these rules will ensure that AI-generated code integrates properly with existing systems and doesn't create duplicate implementations.

## Core Principles

### 1. Always Check Before Creating
**RULE**: Before implementing any new functionality, always search for existing implementations first.

#### Required Checks
- Search the codebase for similar component names
- Look for existing utility functions that serve the same purpose
- Check for existing hooks that provide similar functionality
- Verify if API endpoints or database operations already exist
- Review existing types and interfaces before creating new ones

#### Search Locations
```bash
# Search for existing components
src/components/*/
src/app/*/

# Search for existing utilities
src/lib/*/
src/utils/*/

# Search for existing hooks
src/hooks/*/

# Search for existing types
src/types/*/

# Search for existing repositories
src/repositories/*/
```

### 2. Extend, Don't Recreate
**RULE**: When functionality exists but needs modification, extend or modify the existing implementation rather than creating a new one.

#### Correct Approach
```typescript
// ✅ CORRECT: Extend existing utility
import { formatUserName } from '@/lib/user-utils';

export function formatUserNameWithRole(user: User): string {
  const baseName = formatUserName(user);
  return `${baseName} (${user.role})`;
}
```

#### Incorrect Approach
```typescript
// ❌ INCORRECT: Recreating existing functionality
export function formatUserDisplayName(user: User): string {
  // Duplicating logic that already exists in formatUserName
  return user.displayName || user.email?.split('@')[0] || 'Unknown User';
}
```

### 3. Follow Established Patterns
**RULE**: Use the same architectural patterns and conventions that already exist in the codebase.

#### Established Patterns in Virtual Office

##### Component Organization
- Feature-based organization: `src/components/{feature}/`
- UI components in: `src/components/ui/`
- Shell components in: `src/components/shell/`

##### Data Access Pattern
```typescript
// ✅ CORRECT: Use repository pattern
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';

const { userRepository } = getSupabaseRepositories();
const user = await userRepository.findById(userId);
```

##### Hook Pattern
```typescript
// ✅ CORRECT: Follow established hook patterns
export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => userRepository.findById(userId),
    enabled: !!userId,
  });
}
```

##### Context Pattern
```typescript
// ✅ CORRECT: Follow established context pattern
const UserContext = createContext<UserContextType | undefined>(undefined);

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
```

## Specific Implementation Guidelines

### Authentication
**Existing Implementation**: `src/contexts/AuthContext.tsx`

#### Before Creating Auth-Related Code
1. Check if `useAuth()` hook provides needed functionality
2. Look for existing auth utilities in `src/lib/auth/`
3. Verify if session management already handles your use case
4. Check for existing error handling patterns

#### Correct Usage
```typescript
// ✅ CORRECT: Use existing auth context
import { useAuth } from '@/contexts/AuthContext';

export function MyComponent() {
  const { user, signIn, signOut } = useAuth();
  // Use existing auth functionality
}
```

### Avatar System
**Existing Implementation**: `src/lib/avatar-utils.ts`, various avatar components

#### Before Creating Avatar-Related Code
1. Check `src/lib/avatar-utils.ts` for existing utilities
2. Look for existing avatar components in `src/components/profile/`
3. Verify Google OAuth avatar integration patterns
4. Check for existing upload functionality

#### Correct Usage
```typescript
// ✅ CORRECT: Use existing avatar utilities
import { extractGoogleAvatarUrl, getAvatarDisplayUrl } from '@/lib/avatar-utils';

const avatarUrl = getAvatarDisplayUrl(user);
```

### Messaging System
**Existing Implementation**: `src/components/messaging/`, `src/hooks/realtime/`

#### Before Creating Messaging-Related Code
1. Check existing messaging components in `src/components/messaging/`
2. Look for real-time hooks in `src/hooks/realtime/`
3. Verify existing message handling patterns
4. Check for existing conversation management

#### Correct Usage
```typescript
// ✅ CORRECT: Use existing messaging hooks
import { useMessages } from '@/hooks/useMessages';
import { useRealTimeSubscription } from '@/hooks/realtime/useRealTimeSubscription';
```

### Database Operations
**Existing Implementation**: Repository pattern in `src/repositories/`

#### Before Creating Database Code
1. Check existing repositories in `src/repositories/implementations/`
2. Look for existing interfaces in `src/repositories/interfaces/`
3. Verify if needed operations already exist
4. Check for existing query/mutation hooks

#### Correct Usage
```typescript
// ✅ CORRECT: Use repository pattern
import { getSupabaseRepositories } from '@/repositories/getSupabaseRepositories';

const { messageRepository } = getSupabaseRepositories();
const messages = await messageRepository.findByRoomId(roomId);
```

## File Naming and Organization

### Component Files
```typescript
// ✅ CORRECT: Follow established naming
src/components/messaging/message-item.tsx     // kebab-case for files
export function MessageItem() { }            // PascalCase for components
```

### Utility Files
```typescript
// ✅ CORRECT: Follow established naming
src/lib/avatar-utils.ts                       // kebab-case with descriptive name
export function getAvatarDisplayUrl() { }    // camelCase for functions
```

### Hook Files
```typescript
// ✅ CORRECT: Follow established naming
src/hooks/useUserPresence.ts                  // camelCase starting with "use"
export function useUserPresence() { }        // Match filename
```

### Type Files
```typescript
// ✅ CORRECT: Follow established naming
src/types/messaging.ts                        // kebab-case, descriptive domain
export interface MessageData { }             // PascalCase for interfaces
```

## Import Guidelines

### Import Order
```typescript
// ✅ CORRECT: Follow established import order
// 1. External libraries
import React from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Internal imports with @/ alias
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

// 3. Relative imports (avoid when possible)
import './component.css';
```

### Path Aliases
```typescript
// ✅ CORRECT: Use @/ alias consistently
import { UserProfile } from '@/components/profile/user-profile';

// ❌ INCORRECT: Don't use relative paths for src imports
import { UserProfile } from '../../../components/profile/user-profile';
```

## Common Duplication Scenarios to Avoid

### 1. Avatar Components (CRITICAL - 11 Components Identified)
**Problem**: Creating new avatar display components when 11 already exist
**Current Duplicates**:
- `src/components/ui/avatar.tsx` (Base Radix UI wrapper)
- `src/components/ui/enhanced-avatar.tsx` (Enhanced with status)
- `src/components/ui/enhanced-avatar-v2.tsx` (Enhanced v2 - CANONICAL)
- `src/components/ui/avatar-with-fallback.tsx` (Error handling)
- `src/components/ui/status-avatar.tsx` (Status indicator)
- `src/components/profile/ProfileAvatar.tsx` (Profile-specific)
- `src/components/profile/UploadableAvatar.tsx` (Upload functionality - CANONICAL)
- `src/components/floor-plan/user-avatar.tsx` (Floor plan specific)
- `src/components/floor-plan/UserAvatarPresence.tsx` (With presence)
- `src/components/floor-plan/modern/ModernUserAvatar.tsx` (Modern design)
- `src/components/examples/AvatarShowcase.tsx` (Demo component)

**Solution**: 
- **Display avatars**: Use `EnhancedAvatarV2` from `src/components/ui/enhanced-avatar-v2.tsx`
- **Upload avatars**: Use `UploadableAvatar` from `src/components/profile/UploadableAvatar.tsx`
- **Utilities**: Use functions from `src/lib/avatar-utils.ts`

### 2. Messaging Components (4 Duplicates Identified)
**Problem**: Creating new message components when duplicates exist
**Current Duplicates**:
- `src/components/messaging/conversation-list.tsx` vs `ConversationList.tsx`
- `src/components/messaging/room-messaging.tsx` vs `RoomMessaging.tsx`

**Solution**: 
- Use PascalCase versions: `ConversationList.tsx`, `RoomMessaging.tsx`
- Check existing messaging components before creating new ones
- Use established messaging hooks: `useMessages`, `useConversations`

### 3. Authentication Utilities (EXEMPLARY - No Duplicates)
**Problem**: Creating new auth helpers when comprehensive system exists
**Existing Implementation** (Use these, don't recreate):
- `src/contexts/AuthContext.tsx` - Main auth context
- `src/lib/auth/error-handler.ts` - Error handling
- `src/lib/auth/session-manager.ts` - Session management
- `src/hooks/useAuthErrorHandler.ts` - Error hook
- `src/hooks/useSession.ts` - Session hook
- `src/hooks/useProtectedRoute.ts` - Route protection

**Solution**: Always check existing auth system before creating new auth-related code

### 4. Database Queries (EXEMPLARY - Repository Pattern)
**Problem**: Writing raw Supabase queries instead of using repositories
**Existing Implementation**:
- Repository pattern in `src/repositories/`
- Query hooks in `src/hooks/queries/`
- Mutation hooks in `src/hooks/mutations/`
- Real-time hooks in `src/hooks/realtime/`

**Solution**: Use repository pattern and existing query/mutation hooks

### 5. Hooks (EXCELLENT - No Duplicates Found)
**Problem**: Creating duplicate custom hooks
**Current Status**: Hooks directory shows excellent organization with zero duplicates
**Existing Hooks** (Use these, don't recreate):
- Authentication: `useSession`, `useAuthErrorHandler`, `useProtectedRoute`
- Messaging: `useMessages`, `useConversations`, `useMessageRealtime`
- Data: `useSpaces`, `useSpaceMutations`, `useSpaceRealtime`
- Utilities: `useLocalStorage`, `useImageUpload`, `useNotification`

**Solution**: Check `src/hooks/` thoroughly before creating new hooks

### 6. Type Definitions
**Problem**: Creating duplicate interfaces for the same data
**Solution**: Check `src/types/` for existing type definitions

## Error Handling Patterns

### Existing Error Handling
```typescript
// ✅ CORRECT: Use existing error handling patterns
import { AuthErrorHandler } from '@/lib/auth/error-handler';

try {
  await someAuthOperation();
} catch (error) {
  const categorizedError = await AuthErrorHandler.handleError(error);
  setError(categorizedError.userMessage);
}
```

### Component Error Boundaries
```typescript
// ✅ CORRECT: Use existing ErrorBoundary
import { ErrorBoundary } from '@/components/ErrorBoundary';

<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>
```

## Testing Patterns

### Existing Test Structure
- Unit tests in `__tests__/` directory
- Integration tests with Playwright
- Mock patterns in `__tests__/mocks/`

### Before Creating Tests
1. Check for existing test utilities
2. Look for established mock patterns
3. Verify existing test setup and configuration
4. Use existing test helpers and fixtures

## Code Quality Checklist

### Before Submitting Code
- [ ] Searched for existing similar functionality
- [ ] Used established architectural patterns
- [ ] Followed naming conventions
- [ ] Used proper import patterns and aliases
- [ ] Checked for existing types and interfaces
- [ ] Used repository pattern for database operations
- [ ] Followed existing error handling patterns
- [ ] Added appropriate TypeScript types
- [ ] Used existing UI components from `src/components/ui/`
- [ ] Followed established file organization

### Red Flags (Avoid These)
- Creating components with similar names to existing ones
- Writing raw database queries instead of using repositories
- Creating new context providers without checking existing ones
- Duplicating utility functions
- Creating new type definitions for existing data structures
- Bypassing established authentication patterns
- Creating new error handling mechanisms
- Ignoring existing UI component library

## Examples of Correct Implementation

### Adding New Feature to Existing System
```typescript
// ✅ CORRECT: Extending existing messaging system
import { useMessages } from '@/hooks/useMessages';
import { MessageItem } from '@/components/messaging/message-item';
import { MessageComposer } from '@/components/messaging/message-composer';

export function EnhancedMessageView() {
  const { messages, sendMessage } = useMessages();
  
  // Extend existing functionality rather than recreate
  const handleSendWithNotification = async (content: string) => {
    await sendMessage(content);
    // Add new notification feature
    showNotification('Message sent successfully');
  };

  return (
    <div>
      {messages.map(message => (
        <MessageItem key={message.id} message={message} />
      ))}
      <MessageComposer onSend={handleSendWithNotification} />
    </div>
  );
}
```

### Adding New Utility Function
```typescript
// ✅ CORRECT: Adding to existing utility file
// File: src/lib/avatar-utils.ts

// Existing function
export function getAvatarDisplayUrl(user: User): string { ... }

// New function that extends existing functionality
export function getAvatarWithFallback(user: User, fallbackUrl: string): string {
  const avatarUrl = getAvatarDisplayUrl(user);
  return avatarUrl || fallbackUrl;
}
```

## System Audit Findings & Priorities

### Critical Issues Identified (December 2024 Audit)

#### 1. Avatar Component Chaos (HIGHEST PRIORITY)
- **11 different avatar components** with overlapping functionality
- **36% reduction possible** through consolidation to 7 components
- **Major maintenance burden** and developer confusion
- **Inconsistent UX** across the application

**Immediate Action Required**: Use canonical components only:
- `EnhancedAvatarV2` for display avatars
- `UploadableAvatar` for upload functionality
- Never create new avatar components without checking existing ones

#### 2. Messaging Component Duplicates (MEDIUM PRIORITY)
- **4 duplicate components** due to naming inconsistency
- **PascalCase vs kebab-case** confusion
- **Import confusion** for developers

**Action Required**: Use PascalCase versions only

#### 3. Excellent Architecture Examples (REFERENCE MODELS)
- **Authentication System**: Zero duplicates, exemplary architecture
- **Hooks Directory**: Excellent organization, no duplicates found
- **Repository Pattern**: Clean implementation, no issues
- **Invitation System**: Well-organized, zero duplicates

**Use These as Reference**: When creating new systems, follow the patterns from these areas

### Consolidation Status

#### ✅ Systems with Excellent Organization (No Changes Needed)
- **Authentication System**: 9 well-structured components, zero duplicates
- **Hooks Directory**: 12+ hooks with clear separation of concerns
- **Repository Pattern**: Clean implementation across all repositories
- **Invitation System**: 4 well-organized components, zero duplicates
- **Library Directory**: No duplicates, excellent separation of concerns

#### 🔧 Systems Requiring Consolidation
- **Avatar Components**: 11 → 7 components (36% reduction needed)
- **Messaging Components**: 4 duplicates need standardization

### Development Priorities Based on Audit

#### Priority 1 (Critical): Avatar System
- **Impact**: Affects entire application
- **Effort**: 1-2 weeks
- **Risk**: Medium (requires careful migration)
- **Action**: Use `EnhancedAvatarV2` and `UploadableAvatar` only

#### Priority 2 (Important): Messaging Cleanup
- **Impact**: Affects messaging functionality
- **Effort**: 2-3 days
- **Risk**: Low (straightforward cleanup)
- **Action**: Standardize to PascalCase naming

#### Priority 3 (Maintenance): File Cleanup
- **Impact**: Organizational improvement
- **Effort**: 1 day
- **Risk**: Very low
- **Action**: Remove unused files like `useSocketEvents.ts`

## Conclusion

Following these guidelines ensures that:
- Code remains maintainable and consistent
- Duplication is minimized (especially critical for avatar components)
- Architectural patterns are preserved (follow auth/hooks/repository examples)
- New features integrate seamlessly with existing systems
- Development velocity is maintained
- Technical debt is reduced

### Key Audit Insights
1. **Avatar system needs immediate consolidation** (11 components → 7)
2. **Authentication, hooks, and repositories are exemplary** (use as reference)
3. **Messaging needs minor cleanup** (naming standardization)
4. **Overall architecture is solid** with specific problem areas

Remember: **When in doubt, search first, extend second, create last.**

**Special Avatar Rule**: Before creating ANY avatar-related code, check the 11 existing implementations first!