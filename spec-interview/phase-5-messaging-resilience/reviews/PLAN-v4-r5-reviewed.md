# PLAN: phase-5-messaging-resilience

Spec: ./SPEC.md
Goal: In the production messaging drawer, no message a user sends is lost or duplicated across network and Realtime outages, reloads, several tabs, account changes, and several devices; typing, unread/read state, and @mention notifications stay live and correct; and messaging health is observable through redacted logs — without regressing existing messaging.
Plan version: 4
Highest task ID reserved: T28
Replanned because: owner decision D9 (state.md, 2026-10-07) — the T4 performer found that baseline `public.conversation_members` policies/grants let any authenticated user enrol themselves in any conversation or move their row to another conversation through the Data API, defeating every members-only rule; owner chose to fix it in this phase. Adds T28; v3 preserved as `reviews/PLAN-v3-reviewed.md`.

## Standing rules for every task

- **Migration rule (BR-014, AC-034):** during the phase a migration is done when it is written, applied to the LOCAL database, its tests pass, and its rollback SQL is recorded in the migration header and TRACK. Each one gets a row in `spec-interview/phase-5-messaging-resilience/MIGRATIONS-PENDENTES.md`. Nothing is applied online before T23.
- **Old-build compatibility at introduction (§10):** every task that changes a DB contract or a route proves, with integration tests against the migrated local DB, that the hosted pre-Phase-4 client contract (unkeyed creates) and the Phase 4 client contract (keyed text/attachment/voice creates and their replays, without the new fields) keep working; T21 repeats this as a combined smoke with the real old builds.
- **Online application method (T23 only):** the Phase 4 method (Phase 4 TRACK T2/T25): re-check `npx supabase migration list --linked` and the target catalog immediately before; apply only each reviewed file's SQL transactionally and record only its version; read back by statement hash plus catalog objects; smoke-check. Never `supabase db push`, `migration up --linked`, or broad `migration repair`.
- **Supabase/RLS review gate (AC-035):** every migration, RLS/Realtime policy, repository, and API route change passes the `supabase-rls-reviewer` audit (users.id vs supabase_uid, server client + `auth.getUser()`, service role never replacing membership checks) before the task is done.
- **Adversarial review gate (AGENTS.md):** each task's diff gets the cross-model adversarial review (direct Codex CLI, `gpt-6.1-sol`, effort `max`, read-only, per `delegation-anthropic.md`) before it is recorded done; findings fixed or rejected with reasons in TRACK. The whole work-item diff gets the same review in T22.
- **Test policy (BR-015, AC-036):** integration tests against local Supabase/Realtime/real routes and Playwright E2E only. T1–T6 run their regression E2E through the existing local runner (`npm run test:messaging:local:e2e`); from T24 on, every E2E gate runs through the T24 runner (local Supabase; real Chrome and Edge projects); no unit tests; a touched unit test is replaced and deleted, recorded in TRACK. A new E2E spec counts only after 3 consecutive passing runs in Chrome and in Edge with zero retries, zero flaky, and no skipped critical test. Network shaping only (SPEC §15); no mocked Supabase, repositories, or code under test.
- **Regression (FR-032, AC-033):** every task that changes server or drawer behavior ends with the messaging DB integration suite and the messaging regression E2E suite passing locally, plus type-check and lint.
- **Presence touch points:** any change near sign-out or Realtime lifecycle follows the `presence-safety` skill; the Presence logout sequence is unchanged.
- **Planning decisions under D4 (owner-adjustable):** budget infrastructure fails closed — if a create, fence, or metrics budget cannot be checked, the request is refused as a transient 429 (the outbox retries it) instead of being allowed; Phase 4 keyed requests that carry no attempt generation keep the Phase 4 keyed contract (create, replay 200, 409) and take part in the same commit-time exclusion as fencing: such a request commits only if no fence state exists for its key at commit time, where fence state is created only by a fence call or a generation-carrying request (a generation-less create creates none, so Phase 4 retries are unaffected); a generation-less request that loses to a fence stores nothing and is rejected as stale. Per-stream Realtime faults in E2E may inject Phoenix channel frames (`phx_error`, `phx_close`) or withhold a single topic's replies on the real socket; this counts as network shaping of a single stream (SPEC §15) — the real transport, joins, and application callbacks stay in place and no application health is set directly; a real server mechanism is preferred where one exists.

## Observations grounding this plan (2026-10-06, corrected after review r1)

