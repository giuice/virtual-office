# PLAN: phase-5-messaging-resilience

Spec: ./SPEC.md
Goal: In the production messaging drawer, no message a user sends is lost or duplicated across network and Realtime outages, reloads, several tabs, account changes, and several devices; typing, unread/read state, and @mention notifications stay live and correct; and messaging health is observable through redacted logs — without regressing existing messaging.
Plan version: 1
Highest task ID reserved: T23

## Standing rules for every task

- **Migration rule (BR-014, AC-034):** during the phase a migration is done when it is written, applied to the LOCAL database, its tests pass, it is additive/backward compatible with the hosted pre-Phase-4 build and the Phase 4 build (§10), and its rollback SQL is recorded in the migration header and TRACK. Each one gets a row in `spec-interview/phase-5-messaging-resilience/MIGRATIONS-PENDENTES.md`. Nothing is applied online before T23.
- **Online application method (T23 only):** the Phase 4 method (Phase 4 TRACK T2/T25): re-check `npx supabase migration list --linked` and the target catalog immediately before; apply only each reviewed file's SQL transactionally and record only its version; read back by statement hash plus catalog objects; smoke-check. Never `supabase db push`, `migration up --linked`, or broad `migration repair`.
- **Supabase/RLS review gate (AC-035):** every migration, RLS/Realtime policy, repository, and API route change passes the `supabase-rls-reviewer` audit (users.id vs supabase_uid, server client + `auth.getUser()`, service role never replacing membership checks) before the task is done.
- **Adversarial review gate (AGENTS.md):** each task's diff gets the cross-model adversarial review (direct Codex CLI, `gpt-6.1-sol`, effort `max`, read-only, per `delegation-anthropic.md`) before it is recorded done; findings fixed or rejected with reasons in TRACK.
- **Test policy (BR-015, AC-036):** integration tests against local Supabase/Realtime/real routes and Playwright E2E only (`playwright.messaging-local.config.ts`, local Supabase); no unit tests; a touched unit test is replaced and deleted, recorded in TRACK. A new E2E spec counts only after 3 consecutive passing runs in Chrome and in Edge. Network shaping only (SPEC §15); no mocked Supabase, repositories, or code under test.
- **Regression (FR-032, AC-033):** every task that changes server or drawer behavior ends with the messaging DB integration suite and the messaging regression E2E suite passing locally, plus type-check and lint.
- **Presence touch points:** any change near sign-out or Realtime lifecycle follows the `presence-safety` skill; the Presence logout sequence is unchanged.

## Observations grounding this plan (2026-10-06)

- Local Supabase answers at `127.0.0.1:54321` (HTTP 200). Messaging DB suite `__tests__/messaging-db/*` (`vitest.messaging-db.config.mts`) and local E2E (`playwright.messaging-local.config.ts`, project `messaging-drawer`, forces local Supabase env) exist from Phase 4.
- Create route (`src/app/api/messages/create/route.ts`): `clientMessageId` optional; repository `createWithClientKey` dedupes on unique index `(sender_id, conversation_id, client_message_id)` (migration `20261005000414`); no attempt generation, no fence/lookup route, no expected-sender field. `enforceRateLimit(…, 'message:create')` (30/min, `check_rate_limit` RPC, fails open) runs for every request after the participant check, so replays consume the insertion quota today (FR-008 gap). Replay comparison covers content, type, reply target, attachments — no mentions (no mention concept exists in `src`).
- `Message` type and feed/Realtime mappings expose no `clientMessageId` (grep of `src/types` empty) → FR-034 gap; optimistic matching is content/time based.
- `mark_conversation_read(uuid, uuid)` is SECURITY DEFINER, executable only by `service_role` since `20261004170724`, with no internal membership check; `get_unread_counts` still has Supabase default `anon` EXECUTE → FR-029/FR-030 gaps confirmed.
- Typing (`src/hooks/useConversationPresence.ts`): broadcast `typing` on public channel `conversation:{id}`; local stops after 2 s idle, remote TTL 4 s; payload carries the Supabase auth uid and display name → FR-017..020 gaps confirmed.
- Realtime: `useMessageSubscription` exposes `connectionStatus` and backoff for the messages channel; `useConversationRealtime` (73 lines, channel `conversations-changes`) has no backoff/health. No polling anywhere. No IndexedDB/BroadcastChannel use; Web Locks only in `src/lib/messaging/desktop-notifications.ts` (Phase 4 cross-tab claim).
- Drawer (`MessagingContext.tsx`): active conversation ID persisted in global `localStorage` (not per user); open flag not persisted → FR-031/BR-016 gap.
- Sign-out: `useAuth().signOut` (`AuthContext.tsx:181`) called from `dashboard-header.tsx` and `enhanced-user-menu.tsx` — the in-app entry points for FR-013.
- None of these contradicts the SPEC; every SPEC premise checked holds.

