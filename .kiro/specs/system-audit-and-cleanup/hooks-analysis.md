# Hooks Directory Analysis

## Overview
Analysis of the `src/hooks` directory structure, identifying custom hooks, their functionality, and potential duplicates.

## Directory Structure

### Top-level Hooks
- `useAuthErrorHandler.ts` - Authentication error handling hook
- `useConversations.ts` - Conversation management hook
- `useImageUpload.ts` - Image upload with validation and compression
- `useInvitationOperation.ts` - Invitation operations with error handling
- `useLastSpace.ts` - Last space persistence across sessions
- `useLocalStorage.ts` - Local storage state management
- `useMessages.ts` - Message management hook
- `useNotification.ts` - Toast notification wrapper
- `useProtectedRoute.ts` - Route protection with auth/company checks
- `useSession.ts` - Supabase session management
- `useSocketEvents.ts` - Socket event handling (empty file)
- `useUserPresence.ts` - User presence and location management

### Organized Subdirectories

#### `/mutations` - Data Mutation Hooks
- `useSpaceMutations.ts` - Space CRUD operations with TanStack Query

#### `/queries` - Data Query Hooks
- `useSpaces.ts` - Space data fetching with TanStack Query

#### `/realtime` - Real-time Subscription Hooks
- `index.ts` - Real-time hooks exports
- `useConversationRealtime.ts` - Real-time conversation updates
- `useMessageRealtime.ts` - Real-time message updates
- `useSpaceRealtime.ts` - Real-time space updates

## Functionality Analysis

### Authentication Hooks
1. **Session Management (`useSession.ts`):**
   - Manages Supabase auth session state
   - Handles session loading and auth state changes
   - Provides user, session, loading, and error states

2. **Auth Error Handling (`useAuthErrorHandler.ts`):**
   - Categorizes authentication errors
   - Provides recovery actions
   - Integrates with auth context for recovery operations

3. **Route Protection (`useProtectedRoute.ts`):**
   - Protects routes requiring authentication
   - Handles company requirement checks
   - Manages redirects to login/company creation

**Analysis:** Well-structured authentication hooks with clear separation of concerns. No duplicates identified.

### Messaging System Hooks
1. **Message Management (`useMessages.ts`):**
   - Manages message state for conversations
   - Handles message sending with optimistic updates
   - Integrates with real-time message updates
   - Provides reaction and attachment functionality

2. **Conversation Management (`useConversations.ts`):**
   - Manages conversation list and active conversation
   - Handles room and direct conversation creation
   - Provides archive/unarchive functionality
   - Calculates unread counts

3. **Real-time Messaging:**
   - `useMessageRealtime.ts` - Real-time message updates
   - `useConversationRealtime.ts` - Real-time conversation updates

**Analysis:** Comprehensive messaging system with proper separation between messages and conversations. Real-time hooks are well-integrated.

### Data Management Hooks (TanStack Query)
1. **Space Queries (`useSpaces.ts`):**
   - Fetches spaces by company
   - Fetches individual spaces by ID
   - Proper caching and stale time configuration

2. **Space Mutations (`useSpaceMutations.ts`):**
   - CRUD operations for spaces
   - Template-based space creation
   - Automatic cache invalidation

3. **Real-time Space Updates (`useSpaceRealtime.ts`):**
   - Subscribes to space table changes
   - Updates TanStack Query cache automatically

**Analysis:** Well-architected data layer with proper separation of queries, mutations, and real-time updates.

### User Presence System
1. **User Presence (`useUserPresence.ts`):**
   - Manages user presence data
   - Handles location updates with debouncing
   - Provides users-in-spaces mapping
   - Real-time presence updates

**Analysis:** Comprehensive presence system with proper debouncing and error handling.

### Utility Hooks
1. **Local Storage (`useLocalStorage.ts`):**
   - Persistent state management with localStorage
   - SSR-safe implementation
   - Error handling for storage operations

2. **Image Upload (`useImageUpload.ts`):**
   - Complete image upload pipeline
   - Validation, compression, and progress tracking
   - Error handling with specific error types

3. **Notification (`useNotification.ts`):**
   - Simple wrapper around Sonner toast library
   - Success and error notification methods

4. **Last Space (`useLastSpace.ts`):**
   - Persists user's last space across sessions
   - Automatic rejoin functionality
   - Integration with user location API

5. **Invitation Operations (`useInvitationOperation.ts`):**
   - Handles invitation operations with retry logic
   - Comprehensive error handling
   - Integration with invitation error handler

**Analysis:** Well-designed utility hooks with specific purposes and good error handling.

## Identified Issues

