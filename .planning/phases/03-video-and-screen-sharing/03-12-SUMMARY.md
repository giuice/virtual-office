---
phase: 03-video-and-screen-sharing
plan: 12
subsystem: presence-database-and-screen-sharing
tags: [postgres, supabase, presence-safety, concurrency, playwright, screen-sharing]

requires:
  - phase: 03-video-and-screen-sharing
    provides: screen-sharing implementation plus periodic authoritative reconciliation from plan 03-14
provides:
  - earliest-observation-wins hourly legacy-cutover audit coverage under concurrent writers
  - isolated database and browser fixtures that restore shared Presence state
  - complete green local Phase 3, Presence, database, browser, lint, type, and build gate
affects: [03-13, presence-cutover, screen-sharing, supabase, deployment]

tech-stack:
  added: []
  patterns:
    - Forward-only corrective migration with fail-closed equal-timestamp arbitration
    - Full shared-table snapshot and transactional restoration in database concurrency tests
    - Generated and vendored runtimes stay outside the application ESLint boundary

key-files:
  created:
    - supabase/migrations/20260727123730_fix_presence_cutover_coverage_first_observation.sql
    - .planning/phases/03-video-and-screen-sharing/03-12-SUMMARY.md
  modified:
    - __tests__/presence-db/presence-concurrency-contract.test.ts
    - __tests__/presence-db/screen-share-lease.test.ts
    - __tests__/api/playwright/screen-sharing.spec.ts
    - eslint.config.mjs
    - .planning/STATE.md

key-decisions:
  - "A concurrent hourly writer may replace stored evidence only when its checked_at is earlier; an exact timestamp tie favors unhealthy evidence."
  - "The historical 20260718203921 migration remains immutable; the correction ships as a new forward-only migration."
  - "Database fixtures snapshot and restore the complete shared coverage/runtime state instead of assuming a clean suite order."
  - "No online database or deployment operation is part of Wave 12."

patterns-established:
  - "First observation authority: checked_at is captured before catalog inspection and persisted through an atomic UPSERT."
  - "Fail-closed tie: equal observation timestamps cannot let healthy evidence mask unhealthy evidence."
  - "Local-only gate evidence is never represented as online rollout evidence."

requirements-completed: [VID-01, VID-02, VID-04]

coverage:
  - id: D1
    description: "Concurrent cutover-audit writers preserve the earliest current-hour observation, including an earlier unhealthy result."
    requirement: VID-04
    verification:
      - kind: integration
        ref: "__tests__/presence-db/presence-concurrency-contract.test.ts#preserves the first unhealthy current-hour observation"
        status: pass
      - kind: integration
        ref: "npm run test:presence:db - 16 files / 136 tests"
        status: pass
      - kind: other
        ref: "npm run test:presence:concurrency - 14 cases x 50 iterations / 700 report rows"
        status: pass
    human_judgment: false
  - id: D2
    description: "Presence and screen-sharing behavior passes the complete local unit, database, E2E, and automated-browser gate."
    requirement: VID-01
    verification:
      - kind: unit
        ref: "npm run test:presence - 61 files / 564 tests"
        status: pass
      - kind: e2e
        ref: "npm run test:presence:e2e - 5 tests"
        status: pass
      - kind: automated_ui
        ref: "playwright project screen-sharing - 6 tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "The unchanged final local diff passes global tests, type-check, lint, build, zero-skip, secret, and whitespace guards."
    requirement: VID-02
    verification:
      - kind: unit
        ref: "npm test - 108 files / 1,238 tests"
        status: pass
      - kind: other
        ref: "npm run type-check && npm run lint && npm run build && git diff --check"
        status: pass
    human_judgment: false

duration: ~3h
completed: 2026-07-27
status: complete
---

# Phase 03 Plan 12: Complete Local Quality and Integration Gate Summary

**The cutover audit now preserves the earliest hourly observation under concurrency, and the complete local Phase 3/Presence/database/browser/build gate passes on the final diff.**

## Performance

