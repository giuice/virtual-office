# T1_3_SpaceInteraction Instructions

## Objective
Fix room click/double-click functionality by refactoring the space interaction system to work with current_space_id instead of the removed userIds array.

## Context
[Implementation Plan: IP1_PresenceBugsResolution]
Room interactions (clicking/double-clicking) are not working properly after the removal of space.userIds. The system needs to be updated to use current_space_id for tracking user presence, while ensuring proper space interaction handling.

## Dependencies
- src/components/floor-plan/dom-floor-plan.tsx (Floor plan component)
- src/hooks/useUserPresence.ts (User presence management)
- src/contexts/PresenceContext.tsx (Presence state management)
- src/repositories/implementations/supabase/SupabaseSpaceRepository.ts (Space data access)
- src/app/api/spaces/update/route.ts (Space update API)

## Steps
1. ✅ Update Space Data Structure:
   - Review space-related types and interfaces
   - Remove dependencies on userIds array
   - Update space state management to use current_space_id
   - Update space validation logic

2. ✅ Fix Click Handlers:
   - Update single-click handler in dom-floor-plan.tsx
   - Update double-click handler
   - Add proper error handling
   - Add loading states during interactions

3. ✅ Update Space Transitions:
   - Review space transition logic
   - Update user location updates to use current_space_id
   - Add proper state management for transitions
   - Implement proper error handling

4. ✅ Add Space Validation:
   - Add space availability checks
   - Implement proper capacity management
   - Add transition validation
   - Add proper error messaging

## Expected Output
- Clicking a space should properly update user location
- Double-clicking should open the chat panel
- Space transitions should be smooth and error-free
- Clear feedback during space interactions

## Success Criteria
- Space clicks register properly
- Chat panels open on double-click
- User location updates work correctly
- Clear error messages for failed interactions
- Smooth transition animations
