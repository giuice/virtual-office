# PLAN: phase-6-meeting-notes

Spec: ./SPEC.md
Goal: Company members can record, revise, search, and export meeting notes per space — with action items, version history, and an AI-generated draft summary and action items from an uploaded transcript using the company's own AI provider key.
Plan version: 4
Highest task ID reserved: T17
Replanned because: the pre-execution adversarial PLAN review r3 (`reviews/sol-review-plan-r3.md`) found that unspecified row-lock modes and order across the settings save, admission, Apply, and version inserts permit a deadlock (R3-1). No task has been executed.

## Standing rules for every task

- **Migration rule (SPEC §9, §10):** a migration is done when it is written, applied to the LOCAL database, its integration tests pass, and its rollback SQL is recorded in the migration header and TRACK. Each gets a row in `spec-interview/phase-6-meeting-notes/MIGRATIONS-PENDENTES.md`. Nothing is applied online before T15.
- **Function privilege rule (review P1):** the baseline default privileges grant EXECUTE on every new `public` function to `anon`, `authenticated`, and `service_role` (`20260610183000_baseline_core_schema.sql:2131-2134`). Every new function therefore: has owner `postgres`, `SET search_path = ''` with schema-qualified references, `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`, and then an explicit `GRANT EXECUTE` only to the role that needs it; integration tests read the effective EXECUTE matrix from the catalog. User-facing RPCs that authorize the caller themselves (resolving `auth.uid()` → `users.supabase_uid`) are granted to `authenticated` only. Server-only RPCs (key read, admission/reservation, settlement, usage maintenance) are granted to `service_role` only and are called by server code only after the route has authorized the application user; service role never replaces that authorization. Integration tests call each server-only RPC directly as `anon` and `authenticated` and expect denial.
- **Lock order rule (review R3-1):** every meeting-notes transaction takes row locks in this one order and skips the ones it does not need: (1) the actor's `users` row `FOR KEY SHARE` (where rights must hold for the whole transaction — note mutations and the settings save; KEY SHARE still blocks the product removal and role-change RPCs, which take `FOR UPDATE`, and does not conflict with presence's `NO KEY UPDATE` writes to the same row — TRACK T17), (2) the company's AI settings row, (3) the note row `FOR UPDATE`, (4) item rows. The note row lock is the single per-note lock: note mutations, restore, delete, attach, item insertion (capacity), and Apply take it before touching items or versions. `FOR KEY SHARE` on `users` coexists with the `KEY SHARE` taken by foreign-key checks on version/item inserts, and still blocks the existing member-removal and role-change paths, which lock `users` `FOR UPDATE` before `companies` (`20260718210827_phase7_company_member_atomic_removal.sql:641`).
- **Online method (T15 only):** the Phase 4/5 method — re-check `npx supabase migration list --linked` and the target catalog immediately before; apply each reviewed file's SQL transactionally and record only its version; read back catalog objects; smoke-check. Never `supabase db push`, `migration up --linked`, or broad `migration repair`.
- **Supabase/RLS review gate (AGENTS.md):** every migration, RLS policy, grant, RPC, repository, and API route change passes the `supabase-rls-reviewer` audit (users.id vs supabase_uid, server client + `auth.getUser()`, service role never replacing authorization, function grants per the rule above) before its task is recorded done.
- **Adversarial review gate (AGENTS.md):** direct Codex CLI, `gpt-6.1-sol`, effort `max`, read-only, per `delegation-anthropic.md`; prompts and results under `reviews/`. Per block, after its last task, over the block's combined diff: **Block A** = T1, T17, T2, T3, T4; **Block B** = T5, T6, T7, T8; **Block C** = T9, T10, T16, T11; **Block D** = T12, T13; **Final** = T14 over the whole work-item diff. Another round only for a High/Medium a real user or realistic failure can trigger; at most one fix round per block; leftovers recorded in TRACK and carried to T14.
- **Verification cadence (AGENTS.md, owner decisions 2026-10-10):** per task type-check + lint (new E2E specs are written with their task, not run); per block, after its fix round, type-check, lint, and the DB integration suite when server code changed; no E2E before T14; T14 runs every new spec and the full regression E2E once in Chrome only, zero retries, a failing test analysed and rerun alone. One test process at a time; nothing heavy in parallel.
- **Test policy (SPEC §15):** integration tests in a new `__tests__/meeting-notes-db/` suite (Vitest, node env, local Supabase, route handlers invoked in-process — same pattern as `vitest.messaging-db.config.mts`) and Playwright E2E with two accounts. The external AI provider is the only thing replaced, by the local fake AI server built in T16, reached over real HTTP. No unit tests; a touched unit test (e.g. `__tests__/company-settings-default-space.test.tsx`, `__tests__/modern-space-card.test.tsx`) is replaced by integration/E2E coverage and deleted, recorded in TRACK.
- **Secrets:** API keys, the ticket secret, and transcript text never in logs, errors, TRACK, reviews, or reports; tests use canary keys only.