## T1 — Phase 4 database follow-ups closed
Reasoning: Two independent Phase 4 findings on read RPCs; smallest DB slice, validates the local migration/review/test loop for the phase.
Task: `mark_conversation_read` refuses (no read-state or receipt change) when the user is not a member of the conversation, for every role that can execute it; `get_unread_counts` is not executable by `anon` while authenticated members keep correct counts. One local migration with rollback SQL; existing callers unchanged.
Done when: Both behaviors hold on the local database and existing read/unread flows still work.
Verify by: New messaging DB integration tests for AC-030 and AC-031 pass; messaging DB suite and regression E2E pass; RLS review gate recorded.
Covers: FR-029, FR-030, AC-030, AC-031, AC-035
Root: T1
Depends on: —

## T2 — Server attempt and sender fencing with key correlation
Reasoning: Every outbox guarantee (exactly once, no late duplicate, no cross-user send) rests on a server contract that does not exist yet; it must be proven at integration level before any client queue relies on it.
Task: The create route accepts an attempt generation and an expected sender for keyed creates; it commits only when the generation is current for (sender, conversation, key) at commit time and rejects a sender mismatch without storing. A new fence/lookup route, for the caller's own key only, atomically returns the stored message or makes every lower generation unable to commit, rejects older generations, never creates a message, and rejects anon and other users' keys. The original submitted composition is stored for replay comparison. Create and fence responses carry `clientMessageId`; outcome codes follow BR-005 (403 `NOT_PARTICIPANT` incl. missing conversation, 400, 413, 409, stale-generation). Unkeyed legacy creates and existing route/RPC signatures keep working.
Done when: AC-044 (server part) and AC-045 cases (a)–(c) hold against local Postgres and the real routes, with at most one stored message per key in every case.
Verify by: New messaging DB integration tests for AC-044 (crafted mismatched sender, anon fence, other-user key), AC-045 (row-lock-blocked insert, held stale request, stale fence), and AC-046 server status codes pass; legacy unkeyed create test passes; RLS review gate recorded.
Covers: FR-006, FR-011, FR-034, BR-001, BR-004, BR-005, AC-044, AC-045, AC-046, AC-035
Root: T2
Depends on: —

## T3 — Create and fence request budgets
Reasoning: D1 makes replays quota-free, which needs separate budgets so retries cannot become unlimited traffic; distinct outcome from fencing.
Task: The insertion quota is charged only for a winning insertion (once among concurrent same-key requests; never more stored messages than the quota at the boundary with distinct keys); every create request consumes a per-user request budget; fence/lookup calls consume their own per-user budget; any exhausted budget returns 429.
Done when: The AC-009 route-level clauses hold on the local database.
Verify by: Messaging DB integration tests for each AC-009 route clause (replay does not reduce quota; replays/validation failures/quota losers consume the request budget; fence budget independent; concurrent same-key charges once; concurrent distinct keys at the boundary) pass; RLS review gate recorded.
Covers: FR-008, AC-009, AC-035
Root: T3
Depends on: T2

