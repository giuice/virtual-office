# TRACK: phase-6-meeting-notes

Pre-execution gates: SPEC v5 approved by the owner (state.md); PLAN adversarial review r1–r4 (`reviews/sol-review-plan-r*.md`, gpt-6.1-sol, effort max confirmed in stderr, exit 0), r4 APPROVE on PLAN v4; dispositions in state.md.

## T1 — Meeting-note schema, read isolation, and lifecycle contract  [done]
Plan version: 4
Covers: FR-028, FR-029, FR-030, BR-001, BR-007, AC-020, AC-021, AC-023, AC-031
Root: T1
Performer: Claude subagent (delegated).
State delta:
- LOCAL database only: `meeting_notes` now carries immutable `company_id` (→ companies CASCADE), immutable author snapshots (`author_user_id`, `author_name`), live `created_by` (→ users SET NULL; equals author at insert; may only become NULL after user deletion), non-decreasing `revision`, `content` ≤100,000, `transcript_id` present iff `transcript` non-null, nullable `room_id` (→ spaces SET NULL; same-company only), nullable `summary`, `generated_by` default 'user'.
- New `meeting_note_participants` (user id + name snapshot, sort_order 0..49 unique per note → ≤50) and `meeting_note_versions` (fields + participants jsonb ≤50, editor snapshots, live `edited_by` SET NULL; all else immutable; deletable only via note cascade).
- Reads of notes, participants, versions, and action items are scoped by `private.is_company_member` on the note's `company_id` (supabase_uid = auth.uid()::text), never through spaces. anon: no grants; authenticated: SELECT only on the four tables → no client write path until T17/T2. TRUNCATE rejected for every role on the three note tables.
- Space deletion keeps notes with company/author; company deletion removes notes and children; user deletion never blocks and only clears live references; a removed member loses read and regains it on rejoin.
- Migration refuses (MEETING_NOTES_LEGACY_ROWS_NEED_BACKFILL) when any existing note has no derivable company (space → company) or author (`edited_by` → existing user); derivable rows are backfilled with author = `edited_by`, revision 1, no initial version.
- New integration suite `__tests__/meeting-notes-db/` with `vitest.meeting-notes-db.config.mts` and npm script `test:meeting-notes:db` (package.json modified).
Evidence:
- Migration `supabase/migrations/20261013103447_meeting_notes_company_scope_and_history.sql`; rollback SQL in its header (does not restore room_id NOT NULL, the space cascade, or summary NOT NULL).
- Orchestrator: `npm run test:meeting-notes:db` → 2 files, 11/11 passed (10.7 s).
- Orchestrator: local `schema_migrations` latest = 20261013103447; `meeting_notes` rows = 0; anon holds no grants and authenticated only SELECT on the four tables; `meeting_notes` FKs: company_id CASCADE, created_by/edited_by/room_id SET NULL.
- Performer: preflight refusal proven with a non-derivable legacy row (no partial state), derivable row backfilled, temp rows removed; rollback executed locally then file re-applied via CLI; `npx tsc --noEmit` exit 0; eslint 0 problems on the new suite, full lint 0 errors; fixture cleanup leaves no rows.
- Performer: `supabase-rls-reviewer` audit on the first revision → no High; M1 TRUNCATE bypass fixed + tested; L1 partially fixed (rest belongs to T17 RPCs); L2 fixed; L3 accepted (single transaction); L4 fixed (SHARE ROW EXCLUSIVE locks on companies/spaces/users before note tables); L5 no defect. Fixes not re-audited by the reviewer; covered by tests and carried to the block A review.
- `spec-interview/phase-6-meeting-notes/MIGRATIONS-PENDENTES.md` row: written + applied locally 2026-10-13; not online.
Verification: verified
Discovered:
- [verified] T17's note insert must set `created_by = author_user_id` (else MEETING_NOTE_AUTHOR_MISMATCH 23514) and version insert `edited_by = editor_user_id` (else MEETING_NOTE_VERSION_EDITOR_MISMATCH); participant reorder must respect the non-deferrable unique (note_id, sort_order) → affects T17.
- [verified] Guard error codes: 42501 MEETING_NOTE_IMMUTABLE_FIELD / _VERSION_IMMUTABLE / _PARTICIPANT_IMMUTABLE_FIELD / _TRUNCATE_FORBIDDEN; 23514 MEETING_NOTE_AUTHOR_MISMATCH / _SPACE_OUTSIDE_COMPANY / _VERSION_EDITOR_MISMATCH → affects T17, T3 (error mapping).
- [verified] `meeting_note_action_items` still has `due_date timestamptz`, no assignee snapshot, no per-item revision/immutability; its SELECT policy is now note-company scoped → affects T2.
- [reported, unconfirmed] Docker Desktop had stopped and was restarted by the performer; local stack healthy afterwards (tests ran green under the orchestrator).
Unresolved:
- Legacy backfill rule (author = last `edited_by`, no initial version) is the performer's choice; SPEC §9 leaves backfill to the owner. Only matters if online rows exist → T8 read-only check decides; owner confirms at that point.
- Online `vhabpcoyypobgasacsko` untouched (T8 check, T15 apply).
Risk:
- Rollback leaves notes with NULL `room_id` invisible under the restored spaces-joined policy and drops versions/participants/author/content data (documented in the header).
Deviation: preflight also refuses rows without a derivable author (author snapshots are NOT NULL); added same-company `room_id` check, insert-time author/editor equality, non-decreasing revision, and TRUNCATE guard as defense in depth.
Highest task ID reserved: T17
Gate: plan holds

## T17 — Note mutation RPCs with revision and version history  [done]
Plan version: 4
Covers: FR-001, FR-006, FR-007, FR-008, FR-009, FR-010, FR-030, BR-002, BR-003, BR-004, BR-011, AC-002, AC-004, AC-005, AC-006, AC-007, AC-021
Root: T17
Performer: Claude subagent (delegated).
State delta:
- LOCAL database only: notes can now be created, updated, restored, and deleted by clients only through four `authenticated`-only SECURITY DEFINER RPCs (`create_meeting_note`, `update_meeting_note`, `restore_meeting_note_version`, `delete_meeting_note`); each authorizes on the locked pre-change state, requires the current revision, and in one transaction writes the change, bumps the revision, and inserts exactly one version (delete: none; cascade removes participants, versions, items).
- Title CHECK 1–200 non-blank for every role (NOT VALID on `meeting_notes` so legacy rows cannot block; validated on versions).
- Errors: stale → P0001 MEETING_NOTE_STALE_REVISION (details current_revision); forbidden → 42501 MEETING_NOTE_FORBIDDEN; missing or other company → P0002 MEETING_NOTE_NOT_FOUND (identical to a random id); limits → 22023 MEETING_NOTE_* (TITLE_INVALID, DATE_REQUIRED, CONTENT_TOO_LONG, CONTENT_REQUIRED, TOO_MANY_PARTICIPANTS, PARTICIPANTS_INVALID, PARTICIPANT_NOT_MEMBER, REVISION_REQUIRED); SPACE_NOT_FOUND / VERSION_NOT_FOUND P0002.
Evidence:
- Migration `supabase/migrations/20261013105021_meeting_notes_mutation_rpcs.sql`; rollback in header (app first; drops RPCs, helpers, title checks; no data loss).
- Orchestrator: `npm run test:meeting-notes:db` → 3 files, 22/22 passed (17.4 s).
- Orchestrator catalog: the four RPCs SECURITY DEFINER, `search_path=""`, ACL `{postgres, authenticated}` only; six `private.meeting_note_*` helpers ACL postgres only.
- Performer: tests cover EXECUTE matrix + anon denial; BR-002 private space; AC-002 limits and boundaries; AC-004 rights incl. cross-company NOT_FOUND; AC-005 four forced lock interleavings (save/save, restore/save, save/restore, delete/save) via real lock holder + PostgREST competitor; AC-006 versions immutable, restore equals v1 with items/transcript byte-identical; AC-007 cascade + admin delete; AC-021 retained former member, denied former participant/author, rejoin restores edit; removal vs note change serialized both orders. type-check clean; lint 0 errors (no new warnings).
- Performer: `supabase-rls-reviewer` → no High. M1 lock mode is KEY SHARE (not SHARE) — kept: blocks product removal/role-change RPCs (FOR UPDATE) without conflicting with presence NO KEY UPDATE writes; header claim corrected; test added. M2 restore may re-list a departed person — rejected: FR-009/AC-006 require exact participants; they remain former members without access (tested). M3 unlocked membership read of new participants — accepted race, no rights granted. Lows: NULL participants/content rejected, space FOR KEY SHARE on create, NULL revision/id tests, validator STABLE, idempotent constraint add (fixed); malformed version JSON (rejected, trusted writes only); per-user write throttling deferred to T3 routes; NOT VALID title check accepted (legacy decided at T8/T15).
- MIGRATIONS-PENDENTES.md row added (written + applied locally; not online).
Verification: verified
Discovered:
- [verified] `update_meeting_note` edits title, meeting date, content, participants only — not summary, room, transcript, or items (summary changes via restore and T12 Apply; SPEC FR-001/FR-006 need no manual summary edit) → affects T3, T6.
- [verified] `create_meeting_note(p_room_id, p_title, p_meeting_date timestamptz, p_content, p_participant_ids uuid[])` requires a non-null space of the caller's company; `p_content` non-null ('' for empty), participants an array ([] for none) → affects T3, T10 ("New note from transcript" creates in a space).
- [verified] The RPCs require a user session (`authenticated`), not service_role: routes call them through `createSupabaseServerClient` with the user's JWT → affects T3, T10, T12.
- [verified] Version participants jsonb shape `[{user_id, display_name}]` in sort order; retained participants keep their original snapshot → affects T3, T6.
- [reported, unconfirmed] Local `schema_migrations.statements` for 20261013105021 holds the pre-review SQL (file re-applied via psql after review fixes); catalog matches the file. Online apply at T15 uses the file.
Risk:
- A raw `UPDATE users` (not a product path) is not serialized with note mutations by the KEY SHARE lock.
- No DB-level write throttling: T3 routes must apply `enforceRateLimit`.
Deviation: actor row locked FOR KEY SHARE rather than the PLAN lock-rule's FOR SHARE (the rule names FOR SHARE only for the settings save); still blocks the product removal and role-change paths. Restore may re-list departed people per FR-009.
Highest task ID reserved: T17
Gate: plan holds

### Correction checkpoint — T17
- [verified] Consequence of T17's lock-mode deviation: `FOR SHARE` on `users` conflicts with presence's `NO KEY UPDATE` writes, `FOR KEY SHARE` does not and still blocks the removal/role-change `FOR UPDATE` → PLAN v4 lock order rule and T8 refined to `FOR KEY SHARE` (maintenance, no version change). Affects T8, T2, T12.

