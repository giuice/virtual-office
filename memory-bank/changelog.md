## Changelog

[Previous entries...]

### April 5, 2025
- Created API route (`PUT /api/users/location`) for updating user locations
- Added input validation using Zod schema
- Implemented proper error handling and success responses
- Integrated with SupabaseUserRepository for location updates
- Added user existence verification before updates
- Implemented RLS policy for user presence data
- Enabled realtime for users table in Supabase
- Added test suite for realtime presence updates
- Added mocks for Supabase realtime functionality in test setup

### April 6, 2025
- Completed T13_Hook_UserPresence
- Implemented repository-backed, real-time presence hook
- Grouped users by space for efficient rendering
- Ready for PresenceContext integration (T14)