- **Duration:** approximately 3 hours across targeted correction, review, and repeated unchanged-diff gates
- **Completed:** 2026-07-27
- **Tasks:** 1 planned gate plus targeted blocker corrections
- **Files modified:** 5 implementation/test/tooling files plus planning metadata

## Accomplishments

- Replaced physical lock-winner behavior with atomic earliest-observation-wins semantics for `private.record_presence_legacy_cutover_audit_coverage()`.
- Preserved fail-closed behavior: an exact `checked_at` collision favors unhealthy evidence.
- Added only the FORCE-RLS UPDATE/DELETE policies required by the maintenance owner and extended the exact catalog-health contract.
- Rebaselined only an active local audit window after restoring final grants; a disabled audit remains disabled.
- Made database fixtures independent of suite order by snapshotting and restoring the full coverage/runtime state.
- Closed dormant Playwright harness defects and proved all six deterministic screen-sharing flows.
- Restored the application lint boundary by excluding only generated Next outputs, vendored GSD runtimes, and auxiliary worktrees.

## Verification Evidence

- Focused Vitest: 3 files, 142 tests passed.
- Tagged screen-sharing smoke: 1/1 passed.
- API coverage precheck and `npm ls --depth=0`: passed.
- Local migration history: `20260727123730` present and applied in the disposable local stack.
- Presence skill validation and movement gate: passed.
- Presence suite: 61 files, 564 tests passed.
- Presence database suite: 16 files, 136 tests passed.
- Presence concurrency: 14 cases x 50 iterations; NDJSON independently validated as 700 rows, 14 tags, and 50 distinct iterations per tag.
- Presence E2E: 5/5 passed against the local Supabase stack.
- Complete screen-sharing Playwright project: 6/6 passed.
- Global Vitest: 108 files, 1,238 tests passed.
- Type-check: passed.
- ESLint: passed with 0 errors and 496 pre-existing warnings.
- Production Next.js build: passed, including all 47 static pages.
- Critical Phase 3/Presence skip/TODO guard, secret guard, and `git diff --check`: passed.

## Local Catalog Readback

- `catalog_healthy = true`
- `postgres` membership in `presence_maintenance_owner = false`
- `anon`, `authenticated`, and `service_role` EXECUTE on the writer = false
- `authenticated` SELECT on the private coverage table = false
- RLS plus FORCE RLS = true
- Coverage-table policy count = 4
- Writer owner = `presence_maintenance_owner`

## Frozen Final Content Set

- **Files:** corrective migration, two Presence DB tests, screen-sharing Playwright spec, and ESLint config
- **SHA-256:** `1eafb84e3a748b08d222581535ac0f0bca545140d87e76dfb3ffd05f421805f1`
- The final complete gate ran after the last functional/tooling edit.

## Mandatory Reviewer Verdicts

- **Presence Safety:** PASS with no actionable findings after fixture isolation and runtime snapshot/restore changes.
- **Supabase/RLS:** PASS with no actionable RLS, ownership, `SECURITY DEFINER`, ACL, or rollout regression.
- The only changes after those verdicts were an equivalent TypeScript type-alias declaration and ESLint ignores for generated/vendored directories; the entire gate was rerun afterward.

## Task Commits

None. No files were staged, committed, pushed, or deployed during this execution.

## Files Created/Modified

- `supabase/migrations/20260727123730_fix_presence_cutover_coverage_first_observation.sql` - forward-only concurrency and catalog/ACL correction.
- `__tests__/presence-db/presence-concurrency-contract.test.ts` - full coverage-table isolation and deterministic first-observation contract.
- `__tests__/presence-db/screen-share-lease.test.ts` - exact Presence runtime-control snapshot and restoration.
- `__tests__/api/playwright/screen-sharing.spec.ts` - deterministic busy-loser, ended-track, touch, reduced-motion, and responsive-layout harness behavior.
- `eslint.config.mjs` - excludes only generated Next output, vendored GSD runtimes, and auxiliary worktrees from application lint.