- Local Supabase answers at `127.0.0.1:54321` (HTTP 200). Messaging DB suite `__tests__/messaging-db/*` (`vitest.messaging-db.config.mts`) and local E2E (`playwright.messaging-local.config.ts`) exist from Phase 4.
- Create route (`src/app/api/messages/create/route.ts`): `clientMessageId` optional; repository `createWithClientKey` dedupes on unique index `(sender_id, conversation_id, client_message_id)` (migration `20261005000414`); the attachment path creates through a separate transactional RPC (route.ts:310). The Phase 4 composer sends a key for text, attachment, and voice creates (`message-composer.tsx:223`, `useMessages.ts:284`). No attempt generation, fence/lookup route, or expected-sender field. Early validation (route.ts:231) runs before any budget is charged.
- Rate limiting: `enforceRateLimit` (`src/lib/auth/rate-limit.ts`) fails open on RPC error (line 48); `check_rate_limit` (`20260612190000`) increments a fixed-window counter on every call, including denied ones — an attempt counter, not a winning-insert quota.
- `Message` type and feed/Realtime mappings expose no `clientMessageId`; optimistic matching is content/time based. Mentions do not exist.
- `mark_conversation_read(uuid, uuid)` is SECURITY DEFINER, executable only by `service_role` since `20261004170724`, with no internal membership check; `get_unread_counts` still has default `anon` EXECUTE.
- Typing (`src/hooks/useConversationPresence.ts`): public channel `conversation:{id}`; sends true once and false after 2 s idle, remote TTL 4 s; payload carries the auth uid and display name; on channel failure it only clears its subscribed flag (line 150).
- Realtime: `useMessageSubscription` exposes `connectionStatus` and backoff for the messages channel; `useConversationRealtime` exports `connectionStatus` and does catch-up on confirmed streams, but has no application backoff and its health is not consumed. `conversation_members` and `message_read_receipts` are already in the Realtime publication. No polling. No IndexedDB/BroadcastChannel; Web Locks only in `src/lib/messaging/desktop-notifications.ts`.
- Membership roster: `conversations.participants` is not updated when a `conversation_members` row is removed; browser SELECT on `conversation_members` is own-row only; `POST /api/conversations/join` returns 200 from the stale `participants` array without restoring membership (join/route.ts:39).
- Drawer (`MessagingContext.tsx`): active conversation ID persisted in global `localStorage` (not per user); open flag not persisted.
- Sign-out: the only reachable in-app control is `EnhancedUserMenu` (`enhanced-user-menu.tsx`, rendered by `dashboard-header.tsx:81`); the header's own `signOut` handler is unused.
- Test harness: `playwright.config.ts` project `messaging-drawer` uses a filename allowlist of Phase 4 specs and `Desktop Chrome` (bundled Chromium, no `chrome`/`msedge` channel); `messaging-desktop-notifications.spec.ts:27` forces `channel: 'chromium'`; the E2E fixture signs in two users plus an optional never-signed-in third; the outage helper (`drawer-helpers.ts:465`) closes every Realtime socket; the local server's stdout is not captured for tests. Chrome and Edge executables are installed.
- None of these contradicts the SPEC.

## T4 — Server-validated atomic mentions and current-member roster
Reasoning: Mentions are a data contract consumed by composer and notifications on both create paths; the autocomplete needs a current roster no existing read provides.
Task: A mention store holds application user IDs mentioned by a message, written in the same transaction as the first creation on both the text path and the attachment/voice path (since T3 every message insert — keyed, unkeyed, Phase 4 wrapper — runs inside `create_message_attempt`, and clients have no INSERT on public.messages), only for conversation members at that time other than the sender; requested mention IDs are part of the stored original composition (changed mentions on replay → 409; unchanged replay after a recipient left returns the stored message); only members can read mention records; no client can write them; messages fetched by members carry their mention IDs. An authorized read returns a conversation's current members (from `conversation_members`, so removed members are excluded) to members only.
Done when: The AC-024 server clauses, the AC-046 replay clause, and the roster contract hold on the local database for both create paths.
Verify by: Messaging DB integration tests: non-member and self IDs store nothing; changed-mention replay 409 with no change; forced mention-storage failure stores neither message, attachment links, nor mentions (text and attachment paths); anon/non-member read denied; direct client writes denied; unchanged replay after removal returns stored message; roster excludes a removed member and is denied to non-members; Phase 4/legacy compatibility passes; RLS review gate recorded.
Covers: FR-023, FR-024, BR-010, AC-024, AC-046, AC-035
Root: T4
Depends on: T2

