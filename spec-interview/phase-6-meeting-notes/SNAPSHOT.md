# SNAPSHOT: phase-6-meeting-notes
Updated after: TRACK.md "T15 — Online rollout, deployment, and owner acceptance [in progress]" (plan version 4)

## Deliverables
- Migrations applied LOCAL and ONLINE `vhabpcoyypobgasacsko` (2026-10-14, catalog identical): `20261013103447`, `20261013105021`, `20261013110632`, `20261013114402`, `20261013124610` (block A closed); `20261013142351_meeting_notes_ai_settings.sql` (block B closed); `20261013154823_meeting_notes_ai_usage_and_operations.sql`, `20261013161204_meeting_notes_transcript_intake.sql` (block C closed); `20261013180237_meeting_notes_ai_apply.sql`, `20261013191330_meeting_notes_ai_finalize_success.sql` (block D closed); `20261014101500_meeting_notes_search_excerpt_markup.sql` (T14)
- Notes/items/search/export/AI-settings routes, repository, types, sanitizer, Markdown converter — blocks A and B closed
- UI: space Notes tab, `/meetings`, `/meetings/new`, `/meetings/[id]` (editor, conflict, history, delete, items, export), company AI settings section — block B closed
- Ticket module + ticket route + operations repository; transcript upload/attach routes + normalizer; fake AI server harness; provider adapters (@anthropic-ai/sdk 0.129.0, openai 7.23.0) — block C closed
- Origin guard `src/lib/meeting-notes/request-origin.ts` on all mutating routes — block C closed
- Process/apply routes, processing orchestration, draft review; AI UI (notice, processing, review, transcript upload/attach) — block D closed
- `__tests__/meeting-notes-db/` — 15 files, 272/272
- E2E runner `playwright.meeting-notes.config.ts` + 27 tests in 25 files — all pass in Chrome (T14)
- `MIGRATIONS-PENDENTES.md` — 11 rows, all applied online 2026-10-14 — current
- AC-022 fixture `t15/transcricao-reuniao-uma-hora.txt` (9,930 words)

## Open lineages
- Roots T1, T17, T2, T3, T4, T5, T6, T7, T8, T9, T10, T16, T11, T12, T13, T14: attempt 1/3 each, all done, blocker none
- T15 in progress: migrations applied/verified online; app deploy + AC-022 owner test pending

## Constraints and decisions affecting remaining work
- Lock order: actor users FOR KEY SHARE → AI settings row → note FOR UPDATE → items; never FOR SHARE on users — affects T9, T12 — source TRACK.md "Correction checkpoint — T17"
- Note RPCs need the user session; create needs a space; update has no summary — affects T10, T12 — source TRACK.md T17
- Apply appends items under the note lock; capacity trigger raises LIMIT_REACHED; READ COMMITTED — affects T12 — source TRACK.md T2
- Routes: service-role client only for enforceRateLimit; route-test cookie jar global (sequential calls) — affects T9–T12 — source TRACK.md T3
- AI settings: key only via `read_meeting_note_ai_key` (NULL = not configured); matrix in `src/lib/meeting-notes/ai/capabilities.ts`; GLM json_object only; `AI_SETTINGS_PATH` for T13 — affects T9, T11, T12, T13 — source TRACK.md T8
- Item descriptions/summary/transcript render as text; URL scheme + query keys; E2E fixtures notesWorld — affects T13 — source TRACK.md T5, T6, T7
- Online target facts: vault in `vault`, pg_cron installed, unaccent available, 0 legacy rows — affects T15 — source TRACK.md T8
- Search migrations rewrite meeting_notes under ACCESS EXCLUSIVE: quiet window at T15 — source TRACK.md block A fix round
- Client scope fence (`scope-fence.ts`, `useMeetingNotesScopedMutation`, `MeetingNotesScopeBoundary`): every new meeting-notes write/AI request must use it — affects T13 — source TRACK.md block B fix round
- Rejection classifier `classifyMeetingNoteAiPreProcessingRejection` (exact matches, error envelope required) — affects T11, T12 — source TRACK.md block B fix round
- T12 contract with T9: replay → status only; markDispatched INVALID_TRANSITION → abort send; settle changed=false → discard draft; provider timeout ≪ 10 min; stub secret in tests; cron races backdated tests — affects T11, T12 — source TRACK.md T9
- T12 normalizes the raw stored transcript before sending; attach makes tickets/drafts SOURCE_STALE — affects T12, T13 — source TRACK.md T10
- Fake AI server: override env + base-URL rule; control client — affects T11, T12, T13 — source TRACK.md T16
- Adapter result kinds: never_sent (release; refunded if already marked dispatched), preprocessing_rejected (refund), processed_failure (counted); SDKs end aborted streams silently — affects T12 — source TRACK.md T11
- All new mutating routes must use `beginMeetingNoteMutation` (origin guard first) — affects T12 — source TRACK.md block C fix round
- T13 consumes ticket/process/apply routes and error codes; Try again = new ticket — affects T13 — source TRACK.md T12
- T14 done (final review r1+r2, fixes F-1, F-2, F-3, F2-1); T15 authorized and migrations applied — source TRACK.md T15
- Local DB: 8,223 retired presence sessions purged (owner informed); local presence mode atomic — source TRACK.md T14

