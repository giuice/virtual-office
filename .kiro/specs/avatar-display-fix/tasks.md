# Implementation Plan

**Important Note**: Before implementing any task, first examine the existing codebase to identify what components, services, or utilities already exist. Extend or modify existing implementations rather than recreating them from scratch.

**Database Note**: No database schema changes needed. The existing `avatar_url` field can store URLs from any source (Supabase storage, Google OAuth, etc.).

- [x] 1. Fix current avatar display issues with existing avatar_url field
  - Debug why existing Supabase storage URLs (like your example) aren't displaying properly
  - Investigate avatar loading failures in existing components
  - Fix any CORS, permissions, or URL generation issues with Supabase storage
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Update existing avatar-utils.ts to fix current issues and support Google avatars







  - Fix current avatar display issues where Supabase storage URLs aren't loading properly
  - Update avatar resolution logic to prioritize: avatarUrl (from database) > photoURL (from OAuth) > fallback initials
  - Add debug logging for avatar loading failures and Google avatar resolution
  - Write unit tests for updated avatar URL resolution logic
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.6_

- [x] 3. Create Google OAuth avatar extraction service





  - Implement function to extract avatar URL from Google OAuth response
  - Create service to store Google avatar URL during user registration
  - Write unit tests for Google avatar extraction logic
  - _Requirements: 5.1, 5.2_

- [x] 4. Update existing OAuth callback and user sync to capture Google avatars





  - Modify existing syncUserProfile function in src/lib/api.ts to handle Google avatar URLs
  - Update Google OAuth callback in AuthContext to extract profile picture from OAuth data
  - Enhance existing /api/users/sync-profile endpoint to store Google avatar data
  - Add error handling for missing or invalid Google avatar URLs
  - _Requirements: 5.1, 5.2, 5.5_

- [x] 5. Enhance existing avatar system with caching and error handling





  - Extend existing avatar-utils.ts with retry logic for failed avatar loads
  - Add comprehensive error logging using existing debug-logger.ts utility
  - Implement cache-busting for updated avatars using existing patterns
  - Write unit tests for enhanced error handling and caching
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.3_

- [x] 6. Create enhanced Avatar component with fallback logic




  - Build Avatar component with loading states and error handling
  - Implement automatic fallback to initials on image load failure
  - Add retry mechanism for failed image loads
  - Create different size variants for the Avatar component
  - _Requirements: 1.5, 2.1, 2.2, 2.5_

- [x] 7. Implement Google avatar sync service






  - Create service to refresh Google avatar URLs for existing users
  - Implement manual avatar sync functionality for users
  - Add cache invalidation when avatars are updated
  - Write unit tests for avatar sync operations
  - _Requirements: 5.4, 4.5_

- [-] 8. Fix and enhance existing avatar upload functionality






  - Debug why current avatar uploads to Supabase storage 'avatars' folder aren't displaying properly
  - Ensure uploaded avatars from Supabase storage (like your example URL) display correctly
  - Verify Supabase storage permissions and URL generation for avatars folder
  - Update existing avatar upload API endpoints to properly store URLs in existing avatar_url field
  - _Requirements: 4.1, 5.6_

- [ ] 9. Create Avatar context provider leveraging existing patterns
  - Create AvatarProvider context following existing context patterns (AuthContext, CompanyContext)
  - Integrate with existing useSession hook and real-time subscriptions
  - Add real-time avatar update propagation using existing Supabase realtime setup
  - Write integration tests following existing test patterns
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 10. Identify and fix existing avatar displays throughout the application
  - Search for existing avatar implementations in components/dashboard/, components/floor-plan/, components/messaging/, components/profile/
  - Update existing avatar displays to use enhanced getAvatarUrl function
  - Ensure consistent avatar loading states and error handling across all components
  - Fix any broken avatar URLs or display issues in existing components
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 11. Enhance existing debugging with avatar-specific monitoring
  - Extend existing debug-logger.ts utility with avatar-specific logging
  - Add development mode debug information to existing avatar-utils.ts
  - Create avatar URL validation utilities using existing validation patterns
  - Add performance monitoring for avatar load times using existing monitoring set
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 12. Write comprehensive tests for avatar system using Vitest
  - Create unit tests for all avatar utility functions using Vitest and Testing Library
  - Write integration tests for complete avatar workflow
  - Add tests for Google OAuth avatar integration
  - Create tests for error scenarios and fallback behavior
  - _Requirements: All requirements validation_

- [ ] 13. Add avatar refresh functionality to user interface
  - Create UI button/option to refresh Google avatar
  - Implement avatar removal functionality with proper fallback
  - Add loading indicators during avatar operations
  - Create user feedback for successful/failed avatar operations
  - _Requirements: 4.2, 5.4_