## T4 — Server-validated atomic mentions
Reasoning: Mentions must be stored with the message and compared on replay; this is a data contract the composer and notifications consume.
Task: A mention store holds application user IDs mentioned by a message, written in the same transaction as the first creation, only for conversation members at that time other than the sender; requested mention IDs are part of the stored original composition (changed mentions on replay → 409; unchanged replay after a recipient left returns the stored message); only conversation members can read mention records; no client can insert/update/delete them; messages fetched by members carry their mention IDs.
Done when: The AC-024 server clauses and the AC-046 replay clause hold on the local database.
Verify by: Messaging DB integration tests (non-member and self IDs store nothing, changed-mention replay 409 with no change, forced mention-storage failure stores neither message nor mention, anon/non-member read denied, direct client writes denied, unchanged replay after removal returns stored message) pass; RLS review gate recorded.
Covers: FR-024, BR-010, AC-024, AC-046, AC-035
Root: T4
Depends on: T2

## T5 — Members-only private typing topic
Reasoning: Typing privacy is enforced by Realtime authorization in the database, independent of the indicator UI.
Task: A private Realtime topic per conversation whose join and broadcast send are authorized only for current members (`users.supabase_uid = auth.uid()::text` → `users.id` membership); anon clients, authenticated non-members, and the public topic name receive no typing events and cannot send events members receive; existing private topics (Presence, screen share) are unaffected.
Done when: The AC-019 integration clauses hold with real local Realtime.
Verify by: Messaging DB/Realtime integration test: anon, outsider, and public-topic clients get no events and cannot inject; member receives member's signal; Presence realtime integration suite still passes; RLS review gate recorded.
Covers: FR-019, BR-009, AC-019, AC-035
Root: T5
Depends on: —

## T6 — Redacted messaging metrics route
Reasoning: The server side of G7 is a self-contained, security-relevant contract (auth, bounds, redaction).
Task: An authenticated, per-user rate-limited route accepts batches of at most 50 events and 16 KB, only closed event/reason enums, bounded numeric fields, and conversation type; drops anything else; adds a server-derived app version; writes structured log lines containing only BR-013 fields; rejects unauthenticated requests without logging a metric line.
Done when: The AC-028 route clauses hold against the real route.
Verify by: Integration test against the real route capturing log output: valid batch logged with enums/version only; unknown fields, free text, out-of-range numbers, forged version absent from logs; > 50 events or > 16 KB rejected; rate limit rejects; unauthenticated rejected with no metric line; RLS/route review gate recorded.
Covers: FR-027, BR-013, AC-028, AC-035
Root: T6
Depends on: —

## T7 — Client correlation by clientMessageId
Reasoning: Every pending/stored match in the outbox and across tabs depends on key-based correlation; it is observable on its own (AC-050).
Task: The sender's representations of a message (create/fence responses, feed fetches, Realtime events, optimistic items) carry `clientMessageId`; the feed matches pending items to stored messages only by that key in every sender tab.
Done when: AC-050 holds: identical texts (one plain, one reply) with Realtime arriving before HTTP show as exactly one bubble each in both of A's tabs throughout.
Verify by: New E2E spec for AC-050 passes 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-034, AC-050
Root: T7
Depends on: T2

