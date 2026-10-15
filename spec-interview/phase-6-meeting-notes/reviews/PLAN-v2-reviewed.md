# PLAN: phase-6-meeting-notes

Spec: ./SPEC.md
Goal: Company members can record, revise, search, and export meeting notes per space — with action items, version history, and an AI-generated draft summary and action items from an uploaded transcript using the company's own AI provider key.
Plan version: 2
Highest task ID reserved: T17
Replanned because: the pre-execution adversarial PLAN review r1 (`reviews/sol-review-plan-r1.md`) found unbounded RPC execution grants, missing pre-dispatch authorization, a settings/admission race, replay-vs-settings ordering, checks assigned before their prerequisites exist, incomplete AC-009/AC-017/AC-023 evidence, an unowned ticket secret, and an unreviewed backfill/deployment path at rollout (P1–P11). No task has been executed.

## Standing rules for every task

- **Migration rule (SPEC §9, §10):** a migration is done when it is written, applied to the LOCAL database, its integration tests pass, and its rollback SQL is recorded in the migration header and TRACK. Each gets a row in `spec-interview/phase-6-meeting-notes/MIGRATIONS-PENDENTES.md`. Nothing is applied online before T15.
- **Function privilege rule (review P1):** the baseline default privileges grant EXECUTE on every new `public` function to `anon` and `authenticated` (`20260610183000_baseline_core_schema.sql:2131-2133`). Every new function therefore: has owner `postgres`, `SET search_path = ''` with schema-qualified references, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, and then an explicit `GRANT EXECUTE` only to the role that needs it. User-facing RPCs that authorize the caller themselves (resolving `auth.uid()` → `users.supabase_uid`) are granted to `authenticated` only. Server-only RPCs (key read, admission/reservation, settlement, usage maintenance) are granted to `service_role` only and are called by server code only after the route has authorized the application user; service role never replaces that authorization. Integration tests call each server-only RPC directly as `anon` and `authenticated` and expect denial.
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

## Block A — data and server contracts

## T1 — Meeting-note schema, read isolation, and lifecycle contract
Reasoning: Every other task needs notes that carry their own company and author, survive space deletion, and are readable only inside their company. Grounded in the observed schema gaps above (no company_id/author/revision/versions/participants; cascade from spaces; RLS joining through `spaces`, which breaks once `room_id` can be NULL).
Task: Local migrations make `meeting_notes` carry immutable `company_id` (→ companies ON DELETE CASCADE), author historical id + name snapshots and a live `created_by` (ON DELETE SET NULL), a revision, rich content (≤100,000 chars), optional summary, transcript identity, and nullable `room_id` (ON DELETE SET NULL); add note participants (user id + name snapshot, ≤50) and immutable versions (title, meeting date, participants, content, summary, editor historical id + name snapshot, live editor reference ON DELETE SET NULL). RLS scopes every read of notes, participants, versions, and items to `users.company_id = note.company_id` via `supabase_uid = auth.uid()::text` (never through `spaces`). `authenticated` and `anon` hold no INSERT/UPDATE/DELETE on these tables. Historical and identity fields are immutable for every role (trigger or equivalent). Legacy-row handling: the migration refuses to run if `meeting_notes` has rows without a derivable company (SPEC §9 preflight).
Done when: The local database enforces the schema, read isolation, immutability, and deletion behavior above.
Verify by: `__tests__/meeting-notes-db/` integration tests for AC-020 (space delete keeps notes and authors; company delete removes them), AC-021 (former member loses read; user deletion keeps snapshots; rejoin restores read), AC-023 (cross-company reads of notes/versions/participants/items return nothing for member and admin; `company_id`/`created_by` unchangeable by any client), AC-031 (user deletion succeeds, snapshots unchanged), and direct-client INSERT/UPDATE/DELETE denial; `supabase-rls-reviewer` audit.
Covers: FR-028, FR-029, FR-030, BR-001, BR-007, AC-020, AC-021, AC-023, AC-031
Root: T1
Depends on: —

