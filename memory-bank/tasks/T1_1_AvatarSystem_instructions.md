# T1_1_AvatarSystem Instructions

## Objective
Fix the missing avatar display in spaces by ensuring proper data flow through the presence system and enhancing avatar component reliability.

## Context
[Implementation Plan: IP1_PresenceBugsResolution]
Avatars are not displaying in the floor plan spaces, even when users are present. This appears to be a data flow issue rather than a UI component issue, as the entire presence data chain needs review.

## Dependencies
- src/hooks/useUserPresence.ts (User presence data management)
- src/contexts/PresenceContext.tsx (Presence state management)
- src/components/floor-plan/dom-floor-plan.tsx (Floor plan UI)
- src/components/ui/avatar.tsx (Avatar component)
- src/repositories/implementations/supabase/SupabaseUserRepository.ts (User data access)

## Steps
1. User Repository Update:
   - Review findAll method in SupabaseUserRepository
   - Ensure avatarUrl is included in user queries
   - Add proper error handling for missing avatar data
   - Add data validation for user objects

2. Presence Hook Enhancement:
   - Update UserPresenceData type to properly include avatar fields
   - Modify user data mapping in useUserPresence hook
   - Add data consistency checks
   - Implement proper error handling for missing data

3. Floor Plan Component Update:
   - Review avatar rendering logic in dom-floor-plan.tsx
   - Add loading states for avatars
   - Implement proper fallback for missing avatars
   - Add error boundaries for avatar components

4. Avatar Component Optimization:
   - Review avatar component implementation
   - Add proper loading states
   - Enhance error handling
   - Implement proper image loading checks

## Expected Output
- Avatars should display correctly for all users in spaces
- Proper fallbacks for missing avatars
- Clear loading states during avatar load
- Graceful error handling for avatar failures

## Success Criteria
- All users show either their avatar or a proper fallback
- No missing or broken avatar images
- Smooth loading experience
- Clear error states when avatar load fails
