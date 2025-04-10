# T1_2_StateManagement Instructions

## Objective
Fix infinite console updates and 404 errors occurring during space updates, while optimizing state management and debug logging.

## Context
[Implementation Plan: IP1_PresenceBugsResolution]
The system is experiencing 404 errors on space updates and infinite console updates. The key error is:
```
PUT /api/spaces/update 404 in 267ms
Error updating space: {
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  hint: null,
  message: 'JSON object requested, multiple (or no) rows returned'
}
```

This indicates the space update endpoint is not properly handling the response when no rows are affected.

## Dependencies
- src/app/api/spaces/update/route.ts (API route handler)
- src/hooks/useUserPresence.ts (User presence management)
- src/components/floor-plan/dom-floor-plan.tsx (Floor plan component)
- src/repositories/implementations/supabase/SupabaseSpaceRepository.ts (Space data access)

## Steps
1. ✅ Fix Space Update API:
   - Reviewed space update API route (`/api/spaces/update/route.ts`)
   - Reviewed repository (`SupabaseSpaceRepository.ts`) - already handled PGRST116
   - Modified `useSpaceMutations.ts` to handle 404 status specifically
   - Identified the actual source of the 404/500 loop in `useLastSpace.ts` calling `/api/users/location` which called `SupabaseUserRepository.updateLocation`.
   - Added detailed error handling to `SupabaseUserRepository.updateLocation` to pinpoint RPC and subsequent errors.
   - Removed redundant logic selecting/updating `spaces.userIds` from `SupabaseUserRepository.updateLocation`.

2. ✅ Optimize Debug Logging:
   - Wrapped verbose logs in `dom-floor-plan.tsx` with `process.env.NODE_ENV === 'development'` checks

3. ✅ Fix State Management:
   - Reviewed state updates in `useUserPresence.ts`
   - Added error handling to `debouncedUpdateLocation` fetch call in `useUserPresence.ts`
   - Refactored `useLastSpace.ts` to call `/api/users/location` instead of `/api/spaces/update`.

4. ✅ Optimize Supabase Subscriptions:
   - Reviewed subscription cleanup in `useUserPresence.ts` (already present)
   - Added status and error logging callback to `.subscribe()` in `useUserPresence.ts`

## Expected Output
- Space updates should work without 404 errors
- Console should not show infinite updates
- Proper error handling for all space operations
- Clean and meaningful debug logs
- Stable Supabase realtime subscriptions

## Success Criteria
- No 404 errors on space updates
- No infinite console updates
- Clear error messages for failed operations
- Stable realtime presence updates
