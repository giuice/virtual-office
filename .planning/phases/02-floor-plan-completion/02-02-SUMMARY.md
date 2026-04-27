---
phase: 02-floor-plan-completion
plan: 02
subsystem: ui
tags: [react, nextjs, supabase, presence, floor-plan]
requires:
  - phase: 02-floor-plan-completion
    provides: Phase 2 test scaffolds and floor-plan baseline from 02-00
provides:
  - Offline avatar fade-out animation for floor-plan occupants
  - Presence leave and unload cleanup routed through the location API
  - Server-side space presence log entry and exit synchronization
affects: [presence, floor-plan, reconnection]
tech-stack:
  added: []
  patterns:
    - AvatarGroup-owned offline fade wrappers around ModernUserAvatar
    - Shared users/location handler for PUT and sendBeacon-style POST cleanup
key-files:
  created: []
  modified:
    - src/styles/themes/tokens.css
    - src/components/floor-plan/modern/AvatarGroup.tsx
    - src/hooks/useUserPresence.ts
    - src/app/api/users/location/route.ts
key-decisions:
  - Keep a departed user's last space assignment in the client cache until the offline fade completes, then let server cleanup clear it.
  - Reuse the existing users location API for unload beacons and presence leave cleanup instead of adding a second cleanup endpoint.
  - Close the prior open space_presence_log row before inserting a new one when users move directly between spaces.
patterns-established:
  - "Floor-plan offline removal uses status-driven fade in AvatarGroup, not a parallel avatar component path."
  - "Presence cleanup flows through useUserPresence -> /api/users/location -> space_presence_log synchronization."
requirements-completed: [FLOR-02]
duration: 9 min
completed: 2026-03-19
---

# Phase 2 Plan 02: Offline Presence Cleanup Summary

**Floor-plan avatar fade-out with presence leave detection, unload cleanup beacons, and synchronized `space_presence_log` exit tracking**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-19T10:52:00Z
- **Completed:** 2026-03-19T11:01:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added a 3-second theme token fade animation for offline avatars, including reduced-motion handling.
- Extended `AvatarGroup` to preserve offline users long enough to fade out without disturbing the existing enter/leave animation path.
- Added unload beacon cleanup, presence `leave` handling, and server-side space presence log synchronization for offline and move events.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fade-out CSS animation and extend AvatarGroup for offline exit** - `d17b68d` (feat)
2. **Task 2: Add server-side cleanup and enhance presence detection for crash scenarios** - `8e27aad` (feat)

## Files Created/Modified
- `src/styles/themes/tokens.css` - Adds `vo-avatar-offline-fade` token, keyframes, and reduced-motion override.
- `src/components/floor-plan/modern/AvatarGroup.tsx` - Tracks offline-only fade state separately from the legacy leave animation path.
- `src/hooks/useUserPresence.ts` - Stores disconnect timestamps, sends unload cleanup beacons, and reacts to Supabase presence leave events.
- `src/app/api/users/location/route.ts` - Accepts beacon POSTs, updates offline status, and synchronizes `space_presence_log` on leave/join transitions.

## Decisions Made
- Kept offline users in their last space bucket on the client until fade completion so the UI can animate them out instead of dropping them immediately.
- Used the existing location API for both normal updates and cleanup beacons to avoid duplicating presence cleanup behavior.
- Treated direct room-to-room moves as exit+entry log transitions so `space_presence_log` stays internally consistent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Closed the prior open `space_presence_log` row on direct space moves**
- **Found during:** Task 2 (Add server-side cleanup and enhance presence detection for crash scenarios)
- **Issue:** The plan only closed logs when `spaceId` became `null`, which would leave stale open rows when a user moved directly from one space into another.
- **Fix:** Added `syncSpacePresenceLog()` to close the previous row before inserting the next row whenever `current_space_id` changes.
- **Files modified:** `src/app/api/users/location/route.ts`
- **Verification:** `npm run build`, `rg -n "space_presence_log" src/app/api/users/location/route.ts`
- **Committed in:** `8e27aad`

**2. [Rule 3 - Blocking] Updated the planned Vitest command to match the installed CLI**
- **Found during:** Task 1 verification
- **Issue:** The plan specified `npx vitest run __tests__/presence-animation.test.tsx -x`, but Vitest 4.1.0 rejects `-x` as an unknown option.
- **Fix:** Ran `npx vitest run __tests__/presence-animation.test.tsx` for both task verification passes.
- **Files modified:** None
- **Verification:** `npx vitest run __tests__/presence-animation.test.tsx`
- **Committed in:** Not code-related; verification workflow adjustment only

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both changes were required to keep the offline cleanup path correct and verifiable. No additional feature scope was introduced.

## Issues Encountered
- The planning files already had unrelated in-progress edits in the worktree. Execution avoided them by staging only the task-owned source files plus the required planning metadata updates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- FLOR-02 is wired through the current floor-plan render path and the existing location API.
- Phase 02 still has remaining plan work for default spaces and reconnection behavior in `02-03`.

---
*Phase: 02-floor-plan-completion*
*Completed: 2026-03-19*

## Self-Check: PASSED

- FOUND: `.planning/phases/02-floor-plan-completion/02-02-SUMMARY.md`
- FOUND: `d17b68d`
- FOUND: `8e27aad`
