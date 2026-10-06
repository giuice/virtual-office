# SNAPSHOT: phase-4-messaging-timeline
Updated after: TRACK.md "Terminal checkpoint — phase-4-messaging-timeline" (plan version 10, gate: terminal)

## Deliverables
- Local messaging test harness — accepted (TRACK T1)
- Messaging regression suite in local mode — 51 E2E + 44 DB-integration tests (+ opt-in cross-browser voice harness); seeds reuse fixed rooms (no leak), leaked rooms removed (TRACK T28); full runs green, epic-4A waits on concrete Realtime signals (TRACK T29) — accepted
- Online migration baseline — GO single-file / NO-GO db push — accepted (TRACK T2)
- Feed scroll anchoring + coalesced receipt refetch — accepted (TRACK T3)
- Failed-send preservation (text + reply) — accepted (TRACK T4)
- Send idempotency key: retry after a lost response keeps one message — accepted (TRACK T23); online applied (TRACK T25, row 4)
- Per-message receipts server path + unread counter — accepted (TRACK T5); online applied (TRACK T25, row 1)
- anon/authenticated cannot execute mark_conversation_read — accepted (TRACK T24); online applied (TRACK T25, row 2)
- Drawer reports only seen messages (visibility + 50% on screen); legacy mark-all no longer called by the client — accepted (TRACK T6)
- Sender-only readers API + narrowed receipt RLS — accepted (TRACK T7); online applied (TRACK T25, row 3)
- "Lida por N" + live reader list in direct/group/room — accepted (TRACK T8)
- Paginated starred-messages API (no migration) — accepted (TRACK T9)
- Attachment server contract: pending uploads invisible, create with 1–5 files, cancel deletes object, member-only 300 s signed reads; client attachment writes closed — accepted (TRACK T12); online applied (TRACK T25, row 5)
- Composer attachments (picker, drop, paste, progress, cancel/retry, failed-send keeps files) — accepted (TRACK T13, T29)
- Feed attachment previews: all attachments, image thumbnails + lightbox, file cards with download under the original name (route `?download=1`), no client-kept signed URLs — accepted (TRACK T14)
- Voice-note storage contract: audio (webm/mp4) only as voice notes ≤ 120 s with waveform, one per `file` message — accepted (TRACK T15); online applied (TRACK T25, row 6)
- Composer voice recorder (record with live waveform/timer, preview, send/discard, 1:50 warning, 2:00 auto-stop, mic-problem guidance) — accepted (TRACK T16, T30)
- Reconnect catch-up also refreshes open reader lists and starred views — accepted (TRACK T20, T31)
- Phase gates: type-check, lint 0 errors, build, Vitest 1289/1289, RLS review PASS, AC-034/036/037 evidence; Load-more error alert, distinct "Ver na conversa" names, image picker button — accepted (TRACK T21, T32); feed scroll race + group drawer title fixed (T32); owner UAT accepted 2026-10-06 (attested)
- Desktop notifications (explicit opt-in in the drawer; DM/group from others when tab hidden or drawer not on it; never room/own/viewed; denied/unsupported → nothing attempted; once across tabs) — accepted (TRACK T19); owner UAT pending (real OS notification, preview privacy)
- Voice-note player in the feed (stored duration, re-read on expired URL, cannot-play message + download, one at a time); plays in Chrome/Edge/Firefox — accepted (TRACK T18); real Safari pending owner check
- Recording mutes an open room mic (notice) and reopens it at recording end; user choice wins; muted stays muted (TRACK T17) — accepted; owner UAT pending
- Conversation list: refresh indicator no longer shifts rows; whole row selects (TRACK T30) — accepted
- Star/unstar + "Favoritas" starred view in the production feed — accepted (TRACK T10)
- Jump from a starred result to the message in the feed (loads older pages, highlight, notice when unreachable) — accepted (TRACK T11; render race fixed in T29)
- Owner checklist of phase migrations — `MIGRATIONS-PENDENTES.md` (all 6 applied online 2026-10-05; app not yet deployed)

## Open lineages
- Roots T1, T2, T3, T4, T5, T24, T6, T7, T8, T9, T10, T26, T11, T27, T23, T12, T13, T14, T15, T16, T17, T18, T19, T20, T25: closed (done)
- Root T21: closed (done by continuation T32)
- Root T28: closed (done)