## T2 — Action-item contract in the database  [done]
Plan version: 4
Covers: FR-011, FR-030, BR-005, AC-008, AC-009, AC-021, AC-032
Root: T2
Performer: Claude subagent (delegated).
State delta:
- LOCAL database only: `meeting_note_action_items.due_date` is `date` (legacy rows convert to the America/Sao_Paulo calendar date); new immutable creator snapshots (`creator_user_id`, `creator_name`), `assignee_name` snapshot set exactly with `assignee_id`, per-item `revision` (must rise on any change), `updated_at`; description 1–1,000 non-blank (NOT VALID for legacy); the assignee users FK was dropped so a departed/deleted assignee keeps id + name (mirrors participants).
- Guard trigger for every role: id/note_id/creator/created_at immutable; capacity 100 enforced by a BEFORE INSERT trigger that locks the note row FOR UPDATE and counts — covers RPCs, service_role, multi-row inserts, and T12's future Apply; TRUNCATE rejected.
- Four `authenticated`-only RPCs (`create_/update_/delete_meeting_note_action_item`, completion-only `set_meeting_note_action_item_completed`); editors create/edit/delete/complete, the current assignee (while a member) completes only; items never bump the note revision or create note versions.
- T17's `private.meeting_note_authorize` now delegates to new `private.meeting_note_lock_for_change` (two-valued `can_edit`/`can_delete`, null-safe), same tokens and SQLSTATEs.
Evidence:
- Migration `supabase/migrations/20261013110632_meeting_note_action_items_contract.sql`; rollback in header (restores T17 authorize body by reference to `20261013105021`); rollback rehearsed locally, version marked reverted and re-applied via `migration up --local`; local history consistent.
- Orchestrator: `npm run test:meeting-notes:db` → 4 files, 29/29 (22.9 s); local schema_migrations latest 20261013110632; the four item RPCs SECURITY DEFINER, `search_path=""`, ACL {postgres, authenticated}; `due_date` type `date`.
- Performer: tests cover catalog matrix; AC-008 rights (editors, assignee completion only, unassigned refused, cross-company not-found, note revision/versions unchanged); forced item conflict; AC-009 validators at 10 items, capacity via RPC/service role/multi-row 98+3, due date '2026-11-05' across Kiritimati/Los_Angeles/Tokyo/Sao_Paulo sessions and PostgREST; AC-021 removed assignee denied, snapshot kept on edits, re-assigning refused, rejoin restores completion, user deletion keeps id+name; AC-032 forced and unforced races at 99 → exactly one, total 100. type-check 0 errors; lint 0 errors, none new.
- Performer: `supabase-rls-reviewer` → H1 any member could complete an unassigned item (NULL comparison fail-open) → fixed + regression test; M1 three-valued can_edit/can_delete → fixed at source (also hardens T17); L1 READ COMMITTED assumption documented; L2 trusted cross-note bulk insert ordering documented; L3 blank check incl. tabs/newlines fixed; L4 NULL display_name rejected (column NOT NULL); L5 validator STABLE fixed; L6 dropped FK accepted (RPC-only writes); L7 rollback ordering OK.
- MIGRATIONS-PENDENTES.md row added (written + applied locally; not online).
Verification: verified
Discovered:
- [verified] T12 Apply appends items by calling `private.meeting_note_lock_for_change(note_id, '<NOT_FOUND token>')` (actor KEY SHARE → note FOR UPDATE; returns can_edit, note_revision), inserting with creator snapshots and assignee_name when assignee_id is set; the insert trigger raises 22023 MEETING_NOTE_ITEM_LIMIT_REACHED past 100 and rolls back the whole Apply; READ COMMITTED required → affects T12.
- [verified] Item RPCs take/return `due_date` as 'YYYY-MM-DD'; item jsonb fields id, note_id, description, assignee_id, assignee_name, due_date, completed, revision, creator_user_id, creator_name, created_at, updated_at; error tokens MEETING_NOTE_ITEM_* (P0002 NOT_FOUND, 42501 FORBIDDEN, P0001 STALE_REVISION with current_revision, 22023 DESCRIPTION_INVALID / ASSIGNEE_NOT_MEMBER / REVISION_REQUIRED / COMPLETED_REQUIRED / LIMIT_REACHED) → affects T3, T7.
- [verified] Item changes do not touch `meeting_notes`, so a search index including item descriptions must be maintained from item writes → affects T4.
Risk:
- Rolling T2 back requires restoring T17's authorize body from the T17 file (documented in the header).
- A newly chosen assignee removed concurrently ends as a former-member assignee (no rights gained; same as T17 participants).
Deviation: T17-era test fixtures updated for the new NOT NULL creator columns; the assignee users FK dropped (snapshot model) — not named in the task text, consistent with FR-030.
Highest task ID reserved: T17
Gate: plan holds

## T3 — Notes and items API routes with server-side sanitization  [done]
Plan version: 4
Covers: FR-001, FR-002, FR-006, FR-007, FR-011, AC-002, AC-003, AC-004, AC-005, AC-008
Root: T3
Performer: Claude subagent (delegated).
State delta:
- Every note and item operation is reachable through authenticated routes under `src/app/api/meeting-notes/`: list by space `GET ?spaceId=&limit=&cursor=` (no content/summary/transcript text); `POST` create; `GET/PATCH/DELETE [id]` (detail carries spaceName or null = "Space removed", author snapshot, participants with `isCurrentMember`, items with `assigneeIsCurrentMember`, hasTranscript/transcriptId, revision, `rights {canEdit, canDelete}`; transcript text only with `?include=transcript`); `POST [id]/restore`; `GET [id]/versions`, `GET [id]/versions/[versionId]`; `POST [id]/items`; `PATCH/DELETE [id]/items/[itemId]`; `PUT [id]/items/[itemId]/completion`. Reads use the user's server client under RLS; writes go through the T17/T2 RPCs with the user's session.
- Errors: stale → 409 `{code, currentRevision, note|item}`; 42501 → 403; P0002 → 404 identical to a random/malformed id; 22023 + zod → 400 stable `MEETING_NOTE_*` codes; 401 no session; 415 non-JSON; 413 body > 1 MB; 500 without SQL detail.
- Rich content sanitized on write by one shared allow-list `src/lib/meeting-notes/content-sanitizer.ts` (no server-only import; reusable for render) using `sanitize-html` 2.17.7 (pinned; `@types/sanitize-html` 2.16.2 dev).
- Repository/types rewritten to the Phase 6 contract (`IMeetingNoteRepository`, `SupabaseMeetingNoteRepository`, `src/types/database.ts`, new `src/types/meeting-notes.ts`); old direct-table writes removed (no other callers).
- Rate-limit actions `meeting-note:write` 60/60 s and `meeting-note:item-write` 120/60 s (fail-open), using a service-role client only for `check_rate_limit` — same pattern as `src/app/api/messages/create/route.ts:358`.
Evidence:
- Orchestrator: `npm run test:meeting-notes:db` → 6 files, 68/68 (50.8 s); `npm run type-check` clean; limiter pattern matches messaging routes.
- Performer: 39 new route tests — 401 on every route; AC-002 limits incl. 50/51 participants and 100,000 after sanitization; AC-003 write side (script/onerror/onclick/javascript:/data:/style/iframe/img/svg removed; headings/bold/italic/lists/task list/https+mailto links kept); AC-004 rights incl. company-B 404 equal to random id; AC-005 409 body with newer note, first change intact, stale restore 409; AC-008 item rights incl. assignee completion only; AC-009 limits via route incl. 101st; AC-024 precondition non-editor 403 with transcript unchanged; former-member flags; versions; delete cascade. eslint 0 problems on touched files. No unit tests touched.
- Performer: `supabase-rls-reviewer` → no High. M1 member flags vs users RLS — rejected (same-company read policy; test asserts true and false); M2 no per-item canComplete — rejected for T3 (UI derives `canEdit || assigneeId === me`); M3 private-space notes visible to all members — rejected (BR-001); L1 null note after write → 404 fixed; L2 null company id fixed; L3 NUL chars (400 in title/description, stripped from content) fixed; L4 comment fixed; L5–L8 accepted.
Verification: verified
Discovered:
- [verified] `check_rate_limit` is service-role only; routes create a service-role client solely for the limiter (messaging precedent) → affects T8, T9, T10, T12 routes.
- [reported, unconfirmed] Route-test cookie jar `__tests__/meeting-notes-db/route-session.ts` is module-global: route calls across users must be sequential → affects later route tests (T8–T12).
- [reported, unconfirmed] Sanitizer keeps task-item `<input type="checkbox" />`, drops relative/protocol-relative hrefs keeping text → affects T6 editor round-trip.
- [verified] Item descriptions are plain text, not sanitized: UI renders them as text only; transcript text only via `?include=transcript`, never in 409 bodies → affects T6, T7, T13.
Risk:
- `npm audit` high advisory on pre-existing `postcss` (also a sanitize-html dependency); style parsing disabled (`parseStyleAttributes: false`, no style attributes allowed), so note input never reaches postcss.
- Rate limits fail open; authorization still enforced by the RPCs.
Deviation: a service-role client is created in routes only for `enforceRateLimit` (required by the task, impossible otherwise); never used for note data.
Highest task ID reserved: T17
Gate: plan holds

## T4 — Company-scoped full-text search  [done]
Plan version: 4
Covers: FR-026, BR-001, AC-014
Root: T4
Performer: Claude subagent (delegated).
State delta:
- LOCAL database only: `unaccent` installed in schema `extensions`; text-search configs `private.meeting_notes_pt` / `private.meeting_notes_en` (unaccent + stemmers); `meeting_notes.search_vector` STORED generated column (title A, summary B, content text C — tags/attributes stripped, entities decoded; transcript never indexed) with GIN index; GIN expression index on item descriptions (weight D). No triggers: maintenance happens on each writer's own insert/update, never bumps the note revision or creates versions, no change to the lock order.
- `public.search_meeting_notes(p_query, p_room_id, p_space_removed, p_meeting_from, p_meeting_to, p_limit, p_offset)` — SECURITY DEFINER (owner postgres, `search_path ''`, EXECUTE authenticated only) restricted to the caller's `users.company_id` via `supabase_uid = auth.uid()::text`; relevance desc, meeting_date desc, id desc; offset/limit 1..50, offset ≤ 10,000; empty query = list mode (date order).
- Route `GET /api/meeting-notes/search?q=&spaceId=&removed=&from=&to=&limit=&cursor=` returns `{items, nextCursor, hasMore, totalCount}`, excerpts as `{field, segments:[{text, highlighted}]}` (plain text, ≤600 code points; UI must render as text); rate limit `meeting-note:search` 120/60 s fail-open; 400 codes MEETING_NOTE_SEARCH_* / SPACE_INVALID / BAD_REQUEST, 401.
Evidence:
- Migration `supabase/migrations/20261013114402_meeting_notes_search.sql`; rollback in header (app first; no data loss; unaccent stays) — executed twice locally during re-applies.
- Orchestrator: `npm run test:meeting-notes:db` → 79/79 (73 s); catalog: `search_meeting_notes` definer, `search_path=""`, ACL {postgres, authenticated}; `unaccent` in `extensions`.
- Performer: timing through the route at 1,000 notes (2 items each) + 300 notes in company B: all-match 247 ms, filtered 190 ms, list mode 134 ms (asserted < 1000 ms). EXPLAIN: item GIN bitmap scan for rare words; seq scan of 1,300 notes preferred at this size; SECURITY INVOKER version could not use GIN under RLS (`@@` not leakproof) → definer with explicit company filter.
- Performer: tests cover each field, PT with/without accents, EN case, tags not indexed, space/removed/period filters, list mode, ordering, pagination without duplicates/gaps, cross-company exclusion for member and admin, item add/edit/delete and note update reflected with revision/versions unchanged, EXECUTE matrix, anon denied, 401/400. type-check clean; lint 0 errors, none new.
- Performer: `supabase-rls-reviewer` → no High, no cross-company path. M1 rate limit → fixed; L2 per-document negation/multi-word → accepted, documented; L3 → harmless; L4 marker constants → fixed; L5 search_vector readable same-company → rejected (RLS-limited, table-level grant model); L6, L7 accepted; `private` schema not exposed (config.toml schemas public, graphql_public) — verified by performer.
Verification: verified
Discovered:
- [verified] Search results carry `roomId` without space name; `roomId === null` = "Space removed"; `from`/`to` are ISO instants with offset (from inclusive, to exclusive) — UI converts chosen local days; empty `q` gives the company-wide list → affects T5.
- [reported, unconfirmed] Search limit 120/min per user: search-as-you-type must debounce → affects T5.
- [verified] Online target must allow `create extension unaccent with schema extensions` (not installed elsewhere); migration rewrites `meeting_notes` under ACCESS EXCLUSIVE → affects T8 check, T15 rollout.
- [reported, unconfirmed] service_role writers need EXECUTE on the private search helpers (granted); definer RPCs need nothing more → affects T12.
Risk:
- Offset pagination can shift if data changes between pages.
- ts_headline over very large content (up to 100k) per row may be slower than measured (~1.5 KB fixtures).
- Portuguese stemming does not always join singular/plural ("reuniões" vs "reunião").
Deviation: SECURITY DEFINER with an explicit company filter instead of INVOKER (GIN unusable under RLS); search rate limit added (optional in task).
Highest task ID reserved: T17
Gate: plan holds