## T17 — Note mutation RPCs with revision and version history
Reasoning: Writes must be authorized on the pre-change state and versioned atomically, at the database and not only at the API (BR-003/004, BR-011).
Task: `authenticated`-granted SECURITY DEFINER RPCs (per the function privilege rule) that resolve the caller by `supabase_uid`, authorize on the pre-change state, require the current revision, and in one transaction apply the change, bump the revision, and insert one version: create (any member, any company space incl. private, title 1–200, date required, participants current members only), update (fields + participants; former members already present may be retained; a non-editor cannot add themselves), restore (version fields incl. participants; items/transcript untouched; editors only), delete (author while a member, or admin; removes versions, participants, items, transcript). Cross-company admins are denied.
Done when: Every note write path through the database enforces rights, revision, limits, and versioning.
Verify by: Integration tests for AC-002 (DB-level limits), AC-004 (direct-client edit/self-add/restore denial for non-participant; cross-company admin denied), AC-005 (competing transactions incl. restore vs save), AC-006 (three saves → three immutable versions; non-editor restore denied; restore creates a fourth version equal to version 1 with items/transcript unchanged), AC-007; `supabase-rls-reviewer` audit.
Covers: FR-001, FR-006, FR-007, FR-008, FR-009, FR-010, BR-002, BR-003, BR-004, BR-011, AC-002, AC-004, AC-005, AC-006, AC-007
Root: T17
Depends on: T1

## T2 — Action-item contract in the database
Reasoning: Items have their own rights (assignee completion only), date-only due dates, and a capacity that must hold under concurrency; observed `due_date timestamptz` and unrestricted schema.
Task: Local migrations make items carry a date-only due date, assignee id + name snapshot, description 1–1,000 chars, a per-item revision, and immutable note/creator/creation fields. `authenticated`-granted RPCs (per the function privilege rule): editors create/edit/delete (assignee must be a current company member); editors and the current assignee toggle completion through a completion-only path; every change requires the item's current revision; capacity 100 per note is enforced atomically for every insertion path through one shared per-note lock that T12's Apply also takes.
Done when: The local database enforces the item rules, including concurrent capacity.
Verify by: Integration tests for AC-008, AC-009 (below-capacity validators, capacity, date stored and returned as the same calendar date), AC-032 (99-item concurrent adds); `supabase-rls-reviewer` audit.
Covers: FR-011, BR-005, AC-008, AC-009, AC-032
Root: T2
Depends on: T17

## T3 — Notes and items API routes with server-side sanitization
Reasoning: The UI must reach T17/T2 through authenticated routes that validate and sanitize, reusing the existing repository rather than a parallel one.
Task: Authenticated API routes (server client, `requireAuthUser`, application user by `supabase_uid`) for list-by-space, get, create, update, restore, delete, versions, and item operations, built on an extended `IMeetingNoteRepository`/`SupabaseMeetingNoteRepository` and `src/types` meeting-note types (existing callers kept compiling). Request bodies validated with zod against the SPEC limits; rich content sanitized on write with an allow-list (headings, bold, italic, lists, checklists, links with http/https/mailto only). Stale revision → 409 with the current state; unauthorized → 403/404 without leaking other companies' existence.
Done when: Every note and item operation works through the routes with the SPEC's rules and sanitized content.
Verify by: Route-level integration tests (route handlers in-process against local Supabase) for AC-002, AC-003 (write side: script/onerror/javascript: removed), AC-004, AC-005 (409 payload), AC-008, AC-024 precondition (non-editor writes denied); `supabase-rls-reviewer` audit.
Covers: FR-001, FR-002, FR-006, FR-007, FR-011, AC-002, AC-003, AC-004, AC-005, AC-008
Root: T3
Depends on: T17, T2

## T4 — Company-scoped full-text search
Reasoning: Search is a Must with a measurable threshold; no search infrastructure exists (unaccent not installed).
Task: Accent- and case-insensitive full-text search over title, content text, summary, and item descriptions, Portuguese and English, scoped to the caller's company; filters by space (including "Space removed") and meeting-date period; ordered by relevance then meeting date desc; paginated; returns excerpts. Exposed through an authenticated route. Index kept current on every note and item change.
Done when: Search returns correct, isolated, ordered, paginated results within 1 s locally at 1,000 notes.
Verify by: Integration test AC-014 (each field, PT with/without accents, EN case, filters, ordering, pagination, cross-company exclusion for member and admin, timing with 1,000 seeded notes); `supabase-rls-reviewer` audit.
Covers: FR-026, BR-001, AC-014
Root: T4
Depends on: T17, T2

## Block B — manual notes UI and AI settings