## Constraints and decisions affecting remaining work
- Migrations: LOCAL only during the phase; record rollback in TRACK and add a row to MIGRATIONS-PENDENTES.md; all applied online in T25 after owner OK — affects T25 — source TRACK "Replan checkpoint — T5"
- Online method for T25: single file per version, no db push / migration up --linked / broad repair — source TRACK T2
- Phase-end deploy order: migrations online first, then app — MANDATORY since T23 (new app fails every send without `client_message_id`) — affects T25, T21 — source TRACK T5, T23
- Create contract: optional `clientMessageId`; replay → 200 (no insert), reused key with other payload → 409; on replay attachments must not be linked again; composer remount loses the key — affects T12, T13 — source TRACK T23
- Attachment API (T12): `POST /api/messages/upload` → pending id (URL 404 until sent), `DELETE /api/messages/upload/{id}` cancels, create takes `attachmentIds` (1–5), replay set is part of payload; limits in `src/lib/messaging/attachment-policy.ts` (T15 extends; browser-safe); upload rate limit now 30/min (T13) — affects T13, T14, T15, T16 — source TRACK T12
- Communicate with the owner briefly (2–4 lines + one plain decision) — all handoffs — source owner feedback 2026-10-04
- Drawer does not auto-open on received DMs — affects T6, T19 — source TRACK T22
- Default seed: secondary starts with 1 unread DM — affects T6, T19 — source TRACK T22
- Cancelling invalidation remains only for reaction DELETE (image/file INSERT now uses non-cancelling scheduleFeedRefetch since T13); the jump search survives it — affects T16, T18 — source TRACK T3, T11, T13
- Fixtures must set users.company_id at insert or use company functions; last_read_at set at membership creation — affects integration tests — source TRACK T1, T5
- Sends are one at a time; composer new strings Portuguese, old English — affects T13, T16, T21 — source TRACK T4

- Any future DROP+CREATE of mark_conversation_read must repeat the revoke (default privileges re-grant anon) — source TRACK T24

- "Tab in focus" = foreground tab (visibilityState), not window focus — note for owner UAT — source TRACK T6
- Group/room reopen resends visible ids once per session (idempotent) — affects T8 — source TRACK T6

- Realtime (re)join catch-up: on the postgres_changes-ready system event the conversation list and every cached feed refetch once; stale in-flight feed fetches can no longer drop a saved message (keepMessageThroughInflightFetch) — affects T11, T20 — source TRACK T26
- `data-messaging-realtime-ready` (SUBSCRIBED) precedes postgres_changes readiness; E2E must not assume events flow at SUBSCRIBED — affects T19, T20 — source TRACK T26
- Local-mode failure artifacts retained (trace/video retain-on-failure); login fixture resubmits once only on token-request transport failure — source TRACK T26

- Feed error screen only when nothing loaded; a failed manual "Load more" now fails silently (retry by pressing again) — AC-037 usability in T21 — source TRACK T11
- Each "Ver na conversa" button has the same accessible name — AC-037 review in T21 — source TRACK T11
- After a Docker restart, local Kong may need a restart (502 on Auth) — local environment — source TRACK T11

- Pin menu entry is a no-op in the production feed and English (mixed copy with Portuguese star entries) — AC-037/usability in T21 — source TRACK T10