### Block A review checkpoint — T1, T17, T2, T3, T4
Prompt `reviews/review-prompt-blockA.txt`; diff `reviews/blockA-cumulative.diff`; result `reviews/sol-review-blockA-r1.md` (gpt-6.1-sol, reasoning effort max per stderr, exit 0). Verdict: REVISION REQUIRED.
- A-1 Medium note create vs member removal deadlock (space locked before the company FK KEY SHARE; removal locks company → space) → fix round (company FOR KEY SHARE before space + forced interleaving test).
- A-2 Medium concatenated PT+EN vectors break phrase order and exclusions → fix round.
- A-3 Medium excerpts use only the PT config, English-stemmed matches get unrelated excerpts → fix round.
- A-4 Low title blank check ignores tabs/newlines at DB → fix round.
- A-5 Low NUL in search query / year 0000 dates → 500 → fix round (400).
- A-6 Low review diff had binary placeholders (literal NUL bytes in TS) and lacked package-lock.json → fix round escapes NULs; orchestrator regenerates the diff.
- A-7 Low "401 on every route" not fully proved → fix round extends the matrix.
Gate: fix round dispatched (one round per AGENTS.md); then type-check, lint, DB suites.

### Block A fix round checkpoint — T1, T17, T2, T3, T4
Performer: Claude subagent (one fix round). Forward migration `supabase/migrations/20261013124610_meeting_notes_block_a_fixes.sql` (LOCAL only; rollback in header; MIGRATIONS-PENDENTES row added); earlier migration files unchanged.
- A-1 fixed: `create_meeting_note` locks the company FOR KEY SHARE before the space; forced creation-vs-removal interleaving test failed with 40P01 on old code, passes now; other functions rechecked — no company/space ordering hazard.
- A-2 fixed: PT/EN lexemes merged at original positions (fields 128 positions apart); query lexemes replaced by the alternation of all language variants; `"review budget"` and `budget -meeting` regressions pass via route and RPC.
- A-3 fixed: headline tries PT, then EN, then per-word; English inflections deep in content/summary highlighted (test).
- A-4 fixed: whitespace-aware title predicate in validator and both CHECKs; RPC test with tabs/newlines.
- A-5 fixed: NUL, lone surrogates, year 0000, offsets > 15 h rejected with 400 (routes + search); lone-surrogate content stored as U+FFFD.
- A-6 fixed: literal NULs in TS replaced by escapes; orchestrator regenerated `reviews/blockA-cumulative-r2.diff` (text mode, includes package-lock.json).
- A-7 fixed: 401 matrix covers all 13 handlers.
- Performer: `supabase-rls-reviewer` → no High/Medium; two Lows: NOT VALID title check on meeting_notes rejected (legacy rows, decided at T15); service_role EXECUTE on the pure query helper kept (T4 ACL, harmless). Robustness probe 3,053 queries → 0 errors. Timings at 1,000 notes via route: 346 / 136 / 116 ms.
Block gate checks (orchestrator):
- `npm run test:meeting-notes:db` → 7 files, 87/87 (80.8 s).
- `npm run type-check` → clean; `npm run lint` → 0 errors (460 pre-existing warnings).
- `npm run test:messaging:db` (shared `rate-limit.ts` changed) → run 1: 169/170 (1 failure, output not captured); rerun of the suite: no failures reported. Treated as the known intermittent messaging-db flake (Phase 5 TRACK); not caused by meeting-notes changes, which only add two rate-limit action entries.
- Presence DB suite not run: no presence code changed.
Discovered:
- [verified] Search-vector migration drops and re-adds the stored column and rebuilds the item index under ACCESS EXCLUSIVE → apply in a quiet window at T15 (lock_timeout bounds only the wait) → affects T15.
- [reported, unconfirmed] A stop word in only one language drops an exclusion of that word in that language's reading (documented in the header).
Gate: block A closed — fix round done; no further review round (AGENTS.md: one fix round per block); leftover none open. Final review (T14) covers the fix-round code.

## T5 — Notes surfaces: space Notes tab, Meetings page, dashboard link  [done]
Plan version: 4
Covers: FR-003, FR-004, FR-005, FR-028, AC-001, AC-014, AC-015, AC-020
Root: T5
Performer: Claude subagent (delegated).
State delta:
- Space detail (panel and bottom sheet via `SpaceDetailPanel`) has tabs Details (default, unchanged) / Notes; `SpaceNotesTab` lists the space's notes newest meeting date first with links to `/meetings/[id]`, "New note" → `/meetings/new?spaceId=`, load more, loading/empty/error states; root has `data-avatar-interactive` and stops pointer/click propagation; links carry `data-space-action`. Presence/placement code untouched.
- `/meetings` page (`src/app/(dashboard)/meetings/page.tsx`): labelled search (350 ms debounce, maxLength 200), space select incl. "Space removed", local-day period → ISO instants (from inclusive, to exclusive; invalid/inverted period blocked inline), results with title/date/space name (roomId mapped via `useCompany().spaces`, null → "Space removed" badge)/author/excerpt as React text with `<mark>` highlights, total count, load more.
- Dashboard "AI Meeting Notes" card is available and links to `/meetings`.
- URL helpers `src/lib/meeting-notes/ui-paths.ts`; hooks `src/hooks/queries/useMeetingNotes.ts` keyed `['meeting-notes', users.id, company.id, ...]`; retries only on network/5xx. UI language English (surrounding UI is English).
- E2E runner `playwright.meeting-notes.config.ts` (local-Supabase mode, port 3230, Chrome only, retries 0, workers 1, server log tee) + script `test:meeting-notes:e2e`; fixtures `__tests__/api/playwright/fixtures/meeting-notes.ts` (`notesWorld`), global setup sweeping "MN E2E" data; specs written, not run: space-notes-tab (AC-001), meetings-search (AC-014 UI), dashboard-link (AC-015), space-removed (AC-020).
Evidence:
- Orchestrator: `npm run type-check` clean; `npm run lint` 0 errors (460 pre-existing warnings); `npx playwright test --list -c playwright.meeting-notes.config.ts` → 4 tests in 4 files (not executed, per owner rule); stray report folder removed.
- Performer: eslint clean on touched files; existing unit tests rendering SpaceDetailPanel/BottomSheet (`space-detail-hover-panel`, `floor-plan-presentation-stage`) 60/60 unchanged; no unit test replaced or deleted.
Verification: verified (type-check/lint/listing); E2E behavior pending the T14 run
Discovered:
- [reported, unconfirmed] `DELETE /api/spaces` (`src/app/api/spaces/route.ts:171`) checks company ownership but not admin role (pre-existing, outside this SPEC) — owner follow-up candidate.
- [verified] T6 mutations must invalidate `meetingNoteQueryKeys.scope(userId, companyId)` (or `.space` + `.searches`) → affects T6, T7, T13.
- [reported, unconfirmed] E2E data: shared persistent messaging seed company; specs use dedicated "MN E2E" spaces + prefix sweep; T6/T7 specs reuse `notesWorld` (`createSpace`, `createNote`, `addActionItem`, `createOtherCompanyNote`) → affects T6, T7, T8, T13.
Risk:
- Specs unexecuted until T14: selectors/timing, clickability of SQL-created spaces as `space-<id>` cards, display-name assumption, and ~25 note writes per minute vs the 60/min limit in AC-014 are unproven.
- No browser render check yet.
Highest task ID reserved: T17
Gate: plan holds

## T6 — Note editor, history, conflict, and delete UI  [done]
Plan version: 4
Covers: FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-030, AC-001, AC-003, AC-004, AC-005, AC-006, AC-007, AC-021
Root: T6
Performer: Claude subagent (delegated).
State delta:
- `/meetings/new?spaceId=` creates a note (title, local-day date sent as local noon with offset, ≤50 current-member participants, Tiptap rich text) and opens `/meetings/[id]`; missing/foreign space asks to choose a space.
- `/meetings/[id]` shows title, date, space or "Space removed", author, revision, participants ("Former member" + snapshot name), content re-sanitized with the shared allow-list before `dangerouslySetInnerHTML` (new `sanitizeMeetingNoteHtmlForDisplay`, checkboxes disabled), summary as text, transcript on demand via `?include=transcript` as text; items section is a T7 slot (`data-testid="meeting-note-action-items-slot"`).
- Controls follow `rights`: edit/restore only `canEdit`, delete only `canDelete`, history for every viewer. 409 opens a conflict dialog with the newer state and the user's unsaved text (copyable); "Load newer version" or "Keep editing my copy" (save blocked until the newer one is loaded); never auto-overwrites. History lists versions (editor, local time), opens read-only, restore with confirmation (409 → conflict dialog). Delete with AlertDialog → `/meetings`.
- Tiptap schema limited to paragraph, hard break, bold, italic, headings 1–3, bullet/ordered lists, task list/item, links (http/https/mailto only; javascript:/relative/data: refused); client-only (`next/dynamic` ssr:false). Accessible toolbar (role=toolbar, aria-pressed, roving tab stop), labelled fields, Radix dialogs.
- Packages: 13 `@tiptap/*` packages pinned 3.31.3. Hooks: `src/hooks/queries/useMeetingNote.ts`, `src/hooks/mutations/useMeetingNoteMutations.ts`, keys under `meetingNoteQueryKeys.scope(users.id, company.id)`.
- E2E specs written, not run: note-create (AC-001), note-sanitization (AC-003 render), note-rights (AC-004), note-conflict (AC-005), note-history (AC-006), note-delete (AC-007), note-former-member (AC-021 display); helpers extended (`overwriteStoredContentUnsafe` trusted local SQL for render-side sanitization tests, `removeFromCompany` via the product RPC).
Evidence:
- Orchestrator: `npm run type-check` → 0 errors; `npx playwright test --list -c playwright.meeting-notes.config.ts` → 11 tests in 11 files (not executed); `@tiptap/*` pins 3.31.3 in package.json.
- Performer: `npm run lint` 0 errors (460 warnings, baseline); `npm run build` succeeded (`/meetings/new` static, `/meetings/[id]` dynamic); no node process left; scratch round-trip (jsdom) — sanitized HTML reloads into the editor identically, task-list `checked` survives, hostile markup removed, `javascript:` links refused; no unit test touched.
Verification: verified (type-check/lint/build/listing); browser behavior pending the T14 run
Discovered:
- [reported, unconfirmed] Tiptap starter-kit would add code block/blockquote/strike; extensions are listed individually so the schema equals the SPEC set → affects T7 export, T13 draft rendering.
- [reported, unconfirmed] sanitize-html drops empty-valued attributes unless allowed; Tiptap writes `checked="checked"`, so stored notes are unaffected.
Unresolved:
- First client-side use of sanitize-html, editor typing/toolbar in Chrome, and all 7 specs' selectors/timing unproven until T14.
Risk:
- `note-former-member.spec.ts` assumes the removal RPC works for a users row without auth/presence; back-to-back specs vs the 60 writes/min limit unchecked.
Highest task ID reserved: T17
Gate: plan holds