## Unresolved
- `.env.local` sets NEXT_PUBLIC_E2E=true (pre-existing): cache probe active locally; hosting env must not set it — affects T14, T15 — source TRACK.md block B fix round
- F2-1 fix (cancel outstanding note fetch) not re-reviewed by a second model — source TRACK.md T14
- Presence DB start-mode dependency (pre-existing) unproven from legacy — source TRACK.md T14
- Matrix model IDs to re-check at T15; Vault grants for `postgres` to re-read online — source TRACK.md T8
- T15: set MEETING_NOTES_TICKET_SECRET in hosting env; verify online pg_cron job runs; hosting env must not set SDK *_CUSTOM_HEADERS — source TRACK.md T9, T11
- Real-provider acceptance of request shapes unverified (OpenAI at T15; Kimi/GLM unknown) — source TRACK.md T11
- T15: NEXT_PUBLIC_APP_URL must be set per environment (origin guard) — source TRACK.md block C fix round
- Follow-up: T8 first settings save vs company DELETE deadlock (rare) — source TRACK.md T9
- T15 preflight: count online transcripts blank or > 1 MB (expected 0) — source TRACK.md T10
- T2 rollback must restore T17 authorize body — affects T15 rollback notes — source TRACK.md T2
- postcss high advisory (pre-existing) — affects T14 — source TRACK.md T3
- Search: offset pagination shift; ts_headline cost; PT plural stemming; single-language stop-word exclusions — source TRACK.md T4, block A fix round
- Pre-existing: DELETE /api/spaces lacks admin check [reported] — owner follow-up, outside SPEC — source TRACK.md T5
- Messaging DB suite one unidentified failure on first run (rerun clean) — source TRACK.md block A fix round

## Coverage pointers
- AC-020, AC-021, AC-023 (DB), AC-031 — TRACK.md T1
- AC-002, AC-004..AC-007, AC-021 — TRACK.md T17
- AC-008, AC-009, AC-021, AC-032 (DB) — TRACK.md T2
- AC-002..AC-005, AC-008 (routes) — TRACK.md T3
- AC-014 — TRACK.md T4 + block A fix round
- UI specs (unrun): AC-001, AC-014, AC-015, AC-020 — T5; AC-003..AC-007, AC-021 — T6; AC-008, AC-009, AC-019 — T7; AC-017, AC-018 — T8
- AC-019, AC-003 export (integration) — TRACK.md T7
- AC-017, AC-023 settings (integration) — TRACK.md T8
- AC-016, AC-025, AC-028, AC-034 (DB side) — TRACK.md T9
- AC-010 (intake), AC-011, AC-024 — TRACK.md T10
- AC-026, AC-029 (adapter classification) — TRACK.md T16, T11
- AC-010, AC-012, AC-013, AC-016, AC-023, AC-025..AC-030, AC-032, AC-034 (server) — TRACK.md T12
- Browser evidence for all UI ACs, AC-017 secrecy scans, final review — TRACK.md T14