## T5 — Notes surfaces: space Notes tab, Meetings page, dashboard link
Reasoning: Users need entry points; observed `SpaceDetailPanel` has no tabs and the dashboard card has no target.
Task: The space detail (panel and bottom sheet) gains a "Notes" tab listing the space's notes by meeting date desc with "New note"; a "Meetings" page in the dashboard lists all company notes with search box, space and period filters, ranked results with excerpts, and pagination; the "AI Meeting Notes" card opens it; notes whose space was deleted show "Space removed". Query hooks in `src/hooks/queries`, mutations in `src/hooks/mutations`; caches keyed by application user and company. Interactive children follow the AGENTS.md card interaction rules. E2E specs written (not run).
Done when: A member reaches notes from a space and from the dashboard and finds them by search.
Verify by: Type-check, lint; E2E specs written for AC-001 (listing/order), AC-014 (UI search path), AC-015, AC-020 (UI label); any touched unit test replaced and deleted (TRACK).
Covers: FR-003, FR-004, FR-005, FR-028, AC-001, AC-014, AC-015, AC-020
Root: T5
Depends on: T3, T4

## T6 — Note editor, history, conflict, and delete UI
Reasoning: The core manual workflow (J1, J3, J4, J10).
Task: Create/edit form with title, date, participant picker (current members only; former members shown as "Former member" and removable), and a rich-text editor (Tiptap, limited to the SPEC's formatting set) whose output is sanitized again on render; read view with rendered content, author, participants, summary, transcript; edit controls only for editors; conflict dialog showing the newer state on 409; version list (who/when), version view, restore for editors; delete with confirmation for author/admin. E2E specs written (not run).
Done when: The manual note lifecycle works in the UI with the SPEC's rights, conflict, and history behavior.
Verify by: Type-check, lint; E2E specs written for AC-001, AC-003 (render side), AC-004 (no edit control), AC-005, AC-006, AC-007, AC-021 (display).
Covers: FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-030, AC-001, AC-003, AC-004, AC-005, AC-006, AC-007, AC-021
Root: T6
Depends on: T5

## T7 — Action-items UI and Markdown export
Reasoning: Completes J2 and J9; a stored date-only value can still be shifted by browser `Date` conversion (review P7).
Task: Items list in the note with add/edit/delete for editors, completion toggle for editors and the assignee only, assignee picker (current members), date-only due date rendered without timezone conversion, conflict feedback, 100-item limit message; "Export Markdown" with optional "Include transcript" producing a .md with title, date, space, author, participants, content converted to Markdown, summary, and items (assignee, due date, status), with user and AI text escaped so no raw HTML passes. E2E specs written (not run).
Done when: Items and export behave per the SPEC in the UI.
Verify by: Type-check, lint; E2E specs written for AC-008 (UI), AC-009 (due date 2026-11-05 shown and exported as 2026-11-05 in browser contexts with timezones America/Los_Angeles and Asia/Tokyo), AC-019, AC-003 (export side); an integration test of the export route output for AC-019/AC-003 against seeded data.
Covers: FR-011, FR-027, AC-003, AC-008, AC-009, AC-019
Root: T7
Depends on: T6

## T8 — Company AI settings with server-only encrypted keys
Reasoning: AI needs a per-company provider/key/model/effort/limit; `companies.settings` is client-readable, while `supabase_vault` exists locally. Online availability of `supabase_vault`, `unaccent`, and `pg_cron`, and whether online `meeting_notes` already holds rows, are unverified.
Task: A read-only catalog query on `vhabpcoyypobgasacsko` records whether `supabase_vault`, `unaccent`, and `pg_cron` are available and the row counts of `meeting_notes` and `meeting_note_action_items` (no change; result in TRACK; if an extension is unavailable or rows exist, stop and replan — rows require an owner backfill decision implemented and tested locally before T14). Local migrations add AI settings (provider ∈ anthropic/openai/kimi/glm, model, reasoning level, daily limit 1–200 default 20, revision, updated by/at, key last four) readable by company members only as metadata, and key storage in Vault with no grants to `anon`/`authenticated` and no Realtime publication. One `service_role`-only RPC saves settings and key atomically (single transaction, revision incremented, Vault secret replaced in the same transaction); one `service_role`-only RPC reads the key. A curated capability matrix in server code lists per provider the allowed models, reasoning levels with their wire parameters, context/output budgets, and documented pre-processing rejection status/type/code combinations. An admin-only route (authorizes admin of that company, then calls the save RPC) saves settings (key write-only, response masked). The company page's admin "Settings" area gains an "AI" section. E2E specs written (not run).
Done when: Admins configure AI; no client path can read a key; members see only metadata.
Verify by: Integration tests for AC-017 (persist, mask, member denied, limits 0/201 rejected, default 20, canary key absent from route responses, company reads, direct selects by every role, direct calls of the save/read RPCs as `anon` and `authenticated` denied, a Realtime subscription by a member to every published table receiving no canary while settings are saved, and captured server logs), AC-023 (cross-company settings/keys for member and admin); E2E spec written for AC-017 UI and AC-018 admin link; `supabase-rls-reviewer` audit; TRACK records the online read-only check.
Covers: FR-024, BR-009, AC-017, AC-018, AC-023
Root: T8
Depends on: T1

## Block C — AI contracts, intake, and provider access

## T9 — Usage accounting, admission, processing tickets, and idempotency contracts
Reasoning: Cost protection must hold under concurrency and replay before any provider call exists; this task owns what the database and ticket code can prove on their own (review P5). Dispatch-dependent evidence moves to T12.
Task: Server-only usage records per company per day (America/Sao_Paulo). One `service_role`-only admission RPC that, in a single transaction holding the company settings row lock: (1) verifies the caller's current membership and editor rights on the note (for replays too); (2) looks up an existing operation for the idempotency key — if found with the same binding, returns its status without new admission, regardless of later settings changes; if found with a different binding, rejects; (3) otherwise verifies that the bound settings revision is current, reserves usage against the limit, records the operation with the provider/model/effort snapshot, and returns the matching key from Vault. Settlement once, against the admission day, by a `service_role`-only RPC; refunds only for pre-processing rejections. Idempotency keys scoped to user+company+operation and bound to note id, source revision, transcript identity, settings revision. Signed processing tickets (issue time, user, company, note, source revision, transcript identity, settings revision) with HMAC-SHA256 using the required server-only env var `MEETING_NOTES_TICKET_SECRET` (≥32 bytes, no fallback — AI start refuses with a configuration error when missing), plus optional `MEETING_NOTES_TICKET_SECRET_PREVIOUS` accepted for verification only so a rotation keeps outstanding tickets valid for their 24 h; the local value is provisioned in `.env.local` and `.env.example` documents it. A ticket-issue route (called when the notice is shown) authorizes current membership and editor rights before signing. Operation records without content kept 30 days (pg_cron cleanup); an operation without outcome 10 minutes after dispatch becomes "failed" and stays counted (pg_cron); deleting notes or users never changes usage; no client role can read-modify usage beyond reading its own company's count.
Done when: Admission, settlement, replay lookup, and ticket issuance satisfy FR-022/FR-023/FR-031 at the database and route boundary, independently of any provider.
Verify by: Integration tests: five concurrent admissions at 19/20 → exactly one reserved, four refused (AC-028); same key + binding returns the existing operation across midnight; different binding rejected; direct `anon`/`authenticated` calls to admission, settlement, and usage tables denied (AC-028); a settings save racing an admission yields either admission under the old revision with the old snapshot or refusal — never a mixed snapshot (AC-025 DB side); the stale-operation job turns an operation backdated >10 min into "failed", still counted; the cleanup job removes records older than 30 days; note deletion leaves usage unchanged (AC-034 DB side); limit-reached response data and reset at 00:00 America/Sao_Paulo (AC-016 DB side); ticket-issue route denies a removed member and a non-editor; `supabase-rls-reviewer` audit.
Covers: FR-022, FR-023, FR-031, BR-008, AC-016, AC-025, AC-028, AC-034
Root: T9
Depends on: T8

## T10 — Transcript intake: upload, attach, validation, normalization
Reasoning: The transcript must be validated and stored before any AI step (owner r4: saved at upload).
Task: Routes for "New note from transcript" (creates the note with title = file name ≤200, date = today, transcript stored, version created) and "Attach transcript" (editors only; replaces the stored transcript and transcript identity immediately; summary untouched; revision bumped). Files must be .txt/.vtt/.srt, non-empty, ≤1 MB, valid UTF-8 text; otherwise rejected with a message and no change. A server normalizer removes VTT/SRT cue numbers, timestamps, and cue settings while keeping speaker names and text; it is the single source of the text sent to providers (its received-text evidence is T12's).
Done when: Valid transcripts create or update notes; invalid ones change nothing.
Verify by: Integration tests through the routes for AC-010 (upload creates note immediately; attach replaces, summary unchanged), AC-011 (each invalid file rejected, no note created or changed, usage unchanged), AC-024; `supabase-rls-reviewer` audit.
Covers: FR-012, FR-013, FR-014, BR-010, AC-010, AC-011, AC-024
Root: T10
Depends on: T17, T3

## T16 — Local fake AI server harness
Reasoning: Every AI test needs a deterministic stand-in for four provider wire protocols; separating it from the adapters gives it its own checkpoint (review P11).
Task: A test-only fake AI server under the meeting-notes test tree that speaks the Anthropic Messages API and the OpenAI Chat Completions/Responses shapes used by OpenAI, Kimi, and GLM; records every received request (headers without keys, body); and scripts outcomes per test: success with a given draft, error after processing, timeout, refusal, malformed JSON, each listed pre-processing rejection, unlisted statuses, overload after streaming began, connection drop after acceptance, and pause/resume. The DB integration suite's setup and the E2E runner start and stop it on a fixed local port.
Done when: Both test runners start the fake server, it answers each protocol with the scripted outcome, records requests, and shuts down cleanly.
Verify by: The meeting-notes DB suite setup starts it and a setup self-check sends one request per protocol and reads back the recorded request; the E2E config starts and stops it (config inspected; executed at T14).
Covers: AC-026, AC-029
Root: T16
Depends on: —

## T11 — Provider adapters
Reasoning: Four providers with different wire protocols must produce the same draft schema, never retry silently, and classify rejections only by documented signals.
Task: Server-only adapters: Anthropic via `@anthropic-ai/sdk`, OpenAI via `openai`, Kimi and GLM via the OpenAI SDK with their OpenAI-compatible base URLs; SDK retries disabled (`maxRetries: 0`); each sends only the matrix's valid parameters for the chosen model and reasoning level; output requested and validated against one draft schema (summary sections, ≤100 items with description and assignee name as written); malformed/truncated output is a failure; an input-size preflight against the model's context/output budget refuses oversize transcripts before any request; provider errors are mapped to sanitized messages (no key, no transcript) and classified as pre-processing rejection only per the matrix. A server-only base-URL override selects the fake server; it is ignored and logged as refused when `NODE_ENV=production`, and no client input can set it.
Done when: Each adapter, called by server code against the fake server over HTTP, returns a validated draft or a correctly classified failure, with exactly one outbound request per call.
Verify by: Integration tests against the T16 server: per adapter, received parameters match the matrix and a draft is returned (AC-026); oversize transcript → zero received requests (AC-026); connection drop → exactly one received request; listed rejections classified pre-processing; unlisted/mid-stream classified counted (AC-029 classification); override ignored under `NODE_ENV=production`. Usage effects of these outcomes are T12's evidence.
Covers: FR-016, FR-020, AC-026, AC-029
Root: T11
Depends on: T8, T16

## Block D — AI processing flow and UI

## T12 — Processing and Apply flow on the server
Reasoning: Joins admission, dispatch, draft, authorization rechecks, and atomic Apply — the heart of FR-015–FR-021 — and owns every dispatch-dependent check (review P2–P5).
Task: A start route that, in order: verifies the ticket signature and 24 h expiry (expired → rejected, no dispatch, even without records); compares the ticket's user/company/note with the authenticated application user; calls T9's admission RPC, which re-authorizes current membership and editor rights before anything else (existing operation → returns its pending/final/"discarded" status without dispatch, even if settings changed since; new operation → current membership, editor rights, and current settings revision required, stale revision → refused with the new provider name); dispatches once via T11 with the admitted snapshot and key; resolves suggested names locally (exact full name, else unique first name, case/accent-insensitive, current members only); rechecks membership and note existence before returning; honors client abort (operation "discarded") with best-effort outbound abort; and settles usage. An `authenticated`-granted Apply RPC accepts the edited summary and accepted items only at the draft's source revision, rechecks rights in the transaction, marks suggestions duplicating existing items, appends accepted items under T2's shared per-note lock and capacity, writes the summary, and creates one version — or changes nothing.
Done when: Processing and Apply satisfy FR-015–FR-021 against the fake provider, including every dispatch-dependent usage, replay, and authorization outcome.
Verify by: Integration tests through the routes against local Supabase and the T16 server for AC-010 (draft changes nothing until Apply; Apply stores exactly edited summary and accepted items, one version), AC-012 (text received by the fake provider for .vtt/.srt has no cue numbers/timestamps/settings and keeps speakers), AC-013 (name matching; request contains no roster), AC-016 (each failure outcome's counting), AC-025 (stale notice refused; admitted operation completes on P), AC-026 (oversize refused, usage unchanged), AC-027, AC-028 (concurrent starts dispatch once; replay received once), AC-029 (connection drop counted once; listed rejections not counted; unlisted/mid-stream counted), AC-030 (paused provider with transcript replacement / member removal), AC-032 (98 items: add vs two-item Apply), AC-034 (cancelled-then-completed replay → "discarded"; expired ticket after record cleanup; replay after a settings change returns the original operation; a child process running the start route is killed after the fake provider records receipt, then the stale-operation job yields "failed", counted; a ticket issued before a restart of that child process is still accepted), member removed or demoted before start → zero dispatches and usage unchanged; AC-023 cross-company matrix: a member and an admin of each company attempt every meeting-note, item, transcript, search, settings, ticket, processing, Apply, and usage route plus direct table/RPC access on the other company — all denied or empty; `supabase-rls-reviewer` audit.
Covers: FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-021, FR-022, FR-031, BR-006, BR-008, BR-013, AC-010, AC-012, AC-013, AC-016, AC-023, AC-025, AC-026, AC-027, AC-028, AC-029, AC-030, AC-032, AC-034
Root: T12
Depends on: T2, T9, T10, T11

## T13 — AI user interface: notice, processing, review, Apply
Reasoning: Completes J5/J6 for users and the client-side scope fencing.
Task: In the note view: "New note from transcript" and "Attach transcript" pickers; provider notice (with ticket) before "Process"; progress with cancel; errors with "Try again" (new operation); limit-reached message with local reset time; review screen to edit the summary and accept/edit/reassign/reject each suggestion, "already exists" items unchecked, Apply with conflict handling; reprocess for editors; AI controls disabled with "An admin needs to configure AI" when unconfigured, plus a settings link for admins. Drafts and note caches are scoped to application user + company; sign-out, removal, or company change cancels pending requests, clears drafts and cached notes, and drops late responses. E2E specs written (not run), using the fake AI server.
Done when: The AI flow is usable end to end in the UI per the SPEC.
Verify by: Type-check, lint; E2E specs written for AC-010, AC-016 (UI), AC-018, AC-027, AC-033 (delayed route response across sign-out/account switch and removal).
Covers: FR-015, FR-018, FR-019, FR-021, FR-023, FR-025, AC-010, AC-016, AC-018, AC-027, AC-033
Root: T13
Depends on: T7, T12

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

## Plan quality gate (version 2, 2026-10-13)

- Grounded in an actual observation of current state: Pass — observations section (local DB catalog, schema, default function privileges, UI files, harness, deps).
- Every acceptance criterion covered by TRACK done/no_op or a remaining task: Pass — AC-001 T5/T6/T14; AC-002 T17/T3; AC-003 T3/T6/T7/T14; AC-004 T17/T3/T6; AC-005 T17/T3/T6; AC-006 T17/T6; AC-007 T17/T6; AC-008 T2/T3/T7; AC-009 T2/T7/T14; AC-010 T10/T12/T13; AC-011 T10; AC-012 T12; AC-013 T12; AC-014 T4/T5/T14; AC-015 T5/T14; AC-016 T9/T12/T13; AC-017 T8/T14; AC-018 T8/T13; AC-019 T7/T14; AC-020 T1/T5; AC-021 T1/T6; AC-022 T15; AC-023 T1/T8/T12; AC-024 T10; AC-025 T9/T12; AC-026 T16/T11/T12; AC-027 T12/T13; AC-028 T9/T12; AC-029 T16/T11/T12; AC-030 T12; AC-031 T1; AC-032 T2/T12; AC-033 T13; AC-034 T9/T12.
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
