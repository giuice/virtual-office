---
phase: 03-video-and-screen-sharing
plan: 02
subsystem: database-testing
tags: [postgres, supabase, rls, realtime, concurrency, presence, screen-share]

requires:
  - phase: 03-08
    provides: Screen-share lease table, observed RPCs, and four private media-topic policies
  - phase: 03-09
    provides: Atomic canonical presenter-name contract on claim and active read
  - phase: 02-floor-plan-completion
    provides: Authoritative Presence sessions, revisions, membership cleanup, and lock-order contracts
provides:
  - Real Postgres proof of one canonical presenter under competing same-space claims
  - Post-lock fence proof for membership, auth revocation, departure, ACL revision, release, renewal, and expiry
  - Authenticated-role RLS proof for exact private media topic Broadcast and Presence operations
  - Catalog and local migration-history readback for least-privilege lease and Realtime contracts
affects: [03-03, screen-sharing, media-signaling, presence-safety, supabase-rollout]

tech-stack:
  added: []
  patterns:
    - Deterministic advisory shared barrier for equal-order Postgres races
    - Fresh bounded retry only for strict RETRY_LOCK_SET results
    - Authenticated role plus request.jwt.claims and realtime.topic for real Realtime RLS proof

key-files:
  created:
    - __tests__/presence-db/screen-share-realtime-policy.test.ts
  modified:
    - __tests__/presence-db/screen-share-lease.test.ts

key-decisions:
  - "Preserve RETRY_LOCK_SET as a raw structural result and retry only that exact code once in a fresh transaction."
  - "Treat Realtime policy tests as database-decision evidence; channel cache lifecycle remains a client reconnect/JWT-refresh concern for 03-03."
  - "Use current live analogs for stale read_first paths instead of creating obsolete parallel modules."

patterns-established:
  - "Lease race proof records raw classifications, converges bounded retries, checks one persisted row, and compares pg_stat_database deadlocks."
  - "RLS proof uses distinct Auth and application UUIDs so auth.uid() must map through users.supabase_uid."

requirements-completed: [VID-01, VID-04]

coverage:
  - id: D1
    description: "Presenter lease is atomic, fenced, idempotent, expiring, and least-privileged under real Postgres concurrency."
    requirement: VID-04
    verification:
      - kind: integration
        ref: "npm run test:presence:db -- __tests__/presence-db/screen-share-lease.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Private media Broadcast and Presence authorization is isolated by company, space, mapped identity, session, and extension."
    requirement: VID-01
    verification:
      - kind: integration
        ref: "npm run test:presence:db -- __tests__/presence-db/screen-share-realtime-policy.test.ts"
        status: pass
      - kind: other
        ref: "npx --no-install supabase migration list --local"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-07-24
status: complete
---

# Phase 03 Plan 02: Presenter Lease and Private Media Authorization Summary

**Real Postgres concurrency and authenticated-role RLS evidence proves one fenced screen-share presenter per space and exact private media-topic isolation.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-07-24T21:25:25Z
- **Completed:** 2026-07-24T21:44:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Repeated the equal-order same-space claim race eight times behind a deterministic barrier; every run converged to one `CLAIMED` winner and one `PRESENTER_BUSY` loser after at most one fresh strict retry, with one canonical row and no deadlock increase.
- Proved post-lock invalidation for membership removal, exact auth-session revocation, presenter departure, user/space access revision, release-versus-renew, and expiry-versus-new-claim.
- Proved the four intended private media operations under the real `authenticated` role and denied cross-company, same-company wrong-space, malformed topic, wrong extension, stale session, unmapped identity, and non-occupant cases.
- Read back FORCE RLS, table/function grants, owners, fixed search paths, constraints, indexes, exact policies, and both screen-share migrations from the same disposable local target.

## Task Commits

1. **Task 1 RED: Add failing presenter lease authority proof** - `acbc09d` (test)
2. **Task 1 GREEN: Prove presenter lease authority in Postgres** - `63fd7ae` (test)
3. **Task 2: Prove private media topic authorization** - `116c081` (test)
4. **Task 1 review fix: Prove expiry revalidation after lock wait** - `1e0fef0` (test)

## Files Created/Modified

- `__tests__/presence-db/screen-share-lease.test.ts` - Real RPC race, lifecycle fence, and lease catalog evidence.
- `__tests__/presence-db/screen-share-realtime-policy.test.ts` - Real authenticated-role media-topic RLS and migration-history evidence.

## Decisions Made

