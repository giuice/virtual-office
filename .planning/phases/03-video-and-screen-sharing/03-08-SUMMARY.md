---
phase: 03-video-and-screen-sharing
plan: 08
subsystem: database
tags: [supabase, postgres, rls, realtime, presence, screen-sharing]

requires:
  - phase: 02-presence-remediation
    provides: fenced Presence sessions, application-user identity mapping, and private Realtime policy patterns
provides:
  - Authoritative per-space screen-share lease contract with stored Presence revision fences
  - Private Realtime media policy catalog and mapped-Auth-UID RLS regression proof
  - Local-only migration replay/readback evidence
tech-stack:
  added: []
  patterns:
    - Deterministic user/company/space/session/lease lock order with bounded structural retry
    - Scalar privilege-aligned database reads and exact-owner release idempotency
key-files:
  created:
    - __tests__/presence-db/screen-share-lease.test.ts
    - .planning/phases/03-video-and-screen-sharing/03-TRACKER.md
  modified:
    - supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql
    - .planning/phases/03-video-and-screen-sharing/03-08-SUMMARY.md
key-decisions:
  - Keep lease ownership fenced to claim-time placement and access revisions.
  - Treat an owner that cannot be revalidated under locks as released only in screen_share_leases.
  - Allow release idempotency only for the exact stored owner/session/share tuple.
requirements-completed: [VID-01, VID-04]
metrics:
  remediation_commit: 4c640f9
  focused_db_tests: 4
  realtime_catalog_tests: 3
status: complete
---

# Phase 03 Plan 08: Screen-share authority contract Summary

**Local Postgres presenter lease authority now rejects stale ownership and proves private media RLS against mapped Auth identities.**

## Remediation Accomplishments

- Replaced full-row reads with only granted columns and independent lookup flags, preventing `FOUND` from being overwritten by later lookups.
- Added claim-time location/user-access/space-access fences and revalidates the stored owner, auth session, Presence session, placement, and access under deterministic locks before active/busy/renew decisions.
- Invalid owner state atomically releases only its screen-share lease; it never changes movement, access, or Presence authority.
- Made foreign release return `LEASE_NOT_OWNER`; only the exact stored owner/session/share tuple receives repeated-release success.
- Added real local Postgres coverage for initial claim, empty active read, repeated owner release, foreign release denial, stale session/movement/revision invalidation, and mapped Auth UID media-topic RLS allow/deny.

## Task Commits

1. `e23a03e` — initial screen-share authority contract.
2. `4c640f9` — remediation migration and real-Postgres regressions.

## Files Created/Modified

- `supabase/migrations/20260723104902_screen_share_lease_and_media_realtime.sql` — narrowed privilege-aligned reads, lock/revalidation helper, revision fences, exact release behavior, and catalog assertions.
- `__tests__/presence-db/screen-share-lease.test.ts` — disposable real-Postgres lease and RLS regression coverage.
- `__tests__/presence-db/phase6-realtime.test.ts` — retained exact eight-policy catalog assertion from the original plan implementation.
- `.planning/phases/03-video-and-screen-sharing/03-TRACKER.md` — remediation state, evidence, and unresolved suite note.

## Database and Deployment State

- **Written locally:** remediation migration and regression test are committed in this worktree.
- **Applied/read back locally:** authorized `npx supabase db reset --local --no-seed` replayed migration `20260723104902`; `db push --local` reported current and `migration list --local` listed it once.
- **Applied online:** no online database was changed.
- **Application deployed:** no deployment occurred.

## Verification

Passed on disposable local Supabase/Postgres:

- `npx supabase db reset --local --no-seed`
- `npx supabase db push --local && npx supabase migration list --local && npm run test:presence:db -- __tests__/presence-db/phase6-realtime.test.ts` — 3 tests passed.
- `npm run test:presence:db -- __tests__/presence-db/screen-share-lease.test.ts` — 4 tests passed, zero skips.
- `npm run presence:gate`
- `npx eslint __tests__/presence-db/screen-share-lease.test.ts`
- `npm run type-check`
- `git diff --check`

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Security/correctness] Hardened the already-created local migration after mandatory Presence and Supabase/RLS review.**
   - Replaced wildcard record expansion, stale `FOUND` checks, and permissive foreign release behavior.
   - Added revision fences and atomic invalid-owner release under the established lock order.
   - Commit: `4c640f9`.

## Known Stubs

None.

## Deferred Issues

- `npm run test:presence:db` has one reproducible failure outside this migration and its new test: `__tests__/presence-db/presence-concurrency-contract.test.ts` expects the first current-hour observation to remain unhealthy but reads healthy. The full run completed with 118 passing tests and 1 failure; its focused rerun also failed. This remediation did not modify that contract, so it requires a separately scoped investigation.

## Self-Check: PASSED

- Found remediation migration and focused regression test.
- Found remediation commit `4c640f9`.
- Confirmed no tracked files were deleted by the remediation commit.
