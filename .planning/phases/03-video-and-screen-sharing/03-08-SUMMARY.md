---
phase: 03-video-and-screen-sharing
plan: 08
subsystem: database
tags: [supabase, postgres, rls, realtime, presence, screen-sharing]

requires:
  - phase: 02-presence-remediation
    provides: fenced Presence sessions, application-user identity mapping, and private Realtime policy patterns
provides:
  - Authoritative per-space screen-share lease table and observed RPC contract
  - Exact private Realtime media policy catalog gate for broadcast and presence
  - Local-only migration readback evidence for RLS, grants, functions, indexes, and policies
affects: [video-and-screen-sharing, presence, realtime, database-rollout]

tech-stack:
  added: []
  patterns:
    - Security-definer presenter lease operations with fixed search paths and explicit grants
    - Exact catalog equality plus policy-expression assertions for private Realtime authorization

key-files:
  created:
    - supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql
  modified:
    - __tests__/presence-db/phase6-realtime.test.ts

key-decisions:
  - "Keep one exact global Realtime policy catalog list: the four legacy policies plus the four required media policies."
  - "Validate media policies by exact authenticated role, expected extension, and the private is_media_topic_authorized(realtime.topic()) path."

patterns-established:
  - "Private media topic policies must authorize through private.is_media_topic_authorized using the current Realtime topic."

requirements-completed: [VID-01, VID-04]
coverage:
  - id: D1
    description: "Local screen-share lease and private media Realtime authorization contract"
    requirement: VID-04
    verification:
      - kind: integration
        ref: "npx supabase db push --local && npx supabase migration list --local && npm run test:presence:db -- __tests__/presence-db/phase6-realtime.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exact legacy-plus-media Realtime policy catalog assertion"
    requirement: VID-01
    verification:
      - kind: integration
        ref: "__tests__/presence-db/phase6-realtime.test.ts#installs only the exact private-channel policies expected by the remediation"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-23
status: complete
---

# Phase 03 Plan 08: Screen-share authority contract Summary

**Local Postgres presenter lease authority with exact authenticated private media Realtime policies for broadcast and presence.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-23T12:56:00Z
- **Completed:** 2026-07-23T13:16:01Z
- **Tasks:** 1/1
- **Files modified:** 2

## Accomplishments

- Added the local-first screen-share lease migration with FORCE RLS, narrow grants, fixed search paths, four observed RPCs, and private media-topic authorization.
- Strengthened the global Realtime catalog assertion to require exactly the legacy policies and four media policies.
- Added strict media-policy checks for the authenticated role, exact broadcast/presence extension, and `private.is_media_topic_authorized((select realtime.topic()))` authorization path.
- Proved the migration and catalog gate on disposable local Supabase/Postgres only.

## Task Commits

1. **Task 1: Generate, apply locally, and read back the screen-share authority contract** - `e23a03e` (feat)

## Files Created/Modified

- `supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql` - Authoritative presenter lease, media-topic helper, private Realtime policies, and catalog assertions.
- `__tests__/presence-db/phase6-realtime.test.ts` - Exact eight-policy catalog assertion with strict Phase 8 media authorization checks.

## Decisions Made

- Preserved strict equality for the complete Realtime policy catalog rather than allowing loose containment.
- Used the local catalog readback to derive an expression check that tolerates PostgreSQL whitespace formatting while requiring the exact private helper and `realtime.topic()` path.

## Deviations from Plan

### User-authorized scope extension

- **Found during:** Task 1
- **Change:** Extended `__tests__/presence-db/phase6-realtime.test.ts` beyond the plan's listed migration file.
- **Reason:** The legacy exact-catalog gate otherwise rejected the four required media policies, masking a correct migration as a test failure.
- **Implementation:** Required the exact sorted union of four legacy and four Phase 8 policies, while retaining all Phase 6 assertions and adding strict Phase 8 role, extension, helper, and topic-path checks.
- **Verification:** The required local migration/list/test sequence passed.
- **Committed in:** `e23a03e`

### Auto-fixed Issues

**1. [Rule 1 - Formatting] Normalized the changed TypeScript test with the repository formatter**
- **Found during:** Task 1
- **Issue:** Focused Prettier validation reported code-style differences after the assertion extension.
- **Fix:** Ran Prettier on the changed test; no Phase 6 behavior or assertions were removed or weakened.
- **Files modified:** `__tests__/presence-db/phase6-realtime.test.ts`
- **Verification:** Focused Prettier check, ESLint, type-check, and database test passed.
- **Committed in:** `e23a03e`

---

**Total deviations:** 1 user-authorized scope extension and 1 auto-fixed formatting issue.
**Impact on plan:** The strengthened gate is necessary to prove the exact intended policy surface; no production behavior, online database, or deployment scope was added.

## Database and Deployment State

- **Written locally:** Migration and strengthened catalog test are committed locally.
- **Applied/read back locally:** `20260723104902` is listed exactly once in the disposable local migration history; the required local DB test passed.
- **Applied online:** No online database was changed.
- **Application deployed:** No deployment occurred.

## Verification

Passed locally:

- `npx supabase db push --local`
- `npx supabase migration list --local`
- `npm run test:presence:db -- __tests__/presence-db/phase6-realtime.test.ts` (3 tests passed)
- `npx prettier --check __tests__/presence-db/phase6-realtime.test.ts`
- `npx eslint __tests__/presence-db/phase6-realtime.test.ts`
- `npm run type-check`
- `git diff --check`

## Known Stubs

None.

## Next Phase Readiness

The local database contract and exact policy catalog gate are ready for application wiring. Online migration and deployment remain deliberately unperformed and require a separately named target authorization.

## Self-Check: PASSED

- Found migration: `supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql`
- Found strengthened catalog test: `__tests__/presence-db/phase6-realtime.test.ts`
- Found task commit: `e23a03e`
