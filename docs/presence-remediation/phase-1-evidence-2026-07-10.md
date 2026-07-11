# Phase 1 evidence — Emergency private-space security closure (2026-07-10)

Defects closed: SEC-01, SEC-02, SEC-03 (interim portion), KNOCK-02 (expiry/consumed portion), DOC-01.
Status: **Pending user confirmation.**

## What shipped

### Migrations (canonical, `supabase/migrations/`)
- `20260710120000_presence_revisions_and_placement.sql` — `users.location_version` / `users.presence_access_revision` / `users.initial_placement_completed_at` (backfilled `coalesce(created_at, now())` for pre-existing users), `spaces.presence_access_revision`, non-negative/min-1 CHECKs, `spaces_capacity_nonnegative` (+ negative→0 repair; local had 0 affected rows), `private.guard_user_presence_revisions()` + `private.guard_space_presence_revision()` forced-value BEFORE INSERT/UPDATE triggers, users/spaces UPDATE column-privilege surgery excluding server-owned columns from `authenticated` (anon loses UPDATE entirely).
- `20260710121000_knock_requests_hardening.sql` — new columns (`company_id`, `expires_at`, `consumed_at`, `requester_location_version`, `requester_access_revision`, `space_access_revision`, `responder_access_revision`), full backfill + **all legacy rows expired (no grandfathering)**, NOT NULLs, `space_id` FK CASCADE→**RESTRICT**, status CHECK + `consumed`, state-machine CHECK, partial unique live-row index, composite + rate-limit indexes, **all 4 legacy policies dropped, ALL browser grants revoked (anon + authenticated)**. No replacement browser policies (Phase 4). Realtime publication membership intentionally kept until Phase 4.

### Route/API
- `src/app/api/users/location/route.ts` — removed `last_active` grace (SEC-02), unconditional `isAlreadyInSpace`, and open-log authorization (SEC-03 interim). Restricted entry now: direct ACL, OR same-space exit-log grace (`exited_at` non-null, not future, < 5 min), OR **exact** `knockRequestId` (UUID, approved+APPROVE+responder set+unconsumed+unexpired). Malformed/non-empty ACL without boolean `isPublic` → 403 `SPACE_ACCESS_CONFIGURATION_INVALID` (grants nobody, incl. admins). Knock consumption is now `status='consumed'+consumed_at` UPDATE (audit-preserving) instead of DELETE. Preserved: check order, offline-beacon branch (Rule 1), offline→online reactivation (Rule 7), all error codes.
- `src/app/api/spaces/knock/{request,respond}/route.ts` — shells returning 503 `KNOCK_TEMPORARILY_UNAVAILABLE`; vulnerable legacy handlers deleted (git history retains them; Phase 4 reimplements via service-role transaction functions).

### Client (interim fail-closed window)
- `useKnockSignaling.ts` — `KNOCK_DISABLED` short-circuits realtime subscriptions and poll-fallback browser SELECTs; send/respond surface typed 503 failure, no retry.
- `useModernFloorPlanKnock.ts` — `handleKnock` exported as `undefined`, knock prompt replaced by temporary-outage message, banner approve/deny inert. `handleEnterSpace` movement logic untouched; no `isAlreadyInSpace` bypass recreated.

### Tests
- `__tests__/presence-db/knock-rls.test.ts` + `auth-clients.ts` (real local Postgres + real authenticated JWTs via GoTrue admin): SEC-01 pre-approved INSERT denied, pending INSERT denied, SELECT/UPDATE/DELETE denied, anon denied, service-role sanity, server-owned column protection, revision-trigger behavior. **Red pre-migration (7 failing), green post-migration (11/11 incl. harness).**
- `__tests__/api/users-location-route.test.ts` — 23 tests; 12 new fail-closed negatives were red against the old route, green after hardening. Old positive `last_active`/open-log tests replaced (DOC-01). Direct-ACL/admin/exit-log-grace/exact-knock positives prove legitimate entry still works.
- Knock route/client suites rewritten for the 503 window. Regression sweep: 92 tests green (location, knock, presence-utils, realtime-presence, capacity, default-space-assignment). `tsc` clean; lint has no findings in Phase 1 files.