## T28 — Membership integrity: memberships only through authorized server paths
Reasoning: Every members-only guarantee of this phase (typing topic, mentions, roster, read state, messages, attachments, receipts) trusts `conversation_members`; owner decision D9 puts the self-enrolment gap in scope (PLAN review r4 #1–#3 widened it to every client-reachable and server-side path that creates or restores a membership).
Task: A `conversation_members` row is created or restored only by a server path that authorizes that user for that conversation (direct conversation creation among the users it names, under the existing company rules; room conversation membership per the room's access rules; an explicitly authorized room join/rejoin; test seeding). No anon or authenticated client — acting through `conversation_members`, `conversations` INSERT/UPDATE (`participants`, `room_id`, `type`), the participant sync trigger `sync_conversation_members`, the conversation resolver/join routes, or any other RPC, view, or trigger — can make itself or any other user a member it is not authorized to be, or move a membership to another conversation or user. A removed membership stays removed when unrelated writes happen (another user's join, a participants sync, preference/archive/read writes); only an authorized rejoin restores it. Preference, archive, and read writes update an existing membership and never create one; a membership that vanished between authorization and the write is answered as not a participant with no row created. What a client DELETE of its own membership means (leave, or forbidden) is decided and recorded. The hosted build and the Phase 4 build keep creating direct and room conversations, joining rooms, and changing preferences/archive/read state (including their user-scoped writes, e.g. preference upserts of an existing membership). The inventory of membership writers and the decision for each is recorded in TRACK.
Done when: On the local database, for each inventoried path, neither a hostile actor nor the user it targets gains or regains membership without authorization, and the legitimate creation, join, rejoin, preference, archive, and read flows of the current, Phase 4, and hosted builds still work.
Verify by: Messaging DB integration tests (PostgREST as anon, as an authenticated outsider, and as a current member; real routes) asserting the complete membership delta and the affected users' access (403 on create/fence/roster, no messages/mentions): own INSERT into another conversation; UPDATE moving a row to another conversation/user; a member adding an outsider through `participants`; conversation INSERT naming arbitrary/cross-company participants or an unauthorized private room; `room_id`/`type` retargeting followed by resolver/join calls; removal → another user's legitimate join → removed user still denied, then an authorized rejoin restores access; preference and archive mutations held after authorization, membership deleted, then released → no replacement row and access still denied; legitimate flows and old-build contracts (user-scoped conversation creation, preference/archive upserts of an existing membership) still pass; `npm run test:messaging:local:e2e` passes; presence-safety reviewer and the Presence DB suite run if any room/Presence/Knock path is touched; RLS review gate recorded.
Covers: AC-019, AC-024, AC-030, AC-034, BR-009, BR-010, AC-035
Root: T28
Depends on: —

## T5 — Members-only private typing topic
Reasoning: Typing privacy is enforced by Realtime authorization in the database, independent of the indicator UI.
Task: A private Realtime topic per conversation whose join and broadcast send are authorized only for current members (`users.supabase_uid = auth.uid()::text` → `users.id` membership); anon clients, authenticated non-members, and the public topic name receive no typing events and cannot send events members receive; existing private topics (Presence, screen share) are unaffected.
Done when: The AC-019 integration clauses hold with real local Realtime.
Verify by: Messaging DB/Realtime integration test: anon, outsider, and public-topic clients get no events and cannot inject; member receives member's signal; Presence realtime integration suite still passes; RLS review gate recorded.
Covers: FR-019, BR-009, AC-019, AC-035
Root: T5
Depends on: —

## T6 — Redacted messaging metrics route
Reasoning: The server side of G7 is a self-contained, security-relevant contract (auth, bounds, redaction, non-bypassable limit).
Task: An authenticated, per-user rate-limited (fail-closed) route accepts batches of at most 50 events and 16 KB, only closed event/reason enums, bounded numeric fields, and conversation type; drops anything else; adds a server-derived app version; writes structured log lines containing only BR-013 fields; rejects unauthenticated requests without logging a metric line.
Done when: The AC-028 route clauses hold against the real route.
Verify by: Integration test against the real route capturing its raw log output: valid batch logged with enums/version only; unknown fields, free text, out-of-range numbers, forged version absent; > 50 events or > 16 KB rejected; rate limit and limiter failure reject; unauthenticated rejected with no metric line; route review gate recorded.
Covers: FR-027, BR-013, AC-028, AC-035
Root: T6
Depends on: —

## T24 — Phase 5 E2E runner and fixtures
Reasoning: Review r1 #10, #11, #13: the current runner excludes new specs and real Chrome/Edge, fixtures lack the users and states the ACs need, and server logs are not test-readable.
Task: A local-only E2E setup where Phase 5 specs run in real Chrome and real Edge projects against local Supabase (no file-level channel overrides); fixtures provide signed-in users A–E in one company, a DM, a group, and a room conversation, removal and re-add that really restore `conversation_members`, create-quota exhaustion and reset, second-device browser contexts, and cleanup of new server and browser state (outbox, budgets, mentions, fence state) after interrupted runs; raw server log lines of the local app are readable by tests before any sanitization.
Done when: A harness probe spec exercising every fixture, the log capture, and both browser projects passes 3 consecutive runs in Chrome and in Edge, and the Phase 4 regression suite still passes under the new runner.
Verify by: Probe spec run records (3× Chrome, 3× Edge, zero retries/flaky/skips) and the Phase 4 regression run, recorded in TRACK.
Covers: BR-015, AC-036
Root: T24
Depends on: —

## T25 — Per-stream Realtime fault harness
Reasoning: Review r1 #12: closing the shared socket cannot prove independent stream failures; the banner, polling, and typing ACs need a proven per-topic fault method.
Task: E2E tests can make any one messaging Realtime stream (messages/receipts/reactions, conversation list, or typing) error, time out, or close terminally while the other streams on the same socket stay joined and report healthy, using a real server mechanism or the single-stream Phoenix frame shaping allowed in Standing rules, with the real transport, joins, and application callbacks.
Done when: A probe spec covers the full 3 streams × 3 failure classes matrix, recording for each cell the targeted channel's actual subscription status (error / timed out / closed) and continued event delivery on the two unaffected streams.
Verify by: Probe spec passes 3 consecutive runs in Chrome and in Edge, recorded in TRACK.
Covers: BR-015, AC-015, AC-036
Root: T25
Depends on: T24

## T7 — Client correlation by clientMessageId
Reasoning: Every pending/stored match in the outbox and across tabs depends on key-based correlation; it is observable on its own (AC-050).
Task: The sender's representations of a message (create/fence responses — already carrying it since T2 —, feed fetches via the repository mapper, Realtime events — whose INSERT payload already has `client_message_id` —, optimistic items) carry `clientMessageId`; the feed matches pending items to stored messages only by that key in every sender tab.
Done when: AC-050 holds: identical texts (one plain, one reply) with Realtime arriving before HTTP show as exactly one bubble each in both of A's tabs throughout.
Verify by: New E2E spec for AC-050 passes 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-034, AC-050
Root: T7
Depends on: T2, T24

## T8 — Durable outbox with ordered automatic delivery
Reasoning: The core of G1: write-before-dispatch, persistence across reload/close, ordered automatic drain meeting D1; unknown-outcome recovery follows in T27.
Task: Every eligible text/reply send is written to a per-user IndexedDB outbox (key, conversation, content, reply target, requested mention IDs, original send time, window start, order, state, generation) before dispatch and before the composer clears; pending items render with a text label; items drain automatically per conversation in order when connectivity returns, with ≤ 10 pending and quota available all delivered within 10 s; confirmed items become the normal message; the outbox survives reload and tab close; attachments/voice are never queued (Phase 4 behavior kept); if the outbox write fails or storage is unavailable, nothing is dispatched and the text and reply stay with the D5 message.
Done when: AC-001, AC-002, AC-004, AC-011, and AC-039 hold in the real UI, and 10 messages queued offline are delivered in order, once each, within 10 s of reconnecting.
Verify by: New E2E specs for those ACs plus the 10-message D1 timing case (offline context, reload offline, tab close, IndexedDB disabled and failing writes) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-001, FR-002, FR-003, FR-010, FR-033, BR-002, BR-003, AC-001, AC-002, AC-004, AC-011, AC-039
Root: T8
Depends on: T7

## T27 — Unknown-outcome recovery through the fence
Reasoning: Review r1 #3, #14: fenced recovery is a separate failure surface from durable enqueue, and AC-040 needs it.
Task: An attempt that ends without a usable response (network error after dispatch, timeout, 5xx after reaching the server, tab closed mid-request) leaves the item unknown; before any cancel, expiry, or redispatch the app fences it under a new generation; a stored result resolves as delivered (never cancelled or expired); a not-stored result only permits the transition that was requested — cancel and expiry complete without any create, and redispatch happens only while the item is still current, eligible, and inside its delivery window; cancel is offered only for items known not stored; a fence answered 403 `NOT_PARTICIPANT` (access lost while the item was unknown) makes the item failed per BR-005 with its text kept, stops automatic attempts, and is never treated as not stored (no expiry, no cancel) — "Tentar de novo" fences under a new generation first, so a stored result resolves as delivered and a not-stored result follows the normal rules, and "Apagar" only removes the local item.
Done when: AC-003, AC-038, AC-040, AC-042, and the AC-046 5xx clause hold in the real UI with real routes, an unknown item fenced as not stored after its 24 h window expires without any create request, and an unknown item whose fence returns 403 is failed (not expired, not delivered, not re-created) for both a committed-but-response-lost message and a not-yet-stored one.
Verify by: New E2E specs (network error after dispatch, dropped response after pass-through, gateway 5xx after pass-through, held create + tab close + reopen, stored-but-unknown item at cancel and at 24 h, unknown-but-not-stored item at 24 h, via test clock; removal from the room before fencing for a committed-response-lost item and a not-yet-stored item, then access restored and "Tentar de novo" → delivered once / sent once) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-005, FR-006, FR-009, BR-005, BR-007, AC-003, AC-038, AC-040, AC-042, AC-046
Root: T27
Depends on: T8

## T10 — Cross-tab outbox ownership and leases
Reasoning: Multi-tab exactly-once (R1-q16 B) is the riskiest client protocol; proven right after fenced recovery, before unrelated features.
Task: All tabs of the same user share the outbox and show each item once; per conversation only the oldest unresolved item is eligible and one tab holds an atomic drain claim (lease: request timeout 30 s, lease 45 s) that ends on tab close/crash or expiry, after which another tab fences and resumes; when connectivity returns, an attempt started before or during the outage is superseded immediately under a new generation without waiting for the timeout or lease; no two create requests of one conversation overlap across tabs; cancel is atomic against claims and propagates to every tab.
Done when: AC-005, AC-006, AC-041, and the AC-045 E2E cases hold with two real tabs, including an attempt started during an active outage delivered within 10 s of recovery.
Verify by: New E2E specs (two tabs, held create, tab close, hung lease, attempt dispatched during outage, simultaneous online, cancel/claim race, network-log overlap check) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-002, FR-004, FR-005, BR-003, BR-007, AC-005, AC-006, AC-041, AC-045
Root: T10
Depends on: T27

## T9 — Definitive failures, rate-limit retry, and expiry
Reasoning: The user-visible failure states (BR-005 definitive, 429 transient, BR-006 expiry) are a separate outcome from unknown recovery.
Task: Definitive rejections show the item failed with its text and "Tentar de novo"/"Apagar" and block only later items of that conversation; "Apagar" removes it and the next item proceeds; 409 retry resends the content under a new key once; 429 and 401-with-valid-session stay pending and retry automatically in order; items fenced as not stored 24 h after send become "expirada" without auto-send (a fence answered 403 is a definitive failure, never "not stored" — T27); manual retry of an expired item keeps the key and the original send time and opens a new 24 h window under the normal rules.
Done when: AC-007, AC-008, AC-009 (drawer clause), AC-010, AC-043, and the AC-046 definitive-class clauses hold, and an expired item retried manually keeps its original send time in the outbox.
Verify by: New E2E specs (removed room access via T24 re-add fixture, local quota exhaustion with 12 items, test-controlled clock for expiry, 409 key reuse, 403/400/413) pass 3 consecutive runs in Chrome and Edge, with an outbox inspection for the preserved send time; regression suites pass.
Covers: FR-002, FR-007, FR-008, FR-009, BR-005, BR-006, AC-007, AC-008, AC-009, AC-010, AC-043, AC-046
Root: T9
Depends on: T3, T10

## T11 — Identity fencing and session-end hold
Reasoning: Shared-browser and account-switch safety (R1-q16 A) is its own guarantee across all tabs.
Task: Before every dispatch and fence the authenticated application user must equal the item owner; an identity change or sign-out in any tab stops drains in all tabs; late create/fence/lookup responses after a switch, or older-generation/cancelled-item responses under the same identity, are discarded without changing any view, item, or claim; items are held only when the client auth state reports the session ended and drain after the same user signs in again; another user never sees, sends, or deletes them; a 401 with a valid client session stays transient.
Done when: AC-012, AC-044 (client clauses), and AC-047 (switch and same-identity clauses) hold in the real UI.
Verify by: New E2E specs (session cleared/refresh revoked then C signs in, paused drain then switch to C, held real create/fence responses released after switch, cancel, or supersede) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-011, FR-012, BR-001, AC-012, AC-044, AC-047
Root: T11
Depends on: T9

## T12 — Sign-out confirmation with unsent messages
Reasoning: User-initiated sign-out deletes the outbox; touches the Presence logout path, so it is isolated.
Task: At every reachable in-app sign-out control (today `EnhancedUserMenu`; any other found when the task starts is included), with N > 0 unsent items a dialog shows "Você tem N mensagens não enviadas. Sair apaga essas mensagens." with "Sair mesmo"/"Cancelar" (focus-trapped, Esc = Cancelar); Cancelar has no logout request, notice, or navigation; Sair mesmo stops drains in all tabs, deletes the user's outbox, and runs the existing sign-out with the Presence logout sequence unchanged; with N = 0 sign-out is unchanged.
Done when: AC-013 and the AC-047 Sair-mesmo clause hold for every reachable sign-out control, and the dialog is keyboard-operable.
Verify by: New E2E spec (each reachable control enumerated in TRACK, a drain in flight in another tab, held responses after Sair mesmo, re-login with empty outbox, keyboard operation) passes 3 consecutive runs in Chrome and Edge; Presence E2E logout tests pass; presence-safety review recorded.
Covers: FR-013, BR-008, AC-013, AC-037, AC-047
Root: T12
Depends on: T11

## T13 — Realtime stream health, recovery, and connection banner
Reasoning: Polling, typing recovery, and metrics consume one per-stream health model; the banner is its visible output.
Task: The messages/receipts/reactions and conversation-list streams have application-level health and recovery (rejoin after error, timeout, or terminal closure with capped exponential backoff; catch-up refetch of the open feed and list on recovery), exposing per-stream health for other consumers; the drawer shows "Sem conexão — mensagens serão enviadas quando voltar" immediately when the browser is offline and "Reconectando…" when any required stream has been unhealthy > 5 s while online, in a polite live region, hiding itself when all are healthy.
Done when: AC-014 and the messages/list clauses of AC-015 hold.
Verify by: New E2E specs using T25 (offline context; 3 s drop; messages-only and list-only error, timeout, and terminal closure; recorded increasing capped delays; catch-up of B's messages and unread counts) pass 3 consecutive runs in Chrome and Edge; `messaging-reconnect-consistency.spec.ts` and regression suites pass.
Covers: FR-014, FR-015, AC-014, AC-015, AC-037
Root: T13
Depends on: T25

## T14 — Polling fallback during Realtime outages
Reasoning: G3's second half; depends on stream health and has its own merge-safety risk (AC-048).
Task: While any required stream has been unhealthy > 30 s and the tab is visible, the open conversation's new messages, its loaded messages' receipt summaries, any open reader-details list, and the conversation list are fetched every 15 s (immediately on becoming visible); none while hidden; no new poll once all streams are healthy; merges never duplicate messages or replace newer/enriched state or loaded history pages with older data.
Done when: AC-016 and the AC-048 reaction, receipt, attachment, and history-page clauses hold.
Verify by: New E2E specs (Realtime-only block with HTTP working, list-only outage, partial reads by C, hidden/visible, recovery during an in-flight poll with 60 s quiet check, held stale poll vs newer reaction/receipt/attachment message with older pages loaded) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-016, BR-012, AC-016, AC-048
Root: T14
Depends on: T13

## T15 — Reliable named members-only typing indicator
Reasoning: Client side of G4 on the T5 topic, with its own application-level recovery and removal detection.
Task: Typing travels on the T5 private topic with payload limited to user identity and typing flag; the indicator stays visible during continuous typing and disappears ≤ 5 s after stop, blur, send, conversation switch, or tab close; names follow FR-018 in direct, group, and room conversations; the user's own sessions never show their typing; the typing stream has application-level recovery after error, timeout, or terminal closure with capped exponential backoff and exposes its health; the app detects its own removal from a conversation through a signal independent of conversation access and leaves the topic within 5 s.
Done when: AC-017, AC-018, AC-019 (E2E removal clause), AC-020, and the typing clause of AC-015 hold for each typing-stream failure class.
Verify by: New E2E specs (15 s continuous typing sampled each second, stop/close/switch, 1/2/3+ typists with T24 users, own two tabs + second device, removal of E while subscribed, typing-only error, timeout, and terminal closure via T25 with increasing capped delays) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-015, FR-017, FR-018, FR-019, FR-020, BR-009, AC-015, AC-017, AC-018, AC-019, AC-020
Root: T15
Depends on: T5, T13

## T16 — Live cross-device unread, read state, and own messages
Reasoning: G5 is observable independently once key correlation exists.
Task: With healthy connectivity, a full or partial read on one tab/device updates the same user's unread counts and read state on their other tabs/devices within 5 s, sender receipt summaries/details match stored receipts on all the sender's sessions, and messages the user sends appear once on their other devices within 5 s, without reload, focus change, or reconnect.
Done when: AC-021 and AC-022 hold.
Verify by: New E2E specs with a T24 second-device context pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-021, FR-022, AC-021, AC-022
Root: T16
Depends on: T7, T24

## T17 — @mention composition and rendering
Reasoning: The user-facing mention flow on top of T4, for both queued text and unqueued attachment/voice sends.
Task: Typing "@" opens an accessible combobox/listbox of the conversation's current members (T4 roster) except the user, filtered while typing, operable by arrows/Enter/Tab/Esc and mouse; choosing inserts a highlighted mention whose user ID travels with the send — in the outbox item for text and in the create request for attachment/voice messages (including their Phase 4 retry); unselected "@name" text is plain; mentions render distinctly for everyone and the mentioned viewer sees the whole message highlighted with a non-color cue; a stale poll never drops a mention delivered by Realtime.
Done when: AC-023, AC-027, the UI clauses of AC-024, and the AC-048 mention clause hold, including a removed member absent from the list and a mention on an attachment message.
Verify by: New E2E specs (room list excluding a never-joined and a removed member, keyboard and mouse, plain "@Bruno", attachment message with mention and its retry, highlight for B only, held stale poll vs mention) pass 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-023, FR-024, FR-026, BR-010, AC-023, AC-024, AC-027, AC-037, AC-048
Root: T17
Depends on: T4, T8, T14

## T18 — Mention desktop notifications
Reasoning: Extends the Phase 4 notification claim with mention eligibility, emission-time authorization, and browser-wide suppression.
Task: With the Phase 4 toggle on and permission granted, a mentioned user gets one notification per message (DM, group, room, thread reply) titled "<Autor> mencionou você em <conversa>" with the full text, opening the conversation on click; emission is authorized with authoritative data under the current identity, then re-checked without further awaits for same signed-in user and no received removal signal; account switch or sign-out discards pending notifications; no tab notifies while any of the user's tabs in the browser is visible on that conversation; DM/group messages are never notified twice; an unchanged replay after a mentioned recipient left notifies no removed recipient.
Done when: AC-025, AC-026, AC-049, and the AC-046 notification clause hold.
Verify by: New E2E specs (hidden tab, room with/without mention, DM and thread-reply mention, two-tab race with hidden tab first, own message, toggle off, two hidden tabs, held authorization with removal and account switch, replay after recipient removal) pass 3 consecutive runs in Chrome and Edge; `messaging-desktop-notifications.spec.ts` passes in both browsers.
Covers: FR-025, BR-011, AC-025, AC-026, AC-046, AC-049
Root: T18
Depends on: T15, T17

## T19 — Client messaging metrics that never affect messaging
Reasoning: Client half of G7; must be proven harmless (FR-028) against a failing route.
Task: The client records send latency (from the original send time, including after a manual retry of an expired item), outbox wait, send outcomes by reason, every messaging stream's drops/recoveries/outage duration (messages, list, typing), and polling activations/duration in a bounded buffer (oldest dropped), delivering fire-and-forget batches (≤ 50 events, ≤ 16 KB, one in flight, aborted after 5 s, dropped under overload) to the T6 route; messaging never awaits metrics.
Done when: AC-028 (end-to-end lines for a send, a stream recovery, and a polling episode; raw-log redaction scan clean) and AC-029 hold, and the latency emitted for a manually retried expired item is measured from its original send time.
Verify by: E2E spec producing the three episodes and an expired-item manual retry (test clock; controlled original-send and server-confirmation timestamps recorded; emitted latency equals their difference within 1 s, distinct from retry-to-confirm time) with a scan of raw T24 server log lines, plus failing, hanging, and flooded route runs asserting AC-001/AC-002 timing, ≤ 1 metrics request in flight, 5 s abort, bounded buffer, no visible error; 3 consecutive runs in Chrome and Edge.
Covers: FR-009, FR-027, FR-028, AC-028, AC-029
Root: T19
Depends on: T6, T9, T14, T15

## T20 — Drawer restore after reload, per user
Reasoning: Independent Phase 4 follow-up (R1-q15 C).
Task: Drawer open flag and active conversation are persisted per application user per browser; after reload an open drawer reopens on the same conversation, an inaccessible conversation opens the list without error, a closed drawer stays closed, and another user on the browser never inherits it.
Done when: AC-032 holds.
Verify by: New E2E spec (reload open, lost access via T24 removal, user C on same browser, closed drawer) passes 3 consecutive runs in Chrome and Edge; regression suites pass.
Covers: FR-031, BR-016, AC-032
Root: T20
Depends on: T24

## T21 — Old-build compatibility against the migrated local database
Reasoning: §10/AC-034 requires the hosted and Phase 4 builds to keep working after all phase migrations, before any online application.
Task: With every phase migration applied locally, the currently hosted build (git ref confirmed by the owner) and the Phase 4 build each run locally against that database and pass a send/read/unread smoke, including legacy unkeyed writes (hosted build) and keyed text, attachment, voice, and failed-send retry (Phase 4 build), plus new direct and room conversation creation, authorized room joining, preferences, archive, and read (T28 contracts) on both builds, and — if the hosted ref is between 2026-02-09 and 2026-02-23 (TRACK T3) — the Knock response log message; every migration has recorded rollback SQL and a row in MIGRATIONS-PENDENTES.md.
Done when: Both builds pass the smoke against the migrated local database.
Verify by: Recorded smoke runs for both builds (owner-confirmed hosted git ref) in TRACK; migration list vs MIGRATIONS-PENDENTES.md check.
Covers: BR-014, AC-034
Root: T21
Depends on: T1, T2, T3, T4, T28, T5, T6, T24, T25, T7, T8, T27, T10, T9, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20

## T22 — Phase acceptance verification and final adversarial review
Reasoning: Phase-level evidence that the per-task gates hold together on the final tree, plus the AGENTS.md final whole-diff review.
Task: On the final tree: messaging DB integration suite and the full messaging E2E suite (Phase 4 regression + every new spec) pass in Chrome and Edge; every new E2E spec has a recorded 3-consecutive-run pass in each; outbox, banner, typing, and mention flows are verified in Firefox and recorded; type-check, lint, and build pass; no unit test was added and every touched unit test is recorded as replaced; §13 accessibility points are checked; the whole work-item diff passes the adversarial review with every finding fixed or rejected with a reason.
Done when: All listed checks pass on the final tree and the whole-diff review is accepted, with evidence and dispositions in TRACK.
Verify by: Suite and build outputs, 3-run records per spec and browser, the Firefox record, a diff scan for added unit tests, and the saved final review prompt/result under `reviews/`.
Covers: FR-032, BR-015, AC-033, AC-036, AC-037
Root: T22
Depends on: T21

## T23 — Online migration rollout and owner acceptance
Reasoning: BR-014 phase-end step; requires explicit owner authorization and is the last database-changing action.
Task: After explicit owner authorization naming `vhabpcoyypobgasacsko`, every phase migration is applied online by the standing method, the catalog is read back from that target, a runtime smoke passes, the hand-off states the app is ready to deploy after the migrations and that rollback is application first, then migrations in reverse order (with each rollback SQL; undoing T28's migration restores the D9 self-enrolment vulnerability), and the owner's final test of the new app against the online database is recorded.
Done when: All phase migrations are present and verified on `vhabpcoyypobgasacsko` and the owner accepts the final test.
Verify by: Before applying, the keyed-message count on the target and its exposed schemas (must exclude `private`) recorded in TRACK; catalog/migration readback and smoke output from the target recorded in TRACK; the hand-off text; user confirmation of authorization and of the final test.
Covers: BR-014, AC-034, AC-035
Root: T23
Depends on: T21, T22

## Plan quality gate (version 4, 2026-10-07)

- v4 changes: owner decision D9 adds T28 (membership integrity) after T4; PLAN review r4 widened T28 to every membership writer (room sync restoring removed members, preference/archive upserts after removal, member-granted and creation-time enrolment), extended T21 old-build smokes and T23 rollback order, and made a 403 fence outcome explicit in T27/T9 (BR-005 failed, never not stored). No SPEC clause changed; Covers IDs exist; dependencies acyclic (T28 depends on nothing; T21 depends on T28).

## Plan quality gate (version 3, 2026-10-07)

- v3 changes (review r2 N1–N4, R8/R12/R1 partials): runner prerequisite for T1–T6 explicit; generation-less commit-time exclusion; T25 full fault matrix and allowed mechanism; T27 transitions; T19 expired-retry latency. No SPEC clause changed; checks below re-run.

## Plan quality gate (version 2, 2026-10-06)

- Grounded in an actual observation of current state: Pass — Observations section, corrected per review r1 #16 and extended with r1 evidence.
- Every acceptance criterion covered by TRACK done/no_op or a remaining task: Pass — mechanical check; split clauses assigned explicitly (r1 #4, #8).
- Every Must-priority requirement covered: Pass — mechanical check.
- Every task lists Covers; no task outside every requirement path: Pass — T24/T25 cover BR-015/AC-036 (and AC-015).
- Every ID in Covers exists in the SPEC: Pass — mechanical check.
- Every task has one observable Done when: Pass — v1 T8/T9 split into T8/T27/T9 (r1 #14).
- Every task has a concrete Verify by: Pass — harness prerequisites T24/T25 added (r1 #10–#13).
- No task describes HOW instead of WHAT: Pass.
- Dependencies are ordered correctly and acyclic: Pass — mechanical check against file order (r1 #9).
- PLAN contains only future work: Pass.
- No attempted TRACK task is reissued or retained: N/A (no TRACK).
- Every task carries Root: Pass.
- Surviving IDs stable; dependencies repointed away from attempted tasks: Pass — no task attempted; v1 IDs kept, new IDs T24–T27 (T26 reserved, unused).
- Success criteria are unchanged from the SPEC (replan only): Pass — no SPEC clause changed; D4 planning decisions recorded in Standing rules.
- No strategy version changed during maintenance: N/A.

Verdict: Ready