## Decisions Made

- Kept the historical migration immutable and used a new migration so existing databases receive a reviewable forward fix.
- Captured `checked_at` before catalog inspection so lock wait time cannot redefine which observer was first.
- Used a conditional UPSERT instead of delete/insert or last-writer-wins behavior.
- Kept the writer `SECURITY DEFINER` with `search_path = pg_catalog`, maintenance-owner ownership, and EXECUTE granted only to `postgres`.

## Deviations from Plan

### Auto-fixed Issues

1. **Database concurrency blocker:** the original `ON CONFLICT DO NOTHING` preserved the lock winner rather than the earliest observer.
2. **Shared fixture contamination:** Presence DB tests assumed suite order and leaked runtime/coverage state.
3. **Dormant browser harness failures:** the complete Playwright project exposed stale-read, ended-track, touch-media, and viewport-baseline test defects.
4. **Global lint boundary:** ESLint traversed vendored GSD copies, auxiliary worktrees, and generated Next output.
5. **Type constraint:** converted one snapshot `interface` to an equivalent structural `type` for the existing generic constraint.

**Impact:** all corrections were bounded to deterministic blockers required to complete Wave 12; no online or deployment scope was added.

## Application, Database, and Deployment State

- **Application written locally:** test/tooling changes only; no production application source changed.
- **Database applied locally:** yes, only to the disposable local Supabase database.
- **Named online database queried or changed:** no.
- **Application deployed:** no.

## Post-execution Production Follow-up — 2026-07-27

- After Wave 12 completed, the user explicitly authorized immediate production application rather than deferring the migration.
- Production target `vhabpcoyypobgasacsko` had the original Presence audit migrations through `20260720131318`, mode `atomic`, an enabled legacy adapter, an active hourly cron, and the old losing-writer function.
- A private-schema logical backup was captured at `C:\tmp\virtual-office-production-private-schema-pre-20260727123730.sql` before mutation (SHA-256 `b81e0f9d2a682d2527068d89438da8d613473c23464ef5a007c4e167299a51e2`).
- Because unrelated local/remote migration history diverged, the exact reviewed SQL for `20260727123730` was executed transactionally and only that version was then recorded as applied; no missing screen-share or historical migration was pushed or falsely repaired.
- Same-target readback confirmed migration name/version, 25 recorded statements, corrected earliest-observation and unhealthy-tie behavior, both narrow maintenance policies, healthy matching fingerprint, active hourly cron, restored trigger/role/schema authority, and unchanged `atomic` runtime with the legacy adapter still enabled.
- Production observation restarted at `2026-07-27T17:06:23.560672Z`; its first corrected hourly record is healthy. No application deployment occurred in this follow-up.

## Remaining Risks

- Production cannot use pre-`2026-07-27T17:06:23.560672Z` coverage to authorize legacy cutover or removal. It must collect the next seven complete UTC days and pass the live gate.
- Production migration history remains divergent; ordinary `db push` is blocked until the four remote-only historical versions and local-only versions are reconciled by provenance. Do not use `--include-all` or broad history repair.
- Other online targets still restart an active legacy-cutover audit observation window when this migration is applied.
- Existing ESLint warnings remain at warning severity; Wave 12 introduced no lint errors.
- Plan 03-13 remains the separate human acceptance wave and was not executed under `--wave 12`.

## User Setup Required

None.

## Next Phase Readiness

Wave 12 is complete. The isolated Presence audit correction is applied/read back on production, but this does not deploy the Phase 3 application or its still-local screen-share migrations. Phase 3 may advance to plan 03-13 for human acceptance.

## Self-Check: PASSED

- Required summary exists.
- All automated gates passed on the final content set.
- Critical tests contain no skip/TODO declarations.
- Local catalog/ACL readback matches the intended least-privilege state.
- The original Wave 12 run accessed no online target; the separately authorized production follow-up is recorded above.

---
*Phase: 03-video-and-screen-sharing*
*Completed: 2026-07-27*
