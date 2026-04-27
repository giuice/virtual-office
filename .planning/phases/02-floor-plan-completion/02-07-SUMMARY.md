---
phase: 02-floor-plan-completion
plan: 07
subsystem: floor-plan, api
tags: [presence, grace-rejoin, reload, useLastSpace, space-presence-log]

# Dependency graph
requires:
  - phase: 02-floor-plan-completion-05
    provides: Peer leave handler POST removed from useUserPresence
provides:
  - Visual-only FloorPlan placement useEffect that delegates API calls to useLastSpace
  - Race-resistant grace-rejoin with last_active and open presence log fallbacks
affects: [floor-plan, presence, restricted-spaces]

# Tech tracking
tech-stack:
  added: []
  patterns: [visual-only placement hydration, multi-signal grace rejoin]

key-files:
  created: []
  modified:
    - src/components/floor-plan/floor-plan.tsx
    - src/app/api/users/location/route.ts
    - __tests__/api/users-location-route.test.ts

key-decisions:
  - "FloorPlan placement useEffect sets only visual state (selectedSpace, highlightedSpaceId) and never calls handleEnterSpace or saveLastSpace -- useLastSpace hook is the sole API caller"
  - "Grace rejoin uses three signals: exited_at from space_presence_log (primary), last_active from users table (secondary for beacon race), and open presence log entry (tertiary for reload-before-beacon)"

patterns-established:
  - "Visual-only hydration: FloorPlan useEffect for placement sets UI state only; API placement is delegated to useLastSpace hook"
  - "Multi-signal grace rejoin: enforceSpaceAuthorization checks exited_at, then last_active, then open presence log before denying restricted-space access"

requirements-completed: [FLOR-04]

# Metrics
duration: 3m
completed: 2026-03-19
---

# Phase 02 Plan 07: Reload Presence Fix Summary

**Unified FloorPlan placement path (visual-only) and race-resistant grace rejoin using last_active and open presence log fallbacks**

## Performance

- **Duration:** 3m 11s
- **Started:** 2026-03-19T20:21:59Z
- **Completed:** 2026-03-19T20:25:10Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Removed FloorPlan's duplicate placement path that called handleEnterSpace (UI-only) instead of the location API, which caused user disappearance on reload
- Added last_active timestamp as secondary grace-rejoin signal in enforceSpaceAuthorization, handling the beacon POST race condition where exited_at hasn't been written yet
- Added open presence log check as tertiary fallback for the scenario where user reloads before the beacon fires at all
- Added 2 new test cases covering the last_active and open presence log grace paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove FloorPlan duplicate placement and add last_active grace-rejoin fallback** - `072d4f0` (fix)

**Plan metadata:** (pending - docs commit)

## Files Created/Modified
- `src/components/floor-plan/floor-plan.tsx` - Placement useEffect now sets only visual state (selectedSpace, highlightedSpaceId), no longer calls handleEnterSpace
- `src/app/api/users/location/route.ts` - enforceSpaceAuthorization now checks last_active and open presence log as grace-rejoin fallbacks
- `__tests__/api/users-location-route.test.ts` - Added tests for last_active grace path and open presence log grace path; updated mock to handle `.is` chain

## Decisions Made
- FloorPlan placement useEffect sets only visual state and never calls handleEnterSpace or saveLastSpace -- useLastSpace hook is the sole API caller for placement
- Grace rejoin uses three signals in priority order: exited_at from space_presence_log (primary), last_active from users table (secondary), open presence log entry (tertiary)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated test mocks for new open presence log query**
- **Found during:** Task 1
- **Issue:** The existing test mock for space_presence_log select chain lacked `.is` support needed by the new open presence log query
- **Fix:** Added `.is` method to the select chain mock and a separate `mockOpenPresenceLogMaybeSingle` to differentiate the two query paths
- **Files modified:** `__tests__/api/users-location-route.test.ts`
- **Verification:** All 11 tests pass including 2 new ones
- **Committed in:** 072d4f0 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Test infrastructure update was necessary for correctness of the new grace-rejoin paths. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Reload presence preservation is now fully covered: useLastSpace handles the API call, FloorPlan handles only visual state
- Grace rejoin to restricted spaces is resilient to beacon POST timing
- All existing tests remain green (11/11)

---
*Phase: 02-floor-plan-completion*
*Completed: 2026-03-19*