## Observations grounding this plan (2026-10-13)

- Local Supabase answers at `127.0.0.1:54321` (HTTP 200). Local Postgres (`supabase_db_virtual-office`) has `supabase_vault 0.3.1`, `pgcrypto`, `pg_cron`; `unaccent` and `pg_trgm` are available but not installed. `meeting_notes` and `meeting_note_action_items` have 0 rows locally and one SELECT policy each (`*_select_same_company`, joining through `spaces`); authenticated has SELECT only (baseline `20260610183139`).
- `meeting_notes.room_id` is NOT NULL → `spaces` ON DELETE CASCADE; `summary` NOT NULL with a non-empty check; no `company_id`, author, content, revision, participants, or versions; `meeting_note_action_items.due_date` is `timestamptz`, `assignee_id` → users ON DELETE SET NULL (baseline `20260610183000`).
- Baseline default privileges grant EXECUTE on new public functions to `anon` and `authenticated` (`20260610183000_baseline_core_schema.sql:2131-2133`).
- `users` has `id`, `supabase_uid`, `company_id` (nullable), `display_name`, `role`; member removal clears `users.company_id` (`20260718210827_phase7_company_member_atomic_removal.sql:770`). `companies.settings` is JSONB readable through the company SELECT policy — not usable for keys.
- `IMeetingNoteRepository` / `SupabaseMeetingNoteRepository` exist with no runtime caller; `useSpaceDetails` has no consumer. Space detail UI is `src/components/floor-plan/modern/SpaceDetailPanel.tsx` (191 lines, no tabs) and `SpaceDetailBottomSheet.tsx`. Company page `src/app/(dashboard)/company/page.tsx` has tabs `members` and admin-only `settings`. Dashboard card "AI Meeting Notes" in `QuickLinksGrid.tsx:54` has no target.
- Route pattern: `requireAuthUser` (`src/lib/auth/session.ts`), `createSupabaseServerClient`, `src/lib/auth/authorize.ts`, `enforceRateLimit` (`src/lib/auth/rate-limit.ts`). DB integration suites invoke route handlers in-process (`vitest.messaging-db.config.mts`).
- No rich-text, sanitizer, Markdown-conversion, Anthropic, or OpenAI packages are installed; `zod 4.4.3` and `date-fns` are.
- E2E harness: `playwright.messaging-phase5.config.ts` (local-Supabase mode, real Chrome channel, server log capture) and `__tests__/api/playwright/helpers/local-supabase-mode.ts`; two-account fixtures from the messaging suites.
- Online target `vhabpcoyypobgasacsko`: not inspected yet (T8 does a read-only check; T15 the full preflight).
- None of these contradicts the SPEC.

## Final

## T14 — Phase acceptance verification and final adversarial review
Reasoning: Phase-level evidence that the block gates hold together on the final tree, plus the AGENTS.md final whole-diff review.
Task: On the final tree: the meeting-notes DB integration suite and the existing messaging and presence DB suites pass; one Chrome-only run (zero retries) of every new E2E spec and of the full regression E2E suite passes, each failure analysed and rerun alone; type-check, lint, and build pass; the production build's client bundle (`.next/static`) and the captured server logs of the E2E run contain neither the canary key nor the ticket secret (AC-017); no unit test was added and every touched unit test is recorded as replaced; §13 accessibility points (keyboard, focus, labels) are checked in the new screens; the whole work-item diff passes the adversarial review with every finding fixed or rejected with a reason.
Done when: All listed checks pass and the final review is accepted, with evidence and dispositions in TRACK.
Verify by: Suite, E2E, build, and bundle/log scan outputs saved under the work item; a diff scan for added unit tests; the saved final review prompt/result under `reviews/`.
Covers: FR-001, FR-002, FR-003, FR-004, FR-005, FR-011, FR-026, FR-027, AC-001, AC-003, AC-009, AC-014, AC-015, AC-017, AC-019
Root: T14
Depends on: T4, T5, T6, T7, T8, T13