## T7 — Action-items UI and Markdown export  [done]
Plan version: 4
Covers: FR-011, FR-027, AC-003, AC-008, AC-009, AC-019
Root: T7
Performer: Claude subagent (delegated).
State delta:
- `/meetings/[id]` has a working items section: editors add/edit/delete (description as text only, assignee via Radix Select of current members, former assignee kept as "Name (Former member)", `<input type=date>` due date); completion checkbox for editors and the current assignee, read-only Done/Open badge for others; due date shown as the stored 'YYYY-MM-DD' without `Date`; 409 shows the newer item with retry/load options; 100-item limit message and disabled Add at 100; field errors; 403/404 messages.
- `GET /api/meeting-notes/[id]/export?includeTranscript=&timeZone=` (T3 read conventions, RLS reads, 401, identical 404 for other company/random/malformed id, 400 bad options) returns `text/markdown` attachment (ASCII slug + `filename*`, nosniff, no-store) with title, meeting day in the viewer's zone, space or "Space removed", author, participants (former marked), content as Markdown (headings shifted under "## Notes"), summary, items as GFM task lines with assignee/due/status sub-bullets, transcript only on request. UI "Export Markdown" for every viewer, "Include transcript" only when a transcript exists.
- Converter: custom walk over `htmlparser2` 12.0.0 (now an exact direct dependency; already used by sanitize-html); content re-sanitized first; links http/https/mailto only; depth cap 24. Escaping (`markdown-escape.ts`): `< > &` → entities, Markdown control characters backslash-escaped, line-start markers escaped, link destinations percent-encoded.
- Item mutation hooks `src/hooks/mutations/useMeetingNoteActionItemMutations.ts` update the cached detail and invalidate `meetingNoteQueryKeys.scope`.
- E2E specs written, not run: note-action-items (AC-008 UI), note-item-due-date-timezones (AC-009 LA/Tokyo, export), note-export (AC-019, AC-003 export side).
Evidence:
- Orchestrator: `npm run type-check` → 0 errors; `npx vitest run -c vitest.meeting-notes-db.config.mts __tests__/meeting-notes-db/meeting-note-export-route.test.ts` → 3/3.
- Performer: `npm run lint` 0 errors (baseline warnings); `npm run test:meeting-notes:db` → 8 files, 90/90; export tests cover AC-019 with/without transcript, filename, former participant, meeting day in UTC/Tokyo/LA with due date 2026-11-05 unchanged; AC-003 hostile title/name/raw stored content/item/summary/transcript → no `<`, no unescaped `](javascript:`, no `![`; 404/400/401. `--list` → 15 tests in 14 files (not executed). supabase-rls-reviewer on the export route → no findings.
Verification: verified (type-check/lint/integration/listing); browser behavior pending the T14 run
Discovered:
- [reported, unconfirmed] An exported title ending in `#` loses it (ATX closing sequence) — cosmetic only.
Unresolved:
- 4 new E2E tests unproven until T14 (Radix Select picking, blob download, date input under LA/Tokyo, member rows without auth in the assignee picker).
Risk:
- `note-export.spec.ts` asserts the exact download filename; Chrome may alter it.
- Export is assembled in memory (≈1 MB with a full transcript), no rate limit (same as read routes).
Deviation: item details exported as nested sub-bullets under each task line.
Highest task ID reserved: T17
Gate: plan holds

## T8 — Company AI settings with server-only encrypted keys  [done]
Plan version: 4
Covers: FR-024, BR-009, AC-017, AC-018, AC-023
Root: T8
Performer: Claude subagent (delegated); online read-only check by the orchestrator.
State delta:
- Online read-only check (orchestrator, 2026-10-13, `npx supabase db query --linked`, project ref `vhabpcoyypobgasacsko`): `supabase_vault` 0.3.1 installed in `vault`; `pg_cron` 1.6 installed; `pgcrypto` 1.3 in `extensions`; `unaccent` available, not installed; `meeting_notes` 0 rows; `meeting_note_action_items` 0 rows; 2 baseline meeting-note policies. Nothing changed online. Consequence: no legacy backfill decision needed (closes the T1 backfill item); T4's unaccent creation is possible.
- LOCAL only: migration adds `public.meeting_note_ai_settings` (company_id PK → companies CASCADE; provider check anthropic/openai/kimi/glm; model; reasoning_level; daily_limit 1–200; revision; key_last_four; updated_by_user_id → users SET NULL; updated_by_name; updated_at) — metadata only; RLS SELECT for same-company members; service_role SELECT only; no client writes; in no publication. Key stored as Vault secret `meeting_notes_ai_key:<company_id>` (no reference column); AFTER DELETE trigger removes the secret.
- `save_meeting_note_ai_settings(p_actor_user_id, p_company_id, p_expected_revision, p_provider, p_model, p_reasoning_level, p_daily_limit, p_api_key)` and `read_meeting_note_ai_key(p_company_id)` (NULL = not configured) — SECURITY DEFINER, `search_path ''`, EXECUTE service_role only; save locks actor users FOR KEY SHARE → settings row, re-checks admin, checks revision, writes row + Vault secret in one transaction. Tokens 42501 MEETING_NOTE_AI_SETTINGS_FORBIDDEN, P0001 _STALE_REVISION (current_revision), 22023 _INVALID_ARGUMENT / _AI_PROVIDER_INVALID / _AI_MODEL_INVALID / _AI_REASONING_INVALID / _AI_DAILY_LIMIT_INVALID / _AI_KEY_REQUIRED / _AI_KEY_INVALID.
- Routes `GET /api/companies/ai-settings` (any member: masked metadata, matrix options, canManage; no row → not configured, limit 20) and `PUT` (admin only, checked before any service-role use; 8 KB JSON cap; zod + matrix; 409/400/403; key never echoed or logged; rate limit `meeting-note:ai-settings` 10/60 s fail-closed).
- Capability matrix `src/lib/meeting-notes/ai/capabilities.ts` (server-only, doc URL per entry): anthropic claude-opus-5-5 / sonnet-5-5 / haiku-5-5 (`output_config.effort` low..max; rejections 401/403/429/529-initial); openai gpt-6-astra / gpt-6.1-sol / gpt-6-luna (`reasoning_effort`; 401/403/429/503 overloaded); kimi kimi-k3 at api.moonshot.ai (`reasoning_effort` low/high/max; listed 401/403/429/503 codes); glm-5.3 / 5.2 / 5.1 at api.z.ai (`reasoning_effort` or `thinking`; json_object only; business-code rejections).
- Admin "AI" section in the company Settings tab (`MeetingNoteAiSettingsSection.tsx`, anchor `#ai-settings`, `AI_SETTINGS_PATH` for T13); hooks, repository (server-only), types. E2E specs written, not run: ai-settings (AC-017 UI), ai-settings-admin-link (AC-018 admin).
Evidence:
- Migration `supabase/migrations/20261013142351_meeting_notes_ai_settings.sql`; rollback in header rehearsed locally (rollback → repair reverted → up).
- Orchestrator: `npm run test:meeting-notes:db` → 105/105 (103.6 s); type-check 0 errors; lint 0 errors (460 baseline warnings); catalog: both RPCs ACL {postgres, service_role}; `meeting_note_ai_settings` in no publication.
- Performer: 15 new integration tests — catalog grants/EXECUTE matrix; default 20; save with canary + member metadata read; ciphertext lacks plaintext; keep/replace key + revision; stale 409; member 403; limits 0/201/1.5 and invalid provider/model/reasoning/key → 400 (and DB-level); direct selects by every role; client writes 42501; Vault via PostgREST/pg denied for anon/authenticated; RPCs as anon/authenticated 42501; company reads contain no canary; AC-023 cross-company; concurrent first saves one winner; company deletion removes secret; removal/demotion vs save forced both orders (no deadlock; removal-first → FORBIDDEN, unchanged); Realtime member subscribed to all 8 published tables gets positive controls and no canary; captured console has no canary. `--list` → 17 tests in 16 files (not executed).
- Performer: `supabase-rls-reviewer` → no High. M1 service_role extension grants on vault tables — rejected (server trust boundary; revoking risks CLI/extension upgrades); M2 comment corrected; L1 missing-secret "configured" row → fixed (KEY_REQUIRED) + test; L2 DB shape-only model check accepted (route enforces matrix); L3 last four visible — rejected (FR-024 allows); L4 key kept in input after failed save — rejected; L5 kept. Fixes not re-audited; covered by tests.
Verification: verified
Discovered:
- [verified] Postgres regex repetition bound ≤255; supabase-js `rpc()` is lazy; Realtime bindings live only after "Subscribed to PostgreSQL" → affects T9, T12 tests.
- [verified] service_role can read `vault.secrets`/`decrypted_secrets` via extension grants; T9 reads keys only through `read_meeting_note_ai_key` by convention; T15 re-reads Vault grants for `postgres` online → affects T9, T15.
- [reported, unconfirmed] Kimi/GLM keys only work on the issuing platform (matrix uses international endpoints); GLM supports only `json_object` → affects T11, admin guidance.
- [verified] `read_meeting_note_ai_key` returns NULL when not configured → affects T9.
Risk:
- Matrix facts from docs fetched 2026-10-13; model IDs must be re-checked at T15; billing of error responses undocumented (classification follows FR-022).
- E2E specs reset the shared seed company's AI settings before/after by design.
Deviation: invalid-request 400 and not-found 404 not listed as pre-processing rejections (stay counted, per FR-022); quota 429s classified as rate limit; Kimi lists only kimi-k3; no Vault id column (secret located by unique name).
Highest task ID reserved: T17
Gate: plan holds

### Block B review checkpoint — T5, T6, T7, T8
Prompt `reviews/review-prompt-blockB.txt`; diff `reviews/blockB-cumulative.diff` (whole work item; block B scope = delta vs `blockA-cumulative-r2.diff`); result `reviews/sol-review-blockB-r1.md` (gpt-6.1-sol, reasoning effort max per stderr, exit 0). Verdict: REVISION REQUIRED.
- B-1 High API key retained in TanStack mutation variables after save/sign-out → fix round.
- B-2 High late export/mutation callbacks cross account scope (download after account switch) → fix round (abort + scope fence + retire caches).
- B-3 Medium offline save failure unmounts the editor and loses the draft → fix round.
- B-4 Medium delete/restore/item-delete confirmations adopt a newer revision at confirm time → fix round (capture revision at open).
- B-5 Low history omits "Former member" → fix round.
- B-6 Low Markdown structure from split text nodes; trailing `#` in titles → fix round.
- B-7 Low wildcard rejection entries would refund unknown codes → fix round.
Gate: fix round dispatched (one round); then type-check, lint, DB suite.