## Unresolved
- Owner follow-ups list (pin no-op, toaster overlap, upload cap, rate-limit fail-open, attachment content checks, mark_conversation_read membership, get_unread_counts anon, cursor validation, seed route guard, reload restore, row reorder, storage orphans, <400 px) — REPORT — source TRACK T21
- Online DB `vhabpcoyypobgasacsko` has all 6 phase migrations (TRACK T25); new app NOT deployed — owner deploys after UAT (accepted T32); rollback order app first; PITR disabled — source TRACK T25
- Storage-level online checks (upload 415, audio/mpeg refused, upload→create→cancel) need the new app against production — T21 — source TRACK T25
- Late Realtime INSERT of a pre-existing message: notifications suppressed via first-list `lastActivity` baseline; list unread briefly +1 until refetch (self-correcting) — source TRACK T31
- Stars have no Realtime event (cross-session star sync only on refetch); `setOffline` does not close WebSockets — owner/UX note, test note — source TRACK T20
- Token refresh recreates the room audio manager (muted/not joined) — pre-existing, owner/T21 note; "M" shortcut toggles room mic from drawer buttons — pre-existing — source TRACK T17
- Conversation rows select on any non-control click; new row controls must be buttons/links/`[role=button]` or `data-avatar-interactive`; rows can still reorder on data change during refetch — T21 usability — source TRACK T30
- Voice specs need `channel: 'chromium'` (headless shell has no media capture); WebM has no duration header, feed player must use stored duration — affects T17, T18 — source TRACK T16
- Owner decision 2026-10-06: notification body may show full text; "Favoritas" stays per-conversation (hard to find; cross-conversation view = later scope) — source TRACK T32
- Local global setup: intermittent HTML 404 on first `DELETE /api/test/messaging/seed` (2/~15 runs) — AC-031 run reliability — source TRACK T19
- Saved active conversation never restored after reload (pre-existing) — T21 usability — source TRACK T19
- Owner UAT: real Safari (macOS) voice playback not run; Playwright WebKit on Windows plays no audio at all — source TRACK T18
- Full suite ran ~40% slower in T18 run (machine load, unconfirmed); attachments bucket orphans 563 — AC-031 watch, T21 hygiene — source TRACK T18
- Voice API for T16: upload `kind=voice` + `duration` (≤ 120.000 s, clamp) + `waveform` (1–256 in [0,1]); create with one voice id; `VOICE_NOTE_RECORDER_MIME_TYPES` preference order; voice renders as a file card until T18 (use `isVoiceNoteAttachment`) — affects T16, T18 — source TRACK T15
- T25 row 6 checks: T12 first; bucket/storage.objects policies; legacy-audio-row query = 0; post-apply convalidated + smoke — source TRACK T15
- Voice duration is a client claim (size-bounded, no decode) — T21 security review — source TRACK T15
- Local storage hygiene: 201 orphan attachment objects + 1 leftover outsider auth user — T21 — source TRACK T15
- Thumbnails fetch original files (≤10 MB, no optimizer) — performance note for T21 — source TRACK T14
- supabase-js signed-URL `download` option double-encodes non-ASCII names; use `signAttachmentUrl({downloadName})` — affects T18 — source TRACK T14
- T25: verify online pg_policy set on message_read_receipts before/after (extra permissive policy would keep the leak) — source TRACK T7
- Online-only user-uploads bucket + avatar policies; attachments still have no storage policies (T12 kept it so; service-client access) — affects T15 — source TRACK T2, T12
- T25 online pre-checks for row 5: messages check-constraint name, pg_policy on messages/message_attachments + grants, no published client using upload `messageId`; post-apply 42501 checks + upload smoke — source TRACK T12
- Other specs still wait on floor-plan networkidle (pass, larger budgets); one ECONNRESET at dev-server start seen once in a probe — AC-031 watch, T21 test-quality — source TRACK T29
- Watch: rare flakes after migration re-apply (message-readers Realtime fixed-sleep DB test; one E2E reload timeout) — AC-031, T20/T21 — source TRACK T12
- Pending uploads have no per-user count/byte cap; rate limit fails open if `check_rate_limit` RPC is missing online — T25 check, T21 security review — source TRACK T13
- `composer-image-button` is a no-op (pre-existing) — T21 usability — source TRACK T13
- Online-mode seeding uses a persistent company — online test runs only — source TRACK T1
- Archived conversation unread excluded from trigger badge — informational — source TRACK T22
- Toaster overlaps drawer composer for real users — AC-037 review in T21 — source TRACK T22
- Provenance of historical migration versions unreconciled (non-blocking) — source TRACK T2



- Local test rooms: seeds reuse `Test Space Fixed N`; 0 leaked (TRACK T28); presence test-data deletes only via the Presence E2E fixture marker pattern, transaction-local, owner-approved — source TRACK T28
- PostgREST embedded ordering verified locally only (v12.2.3) — smoke online in T25/T21 — source TRACK T9

## Coverage pointers
- FR-004/FR-006/AC-004/AC-005/AC-007 (server part), AC-032 (T5 local) — TRACK T5; client part — TRACK T6
- FR-024/AC-029 (text + reply) — TRACK T4; idempotency — TRACK T23 (files T13); AC-032 local for T23 migration — TRACK T23
- AC-006/AC-025 (feed part) — TRACK T3
- AC-031 baseline, AC-036 — TRACK T22, T3; AC-031 suite reliability — TRACK T26
- FR-020/FR-021/AC-023/AC-024 — TRACK T9, T10; FR-022/AC-025/AC-026 — TRACK T11; AC-037 (starred UI part) — TRACK T10, T11
- AC-035 (T24, T7, T9, T23, T12 local) — TRACK T24, T7, T23, T12
- FR-008/FR-010/FR-011, AC-009/AC-010/AC-013/AC-015 (server part) — TRACK T12
- FR-007/FR-008/FR-009/FR-012/FR-024 (files), AC-008/009/011/012/016/029/037 (composer part) — TRACK T13, T29; AC-031 with attachments — TRACK T29
- FR-011, AC-014/AC-015 (feed part) — TRACK T14
- FR-018, AC-021, AC-032/AC-035 (T15 local) — TRACK T15
- FR-013/FR-014/FR-017, AC-017/AC-018/AC-020 (recorder), AC-031 with voice — TRACK T16, T30
- FR-016, AC-019 — TRACK T17
- FR-023, AC-027/AC-028 — TRACK T19, T31
- FR-025, AC-030 — TRACK T20, T31
- FR-015/FR-019, AC-017 (player), AC-022 (Chrome/Edge/Firefox; Safari pending) — TRACK T18
- FR-001/FR-002/FR-003/FR-005, AC-001/002/003/006 — TRACK T7, T8; AC-037 (receipts UI part) — TRACK T8
- AC-032/AC-033 baseline — TRACK T2 (online application due in T25)
