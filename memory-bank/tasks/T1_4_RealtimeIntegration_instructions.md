# T1_4_RealtimeIntegration Instructions

## Objective
Clean up Socket.io remnants and ensure proper Supabase realtime integration for presence and messaging features.

## Context
[Implementation Plan: IP1_PresenceBugsResolution]
The system is showing Socket.io connection errors to localhost:3001 despite migrating to Supabase realtime. All Socket.io code needs to be removed and Supabase realtime integration needs to be verified.

Error example:
```
GET http://localhost:3001/socket.io/?EIO=4&transport=polling&t=mhbc4m1z net::ERR_CONNECTION_REFUSED
```
**ATENTION BE VERY CAREFUL, IN THE PAST A NEVER ENDING LOOP WAS UPDATING SUPABASE FOREVER**

## Dependencies
- socket-server.js (Legacy Socket.io server)
- src/hooks/useUserPresence.ts (Realtime presence)
- src/contexts/PresenceContext.tsx (Presence management)
- src/lib/supabase/client.ts (Supabase client)
- src/providers/SupabaseProvider.tsx (Supabase provider)
- src/components/messaging/RoomMessaging.tsx 
- contexts/messaging/MessagingContext.tsx

## Steps
1. ✅ Remove Socket.io Code:
   - Delete socket-server.js
   - Remove Socket.io client dependencies
   - Remove Socket.io initialization code
   - Clean up Socket.io error handlers

2. ✅ Verify Supabase Realtime Configuration:
   - Review Supabase client setup
   - Verify realtime enablement in project
   - Check channel configuration
   - Validate subscription settings

3. ✅ Update Presence System:
   - Review presence subscription setup
   - Ensure proper channel cleanup
   - Add reconnection handling
   - Add proper error states

4. ✅ Add Monitoring:
   - Add realtime connection monitoring
   - Implement connection status indicators
   - Add reconnection notifications
   - Implement error reporting

## Expected Output
- No Socket.io connection attempts
- Stable Supabase realtime connection
- Proper realtime presence updates
- Clear connection status indicators

## Success Criteria
- No Socket.io errors in console
- Realtime updates working properly
- Stable presence system
- Clear error handling
- Smooth reconnection handling