### Block B fix round checkpoint — T5, T6, T7, T8
Performer: Claude subagent (one fix round). No migration.
- B-1 fixed: the API key never enters TanStack state (ref map + one-use token, `gcTime: 0`, cleared on settle/unmount); the AI form remounts per users.id:company.id. Spec `ai-settings.spec.ts` extended with a test-only cache probe (boolean only) — write-only.
- B-2 fixed: one scope fence for all meeting-notes writes and export (`src/lib/meeting-notes/scope-fence.ts`, `useMeetingNotesScopedMutation`, `MeetingNotesScopeBoundary` mounted in `src/app/layout.tsx` inside CompanyProvider): requests carry AbortSignals registered per scope; late callbacks of a retired scope are dropped; the retired scope's queries/mutations are cancelled and removed; export aborts on unmount. New spec `note-export-scope-switch.spec.ts` (write-only).
- B-3 fixed: no invalidation on transport failures; editor stays mounted with an inline refresh error; mutations use `networkMode: 'always'`. New spec `note-offline-save.spec.ts` (write-only).
- B-4 fixed: delete/restore/item-delete capture the revision when opened; 409 shows the newer state and requires explicit re-confirmation. New spec `note-delete-stale-confirm.spec.ts` (write-only).
- B-5 fixed: version route returns participants with `isCurrentMember`; history shows "(Former member)"; integration test extended; E2E extended (write-only).
- B-6 fixed: line-start markers escaped across fragments; trailing `#` runs escaped in headings and title; export-route regression test added.
- B-7 fixed: rejection entries are exact `type`/`code`/`type+code` matches, no wildcards (OpenAI 401/403/plain 429 now counted); `classifyMeetingNoteAiPreProcessingRejection` requires the provider's error envelope — first exercised by T11 integration tests.
Block gate checks (orchestrator):
- `npm run test:meeting-notes:db` → 9 files, 106/106 (103 s); `npm run type-check` → 0 errors; `npm run lint` → 0 errors (460 baseline warnings); `npm run build` → compiled successfully (root layout changed); `--list` (performer) → 20 tests in 19 files (unrun).
- Messaging/presence DB suites not rerun: block B changed no shared server code beyond route additions (rate-limit action entries were covered at block A).
Discovered:
- [verified] `.env.local` (owner file, unchanged since 2026-07-21) already sets `NEXT_PUBLIC_E2E=true`, so the boolean cache probe is installed in local dev and in any local build — the "never in production builds" claim holds only if the hosting environment does not set `NEXT_PUBLIC_E2E` → affects T14 (final review), T15 (check hosting env).
- [reported, unconfirmed] refetchOnWindowFocus is production-only; E2E triggers background refetch via offline→online after the 15 s staleTime.
Risk:
- Scope fence depends on `MeetingNotesScopeBoundary` in the root layout (fails closed with NO_SESSION if missing).
- E2E helper `createOtherCompanyAccount` creates local Auth users (swept by email pattern in global setup).
Gate: block B closed — fix round done; no further review round; carried to T14: probe gating claim vs hosting env, all block B E2E specs unrun.

## T9 — Usage accounting, admission, processing tickets, and idempotency contracts  [done]
Plan version: 4
Covers: FR-022, FR-023, FR-031, BR-008, AC-016, AC-025, AC-028, AC-034
Root: T9
Performer: Claude subagent (delegated).
State delta:
- LOCAL only: `public.meeting_note_ai_operations` (no content; idempotency_key unique; company_id → companies CASCADE; user_id/note_id without FK so note/user deletion never changes usage; snapshot of provider/model/reasoning; admission_day in America/Sao_Paulo; status; timestamps). RLS on, no policy; anon/authenticated no privileges; service_role SELECT only; no publication. Usage = counted operations per company per admission_day.
- State machine: admitted → dispatched | released; dispatched → succeeded | failed | discarded | refunded; stale job: admitted/dispatched → failed 10 min after dispatch (or admission). Counted: admitted, dispatched, succeeded, failed, discarded; not counted: refunded, released; terminal states immutable; settle idempotent against the admission day.
- RPCs (service_role only): `admit_meeting_note_ai_operation(p_actor_user_id, p_company_id, p_note_id, p_idempotency_key, p_ticket_issued_at, p_source_revision, p_transcript_id, p_settings_revision)` (expiry first; locks actor users KEY SHARE → company KEY SHARE → settings FOR UPDATE → note FOR UPDATE; rights rechecked for replays; replay → status only; new → snapshot + Vault key + transcript + usage in one transaction; clock read after locks), `mark_meeting_note_ai_operation_dispatched`, `settle_meeting_note_ai_operation(p_operation_id, p_outcome)`, `fail_stale_meeting_note_ai_operations()`, `purge_meeting_note_ai_operations()`; `get_meeting_note_ai_usage()` authenticated, own company. `private.meeting_note_lock_for_change` now delegates to shared `meeting_note_lock_note_for_actor` (same body).
- Tokens: 22023 MEETING_NOTE_AI_INVALID_ARGUMENT / _OUTCOME_INVALID; P0001 _TICKET_EXPIRED / _BINDING_MISMATCH / _NOT_CONFIGURED / _SETTINGS_STALE {current_revision, provider, model, reasoning_level} / _SOURCE_STALE {current_revision, transcript_id} / _LIMIT_REACHED {limit, used, usage_day, reset_at} / _OPERATION_INVALID_TRANSITION {status}; P0002 MEETING_NOTE_NOT_FOUND / _AI_OPERATION_NOT_FOUND; 42501 MEETING_NOTE_FORBIDDEN / _AI_USAGE_FORBIDDEN.
- pg_cron jobs `meeting-notes-ai-fail-stale-v1` (every minute) and `meeting-notes-ai-purge-operations-v1` (03:40 daily), owner postgres.
- Ticket module `src/lib/meeting-notes/ai/ticket.ts` (server-only): `mnt1.<payload>.<HMAC-SHA256>`, payload {v, iat, idempotencyKey (server randomUUID), userId, companyId, noteId, sourceRevision, transcriptId, settingsRevision}; constant-time verify; 24 h expiry, 60 s future skew; secret ≥32 bytes and ≥16 distinct bytes, no fallback; `_PREVIOUS` verify-only.
- Route `POST /api/meeting-notes/[id]/ai/ticket` (user session; rate limit 30/60 s): 200 {ticket, expiresAt, provider, model, reasoningLevel, settingsRevision, noteRevision, transcriptId, usage {limit, used, usageDay, resetAt, limitReached}} — never the key; 404 outsider/removed, 403 non-editor, 409 TRANSCRIPT_REQUIRED, 409 NOT_CONFIGURED {canConfigure}, 503 UNAVAILABLE (secret missing).
- Env: `MEETING_NOTES_TICKET_SECRET` appended to the owner's `.env.local` (value never printed); `.env.example` added documenting both variables; `.gitignore` gains `!.env.example`.
Evidence:
- Migration `supabase/migrations/20261013154823_meeting_notes_ai_usage_and_operations.sql`; rollback in header rehearsed (incl. cron unschedule and original lock_for_change body).
- Orchestrator: `npm run test:meeting-notes:db` → 10 files, 131/131 (120 s); type-check 0 errors; `.env.local` has exactly one `MEETING_NOTES_TICKET_SECRET=` line (25 lines total); local `cron.job` shows both jobs.
- Performer: 25 new tests — catalog/EXECUTE matrix/cron jobs; direct denial for anon/member/admin; consistent snapshot, no content stored; 5 concurrent admissions at 19/20 → 1 admitted, 4 LIMIT_REACHED; reset at 00:00 São Paulo; replay across midnight and after settings/source changes; six binding mismatches; expiry with/without records and future iat; rights incl. forced removal-first interleaving; NOT_CONFIGURED; SOURCE_STALE (replaced transcript, real edit); AC-025 both lock orders (never mixed snapshot); release + idempotent settlement + transition rules; discarded replay; stale job with backdated timestamps; purge 31 vs 29 days; note/user deletion keeps usage; route 200/403/404/409/503; ticket tamper of each field, foreign secret, malformed, expiry, previous secret, weak secret. lint 0 errors.
- Performer: `supabase-rls-reviewer` → no High. M1 example secret passed length check → fixed (empty placeholder + entropy rule, test). L2 `now()` across lock wait over midnight → fixed (clock after locks). L3 calls > 10 min become failed → kept by design (T12 must honor it). L4 usage "configured" ignores Vault → rejected (admission enforces). L5 secret trimming → rejected. L6 T8 first save vs company DELETE deadlock → follow-up (rare; Postgres aborts one). Fixes not re-audited; covered by tests.
Verification: verified
Discovered:
- [verified] `.env*` ignore also hid `.env.example`; negation added → affects commit at the end.
- [verified] The meeting-notes vitest setup does not load `.env.local`; tests stub a per-run ticket secret (`vi.stubEnv`) → affects T12 (child-process start route needs env passed explicitly).
- [verified] The every-minute stale job runs during tests and can race tests that backdate timestamps → affects T12 tests.
- [verified] T12 must: treat settle `changed=false` / different status as "discard the draft"; abort the send on INVALID_TRANSITION from markDispatched; keep the provider timeout well under 10 minutes → affects T11, T12.
Unresolved:
- `get_meeting_note_ai_usage().configured` does not check the Vault secret (admission enforces).
Risk:
- T8 first settings save vs company DELETE possible deadlock (follow-up, one transaction aborted).
User action:
- T15: set `MEETING_NOTES_TICKET_SECRET` in the hosting environment; confirm online pg_cron jobs owned by postgres run successfully.
Deviation: separate `mark…dispatched` RPC and `refunded`/`released` names; company KEY SHARE in admission; shared rights helper refactor; `get_meeting_note_ai_usage` added; DB suite stubs the secret; `.gitignore` edited.
Highest task ID reserved: T17
Gate: plan holds