- Raw `RETRY_LOCK_SET` remains visible in the race evidence and is the only result eligible for one fresh retry; the suite does not blur structural churn into an ordinary conflict.
- Realtime Authorization caching is not simulated through SQL. This plan proves policy decisions; 03-03 must refresh auth/reconnect after token or scope changes.
- No online target was linked, queried, migrated, or mutated. Existing migrations were only read back from the disposable local stack.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced stale concurrency read-first reference**
- **Found during:** Task 1
- **Issue:** `__tests__/presence-db/concurrency.test.ts` does not exist in the current repository.
- **Fix:** Used the live split analogs `concurrency/normative-races.test.ts` and `concurrency/support.ts`.
- **Files modified:** None.
- **Verification:** Existing concurrency patterns were read before editing; the new focused suite passes.
- **Committed in:** `63fd7ae`

**2. [Rule 3 - Blocking] Replaced stale media-topic read-first reference**
- **Found during:** Task 2
- **Issue:** `src/lib/presence/topic.ts` does not exist.
- **Fix:** Used the canonical private media topic construction in `src/hooks/realtime/useAudioSignaling.ts`.
- **Files modified:** None.
- **Verification:** Policy tests use the exact `company:{companyId}:space:{spaceId}:media` topic and pass.
- **Committed in:** `116c081`

**3. [Rule 2 - Missing Critical Evidence] Converted expiry coverage into a real post-lock race**
- **Found during:** Final self-review
- **Issue:** Initial expiry coverage was sequential and did not prove revalidation after a wait.
- **Fix:** Held the lease row under `presence_maintenance_owner`, blocked a successor claim, committed expiry, then asserted the successor became canonical and the old owner could not renew.
- **Files modified:** `__tests__/presence-db/screen-share-lease.test.ts`
- **Verification:** Combined DB suite passes 21/21.
- **Committed in:** `1e0fef0`

**4. [Execution adjustment] Task 2 RED passed immediately**
- **Found during:** Task 2 TDD gate
- **Issue:** The immutable 03-08/03-09 migrations already implement the contract, so the new evidence suite passed on its first run.
- **Fix:** Confirmed the test uses real `pg`, `authenticated` role switching, JWT claims, `realtime.topic`, and RLS denials; no artificial failure was introduced.
- **Files modified:** None beyond the planned test.
- **Verification:** 5/5 RLS cases pass and direct lease-table access returns `42501`.
- **Committed in:** `116c081`

---

**Total deviations:** 3 auto-fixed (2 blocking references, 1 missing critical evidence) and 1 documented TDD adjustment.
**Impact on plan:** Evidence is stronger than the initial implementation and scope remains test-only; production migrations stayed immutable.

## TDD Gate Compliance

- Task 1 has a real RED commit (`acbc09d`) followed by a GREEN commit (`63fd7ae`) and a post-review evidence fix (`1e0fef0`).
- Task 2 could not produce a legitimate RED because its dependency migrations already satisfied the contract. The immediate pass was investigated per the fail-fast rule and retained as proof-only work.

## Verification

- Combined real database suite: 2 files, 21 tests passed.
- `npx --no-install supabase migration list --local`: `20260723104902` and `20260723224547` each present exactly once.
- `npm run type-check`: passed.
- Focused ESLint on both changed test files: passed.
- `npm run build`: passed after rerunning outside the sandbox cache-write restriction.
- `npm run presence:gate`: passed.
- `npm run presence:skill:validate`: passed.
- Zero-skip/stub scan: no skipped/TODO tests or UI-flow stubs.

## Issues Encountered

- The full repository lint remains red on pre-existing vendored `.claude/gsd-core` rule-resolution errors and unrelated legacy warnings. Focused lint for both plan-owned files is green.
- The first build compiled but could not write `.next/cache/.tsbuildinfo` inside the sandbox (`EPERM`); the approved rerun completed successfully.
- The specialized read-only Presence/Supabase reviewer could not be spawned because the two-thread limit was already occupied by the orchestrator and executor. The equivalent Presence/RLS checklist, focused lint, real DB tests, movement gate, typecheck, build, and diff review were completed locally; no production database boundary changed.

## Database and Deployment State

- **Written locally:** Two database evidence suites.
- **Applied to local database:** No new migration; existing migrations were already applied and were read back.
- **Applied to an online database:** No.
- **Application deployed:** No.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 03-03 can rely on the proven private media policy contract, but must reconnect/refresh authorization after identity, scope, or JWT changes because live-channel authorization is cached.
- Any future online rollout still requires a separately named target, explicit authorization, database-first migration application, same-target catalog readback, and multi-identity smoke verification.

## Self-Check: PASSED

- Both plan-owned test files and this summary exist on disk.
- Task commits `acbc09d`, `63fd7ae`, `116c081`, and `1e0fef0` exist in repository history.
- Summary frontmatter declares `status: complete`.
- `git diff --check` passed.

---
*Phase: 03-video-and-screen-sharing*
*Completed: 2026-07-24*
