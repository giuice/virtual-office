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
- **Adversarial review gate (AGENTS.md):** each task's diff gets the cross-model adversarial review (direct Codex CLI, `gpt-6.1-sol`, effort `max`, read-only, per `delegation-anthropic.md`) before it is recorded done; findings fixed or rejected with reasons in TRACK. The whole work-item diff gets the same review in T22. Per owner decision D11 (state.md, 2026-10-08) the review runs per block, not per task: block A outbox = T8 (closed under its own reviews r1–r4), T27, T10, T9, T11, T12; block B Realtime = T13, T14, T15, T16; block C = T17, T18, T19, T20, T21; final = T22. Another round only for a High/Medium a real user or realistic failure can trigger; at most one fix round per block.
- **Test policy (BR-015, AC-036):** integration tests against local Supabase/Realtime/real routes and Playwright E2E only. T1–T6 run their regression E2E through the existing local runner (`npm run test:messaging:local:e2e`); from T24 on, every E2E gate runs through the T24 runner (local Supabase; real Chrome and Edge projects); no unit tests; a touched unit test is replaced and deleted, recorded in TRACK. A new E2E spec counts only after 3 consecutive passing runs in Chrome and in Edge with zero retries, zero flaky, and no skipped critical test (per D11 these 3 runs, Chrome and Edge, run once per block over all of the block's new specs, after its last task; per task, one Chrome pass of the new specs plus type-check and lint; the regression E2E in Chrome and the messaging DB suite, when server code changed, run once per block). Superseded by owner decision D12 (state.md, 2026-10-09): per block one run in Chrome and Edge over the block's new specs with zero retries; the 3 consecutive Chrome and Edge runs of every new spec run once, at T22, on the final tree; amended by D13 (2026-10-09): at T22 one run of every new spec in Chrome and Edge, a failing test rerun alone; amended by D15 (2026-10-10): no E2E before T22 — the block C fix round closes on type-check, lint and diff check, and the T22 run is the first and only E2E run of the remaining work, one Playwright process at a time. Network shaping only (SPEC §15); no mocked Supabase, repositories, or code under test.
- **Regression (FR-032, AC-033):** every task that changes server or drawer behavior ends with the messaging DB integration suite and the messaging regression E2E suite passing locally, plus type-check and lint. Per owner decision D10 (state.md, 2026-10-08): per task the regression E2E runs in Chrome only (`--project=regression-chrome`), Chrome + Edge at T22 and when a task touches the runner or shared fixtures; a review with only Low findings closes the task gate without another round. Superseded by D11 (2026-10-08): the Chrome regression and the DB suite run once per block, the review gate is per block. Superseded by D15 (2026-10-10): no regression E2E before T22.
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

## T22 — Phase acceptance verification and final adversarial review
Reasoning: Phase-level evidence that the per-task gates hold together on the final tree, plus the AGENTS.md final whole-diff review.
Task: On the final tree: messaging DB integration suite and the full messaging E2E suite (Phase 4 regression + every new spec) pass in Chrome and Edge; every new E2E spec has a recorded pass in each (one run per D13; a failing test rerun alone); outbox, banner, typing, and mention flows are verified in Firefox and recorded; type-check, lint, and build pass; no unit test was added and every touched unit test is recorded as replaced; §13 accessibility points are checked; the whole work-item diff passes the adversarial review with every finding fixed or rejected with a reason.
Done when: All listed checks pass on the final tree and the whole-diff review is accepted, with evidence and dispositions in TRACK.
(Owner decision D16, 2026-10-10: every E2E run here is Chrome only — no Edge run and no Firefox verification.)
Verify by: Suite and build outputs, run records per spec and browser (D13), the Firefox record, a diff scan for added unit tests, and the saved final review prompt/result under `reviews/`.
Covers: FR-032, BR-015, AC-033, AC-036, AC-037
Root: T22
Depends on: T21

## T23 — Online migration rollout and owner acceptance
Reasoning: BR-014 phase-end step; requires explicit owner authorization and is the last database-changing action.
Task: After explicit owner authorization naming `vhabpcoyypobgasacsko`, every phase migration is applied online by the standing method, the catalog is read back from that target, a runtime smoke passes, the hand-off states the app is ready to deploy after the migrations and that rollback is application first, then migrations in reverse order (with each rollback SQL; undoing T28's migration restores the D9 self-enrolment vulnerability), and the owner's final test of the new app against the online database is recorded.
Done when: All phase migrations are present and verified on `vhabpcoyypobgasacsko` and the owner accepts the final test.
Verify by: Before applying, the keyed-message count on the target, its exposed schemas (must exclude `private`), the count of participants without a member row (T28 backfill), and the complete `realtime.messages` policy list with predicates (T5 migration only checks names) recorded in TRACK; catalog/migration readback and smoke output from the target recorded in TRACK; the hand-off text; user confirmation of authorization and of the final test.
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