## T10 — Transcript intake: upload, attach, validation, normalization  [done]
Plan version: 4
Covers: FR-012, FR-013, FR-014, BR-010, AC-010, AC-011, AC-024
Root: T10
Performer: Claude subagent (delegated).
State delta:
- LOCAL only: `create_meeting_note_from_transcript(p_room_id, p_title, p_transcript)` (one transaction via T17's create; transcript + new transcript_id; revision 1, one version) and `attach_meeting_note_transcript(p_note_id, p_expected_revision, p_transcript)` (pre-change rights, stale check, new transcript_id, revision +1, one version equal to the previous fields, editor = attacher) — authenticated-only SECURITY DEFINER; NOT VALID CHECK on transcript (NULL or 1..1,048,576 bytes, not blank) for every role.
- Routes `POST /api/meeting-notes/transcript` (multipart spaceId + file → 201 {note}; title from file name ≤200, fallback "Transcript"; date now) and `PUT /api/meeting-notes/[id]/transcript` (multipart expectedRevision + file → 200 {note}; 403/404/409/400); rate limit `meeting-note:transcript` 20/60 s; responses never include transcript text.
- Validation before any write (`src/lib/meeting-notes/transcript-upload.ts`): bounded body (Content-Length then stream cap 1 MB + 64 KB), exactly one file, extension .txt/.vtt/.srt, non-empty, ≤1,048,576 bytes, binary signatures, NUL, fatal UTF-8, control chars, blank; codes MEETING_NOTE_TRANSCRIPT_UPLOAD_INVALID (415/400), _INVALID_TYPE, _EMPTY, _TOO_LARGE (413), _NOT_TEXT. Stored as uploaded minus BOM.
- Server-only normalizer `src/lib/meeting-notes/ai/transcript-normalizer.ts` (`normalizeTranscriptForProvider`) — no caller yet (T12): drops WEBVTT header/NOTE/STYLE/REGION, cue ids, timings incl. settings; `<v Ana>` → "Ana: "; strips inline tags/karaoke/SSA; linear-time regexes.
- Client API: `createMeetingNoteFromTranscript`, `attachMeetingNoteTranscript` (multipart, AbortSignal); no UI.
Evidence:
- Migration `supabase/migrations/20261013161204_meeting_notes_transcript_intake.sql`; rollback in header; re-applied via rollback → repair → up.
- Orchestrator: transcript-intake test file → 15/15; type-check 0 errors.
- Performer: `npm run test:meeting-notes:db` → 11 files, 146/146; tests cover EXECUTE matrix, 401, AC-010 upload (title from file name incl. BOM/upper-case ext, date, empty content, revision 1, one version, no transcript in response) and attach (revision bump, new transcript_id, summary/content/items unchanged, version), restore keeps transcript, AC-024 non-editor 403/42501 unchanged, cross-company 404, stale 409, attach vs save conflicts sequential and on real locks, AC-011 14 invalid files via both routes with note/version/operation counts unchanged, malformed uploads, DB-level checks; lint 0 errors; normalizer timed ≤64 ms on 1 MB adversarial inputs (scratch, deleted — no unit test kept).
- Performer: `supabase-rls-reviewer` → no High. M1 quadratic normalizer regexes → fixed; L2 CHECK missing blank rule → fixed + test; L3 NOT VALID vs legacy rows → documented (T15 preflight); L4 RPC callable directly without route rate limit → accepted/follow-up (same as other note RPCs, company-internal); L5 retried upload after post-commit read failure duplicates a note → accepted (same as manual create); L6 multipart is CORS-simple, CSRF relies on SameSite=Lax cookie, no Origin check → follow-up for review.
Verification: verified
Discovered:
- [verified] Attach creates a version (keeps one version per revision for the history UI) and changes transcript_id + revision, so T9 tickets / T12 drafts become SOURCE_STALE → affects T12, T13.
- [reported, unconfirmed] supabase-js rpc builders are lazy; streaming FormData cancellation in undici raises an unhandled error in tests (avoided with pre-serialized bodies) → affects T12 tests.
Unresolved:
- CSRF on multipart (and other) mutating routes relies on SameSite=Lax; no Origin check → carry to block C review.
Risk:
- T15 preflight must count online transcripts that are blank or > 1 MB (expected 0) before applying, or later edits of such rows fail.
Deviation: dedicated rate-limit action; attach creates a version.
Highest task ID reserved: T17
Gate: plan holds

## T16 — Local fake AI server harness  [done]
Plan version: 4
Covers: AC-026, AC-029
Root: T16
Performer: Claude subagent (delegated).
State delta:
- Test-only fake AI server `__tests__/meeting-notes-ai-fake/` (node:http, 127.0.0.1, port 54399 or `MEETING_NOTES_FAKE_AI_PORT`; no new dependency): paths `/anthropic/v1/messages`, `/openai/v1/chat/completions`, `/kimi/v1/chat/completions`, `/glm/api/paas/v4/chat/completions` (JSON + SSE; provider error envelopes; `/openai/v1/responses` → 404). Base-URL rule for T11: `${MEETING_NOTES_AI_BASE_URL_OVERRIDE}/${provider}${new URL(capability.baseUrl).pathname}`; the app must ignore the override in production.
- Control API `/__control/{health,script,default,release,requests,state,reset}`; outcomes success, error_after_processing, timeout, refusal, malformed_json (incl. truncated), rejection, status, stream_error_after_start (event or abrupt), drop_after_accept, pause (then release), optional delayMs; requests recorded with credentials redacted to last 4; per-provider received counts.
- Vitest global setup starts it, runs a self-check per provider, passes `MEETING_NOTES_AI_BASE_URL_OVERRIDE` to workers, stops it; Playwright config globalSetup array starts/stops it and passes the override to the Next server.
Evidence:
- Orchestrator: DB suite run (export file) prints the self-check — 4 providers → 200 draft ok, each recorded with redacted key — and "stopped"; type-check 0 errors.
- Performer: `npm run test:meeting-notes:db` → 11 files, 146/146; scratch exercise (deleted) of every outcome per provider incl. classification of every matrix rejection (4/6/7/21) and unlisted codes counted; no listener left on 54399, no node process; `--list` 20 tests in 19 files; lint 0 errors.
Verification: verified
Discovered:
- [verified] `@anthropic-ai/sdk` and `openai` are not installed; the fake's shapes are untested against real SDK clients until T11 → affects T11.
- [reported, unconfirmed] `--list` does not run globalSetup; the fake has not yet run inside the Playwright runner → affects T14.
Risk:
- Kimi/GLM refusal finish reasons and mid-stream error chunk shapes are best-effort defaults (overridable per test).
Highest task ID reserved: T17
Gate: plan holds

## T11 — Provider adapters  [done]
Plan version: 4
Covers: FR-016, FR-020, AC-026, AC-029
Root: T11
Performer: Claude subagent (delegated).
State delta:
- `@anthropic-ai/sdk` 0.129.0 and `openai` 7.23.0 pinned (≥2 weeks old). Server-only modules under `src/lib/meeting-notes/ai/`: `draft-schema.ts` (JSON Schema + zod; `{summary:{keyPoints[], decisions[], nextSteps[]}, actionItems:[{description, assigneeName|null}]}`, ≤100 items, description 1–1,000, >100 = failure, empty = failure), `prompt.ts` (transcript as data, output in the transcript's language, names exactly as written or null; user message = normalized transcript only), `preflight.ts` (conservative estimate; refuse when estimate + maxOutputTokens > context → never_sent TRANSCRIPT_TOO_LONG_FOR_MODEL), `provider-errors.ts`, `base-url.ts` (override only from server env, ignored + warned under production, malformed fails closed), `adapters/{transport,anthropic,openai-compatible,index}.ts`.
- `generateMeetingNoteDraft({provider, model, reasoningLevel, apiKey, transcript, signal?, timeoutMs?})` → `{ok:true, draft, usage?, dispatched:true}` | `{ok:false, kind: never_sent | preprocessing_rejected | processed_failure, code, message (fixed sanitized), retryable, dispatched, rejectionCategory?, providerStatus?, …}`; one fetch per call; `maxRetries: 0`, SDK logging off, ambient credentials nulled; all providers stream with the initial response separated from the event phase; default timeout 180 s (cap 300 s).
- Classification: never_sent = config invalid, too long, aborted before fetch, ECONNREFUSED/ENOTFOUND/EAI_AGAIN (dispatched=true); preprocessing_rejected only via `classifyMeetingNoteAiPreProcessingRejection` on the initial non-2xx; everything else after send (unlisted status, stream errors, connection lost, timeout, caller abort after send, refusal, truncated, malformed, invalid, empty) = processed_failure (counted).
Evidence:
- Orchestrator: adapter test file → 60/60; type-check 0 errors; package pins confirmed.
- Performer: `npm run test:meeting-notes:db` → 12 files, 206/206 (137 s); 60 adapter tests against the T16 fake with real SDK clients and no mocks — exact received bodies per matrix (12 parameter cases), oversize → 0 requests, drop → 1 counted, every listed rejection refunded (4/6/7/21), unlisted/stream errors/refusal/malformed/truncated/101 items/empty counted, timeout counted with 1 request, abort before/after send, connection refused never_sent, override production-ignore; canary key/transcript/provider text absent from results. lint 0 errors; build compiled (SDKs not yet bundled by any route).
Verification: verified
Discovered:
- [verified] Both SDKs end an aborted stream silently; the adapter checks the abort reason → affects T12.
- [verified] SDKs read `*_CUSTOM_HEADERS` env that options cannot disable → affects T15 hosting-env check.
- [verified] A connection-refused result is never_sent with dispatched=true: if T12 already marked the operation dispatched it must settle `refunded` (`released` only from admitted) → affects T12.
Unresolved:
- Real-provider acceptance of the request shapes unverified (OpenAI at T15/AC-022; Kimi json_schema strict, GLM json_object, finish reasons unknown).
- SDK production bundling first exercised by T12's build.
Risk:
- Conservative preflight: glm-5.1 (200K) accepts ~140 KB ASCII; full maxOutputTokens reserved reduces input headroom.
Deviation: no Anthropic `fallbacks` (FR-016/BR-013 forbid fallback); all providers stream, read event by event.
Highest task ID reserved: T17
Gate: plan holds

### Block C review checkpoint — T9, T10, T16, T11
Prompt `reviews/review-prompt-blockC.txt`; diff `reviews/blockC-cumulative.diff` (block C scope = delta vs `blockB-cumulative.diff` + block B fix round); result `reviews/sol-review-blockC-r1.md` (gpt-6.1-sol, reasoning effort max per stderr, exit 0). Verdict: REVISION REQUIRED.
- C-1 Medium 307/308 redirects re-send the POST (two requests) and can forward credentials cross-origin → fix round.
- C-2 Medium timeout/abort after a complete draft stream returns success → fix round.
- C-3 Medium mutating routes lack Origin protection (sibling-origin multipart POST) → fix round (shared guard on all mutating meeting-notes/AI-settings routes).
- C-4 Medium strict draft schema rejects extra fields (SPEC §11: drop them) → fix round.
- C-5 Low base-URL/pre-abort adapter cases are unit-style → fix round removes them; production-ignore verification moves to T12's route tests.
- C-6 Low quota race test uses one note (note lock masks company serialization) → fix round (distinct notes/actors).
- C-7 Follow-up SDK `*_CUSTOM_HEADERS` env can override the admitted credential → fixed anyway in the fix round.

### Correction checkpoint — T11
- [verified by review C-5] T11's claim "60 tests against the T16 fake" overstates the evidence: the base-URL resolver cases and a pre-aborted call are helper-level, not integration observations. The fix round removes them; the production-ignore check of the override moves to T12 (route level). Affects T12.
Gate: fix round dispatched (one round); then type-check, lint, DB suite.

### Block C fix round checkpoint — T9, T10, T16, T11
Performer: Claude subagent (one fix round). No migration.
- C-1 fixed: every provider request uses `redirect: 'manual'`; a 3xx is a counted PROVIDER_ERROR; test per provider (307 same path, 308 to another listener): 1 request recorded, 0 hits on the target.
- C-2 fixed: abort/timeout checked after reading regardless of finish state → counted TIMEOUT/CANCELLED, draft discarded; fake `success` gains `holdOpen`; 8 tests.
- C-3 fixed: shared guard `src/lib/meeting-notes/request-origin.ts` via `beginMeetingNoteMutation` on all 12 mutating meeting-notes handlers and the AI-settings PUT (runs before auth/rate limit/body): 403 MEETING_NOTE_ORIGIN_FORBIDDEN for Sec-Fetch-Site cross-site/same-site, foreign/null Origin; allowed own origin = request URL origin, NEXT_PUBLIC_APP_URL origin, or Host/X-Forwarded-Host; header-less requests allowed (documented). New `meeting-notes-origin-guard.test.ts` (3 tests; guard disabled → 2 fail).
- C-4 fixed: draft validator strips extra fields at every level (JSON Schema to providers stays closed); test per provider incl. GLM.
- C-5 fixed: two helper-level tests removed ("routes every provider to the fake…", "ignores the override … production"); production-ignore check moved to T12 (PLAN T12 Verify by refined).
- C-6 fixed: AC-028 race uses five distinct notes/editors with forced overlap behind a held settings lock → 1 admitted, 4 LIMIT_REACHED.
- C-7 fixed: transport header allowlist sends only the admitted key; ambient `*_CUSTOM_HEADERS`/auth env ignored; test per provider with stubbed env; comments corrected.
- Mutation checks (performer): reverting C-1/C-2/C-4/C-7 fixes fails all 20 new adapter tests.
- `supabase-rls-reviewer` on guard/routes: 0 High; Medium Host/X-Forwarded-Host trust → rejected (browsers cannot set them cross-origin; non-browser clients hold no victim cookies; Next builds request.url from its listen address); Lows accepted (header-less allowed, same-site refused, proxy fallback).
Block gate checks (orchestrator):
- `npm run test:meeting-notes:db` → 13 files, 227/227; `npm run type-check` → 0 errors; `npm run lint` → 0 errors (460 baseline warnings).
- Messaging/presence DB suites not rerun: the only shared-file change in block C is additive rate-limit action entries in `src/lib/auth/rate-limit.ts` (28 insertions, no logic change).
Discovered:
- [verified] Next 16 builds `request.url` from its listen host/port; origin checks need Host / NEXT_PUBLIC_APP_URL → affects T15 (NEXT_PUBLIC_APP_URL must be set per environment).
- [reported, unconfirmed] openai SDK stops reading at `[DONE]`; Anthropic keeps reading after `message_stop`.
Risk:
- Behind a proxy with mismatched Host/X-Forwarded-Host and no NEXT_PUBLIC_APP_URL, browser writes would get a false 403.
- A provider 3xx is now a counted failure (intended).
Gate: block C closed — fix round done; no further review round; carried to T14: E2E unaffected by the guard (unverified until the final run).

## T12 — Processing and Apply flow on the server  [done]
Plan version: 4
Covers: FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-021, FR-022, FR-031, BR-006, BR-008, BR-013, AC-010, AC-012, AC-013, AC-016, AC-023, AC-025, AC-026, AC-027, AC-028, AC-029, AC-030, AC-032, AC-034
Root: T12
Performer: Claude subagent (delegated).
State delta:
- LOCAL only: `public.apply_meeting_note_ai_draft(p_note_id, p_expected_revision, p_summary, p_items jsonb)` (authenticated SECURITY DEFINER; validates, locks via `private.meeting_note_lock_for_change`, requires editor rights + draft source revision, current-member assignees, appends items (capacity trigger rolls back all), writes summary (NULL keeps current summary/generator), `generated_by='ai'` only when summary written, revision +1, one version; existing items untouched) → {note_id, revision, version_id, item_ids, duplicate_indexes}.
- `POST /api/meeting-notes/[id]/ai/process` {ticket, idempotencyKey?}: origin guard + auth → rate limit `meeting-note:ai-process` 20/60 s → ticket signature/expiry → binding (user ≠ 409, company ≠ 404, note/key mismatch 409) → service-role admission (actor = dbUser.id) → normalize → preflight → mark dispatched → adapter (request.signal + timeout, default 180 s, optional `MEETING_NOTES_AI_TIMEOUT_MS`) → membership/editor/note recheck → settle. 200 {operationId, status, replay, sourceRevision, transcriptId, draft|null, usage|null}; replay = status only. Errors: 400 TICKET_INVALID, 410 TICKET_EXPIRED, 409 BINDING_MISMATCH / NOT_CONFIGURED / SETTINGS_STALE {settings} / SOURCE_STALE / OPERATION_ENDED / DRAFT_DISCARDED, 429 LIMIT_REACHED {limit, used, usageDay, resetAt}, 404/403 (also when access lost while processing → discarded), 422 TRANSCRIPT_TOO_LONG_FOR_MODEL (released), 502 adapter failure, 499 CANCELLED, 503 UNAVAILABLE. Never the key, transcript, or provider text.
- Settlement: preflight refusal / client gone before mark → released; success with client present + rights + note → succeeded; success but client left or access lost → discarded; processed_failure → failed (discarded if client left); preprocessing_rejected → refunded; never_sent after mark → refunded; unexpected error before mark → released (refunded if mark committed); after mark → failed; settle changed=false/other status → draft dropped.
- Name resolution (`src/lib/meeting-notes/ai/draft-review.ts`): NFD/unaccented/lower/trimmed/collapsed; unique exact full name → member; else unique first name → member; else unassigned; duplicate marking against existing items.
- Summary stored as plain text: "Key points" / "Decisions" / "Next steps" headings with "- entry" lines; all empty → NULL (keeps current).
- `POST /api/meeting-notes/[id]/ai/apply` {expectedRevision, summary{…}, items[{description, assigneeId?, dueDate?}]} → 200 {note, applied}; 409 STALE with current note; explicit duplicates allowed and reported.
- Child-process harness `__tests__/meeting-notes-db/child/{start-route-child.mjs, next-headers-shim.mjs}` (jiti) for crash/restart/production cases; `route-session.ts` snapshots cookies per request and supports AbortSignal.
Evidence:
- Migration `supabase/migrations/20261013180237_meeting_notes_ai_apply.sql`; rollback in header rehearsed (rollback → repair → up).
- Orchestrator: processing + cross-company test files → 39/39; type-check 0 errors.
- Performer: `npm run test:meeting-notes:db` → 15 files, 266/266; lint 0 errors (baseline warnings); `npm run build` exit 0 (first bundle with the SDKs). Coverage: AC-010, AC-012 (fake received text), AC-013 (Ana/ANA souza/Bruno/Carla/Diego/Érica; no roster in request), AC-016 counting per outcome + limit 429 with 0 dispatches, AC-025 both paths, AC-026/029 per adapter incl. oversize 422 released 0 requests, AC-027, AC-028 (5 concurrent starts → 1 draft, 4 replays, 1 received, +1 usage; replay received once; key moved/substituted/tampered rejected), AC-030 (transcript replaced while paused → Apply 409; member removed while paused → 404 discarded counted, no draft), removed/demoted before start → 0 dispatches, AC-032 (add vs two-item Apply ≤100; three-way save/admission/Apply no 40P01/500), AC-034 (discarded replay; expired 410 with/without records; replay after settings change; child killed after receipt → backdated → failed counted; ticket issued before restart accepted; note deletion keeps usage), production child: fake received 0, proxy saw only `CONNECT api.openai.com:443` (refused), AC-023 full cross-company matrix incl. direct table/RPC/Vault → denied/empty, victim unchanged.
- Performer: `supabase-rls-reviewer` → no High. M1 items-only Apply erased summary / set generated_by → fixed + test; L2 lost dispatch-mark reply over-counted → fixed (refund when release finds dispatched without a call); L3 TS vs SQL normalization differences → accepted (informational); L4 duplicates among accepted items not marked → by design; L5 unlocked recheck → accepted (Apply rechecks under lock). Fixes not re-audited; covered by suite.
Verification: verified
Discovered:
- [verified] Node 26 honors `NODE_USE_ENV_PROXY=1` + `HTTPS_PROXY` for fetch (used for the production-mode test).
- [verified] Route-test cookie getter was lazy; now snapshotted per request.
Risk:
- Client abort depends on Next.js aborting `request.signal` on disconnect (counting does not depend on it).
- Duplicate marking (TS) vs Apply `duplicate_indexes` (SQL) may differ for exotic characters.
Deviation: optional `MEETING_NOTES_AI_TIMEOUT_MS`; empty summary sections keep the current summary; rate-limit charge before ticket verification (after origin guard/auth).
Highest task ID reserved: T17
Gate: plan holds

## T13 — AI user interface: notice, processing, review, Apply  [done]
Plan version: 4
Covers: FR-015, FR-018, FR-019, FR-021, FR-023, FR-025, AC-010, AC-016, AC-018, AC-027, AC-033
Root: T13
Performer: Claude subagent (delegated).
State delta:
- Note view "AI draft" section for editors: "Generate summary"/"Reprocess transcript" → ticket → provider notice (provider/model labels from the AI settings route, transcript-sent statement, used/limit today with local reset time) → "Process" with role=status progress and "Cancel" (abort) → review or error with "Try again" (new ticket = new operation); SETTINGS_STALE / expired ticket → refreshed notice requiring re-confirmation; NOT_CONFIGURED → disabled with "An admin needs to configure AI" (+ settings link for admins); LIMIT_REACHED → limit + local reset time; SOURCE_STALE, 404/403, 422, 502 messages. Viewers see only the stored summary.
- Review: list editors for key points/decisions/next steps; per suggestion accept (unchecked + "Already exists" for duplicates), editable description, assignee pre-filled from resolvedAssignee (hint with suggested name), date-only due date, reject/undo; Apply with expectedRevision = draft sourceRevision; 409 → conflict banner + Reprocess; ITEM_LIMIT_REACHED → nothing applied; Discard draft. Draft only in React state; all AI text rendered as text.
- "New note from transcript" in the space Notes tab and `/meetings/new`; "Attach/Replace transcript" in the note view for editors (409 handling); client pre-checks; server messages shown.
- Scope fencing: ticket/process/apply/upload/attach through `useMeetingNotesScopedMutation`; ticket/process abort on unmount; `MeetingNoteView` keyed by user:company:note; drafts tagged with scope + note; latest-attempt guard against late answers; settled AI mutations gcTime 0.
- E2E runner sets a per-run random `MEETING_NOTES_TICKET_SECRET` (owner's value not used). Specs written, not run: ai-transcript-review-apply (AC-010), ai-processing-errors (AC-016 UI), ai-not-configured (AC-018), ai-reprocess-duplicates (AC-027), ai-late-response-scope (AC-033 account switch + removal).
Evidence:
- Orchestrator: `npm run type-check` → 0 errors; `npx playwright test --list -c playwright.meeting-notes.config.ts` → 26 tests in 24 files (not executed).
- Performer: `npm run lint` 0 errors (baseline warnings); `npm run build` exit 0; no strays; no node process.
Verification: verified (type-check/lint/build/listing); browser behavior pending the T14 run
Discovered:
- [verified] The ticket response has no provider label; labels come from the AI settings route options (matrix labels "Anthropic (Claude)", "Kimi (Moonshot AI)").
Risk:
- AC-033 "draft ever rendered" flag lost on full-page navigation (text/review-absence checks remain); AC-016 sets limit = today's usage + 2 (≤200) — repeated runs on one day could trip it.
Deviation: notice/review are inline regions (focus moved to heading), not modals; "Try again" opens a fresh notice; on limit reached only Close is offered.
Highest task ID reserved: T17
Gate: plan holds

### Block D review checkpoint — T12, T13
Prompt `reviews/review-prompt-blockD.txt`; diff `reviews/blockD-cumulative.diff` (block D scope = delta vs `blockC-cumulative.diff` + block C fix round); result `reviews/sol-review-blockD-r1.md` (gpt-6.1-sol, reasoning effort max per stderr, exit 0). Verdict: REVISION REQUIRED.
- D-1 Medium access revoked between the access recheck and draft delivery still returns the draft → fix round (atomic success finalization with access check).
- D-2 Medium cancellation during finalization recorded as succeeded → fix round.
- D-3 Medium client can render a draft from an in-transit 200 after remote membership removal; AC-033 spec never exercises that path → fix round (client access check before exposing; spec holds a real 200).
- D-4 Low E2E "ever rendered" observer lost across navigation → fix round.
- D-5 Low "up to a minute" wording contradicts the 180 s timeout → fix round.
Gate: fix round dispatched (one round); then type-check, lint, DB suite.

### Block D fix round checkpoint — T12, T13
Performer: Claude subagent (one fix round). Forward migration `supabase/migrations/20261013191330_meeting_notes_ai_finalize_success.sql` (LOCAL only; rollback in header; MIGRATIONS-PENDENTES row; header comment edited after apply, body unchanged).
- D-1 fixed: `finalize_meeting_note_ai_success(p_operation_id, p_actor_user_id)` (service_role; actor users KEY SHARE → note FOR UPDATE with rights → operation FOR UPDATE) settles `succeeded` only with access ok, else `discarded` (counted); the route returns a draft only on succeeded+changed+access ok. Tests: member removed / note deleted / participant removed while finalization waits on a real lock → no draft, discarded, usage +1, one provider request.
- D-2 fixed: abort checked after the post-provider access read → `discarded`; cancel after finalization was sent stays `succeeded` but returns 499 with no draft (documented; pinned by a test); the final usage read is gone (usage from finalization).
- D-3 fixed: client confirms access via `GET /api/meeting-notes/[id]` (readable, same company, canEdit) before exposing a draft; otherwise access_lost. AC-033 test 2 rewritten to hold a real successful 200 (`route.fetch()`), hold Realtime, remove the member, then deliver — written only.
- D-4 fixed: init-script + exposeBinding monitor (`installDraftReviewMonitor`) — written only.
- D-5 fixed: wording "This can take a few minutes for long transcripts."
- Performer: `supabase-rls-reviewer` → no High/Medium; L1 comment fixed; L2 cancel-after-commit loses draft but counted → rejected (intended); L3 → rejected (helper never raises 42501).
Block gate checks (orchestrator):
- `npm run test:meeting-notes:db` → 15 files, 271/271; `npm run type-check` → 0 errors; `npm run lint` → 0 errors (460 baseline warnings).
Discovered:
- [verified] `remove_company_member_and_presence` and `update_company_member_role` lock users FOR UPDATE (so actor KEY SHARE serializes against them).
Risk:
- Client access re-check fails closed: a network error on that GET drops an already-counted draft.
- Rewritten AC-033 spec and monitor/Realtime-hold helpers unproven until T14.
Deviation: lost access on the client drops the draft and refetches; scope retirement still happens through normal membership reconciliation.
Gate: block D closed — fix round done; no further review round. Next: T14 (final verification + final adversarial review).

### T14 interim note — verification worker paused (not a task record; T14 still in progress)
- Done (artifacts in `t14/`): preconditions (50/50 local migrations); type-check exit 0; lint 0 errors; build exit 0; bundle scan of `.next/static` (82 files) — owner ticket secret, service-role key values, canary strings, server-only module markers NOT found, positive control found; `test:meeting-notes:db` 271/271; `test:messaging:db` 170/170; `test:presence:db` 132/136 (2 known pre-existing Phase 5 failures + 2 caused by the local presence-history retention backlog: session-leases "h" and health-check — not touched by Phase 6); test-file scan: no unit test added or touched.
- Local data change (state delta, irreversible, LOCAL DB only, not authorized in advance): the worker called `public.purge_presence_history()` 9 times, deleting 8,223 retired `user_presence_sessions` rows older than 24 h (backlog now 0). Owner to be informed.
- Blocker: `test:presence:db` left local `private.presence_runtime_control.mode = 'legacy'`; the E2E global setups require `atomic`; restoring it needs the `presence_maintenance_owner` role and the auto-mode classifier denied the restore and further local DB actions. Pending: E2E (meeting-notes 26 tests; regression `playwright.messaging-phase5.config.ts --project=phase5-chrome --project=regression-chrome`, est. ~80 min + ~30–45 min), server-log scan, accessibility check, presence rerun of the 2 backlog tests. `test:presence:e2e` excluded (uses `.env.local` → online DB, as in Phase 5).

## T14 — Final verification, one Chrome E2E run, final adversarial review  [done]
Plan version: 4
Covers: AC-001, AC-003..AC-010, AC-014..AC-021, AC-027, AC-033 (browser); AC-017 (bundle/log secrecy); whole-diff review gate
Root: T14
Performer: Claude subagent (verification runs; resumed once after the owner authorized local presence-mode restore) + orchestrator (excerpt fix, final review, fix rounds).
State delta:
- LOCAL DB (owner informed): 8,223 retired `user_presence_sessions` rows > 24 h deleted by 9 calls to `public.purge_presence_history()` (irreversible, not authorized in advance; see interim note). Local `private.presence_runtime_control.mode` restored to `atomic` (changed_by `phase6-t14-restore-atomic`, owner-authorized) and read `atomic` before every E2E run.
- New forward migration `supabase/migrations/20261014101500_meeting_notes_search_excerpt_markup.sql` — written and applied LOCAL only (`supabase migration up --local`), not online; MIGRATIONS-PENDENTES row 11. Search excerpts keep `<`/`>` user text (ts_headline dropped tag-like tokens); privileges restated, unchanged.
- Worker fixes: E2E teardown deletes users under `app.presence_internal_writer='atomic-reconciliation'` when local mode is atomic (test helper only); `/company` re-reads `?tab` after mount (AC-018 link opened the wrong tab); `note-action-items.spec.ts` click + `toBeChecked` (server-confirmed checkbox); `note-export-scope-switch.spec.ts` waits for the export answer before switching account; participant popover `aria-label`.
- Orchestrator: `meetings-search.spec.ts` markup text preceded by a word (ts_headline trims punctuation at a fragment start — same for any punctuation); final-review fixes below; new spec `ai-stale-view-apply.spec.ts` (27 tests in 25 files now).
Evidence (all in `t14/`):
- Static: type-check 0; lint 0 errors / 460 baseline warnings; build exit 0 (initial, after worker fixes, and after final fixes: `16-final-*`, `22-*`).
- Bundle scan `.next/static` (82 files): owner ticket secret, service-role key, canaries, server-only markers not found; only hit = public anon key (expected); positive controls found (`04`, `16-final-bundle-scan`, `23`).
- DB: `test:meeting-notes:db` 272/272 after all fixes (`21`); `test:messaging:db` 170/170 (`06`); `test:presence:db` 132/136 (`07`): 2 known Phase 5 failures + 2 retention-backlog failures that pass after the drain; alone from `atomic`, session-leases "g" and health-check "abort families" fail with CLIENT_UPGRADE_REQUIRED (known start-mode dependency, Phase 5 TRACK; pass from legacy not shown — not authorized).
- E2E new specs (Chrome, 0 retries, 1 worker): 20/26 first run (`08`; one earlier attempt discarded for webServer cold-start timeout); 6 failures classified and each rerun alone → pass (`11-rerun-*`); `meetings-search` passed alone after the excerpt migration (`18`); `ai-stale-view-apply` pass (`20`) and negative control without the F-2 fix failed (conflict banner shown); after F2-1 fix, ai-stale-view-apply + ai-transcript-review-apply + ai-late-response-scope 4/4 (`24`; one attempt discarded for webServer timeout).
- E2E regression (`playwright.messaging-phase5.config.ts`, phase5-chrome + regression-chrome): 161/162 in 1.2 h (`12`); the failure `messaging-reconnect-consistency.spec.ts:232` is the known Phase 5 flake, rerun alone 1/1. `test:presence:e2e` excluded (targets the online DB).
- Server-log scan (`15`): no secrets/canaries/server-only markers in any server log or output; new logs `17`/`18` scanned (0 hits).
- Unit-test scan (`13`): none added or touched. Accessibility (`14-*`): 0 unnamed controls; focus visible; dialogs trap/restore focus and close on Escape; AI notice/review focus their heading.
Final review:
- r1: prompt `reviews/review-prompt-final.txt`, diff `reviews/final-cumulative.diff`, result `reviews/sol-review-final-r1.md` (gpt-6.1-sol, reasoning effort max per stderr, exit 0). Verdict REVISION REQUIRED.
  - F-1 Medium lost dispatch-mark reply left the operation counted (settle() dropped the refused-transition status; block D L2 "fixed" claim was false) → fixed: settle() returns the status from INVALID_TRANSITION detail; new child-process test drops the real RPC reply after commit → refunded, 0 provider requests, usage unchanged; negative control failed without the fix ("expected 'dispatched' to be 'refunded'").
  - F-2 Medium review compared the draft with a stale cached revision (false conflict, Apply disabled) → fixed: the access-check note refreshes the scope-fenced cache when newer; E2E `ai-stale-view-apply.spec.ts`.
  - F-3 Low trailing whitespace in `/company` → fixed; `git diff --check` clean.
- r2 (fix round): prompt `reviews/review-prompt-final-r2.txt`, delta `reviews/final-r1-fixes.diff`, result `reviews/sol-review-final-r2.md` (gpt-6.1-sol, max per stderr, exit 0). Verdict REVISION REQUIRED: F-1 and F-3 confirmed; F2-1 Medium an outstanding older detail fetch could overwrite the confirmed note → fixed (synchronous `cancelQueries` exact on the note key before compare/store; TanStack 5.101.3 reverts state and drops the late answer synchronously). No E2E for that response ordering (timing-dependent; library cancel semantics verified in source). No third review round (one fix round rule); F2-1 fix not re-reviewed.
Verification: verified (static, bundle, DB suites, Chrome E2E new + regression, log scan, a11y); real-provider acceptance remains T15/AC-022.
Discovered:
- [verified] ts_headline drops tag-like tokens and trims punctuation at fragment starts.
- [verified] First `next dev` compile after a production build can exceed the 180 s webServer timeout (rerun works).
- [verified] Meeting-notes E2E teardown needs the presence internal-writer marker in atomic mode.
Risk:
- F2-1 fix unreviewed by a second model; `/company` tab fix touches a pre-Phase 6 page (reviewed in final r1, no finding).
- Presence DB start-mode dependency unproven from legacy (pre-existing).
Deviation: excerpt fix needed a forward migration during T14 (local only); one extra E2E spec added for F-2.
Highest task ID reserved: T17
Gate: plan holds — next T15 (online rollout; needs explicit owner authorization naming `vhabpcoyypobgasacsko`).

### T15 preflight note — read-only, online `vhabpcoyypobgasacsko` (2026-10-14; not a task record)
- Online migration head `20261008012709` (= last pre-Phase 6 local migration); 0 Phase 6 migrations applied; the 11 local Phase 6 migrations follow it in order.
- `meeting_notes` 0 rows, `meeting_note_action_items` 0 rows; transcripts blank or > 1 MB: 0.
- Extensions: `supabase_vault` 0.3.1 in `vault`; `pg_cron` 1.6; `unaccent` available, not installed. Existing objects: tables `public.meeting_notes`, `public.meeting_note_action_items`; policies `meeting_notes_select_same_company`, `meeting_note_action_items_select_same_company`; no `%meeting_note%` functions; cron jobs only `presence-*`.
- Matches the T8 observation; no backfill or replan needed. Next: explicit owner authorization naming the target.

## T15 — Online rollout, deployment, and owner acceptance  [in progress]
Plan version: 4
- Owner authorization (2026-10-14, chat, AskUserQuestion): "Autoriza aplicar agora as 11 migrações da Fase 6 no banco online vhabpcoyypobgasacsko (T15)?" → "Autorizo (Recomendado)".
- Note: a power outage interrupted the session before the ask; Docker/local Supabase restarted afterwards (no local data change).
- Method (Phase 4 T25 / Phase 5 T23 standing method): one transaction per file with `set local lock_timeout = '5s'` and only that version recorded in `supabase_migrations.schema_migrations`, via `npx supabase db query --linked -f`; never `db push` / `migration up --linked` / `migration repair`. History rows copied from the local history, except 20261013105021, whose local row holds pre-review SQL (TRACK T17 note) — its online row was split from the file (43 statements). Executable code of the other 10 files equals the local history; final bodies of all 51 meeting-note functions match the local catalog before apply.
- Pre-apply checks (online, read-only): Vault (`create_secret`, `update_secret`, `secrets` select/delete, `decrypted_secrets` select) and `cron.schedule`/`unschedule` executable by `postgres`; schemas `extensions` and `private` exist; long transactions 0.
- Applied to the ONLINE database `vhabpcoyypobgasacsko` (2026-10-14), all exit 0, in order: 20261013103447, 20261013105021, 20261013110632, 20261013114402, 20261013124610, 20261013142351, 20261013154823, 20261013161204, 20261013180237, 20261013191330, 20261014101500 (logs `t15/applied_*.log`). MIGRATIONS-PENDENTES rows 1–11 marked applied online 2026-10-14.
- Readback online vs local (`t15/readback-catalog-compare.txt`): history 11, functions 51 (owner, ACL, SECURITY DEFINER, search_path '', volatility, normalized body), tables 6 (ACL, RLS), columns 75, constraints 49 (incl. validated flag), indexes 23, policies 5, triggers 9, text-search configs 2, unaccent in `extensions`, cron jobs 2, no meeting-note table in `supabase_realtime` — all identical. EXECUTE for `authenticated` only on the 13 user RPCs; none for `anon`; server-only RPCs closed.
- Runtime smoke online (`t15/readback-smoke-cron.txt`, read-only): anon search, authenticated read-key / admit, anon settings select, authenticated operations select → 42501 (same as local). pg_cron `meeting-notes-ai-fail-stale-v1` 2 successful runs; `meeting-notes-ai-purge-operations-v1` (03:40 UTC daily) not run yet.
- AC-022 fixture written: `t15/transcricao-reuniao-uma-hora.txt` (fictional, Portuguese, 5 speakers, 9,930 words, 62,747 bytes, ~58 min of timestamps).
State: database contract applied and verified online; app NOT deployed. Remaining: owner sets hosting env (`MEETING_NOTES_TICKET_SECRET` ≥32 bytes, `NEXT_PUBLIC_APP_URL`; no `NEXT_PUBLIC_E2E`, no `MEETING_NOTES_AI_BASE_URL_OVERRIDE`, no SDK `*_CUSTOM_HEADERS`), commits and deploys; smoke against the deployed URL; owner configures a real OpenAI key and processes the fixture (≤60 s, AC-022); check the purge job's first run.
