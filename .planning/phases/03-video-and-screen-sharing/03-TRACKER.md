# Phase 03 Remediation Tracker

## 2026-07-23 — Screen-share lease review remediation

- Completed: rewrote the local-only screen-share lease migration to use scalar/narrow reads, explicit lookup flags, claim-time placement/access fences, deterministic Presence-compatible locking, stale-owner release, and strict foreign-release denial. Added disposable real-Postgres lease and media-topic RLS regressions.
- Evidence: local reset replayed `20260723104902`; focused lease suite passed (4 tests), required Realtime catalog suite passed (3 tests), Presence gate and TypeScript check passed.
- Database state: migration is written in the repository and applied/read back only on disposable local loopback Supabase (`127.0.0.1:54322`). No online database was changed.
- Deployment state: no application deployment occurred.
- Decision: the user explicitly authorized destructive reset/rebuild of local Supabase only; no linked, staging, or production commands were run.
- Reviewer findings resolved: removed wildcard row expansion under narrow grants; isolated `FOUND` state; revalidated stored owners and persisted revision fences; corrected release idempotency; added real behavior and RLS evidence.
- Environment note: Windows local Supabase works at loopback after Docker is available. Full-stack health can be affected by excluded ports; this remediation used only the local database contract.
- Current blocker / next action: the full existing Presence DB suite has one reproducible, unrelated failure in `presence-concurrency-contract.test.ts` (`healthy: true` where its current-hour assertion expects `false`). The focused remediation evidence is green; investigate that pre-existing concurrency-contract test separately before treating the complete legacy DB suite as green.

## 2026-07-23 — Release absence re-review correction

- Risk corrected: `screen_share_context_observed` encoded an absent lease as JSONB `null`, while `release_screen_share_observed` checked SQL `NULL`; a valid no-lease release could therefore fall through to `LEASE_NOT_OWNER`.
- Correction: the helper now emits an explicit lease object with `found: false` when absent, and release branches on that flag. Stored foreign ownership remains `LEASE_NOT_OWNER`; repeated exact-owner release remains `RELEASED` with `alreadyReleased: true`.
- Evidence: Docker was reachable; local Supabase target was confirmed as `127.0.0.1:54322`; authorized `npx supabase db reset --local --no-seed` replayed `20260723104902`; local push/history/catalog readback passed. Real Postgres lease tests passed 5/5 (including strict no-lease, foreign-owner, and exact-owner repeated-release assertions); exact Phase 6 Realtime catalog tests passed 3/3; Presence gate, focused lint, TypeScript check, and diff check passed.
- Database/deployment state: correction is written and committed locally, and applied/read back only on disposable local loopback Supabase. No linked, staging, or production database action and no deployment occurred.
- Local Supabase security advisor completed with no errors. Its five mutable-search-path warnings name unrelated existing functions (`increment_unread_counts`, `is_platform_admin`, `set_participants_fingerprint`, `update_neighborhoods_updated_at`, and `update_space_agendas_updated_at`); this scoped release fix did not change them.

## 2026-07-23 — Screen-share API contract compatibility remediation

- Review risks fixed: claim, release, and active now reject a verified identity without a company scope as terminal `MEMBERSHIP_SCOPE_INVALID` (403) before any RPC. A stale membership-switch response cannot issue a privileged call.
- RPC compatibility fixed: a shared strict classifier maps PostgREST missing/signature codes (`PGRST202`, `PGRST203`) and PostgreSQL missing-function/grant codes (`42883`, `42501`) to the same terminal sanitized `DATABASE_CONTRACT_INCOMPATIBLE` (426) response. Raw provider messages, hints, details, and codes remain absent; unknown failures remain generic `INTERNAL_ERROR`.
- Evidence: focused mocked route suite passed 29/29, including table-driven coverage across all routes; TypeScript, focused ESLint, Presence movement gate, and diff check passed.
- Database/deployment state: application code and tests were committed locally only. No schema, data, function, grant, RLS, online target, or deployment was changed or queried.
- Next action: after merge, run the primary-checkout full test and build gates with its ignored local environment available.
