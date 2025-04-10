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
1. Fix Space Update API:
   - Review space update API route
   - Add proper error handling for PGRST116 error
   - Return appropriate HTTP status and error messages
   - Log detailed error information for debugging

2. Optimize Debug Logging:
   - Move debug logs behind DEBUG flag
   - Create structured logging function
   - Reduce log frequency
   - Add meaningful context to logs

3. Fix State Management:
   - Review space state updates in useUserPresence
   - Add proper error handling for failed updates
   - Implement retry mechanism for failed updates
   - Add state validation before updates

4. Optimize Supabase Subscriptions:
   - Review subscription cleanup
   - Implement proper subscription management
   - Add subscription error handling
   - Add reconnection logic

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