## Exit-gate readback (local, post-`db reset`)
```
knock_requests grants (anon/authenticated): NONE
knock_requests policies: 0
users UPDATE columns (authenticated): avatar_url, company_id, current_space_id, display_name,
  email, last_active, preferences, role, status, status_message   ← no location_version /
  presence_access_revision / initial_placement_completed_at
spaces.presence_access_revision UPDATE (authenticated): none
knock_requests_space_id_fkey delete rule: RESTRICT
triggers: users_guard_presence_revisions, spaces_guard_presence_revision
presence-table policies: 7 (11 baseline − 4 vulnerable knock policies)
```

## Adversarial review round (presence-safety-reviewer + supabase-rls-reviewer, 2026-07-10)

Both reviewers independently found the same BLOCKER; both fixed same-day before exit-gate:

1. **BLOCKER (fixed):** the users UPDATE column re-grant had been derived from the baseline *table definition* instead of the RLS migration's existing 6-column grant, widening it to `company_id`/`email`/`role`/`current_space_id` — self-service admin escalation + tenant escape + full location-route bypass (the row-scoped `users_update_own_safe_columns` policy limits which ROW, not which VALUES). Fixed: grant restored to exactly `display_name, avatar_url, status, status_message, preferences, last_active`; regression tests added (member cannot update role/company_id/current_space_id/email → 42501). Probe readback confirms `permission denied for table users` for a role self-update.
2. **BLOCKER (self-found while verifying #1, fixed):** the migration's blanket `REVOKE ALL ON SCHEMA private / ALL FUNCTIONS IN SCHEMA private` broke the seven PRE-EXISTING `private.*` RLS policy helpers (`current_company_id`, `is_company_admin`, …) for authenticated — every policy calling them started erroring (this also masked #1's test as a false-pass). Fixed: blanket revokes replaced with targeted revokes on only the two new trigger functions; readback shows 7 authenticated EXECUTE grants restored.
3. **Accepted interim consequence (documented, not fixed):** `knock_requests.space_id` FK RESTRICT means a space with any knock history cannot be deleted (repository returns false → route 404). This FK change is mandated by the handoff's Phase 1 knock-hardening spec; proper `SPACE_IN_USE` 409 handling + 30-day terminal cleanup arrive in Phases 3–4. Local DB currently has 0 knock rows.
4. Notes for later phases: `users.location_version` is intentionally unwired until the Phase 3 transition function; `migrations/database-structure.md` is stale (pre-dates Phase 1 — regenerate before relying on it); `knock_requests.company_id` FK has default NO ACTION (inert — no company-deletion path exists).

Post-fix verification: fresh wipe + `db reset`, presence-db 11/11 green, 92-test regression sweep green, readback = 6 safe users columns / 7 private helper grants / knock grants NONE / policies 0 / FK RESTRICT.

## Residuals / notes
- **Supabase advisors + staging readback**: migrations are local-only; run advisors and the same readback after the user approves pushing to staging/prod. Remember the Phase 0 residual: `supabase migration repair` needed before any prod `db push`.
- **Local `db reset` flake (infra, pre-existing)**: the persistent realtime container re-runs its Ecto migrations when the DB restarts and races the CLI's init container → `schema_migrations_pkey` duplicate. Workaround: `docker stop supabase_realtime_virtual-office && supabase db reset && docker start supabase_realtime_virtual-office` (or full `supabase stop --no-backup && supabase start && supabase db reset`). Not caused by Phase 1 SQL.
- `users.last_active` remains browser-writable (grant kept): it no longer authorizes anything after SEC-02 removal; revoking it belongs to the later users-write hardening (RLS test matrix #9) to avoid breaking legitimate flows mid-window.
- Interim UX accepted by the handoff: knock-only occupants cannot rejoin after reload/same-target transition until Phase 3 session evidence exists; knocking is fully unavailable until Phases 4–5.
- `__tests__/presence-db/setup.ts` local demo JWTs updated to the stack's actual signed keys (old defaults had a different signature).