## T8 — Durable single-tab outbox with ordered automatic delivery
Reasoning: The core of G1: write-before-dispatch, persistence across reload/close, ordered automatic drain; failure classes come next.
Task: Every eligible text/reply send is written to a per-user IndexedDB outbox (key, conversation, content, reply target, requested mention IDs, send time, window start, order, state, generation) before dispatch and before the composer clears; pending items render with a text label; items drain automatically per conversation in order when connectivity returns; confirmed items become the normal message; the outbox survives reload and tab close; attachments/voice are never queued (Phase 4 behavior kept); if the outbox write fails or storage is unavailable, nothing is dispatched and the text and reply stay with the D5 message.
Done when: AC-001, AC-002, AC-004, AC-011, AC-039, and AC-040 hold in the real UI.
Verify by: New E2E specs for those ACs pass 3 consecutive runs in Chrome and Edge (offline context, held request + tab close, IndexedDB disabled and failing writes); regression suites pass.
Covers: FR-001, FR-002, FR-003, FR-010, FR-033, BR-002, BR-003, AC-001, AC-002, AC-004, AC-011, AC-039, AC-040
Root: T8
Depends on: T7

## T9 — Outbox outcome handling: unknown, definitive, rate limit, expiry
Reasoning: Distinct outcome from the happy path: classifying every response per BR-005 and resolving unknown items through the fence without loss or duplicates.
Task: Responses are classified per BR-005: transient (offline, 429, 401 with valid session) retried automatically in order; unknown (network error/timeout, 5xx after reach, lease end) fenced before any cancel, expiry, or redispatch; definitive failures show text with "Tentar de novo"/"Apagar" and block later items of that conversation only; 409 retry resends under a new key; items not stored 24 h after send become "expirada" without auto-send, while a fenced-stored item resolves as delivered; manual retry of an expired item keeps the key and opens a new 24 h window; cancel is offered only for items known not stored and not dispatched.
Done when: AC-003, AC-007, AC-008, AC-009 (drawer clause), AC-010, AC-038, AC-042, AC-043, and AC-046 (drawer clauses) hold in the real UI with real routes.
Verify by: New E2E specs for those ACs (dropped response after pass-through, gateway 5xx after pass-through, local quota exhaustion with 12 items, removed room access, test-controlled clock for expiry) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-002, FR-005, FR-006, FR-007, FR-008, FR-009, BR-005, BR-006, BR-007, AC-003, AC-007, AC-008, AC-009, AC-010, AC-038, AC-042, AC-043, AC-046
Root: T9
Depends on: T3, T8

## T10 — Cross-tab outbox ownership and leases
Reasoning: Multi-tab exactly-once and ordering (R1-q16 B) is a separate failure surface from single-tab delivery.
Task: All tabs of the same user share the outbox and show each item once; per conversation only the oldest unresolved item is eligible and one tab holds an atomic drain claim (lease: request timeout 30 s, lease 45 s) that ends on tab close/crash or expiry, after which another tab fences and resumes; on connectivity return a pre-outage attempt is superseded immediately under a new generation; no two create requests of one conversation overlap across tabs; cancel is atomic against claims and propagates to every tab.
Done when: AC-005, AC-006, AC-041, and the AC-045 E2E cases hold with two real tabs.
Verify by: New E2E specs (two tabs, held create, tab close, hung lease, simultaneous online, cancel/claim race, network-log overlap check) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-004, FR-005, BR-003, BR-007, AC-005, AC-006, AC-041, AC-045
Root: T10
Depends on: T9

## T11 — Identity fencing and session-end hold
Reasoning: Shared-browser and account-switch safety (R1-q16 A) is its own guarantee across all tabs.
Task: Before every dispatch and fence the authenticated application user must equal the item owner; an identity change or sign-out in any tab stops drains in all tabs; late create/fence/lookup responses after a switch, or older-generation/cancelled-item responses under the same identity, are discarded without changing any view, item, or claim; items are held (not failed or deleted) only when the client auth state reports the session ended, and drain after the same user signs in again; another user never sees, sends, or deletes them; a 401 with a valid client session stays transient.
Done when: AC-012, AC-044 (client clauses), and AC-047 (switch and same-identity clauses) hold in the real UI.
Verify by: New E2E specs (session cleared/refresh revoked then C signs in, paused drain then switch to C, held real create/fence responses released after switch, cancel, or supersede) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-011, FR-012, BR-001, AC-012, AC-044, AC-047
Root: T11
Depends on: T10

