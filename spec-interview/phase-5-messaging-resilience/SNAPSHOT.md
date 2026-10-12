# SNAPSHOT: phase-5-messaging-resilience
Updated after: TRACK.md "## T23 — Online migration rollout and owner acceptance  [done]" (plan version 4)

## Deliverables
- supabase/migrations/20261007031057_read_state_membership_guard_and_unread_counts_acl.sql — applied local + online `vhabpcoyypobgasacsko` 2026-10-10 — accepted (T1)
- supabase/migrations/20261007095045_message_send_attempt_fencing.sql — applied local + online `vhabpcoyypobgasacsko` 2026-10-10 — accepted (T2)
- supabase/migrations/20261007114454_message_create_budgets_insert_quota.sql — applied local + online `vhabpcoyypobgasacsko` 2026-10-10 — accepted (T3)
- supabase/migrations/20261007153119_message_mentions_and_conversation_roster.sql — applied local + online `vhabpcoyypobgasacsko` 2026-10-10 — accepted (T4)
- supabase/migrations/20261007184118_conversation_membership_integrity.sql — applied local + online `vhabpcoyypobgasacsko` 2026-10-10 — accepted (T28)
- supabase/migrations/20261007224737_conversation_typing_private_topic.sql — applied local + online `vhabpcoyypobgasacsko` 2026-10-10 — accepted (T5)
- supabase/migrations/20261008012709_rate_limit_window_serialization.sql — applied local + online `vhabpcoyypobgasacsko` 2026-10-10 — accepted (T6)
- POST /api/messages/metrics (BR-013-only log lines, closed enums in `metrics-contract.ts`, 50 events/16 KB, fail-closed 30/min) — accepted (T6)
- Private typing topic `conversation:<lowercase uuid>:typing` (members only, broadcast only, fenced sessions refused), `conversationTypingTopic()` — accepted (T5)
- Membership integrity: no client-created/moved/deleted memberships; revocations; `join_room_conversation`, `restore_conversation_membership` — accepted (T28)
- Mentions (create `mentionIds`, `mentionedUserIds` on messages, `list_message_mentions`) and GET /api/conversations/members (`list_conversation_members`) — accepted (T4)
- POST /api/messages/create (attemptGeneration, expectedSenderId; request budget; insertion quota) and POST /api/messages/fence (fence budget) — accepted (T2, T3); API contract in TRACK T2, budgets in TRACK T3
- Phase 5 E2E runner (`npm run test:messaging:phase5:e2e` real Chrome + Edge; `test:messaging:phase5:regression:e2e` Phase 4 regression), fixtures `fixtures/messaging-phase5.ts` (A–E, DM/group/room, devices, membership remove/restore, budgets, serverLog), raw log tee, cleanup + browser-state helpers, harness probe — accepted (T24)
- Per-stream Realtime fault harness (`helpers/realtime-stream-faults.ts`, fixture `messaging-phase5-faults.ts`: error/timeout/close one of messages/list/typing, Presence observed) + probe — accepted (T25); product: debug-gated list-channel status trace
- Key-only correlation: `clientMessageId` on responses, mapper, Realtime, optimistic items; pending items in `['messages-pending', users.id, conversationId]`, retired on first observation of the stored key; heuristic matching removed; ChatWindow uses the merged reader; spec client-correlation (5 tests) — accepted (T7)
- Durable outbox (IndexedDB `vo-messaging-outbox`, per users.id; write-before-dispatch; ordered per-conversation drain with Web Lock; generation+1 redispatch; ack validated by `outbox-ack.ts`; D5 storage failure; labels pendente/enviando/não enviada/expirada); spec durable-outbox (13 tests) — accepted (T8; block A closed)
- Fenced unknown-outcome recovery (fence before redispatch/expiry, 24 h window, 403 → failed, Tentar de novo / Apagar on failed or expired copies); spec unknown-outcome-fence (8 tests); shared helper `helpers/messaging-outbox-e2e.ts` — accepted (T27; block A closed)
- Cross-tab outbox (shared queue via BroadcastChannel, 30 s deadline / 45 s lease with lock takeover, outage supersede, atomic Cancelar); spec cross-tab-outbox (8 tests incl. T13 #7) — accepted (T10; block A closed)
- Definitive failures (Tentar de novo / Apagar, blocks only later items), 409 rekey, shared cross-tab 429/401 backoff, 24 h expiry for every item via fence; spec definitive-failures-expiry (7 tests) — accepted (T9; block A closed)
- Identity fencing (owner = users.supabase_uid check before dispatch/fence and after responses, session-end hold across tabs, resume on same-user sign-in, 401 transient); spec identity-fencing (6 tests) — accepted (T11; block A closed)
- Sign-out confirmation (single reachable control EnhancedUserMenu; dialog with exact text, Cancelar/Esc no-op, focus trap; Sair mesmo stops drains in all tabs, deletes the outbox, then the unchanged Presence logout); spec sign-out-unsent (5 tests) — accepted (T12; block A closed)
- Realtime health and recovery (`realtime-health.ts` store + `startRecoveringChannel`: messages and list streams rejoin on new topics with capped backoff 250·1.5^n ≤ 5 s, no join while the socket is down, catch-up on rejoin; drawer banner offline / "Reconectando…" > 5 s, polite region; recovery drain via resumeDrains; #7 outage supersede by the active tab); spec realtime-recovery-banner (8 tests) + cross-tab-outbox #7 — accepted per task (T13, block B review pending)
- Polling fallback (`useMessagingPollingFallback` + `polling-fallback.ts`: unhealthy required stream > 30 s and visible → feed, reader lists and list every 15 s, immediate on visible, none hidden, stops when healthy; monotonic merge `mergePolledMessages` with unchanged-since guard; `source=poll` marker); spec realtime-polling-fallback (3 tests); banner flash fix — accepted per task (T14, block B review pending)
- Typing on the private topic (`useConversationTyping`, roster names via `useConversationMembers`, own sessions filtered by users.id, joined only while the roster lists the viewer, refused join = access loss, recovery via startRecoveringChannel); removal signal = conversation_members DELETE/INSERT on the list channel; handlers ignore other tables/events (`isPostgresChangeOf`), invalid timestamps never crash; spec typing-indicator (10 tests) — accepted per task (T15, block B review pending)
- Drawer restore per user: sessionStorage per tab, on reload/back-forward only, list if access lost, closed stays closed, another user never inherits; global keys removed (fixes the T16 tab jump); spec drawer-restore (2 tests) — accepted per task (T20, block C closed under D15, specs first run at T22)
- Client messaging metrics: bounded per-tab buffer, fire-and-forget batches to the T6 route (one in flight, 5 s abort, pauses after failure/429), send latency/outcomes, stream drops/recoveries, polling episodes; spec messaging-metrics (2 tests) — accepted per task (T19, block C closed under D15, specs first run at T22)
- Mention desktop notifications: authorized by a feed read under the current identity, synchronous final re-check (identity, sign-out stop, removal, toggle, browser-wide view registry), one notification per message; spec mention-notifications (3 tests) — accepted per task (T18, block C closed under D15, specs first run at T22)
- @mentions: accessible "@" member list (roster minus viewer), mention ids in outbox items and attachment/voice creates (identical on retry), spans for everyone, cue + highlight for the mentioned viewer, live INSERT enrichment by coalesced feed refetch; spec mentions (3 tests) — accepted per task (T17, block C closed under D15, specs first run at T22)
- Cross-device read state (own receipt INSERT refreshes the conversation list; sender receipts and own messages already live); spec cross-device-read-state (3 tests) — accepted per task (T16, block B review pending)
- Block A review r1 fixes F1–F4, F5-partial, F8 (strict claims, identity checks on enqueue/count/purge, retired observed rows, acquiredAt takeover rule, deleted-delivered broadcast); block A gate evidence: blockA-run-{1,2,3}, blockA-rerun2-{1,2,3}, blockA-fix-regression-chrome-run (+ rerun-232) — TRACK "Gate checkpoint — block A closed"
- Run evidence for T1–T11 under test-results/ was wiped on 2026-10-08 (TRACK T12 correction); TRACK keeps the verified summaries; block A gates regenerated T8–T12 evidence
- Integration tests read-state-membership-acl, message-attempt-fencing, message-send-budgets, message-mentions, conversation-membership-integrity, conversation-typing-topic, messaging-metrics-route — accepted; legacy unit tests message-cache (TRACK T7), messages-create-route (TRACK T4), conversations-join-route and conversation-resolver (TRACK T28) deleted with integration replacements

## Open lineages
- None open. T22 done (2026-10-10); T23 done (2026-10-12): 7 migrations applied online and catalog-verified, owner final test of the app against the online database accepted (attested). Next: REPORT. Deploy by owner merge to staging and main; exposed-schemas check not confirmed by the owner.

## Constraints and decisions affecting remaining work
- Owner D8: online app used only by owner and friends; old-hosted-build read compatibility edge accepted — affects T21 — source TRACK T1
- New public functions need explicit REVOKE/GRANT (default privileges grant anon) — affects any later migration — source TRACK T1
- Every message insert runs inside `create_message_attempt` (service_role only); clients have no INSERT on public.messages; keys immutable; keyed messages cannot move conversation/sender — affects T8+ — source TRACK T2, T3
- `create_message_attempt` returns the created row as `message` when created — affects T7 — source TRACK T3
- Budgets fail closed → 429: insertion quota 30/60 s (winning insertion only), create-request 60/60 s, fence 90/60 s; ≤120 new attempt rows/user/min, no retention — affects all create/fence callers, E2E load — source TRACK T3
- Only the exact NOT_PARTICIPANT marker maps to 403; other 42501 → 500 — affects T27, T9 — source TRACK T3
- Fence returns 403 NOT_PARTICIPANT after access loss (definitive) — affects T27, T9 — source TRACK T2
- DB-suite and E2E flakes (message-readers Realtime wait; attachments signed URL; reconnect-consistency:232 read-count poll): rerun once, report both — affects all gates — source TRACK T1, T2, T3
- Migrations local only until T23; before T23 count keyed messages on target, confirm exposed schemas exclude `private`, and read ACLs on public.messages, count participants without a member row (backfilled as revoked), re-run T28 migration on 55P03, validate full realtime.messages policy list and that the role can create policies there, read back check_rate_limit body/ACL before/after — affects T23 — source TRACK T2, T3, T28, T5, T6
- Mentions not in Realtime payloads; composer sends `mentionIds` only with `clientMessageId` and unchanged on every retry (else 409) — affects T8, T17, T18 — source TRACK T4
- Memberships only via authorized server paths; client DELETE refused; administrative removal = revocation; only `restore_conversation_membership` rejoins (use it in the T24 re-add fixture) — affects T24, T9 — source TRACK T28
- `npm run test:presence:db` leaves local presence mode `legacy`; restore `atomic` before messaging E2E — affects all gates — source TRACK T28
- Hosted build e27dd10 cannot create conversations (INSERT … RETURNING, distinct ids) on the pre-T28 DB already — inherited T21 exception, D8 does not cover it — affects T21 — source TRACK T28
- Typing (T15): private topic via `conversationTypingTopic()`, WebSocket broadcast only, no presence on it, refused join/CLOSED after re-auth = access loss, leave on an independent membership signal (Realtime caches authorization per join), payload userId not bound to sender; old builds still use the public `conversation:<id>` topic until T15 ships — affects T15 — source TRACK T5
- Presence suite baseline: 2 known pre-existing failures (screen-share-lease media-topic RLS, phase6-cutover-audit); screen-share-realtime-policy depends on start mode — affects all gates — source TRACK T5, T28
- `check_rate_limit` serialized per (user, action) with clock-after-lock windows for every action (T6 migration); budgets: metrics 30/min — affects T19, T23 — source TRACK T6
- Metrics (T19): import `metrics-contract.ts`; add `unauthorized_transient`/`lease_expired` reasons or document a mapping; AC-028 E2E clause is T19 — affects T19 — source TRACK T6
- E2E gates from now on: Phase 5 runner, retries 0 (cadence per D11: one Chrome pass per task, 3 consecutive runs Chrome + Edge per block), save JSON run records under `test-results/` (reviewers need them); old and new runners share port 3210 and cannot run concurrently — affects all remaining tasks — source TRACK T24
- Browser storage naming: IndexedDB `vo-messaging*` (close on versionchange), keys `vo:messaging:*`, register every new store in `messaging-browser-state.ts`; UI-created conversations must be deleted by their spec — affects T7, T8, T10, T20 — source TRACK T24
- Fault harness: attach before the socket exists; one WebSocket route per socket (no `controlRealtimeConnection` on the same page); recovery proof = `waitForReady` + fresh event; status waits aggregate watched pages (select one page with several tabs); timeout cells start with CHANNEL_ERROR; list and typing have no recovery after CLOSED today; close on private topics unverified — affects T10, T13, T14, T15, T16 — source TRACK T25
- Outbox seam (T8): render queued items through the pending store + `visiblePendingMessages`, match only by (senderId, clientMessageId), confirmed on first observation of the stored key, never revived by deletion, `temp-<key>` ids; lift `sendInFlightRef` for queued sends; keep delivery/attempt state separately from the pending query — affects T8, T10, T27 — source TRACK T7
- Owner D11 (2026-10-08): adversarial review per block (A = T8, T27, T10, T9, T11, T12; B = T13–T16; C = T17–T21) + final T22; another round only for High/Medium a real user or realistic failure triggers, max one fix round per block; per task type-check, lint, one Chrome pass of new specs + one non-vacuity break; per block 3× Chrome+Edge over the block's new specs, regression Chrome, DB suite if server changed — affects all remaining tasks — source state.md D11, AGENTS.md
- Owner D15 (2026-10-10): no E2E before T22; T22 is the first and only E2E run of the remaining work, one Playwright process at a time, nothing heavy in parallel — affects T22 — source state.md D15
- Outbox/Realtime gaps after T13: cancel only for waiting gen-0 items; rekey changes the pending copy id (T17–T20); silent miss — a SUBSCRIBED channel can drop INSERTs unseen by health or unhealthy-only polling (REPORT / owner decision); retries never give up or classify permanent failures (T19/T22); typing recovery via startRecoveringChannel (T15); follow-ups to T22/REPORT: #5 persisted sign-out epoch, #6 discard intent on storage failure (+ unverified at sign-out), #9 feed-before-409 rekey, OutboxNotOwnerError generic copy, dead dashboard-header handleSignOut, D1 margin (last arrival 8897 ms) — source TRACK T8–T13, block A checkpoints
- Owner D10: Low-only review closes a task gate; per-task regression E2E in Chrome only, Chrome + Edge at T22 — affects all remaining tasks — source state.md D10
- Same-browser tab jump: a list-view tab restores the conversation another tab opened (MessagingContext.tsx:126-151) — affects T20; multi-session specs use separate openDevice contexts — source TRACK T16
- Run hygiene: Playwright run JSON embeds runner env → redact every record (scratchpad redact-run.cjs); never run playwright.config.ts without --output; wait for ports 3100/3210 to be free between runs — affects all remaining tasks — source TRACK T12, block A closed
- Raw server log lines carry ANSI codes and unredacted non-metric JSON; AC-028 scan parses metric lines only — affects T19 — source TRACK T24
- Rollout: before deploy confirm `conversation_members` is in the online supabase_realtime publication (list stream binding); old builds type on the public topic, new on the private one — affects T21, T23 — source TRACK T15
- Rollout: migrations before app (feed needs T4 RPC); rollback app first, SQL in reverse order — affects T23 — source TRACK T4

## Unresolved
- D1 margin server-bound in local dev (10 messages in 6.0–8.8 s; server code 79–93 %): owner decision at REPORT; run records embed public local demo Supabase keys from the runner env (never point the runner at a hosted project) — source TRACK T8
- Out-of-scope follow-ups for the REPORT: stored-message deletion races (missed deletion + late 201; stale GET after DELETE) acceptable while no product delete path exists (TRACK T7); presence E2E fixture loopback guard (`presence/local-fixture.ts`) bypassable; seed route legacy actions not gated on local mode — source TRACK T24
- Hosted git ref not yet provided by owner — affects AC-034 (T21); a build from 2026-02-09..2026-02-23 would lose the knock log message after T3 — source state.md D8, TRACK T3
- Messages deleted before T2's migration with a key cannot be tracked (none expected online) — affects BR-004 — source TRACK T2

## Coverage pointers
- FR-029, FR-030, AC-030, AC-031 — TRACK.md T1
- FR-006, FR-011, FR-034, BR-001, BR-004, BR-005, AC-044, AC-045, AC-046 (server parts) — TRACK.md T2
- FR-008, AC-009 — TRACK.md T3
- FR-023, FR-024, BR-010, AC-024 (server), AC-046 (replay clause) — TRACK.md T4
- AC-019, AC-024, AC-030 (membership integrity part), AC-034 (old-build contracts at introduction) — TRACK.md T28
- FR-019, BR-009, AC-019 (DB/Realtime clauses; E2E removal clause → T15) — TRACK.md T5
- FR-027, BR-013, AC-028 (route clauses; E2E clause → T19) — TRACK.md T6
- BR-015, AC-036 (harness) — TRACK.md T24
- AC-015 (fault harness only; behavior → T13) — TRACK.md T25
- FR-034, AC-050 — TRACK.md T7
- FR-021, FR-022, AC-021, AC-022 — TRACK.md T16
- FR-023, FR-024, FR-026, BR-010, AC-023, AC-027, AC-037, AC-048 (mention clause), UI clauses of AC-024 — TRACK.md T17
- FR-025, BR-011, AC-025, AC-026, AC-049, AC-046 (notification clause) — TRACK.md T18
- FR-009, FR-027, FR-028, AC-028, AC-029 — TRACK.md T19
- FR-031, BR-016, AC-032 — TRACK.md T20
- BR-014, AC-034 (amended D14) — TRACK.md T21
- FR-015 (typing), FR-017–FR-020, BR-009, AC-015 (typing), AC-017–AC-020 — TRACK.md T15
- FR-016, BR-012, AC-016, AC-048 (reaction/receipt/attachment/history) — TRACK.md T14
- FR-014, FR-015, AC-014, AC-015 (messages/list), AC-037 banner, AC-041 outage clause — TRACK.md T13
- FR-013, BR-008, AC-013, AC-037, AC-047 — TRACK.md T12
- FR-011, FR-012, BR-001, AC-012, AC-044, AC-047 — TRACK.md T11
- FR-002, FR-007, FR-008, FR-009, BR-005, BR-006, AC-007, AC-008, AC-009, AC-010, AC-043, AC-046 — TRACK.md T9
- FR-002, FR-004, FR-005, BR-003, BR-007, AC-005, AC-006, AC-041, AC-045 — TRACK.md T10
- FR-005, FR-006, FR-009, BR-005, BR-007, AC-003, AC-038, AC-040, AC-042, AC-046 — TRACK.md T27
- FR-001, FR-002, FR-003, FR-010, FR-033, BR-002, BR-003, AC-001, AC-002, AC-004, AC-011, AC-039 — TRACK.md T8
- AC-035 — TRACK.md T1–T6, T28 (per task)