### Empty/Incomplete Files
1. **Socket Events (`useSocketEvents.ts`):**
   - File exists but is empty
   - **Recommendation:** Remove if not used, or implement if needed

### Potential Improvements
1. **Real-time Hook Organization:**
   - Real-time hooks are well-organized in `/realtime` subdirectory
   - Good separation of concerns

2. **Error Handling Consistency:**
   - Most hooks have good error handling
   - Consistent patterns across similar hooks

## Dependencies and Usage Patterns

### Authentication Flow
```
useSession.ts (core session)
├── Used by: useProtectedRoute.ts, auth components
├── Integrates with: Supabase auth
└── Provides: Session state management

useAuthErrorHandler.ts
├── Uses: AuthContext, auth error handler lib
├── Used by: Auth components
└── Provides: Error recovery actions

useProtectedRoute.ts
├── Uses: useAuth, useCompany contexts
├── Used by: Protected page components
└── Provides: Route protection logic
```

### Messaging System Flow
```
useMessages.ts
├── Uses: useMessageRealtime.ts, messaging API
├── Used by: Chat components
└── Provides: Message management

useConversations.ts
├── Uses: useConversationRealtime.ts, messaging API
├── Used by: Conversation list components
└── Provides: Conversation management

Real-time hooks
├── useMessageRealtime.ts
├── useConversationRealtime.ts
└── Integrate with: TanStack Query cache
```

### Data Management Flow
```
useSpaces.ts (queries)
├── Uses: TanStack Query, space repository
├── Used by: Floor plan components
└── Provides: Space data fetching

useSpaceMutations.ts (mutations)
├── Uses: TanStack Query, space API
├── Used by: Space management components
└── Provides: Space CRUD operations

useSpaceRealtime.ts
├── Integrates with: TanStack Query cache
├── Used by: Space-related components
└── Provides: Real-time space updates
```

## Code Quality Assessment

### Strengths
1. **Clear Organization:** Hooks are well-organized by functionality
2. **Separation of Concerns:** Each hook has a specific purpose
3. **Error Handling:** Comprehensive error handling throughout
4. **Real-time Integration:** Excellent real-time functionality
5. **Type Safety:** Strong TypeScript usage
6. **Performance:** Proper memoization and optimization

### Areas for Improvement
1. **Empty Files:** Remove unused `useSocketEvents.ts`
2. **Documentation:** Some hooks could benefit from more detailed JSDoc
3. **Testing:** Consider adding unit tests for complex hooks

## Integration Points

### Context Integration
- **AuthContext:** Used by auth-related hooks
- **CompanyContext:** Used by protected route and company-related hooks
- **MessagingContext:** Potential integration point for messaging hooks

### Library Integration
- **TanStack Query:** Excellent integration for data management
- **Supabase:** Well-integrated for auth and real-time features
- **Sonner:** Simple integration for notifications

### Component Integration
- Hooks are designed to be consumed by components
- Clear interfaces and return values
- Proper state management patterns

## No Duplicates Identified

The hooks directory shows excellent organization with no duplicate functionality:

- **Authentication:** Clear separation between session, error handling, and route protection
- **Messaging:** Proper separation between messages and conversations
- **Data Management:** Clean separation of queries, mutations, and real-time updates
- **Utilities:** Each utility hook serves a specific purpose
- **Real-time:** Well-organized real-time hooks with clear responsibilities

## Recommendations

### Immediate Actions
1. **Remove Empty File:**
   - Delete `useSocketEvents.ts` if not needed
   - Or implement if socket functionality is required

2. **Documentation:**
   - Add JSDoc comments to complex hooks
   - Document hook dependencies and usage patterns

### Architecture Improvements
1. **Hook Composition:**
   - Consider creating composite hooks for common patterns
   - Example: `useMessagingSystem` that combines messages and conversations

2. **Error Handling:**
   - Consider creating a generic error handling hook
   - Standardize error handling patterns across all hooks

3. **Testing:**
   - Add unit tests for complex hooks
   - Test error scenarios and edge cases

### Performance Optimizations
1. **Memoization:**
   - Review callback dependencies
   - Ensure proper memoization of expensive operations

2. **Real-time Optimization:**
   - Consider batching real-time updates
   - Optimize subscription management

## Summary

The hooks directory demonstrates excellent architectural practices:
- **No duplicate functionality** - each hook has a clear, distinct purpose
- **Well-organized structure** - logical grouping by functionality
- **Strong integration** - excellent integration with external libraries
- **Comprehensive functionality** - covers all major application concerns
- **Good error handling** - consistent error handling patterns
- **Type safety** - strong TypeScript usage throughout

The main issue is a single empty file that should be removed. Otherwise, this directory serves as a good example of how to structure custom hooks in a React application.