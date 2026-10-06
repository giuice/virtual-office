# TRACK: phase-4-messaging-timeline

## T1 — Messaging tests run against local Supabase with two seeded accounts  [partial]
Plan version: 1
Covers: AC-031, AC-036
Root: T1
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- A local test mode exists: `npm run test:messaging:local:e2e` (= `playwright test -c playwright.messaging-local.config.ts --project=messaging-drawer`) starts its own Next dev server on :3210 (`reuseExistingServer: false`, output `.next-messaging-local`, `tsconfig.messaging-local.json`), overrides all Supabase env to local demo values, refuses to start if any env value contains `supabase.co`, and restores `next-env.d.ts` in teardown (`scripts/playwright-messaging-local-teardown.mjs`). Local values live in `__tests__/api/playwright/helpers/local-supabase-mode.ts` (public demo keys + local-only test values).
- The two-user fixture (`__tests__/api/playwright/fixtures/messaging.ts`) fails a local-mode test if any browser request/WebSocket reaches a hosted Supabase domain, and supports opt-in `messagingSeedOptions` (`includePinnedRoom`, `includeGroupConversation`, `historyMessageCount` ≤ 200) with `groupConversationId` / `historyConversationId`.
- The test seeder (`src/lib/test-utils/messaging-test-seeder.ts`) and seed route (`src/app/api/test/messaging/seed/route.ts`) now seed through `create_company_for_user` / `create_company_invitation` / `accept_company_invitation_membership`; the test company ("Playwright Messaging Company") and both memberships persist across runs (both local and default/online mode).
- A local messaging DB-integration harness exists: `npm run test:messaging:db` (= `vitest run --config vitest.messaging-db.config.mts`), `__tests__/messaging-db/` (loopback guard, fixtures building two same-company members sharing direct/group/room conversations, 25 history messages, an outsider in another company; full cleanup), excluded from the default `vitest.config.mts`.
- `.gitignore` (`/.next-messaging-local/`, `/playwright-report-messaging-local`), `eslint.config.mjs` (ignore `.next-messaging-local/**`), `package.json` scripts, and `epic-4A-drawer-interactions.spec.ts` AC2/AC3 (`includePinnedRoom: false`) changed. `.env.local`, `playwright.config.ts`, `next.config.ts`, and the `dev` script are unchanged.
- Local database (not online): migration `20260801155137_require_server_media_broadcast.sql` applied with `supabase migration up` (27/27); local kong/db containers restarted (stale port forwarding); persistent local data now includes 2 auth users + `users` rows, the shared test company, and 1 leftover space. No migration created or edited. Online database untouched.
Evidence:
- Orchestrator ran `npm run test:messaging:db` → 1 file, 3/3 passed (member sees direct/group/room; pages 20 then 5 older; non-member 0 conversations/0 messages).
- Orchestrator inspected `playwright.messaging-local.config.ts:44` → `reuseExistingServer: false`; `git status` matches the reported file set.
- Performer ran `npm run test:messaging:local:e2e` → 5 passed (AC1 realtime delivery, AC1 send errors, AC3 tabs, AC6, LIVE DELIVERY), 7 failed (AC2 ×2, AC3 filter, AC4 ×2, AC5, EXACT BADGE), 2 skipped (BADGE CLEARS, BURST — serial after EXACT BADGE).
- Performer network evidence: per-test annotations and trace show only `127.0.0.1:54321` and `localhost:3210`; `supabase.co` 0 occurrences in run logs.
- Performer: `npx tsc --noEmit` clean; ESLint on touched files 0 errors.
Verification: verified (harness and integration test); baseline E2E pass is not achieved
Discovered:
- [verified] Incoming message for a non-open conversation crashes the recipient page: `MessagingContext.tsx:270` calls `ensureOpenForMessage` without a timestamp → `useConversations.ts:570` sets `lastActivity: lastMessage.timestamp` (undefined) → `ConversationListItem.formatRelativeTime` (`:17-19`) reads `.getTime()` of undefined. Breaks EXACT BADGE/BADGE CLEARS/BURST (real-time delivery) — affects AC-031, T3, T6, T19.
- [reported, unconfirmed] Composer race: `message-composer.tsx:94-95` clears input after `await onSendMessage`, erasing text typed during an in-flight send — affects AC-031 (rapid send), T4.
- [reported, unconfirmed] Archive: client never sends `includeArchived` (`messaging-api.ts:346` only forwards when defined) and the repository drops archived conversations (`SupabaseConversationRepository.ts:177`), so archived items disappear and cannot be unarchived (AC5 test).
- [reported, unconfirmed] `ConversationListItem.tsx` menu items call `event.preventDefault()`, keeping the Radix menu open after Pin/Unpin/Archive and blocking clicks (AC2 ×2, AC3 filter tests).
- [reported, unconfirmed] AC4 ×2 tests are stale: `drawer-helpers.ts` `navigateToSpace` expects a card click to set `data-selected`; since the floor-plan redesign a click opens SpaceDetailPanel and `data-selected` follows the actual current space.
- [reported, unconfirmed] The placement toast on each page load (`useLastSpace.ts:93-95`) can cover the send button (flaky AC1 send errors).
- [reported, unconfirmed] Deleting a seeded space fails when `space_presence_log` references it (RESTRICT); trigger `private.reject_direct_service_role_membership_write` blocks service-role `company_id`/`role` changes on `public.users` — fixtures must set company at insert or use company functions.
- [reported, unconfirmed] Local Docker port forwarding for 54321/54322 can go stale; restarting kong/db containers fixes it.
Unresolved:
- AC-031 baseline E2E does not pass in local mode (7 failing, 2 skipped).
- No messaging test removed.
Risk:
- Default (online) mode seeding now keeps test accounts in one persistent company; if the online PLAYWRIGHT accounts belong to other companies, seeding throws instead of moving them. (Online test runs are not part of this phase's local-first strategy.)
User action:
- Local mode requires local Supabase up (`npm run db:local:start`), migrations applied (`npx supabase migration up --local`), and port 3210 free.
Deviation: Seeder and seed route were changed (task mentioned config/fixtures) because the database now rejects their membership writes; the company became persistent because the service role can no longer detach users. No app code changed, so the baseline remains partially failing.
Highest task ID reserved: T21
Gate: replan required

### Replan checkpoint — T1
Previous plan version: 1
New plan version: 2
Trigger: T1 partial — regression baseline 5 passed / 7 failed / 2 skipped in local mode.
Decision: owner (2026-10-04, native question UI) chose "Corrigir tudo agora": fix all pre-existing failures (real-time crash, composer race, Pin/Archive menu, archive visibility) and rewrite the 2 stale AC4 navigation tests in this phase.
Result: T22 (Continues: T1, Root: T1) plans the remainder; T3, T4, T5, T9, T12, T19 dependencies repointed T1 → T22.
Lineage: Root T1 — root_attempts 1, continuation_attempts 1 (T22 planned), continuation_limit 2, total_lineage_attempts 2/3, Blocker: none
Highest task ID reserved: T22
Gate: replan done (plan version 2)

## T22 — The messaging regression baseline passes in local mode  [done]
Plan version: 2
Covers: AC-031, AC-036
Continues: T1
Root: T1
Attempt: root_attempts 1, continuation_attempts 1, continuation_limit 2, total_lineage_attempts 2, total_lineage_limit 3
State delta:
- The local `messaging-drawer` regression baseline passes (14/14), so it can gate later tasks (AC-031 baseline).
- An incoming message for a non-viewed conversation only updates the list (activity time, order, optimistic +1 unread) via `MessagingContext.trackIncomingMessage` with the full realtime `Message`; the `getTime` crash is gone. Product behavior changed: the drawer no longer auto-opens/activates the conversation on a received DM, and the `getOrCreateUserConversation(senderId)` fallback (DM creation side effect) is removed.
- Composer clears only if its content still equals what was sent; text typed during an in-flight send survives; on failure content stays (compatible with T4).
- Background message refetch no longer replaces the feed with a skeleton: `useMessages.loadingMessages` = first load only; new `loadingMoreMessages` (`isFetchingNextPage`) disables "Load more" (wired via `contexts/messaging/types.ts`, `MessagingContext`).
- Pin/Unpin/Archive/Unarchive menus close after selection (Radix `onSelect` without `preventDefault`) and do not block the page.
- Conversation rows truncate long names so the actions button stays visible (scoped override of ScrollArea `display:table` wrapper in `ConversationList`).
- List filters (tab, Pinned, Archived) are owned by `MessagingDrawer`, survive opening a conversation and returning, reset on drawer close; back button has accessible name "Back to conversations".
- Archived conversations stay reachable (list query uses `includeArchived: true`; main list hides archived on the client); archived unread excluded from `totalUnreadCount`, used by `MessagingTrigger`.
- Tests: fixture dismisses the placement toast before actions (`addLocatorHandler`); `sendMessage` helper waits for the persisted id; AC4 ×2 rewritten to real moves through the card "Enter" action (accepted by `POST /api/presence/location`, card shows user inside and selected, drawer switches to the room chat, user returned to start space); AC5 archived view mandatory with reload checks; read-model badge tests assert the seeded baseline (1 unread) then exact totals 1+3, 1+1, 1+5.
- No migration, no database/schema change, no presence code touched, no unit test added or removed.
- Files: `src/contexts/messaging/MessagingContext.tsx`, `src/contexts/messaging/types.ts`, `src/hooks/useConversations.ts`, `src/hooks/useMessages.ts`, `src/components/messaging/{message-composer,message-feed,ConversationList,ConversationListItem,MessagingDrawer,MessagingTrigger}.tsx`, `__tests__/api/playwright/{epic-4A-drawer-interactions.spec.ts,messaging-read-model.spec.ts,helpers/drawer-helpers.ts,fixtures/messaging.ts}`.
Evidence:
- Orchestrator ran `npm run test:messaging:local:e2e` → 14 passed (2.2m), 0 failed, 0 skipped.
- Performer: two consecutive final runs → 14 passed / 0 failed / 0 skipped each (plus an earlier run on final code); baseline before fixes 4 passed / 8 failed / 2 not run.
- Performer: `npx tsc --noEmit` exit 0; eslint on 14 touched files 0 errors, warning counts identical to HEAD; vitest use-messages-pagination, floor-plan-bootstrap-states, modern-space-card → 47 passed.
- Orchestrator: HEAD `MessagingContext.tsx:166-167` comment "Auto-opening the drawer for received DMs is an explicit product requirement" (introduced in 47729ae) — removal escalated to the owner.
- Owner decision (2026-10-04, native question UI): "Não abrir sozinho" — accept removal of drawer auto-open; new messages update list/badges, desktop notifications (FR-023) cover background awareness; "read" always follows a user action. Verification of the decision: attested.
Verification: verified
Discovered:
- [verified] Default seed leaves the secondary with exactly 1 unread in the DM (badge tests now assert this baseline first) — affects T6 (AC-007 counter assertions), T19.
- [reported, unconfirmed] `readUnreadCount` in `messaging-read-model.spec.ts` falls back to the trigger badge (total across conversations) when the drawer is closed.
- [reported, unconfirmed] Leftover local test spaces in the shared test company ("Test Space 1 cf0148c8…", "Test Space 2" f70c79eb, 799d24b5); primary's sticky space is "Test Space 2 799d24b5…". Local only.
- [reported, unconfirmed] The sonner toaster (`layout.tsx`, bottom-right, offset bottom 88) overlaps the drawer composer for real users too (test-only mitigation applied).
- [reported, unconfirmed] Entering a space via "Enter" switches the drawer to that room chat (`useModernFloorPlanKnock.handleEnterSpace` → `onOpenChat`); `useAutoRoomConversation` is unused.
- [verified] The skeleton-on-refetch part of T3 is already resolved by this task; T3 remains for scroll-position preservation on older-page loads and bottom-anchoring rules — affects T3.
Risk:
- New messages in an archived conversation increment its own unread count but not the trigger badge, and do not unarchive it.
- Placement-toast handling is test-only; the fixture regex must follow toast text changes.
Deviation: Beyond the listed fixes, four additional app bugs exposed by the suite were fixed (skeleton swap losing composer text, row overflow hiding the actions button, filter state lost on navigation, back button accessible name); badge test expected totals corrected to the seeded baseline; AC4 now asserts the drawer follows into the entered room chat (current floor-plan behavior).
Highest task ID reserved: T22
Gate: plan holds

## T2 — Online migration history baseline recorded  [done]
Plan version: 2
Covers: AC-032, AC-033
Root: T2
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- A read-only baseline of online `vhabpcoyypobgasacsko` migration history vs repository vs local exists (below). Nothing was written online, locally, or to the repo.
- Verdict: GO for new Phase 4 migrations applied one at a time (run only that file's SQL transactionally, record only that version, read back, smoke). NO-GO for `supabase db push` (any form, especially `--include-all`), `migration up --linked`, or broad/invented `migration repair`.
- Comparison: 27 repo / 27 local / 22 online; 18 shared; 9 repo-only (20260610183000, 20260610183139, 20260610210000, 20260611120000, 20260612130141, 20260612180000, 20260612190000, 20260612200000, 20260612210000 — not recorded online but their objects are in effect online); 4 online-only (20250829092004 add_messages_to_realtime_publication, 20251120190125 refactor_pinned_and_starred_messages_v2, 20251210120345 allow_public_invitation_validation_by_token, 20260210123736 invitation_system_hardening). No same-name/different-version case. Newest online = newest repo = 20260801155137.
- Shared-version statement diffs: 20260716175515 statement 4 (`pg_catalog.coalesce(` online vs `coalesce(` repo; function since replaced by 20260720131318, live online definition has no `pg_catalog.coalesce`); 20260727123730 statement 10 comment-only (local DB applied from an earlier draft without the comment).
Evidence:
- Orchestrator ran `npx supabase migration list --linked` (read-only) → JSON with 4 remote-only, 9 local-only, 18 shared versions; matches the table.
- Orchestrator: `git status --short supabase/migrations` → 0 changes.
- Performer: `migration list --local` → 27 applied; SELECT on online/local `supabase_migrations.schema_migrations` → names/statement counts match for 18 shared; whitespace-normalized hashes match 16/18 (2 diffs above).
- Performer: online/local catalog fingerprint (756 local / 760 online items across public/private columns, policies incl. storage/realtime, function bodies + ACLs, indexes, triggers, table ACL/RLS/FORCE RLS, constraints) → only differences: 4 online-only storage policies and 1 comment-only function difference. Both PostgreSQL 15.8. Realtime publication identical (conversation_members, conversations, message_attachments, message_reactions, message_read_receipts, messages, spaces, users). Attachments bucket private, 10 MiB, same MIME list on both.
Verification: verified
Discovered:
- [reported, unconfirmed] Online-only: bucket `user-uploads` (public, 1 MiB, jpeg/png/webp) and 4 `storage.objects` avatar policies ("Avatar uploads are publicly accessible" SELECT; "Users can upload/update/delete their own avatars"); absent locally. Phase 4 storage migrations must not collide with these names nor assume their absence — affects T12, T15.
- [reported, unconfirmed] No `storage.objects` policy exists for the `attachments` bucket online or locally; attachment access is server-route + signed URL only — affects T12, T15.
- [reported, unconfirmed] Online history stores full SQL statements per version (some with CRLF), enabling whitespace-normalized hash readback after each application — affects T5, T7, T9, T12, T15.
- [reported, unconfirmed] Mapping doc `docs/presence-remediation/phase-0-baseline-mapping-2026-07-10.md` cited by the baseline header does not exist.
Unresolved:
- Provenance of the 4 online-only and 9 unrecorded June versions is not reconciled (does not block targeted applications).
Risk:
- Running `supabase db push` (especially `--include-all`) would re-run June migrations against production.
- Online state can drift; repeat `migration list --linked` and a targeted catalog check immediately before each online application.
Highest task ID reserved: T22
Gate: plan holds

## T3 — Feed stays rendered and positioned during background refetch and history loading  [done]
Plan version: 2
Covers: AC-006, AC-025, AC-031
Root: T3
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- The feed keeps the reader's place: opening a conversation jumps to bottom; a new newest message is followed only when the reader is within 32px of the bottom or it is the reader's own send (`markOwnSend()` from `handleSendMessage`); older pages, background refetches, and incoming messages while scrolled up keep the first visible message at the same pixel offset (`src/hooks/ui/use-feed-scroll-anchor.ts`, layout effect; `message-feed.tsx` no longer scrolls to end on every `messages` change; wrappers carry `data-message-id`).
- `ScrollArea` (`src/components/ui/scroll-area.tsx`) accepts optional `viewportRef` (existing callers unaffected).
- Skeleton appears only on first load (T22 fix still holds); "Load more" kept, disabled while loading; no infinite scroll.
- Receipt-triggered refetches are coalesced per conversation (one per 100 ms burst, `cancelRefetch: false`, waits for an in-flight fetch) in `src/hooks/realtime/useMessageSubscription.ts`; previously each receipt row triggered a cancelling invalidate (~25 overlapping page-0 requests per mark-read) that silently cancelled in-flight "Load more".
- New E2E `__tests__/api/playwright/messaging-feed-stability.spec.ts` ("older pages and receipt refetches keep the reader in place; new messages follow the bottom rules", 45 seeded history messages) added to the `messaging-drawer` project in `playwright.config.ts` (suite now 15 tests).
Evidence:
- Orchestrator ran `npm run test:messaging:local:e2e` → 15 passed (2.6m), 0 failed, 0 skipped.
- Performer: new E2E against original feed code → failed ("first visible message changed"); after scroll fix only, `--repeat-each=5` → 2 passed / 3 failed (Load more cancelled by receipt refetch; timeout); after receipt coalescing, `--repeat-each=5` → 5/5 passed.
- Performer: E2E asserts no skeleton (MutationObserver), no remount (DOM marker), same first-visible id and offset ±2px across frames for 1.2s on Load more and on a receipt refetch (read icon turns green), plus bottom-follow rules for incoming/own messages.
- Performer: `vitest __tests__/message-subscription.test.tsx` 8/8; `npm run type-check` pass; eslint 0 errors on touched files; `git diff --check` clean.
Verification: verified
Discovered:
- [reported, unconfirmed] React 19 StrictMode calls ref callbacks twice with the same node; viewport logic must compare element identity.
- [reported, unconfirmed] Infinite-query refetches re-derive page cursors; the oldest loaded message can change after an incoming message — position logic must not assume stable page edges — affects T11.
- [reported, unconfirmed] Seed: `participants[0]` is the primary, who owns odd-numbered "History NNN" messages; messages ≈180px tall, drawer viewport ≈264px.
- [verified] Two other `invalidateQueries` calls in `useMessageSubscription.ts` keep default `cancelRefetch: true` (reaction DELETE on `['messages']`, image/file INSERT) and can still cancel an in-flight "Load more" — affects T11 (multi-page history loading), T13/T14 (attachment message inserts).
Risk:
- Sending a reply inside a thread still scrolls to bottom (unchanged behavior).
Highest task ID reserved: T22
Gate: plan holds

## T4 — Failed text send keeps composer content  [done]
Plan version: 2
Covers: FR-024, AC-029
Root: T4
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- A failed send keeps the composer text and reply target and shows an alert row (`role="alert"`, `data-testid="composer-send-error"`, "Mensagem não enviada.") with "Tentar de novo" (`data-testid="composer-send-retry"`); retry sends the current text with the current reply target; the row hides on a new attempt or when the text is cleared. The failure state is content-type independent (files can join it in T13). `message-feed.tsx` `handleSendMessage` now propagates errors; the reply target is cleared only on success and only if unchanged.
- Sends are one at a time: a ref-based in-flight guard plus disabled send button (`aria-busy`) block double-click/Enter/retry during an in-flight send (Enter mid-flight is ignored).
- No optimistic duplicate remains after failure (`useMessages.sendMessage` removes the `temp-*` message; `useMessages.ts` unchanged).
- `epic-4A-drawer-interactions.spec.ts`: "should handle message send errors gracefully" replaced by "should keep a failed send in the composer and deliver exactly one message on retry" (two accounts).
- UI copy is Portuguese for the new strings; the rest of the composer remains English ("Type a message...", "Replying to") → mixed-language composer.
- No migration, schema, RLS, or route change.
Evidence:
- Orchestrator ran `npm run test:messaging:local:e2e` → 15 passed (2.8m), 0 failed, 0 skipped; `message-composer.tsx:58,82` contain the retry copy/test id; `src/app/api/messages/create/route.ts` has no idempotency/client id.
- Performer: new E2E aborts the first create via route interception, asserts alert + enabled retry + text + reply preview + 0 feed copies; holds the retry request in flight, asserts disabled send and presses Enter; exactly 1 create request reached the server with content and replyToId, 201; recipient shows "1 reply" with exactly 1 copy.
- Performer mutation check: removing the in-flight guard makes the new test fail (2 create requests); guard restored.
- Performer: `tsc --noEmit` clean; eslint 0 errors on 3 touched files; `git diff --check` clean.
Verification: verified
Discovered:
- [verified] `/api/messages/create` accepts no idempotency/client id and `messages` has no column for one — a committed send whose response is lost, followed by "Tentar de novo", creates a second message, so AC-029 ("retry sends exactly one message") is not guaranteed in that failure mode — affects AC-029, T12, T13.
- [reported, unconfirmed] `MessageFeed` hides replies until the parent thread is expanded (recipient delivery of replies is checked via "1 reply").
Risk:
- Pressing Enter during an in-flight send does nothing; the user must press again after it resolves.
Deviation: New UI copy in Portuguese per SPEC J6/§13 rather than the composer's existing English strings.
Highest task ID reserved: T23
Gate: replan required

### Replan checkpoint — T4
Previous plan version: 2
New plan version: 3
Trigger: TRACK T4 [verified] discovery — no idempotency in the create contract; AC-029 needs work no task covered.
Result: T23 (Root: T23) added before T12; T12 also depends on T23; T4 removed from PLAN (done).
Highest task ID reserved: T23
Gate: replan done (plan version 3)

### Replan checkpoint — T5 (contract amendment before T5 record)
Previous plan version: 3
New plan version: 4
Trigger: owner amended BR-012/AC-032 (2026-10-04, chat): migrations stay local during the phase; all applied online together at phase end. Owner approved fixing the pre-existing anon EXECUTE on `mark_conversation_read` ("2. SIM").
Evidence: orchestrator read local ACL via `npx supabase db query --local` → `mark_conversation_read` {postgres=X, anon=X, service_role=X}; `get_unread_counts` {postgres, anon, authenticated, service_role}.
Result: per-task online gate removed from standing rules and from T5/T7/T9/T12/T15/T23 (local application + recorded rollback instead); T24 (anon cannot mark conversations read) and T25 (all phase migrations live online, phase end, owner OK) added; T21 depends on T25; owner checklist `MIGRATIONS-PENDENTES.md` created at the owner's request ("ANOTE EM ALGUM LUGAR O QUE FICOU PENDENTE DE MIGRAÇAO NA FASE").
Highest task ID reserved: T25
Gate: replan done (plan version 4)

## T5 — Receipts are recorded per visible message and unread counts follow them  [done]
Plan version: 4
Covers: FR-004, FR-006, AC-004, AC-005, AC-007, AC-032, AC-035
Root: T5
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- LOCAL database only: migration `supabase/migrations/20261004161806_message_read_receipts_per_message.sql` applied (local history 28 versions). NOT applied online — listed as pending in `MIGRATIONS-PENDENTES.md` (row 1) for T25.
- New `public.mark_messages_read(p_conversation_id, p_user_id, p_message_ids uuid[]) returns integer`: SECURITY DEFINER, `search_path=''`, execute only service_role; re-checks membership (42501), max 100 ids (22023), ignores ids of other conversations, never records the caller's own messages, idempotent (`on conflict do nothing`), returns new receipt count, does not move `last_read_at`.
- `public.get_unread_counts(uuid[])` replaced (same signature/return/ACL): unread = from others, newer than `last_read_at`, without the viewer's receipt (`last_read_at` stays the historical floor; old mark-all still yields 0).
- `PATCH /api/conversations/read` accepts optional `messageIds` (1–100 UUIDs, deduped): `requireConversationParticipant` → rate limit `conversation:read-receipts` (120/min) → `SupabaseConversationRepository.markMessagesRead`; returns `{success, recorded}`. Without `messageIds` the legacy mark-all path is unchanged. Null/non-object body → 400.
- `IConversationRepository.markMessagesRead` added; messaging-db fixtures gained a password export, `query` helper, rate-limit cleanup; new `__tests__/messaging-db/route-session.ts` (real @supabase/ssr cookies); `vitest.messaging-db.config.mts` aliases `server-only`. Client unchanged (still mark-all until T6).
Evidence:
- Orchestrator ran `npm run test:messaging:db` → 2 files, 9/9 passed.
- Orchestrator: local catalog → `mark_messages_read` ACL {postgres=X, service_role=X}, prosecdef true; migration file (119 lines) has no DROP/ALTER TABLE/TRUNCATE/DELETE.
- Performer: `read-receipts.test.ts` (6 tests, real route handler, real local sessions): 20 unread → 5 ids → recorded 5, counter 15, last_read_at unchanged; resubmit all 20 → recorded 15, counter 0; own messages never receipted; foreign-conversation ids → 0; non-member route 403, RPC as service_role for non-member 42501, member JWT calling RPC → 42501; bounds (101 ids, empty, non-UUID, null body) → 400; no session → 401; legacy body → 200, counter 0; history older than last_read_at without receipts counts as read.
- Performer: `npm run test:messaging:local:e2e` → 15/15; `npm run type-check` clean; eslint 0 errors; legacy route unit tests 24/24; `git diff --check` clean; cleanup leaves 0 test users/rate rows.
- Performer review gate: `supabase-rls-reviewer` → no blocker; its null-body finding fixed and tested.
- Performer online READ-ONLY measurement (`supabase db query --linked`, one SELECT): 96 member rows (0 null cursor), 81 messages, 15 receipts; old unread definition 0 = chosen definition 0; a pure no-receipt definition would give 63 across 12 member rows (reason for the last_read_at floor).
- Rollback SQL: drop `public.mark_messages_read(uuid, uuid, uuid[])`; restore previous `get_unread_counts` body (from migration 20260610210000); delete version `20261004161806` from `supabase_migrations.schema_migrations` — full text in the performer return, to be carried into the T25 notice.
Verification: verified
Discovered:
- [verified] `mark_conversation_read(uuid,uuid)` is executable by anon (security issue; owner approved fix → T24).
- [reported, unconfirmed] INSERT policy "Users can insert their own read receipts" on `message_read_receipts` only binds `user_id` to the caller: a signed-in user can insert receipts for conversations they are not in, for their own messages, or with a forged `conversation_id`; cannot corrupt others' counts but undermines "Lida por" trust — affects T7, T8.
- [reported, unconfirmed] `conversation_members.last_read_at` is set at membership creation; unread test messages must be stamped after now().
Risk:
- The new client path (T6) returns 500 against a database without `mark_messages_read`; phase-end order: all migrations online first, then the app deploy.
Highest task ID reserved: T25
Gate: plan holds

## T24 — Anonymous clients cannot mark conversations read  [done]
Plan version: 4
Covers: AC-035
Root: T24
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- LOCAL database only: migration `supabase/migrations/20261004170724_revoke_mark_conversation_read_from_clients.sql` applied (transactional, re-runnable: `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role`). Only service_role can execute `public.mark_conversation_read(uuid,uuid)` locally. NOT applied online — `MIGRATIONS-PENDENTES.md` row 2.
- New integration test `__tests__/messaging-db/mark-conversation-read-acl.test.ts`: anon-key RPC call denied; signed-in member RPC call denied; neither changes `last_read_at` or receipts; legacy `PATCH /api/conversations/read {conversationId, userId}` still 200 with unread counter 0.
Evidence:
- Orchestrator ran `npm run test:messaging:db` → 3 files, 10/10 passed.
- Orchestrator local readback `has_function_privilege` → anon false, authenticated false, service_role true.
- Performer: new test failed before the migration (anon call succeeded — hole reproduced locally); passed after.
- Performer: only caller `SupabaseConversationRepository.ts:360`, invoked from `route.ts:87` with `ctx.serviceClient` (`createSupabaseServerClient('service_role')`, `authorize.ts:97`).
- Performer: migration re-run succeeded with unchanged ACL; `npm run test:messaging:local:e2e` 15/15; tsc clean; eslint clean; `git diff --check` clean.
- Performer review gate: `supabase-rls-reviewer` → no blockers.
- Rollback SQL: `grant execute on function public.mark_conversation_read(uuid, uuid) to anon;` (restores pre-T24 ACL and reopens the hole; prefer forward fix).
Verification: verified
Discovered:
- [reported, unconfirmed] Root cause: Supabase default privileges in schema `public` grant EXECUTE to anon/authenticated/service_role on function creation; 20260610210000 revoked only public/authenticated. Any later DROP+CREATE of this function must repeat the revoke — affects any future migration touching it.
- [reported, unconfirmed] Locally `get_unread_counts(uuid[])` is also executable by anon (scoped by `private.current_app_user_id()`, expected null for anon); left unchanged.
Risk:
- Online ACL not verified; T25 must read `has_function_privilege` on the target before/after and smoke the legacy mark-read route.
Highest task ID reserved: T25
Gate: plan holds

## T6 — The drawer marks only messages actually seen  [done]
Plan version: 4
Covers: FR-004, FR-006, AC-004, AC-005, AC-007
Root: T6
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- The drawer sends receipts only for messages actually seen: `src/hooks/ui/use-visible-message-receipts.ts` (wired in `message-feed.tsx`) observes items with an IntersectionObserver rooted at the feed viewport (MutationObserver for new items); seen = ≥50% of the item on screen (or ≥50% of the viewport for taller items); active only when the drawer is open, not minimized, in conversation view, feed rendered, and `document.visibilityState === 'visible'`; on-screen items are sent when the tab becomes visible. Skips own messages, `temp-*`/non-UUID ids, already-sent ids, DM messages already READ. Batching: 300 ms delay, ≥1 s between requests, ≤100 ids, retry after 5 s on failure, flush on unmount.
- Legacy mark-all is no longer called by the drawer: the mark-on-open effect in `MessagingContext.tsx` is removed; `markConversationAsRead` replaced by `markMessagesAsRead(conversationId, messageIds)` → `messagingApi.markMessagesAsRead` (PATCH `{conversationId, messageIds}`), list refetched when `recorded > 0`. `messagingApi.markConversationAsRead` kept (legacy, unit-tested).
- `useConversations.updateConversationWithMessage` increments unread for others' messages even in the active conversation (unread until seen).
- Root-cause fix in `useMessageSubscription.ts`: a realtime INSERT no longer creates a messages cache entry for a never-loaded conversation (previously a one-row entry hid older history for up to 5 min staleTime and made it unreadable; BURST failed 4/4 before, 4/4 pass after).
- `MessagingDrawer.tsx`: minimized button `data-testid="messaging-drawer-minimized"`.
- New E2E `__tests__/api/playwright/messaging-visible-read-receipts.spec.ts` (in `messaging-drawer` testMatch); helpers `feedViewport`, `backToConversationList`, `readListUnreadCount`, `scrollFeedToTopStepwise`, `setTabHidden` in `drawer-helpers.ts`.
- Existing tests: "BADGE CLEARS…" (renamed "…once the messages are seen") and "BURST CONVERGES…" previously asserted 0 in conversation view where no badge renders (vacuous); now assert newest message on screen + sender indicator green + scroll-through + list-row 0 (stronger); timeouts 60 s. `messaging-feed-stability.spec.ts`: secondary scrolls History 27 into view (≥50%) before receipt-refetch checks. Fixture toast handler `dispatchEvent` has 2 s timeout + catch (flake fix).
- No migration or database change.
Evidence:
- Orchestrator ran `npm run test:messaging:local:e2e` → 17 passed (4.2m), 0 failed, 0 skipped; `MessagingContext.tsx` has no `markConversationAsRead` call.
- Performer new spec (exact visible subset): counter 1 → 0 on seed message; 20 arrive in list view (counter 20, no PATCH); opened with tab hidden and drawer sized so newest 5 fully visible and 6th <20% (ratios asserted) → no PATCH, server unread 20; tab visible → sent ids exactly newest 5, server READ exactly those, server and list counter 15, sender's green indicators exactly those 5; scroll all → 20 READ, list 0, server 0, no id resent, every request 1–100 ids, no request without `messageIds`.
- Performer new spec (minimized/hidden): minimized → no PATCH, unread 1; restored → READ, 0; hidden + 2 scrolled into view → no PATCH, unread 2; visible → only on-screen ids sent, server READ/unread match.
- Performer: suite 17/17 twice consecutively; local-traffic guard passed; `npm run type-check` exit 0; eslint 0 errors; `npm test` 111 files / 1291 tests passed; `git diff --check` clean.
Verification: verified
Discovered:
- [verified] Old badge assertions made while a conversation was open were vacuous (trigger badge hidden when drawer open; list not rendered in conversation view) — affects review of any remaining badge tests (T19, T21).
- [reported, unconfirmed] In group/room conversations READ status cannot be used to skip already-receipted ids, so reopening resends visible ids once per session (idempotent server-side).
Decision (orchestrator, recorded): "tab visible/focused" (BR-001; owner's words R1-q4 "aba do navegador em foco") is implemented as the tab being the foreground tab (`document.visibilityState === 'visible'`), not window focus (`document.hasFocus()`). A visible but unfocused window still produces receipts. Not escalated; noted for owner UAT.
Risk:
- With the reader at the bottom, the list/trigger count briefly rises by 1 for an incoming message in the active conversation until the receipt refetch (~0.5 s).
- 50% visibility threshold is a design choice for "visibly rendered".
Deviation: realtime cache fix in `useMessageSubscription.ts` and toast-handler hardening in the fixture (both needed for Done when); one test-only `data-testid`.
Highest task ID reserved: T25
Gate: plan holds

## T7 — Reader details are available only to the message sender  [done]
Plan version: 4
Covers: FR-003, AC-003, AC-032, AC-035
Root: T7
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- New route `GET /api/messages/[messageId]/readers`: sender → 200 `{ readCount, readers: [{ userId, displayName, avatarUrl, readAt }] }` (read_at desc, then user_id; distinct non-sender readers; `Cache-Control: private, no-store`); non-sender member → 403 `NOT_MESSAGE_SENDER` (no reader/count fields); non-member → 403 `NOT_PARTICIPANT`; no session 401; non-UUID 400; unknown 404. Auth via `requireMessageParticipant` (getUser → supabase_uid) + `senderId === dbUser.id`; receipts read with the user-scoped client.
- `SupabaseMessageRepository.getReadReceipts` (no callers) replaced by `getMessageReaders(messageId, senderId)` (single query embedding users display_name/avatar_url; excludes sender's own receipt); `IMessageRepository` updated; unused ReadReceipt mappers removed (type kept); new `MessageReader` type; client `messagingApi.getMessageReaders(messageId)` for T8. No UI.
- LOCAL database only: migration `supabase/migrations/20261004180918_message_read_receipts_reader_or_sender_only.sql` applied — `message_read_receipts` now has exactly one policy `message_read_receipts_select_reader_or_sender` (SELECT, authenticated: own receipts OR receipts on messages I sent); dropped "read_receipts_in_own_conversations", baseline "Users can view their own read receipts", and the client INSERT policy "Users can insert their own read receipts". NOT applied online — `MIGRATIONS-PENDENTES.md` row 3.
- Tests: new `__tests__/messaging-db/message-readers.test.ts` (4 tests); fixtures opt-in `withGroupThirdMember`.
Evidence:
- Orchestrator ran `npm run test:messaging:db` → 4 files, 14/14 passed; local `pg_policy` on `message_read_receipts` → only `message_read_receipts_select_reader_or_sender` (SELECT).
- Performer: new tests failed 2/4 before the migration (non-sender member's direct SELECT saw another reader's receipt; non-sender received another reader's Realtime INSERT) — leak reproduced; client INSERT hole confirmed (authenticated non-member INSERT 0 1, rolled back).
- Performer: after migration — sender gets two readers ordered with name/avatar; stray own receipt excluded; unread own message → readCount 0; non-sender 403 without fields; non-member 403; 401/400/404; direct SELECT: sender sees both, non-sender only own, outsider none; published `findByConversation` still marks sender's message READ; client INSERT → 42501 (own message, non-member, forged conversation_id); Realtime: sender receives both INSERT events, non-sender only own.
- Performer: migration re-run OK; rollback executed inside a rolled-back transaction restored the 3 original policies; `npm run test:messaging:local:e2e` 17/17; type-check pass; eslint 0 errors; `git diff --check` clean; `supabase-rls-reviewer` → no blockers/majors.
- Rollback SQL (reopens both leaks): recreate "read_receipts_in_own_conversations", "Users can view their own read receipts", "Users can insert their own read receipts"; drop `message_read_receipts_select_reader_or_sender` — full text in the migration header.
Decision: SELECT narrowed (reader-or-sender); client INSERT policy dropped (only service_role RPCs write receipts; verified in source on staging/origin main by performer); non-sender response 403 `NOT_MESSAGE_SENDER` (empty 200 would look like "Lida por 0").
Verification: verified
Discovered:
- [reported, unconfirmed] anon/authenticated still hold ALL table grants on `message_read_receipts` (incl. TRUNCATE/TRIGGER/REFERENCES); RLS denies DML; TRUNCATE not RLS-governed but not exposed by PostgREST — optional defense in depth, not done.
- [reported, unconfirmed] A reader whose users row the sender cannot see returns `displayName`/`avatarUrl` null — T8 must render a fallback name — affects T8.
Risk:
- Online policy set unverified: if another permissive SELECT policy exists online, the leak would remain. T25 must list `pg_policy` for this table before/after and repeat sender/member/outsider SELECT and INSERT smokes.
- New GET has no rate limit (read-only, sender-only).
Deviation: `getReadReceipts` replaced by `getMessageReaders` (no callers; lacked name/avatar).
Highest task ID reserved: T25
Gate: plan holds

## T8 — Senders see "Lida por N" with a live reader list  [done]
Plan version: 4
Covers: FR-001, FR-002, FR-005, AC-001, AC-002, AC-003, AC-006, AC-037
Root: T8
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- In direct, group, and room conversations, the sender's own messages show a "Lida por N" button (distinct non-sender readers) next to the status icon when N ≥ 1; N = 0 keeps the existing sent/delivered icon (never "Lida por 0"). `src/components/messaging/MessageReadReceipts.tsx`, rendered by `message-item.tsx` for own messages with readCount > 0.
- Click/Enter/Space opens a Radix Popover dialog ("Leitores da mensagem: Lida por N") listing readers newest first with `EnhancedAvatarV2`, name (fallback "Usuário"), pt-BR time (HH:mm today, dd/mm/aaaa HH:mm otherwise); no denominator/not-read list; Escape closes and restores focus; `data-avatar-interactive`, click propagation stopped; portal stops click/pointerdown/keydown; width `w-64 max-w-[calc(100vw-2rem)]`.
- N comes from the feed: the paginated repository receipts query selects `message_id, user_id` and sets optional `Message.readCount` (non-sender receipts); `GET /api/messages/get` strips `readCount` from messages the viewer did not send. Reader list fetched only while open via `src/hooks/queries/useMessageReaders.ts` (`['message-readers', id]`, staleTime 0) → T7 API.
- Live: receipt INSERT handler still triggers the coalesced `['messages', conv]` refetch and now also invalidates `['message-readers', message_id]`.
- Test support: seeder/seed route opt-in `includeThirdMember` (third company member in the group, never signs in); test-only `PATCH /api/test/messaging/seed` records that member's reads via `mark_messages_read`; fixture exposes `tertiary`, `markReadAsSeededMember`; local-only `PLAYWRIGHT_TERTIARY_*`; seeder `ensureCompanyMember` helper.
- Review-gate follow-up (seed route hardening): constant-time secret check (SHA-256 + `timingSafeEqual`) for POST/PATCH/DELETE; 404 when NODE_ENV=production or VERCEL_ENV in {production, preview}; PATCH validates UUIDs/1–100 ids and returns 403 unless userId is a member and every member's email is a PLAYWRIGHT_*_EMAIL account (`MessagingTestSeeder.isSeededConversationMember`); POST 403 for non-allowlisted seed users; `ensureAuthUser` refuses emails outside `allowedEmails`.
- New spec `__tests__/api/playwright/messaging-read-by.spec.ts` (3 tests) in `messaging-drawer` (suite now 20). No migration; no database change.
Evidence:
- Orchestrator ran `npm run test:messaging:local:e2e` twice: 20 passed (5.4m) before the hardening follow-up and 20 passed (5.5m) after; `seed/route.ts:1,28-29,37` show `timingSafeEqual` and VERCEL_ENV guard.
- Orchestrator-run review gate: `supabase-rls-reviewer` on the T8 diff → no blockers; no reader identity/count leak to non-senders (readCount stripped in `/api/messages/get`, `/readers` 403 for non-senders, RLS + Realtime limited to reader/sender), no users.id/supabase_uid misuse, no client service-role exposure; majors M1 (test PATCH could mark any member's messages) and M2 (non-timing-safe secret, NODE_ENV-only guard) — both fixed in the follow-up; minor m1 (password reset of existing matching auth users) fixed.
- Performer: read-by spec — direct: "Lida por 1" live, Enter opens, Escape returns focus; group: Space opens, third member's read updates list 1→2 and button "Lida por 2" without reload, order third then secondary, sender never listed; room: click opens, fits 384px drawer, clicking inside doesn't close or trigger parents; all: no "Lida por 0", recipient sees no button, no readCount in payload, readers endpoint 403.
- Performer mutation check: removing the reader-list invalidation fails the group test (2 expected, 1 got).
- Performer guard checks (temporary spec, deleted): missing/wrong/±1-char secret → 401 on all methods; non-seeded user or presence conversation → 403; malformed id → 400; non-allowlisted POST users → 403; presence-* auth users' updated_at unchanged.
- Performer: type-check clean; eslint 0 errors on touched files; `git diff --check` clean.
Verification: verified
Discovered:
- [reported, unconfirmed] Local suite creates a persistent third account `messaging-tertiary@local.test` in the shared local test company.
- [reported, unconfirmed] epic-4A "should keep a failed send in the composer and deliver exactly one message on retry" failed once (sender `reply-count-<parent>` not visible within 5s), then passed 5× in isolation/full runs and in both orchestrator runs — watch for flakiness — affects AC-029 evidence stability, T23, T21.
Risk:
- The button count follows the coalesced feed refetch while the open list refetches immediately; the list header may briefly be one ahead.
- The test PATCH accepts any conversation whose members are all Playwright accounts (test accounts only; secret + non-production required).
- Hosted (non-local) mode would need `PLAYWRIGHT_TERTIARY_EMAIL` (not run by design).
Highest task ID reserved: T25
Gate: plan holds

## T9 — Starred messages of a conversation are listable with pagination  [done]
Plan version: 4
Covers: FR-021, AC-024, AC-035
Root: T9
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- New route `GET /api/messages/starred?conversationId=&limit=&cursorBefore=` (`src/app/api/messages/starred/route.ts`) returns `{ messages, nextCursorBefore?, hasMoreOlder }`: only the caller's starred messages in that conversation, ordered by message date newest first (ties by id desc), default 20 / max 50, feed cursor format `"{raw_pg_timestamp}|{id}"` strictly validated; 401 / 403 `NOT_PARTICIPANT` (non-members and removed members) / 404 unknown conversation / 400 bad params; `requireConversationParticipant` + user-scoped client; `readCount` stripped for non-sent messages; `Cache-Control: private, no-store`.
- Feed-shaped messages via new private `enrichFeedMessages` in `SupabaseMessageRepository.ts` (extracted unchanged from `findByConversation`, which now calls it — single enrichment path). `getStarredMessages(userId, conversationId, {limit, cursorBefore}) => PaginatedResult<Message>` (repository + `IMessageRepository`), driven from the caller's star rows with an inner-joined message; keeps only the caller's own stars.
- Client `messagingApi.getStarredMessages(conversationId, {limit, cursorBefore})` for T10. No UI. No migration.
- New test `__tests__/messaging-db/starred-messages.test.ts` (3 tests, real routes and sessions).
Evidence:
- Orchestrator ran `npm run test:messaging:db` → 5 files, 17/17 passed; `git status supabase/migrations` → only the three already-recorded phase migrations (no new one).
- Performer tests: order by message date independent of star order; pages 3/3/1 with correct hasMoreOlder and no duplicates/gaps; identical timestamps paged 2/2/1 by id desc; other member's star hidden; other-conversation star excluded; starred message older than the first 20-message feed page included; each message carries exactly the caller's star; readCount rules; 403 outsider and removed member; 401/404/400 incl. junk and filter-injection cursor.
- Performer: `npm run test:messaging:local:e2e` 20/20; type-check clean; eslint 0 errors; `git diff --check` clean.
- Performer EXPLAIN ANALYZE (local, authenticated role with RLS, 100k-message conversation, 200 own stars + 20k elsewhere + 5k other member): star-driven query 11.3 ms first page / 3.1 ms deep page (message-driven shape 4035 ms); candidate index `starred_messages(user_id, conversation_id)` 10.3 / 2.2 ms → no migration added.
- Performer review gate: `supabase-rls-reviewer` → no blockers; hardening applied (own-star filter; cursor-validation note on interface).
Verification: verified
Discovered:
- [reported, unconfirmed] `trigger_sync_conversation_members` only inserts members; the app has no member-removal path (tests simulate removal by deleting the row) — affects T11 (AC-026 "lost access" scenario).
- [reported, unconfirmed] Pre-existing: `/api/messages/get` interpolates `cursorBefore`/`cursorAfter` into an `or(...)` filter without validation (bounded by conversation filter + RLS); the starred route's `querySchema` could be reused.
- [reported, unconfirmed] Pre-existing: messages SELECT policy evaluates `private.is_conversation_member` per row (dominant cost in message-driven queries).
- [reported, unconfirmed] Pre-existing: unknown conversation 404 vs existing 403 reveals existence (low risk, UUIDs).
Risk:
- The query relies on PostgREST embedded-resource ordering/filtering (`order=message(timestamp)`, `message.or=`), verified on local PostgREST v12.2.3; online PostgREST version not checked (no DB change needed) — check in T25/T21 smoke.
Highest task ID reserved: T25
Gate: plan holds

## T10 — Star/unstar and the starred filter work in the production feed  [done]
Plan version: 4
Covers: FR-020, FR-021, AC-023, AC-024, AC-037
Root: T10
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Production feed "Mais ações" menu has "Favoritar" / "Remover dos favoritos" (mouse + keyboard); starred messages show a yellow star (role=img "Favoritada", `message-starred-{id}`). Reuses optimistic mutations in `useMessageActions.ts` (now used by `MessageFeed`); mutations also update/rollback/invalidate the starred cache; Portuguese error toasts; typed cache helpers.
- Feed header toggle "Favoritas" (`aria-pressed`, `starred-filter-toggle`) switches to my starred messages in the conversation (newest message first, 20/page, "Carregar mais favoritas", includes messages older than loaded feed pages; empty state "Nenhuma mensagem favoritada nesta conversa"; error state with "Tentar novamente"); toggling off returns to the feed at the newest message; per-conversation; composer stays mounted.
- New `src/hooks/queries/useStarredMessages.ts` (`['starred-messages', conversationId]`, staleTime 0, enabled only while open) and `src/components/messaging/StarredMessagesView.tsx` (results wrapped with `data-message-id`, `data-starred-result-id`, `data-testid="starred-result-{id}"` — T11 hook point).
- `useVisibleMessageReceipts` switches between feed and starred view; starred results seen in the drawer count as read (BR-001), shared already-reported set.
- `message-item.tsx`: action bar stays mounted while its dropdown is open (root-cause fix: focus moving into the portaled menu unmounted the bar and closed the menu on the keyboard path); More trigger `aria-label="Mais ações"`; menu content stops keydown propagation; star item no longer calls preventDefault.
- New E2E `__tests__/api/playwright/messaging-starred.spec.ts` registered in `messaging-drawer` (suite now 21). No migration; no database change.
Evidence:
- Performer: starred spec passed — 45 history messages, 20 API stars + keyboard star on History 40 + pointer star on History 10 (only after Load more); toggle via Enter/Space; menu via Enter/ArrowDown/Enter; starred view 20 newest-first then "Carregar mais favoritas" → 22 in order; keyboard unstar removes the result (DELETE 200); toggling back shows feed at newest with stars; B sees no stars (empty `stars` in payload, empty starred view); A's second context after reload shows the star and the correct starred list.
- Performer full suite: run 1 → 20 passed / 1 failed (`messaging-read-by` room test, fixture login "Unable to reach the authentication service" from local Auth, before T10 code); run 2 → 21 passed / 0 failed / 0 skipped.
- Orchestrator full run `npm run test:messaging:local:e2e` → 20 passed / 1 failed: `messaging-read-model.spec.ts` "BURST CONVERGES to exact badge count and all messages appear once" (35.8s); orchestrator re-ran BURST `--repeat-each=3` → 3/3 passed (failure artifacts overwritten; cause unknown).
- Performer: type-check clean; eslint 0 errors, no new warnings; `git diff --check` clean.
Verification: verified (T10 postcondition: starred spec passes; full suite has intermittent failures in tests unrelated to T10 — see Discovered)
Discovered:
- [verified] The local messaging suite is intermittently unstable: across recent full runs, three different tests failed once each and then passed on rerun — epic-4A failed-send/retry (TRACK T8), `messaging-read-by` room (local Auth unreachable at login), BURST CONVERGES (this entry). AC-031 requires the regression suite to pass after each slice; flakiness makes that evidence unreliable — affects AC-031, T21 and every remaining task's regression check.
- [reported, unconfirmed] Production feed "Pin Message" entry does nothing (`MessageFeed` passes no `onPin`) and stays English while star entries are Portuguese (mixed copy) — affects AC-037/usability review in T21.
Risk:
- Returning from the starred view puts the feed at the newest message (FR-021 does not require position retention).
- After unstarring in the starred view, keyboard focus drops to the document body.
- Stars reach A's other session only after refresh (as AC-023 specifies).
Deviation: fixed the action-bar unmount bug in `message-item.tsx` (needed for keyboard operation, AC-037).
Highest task ID reserved: T26
Gate: replan required

### Replan checkpoint — T10
Previous plan version: 4
New plan version: 5
Trigger: TRACK T10 [verified] discovery — intermittent failures of three different regression tests make the AC-031 gate unreliable.
Result: T26 (Root: T26, "The local messaging suite passes reliably") added before T11; T11 depends on T10 and T26; T10 removed from PLAN (done).
Highest task ID reserved: T26
Gate: replan done (plan version 5)

## T26 — The local messaging suite passes reliably  [done]
Plan version: 5
Covers: AC-031
Root: T26
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- App fix 1 (stale refetch dropped saved messages): `src/lib/messaging/message-cache.ts` new `keepMessageThroughInflightFetch(queryClient, conversationId, message)` — when a feed fetch is in flight, re-merges the message after it settles (not if the message left the cache meanwhile: deleted / rolled-back send); `replaceMessageInPages` now appends the saved message when neither temp nor saved copy is cached. Called from the send success path (`src/hooks/useMessages.ts`) and the realtime INSERT path (`src/hooks/realtime/useMessageSubscription.ts`).
- App fix 2 (late Realtime join had no catch-up): on each (re)join, on the server `system` event `{extension:'postgres_changes', status:'ok'}`, `useConversationRealtime.ts` refetches `['conversations', userId]` and `useMessageSubscription.ts` schedules the existing non-cancelling deferred refetch for every cached `['messages', id]` feed (helper renamed `scheduleReceiptRefetch` → `scheduleFeedRefetch`).
- Test sync: `messaging-read-model.spec.ts` EXACT BADGE, BADGE CLEARS and BURST wait for the recipient's `waitForRealtimeReady` before expecting live badge updates.
- New regression tests (suite 21 → 23): `messaging-feed-stability.spec.ts` "a reply saved while an older feed refetch is in flight stays in the sender feed" (holds a real feed response during the create; MutationObserver asserts the reply indicator never leaves the DOM); `messaging-read-model.spec.ts` "LATE JOIN catches the badge up on messages sent before the recipient Realtime joined" (`routeWebSocket` holds the recipient's Realtime until 3 sends are confirmed).
- Harness: `fixtures/messaging.ts` `login()` resubmits once only when the password `POST /auth/v1/token` fails in transit (`requestfailed`), with an `auth-transport-retry` annotation; any other outcome (second transport failure, wrong credentials, rate limit, no redirect) fails with a message naming the reason and the page alert. `playwright.messaging-local.config.ts`: `trace`/`video` `retain-on-failure` (the mode has no retries, so `on-first-retry` never recorded).
- No migration; no database change; `.env.local` untouched; local DB not reset.
Evidence:
- Performer: three consecutive full `npm run test:messaging:local:e2e` runs (17:51–18:19) → each 23 passed (9.3–9.5 min), report stats `{total:23, expected:23, unexpected:0, flaky:0, skipped:0}`, 0 `auth-transport-retry` annotations.
- Performer characterization: stale refetch — before fix the reply indicator vanished for 16 frames (143–391 ms); after fix 0 frames, 3/3; regression test with the helper disabled fails 2/2, enabled passes. Late join — without catch-up badge Expected 4 / Received 1 still after 15 s; with catch-up converges in ~1 s, 3/3. Failed-send test `--repeat-each=12` 12/12.
- Performer auth investigation: GoTrue 72 h logs 48,765 requests all 200 (1,208 `/token`), no 429/5xx; Kong no 5xx; two health probes during full runs (5,020 and 11,196 requests) 0 failures; aborting the token request reproduces the exact page text; forced 1-failure recovered with annotation, forced 2-failure failed with the diagnostic message (temporary hooks removed).
- Performer: type-check clean; eslint on touched files 0 errors (19 pre-existing warnings); `vitest run __tests__/messaging` 51/51; `__tests__/message-subscription.test.tsx` 8/8; `git diff --check` clean.
- Orchestrator: diff review of the four app files (cache helper subscribes to the query cache only while a fetch is in flight and unsubscribes on settle/removal/local drop; timers cleared on unmount); git status shows no new migration and no stray files.
- Orchestrator ran `npm run test:messaging:local:e2e` independently → 23 passed (8.7m), 0 failed / 0 skipped / 0 flaky, exit 0.
Verification: verified
Causes:
- epic-4A failed-send/retry: a feed fetch that read the server before the reply committed resolved after the reply was merged and replaced the cache with the older snapshot (reply and its count vanished until a later refetch). Mechanism reproduced (overlapping receipt-triggered `GET /api/messages/get` in server logs); fixed by app fix 1.
- read-by room login "Unable to reach the authentication service": not reproduced; rate limiting ruled out (0 × 429; a 429 shows "Too many attempts"); the request never reached Kong/GoTrue → host→Docker transport failure (local environment); mitigated by the single transport-only resubmission.
- BURST CONVERGES: not reproduced as a flake; inferred cause — test did not wait for recipient Realtime join and the app had no catch-up, so events before the join were lost; deterministic repro fails with the same signature (~36 s badge timeout). Original artifacts were overwritten, so this is inferred. Fixed by app fix 2 + test sync + LATE JOIN test.
Discovered:
- [reported, unconfirmed] `SUBSCRIBED` arrives before the server's postgres_changes-ready system event, so `data-messaging-realtime-ready` does not guarantee events are flowing; the new catch-up covers the window, the attribute was not changed — affects T20 (reconnect consistency builds on this catch-up).
- [reported, unconfirmed] Local `supabase_vector_virtual-office` container crash-loops (2,038 restarts); no measurable effect on the gateway — local environment only, no plan impact.
Risk:
- Production client behaviour: one extra `GET /api/conversations/get` and one deferred refetch per cached feed on every Realtime (re)join, including first page load.
- An optimistic `temp-` message can still vanish briefly if a refetch starts after the optimistic add and before commit; the saved copy is restored on success (not lost).
- Login and BURST causes rest on log/probe evidence and a matching deterministic repro, not on captured artifacts of the original failures; failure artifacts are now retained.
Deviation: app code changed in the messaging cache and Realtime hooks (root causes were app races); two regression tests added (suite 23, not 21).
Highest task ID reserved: T26
Gate: plan holds

## T11 — Selecting a starred result jumps to it in the feed  [done]
Plan version: 5
Covers: FR-022, AC-025, AC-026
Root: T11
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- `StarredMessagesView.tsx`: each result has a "Ver na conversa" button (`starred-open-{id}`, Enter/Space); a click on the result body also opens it (ignores clicks on its controls, portaled menus/pickers, and text-selection ends).
- `message-feed.tsx`: selecting a result returns to the normal feed and starts the jump (toggling "Favoritas" cancels it); collapsed parent threads of a reply expand; target wrapper gets `tabIndex=-1`, focus, 6 s highlight (yellow ring/background, `data-jump-highlighted`).
- New `src/hooks/ui/use-feed-jump.ts` (loading → found | unavailable → shown; aborts on conversation switch/unmount) and `src/components/messaging/FeedJumpStatus.tsx` (`role=status` "Carregando mensagens anteriores…"; `role=alert` "Não foi possível mostrar esta mensagem. Ela pode ter sido apagada ou você não tem mais acesso a ela nesta conversa." with focus and "Fechar aviso").
- `useMessages.ts`: new `loadHistoryUntilMessage(messageId, signal)` — re-reads the cache each round, `fetchNextPage({cancelRefetch:false})`, survives cancelling Realtime invalidations (reaction DELETE, image/file INSERT) by awaiting and re-requesting; stops on found / history exhausted / page error (e.g. 403) / abort / 100 rounds (~2,000 messages); never throws. Behaviour change: `errorMessages` only when nothing loaded yet — a failed older page or background refetch keeps the loaded feed (root cause of the error screen for a removed member).
- `use-feed-scroll-anchor.ts`: `scrollMessageIntoView(id)` centers and records the anchor at once.
- Context plumbing (`MessagingContext.tsx`, `contexts/messaging/types.ts`), type `MessageHistorySearchResult` in `src/types/messaging.ts`.
- Test-only: seed route PATCH `{action:'remove-member', conversationId, userId}` behind the existing guards; seeder `removeConversationMember`; fixture `removeSeededMember`.
- New E2E `messaging-starred-jump.spec.ts` (2 tests) in `messaging-drawer` (suite 25). No migration; no schema or production route/repository change.
- Orchestrator fix: the button test id was `starred-result-open-{id}`, which matched the starred spec's `[data-testid^="starred-result-"]` locator (40 results instead of 20) — renamed to `starred-open-{id}` in component and jump spec.
Evidence:
- Performer: jump spec `--repeat-each=4` → 8 passed. Test 1: History 3 (third page) via Enter with A's older-page response held → loading indicator visible; B's reaction removal triggers A's cancelling refetch mid-search; search re-requests the cancelled cursor and reaches History 3 (in viewport, focused, highlighted, indicator gone); History 35 by mouse on the body; reply by Space expands History 2's thread; button fits the 384 px drawer. Test 2: unknown id → exactly 2 older pages (200) then focused notice, no highlight, no loading after 2 s, dismissable; lost access (`removeSeededMember`) → notice, older-page requests 403, feed and composer stay, no error screen, no further requests after 2.5 s.
- Performer mutation check: restoring the old `errorMessages` rule makes the lost-access test fail.
- Performer: type-check exit 0; eslint on 14 touched files 0 errors (13 pre-existing warnings); `git diff --check` clean; `supabase-rls-reviewer` on seed route/seeder diff → no blockers (non-blocking: malformed uuid → 500 not 400; allowlist is a shape check, same trust level as existing PATCH).
- Orchestrator: deleted 40 leftover seeded conversations from the LOCAL DB with owner approval (47 messages, 80 member rows, 40 conversations; filter: test names and participants ⊆ the two Playwright users).
- Orchestrator full run `npm run test:messaging:local:e2e` → 24 passed / 1 failed (`messaging-starred.spec.ts` 20 expected, 40 received — the test-id collision above); after the rename → 25 passed (9.8 m), exit 0; `tsc --noEmit` clean.
Verification: verified
Discovered:
- [verified] An interrupted local E2E run (session/Docker drop) skips fixture cleanup and leaves a seeded direct conversation; every later seed then fails with `uniq_direct_participants_fingerprint` (HTTP 500) and the whole suite fails at seeding; a partially failed seed also leaves its rooms behind — affects AC-031 (regression gate reliability) and every remaining task's regression check.
- [verified] After a Docker restart, local Kong can return 502 for Auth until `supabase_kong_virtual-office` is restarted — local environment only.
- [reported, unconfirmed] Manual "Load more" can still be cancelled by the reaction-DELETE and image/file-INSERT invalidations (the jump search survives them itself) — affects T13, T14.
Risk:
- Starred messages older than ~2,000 messages from the newest end in the "not available" notice.
- A failed manual "Load more" now fails silently (button can be pressed again) instead of the full error screen with "Reload"; a background refetch error with data loaded also no longer shows the error screen — check in T21 usability (AC-037).
- Every "Ver na conversa" button has the same accessible name (no per-message description) — AC-037 review in T21.
Deviation: feed error-state rule changed in `useMessages.ts` (root-cause fix for AC-026); seed route extended with test-only `remove-member`; performer restarted Docker Desktop and the local Kong container; orchestrator renamed the colliding test id.
Highest task ID reserved: T26
Gate: replan required

## Replan checkpoint — T11
Old plan version: 5
New plan version: 6
Trigger: TRACK T11 [verified] discovery — an interrupted local run leaves seed data that makes every later local suite run fail at seeding, so the AC-031 gate breaks after any crash.
Result: T27 (Root: T27, "An interrupted local run never blocks the next one") added before T23; T23 depends on T27; T11 removed from PLAN (done).
Highest task ID reserved: T27
Gate: replan done (plan version 6)

## T27 — An interrupted local run never blocks the next one  [done]
Plan version: 6
Covers: AC-031
Root: T27
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Root cause: the seeder looked up an existing direct conversation by the raw `a:b` participant string while trigger `set_participants_fingerprint` stores `md5(sorted ids joined by ':')`, so a leftover direct conversation was never found and the insert hit `uniq_direct_participants_fingerprint`. Lookup now uses `ConversationResolverService.computeParticipantsFingerprint` and reuses the existing conversation.
- `src/lib/test-utils/messaging-test-seeder.ts`: `seed()` wraps `seedTracked()`; created messages/conversations/spaces are tracked (parallel inserts settle via `Promise.allSettled`) and `removePartialSeed` deletes them on failure before rethrowing (a reused direct conversation is kept; only its seeded messages go). New `sweepSeededLeftovers(allowedEmails)` deletes only conversations whose name starts with `test_dm_` / `Test Room Conversation N ` / `Test Group `, whose participants are non-empty and all allowlisted, and whose every member row is allowlisted (cascade to members, messages, receipts, reactions, stars, pins — verified in the local catalog); users, company and spaces kept.
- `src/app/api/test/messaging/seed/route.ts`: `DELETE {action:'sweep-leftovers'}` (strict zod), only when `VO_MESSAGING_LOCAL_SUPABASE=1` and `NEXT_PUBLIC_SUPABASE_URL` is loopback, else 404; all existing guards unchanged.
- New `__tests__/api/playwright/helpers/messaging-local-global-setup.ts` as `globalSetup` in `playwright.messaging-local.config.ts`: asserts local mode, calls the sweep, logs the count, fails the run if the sweep fails.
- New DB-integration test `__tests__/messaging-db/seed-recovery.test.ts` (2 tests, own namespaced fixture accounts): partial-seed rollback leaves nothing for its run and keeps the reused direct conversation; sweep removes an all-test-account seeded group and keeps seeded names with an outsider participant or member, non-seeded names, and the direct conversation. Test-policy note: integration tests guarding a destructive helper (not unit tests). DB suite 6 files / 19 tests.
- No migration; local DB only.
Evidence:
- Performer: full run force-killed during test 3 → read-only query showed leftovers (`test_dm_0e26f3d7…` with 2 members/2 messages, `Test Room Conversation 1/2`); before the fix the next seed failed `500 … uniq_direct_participants_fingerprint` and itself leaked 2 rooms + 2 spaces; after the fix the next `npm run test:messaging:local:e2e` logged `removed 5 leftover seeded conversation(s)` and passed 25/25 (10.0 m), exit 0, no seeded conversations left afterwards.
- Performer: the 7 conversations outside sweep scope were identical before/after (4 Presence rooms, one non-seeded test-account room, 2 orphan rooms from the mutation check).
- Performer mutation checks: rollback disabled → rollback test fails; foreign-member filter disabled → sweep test fails; both restored byte-identical.
- Performer: `npm run test:messaging:db` 19/19; type-check clean; eslint on 5 touched files clean; `git diff --check` clean; `supabase-rls-reviewer` → no blockers/majors (users.id comparisons correct; service-role sweep reachable only after env block, secret, and local-mode check on the same URL the service client uses). Minors kept: sweep read+delete not atomic (runs once before any seed); a create whose follow-up `findById` fails would be untracked by rollback (next sweep removes it).
- Orchestrator: inspected the route guard (`VO_MESSAGING_LOCAL_SUPABASE`, loopback host set) and the global setup; ran `npm run test:messaging:db` → 6 files, 19/19 passed; then `npm run test:messaging:local:e2e` → sweep logged `removed 0 leftover seeded conversation(s)`, 25 passed (9.9 m), exit 0.
Verification: verified
Discovered:
- [verified] 2 orphan room conversations from the performer's first mutation-check run remain locally (`3fd61aa2-8022-48fe-bba5-eec3ba42c84f`, `f65a1287-7426-496b-90b9-afa398a67b3f`); participants are deleted msgdb fixture users, outside sweep scope, harmless — no plan impact.
- [reported, unconfirmed] Seeded `Test Space N <run>` spaces leak on every run (~204 in the local test company): cleanup cannot delete a space presence has used because local FKs from `users.current_space_id`, `space_presence_log`, `user_presence_sessions`, `knock_requests` are RESTRICT (baseline migration showed SET NULL/CASCADE for the first two) — affects local floor-plan clutter only; possible schema drift note for T21. Out of scope (presence data, presence-safety).
Risk:
- Sweep keys on seeded name prefixes; app-created test-account conversations under other names are not swept (seeder reuses such a direct conversation and the fixture cleanup deletes it).
- Sweep runs once per run; a test whose own cleanup fails mid-run leaves its direct conversation reused by later seeds in that run (no 500, but extra messages could affect count-based tests until the next run).
- The 404 without the local flag was confirmed by code review only, not exercised at runtime.
Deviation: two permanent DB-integration tests added (guard a destructive helper).
Highest task ID reserved: T27
Gate: plan holds

## T23 — Retrying a send never creates a duplicate message  [done]
Plan version: 6
Covers: FR-024, AC-029, AC-032, AC-035
Root: T23
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Migration `supabase/migrations/20261005000414_messages_client_message_id_idempotency.sql` (LOCAL ONLY): nullable `public.messages.client_message_id uuid` (no default) + partial unique index `messages_sender_conversation_client_message_id_key` on (sender_id, conversation_id, client_message_id) where not null; one transaction, `set local lock_timeout = '5s'`, re-runnable; no policy/grant/trigger/function change. Applied locally with `npx supabase migration up --local` (same method as T5/T24/T7); the real local rollback was run (column, index, history row → 0) and re-applied.
- Rollback (app rolled back FIRST — the T23 app fails every keyed create without the column):
  `begin; drop index if exists public.messages_sender_conversation_client_message_id_key; alter table public.messages drop column if exists client_message_id; delete from supabase_migrations.schema_migrations where version = '20261005000414'; commit;`
- `POST /api/messages/create` (`src/app/api/messages/create/route.ts`): optional `clientMessageId` (non-UUID → 400 `INVALID_CLIENT_MESSAGE_ID`); key already stored with the same content/type/replyToId → 200 with the stored message (no insert, no activity bump); same key with a different payload → 409 `CLIENT_MESSAGE_ID_REUSED`; new → 201; no key → legacy path unchanged.
- Repository `createWithClientKey(data, key) → {message, created}` (`SupabaseMessageRepository.ts`, `IMessageRepository.ts`): lookup scoped to sender+conversation+key, insert, on 23505 read the winning row (throws if none); `create` refactored onto shared insert/map helpers (behaviour unchanged); type `MessageCreateResult` in `src/types/messaging.ts`.
- Client: composer makes one uuid v4 key per composition; a retry with the same trimmed text and reply target reuses it; changed text/reply target, success, or erased draft → new key. Key flows through `message-feed.tsx`, `MessagingContext` + types, `useMessages.sendMessage`, `messagingApi.sendMessage(message, {clientMessageId})`; optimistic copy reconciles via `replaceMessageInPages` (dropped if the stored message already arrived via Realtime).
- Note for T12: attachment ids can join the create body; on a replay (`created:false`) attachments must not be linked again.
Evidence:
- Performer: new `__tests__/messaging-db/message-create-idempotency.test.ts` (6 tests, real route + local sessions): failed 6/6 before the fix; after: same key 201→200 same id one row; no key → two rows; another member's same key / another conversation → new rows; outsider replay 403; 6 concurrent same-key creates → one 201, five 200, one row; held-transaction lock-wait race → 200 with holder's id, one row; payload mismatch 409; invalid key 400. Mutation: 23505 handling off → both concurrency tests fail.
- Performer: new E2E in `epic-4A-drawer-interactions.spec.ts` "should keep exactly one message when a committed send loses its response and is retried" (create reaches the server via `route.fetch()` → 201, then `route.abort('failed')`; error shown, text kept, one server copy; retry sends the same key → 200 same id; sender one copy, no `message-temp-*`; recipient one copy live, via GET and after reload; sending the same text again → new key, 201, two copies). Mutation: new key per retry → E2E fails (200 expected, 201 received).
- Performer: `npm run test:messaging:db` 7 files 25/25; `npm run test:messaging:local:e2e` 26 passed (10.3 m); type-check clean; eslint 12 touched files 0 errors (warnings in old code); `git diff --check` clean; `__tests__/api/messages-create-route.test.ts` 6/6 untouched; EXPLAIN ANALYZE (20k synthetic rows, rolled back) → Index Scan on the new index, 0.02 ms.
- Performer review gate (`supabase-rls-reviewer`): no blockers/majors; identity via supabase_uid → users.id confirmed; replay scoped to the caller's own sender id in a conversation they belong to. Minors fixed (23505 detection not tied to index name; lock_timeout; header lock description). Minors kept: rate limit and reply-target validation run before the replay lookup (a retry can get 429, or 400 if the reply target was deleted meanwhile).
- Orchestrator local catalog readback: `client_message_id|uuid|YES|<none>`; index definition as above, `indisvalid = t`; history ends `20261005000414 messages_client_message_id_idempotency`. Added row 4 to `MIGRATIONS-PENDENTES.md` (deploy order mandatory).
- Orchestrator ran `npm run test:messaging:db` → 7 files, 25/25 passed; `npm run test:messaging:local:e2e` → 26 passed (10.2 m), exit 0, sweep removed 0.
Verification: verified
Discovered:
- [verified] The T23 app against a database without the column fails every drawer send (it always sends a key) — migration must be online before the app deploy — affects T25, T21.
- [verified] Other members receive the random key in Realtime INSERT payloads — harmless (replays are looked up by the caller's own users.id).
- [reported, unconfirmed] If the composer remounts between failure and retry (drawer closed, conversation switched), the key and error row are lost; the next send is a new composition and could duplicate a committed send — affects T13 if drafts/files survive remounts.
Risk:
- Online (T25): `ADD COLUMN` takes a brief ACCESS EXCLUSIVE lock and the index build a SHARE lock on `messages`; lock_timeout 5 s fails fast and the file can be re-run. Read back online: column, index definition, `indisvalid`, history row. Smoke: no key twice → 201/201, 2 rows; same key twice → 201/200, 1 row. Online `messages` row count not re-checked (T5 recorded 81).
Deviation: route contract additions (200 replay, 409 reused key with different payload); repository `create` refactor (behaviour unchanged); local rollback actually executed and re-applied.
Highest task ID reserved: T27
Gate: plan holds

## T12 — Messages can be created with up to five authorized attachments  [done]
Plan version: 6
Covers: FR-008, FR-010, FR-011, AC-009, AC-010, AC-013, AC-015, AC-032, AC-035
Root: T12
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Migration `supabase/migrations/20261005004335_message_attachment_uploads.sql` (LOCAL ONLY, `npx supabase migration up --local`; one transaction, lock_timeout 5 s; real local rollback run and re-applied):
  - new `public.message_attachment_uploads` (pending uploads: id, conversation_id, uploader_id = users.id, storage_path unique, name 1–255, type, size ≥ 0, created_at; FK cascades; indexes (conversation_id), (uploader_id, created_at)); RLS on, 0 policies, service_role only, not in Realtime;
  - new `public.create_message_with_attachments(uuid,uuid,text,text,uuid,uuid,uuid[]) → jsonb {message_id, created}` (SECURITY INVOKER, `search_path=''`, EXECUTE service_role only): 1–5 distinct uploads, type image|file, reply target in the same conversation, sender is member; stored client key → `created=false`, links nothing; else locks the caller's uploads (`FOR UPDATE` by id), inserts message (`ON CONFLICT` on the T23 key index), moves uploads into `message_attachments` (same id, url = storage path), deletes upload rows — one transaction (BR-007);
  - `messages.check_content_not_empty` → `messages_content_not_empty_unless_attachment` (`content <> '' OR type IN ('image','file')`); client policies `send_message_as_self` / `update_own_messages` add `content <> ''` to WITH CHECK (only the server stores empty content);
  - `message_attachments` server-written only: dropped `add_attachments_to_own_messages` / `delete_own_message_attachments`; revoked INSERT/UPDATE/DELETE/TRUNCATE from anon/authenticated; member SELECT policy kept;
  - no storage policies added (no collision with online `user-uploads`); bucket config unchanged.
- Rollback (app rolled back first): restore empty contents from first attachment name, drop the new check, re-add `check_content_not_empty`, restore both messages policies' WITH CHECK, re-grant and re-create the two attachment client policies, drop the function and table, delete version row — full SQL in the migration header.
- API: `POST /api/messages/upload` (membership → rate limit 10/min → declared/received size + type → object at `message-attachments/{conv}/{uploadId}.{ext}` → pending row; 201 `{attachment:{id,name,type,size,url:'/api/messages/attachment/{id}'}}`, URL 404 until sent; 413 `FILE_TOO_LARGE` incl. content-length pre-check, 415 `UNSUPPORTED_FILE_TYPE`, 400 `MESSAGE_ID_NOT_SUPPORTED` (old attach-to-existing branch removed), 403, 401; best-effort sweep of the uploader's own pending uploads > 24 h). New `DELETE /api/messages/upload/{uploadId}` (uploader only, `message:upload-cancel` 60/min; row then object; 404 `UPLOAD_NOT_FOUND` for unknown/foreign/sent/cancelled). `POST /api/messages/create` optional `attachmentIds` (1–5 UUIDs), content optional only with attachments, type derived (all images → image, else file); link-time Storage `info()` re-check of size/content type; 400 `INVALID_ATTACHMENT_ID`/`TOO_MANY_ATTACHMENTS`/`DUPLICATE_ATTACHMENT`/`ATTACHMENT_NOT_FOUND`/`INVALID_ATTACHMENT`, 413/415 from stored metadata; replay with same key + same set → 200 no relink; different set → 409 `CLIENT_MESSAGE_ID_REUSED`. `GET /api/messages/attachment/{id}` signs only paths inside the message's conversation folder, TTL 300 s (was 3600), `Cache-Control: private, no-store`. `DELETE /api/messages/attachment/{id}` → 409 `LAST_ATTACHMENT_OF_EMPTY_MESSAGE`.
- Limits in one place: `src/lib/messaging/attachment-policy.ts` (for T15). New `attachment-storage.ts`, `attachment-uploads.ts`, `upload/[uploadId]/route.ts`, `IMessageAttachmentUploadRepository` + Supabase implementation; types `PendingAttachmentUpload`, `MessageWithAttachmentsCreateResult`. No client/UI change.
- Test policy (BR-016): removed the "File Upload Route" block (2 mock-only tests of the removed `messageId` branch) from `__tests__/api/messages-api.test.ts`; replaced by `__tests__/messaging-db/message-attachments.test.ts` (upload success, 401, `MESSAGE_ID_NOT_SUPPORTED`). "Message Attachments Route" tests kept.
Evidence:
- Performer: `message-attachments.test.ts` (11 tests, real routes + sessions + local Storage/DB): attachment-only message read by B under RLS and downloaded; 6th file / duplicate id / RPC count bound rejected, 5 accepted; 10 MB+1 rejected, exactly 10 MB accepted; zip/html/octet-stream rejected; stored-metadata drift rejected at link (413/415/400); foreign, other-conversation, unknown, keyed-foreign uploads rejected; non-member upload/send 403; 401; cancel deletes row and object, only uploader can cancel, sent attachment not cancellable; unsent upload unreadable by uploader, other member, outsider via read route, storage download, own signed URL, public and authenticated URL; pending table and RPC 42501 for users; non-members denied via API, RLS, guessed path; members get a 300 s token and an expired signed URL fails; replay links once, reused key with other files 409, 4 concurrent same-key sends → one 201, three 200, one attachment row; Data API forged attachment insert and empty insert/update denied while normal text insert/update work; stray path 404; last attachment of empty message kept; RPC rejects text type and foreign reply target; 24 h stale sweep.
- Performer mutation checks (each restored): link-time validation off → oversize/type fails; object delete off → cancel fails; RPC uploader filter removed → foreign fails; pre-fix policies/grants → Data-API test fails.
- Performer: `npm run test:messaging:db` 8 files 36/36 (final + repeats); `npm run test:messaging:local:e2e` 26 passed (11.0 m); type-check clean; eslint 0 errors; `git diff --check` clean; `messages-create-route.test.ts` + `messages-api.test.ts` 8/8.
- Performer review gate (`supabase-rls-reviewer`): first pass 1 blocker (client INSERT on `message_attachments` could point a row at any path, incl. a pending upload, and the read route would sign it — pre-existing hole), 1 major (widened check let clients store empty messages), 7 minors → all fixed except MIME sniffing; re-review no blockers/majors; one minor regression (activity touch skipped after failed read-back) fixed.
- Orchestrator local catalog readback: uploads table RLS on, 0 policies, ACL postgres+service_role only; RPC prosecdef f, `search_path=""`, EXECUTE postgres+service_role; messages check `messages_content_not_empty_unless_attachment`; both client policies include `content <> ''`; `message_attachments` only `read_attachments_in_own_conversations`; anon/authenticated REFERENCES,SELECT,TRIGGER; 0 `storage.objects` policies; history ends `20261005004335`. Added row 5 to `MIGRATIONS-PENDENTES.md`.
- Orchestrator ran `npm run test:messaging:db` → 8 files, 36/36 passed; `npm run test:messaging:local:e2e` → 26 passed (11.0 m), exit 0, sweep removed 0.
Verification: verified
Discovered:
- [verified] Pre-existing security hole: a signed-in sender could insert `message_attachments` rows with any url through the Data API — fixed by this migration (online still open until T25).
- [verified] `messages.check_content_not_empty` blocked attachment-only messages at DB level — replaced.
- [verified] `message-readers.test.ts` Realtime test failed once in the first DB run after a migration re-apply (fixed 1.5 s sleep after SUBSCRIBED); another DB run reported 1 failed file with all tests passing (cause unknown); one full E2E run failed "open drawer… realtime delivery" at the reload step (30 s timeout after send and delivery succeeded) — each passed on reruns (9 DB runs, 2 full E2E) — affects AC-031 reliability (watch).
- [reported, unconfirmed] The old online-config `__tests__/api/playwright/messages-api.spec.ts` posts with `messageId`/fake ids — already non-functional, not in the local suite — test-policy audit in T21.
Risk:
- T25 online checks first: online `messages` check-constraint name (if not `check_content_not_empty` the drop is a no-op and attachment-only sends fail 23514); online `pg_policy` for `messages`/`message_attachments` and table grants (an extra permissive INSERT policy would reopen the forged-row hole); confirm no published client uses the upload `messageId` branch (source shows only debug pages). After applying: as authenticated in a rolled-back transaction, direct `message_attachments` insert and empty `messages` insert both 42501; smoke upload → create → member read → cancel.
- No MIME content sniffing (declared type enforced by policy + bucket allowlist; link-time checks stored metadata, not bytes).
- Abandoned uploads of users who never upload again stay invisible but use storage until an operator sweep; cascade-deleted pending rows or failed object deletes leave invisible objects.
- Last-attachment guard is count-then-delete (two concurrent deletes by the sender could empty their own message).
- Upload rate limit 10/min may be tight for T13's 5-file messages with retries — affects T13.
Deviation: migration also narrows existing client write policies/grants on `messages` and `message_attachments` (review blocker + major); upload `messageId` path now 400; attachment id = upload id; read TTL 3600 → 300 s.
Highest task ID reserved: T27
Gate: plan holds

## T13 — The production composer sends files with progress, cancel, and retry  [partial]
Plan version: 6
Covers: FR-007, FR-008, FR-009, FR-012, FR-024, AC-008, AC-009, AC-011, AC-012, AC-016, AC-029, AC-037
Root: T13
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Composer (`message-composer.tsx`, new `ComposerPendingFiles.tsx`, new `src/hooks/ui/use-composer-attachments.ts`): "Anexar arquivos" picker (multi-select, filtered by allowed types, Enter/Space); drag-and-drop with "Solte os arquivos para anexar" overlay; Ctrl+V adds an image only when the clipboard has no text; pre-upload validation (count 5, 10 MB, type) with Portuguese messages in a dismissable `role=alert`; immediate upload per file with `role=progressbar`, `role=status` summary, cancel while uploading, remove after upload (DELETE), error + retry; send disabled (and Enter ignored) until all uploads finish; attachment-only messages allowed; failed send keeps text, reply target and files with the T4 error/retry; T23 composition key includes the attachment set. Files live with the composer/conversation; conversation switch or unmount aborts uploads and cancels pending ones (except files in an in-flight send).
- New `src/lib/messaging/attachment-upload-client.ts` (XHR upload with progress; cancel uses `keepalive`), `pending-attachment-validation.ts`; `attachment-policy.ts` gains extension→MIME map, picker `accept`, fallback MIME for untyped files (browser-safe).
- Send path: `useMessages.sendMessage` allows empty text with files and derives image/file type; `messagingApi.sendMessage` sends `attachmentIds`; `message-feed.tsx` passes conversationId and attachments; debug comparison page passes conversationId.
- Realtime root-cause fix (`useMessageSubscription.ts`): image/file INSERT no longer appends the bare row (recipient briefly rendered 0 attachments — BR-007 break); uses the non-cancelling `scheduleFeedRefetch` (no longer aborts manual "Load more").
- `message-item.tsx` root has `data-attachment-count` (test evidence until T14).
- Rate limit `message:upload` 10 → 30/min (justified in `src/lib/auth/rate-limit.ts`; 10/min refused a second 5-file message within a minute).
- New E2E `messaging-attachments-composer.spec.ts` (3 two-account tests) in `messaging-drawer` (suite 29). No migration; no route/policy change.
Evidence:
- Performer: new spec alone 3/3. T1: keyboard picker + drop; held uploads show 3 progress bars/cancel; send disabled, Enter creates nothing, B's API empty; after release create carries 3 ids (201); B's feed only ever rendered the message with 3 attachments (MutationObserver `[3]`); long filename fits 384 px. T2: 10 MB+1, .zip and 6th file refused before upload; forced-500 upload shows error and retries by keyboard; held upload cancelled by keyboard; remove → DELETE 200; attachment-only 3-file message reaches B. T3: real clipboard image via Ctrl+V; first create aborted → text, reply target and files kept; keyboard retry reuses key and ids → one 201, one threaded copy for B; pasted image-only message (type image) renders for both.
- Performer mutation checks: old realtime path → T1 fails (B rendered `[0,3]`); send allowed during uploads → T1 fails; both restored.
- Performer full `npm run test:messaging:local:e2e` ×2 → 27 passed / 2 failed each (~13.4 m), same 2 tests: epic-4A "should open drawer, select DM, send message, and verify realtime delivery" (30 s test timeout) and messaging-starred-jump test 1 (highlight never appeared; ended in the "Não foi possível mostrar…" notice although History 3 loaded).
- Performer: `npm run test:messaging:db` 36/36; type-check clean; eslint 0 errors; `git diff --check` clean; `supabase-rls-reviewer` on the rate-limit change → no blockers.
Verification: unverified — regression gate (AC-031) not met: 2 tests fail in every full run.
Discovered:
- [verified] epic-4A realtime-delivery test now fails every time (3/3 alone, 32.5–32.7 s; both full runs); the 30 s budget is consumed before the drawer mounts (seed + two logins ~8.5 s; three floor-plan `networkidle` waits 3.4–4.6 s each). The local test company holds ~250 leaked `Test Space N` spaces (T27 saw ~204) — [reported, unconfirmed] the leak makes the floor plan heavier and is the cause; proving it needs removal of local presence-referenced spaces — affects AC-031.
- [verified] messaging-starred-jump test 1 fails in both full runs but passes 3/3 alone and 2/2 after the new spec — [reported, unconfirmed] a timing race in the T11 search (`loadHistoryUntilMessage` / `use-feed-jump`) under full-run load — affects AC-031, AC-025.
- [reported, unconfirmed] Pending uploads have no per-user count/byte cap (~300 MB/min of invisible objects possible at 30/min; sweep runs only on the uploader's next upload); rate limiting fails open if `check_rate_limit` RPC is missing online — affects T25 checks, T21 security review.
- [verified] `composer-image-button` is a pre-existing no-op — usability item for T21; a cancelled upload whose request reached the server leaves an invisible pending object until the 24 h sweep.
Risk:
- Recipient sees an attachment message after the feed refetch (~100 ms + fetch), not instantly.
- Image messages still render through the old single-attachment `next/image` branch until T14.
- E2E progress values come from held requests (UI states proven, not byte-accurate progress).
Deviation: rate limit 10 → 30/min; realtime image/file INSERT handling changed (root-cause fix); `data-attachment-count`; picker accepts untyped files by extension.
Highest task ID reserved: T29
Gate: replan required

## Correction — T13 local environment cleanup (orchestrator)
Owner approval (2026-10-05, native question): "Pode apagar" — delete the leaked "Test Space" rooms of the local test company and the test accounts' presence rows in them; local DB only.
- Local count: `Playwright Messaging Company` 250 `Test Space %` spaces; 517 `space_presence_log` rows and 2 users' `current_space_id` (messaging-primary/secondary@local.test) reference them. FKs to spaces: RESTRICT from `knock_requests`, `space_presence_log`, `users.current_space_id`, `user_presence_sessions`; `conversations.room_id` SET NULL; others CASCADE.
- Direct deletes of `users.current_space_id` and `space_presence_log` rows are blocked by trigger `private.presence_movement_write_gate()` (runtime mode atomic → `CLIENT_UPGRADE_REQUIRED` unless an internal-writer marker is set); both attempts rolled back. The orchestrator did NOT forge the internal-writer marker or change the presence runtime mode.
- Deleted the 42 test spaces with no presence/knock/user references (one transaction) → 208 `Test Space %` remain.
Gate: replan required

## Replan checkpoint — T13
Old plan version: 6
New plan version: 7
Trigger: TRACK T13 [partial] — regression gate fails (epic-4A realtime-delivery test over its 30 s budget before the drawer mounts, with ~250 leaked test spaces in the local test company; starred-jump test 1 fails under full-run load); leaked test spaces cannot be removed by plain SQL because of the presence write gate.
Result: T28 (Root: T28, "Local runs leave no test spaces behind and the leaked ones are gone") and T29 (Root: T13, continuation 1, "The full regression passes with the composer attachments in place") added before T14; T14 depends on T29; T13 removed from PLAN (attempted).
Highest task ID reserved: T29
Gate: replan done (plan version 7)

## T28 — Local runs leave no test spaces behind and the leaked ones are gone  [done]
Plan version: 7
Covers: AC-031
Root: T28
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- `src/lib/test-utils/messaging-test-seeder.ts`: seeds find-or-create fixed rooms `Test Space Fixed 1..roomCount` per company instead of `Test Space N <runId>` (tracked for partial-seed rollback only when the seed created them); `cleanup()` no longer deletes spaces (`spaceIds` input ignored — removes the old "delete any caller-supplied spaceIds" power); new `removeTestOnlyRoomConversations` deletes a fixed room's previous room conversation (`uniq_room_conversation`) only if every participant and member is an allowlisted test account and participants is non-empty, else the seed throws and deletes nothing; extracted `findTestAccountIds` / `findConversationsWithForeignMembers`; comment that seeds for one company must run one at a time.
- `__tests__/messaging-db/seed-recovery.test.ts`: rollback test asserts fixed rooms created by a failed seed are removed; new test — stable room ids across seeds, previous room conversation replaced, outsider member → seed fails with nothing deleted (DB suite 37).
- Local data (orchestrator, owner-approved 2026-10-05 "Pode fazer"): one transaction removed the 208 leaked `Test Space N <uuid>` rooms of `Playwright Messaging Company`, their 521 `space_presence_log` and 4,374 `user_presence_sessions` rows, and nulled 2 test users' `current_space_id`; the transaction aborts if any reference belongs to a non-test account; it used the Presence E2E local-fixture pattern (`request.jwt.claims` service_role + `app.presence_internal_writer = 'atomic-reconciliation'`, transaction-local; same as `__tests__/api/playwright/presence/local-fixture.ts:145`). Runtime mode untouched (`atomic`). Script: scratchpad `proposed-t28-cleanup.sql` (read in full before running).
- No migration; no route change; nothing online.
Evidence:
- Performer read-only counts before → after full run 1 → after full run 2: leaked `Test Space N <uuid>` 208 → 208 → 208 (no growth); fixed rooms 0 → 2 → 2; log rows by non-test users 0; knocks 0. Presence E2E companies: md5 of companies, users, spaces, logs, sessions, knocks, conversations and `presence_runtime_control` identical before/after both runs.
- Performer timing (epic-4A realtime test, traces): with 208 leaked rooms alone ×3 ~11.7–13 s before the drawer opens, `networkidle` 3.1–3.8 s, test 29.5–30.9 s; counterfactual dropping leaked rooms from `GET /api/spaces` (119 KB, 210 rooms) ×3 → `networkidle` 1.6–1.9 s, test 20.2–20.4 s.
- Performer full runs: run 1 29 passed; run 2 28 passed / 1 failed (epic-4A realtime test at 30 s); starred-jump test 1 passed in both.
- Performer: `npm run test:messaging:db` 37/37; type-check clean; eslint clean; `git diff --check` clean; mutation checks (reuse off → test fails; replacement off → `uniq_room_conversation`) restored byte-identical. Reviews: `presence-safety-reviewer` no blocker (no presence writes, no second writer, Presence E2E untouched); `supabase-rls-reviewer` no blocker (major: concurrent seeds race on find-or-create/delete-then-insert — only with parallel workers; local uses `workers: 1`; documented). Minor fixed: empty participants treated as foreign.
- Orchestrator cleanup readback: `UPDATE 2`, `DELETE 521`, `DELETE 4374`, `DELETE 208`, `COMMIT`; afterwards leaked 0, fixed 2; runtime mode `atomic`.
- Orchestrator timing after cleanup: epic-4A realtime test alone `--repeat-each=3` → 3 passed (24.1 s, 26.5 s, 25.4 s) vs 29.5–33 s before.
Verification: verified
Discovered:
- [verified] The leaked rooms drove most of the epic-4A slowness (floor-plan `/api/spaces` payload and `networkidle`); after cleanup the test still uses 24–26 s of its 30 s budget — affects T29.
- [verified] No database function deletes `space_presence_log` rows; only the internal-writer marker (Presence E2E fixture pattern) or maintenance mode can — note for any future test cleanup.
- [verified] Local `user_presence_sessions` for test accounts grow every run (`purge_presence_history` only purges sessions retired > 24 h, globally) — informational.
- [verified] Stale comment on `returnToSpace` in `epic-4A-drawer-interactions.spec.ts:535` (cleanup no longer deletes spaces) — T29 owns that spec.
Risk:
- Fixed rooms are not safe for parallel seeds on one company (e.g. online `test:api:ci` with several workers) — same as the shared direct conversation.
- A non-test account joining a fixed room's conversation makes every seed fail until removed by hand (intentional).
Deviation: one permanent DB-integration test added (guards a destructive seeder path); "after cleanup" timing first measured by counterfactual, then confirmed by the orchestrator after the real cleanup.
Highest task ID reserved: T29
Gate: plan holds

## T29 — The full regression passes with the composer attachments in place  [done]
Plan version: 7
Covers: FR-007, FR-008, FR-009, FR-012, FR-024, AC-008, AC-009, AC-011, AC-012, AC-016, AC-029, AC-031, AC-037
Root: T13
Attempt: root_attempts 1, continuation_attempts 1, continuation_limit 2, total_lineage_attempts 2, total_lineage_limit 3
State delta:
- App (starred-jump race): `src/hooks/ui/use-feed-jump.ts` new required option `isMessageLoaded(messageId)`; in phase `found`, when the rendered `messages` lacks the target but the feed cache still holds it, the hook waits for the next render instead of showing the notice; notice only if the message left the cache. `src/lib/messaging/message-cache.ts` new `isMessageInFeedCache`; `message-feed.tsx` passes it (memoized).
- Test (epic-4A test 1): three floor-plan `waitForLoadState('networkidle')` replaced by `waitForRealtimeReady`; before sending, waits for the recipient's server-confirmed postgres_changes stream so delivery is a real Realtime event (not the T26 catch-up refetch); stale `returnToSpace` comment rewritten (T28). New helper `watchMessagingChangesStream(page)` in `drawer-helpers.ts` (reads Realtime frames, protocol 1.0.0/2.0.0, topic `realtime:messaging-db-changes:`, `system` `{extension:'postgres_changes', status:'ok'}`; resets per socket).
- No migration, route, repository, policy or presence change; temporary probes removed from the repo (copies in scratchpad `probes/`).
Evidence:
- Cause, starred jump [verified]: TanStack Query notifies observers via `setTimeout(0)`; `setJump(found)` re-rendered MessageFeed before the MessagingContext provider re-rendered with the new page, so the layout effect read stale `messages` as "left the feed". Failing-before: real test 1 with an init script delaying only TanStack's zero-timeout by 40 ms (asserted engaged) → 2/2 failed with the exact symptom; passing-after: same probe passed (one unrelated ECONNRESET at dev-server start), real spec `--repeat-each=3` 6/6.
- Cause, epic-4A [verified]: trace breakdown — setup ~6.5 s, three networkidle waits 9.7 s, actions ~6 s, teardown ~2 s; networkidle needs 500 ms with no requests and the floor plan's background traffic (presence snapshot, screen-share signal, knock pending) keeps resetting it. No T13 app slowness found. Failing-before/passing-after probe: request every 300 ms → old waits timed out at 30 s 2/2, new 15.1–15.6 s 2/2.
- Performer: two consecutive full `npm run test:messaging:local:e2e` → 29 passed each (7.9 m / 8.0 m; JSON expected 29, unexpected 0, flaky 0, skipped 0); `npm run test:messaging:db` 37/37; type-check exit 0; eslint touched files 0 errors; `git diff --check` clean; `vitest run __tests__/messaging` 51/51.
- Orchestrator: diff review of use-feed-jump / message-cache / message-feed / epic-4A / drawer-helpers (no weakened assertion, no skip/retry, budget unchanged); `npm run test:messaging:db` 8 files 37/37; `npm run test:messaging:local:e2e` 29 passed (7.9 m), exit 0, no ✘/flaky/retry — epic-4A test 1 15.2 s, starred-jump 17.3 s / 22.0 s; local read-only room count: `Playwright Messaging Company` has only `Test Space Fixed 1`, `Test Space Fixed 2`.
Verification: verified — Root T13 Done-when met (composer attachments from T13 + full regression green).
Discovered:
- [reported, unconfirmed] One `apiRequestContext.post: read ECONNRESET` on the first test right after dev-server start in a probe run; not seen in 3 later probes or 3 full runs — affects AC-031 reliability (watch).
- [verified] starred-jump, starred, read-model, read-by, feed-stability, visible-read-receipts and attachments-composer specs still use floor-plan networkidle (larger budgets, passing) — same weak signal; candidate for T21 test-quality pass.
- [verified] Under 2× CPU throttling the dev-mode floor plan pushes even the new epic-4A flow past 30 s — local dev-mode cost only.
Risk:
- No permanent regression test for the jump race (deterministic version needs a TanStack-internal timer delay; probe kept in scratchpad).
- A jump waits in phase `found` if the cache holds the target but no render follows (not expected: renders follow cache notifications).
- `watchMessagingChangesStream` depends on Realtime frame format and channel topic prefix; fails loudly (15 s, named) if they change.
Deviation: app code changed (jump race was an app bug, not test timing); new test helper used only by epic-4A test 1.
Highest task ID reserved: T29
Gate: plan holds

## T14 — Attachments render as usable previews in the feed  [done]
Plan version: 7
Covers: FR-011, AC-014, AC-015
Root: T14
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- New `src/components/messaging/MessageAttachments.tsx`: every attachment renders; images as plain `<img>` (src `/api/messages/attachment/{id}`, fixed boxes, `loading="lazy"`) inside buttons "Ampliar imagem {name}" opening a Radix dialog lightbox (named after the file, "Baixar {name}", "Fechar", focus trap, Esc, focus return, event propagation stopped); failed thumbnail → "Não foi possível carregar a imagem." + keyboard "Tentar de novo"; PDF/Office/TXT cards with icon, truncated name (full on hover), size, link "Baixar {name}" → route `?download=1`; placeholders and no requests while a message is still sending; no signed URL kept client-side (every open/download goes through the route, so >300 s feeds keep working); image/file branches separate (voice branch later, T18).
- `message-item.tsx`: IMAGE/FILE render optional text + `MessageAttachments`; `next/image` removed. New `src/lib/messaging/attachment-display.ts` (size formatter moved from `ComposerPendingFiles.tsx`, preview kind, download href).
- Route `GET /api/messages/attachment/[id]`: `?download=1` signs as a download under the attachment's name, after the existing membership + folder checks, same 300 s TTL, `private, no-store`. `attachment-storage.signAttachmentUrl` optional `{ downloadName }`: name stripped of control chars/quotes/slashes and set as the signed URL's `download` param (not via `createSignedUrl` option, which double-encodes non-ASCII).
- Tests: new E2E `__tests__/api/playwright/messaging-attachments-preview.spec.ts` (2 two-account tests; added to `messaging-drawer` testMatch → suite 31); new DB-integration test for download mode in `message-attachments.test.ts` (DB suite 38). No unit tests added, none removed. No migration.
Evidence:
- Performer before-state probe: `/_next/image?url=/api/messages/attachment/{id}` → 400 (feed images never loaded).
- Performer: new spec `--repeat-each=3` 6/6. Main test: A sends 2 PNGs (640×400, 300×480) + PDF (long accented name) + TXT; held send shows placeholders and makes 0 attachment requests; B sees `data-attachment-count=4`, 2 thumbnails with `complete` and naturalWidth/Height = uploaded sizes, fetched route 307 → signed Storage URL → 200, no signed URL in page src/href; cards fit 384 px; PDF (mouse) and TXT (keyboard) downloads have exact original names and `Buffer.equals` bytes; lightbox by mouse loads 640 px, focus stays over 4 Tabs, Esc returns focus; by Enter loads 300×480, lightbox download bytes/name match, "Fechar" returns focus; A's own message renders the same. Test 2: forced 500 on B's first read → failed state + keyboard retry → image loads 120×90, focus on it.
- Performer mutation checks (restored, `cmp` identical): first-attachment only → fails (1 of 2 thumbnails); `next/image` → fails (naturalWidth 0); route ignores download → fails (`<uuid>.pdf`).
- Performer: `npm run test:messaging:db` 38/38 (non-member `?download=1` → 403, no redirect); full E2E 31 passed (8.7 m, unexpected/flaky/skipped 0); type-check clean; eslint 0 errors; `git diff --check` CRLF notices only; `vitest run __tests__/messaging` 51/51; `supabase-rls-reviewer` → no blockers, one minor (sanitize download name) applied.
- Orchestrator: reviewed route + `signAttachmentUrl` (authorization order unchanged, sanitized name, TTL/no-store kept); `npm run test:messaging:db` 8 files 38/38; `npm run test:messaging:local:e2e` 31 passed (8.4 m), exit 0, no ✘/flaky; preview tests 15.3 s / 12.8 s.
Verification: verified
Discovered:
- [verified] `next/image` cannot load attachments through the auth-gated route (optimizer 400) — affected AC-014, fixed.
- [verified] supabase-js `createSignedUrl(…, {download})` double-encodes non-ASCII names — worked around in `signAttachmentUrl`; relevant to T18 if voice notes are downloadable.
- [verified] Playwright emits no request/response events for a link click that becomes a download; Radix modal hides the rest of the page from role locators — test-writing notes only.
Risk:
- Thumbnails fetch originals (up to 10 MB; lazy + fixed boxes limit it); no image optimizer.
- 300 s expiry not waited out in tests; long-open feed relies on design (no client-kept signed URLs), which is asserted.
- Chromium only.
Deviation: route gains `?download=1` (needed for correct downloaded name); extras: failed-image retry, sending placeholders, held-send no-request check.
Highest task ID reserved: T29
Gate: plan holds

## T15 — Voice notes have a storage contract limited to two minutes  [done]
Plan version: 7
Covers: FR-018, AC-021, AC-032, AC-035
Root: T15
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Migration `supabase/migrations/20261005141134_voice_note_attachments.sql` — written locally; applied to the LOCAL DB (`npx supabase migration up --local`); real local rollback run twice + re-applied; NOT applied online; depends on T12 `20261005004335`. One transaction, `lock_timeout 5s`, re-runnable:
  - `attachments` bucket `allowed_mime_types` = previous 10 + `audio/webm`, `audio/mp4` (asserted private; raises if missing); 10 MB unchanged; no `storage.objects` policy (`supabase/config.toml` defines no buckets — the migration is the only allowlist source);
  - `message_attachment_uploads`: nullable `duration integer`, `waveform_data jsonb`; check `message_attachment_uploads_voice_note_check` (audio ⇒ duration 1–120 and waveform JSON array of 1–256 numbers in [0,1]; non-audio ⇒ neither);
  - `message_attachments`: check `message_attachments_voice_note_check` (audio rows need valid voice metadata), added NOT VALID and validated in-transaction only if no legacy row breaks it (else NOTICE, stays NOT VALID);
  - `create_message_with_attachments` (same signature, SECURITY INVOKER, `search_path=''`, service_role only) copies duration/waveform; raises `VOICE_NOTE_NOT_ALONE` (22023) for voice + other uploads; a voice message must be typed `file`.
  - No new message type: voice note = `file` message with one audio attachment (published app shows it as a file).
- Rollback (app rolled back first): SQL in the migration header (restores the T12 function body from the T12 file's block, drops checks/columns, restores the 10-type allowlist, deletes the version row); the executable form used locally is kept in scratchpad `rollback.sql`.
- Code: `attachment-policy.ts` voice section (`MAX_VOICE_NOTE_DURATION_SECONDS=120`, waveform ≤ 256, `MAX_VOICE_NOTE_BYTES_PER_SECOND=40000`, `VOICE_NOTE_MIME_TYPES`, `VOICE_NOTE_RECORDER_MIME_TYPES`, `ATTACHMENT_BUCKET_MIME_TYPES`, `parseVoiceNoteMetadata`, `checkVoiceNoteFile`, `matchesVoiceNoteContainer`, `isVoiceNoteAttachment`, …; browser-safe); upload route `kind=voice` branch (container sniff, forced `.webm`/`.m4a`, size bound ≈ 40 KB/s × duration + 64 KB); create route rejects voice + others and maps the DB error; link-time voice re-check in `attachment-uploads.ts`; upload repository/interface voice columns; `SupabaseMessageRepository` returns attachment `duration`/`waveformData`; `PendingAttachmentUpload` optional voice fields. New `__tests__/messaging-db/voice-notes.test.ts` (6 tests).
- API for T16: upload multipart `file` (`audio/webm[;codecs=opus]` | `audio/mp4[;…]`), `conversationId`, `kind=voice`, `duration` (0 < d ≤ 120.000), `waveform` (JSON, 1–256 numbers in [0,1]) → 201 `{attachment:{id,name,type,size,url,duration(ceil s),waveformData}}`; errors 400 `VOICE_NOTE_TOO_LONG`/`INVALID_VOICE_NOTE_DURATION`/`INVALID_VOICE_NOTE_WAVEFORM`/`INVALID_UPLOAD_KIND`, 415, 413 `VOICE_NOTE_TOO_LARGE`, 403, 401. Create `{conversationId, content?, attachmentIds:[voiceId], clientMessageId?}` → 201 `type:'file'`; replay 200; voice + other → 400 `VOICE_NOTE_NOT_ALONE`. Recorder preference: `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`; the recorder must clamp the claimed duration to ≤ 120.000 s.
- Format choice (SPEC open question): WebM/Opus (Chrome/Edge/Firefox record; Safari 15+ plays, best effort) + MP4/AAC (Safari records; all targets play); Ogg not accepted. Cross-browser playback verified in T18 (AC-022).
- Feed fallback: a voice message renders as a file card (download) through T14's file branch until T18.
Evidence:
- Performer: `npm run test:messaging:db` 9 files 44/44 ×3 (one earlier run: known `message-readers` Realtime flake after migration re-apply, passed on reruns). New tests: WebM voice stored privately, linked, read by the other member under RLS, same bytes + `audio/webm`; outsider denied via API 403, RLS, Storage download, public URL; MP4 at exactly 120 s + keyed replay 200; 10 bad durations and 11 bad waveforms rejected, 256 samples accepted; regular webm/mp4/mpeg/ogg uploads 415; voice png/mpeg/ogg and mismatched container bytes rejected; size bound +1 → 413, exact accepted, `.html` name stored as `.webm`; voice + file rejected by route and RPC; voice typed image rejected by RPC; drifted stored type/size rejected at link; 13 invalid direct SQL writes → 23514; bucket allowlist = policy constant = list parsed from the migration; the bucket refuses `audio/mpeg` even for the service role.
- Performer mutation checks (restored, hashes match): duration bound removed → fails; audio on regular uploads → fails; sniff disabled → fails; DB check dropped → fails.
- Performer: full E2E 31 passed (8.3 m, 0 failed/flaky/skipped); type-check clean; eslint 0 errors on new code; `git diff --check` clean; rollback readback (10 types, columns gone, T12 body, history `20261005004335`) and re-apply identical; NOT VALID path simulated in a rolled-back transaction. `supabase-rls-reviewer`: first pass 0 blockers / 3 majors (legacy rows abort → NOT VALID + conditional validate; client-controlled extension → forced; online storage policies/T12 ordering → T25 checks); re-review clean.
- Orchestrator local catalog readback: bucket private, 10485760, 12 types incl. `audio/webm`, `audio/mp4`; both voice checks `convalidated=t`; RPC ACL postgres+service_role, `search_path=""`; history ends `20261005141134`. Added row 6 to `MIGRATIONS-PENDENTES.md`.
- Orchestrator: `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` 31 passed (8.2 m), exit 0.
Verification: verified
Discovered:
- [verified] Local `attachments` bucket holds 201 non-audio objects of deleted conversations (pre-T15, likely E2E leftovers); one leftover `msgdb-outsider-…` auth user — storage hygiene/orphan sweep, T21.
- [verified] Baseline already had `message_attachments.duration`/`waveform_data` + partial index `idx_message_attachments_voice_notes` → T25 must run the legacy-audio-row query before applying.
- [reported, unconfirmed] Regular attachments keep the client's file extension in the storage path (served with the stored allowlisted type) — T21 security review.
- [verified] `message-readers` Realtime DB test flaked once right after a migration re-apply (also T12) — AC-031 reliability watch.
Risk:
- Duration is a client claim bounded by container sniff, stored type, forced extension and a size bound (≤ ~4.9 MB at 120 s); no media decode, so a longer low-bitrate recording could be stored (own conversations only; served as audio/*).
- Safari WebM playback / Chrome MP4 path unverified until T16/T18.
T25 online checks (row 6): before — T12 applied first; `storage.buckets` `attachments` private, 10 MB, the 10 original types; `pg_policies` on `storage.objects` covers no `attachments` policy; legacy-audio-row query (in the migration header) returns 0; constraint/column names absent. After — 12 types, both checks `convalidated=t`, RPC body/ACL/search_path; smoke: voice upload → create → member read, outsider 403, regular audio 415.
Deviation: no new `message_type`; NOT VALID + conditional validate; server-chosen voice extension; `VOICE_NOTE_RECORDER_MIME_TYPES` exported for T16.
Highest task ID reserved: T29
Gate: plan holds

## T16 — Users can record, review, and send a voice note from the composer  [partial]
Plan version: 7
Covers: FR-013, FR-014, FR-017, AC-017, AC-018, AC-020, AC-037
Root: T16
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- New `src/lib/messaging/voice-recording.ts` (browser-safe: recorder MIME pick from `VOICE_NOTE_RECORDER_MIME_TYPES`, support detection, mic error classes denied/no device/busy/unsupported/failed with Portuguese reason + guidance, stored waveform summary ≤ 256 in [0,1] peak-normalized, duration claim clamped to 120.000, `VOICE_NOTE_WARNING_SECONDS = 120 - 10`).
- New `src/hooks/ui/use-voice-recorder.ts` (MediaRecorder 1 s timeslice, 32 kbps; AnalyserNode sampled every 100 ms; auto-stop 120 s timeout + sampling-loop check; tracks and AudioContext released on stop/discard/failure/device loss/conversation switch/unmount).
- New `src/components/messaging/ComposerVoiceNote.tsx` (recording panel "Gravando", live bars, `role=timer` "m:ss / 2:00", "Parar gravação", "Descartar gravação", `role=alert` warning from 1:50; preview with native `<audio controls>`, duration, stored waveform, upload progress, error + retry, "Descartar nota de voz", limit status; dismissable mic-problem alert).
- `message-composer.tsx`: "Gravar nota de voz" button; stopped note becomes a pending attachment uploaded at once via the T13 path (progress/cancel/retry/server cancel on discard); send via the existing button + T23 key; send disabled while recording; voice never shares a message with files (attach/drop/paste refuse while a note is pending/recording, mic refuses while files are pending; `aria-disabled` + reason); text may accompany voice; textarea `min-h-[96px] pb-11` (toolbar row for five buttons in 384 px).
- `use-composer-attachments.ts` (`addVoiceNote`, `reject`, `voice` field, preview URL revoked), `attachment-upload-client.ts` (voice metadata → `kind=voice`, `duration` 3 decimals, waveform JSON), `pending-attachment-validation.ts` (voice upload errors).
- New E2E `__tests__/api/playwright/messaging-voice-notes.spec.ts` (4 two-account tests; spec-local `channel: 'chromium'` + `--use-fake-device-for-media-stream`, no fake-UI flag so denial is testable) in `messaging-drawer` → suite 35. Limit test uses Playwright `page.clock` (no product flag; `MAX_VOICE_NOTE_DURATION_SECONDS` stays 120). No migration/route/repository/policy/presence change.
Evidence:
- Performer: new spec `--repeat-each=3` 12/12; full E2E 35 passed (9.3 m, 0 unexpected/flaky/skipped); DB 44/44; type-check exit 0; eslint 0/0; `git diff --check` clean. Mutation checks (restored, `cmp`): no auto-stop → limit test fails; permission error ignored → denied test fails; tracks not stopped → discard test fails. Performer saw one first-run failure at `selectConversation` and attributed it to opening the drawer before the messaging subscription was ready.
- Orchestrator: code review of recorder cleanup and spec launch options; `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` → 33 passed / 2 failed (9.3 m, exit 1): epic-4A test 1 (`epic-4A-drawer-interactions.spec.ts:45`) and voice-notes test 1 (`messaging-voice-notes.spec.ts:152`), both `TimeoutError` in `selectConversation` (`drawer-helpers.ts:79`) waiting 10 s for `[data-testid="messages-feed"]`; the call log shows the placement-toast locator handler running repeatedly on a toast with `data-removed="true"`; screenshots show the drawer list with the "Local Secondary" DM row highlighted but the feed never opened. Voice tests 2–4 passed. Artifacts (traces, screenshots, log) preserved in scratchpad `t16-failures/`.
Verification: unverified — regression gate (AC-031) not met: 2 tests failed in the orchestrator's full run, both at conversation selection.
Discovered:
- [verified] Selecting a conversation sometimes does not open the feed within 10 s (epic-4A test 1 now affected; it passed in the T29, T14 and T15 full runs) — cause unknown: app (click lost during list re-render / catch-up refetch, composer mount), placement-toast locator handler, or T16 composer change — affects AC-031, T16.
- [verified] Playwright's default headless shell cannot capture media (`getUserMedia` NotSupportedError); voice specs need `channel: 'chromium'` — affects T17, T18.
- [verified] Chrome MediaRecorder WebM has no duration header (native player total 0:00); feed player must use stored `duration` — affects AC-017, T18.
- [verified] Fake device tone heavily reduced by `noiseSuppression` (peak ≈ 0.04).
- [verified] A room conversation "Test Space 2 90c4e268-…" (1 member, 1 day old) still shows in the primary account's drawer — leftover local data, T21 hygiene.
Risk:
- Chromium only; Safari MP4 / Firefox WebM recording not run.
- Limit test proves product timers with a faked clock (few seconds of real audio behind a 120 s claim).
Deviation: Playwright `page.clock` instead of a product-side test flag; upload on stop; composer textarea layout changed.
Highest task ID reserved: T29
Gate: replan required

## Replan checkpoint — T16
Old plan version: 7
New plan version: 8
Trigger: TRACK T16 [partial] — orchestrator full run failed 2 tests at `selectConversation` (feed never opened after clicking the DM row; epic-4A test 1 and voice-notes test 1), cause unknown.
Result: T30 (Root: T16, continuation 1, "Selecting a conversation always opens it, and the full regression passes with voice notes in place") added before T17; T17 depends on T30; T16 removed from PLAN (attempted).
Highest task ID reserved: T30
Gate: replan done (plan version 8)

## T30 — Selecting a conversation always opens it, and the full regression passes with voice notes in place  [done]
Plan version: 8
Covers: FR-013, FR-014, FR-017, AC-017, AC-018, AC-020, AC-031, AC-037
Root: T16
Attempt: root_attempts 1, continuation_attempts 1, continuation_limit 2, total_lineage_attempts 2, total_lineage_limit 3
State delta:
- `src/components/messaging/ConversationList.tsx`: the "Refreshing conversations…" indicator floats over the top right of the list (same `data-testid`, `role="status"`, `pointer-events-none`) instead of pushing rows down 24 px during a refetch.
- `src/components/messaging/ConversationListItem.tsx`: a click anywhere on the row selects the conversation; clicks on row controls (`a, button, input, textarea, select, [role=button], [role=menuitem], [data-avatar-interactive], [data-space-action]`) and on portal content outside the row's DOM are ignored; inner button and keyboard use unchanged; `cursor-pointer`; `data-avatar-interactive` removed from the display-only list avatar (clicking it now selects). Menu items (pin/unpin/archive/unarchive) moved from `onClick` + preventDefault/stopPropagation to Radix `onSelect` so the menu closes before the action runs (not in the performer's report; found in orchestrator diff review).
- New E2E in `epic-4A-drawer-interactions.spec.ts` AC1: "should open a conversation clicked while the list refreshes" (holds `/api/conversations/get`, triggers a refetch by unpinning, asserts the DM row does not move, clicks the row's bottom padding at the during-refresh position, asserts the seeded DM opens) → suite 36. Helpers, toast fixture and presence code untouched. No migration/route/repository/policy change.
Evidence:
- Cause [verified, performer, from both T16 failure traces]: Playwright computed the click point (1072, 398.5) while the refresh line was shown; the T26 catch-up refetch (starts ~160–300 ms after messaging-ready, i.e. as the drawer opens) finished before the click was sent; the row moved from y 372 to 348 (height 53), so the click hit the row's bottom padding, which did nothing (only the inner button selected). The purple row is the hover highlight. Eliminated: toast handler (ran only during the post-click feed wait, ~200 ms), console/mount errors, drawer state logic, dev-server compile; T16 only changed timing.
- Failing-before: new test fails deterministically on the position check (372 vs 348) without fixes; overlay-only → position passes, feed never shown (dead padding confirmed); both fixes → 3/3.
- Performer: two consecutive full runs `{"expected":36,"skipped":0,"unexpected":0,"flaky":0}` (8.5 m each); DB 44/44; type-check exit 0; eslint 0 errors (3 pre-existing warnings); `git diff --check` clean. Artifacts in scratchpad `t30/`.
- Orchestrator: diff review (row handler follows CLAUDE.md interactive-descendant/portal rule; menu `onSelect` change acceptable — portal clicks are ignored by the row handler); `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` 36 passed (9.0 m), exit 0.
Verification: verified — Root T16 Done-when met (recorder from T16 + full regression green; T16 orchestrator-run failures explained and fixed).
Discovered:
- [verified] A refresh used to move rows under the pointer, so a user could open the wrong conversation, not only miss one — fixed.
- [reported, unconfirmed] A data change during a refetch can still reorder rows (sort by last activity) — drawer usability, T21.
Risk:
- Future row controls must be a button/link/`[role=button]` or carry `data-avatar-interactive`, or clicking them also selects the row.
- Refresh indicator overlaps the (normally empty) right end of the first section header.
Deviation: new regression test (suite 36); list avatar click now selects; menu items use `onSelect` (unreported by performer).
Highest task ID reserved: T30
Gate: plan holds

## T17 — Recording mutes and restores the room microphone  [done]
Plan version: 8
Covers: FR-016, AC-019
Root: T17
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- "Room mic open" in code: a real mic — `AudioProvider.initializeAudio` → `WebRTCManager.initializeLocalStream()` (`getUserMedia`, track attached to peer connections); open = `isAudioEnabled && !isMuted`; mute = `manager.setMuted` (`track.enabled = !muted`) + React `isMuted` (button "Mute microphone"/"Unmute microphone"); peers see it through `useAudioSignaling` `is_muted` (same path as a user mute).
- New `src/lib/webrtc/room-mic-recording-hold.ts` (per-tab module state, no identity): provider registers a control (`isJoined`, `isOpen`, `setMuted`) bound to its current manager (unregistered on manager change/unmount); `muteRoomMicForRecording()` mutes only if open and returns an idempotent release that reopens only if this recording muted it, the same session is still registered and joined, and the mic is still muted; `noteRoomMicUserChoice()` drops the hold (user choice wins); hold dropped when the room audio session goes away.
- `src/contexts/AudioContext.tsx` (~30 lines): `noteRoomMicUserChoice()` in public `setMuted`, `toggleMute`, successful `initializeAudio`; state ref + effect registering the control (skips when the manager is no longer current). `AudioProvider` not moved.
- `use-voice-recorder.ts`: mute right before `recorder.start()`, release in `releaseSession` (stop, discard, recorder error, start failure, getUserMedia/MediaRecorder failure, conversation switch, drawer close/unmount), exposes `roomMicMuted`. `ComposerVoiceNote.tsx`: `role="status"` notice (MicOff icon, `data-testid="voice-recording-room-mic-notice"`, "Microfone da sala silenciado durante a gravação; ele volta ao parar."). `message-composer.tsx` passes the prop.
- FR-016 reading: restore at recording end (covers send and discard, since send follows stop).
- E2E: new describe "Room microphone during voice recording" in `messaging-voice-notes.spec.ts` → suite 37. Presence/placement/session/Realtime lifecycle, `current_space_id`, write gate and knock untouched. No migration.
Evidence:
- Performer: new test `--repeat-each=3` 3/3 (before and after review fixes); each check asserts the button's accessible name and the real WebRTC track `enabled`/`readyState`; scenarios: no room audio unaffected; join; stop then send; discard; user unmute/re-mute mid-recording kept; started muted stays muted; conversation switch; drawer close; notice text; 384 px; only the room mic track live at the end. Full E2E 37/37 twice (9.4 m, 9.2 m); DB 44/44; type-check clean; eslint 0/0 on 6 files; `git diff --check` clean; existing audio unit tests 7 files / 103 passed.
- Performer mutation checks (restored): skip restore → fails; mute when not open → fails; ignore user choice → fails.
- `presence-safety-reviewer`: no blockers; should-fix 2 (release requires still joined) and a nit (`isOpen`/`isJoined` false for a stale manager) fixed; should-fix 1 (unit test for the hold module) declined under BR-016 — covered by E2E + mutation checks.
- Orchestrator: reviewed the hold module and AudioContext diff (restore rule, manager binding, user-choice drop); `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` 37 passed (9.2 m), exit 0.
Verification: verified
Discovered:
- [verified] Access-token refresh recreates the room audio manager (`token-${epoch}`), resetting it to muted/not joined — pre-existing; users in a call lose room audio at token refresh — out of scope, note for owner/T21.
- [verified] SpaceAudioControls "M" shortcut toggles the room mic when focus is outside text fields, including the drawer's record/stop buttons — pre-existing; treated as a user choice.
Risk:
- No E2E for leaving the room mid-recording (needs a presence move); code review only.
- Firefox/Safari not checked; owner UAT (peers see the mute) pending.
Deviation: notice adds "ele volta ao parar".
Highest task ID reserved: T30
Gate: plan holds

## T18 — Voice notes play in the feed across browsers  [done]
Plan version: 8
Covers: FR-015, FR-019, AC-017, AC-022
Root: T18
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- New `src/components/messaging/VoiceNotePlayer.tsx`: play/pause button ("Reproduzir nota de voz"/"Pausar nota de voz"), waveform with clipped progress overlay in `role=progressbar` (value text "0:01 de 0:04"), "m:ss / m:ss", group "Nota de voz, m:ss", `w-60 max-w-full`; `data-player-state` idle|loading|playing|paused|ended|unsupported|failed|pending; disabled player while sending. Total/progress only from stored `attachment.duration` (media duration never read). `<audio preload="none">`, src set on first play, always the authorized route (no signed URL kept); on media error one automatic re-read (`?v=N`) resuming position; second failure → network: "Não foi possível carregar a nota de voz." + keyboard "Tentar de novo"; decode/`canPlayType('')`/format error while the route still answers 307 (`fetch` `redirect:'manual'`) → "Este navegador não consegue reproduzir esta nota de voz (m:ss). Baixe o arquivo para ouvir." + "Baixar nota de voz" (`?download=1`). One note plays at a time per tab.
- New `src/components/messaging/VoiceWaveform.tsx` (`WaveformBars` moved from `ComposerVoiceNote.tsx`, + `fitWaveform`). `MessageAttachments.tsx` voice branch via `isVoiceNoteAttachment`; `attachment-display.ts` `attachmentPreviewKind` → image|voice|file (audio without voice metadata stays a file card).
- Tests: new E2E `messaging-voice-notes-playback.spec.ts` (5 two-account tests) + `helpers/voice-note-helpers.ts` (tone recorded with MediaRecorder on a blank page, sent via real upload/create `kind=voice`) in `messaging-drawer` → suite 42. Opt-in cross-browser harness: `playwright.messaging-cross-browser.config.ts`, `messaging-voice-notes-cross-browser.spec.ts`, `npm run test:messaging:voice:cross-browser` (projects voice-chrome/edge/firefox/webkit; not in the required suite). `package.json` one script; `playwright.config.ts` testMatch. No migration/route/repository/policy/presence change.
Evidence:
- Performer: new spec `--repeat-each=3` 15/15 (one earlier 1/15 failure: 2 s note ended before sampling → note lengthened + `ended` guard; product assertions unchanged). Checks: B sees a player, 0 route requests before play; keyboard play, `currentTime` > 1, progress×stored ≈ currentTime (±0.6 s), pause holds 700 ms, resume advances, ended resets to 0:00 with focus kept; route 307 → Storage 206, src is the route; A plays own note; 384 px; 3 s audio stored as 9 s shows "/0:09" and progress ≈ t/9; two notes pause each other; tampered first token (ORB-blocked) recovered by re-read (307, 307, 206) with no alert; route 500 → failed alert after 3 requests, keyboard retry plays; corrupt WebM → cannot-play + download after ≥ 2 reads; `canPlayType('')` → message up front, 0 requests. Chrome media duration was `Infinity` in 1 of 3 runs.
- Performer mutation checks (restored, `cmp`): total from media duration → fails; progress from media duration → fails; cannot-play branch removed → fails; auto re-read removed → fails; pause-others removed → fails.
- Performer: DB 44/44; full E2E 42 passed (14.9 m, 0 failed/skipped/flaky); type-check exit 0; eslint 0/0 on 11 files; `git diff --check` CRLF notices only.
- Per-browser (performer, cross-browser script 4/4, 2.4 m; note recorded by Chrome 154): Chrome 154 WebM/Opus and MP4/AAC → plays (recipient + sender); Edge 154 both → plays; Firefox 151 (Playwright) both → plays; WebKit 26.5 (Playwright, Windows) both → cannot-play message. Real Safari on macOS not run.
- Orchestrator: skimmed player (preload none, `redirect:'manual'` check, `canPlayType`); `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` 42 passed (14.8 m), exit 0. All tests ~40% slower than the T17 run (e.g. starred 32.9 → 47.3 s), not only new ones; local DB clean (0 messages, 7 conversations); attributed to machine load (performer saw the same) — [reported, unconfirmed].
Verification: verified (Chrome/Edge/Firefox); Safari on macOS pending owner check (AC-022 best-effort).
Discovered:
- [verified] Playwright WebKit 26.5 on Windows cannot play any audio (even WAV, error 4) although `canPlayType` says 'probably' — says nothing about real Safari; owner Mac check needed (AC-022, T21 UAT).
- [verified] Chrome 154 MediaRecorder records `audio/mp4;codecs=mp4a.40.2`; Chrome/Edge/Firefox play it (format open question).
- [verified] Rejected/expired signed URL reaches the media element as an ORB-blocked request (format error) — handled by the auto re-read.
- [verified] Local `attachments` bucket objects grew to 563 (201 at T15) — test leftovers; storage hygiene T21.
- [reported, unconfirmed] Full suite ran ~40% slower (machine load) — AC-031 budget watch.
Risk:
- Mid-playback expiry (paused > 300 s then new byte ranges) relies on the same error path + resume; not tested.
- Storage failing twice while the route answers → cannot-play + download, not retry.
- Cross-browser harness opt-in only.
Deviation: progress is read-only (no seeking; MediaRecorder WebM lacks cues); extra stored-vs-real duration test; cross-browser report in the existing gitignored `playwright-report-messaging-local`.
Highest task ID reserved: T30
Gate: plan holds

## T19 — Desktop notifications announce new DM and group messages  [done]
Plan version: 8
Covers: FR-023, AC-027, AC-028
Root: T19
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- New `src/lib/messaging/desktop-notifications.ts` (status unsupported/blocked/enabled/available; per-user preference; permission requested only on call; BR-010 rule `decideIncomingMessage` — skip own (users.id), system, non direct/group; `viewing` when tab visible and drawer on that conversation; cross-tab claim; title/body/tag; page-level `new Notification`, no service worker).
- New `src/hooks/ui/use-message-notifications.ts` (`useIncomingMessageNotifications`, `useDesktopNotificationSetting`); new `src/components/messaging/DesktopNotificationsToggle.tsx` (bell in the drawer header: "Ativar notificações" / "Notificações ativadas" (`aria-pressed`) / "Notificações bloqueadas no navegador" + `role=alert` guidance closable by "Fechar aviso"/Esc / disabled "Notificações indisponíveis neste navegador").
- `MessagingContext.tsx`: computes the on-screen conversation (drawer open, not minimized, conversation view); live-insert path (`trackIncomingMessage`) calls the notifier once the conversation is known (incl. a new DM after list refresh); notification click focuses the window and opens the drawer on that conversation. `MessagingDrawer.tsx` mounts the toggle; `playwright.config.ts` adds the spec.
- Opt-in rule: enabled only if the user turned it on in the drawer (localStorage `vo:messaging:desktop-notifications:<users.id>`, try/catch) AND permission `granted`; granted alone does not enable; in-app off kept; denied/revoked → blocked; prompt only after a click; refusal stores "off".
- Dedupe: only live Realtime INSERTs from others reach the notifier (catch-up/refetch never call it); one claim per message id per tab and across tabs (Web Lock over a localStorage map, 10 min TTL); a visible viewing tab also claims (best effort); tag `vo-messaging-conversation-<id>` replaces older notifications.
- Content: title = sender name (DM) or "<sender> em <group>"; body = text preview (whitespace collapsed, 120 chars + "…"); no text → "Imagem", or via `GET /api/messages/attachments` "Nota de voz"/"Anexo". Full text preview shown (SPEC silent on privacy) — owner decision recorded.
- No migration/route/repository/seed/policy/presence change.
Evidence:
- Performer: new spec `messaging-desktop-notifications.spec.ts` (3 two-account tests, `channel: 'chromium'`): granted-not-enabled → none; keyboard enable; visible open DM → none; hidden tab DM + group → exact title/body/tag; own → none; room → none (delivery proven by room unread +1); visible tab on list → DM notifies; voice → "Nota de voz", .txt → "Anexo"; click opens the DM; after off → none; permission never requested on load. Two hidden tabs: existing messages never announced; new DM + group announced exactly once in total. Denied/unsupported: click asks once, browser denies, blocked + guidance, no re-request; hidden DM delivered with 0 notifications; no Notification API → disabled, messages arrive; no page errors. `--repeat-each=3` 9/9; full E2E expected 45 / unexpected 0 / skipped 0 / flaky 0 (15.1 m); DB 44/44; type-check exit 0; eslint 0 errors; `git diff --check` clean.
- Performer mutation checks (restored, `cmp`): room notify, own notify (decision + `ignoreSenderId`), viewed conversation notify, granted-without-opt-in, request on load, notify from fetched data, no cross-tab claim, attempt while denied → each caught.
- Orchestrator: reviewed `decideIncomingMessage` (users.id comparison, direct/group only, viewing rule); `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` 45 passed (14.5 m), exit 0.
Verification: verified
Discovered:
- [verified] Playwright default headless shell reports `Notification.permission` "denied" even after granting; notification specs need `channel: 'chromium'`.
- [verified] Saved active conversation is never restored after reload (mount effect deletes the key before conversations load) — pre-existing, drawer usability T21.
- [verified, intermittent] Local-mode global setup failed 2 of ~15 performer runs with HTML 404 from `DELETE /api/test/messaging/seed` on the dev server's first request; rerun passed — AC-031 run reliability.
- [verified] `ConversationPreferences.notificationsEnabled` exists unused; per-conversation mute is Phase 5.
Risk:
- Catch-up exclusion proven by design + refetch tests, not by a forced Realtime rejoin (T20 territory).
- Cross-tab viewing suppression and non-Web-Lock dedupe are best effort.
- Chromium only; real OS notification and click unverified — owner UAT. Text preview may show on lock screen/screen-share — owner decision.
Deviation: click opens the conversation (SPEC optional); inline blocked guidance; opt-in per user per browser; extra unsupported state; suite 42 → 45.
Highest task ID reserved: T30
Gate: plan holds

## T20 — New timeline data stays consistent across the existing reconnect  [partial]
Plan version: 8
Covers: FR-025, AC-030
Root: T20
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- `src/hooks/realtime/useMessageSubscription.ts`: `catchUpCachedFeeds` → `catchUpTimelineCaches`; on each postgres_changes-ready event it still refetches every cached feed and now also schedules a deferred non-cancelling refetch of every `STARRED_MESSAGES_QUERY_KEY` query and invalidates `MESSAGE_READERS_QUERY_KEY` (open lists refetch, closed ones go stale). `scheduleFeedRefetch` generalised to `scheduleDeferredRefetch(queryKey)` (timers keyed by `hashKey`, same 100 ms delay, waits for running fetch, `cancelRefetch:false`).
- Key prefixes `MESSAGE_READERS_QUERY_KEY` (`src/hooks/queries/useMessageReaders.ts`) and `STARRED_MESSAGES_QUERY_KEY` (`src/hooks/queries/useStarredMessages.ts`); per-message/per-conversation keys built from them.
- New E2E `__tests__/api/playwright/messaging-reconnect-consistency.spec.ts` (2 two-account tests: network outage with `setOffline` + socket close — receipts, star from A's other context, image+PDF and voice note, compared with `GET /api/messages/get`; Realtime-only drop, two cycles — open reader list shows 2 readers, open starred view matches `GET /api/messages/starred`) → suite 47. New helper `controlRealtimeConnection(page)` in `drawer-helpers.ts` (`routeWebSocket`: closes the live socket, fails reconnects until `restore()`, counts postgres_changes-ready frames); ready-frame check shared with `watchMessagingChangesStream`.
- Reconnect itself (backoff, channel lifecycle) unchanged. No migration/route/repository/policy/seed/presence change.
Evidence:
- Performer failing-before: readers — test 2 failed 2/2 at reader count (1, feed already "Lida por 2"); starred — no catch-up existed (= mutation M2). Test 1 passed before the fix (T26 feed catch-up already covered feed receipts/stars/attachments).
- Performer mutation checks (restored, `cmp`): M1 readers invalidation removed → fails; M2 starred refetch removed → fails; M3 whole catch-up disabled → test 1 fails.
- Performer: new spec `--repeat-each=3` 6/6; full E2E 47 passed (16.3 m); DB 44/44; `__tests__/message-subscription.test.tsx` 8/8; `vitest __tests__/messaging` 51/51; type-check exit 0; eslint 0 errors; `git diff --check` clean. Global-setup 404 (T19) not reproduced in 11 starts.
- Orchestrator: reviewed `catchUpTimelineCaches`; `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` → 44 passed / 1 failed (16.2 m, exit 1): `messaging-read-model.spec.ts:132` "BADGE CLEARS and read-indicator flips live once the messages are seen" — after scrolling the older seeded message into view and returning to the list, the list unread count stayed 1 (expected 0, 15 s poll). This test passed in every orchestrator full run since T29. Artifacts in scratchpad `t20-failures/`.
Verification: unverified — regression gate (AC-031) not met: 1 test failed in the orchestrator's full run.
Discovered:
- [verified] `context.setOffline` does not close open WebSockets in this Chromium setup; Realtime drops need a socket close (AC-030 tests).
- [verified] Browser `online` makes TanStack refetch stale active queries, masking the readers/starred gap; gap visible only on Realtime-only drops.
- [verified] Stars have no Realtime event; cross-session star changes reach an open feed/starred view only on a later refetch — owner/UX note (AC-023/AC-024).
- [verified] read-model "BADGE CLEARS" list badge stuck at 1 after the older message was scrolled into view — cause unknown (T20 catch-up/readers invalidation interaction, scroll-visibility timing, or list refresh) — affects AC-031, AC-004/AC-005.
Risk:
- Each (re)join (incl. first load) refetches an open reader list and starred view.
- `controlRealtimeConnection` depends on the Realtime frame format/topic prefix (named 30 s timeout).
Deviation: socket close via `routeWebSocket` (+ `setOffline` in test 1); shared ready-frame helper; suite 47.
Highest task ID reserved: T30
Gate: replan required

## Replan checkpoint — T20
Old plan version: 8
New plan version: 9
Trigger: TRACK T20 [partial] — orchestrator full run failed `messaging-read-model.spec.ts:132` (list badge stayed 1 after the older message was seen), cause unknown.
Result: T31 (Root: T20, continuation 1, "Seen messages always clear the list badge, and the full regression passes with the reconnect catch-up in place") added before T25; T25 depends on T31 instead of T20; T20 removed from PLAN (attempted).
Highest task ID reserved: T31
Gate: replan done (plan version 9)

## T31 — Seen messages always clear the list badge, and the full regression passes with the reconnect catch-up in place  [done]
Plan version: 9
Covers: FR-025, AC-030, AC-031, AC-004, AC-005
Root: T20
Attempt: root_attempts 1, continuation_attempts 1, continuation_limit 2, total_lineage_attempts 2, total_lineage_limit 3
State delta:
- Test helpers: `drawer-helpers.ts` `readListUnreadCount` reads the badge with one non-waiting call (`allTextContents`) instead of `count()` then `textContent()`; new exports `readVisibleBadgeText`, `parseBadgeCount`; `messaging-read-model.spec.ts` own `readUnreadCount` uses them. No assertion/timeout/budget changed.
- App: `src/hooks/ui/use-message-notifications.ts` records each conversation's server `lastActivity` from the first list the page loads; a live INSERT with `message.timestamp` ≤ that value is not announced (checked before the cross-tab claim). `MessagingContext.tsx` passes `hasLoadedConversations` and `getCachedConversations`.
- New E2E in `messaging-desktop-notifications.spec.ts`: "a message already in the loaded list is not announced when Realtime delivers it late" (`page.unrouteAll({behavior:'ignoreErrors'})` before close) → suite 48. No migration/route/repository/policy/presence change.
Evidence:
- Cause 1 [verified, T20 trace]: both read reports succeeded (`PATCH /api/conversations/read` for newest and older seeded message, recorded:1); `/api/conversations/get` returned unread 0 and the badge disappeared ~0.5 s after returning to the list; the poll's `count()` read 1 just before that render and the following `textContent()` waited for a vanished badge until context close → `expect.poll` reported its last value 1. Test-helper race, not an app bug; T20's `scheduleDeferredRefetch` keeps feed semantics and does not touch the list count. Forced-order probe (badge removed right after first read): old helper fails with the same signature, fixed helper passes.
- Cause 2 [verified, performer run 2 trace]: Realtime delivered an already-committed message as a live INSERT just after SUBSCRIBED (WAL read lag), and the page announced it ("Nova mensagem") — violates "existing messages are never announced" (AC-027 behavior from T19). Forced order with real frames (list held until commit, INSERT frame held until list loaded): mutation (check disabled) fails 2/2; fix passes 3/3; notifications spec 4/4; control message still announced once.
- Performer full runs: run 1 (helper fix only) 47/47; run 2 cause 2 failure; run 3 new test teardown `route.fetch: Request context disposed` → unrouteAll fix; runs 4 and 5 consecutive on final code `{expected:48, unexpected:0, skipped:0, flaky:0}` (~13.1 m each), reconnect-consistency and T26 tests passed. DB 44/44; `tsc --noEmit` exit 0; eslint 0 errors; `git diff --check` clean; `message-subscription.test.tsx` 8/8.
- Orchestrator: reviewed suppression baseline and helper change; `npm run test:messaging:db` 9 files 44/44; `npm run test:messaging:local:e2e` 48 passed (13.1 m), exit 0.
Verification: verified — Root T20 Done-when met (reconnect catch-up from T20 + full regression green).
Discovered:
- [verified] Helpers that read with `count()`/`isVisible()` then a waiting call hang when a live update removes the element between calls — both messaging badge readers fixed.
- [verified] Realtime lag can deliver a pre-existing message as a live INSERT right after subscribe; it briefly raises the list unread count by 1 until the triggered refetch corrects it — self-correcting, unchanged.
Risk:
- Suppression compares DB-clock message timestamp with Node-clock `lastActivity`; large skew fails open (old message announced, as before), never suppresses a post-load message.
- A message committed while the first list is loading counts as existing and is not announced (it is in that list's unread count).
Deviation: app change in notifications hook/MessagingContext (real race found during runs); suite 48; two exported helpers.
Highest task ID reserved: T31
Gate: plan holds

## T25 — All phase migrations are live on the online database  [done]
Plan version: 9
Covers: AC-032, AC-033, AC-035
Root: T25
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Owner OK (2026-10-05, native question, attested): asked "Posso aplicar as 6 migrações da fase no Supabase online (vhabpcoyypobgasacsko)? … Não vou publicar o app novo" → "Pode aplicar".
- Applied to the ONLINE database `vhabpcoyypobgasacsko` (2026-10-05 UTC), one transaction per file with only that version recorded in `supabase_migrations.schema_migrations` (CLI statement split, `created_by`/`idempotency_key`/`rollback` NULL, matching existing rows), via `npx supabase db query --linked -f`: 20261004161806 (T5) 22:54:10; 20261004170724 (T24) 22:56:27; 20261004180918 (T7) 22:58:55; 20261005000414 (T23) 23:00:21; 20261005004335 (T12) 23:02:44; 20261005141134 (T15) 23:05:58.
- App NOT deployed against the online database (published build still live). Migration files, `.env.local` untouched; no commit. Scripts/smokes/snapshots in scratchpad `t25/`.
Evidence:
- Performer pre-flight: `migration list --linked` matched the T2 baseline (newest online 20260801155137, none of the 6 present); temp-object probe confirmed multi-statement transactions and full rollback on error; all 6 scripts dry-run on LOCAL in rolled-back transactions storing statements byte-identical to the file split.
- Performer pre-checks: #2 online ACL was {postgres, anon, service_role} (anon hole confirmed); #3 exactly the 3 expected permissive receipt policies; #4 column/index absent, no long transactions; #5 constraint named `check_content_not_empty`, policies/grants as expected; #6 bucket private 10 MB 10 types, no `attachments` storage policy, legacy-audio rows 0, voice objects absent.
- Performer readback per version: version-row bytes = file; whitespace-normalized hashes = local (f2cb9153…, cce5d8f0…, ba1ad3b8…, 97f11d72…, 8b8820c3…; #2 4a937b31… online vs be9b4042… local because the local history row holds an older header comment — executable statements identical); catalog objects = local (functions/ACL/secdef/search_path, policies, columns, indexes, checks, bucket 12 types, voice checks `convalidated=t`). Full catalog snapshot online vs local identical except data counts/order and the known online-only `user-uploads` policies.
- Performer smokes (all rolled back): #1 unread 10 → record 2 → 8, repeat 0, legacy mark-all → 0, EXECUTE anon/auth/service f/f/t; #2 anon/authenticated → 42501; #3 sender 1, reader 1, non-sender member 0, outsider 0, anon 0, forged INSERT 42501; #4 same key twice → 23505; #5 client direct attachment insert / empty message insert+update / uploads SELECT / RPC EXECUTE → 42501, normal text insert works, service-role upload → RPC creates message, member reads, outsider 0, empty server text → 23514; #6 audio without metadata / 121 s / audio row without metadata → 23514, voice+file → `VOICE_NOTE_NOT_ALONE`, voice typed image → 22023, valid voice note `file` with duration 12. Published-app read path (messages, attachments/reactions/pins/stars, own-message receipts, `get_unread_counts`, legacy mark-all, keyless create) works. No leftovers (no idle-in-transaction sessions).
- Performer final: `migration list --linked` → 24 shared (incl. the 6), same 4 online-only and 9 repo-only as T2; online history 28 rows. Backups: daily physical backups visible (newest 2026-10-05 10:54 UTC, before this work); PITR disabled; no settings changed.
- Orchestrator read-only readback on the online target: `migration list --linked` shows all 6 versions local+remote; catalog query → 6 versions applied, `attachments` 12 types, `message_attachment_uploads_voice_note_check`, `message_attachments_voice_note_check`, `messages_content_not_empty_unless_attachment` all validated, anon EXECUTE on `mark_conversation_read` false, 1 SELECT policy on `message_read_receipts`. `MIGRATIONS-PENDENTES.md` rows 1–6 marked applied online.
Verification: verified (database contract online); app deployment against it not done (owner action after T21).
Discovered:
- [verified] Before #2 the anon key could call `mark_conversation_read` online — closed.
- [verified] `message_attachment_uploads` gives service_role full privileges via default privileges (identical to local; server-only).
- [reported, unconfirmed] Storage-level checks (bucket refusing `audio/mpeg`, upload 415, real upload → create → cancel) need the new app against production — T21 app smoke after deploy.
- [verified] Published build's upload `messageId` branch now returns 400 — reachable only from a debug page in `origin/main`.
Risk:
- Deploy order still mandatory: new app only after migrations (done); rollback order for #4–#6: app first, then the migration's rollback SQL (headers/TRACK).
- PITR disabled: recovery to a point between daily backups is not available.
Highest task ID reserved: T31
Gate: plan holds

## T21 — Phase completion evidence is complete and the owner accepts  [partial]
Plan version: 9
Covers: AC-031, AC-032, AC-034, AC-035, AC-036, AC-037
Root: T21
Attempt: root_attempts 1, continuation_attempts 0, continuation_limit 2, total_lineage_attempts 1, total_lineage_limit 3
State delta:
- Fixes (client only; no migration/route/repository): failed "Load more" now shows "Não foi possível carregar mensagens anteriores. Tente de novo." (`role=alert`, kept in the hook because receipt-triggered refetches clear TanStack's `isFetchNextPageError`; cleared on retry/conversation switch) — `useMessages.ts`, `contexts/messaging/types.ts`, `MessagingContext.tsx`, `message-feed.tsx`; "Ver na conversa" accessible name now "Ver na conversa: <preview or file name>, dd/MM HH:mm" (`StarredMessagesView.tsx`); `composer-image-button` opens an image-only picker "Anexar imagens" through the pending-file validation (`message-composer.tsx`, `attachment-policy.ts` `IMAGE_ATTACHMENT_INPUT_ACCEPT`).
- New E2E: `messaging-feed-stability.spec.ts` forced 500 on older page → alert, feed kept, keyboard retry loads; `messaging-attachments-composer.spec.ts` image button by keyboard, image-only accept, upload, remove → DELETE; `messaging-starred-jump.spec.ts` distinct accessible names asserted → suite 50.
Evidence:
- Performer: type-check exit 0; lint 0 errors / 485 warnings (15 on phase lines, all `no-non-null-assertion` in `message-attachments.test.ts`; `eslint.config.mjs` diff only ignores `.next-messaging-local`); build exit 0 (before/after fixes); `git diff --check` clean; DB 44/44; full E2E 50/50 (13.4 m, 0 failed/flaky/skipped, 0 leftover seeds); `npm test` 111 files 1289/1289.
- Performer review gate (`supabase-rls-reviewer`, all 6 migrations + routes + repositories + server libs): PASS WITH NOTES (0 blockers, 0 majors, 7 minors, 2 notes); re-review after fixes PASS. Read-only online checks: `create_message_with_attachments`, `mark_messages_read`, `mark_conversation_read`, `check_rate_limit` not executable by anon/authenticated; `get_unread_counts` executable by anon (returns no rows); `attachments` private 10 MB 12 types; no `storage.objects` policy on attachments (only 4 avatar policies).
- AC-034: `package.json` only 3 test scripts; lockfile unchanged; no new external URLs. AC-036: no unit tests added; 2 mock-only upload tests removed with DB-integration replacement (T12); room-mic hold unit test declined (T17); gap — remaining mock-based "Message Attachments Route" tests in `messages-api.test.ts` kept without a mirror assessment (minor). AC-037: keyboard and 384 px evidence per feature (T4, T8, T10, T11, T13, T14, T16, T17, T18, T19, T21); drawer fixed `w-96` clips below ~400 px (pre-existing).
- Orchestrator: type-check exit 0; `npm run test:messaging:db` 44/44; build exit 0; `npm run test:messaging:local:e2e` → 49 passed / 1 failed (13.6 m, exit 1): `messaging-feed-stability.spec.ts:131` "older pages and receipt refetches keep the reader in place…" — after `scrollIntoViewIfNeeded` on History 027's own status, `toBeInViewport({ratio:1})` saw ratio 0 for 5 s; screenshot shows History 026 at the top with a timestamp/✓✓ row just under the feed header; the in-feed header reads "Test Group 416d…" while the drawer title reads "Local Secondary". The test passed in every orchestrator full run before T21; T21 changed `message-feed.tsx`/`useMessages.ts`. Artifacts in scratchpad `t21-failures/`.
Verification: unverified — regression gate (AC-031) not met in the orchestrator run; owner UAT not started.
Discovered:
- [verified] Receipt-triggered background refetch clears TanStack's next-page error almost immediately (1-retry queries).
- [verified] Owner follow-ups (outside the phase contract or needing a migration): pin entry no-op + English; toaster/placement toast over composer; no per-user pending-upload cap; rate limit fails open on RPC error (works online today); voice duration client claim (accepted); regular attachments keep client type/extension (no content check); `mark_conversation_read` no internal membership check (service-role only; migration needed); `get_unread_counts` anon EXECUTE (harmless; migration needed); `/api/messages/get` cursor not validated; seed route default POST/DELETE should also require local mode; active conversation not restored after reload; rows reorder during refetch; local storage 901 orphan attachment objects (seeder cleanup should delete files); drawer clipped below ~400 px.
- [reported, unconfirmed] Feed header shows a group name ("Test Group …") while the drawer title shows the DM partner — possible header/conversation mismatch or seed naming — T32 to check.
Risk:
- New app not deployed; storage-level online checks need it. Rollout order: migrations (done) → app.
Highest task ID reserved: T31
Gate: replan required

## Replan checkpoint — T21
Old plan version: 9
New plan version: 10
Trigger: TRACK T21 [partial] — orchestrator full run failed `messaging-feed-stability.spec.ts:131` (own status of History 027 not in viewport after scrolling into view) after T21's feed changes; owner UAT pending.
Result: T32 (Root: T21, continuation 1, "The final diff passes every gate and the owner accepts the phase") replaces T21; T21 removed from PLAN (attempted).
Highest task ID reserved: T32
Gate: replan done (plan version 10)

## T32 — The final diff passes every gate and the owner accepts the phase  [done]
Plan version: 10
Covers: AC-031, AC-032, AC-034, AC-035, AC-036, AC-037
Root: T21
Attempt: root_attempts 1, continuation_attempts 1, continuation_limit 2, total_lineage_attempts 2, total_lineage_limit 3
State delta:
- Feed race fixed at its root (pre-existing since T3 `use-feed-scroll-anchor`): a scroll made ~50 ms before a receipt-triggered refetch commit was reverted because the anchor was updated only on `scroll` events and at commits. Trace: scrollTop 3560 → 3794 after `scrollIntoViewIfNeeded` → back to 3560 when the refetched rows landed. Fix: `captureBeforeCommit()` in `use-feed-scroll-anchor.ts` + new `src/components/messaging/FeedScrollSnapshot.tsx` (class component, `getSnapshotBeforeUpdate` calls it when `messages` changes), rendered in `message-feed.tsx`. T21 was not the cause (no load-more alert in the DOM snapshot; anchor hook untouched by T21).
- Drawer title bug (pre-existing in HEAD): `MessagingDrawer.tsx` titled every non-room conversation as a DM partner; GROUP now uses its name (fallback "Group"); `data-testid="messaging-drawer-title"`. This explains the "Test Group …" feed header under "Local Secondary" drawer title seen in T21.
- Tests: new feed-stability test "a scroll made just before a refetch is applied is kept; the feed does not jump back" (before fix 4/4 fail, after 4/4 pass); read-by 3-member group test asserts drawer title `/^Test Group /` (with the group branch disabled it reads "Received: Local Secondary"). Suite 51 E2E. No assertion weakened, no skip, no retry, no budget raised.
- Owner decisions (2026-10-06, native question, attested): "Favoritas" stays as the per-conversation header toggle (SPEC FR-021); notification body may show the full message text.
Evidence:
- Performer: affected specs `--repeat-each=2` 18/18; two consecutive full runs `{"expected":51,"skipped":0,"unexpected":0,"flaky":0}` (12.9 m, 13.0 m); DB 44/44; type-check 0; lint 0 errors / 485 warnings; build 0; `git diff --check` clean.
- Orchestrator: reviewed `FeedScrollSnapshot` + `captureBeforeCommit`; type-check exit 0; `npm run test:messaging:db` 44/44; full `npm run test:messaging:local:e2e` 51 passed (14.0 m), exit 0; build exit 0.
- Owner UAT (attested, 2026-10-06): ran the checklist (receipts DM/group/room, attachments by clip/drag/Ctrl+V/image button with remove, voice note with room mic, starred + "Ver na conversa", desktop notification in background tab, offline send + "Tentar de novo") with the new app locally (`npm run dev`) against the online database `vhabpcoyypobgasacsko` and answered "Perfeito!!! sensacional"; the only issue reported was not finding where "Favoritas" is (it is the star toggle in the open conversation's header; there is no cross-conversation starred view) — owner chose to keep it as is.
Verification: verified (automated gates) + attested (owner UAT acceptance).
Discovered:
- [verified] The owner's UAT exercised the new app against the online database, so real uploads/voice notes/receipts written during UAT are owner test data in production.
- [reported, unconfirmed] Real Safari (macOS) voice playback not reported by the owner; AC-022 recorded for available browsers (Chrome/Edge/Firefox, T18).
- [reported] Discoverability: "Favoritas" toggle is hard to find; a cross-conversation starred view would be new scope (candidate for a later SPEC).
Risk:
- New app still not deployed; deploy is the owner's action. Order: migrations (done) → app; rollback: app first, then migration rollback SQL.
Highest task ID reserved: T32
Gate: plan holds

## Terminal checkpoint — phase-4-messaging-timeline
Plan version: 10
Result: PLAN has no remaining task; every lineage closed (Root T21 closed by T32 done). Route: REPORT.
Highest task ID reserved: T32
Gate: terminal (report)
