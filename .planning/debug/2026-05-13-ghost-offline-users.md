---
created: 2026-05-13T18:12:21.830Z
issue: offline/ghost users appear in spaces after user leaves another space; offline users disappear again when returning
type: logic_error
phase: 2.1 Presence Reload Fixes
status: resolved
---

## Root Cause

The presence cache trusted stale database rows while Realtime presence was not ready. The production database contained old `users.status = 'online'` rows with non-null `current_space_id` and `last_active` values months old, so any transient not-ready presence state could render those users as occupants until Realtime derivation later marked them offline.

## Fix

Added a pure presence derivation helper that treats stale DB-online occupants as `offline` before the first Realtime sync. `useUserPresence` now carries `lastActive` into `UserPresenceData` and uses the helper before building `usersInSpaces`, preserving the existing rule that actual Realtime presence wins when the user is online.

## Verification

- `npx vitest run __tests__/presence-utils.test.ts` — 4 tests passed
- `npx vitest run __tests__/api/users-location-route.test.ts` — 8 tests passed
- `npm run type-check` — passed

## Production Evidence

Aggregate Supabase check showed stale rows matching the bug shape:

- `online` + `current_space_id is not null`: 4 users, oldest `last_active` 2026-01-23, newest 2026-03-18
- `offline` + `current_space_id is not null`: 2 users

The fix prevents the stale `online` rows from rendering as occupants when they are absent from Realtime presence and outside the active window.
