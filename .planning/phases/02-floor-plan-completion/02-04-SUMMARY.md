---
phase: 02-floor-plan-completion
plan: 04
subsystem: api
tags: [nextjs, supabase, route-handler, authorization, vitest, floor-plan]
requires:
  - phase: 02-01
    provides: "Restricted-space knock request and response workflow backed by knock_requests"
  - phase: 02-02
    provides: "Presence-log synchronization and offline cleanup behavior for location updates"
  - phase: 02-03
    provides: "Grace-period reconnection rules and shared placement resolver"
provides:
  - "Server-authenticated users/location route that validates restricted-space entry"
  - "Approved-knock consumption with authorized_by presence-log recording"
  - "Executable route and grace-window regression tests for FLOR-01 and FLOR-04"
affects: [floor-plan, presence, knock-to-enter, reconnection, testing]
tech-stack:
  added: []
  patterns:
    - "Resolve the caller's app user through findBySupabaseUid(auth.getUser().id) before mutating location state"
    - "Authorize private-space entry on the server with approved-knock or recent-occupancy checks"
key-files:
  created:
    - __tests__/api/users-location-route.test.ts
  modified:
    - src/app/api/users/location/route.ts
    - __tests__/reconnection-grace.test.tsx
key-decisions:
  - "Kept the existing users/location payload shape for compatibility, but rejected mismatched userId values after resolving the authenticated app user from Supabase Auth."
  - "Reused knock_requests and space_presence_log as the private-space authorization sources instead of introducing a second access-control table or client-only bypass."
patterns-established:
  - "Restricted-space joins are authorized at the server boundary, then recorded in space_presence_log with authorized_by when a knock approval is consumed."
  - "Grace-rejoin coverage now exercises getReconnectionContext directly with localStorage-backed timestamps instead of todo-only scaffolds."
requirements-completed: [FLOR-01, FLOR-04]
duration: 10 min
completed: 2026-03-19
---

# Phase 02 Plan 04: Restricted Space Server Authorization Summary

**Server-enforced private-space authorization for `/api/users/location` with approved-knock consumption and executable reconnection regressions**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-19T12:13:15Z
- **Completed:** 2026-03-19T12:23:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Hardened `/api/users/location` so the route authenticates with `auth.getUser()`, resolves the app user via `findBySupabaseUid`, and rejects mismatched or unauthorized private-space updates server-side.
- Preserved the 5-minute private-space grace rejoin path while recording `authorized_by` for approved knock-based entry and deleting consumed approval rows to prevent replay.
- Replaced the Phase 2 reconnection scaffold with real assertions and added direct route-level coverage for unauthenticated, mismatched-user, denied, approved, and grace-rejoin flows.

## Task Commits

Each task was committed atomically:

1. **Task 1: Authenticate `/api/users/location` and enforce restricted-space authorization on the server** - `44ea950` (fix)
2. **Task 2: Add executable regression coverage for the route boundary and the 5-minute grace interaction** - `6caa8ba` (test)

**Follow-up verification fix:** `c192e4a` (fix) - strict typing helper for the new route test so `npm run type-check` passes.

## Files Created/Modified
- `src/app/api/users/location/route.ts` - authenticates location updates, enforces private-space access on the server, records `authorized_by`, and consumes approved knock rows.
- `__tests__/api/users-location-route.test.ts` - covers the route boundary for auth failures, user mismatch, denied restricted joins, approved joins, grace rejoin, and knock consumption.
- `__tests__/reconnection-grace.test.tsx` - exercises `getReconnectionContext`, `GRACE_PERIOD_MS`, and localStorage-backed grace-window behavior directly.

## Decisions Made

- Kept the existing request contract for `useUserPresence` and `useLastSpace`, then treated the authenticated Supabase user as the source of truth after validation to avoid a breaking client change.
- Reused the existing `knock_requests` approval data and `space_presence_log` occupancy history to authorize private-space entry rather than duplicating access-control state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tightened the new route regression test for strict TypeScript**
- **Found during:** Final verification after Task 2
- **Issue:** The new route test treated `PUT(...)` as possibly `undefined`, which blocked `npm run type-check`.
- **Fix:** Added a typed `putLocation` helper that returns `Response` and updated the test calls to use it.
- **Files modified:** `__tests__/api/users-location-route.test.ts`
- **Verification:** `npm run type-check`, `npx vitest run __tests__/api/users-location-route.test.ts`
- **Committed in:** `c192e4a`

---

**Total deviations:** 1 auto-fixed (1 blocking fix)
**Impact on plan:** The deviation stayed inside the new regression test and was required to satisfy the plan's compile verification. No scope creep.

## Issues Encountered

- The plan-specified lint command is not executable in this repository: `npm run lint`, `npm run lint -- src/app/api/users/location/route.ts`, and `npm run lint -- --file src/app/api/users/location/route.ts` all fail because the repo's `next lint` script is broken. Details are recorded in `.planning/phases/02-floor-plan-completion/deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The floor-plan access-control gap identified in earlier verification is now covered at the server boundary and by executable route tests.
- Phase 02 is ready for re-verification and human checks around offline fade timing, first-login placement, and grace rejoin behavior.
- Lint automation needs repo-level repair before a later phase can rely on lint as a verification gate.
- Status: Pending user confirmation.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-floor-plan-completion/02-04-SUMMARY.md`
- FOUND: `44ea950`
- FOUND: `6caa8ba`
- FOUND: `c192e4a`

---
*Phase: 02-floor-plan-completion*
*Completed: 2026-03-19*