## T12 — Sign-out confirmation with unsent messages
Reasoning: User-initiated sign-out deletes the outbox; touches the Presence logout path, so it is isolated.
Task: At every in-app sign-out entry point, with N > 0 unsent items a dialog shows "Você tem N mensagens não enviadas. Sair apaga essas mensagens." with "Sair mesmo"/"Cancelar" (focus-trapped, Esc = Cancelar); Cancelar has no logout request, notice, or navigation; Sair mesmo stops drains in all tabs, deletes the user's outbox, and runs the existing sign-out with the Presence logout sequence unchanged; with N = 0 sign-out is unchanged.
Done when: AC-013 and the AC-047 Sair-mesmo clause hold, and the dialog is keyboard-operable.
Verify by: New E2E spec covering both entry points, a drain in flight in another tab, held responses after Sair mesmo, re-login with empty outbox, and keyboard operation, passing 3 consecutive runs in Chrome and Edge; Presence E2E logout tests pass; presence-safety review recorded.
Covers: FR-013, BR-008, AC-013, AC-037, AC-047
Root: T12
Depends on: T11

## T13 — Realtime stream health, recovery, and connection banner
Reasoning: Polling, typing recovery, and metrics all consume one per-stream health model; the banner is its visible output.
Task: The messages/receipts/reactions and conversation-list streams have application-level health and recovery (rejoin after error, timeout, or terminal closure with capped exponential backoff, catch-up refetch of the open feed and list on recovery), exposing per-stream health for other consumers; the drawer shows "Sem conexão — mensagens serão enviadas quando voltar" immediately when the browser is offline and "Reconectando…" when any required stream has been unhealthy > 5 s while online, in a polite live region, hiding itself when all are healthy.
Done when: AC-014 and the messages/list clauses of AC-015 hold.
Verify by: New E2E specs (offline context; 3 s Realtime drop; messages-only and list-only drops incl. terminal closure; recorded increasing capped delays; catch-up of B's messages and unread counts) pass 3 consecutive runs in Chrome and Edge; `messaging-reconnect-consistency.spec.ts` and regression suites pass.
Covers: FR-014, FR-015, AC-014, AC-015, AC-037
Root: T13
Depends on: —

## T14 — Polling fallback during Realtime outages
Reasoning: G3's second half; depends on stream health and has its own merge-safety risk (AC-048).
Task: While any required stream has been unhealthy > 30 s and the tab is visible, the open conversation's new messages, its loaded messages' receipt summaries, any open reader-details list, and the conversation list are fetched every 15 s (immediately on becoming visible); none while hidden; no new poll once all streams are healthy; merges never duplicate messages or replace newer/enriched state or loaded history pages with older data.
Done when: AC-016 and AC-048 hold.
Verify by: New E2E specs (Realtime-only block with HTTP working, list-only outage, partial reads by C, hidden/visible, recovery during an in-flight poll with 60 s quiet check, held stale poll vs newer reaction/receipt/attachment/mention) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-016, BR-012, AC-016, AC-048
Root: T14
Depends on: T13

## T15 — Reliable named members-only typing indicator
Reasoning: Client side of G4 on the T5 topic, with its own stream health and removal detection.
Task: Typing travels on the T5 private topic with payload limited to user identity and typing flag; the indicator stays visible during continuous typing and disappears ≤ 5 s after stop, blur, send, conversation switch, or tab close; names follow FR-018 in direct, group, and room conversations; the user's own sessions never show their typing; the typing stream recovers after drops; the app detects its own removal from a conversation through a signal independent of conversation access and leaves the topic within 5 s.
Done when: AC-017, AC-018, AC-019 (E2E removal clause), AC-020, and the typing clause of AC-015 hold.
Verify by: New E2E specs (15 s continuous typing sampled each second, stop/close/switch, 1/2/3+ typists, own two tabs + second device, removal of E while subscribed, typing-stream-only drop) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-015, FR-017, FR-018, FR-019, FR-020, BR-009, AC-015, AC-017, AC-018, AC-019, AC-020
Root: T15
Depends on: T5, T13

## T16 — Live cross-device unread, read state, and own messages
Reasoning: G5 is observable independently once key correlation exists.
Task: With healthy connectivity, a full or partial read on one tab/device updates the same user's unread counts and read state on their other tabs/devices within 5 s, sender receipt summaries/details match stored receipts on all the sender's sessions, and messages the user sends appear once on their other devices within 5 s, without reload, focus change, or reconnect.
Done when: AC-021 and AC-022 hold.
Verify by: New E2E specs with a second device as a separate browser context pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-021, FR-022, AC-021, AC-022
Root: T16
Depends on: T7

## T17 — @mention composition and rendering
Reasoning: The user-facing mention flow on top of T4, sent through the outbox.
Task: Typing "@" opens an accessible combobox/listbox of the conversation's current members except the user (rooms: room-conversation members only), filtered while typing, operable by arrows/Enter/Tab/Esc and mouse; choosing inserts a highlighted mention whose user ID travels in the outbox item and create request; unselected "@name" text is plain; mentions render distinctly for everyone and the mentioned viewer sees the whole message highlighted with a non-color cue.
Done when: AC-023, AC-027, and the UI clauses of AC-024 hold, and the list is screen-reader announced.
Verify by: New E2E specs (room member list excluding non-joined user, keyboard and mouse, plain "@Bruno", highlight for B only) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-023, FR-024, FR-026, BR-010, AC-023, AC-024, AC-027, AC-037
Root: T17
Depends on: T4, T8

## T18 — Mention desktop notifications
Reasoning: Extends the Phase 4 notification claim with mention eligibility, emission-time authorization, and browser-wide suppression.
Task: With the Phase 4 toggle on and permission granted, a mentioned user gets one notification per message (DM, group, room, thread reply) titled "<Autor> mencionou você em <conversa>" with the full text, opening the conversation on click; emission is authorized with authoritative data under the current identity, then re-checked without further awaits for same signed-in user and no received removal signal; account switch or sign-out discards pending notifications; no tab notifies while any of the user's tabs in the browser is visible on that conversation; DM/group messages are never notified twice.
Done when: AC-025, AC-026, and AC-049 hold.
Verify by: New E2E specs (hidden tab, room with/without mention, DM and thread-reply mention, two-tab race with hidden tab first, own message, toggle off, two hidden tabs, held authorization with removal and account switch) pass 3 consecutive runs in Chrome and Edge; `messaging-desktop-notifications.spec.ts` passes.
Covers: FR-025, BR-011, AC-025, AC-026, AC-049
Root: T18
Depends on: T15, T17

## T19 — Client messaging metrics that never affect messaging
Reasoning: Client half of G7; must be proven harmless (FR-028) against a failing route.
Task: The client records send latency, outbox wait, send outcomes by reason, stream drops/recoveries/outage duration, and polling activations/duration in a bounded buffer (oldest dropped), delivering fire-and-forget batches (≤ 50 events, ≤ 16 KB, one in flight, aborted after 5 s, dropped under overload) to the T6 route; messaging never awaits metrics.
Done when: AC-028 (end-to-end lines for a send, a stream recovery, and a polling episode, redaction scan clean) and AC-029 hold.
Verify by: E2E spec producing the three episodes with a log scan, plus failing, hanging, and flooded route runs asserting AC-001/AC-002 timing, ≤ 1 metrics request in flight, 5 s abort, bounded buffer, no visible error; 3 consecutive runs in Chrome and Edge.
Covers: FR-027, FR-028, AC-028, AC-029
Root: T19
Depends on: T6, T9, T14

## T20 — Drawer restore after reload, per user
Reasoning: Independent Phase 4 follow-up (R1-q15 C).
Task: Drawer open flag and active conversation are persisted per application user per browser; after reload an open drawer reopens on the same conversation, an inaccessible conversation opens the list without error, a closed drawer stays closed, and another user on the browser never inherits it.
Done when: AC-032 holds.
Verify by: New E2E spec (reload open, lost access, user C on same browser, closed drawer) passes 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-031, BR-016, AC-032
Root: T20
Depends on: —

## T21 — Old-build compatibility against the migrated local database
Reasoning: §10/AC-034 requires the hosted and Phase 4 builds to keep working after all phase migrations, before any online application.
Task: With every phase migration applied locally, the currently hosted build (git ref confirmed by the owner) and the Phase 4 build each run locally against that database and pass a send/read/unread smoke including legacy unkeyed writes; every migration has recorded rollback SQL and a row in MIGRATIONS-PENDENTES.md.
Done when: Both builds pass the smoke against the migrated local database.
Verify by: Recorded smoke runs for both builds (owner-confirmed hosted git ref) in TRACK; migration list vs MIGRATIONS-PENDENTES.md check.
Covers: BR-014, AC-034
Root: T21
Depends on: T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20

## T22 — Phase acceptance verification
Reasoning: Phase-level evidence that the per-task gates hold together on the final tree.
Task: On the final tree: messaging DB integration suite and the full messaging E2E suite (Phase 4 regression + every new spec) pass; every new E2E spec has a recorded 3-consecutive-run pass in Chrome and in Edge; outbox, banner, typing, and mention flows are verified in Firefox and recorded; type-check, lint, and build pass; no unit test was added and every touched unit test is recorded as replaced; accessibility points of §13 are checked.
Done when: All listed checks pass on the final tree with evidence in TRACK.
Verify by: Suite and build outputs, the 3-run records per spec and browser, the Firefox record, and a diff scan for added unit tests.
Covers: FR-032, BR-015, AC-033, AC-036, AC-037
Root: T22
Depends on: T21

## T23 — Online migration rollout and owner acceptance
Reasoning: BR-014 phase-end step; requires explicit owner authorization and is the last database-changing action.
Task: After explicit owner authorization naming `vhabpcoyypobgasacsko`, every phase migration is applied online by the standing method, the catalog is read back from that target, a runtime smoke passes, the hand-off states the app is ready to deploy after the migrations, and the owner's final test of the new app against the online database is recorded.
Done when: All phase migrations are present and verified on `vhabpcoyypobgasacsko` and the owner accepts the final test.
Verify by: Catalog/migration readback and smoke output from the target recorded in TRACK; user confirmation of authorization and of the final test.
Covers: BR-014, AC-034, AC-035
Root: T23
Depends on: T21, T22

## Plan quality gate (version 1, 2026-10-06)

- Grounded in an actual observation of current state: Pass — Observations section (route, migrations, hooks, drawer, sign-out, local Supabase).
- Every acceptance criterion covered by TRACK done/no_op or a remaining task: Pass — AC-001..AC-050 each in ≥ 1 Covers (mechanical check).
- Every Must-priority requirement covered: Pass — FR-001..FR-034 each in ≥ 1 Covers (mechanical check).
- Every task lists Covers; no task outside every requirement path: Pass.
- Every ID in Covers exists in the SPEC: Pass — mechanical check.
- Every task has one observable Done when: Pass.
- Every task has a concrete Verify by: Pass.
- No task describes HOW instead of WHAT: Pass.
- Dependencies are ordered correctly and acyclic: Pass — every dependency has a lower ID.
- PLAN contains only future work: Pass.
- No attempted TRACK task is reissued or retained: N/A (no TRACK).
- Every task carries Root: Pass.
- Surviving IDs stable; dependencies repointed away from attempted tasks: N/A.
- Success criteria are unchanged from the SPEC (replan only): N/A.
- No strategy version changed during maintenance: N/A.

Verdict: Ready
