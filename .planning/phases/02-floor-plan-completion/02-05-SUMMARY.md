---
phase: 02-floor-plan-completion
plan: 05
subsystem: presence
tags: [supabase-realtime, presence, avatar-animation, offline-detection, reconnection]

# Dependency graph
requires:
  - phase: 02-floor-plan-completion-02
    provides: "Offline fade animation in AvatarGroup with exitingUserIds and timeout refs"
  - phase: 02-floor-plan-completion-04
    provides: "Restricted-space authorization and server-side location cleanup patterns"
provides:
  - "Presence-ready gating via isPresenceReady flag prevents false-offline during channel init"
  - "Away/busy users preserved as-is in presenceAwareUsers derivation"
  - "Peer leave handler no longer POSTs cleanup for other users (prevents permanent eviction)"
  - "AvatarGroup reconnection-aware fade cancellation"
affects: [02-floor-plan-completion-06, 02-floor-plan-completion-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presence-ready gating: isPresenceReady flag gates offline-override until first Realtime sync"
    - "Self-only cleanup: Only the user's own beforeunload sends location cleanup; peers never POST for others"
    - "Fade cancellation: AvatarGroup cancels exit timeouts when user status returns from offline"

key-files:
  created: []
  modified:
    - src/hooks/useUserPresence.ts
    - src/components/floor-plan/modern/AvatarGroup.tsx

key-decisions:
  - "Only users with DB status 'online' who are absent from Realtime after first sync are derived as offline; away/busy users are never force-downgraded"
  - "Removed peer leave handler POST entirely rather than gating it, since the user's own beforeunload and server cleanup are the correct cleanup paths"
  - "Placed reconnection cancellation block before offline-transition block in AvatarGroup so same-render-cycle transitions are handled correctly"

patterns-established:
  - "isPresenceReady pattern: useState boolean set in first Realtime sync handler, gates derivation logic that depends on snapshot completeness"
  - "Self-only location cleanup: No client ever writes /api/users/location for a userId that is not the authenticated user"

requirements-completed: [FLOR-02, FLOR-04]

# Metrics
duration: 4m
completed: 2026-03-19
---

# Phase 02 Plan 05: Presence Status Derivation Fix and Reconnection Fade Guard

**Fixed false-offline transitions by gating presenceAwareUsers with isPresenceReady flag, preserving away/busy statuses, removing peer eviction POST, and adding reconnection-aware fade cancellation in AvatarGroup**

## Performance

- **Duration:** 4m
- **Started:** 2026-03-19T20:13:05Z
- **Completed:** 2026-03-19T20:17:06Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- presenceAwareUsers only derives 'offline' for users whose DB status was 'online' AND who are absent from Realtime after the first sync event fires
- Away/busy users are never force-marked offline -- their intentional DB statuses are preserved
- Peer leave handler no longer POSTs /api/users/location cleanup for other users, eliminating permanent space eviction on tab switches, network hiccups, and page reloads
- AvatarGroup cancels fade timeouts when a user's status returns from offline (reconnection), and skips already-fading users to prevent timer resets

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix presenceAwareUsers status derivation and remove peer leave cleanup POST** - `c51a1e5` (fix)
2. **Task 2: Guard AvatarGroup fade against reconnection and cancel stale timeouts** - `14626dc` (fix)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `src/hooks/useUserPresence.ts` - Added isPresenceReady flag, fixed presenceAwareUsers derivation to respect away/busy, removed peer leave POST, exported isPresenceReady
- `src/components/floor-plan/modern/AvatarGroup.tsx` - Added reconnection-aware fade cancellation, added already-fading guard to prevent timer resets

## Decisions Made
- Only users with DB status 'online' who are absent from Realtime after the first sync are derived as offline; away/busy users are never force-downgraded
- Removed the peer leave handler POST entirely (not just gated it) since self-cleanup via beforeunload and server-side cleanup are the correct paths
- Placed reconnection cancellation block before offline-transition block in AvatarGroup for correct same-render-cycle ordering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale .next build cache causing build failure**
- **Found during:** Task 2 (build verification)
- **Issue:** .next/lock and stale _clientMiddlewareManifest.json prevented build
- **Fix:** Removed .next directory and rebuilt cleanly
- **Files modified:** None (build artifact cleanup only)
- **Verification:** Build completed successfully after cleanup
- **Committed in:** N/A (no source changes)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Build cache issue unrelated to code changes. No scope creep.

## Issues Encountered
None beyond the stale build cache documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT Test 4 (offline fade) root causes in useUserPresence.ts addressed: away/busy users preserved, no false-offline during init
- UAT Test 6 (reload eviction) root cause addressed: peer clients no longer POST location cleanup for other users
- AvatarGroup fade is cancellable on reconnection, supporting graceful presence transitions
- All 17 existing presence/reconnection tests pass (presence-animation.test.tsx + reconnection-grace.test.tsx)

## Self-Check: PASSED

All files verified present, all commit hashes confirmed in git log.

---
*Phase: 02-floor-plan-completion*
*Completed: 2026-03-19*