## T15 — Online rollout, deployment, and owner acceptance
Reasoning: SPEC §10/§16 phase-end step; requires explicit owner authorization and is the last database-changing action. A local demo against the online DB is not deployment (review P10); late legacy data must not bypass review (review P9).
Task: Read-only preflight on `vhabpcoyypobgasacsko` (migration list, `meeting_notes`/items row counts, extensions, existing meeting-note policies and functions). If anything differs from T8's recorded observation in a way the reviewed migrations do not handle (new rows, missing extension, conflicting objects), stop: record it, replan, implement and test any backfill locally, pass its review, and only then return to authorization. Otherwise, after explicit owner authorization naming the target, apply every phase migration by the standing method; read back the catalog including function owners, `search_path`, EXECUTE grants (no `anon`/`authenticated` on server-only RPCs), Vault access, and the pg_cron jobs with a recorded successful run in `cron.job_run_details`; the owner sets `MEETING_NOTES_TICKET_SECRET` in the hosting environment and deploys the app (migrations first, then app; rollback app first, never restoring the space cascade); a smoke check runs against the deployed URL; the owner configures a real OpenAI API key on the deployed app and processes the one-hour fixture transcript.
Done when: All phase migrations are present and verified on `vhabpcoyypobgasacsko`, the deployed app passes the smoke check against it, and the owner accepts the final test including the ≤60 s draft.
Verify by: Preflight, readback (grants, cron run), deployed smoke outputs in TRACK; `MIGRATIONS-PENDENTES.md` states; user confirmation of authorization, deployment, secret provisioning, and of the final test (AC-022).
Covers: BR-012, AC-022
Root: T15
Depends on: T14

## Plan quality gate (version 4, 2026-10-13)

- Grounded in an actual observation of current state: Pass — observations section (local DB catalog, schema, default function privileges, UI files, harness, deps).
- Every acceptance criterion covered by TRACK done/no_op or a remaining task: Pass — AC-001 T5(TRACK)/T6(TRACK)/T14; AC-002 T17(TRACK)/T3(TRACK); AC-003 T3(TRACK)/T6(TRACK)/T7(TRACK)/T14; AC-004 T17(TRACK)/T3(TRACK)/T6(TRACK)/T14; AC-005 T17(TRACK)/T3(TRACK)/T6(TRACK)/T14; AC-006 T17(TRACK)/T6(TRACK)/T14; AC-007 T17(TRACK)/T6(TRACK)/T14; AC-008 T2(TRACK)/T3(TRACK)/T7(TRACK)/T14; AC-009 T2(TRACK)/T7(TRACK)/T14; AC-010 T10(TRACK)/T12(TRACK)/T13(TRACK)/T14; AC-011 T10(TRACK); AC-012 T12(TRACK); AC-013 T12(TRACK); AC-014 T4(TRACK)/T5(TRACK)/T14; AC-015 T5(TRACK)/T14; AC-016 T9(TRACK)/T12(TRACK)/T13(TRACK)/T14; AC-017 T8(TRACK)/T14; AC-018 T8(TRACK)/T13(TRACK)/T14; AC-019 T7(TRACK)/T14; AC-020 T1(TRACK)/T5(TRACK)/T14; AC-021 T1(TRACK)/T17(TRACK)/T2(TRACK)/T6(TRACK)/T14; AC-022 T15; AC-023 T1(TRACK)/T8(TRACK)/T12(TRACK); AC-024 T10(TRACK); AC-025 T9(TRACK)/T12(TRACK); AC-026 T16(TRACK)/T11(TRACK)/T12(TRACK); AC-027 T12(TRACK)/T13(TRACK)/T14; AC-028 T9(TRACK)/T12(TRACK); AC-029 T16(TRACK)/T11(TRACK)/T12(TRACK); AC-030 T12(TRACK); AC-031 T1(TRACK); AC-032 T2(TRACK)/T12(TRACK); AC-033 T13(TRACK)/T14; AC-034 T9(TRACK)/T12(TRACK).
- Every Must-priority requirement covered: Pass — FR-001..FR-031 each appear in at least one task's Covers.
- Every task lists Covers: Pass.
- Every ID in Covers exists in the SPEC: Pass.
- Every task has one observable Done when: Pass.
- Every task has a concrete Verify by: Pass.
- No task describes HOW instead of WHAT: Pass — library, env-var, and privilege choices are concrete parameters grounded in observation.
- Dependencies are ordered correctly and acyclic: Pass — T16 has no prerequisites and precedes T11; T17 follows T1; T2/T3/T4/T10 now depend on T17.
- PLAN contains only future work: Pass.
- Attempted-task rules / Root: N/A (no task attempted) / Pass (all roots are self).
- Surviving IDs stable: Pass (T1–T15 kept; T16, T17 new).
- Success criteria unchanged from the SPEC: Pass — no AC or FR weakened; evidence only moved to tasks that can observe it.

Verdict: Ready
