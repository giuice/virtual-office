**Verdict: revision required**

All 34 FRs, 16 BRs, and 50 ACs appear in `Covers`. That mechanical coverage does not establish complete task ownership or executable verification.

1. **R1 — High — T2 / Task, Verify by; T21 / ordering: Phase 4 keyed creates lack a compatibility contract.**  
   T2 explicitly preserves *unkeyed* legacy creates, but the Phase 4 composer generates keys for text, attachments, and voice sends. Its requests contain neither generation nor expected sender. See [message-composer.tsx:223](E:/projects/virtual-office/src/components/messaging/message-composer.tsx:223) and [useMessages.ts:284](E:/projects/virtual-office/src/hooks/useMessages.ts:284). Requiring the new fields whenever a key exists would break those callers. T21 discovers this only after client implementation, and its send/read/unread smoke does not expressly exercise keyed replay or attachment retry.  
   **Smallest fix:** define the compatibility behavior for Phase 4 keyed requests lacking the new fields; add text, attachment, voice, and replay checks to T2. Check affected old-build contracts when each risky migration is introduced, retaining T21 as the combined smoke.

2. **R2 — High — T3 and T6 / Done when, Verify by: budget infrastructure failures can remain fail-open.**  
   The plan correctly observes fail-open limiting but never requires changing that failure behavior for the mandatory create, fence, and metrics budgets. [rate-limit.ts:48](E:/projects/virtual-office/src/lib/auth/rate-limit.ts:48) allows requests after RPC errors; [the SQL counter:45](E:/projects/virtual-office/supabase/migrations/20260612190000_messaging_rate_limits.sql:45) increments attempts, including denied attempts—it is not a winning-insert quota primitive. Normal exhaustion tests can pass while an RPC permission/schema failure permits unlimited traffic. Early create validation also currently precedes charging ([route.ts:231](E:/projects/virtual-office/src/app/api/messages/create/route.ts:231)).  
   **Smallest fix:** require non-bypassable budget failure handling, transactional winning-insert charging, and request charges that survive insertion rollback. Test malformed-body/early-validation failures, quota losers, and real limiter permission failures. This closes FR-008 and FR-027 beyond their happy infrastructure paths.

3. **R3 — High — T8 / Done when, Depends on: T8 requires recovery implemented in T9.**  
   T8 must satisfy AC-040: close an online tab while its create is held, reopen, fence the uncertain attempt, and deliver once. T9 introduces unknown-outcome handling and fencing before redispatch, but depends on T8. T8 therefore cannot meet its completion condition using only its preceding tasks.  
   **Smallest fix:** move AC-040’s recovery completion into the fenced-recovery task; keep write-before-close durability in T8. Alternatively, move the minimal unknown/fence client behavior before T8’s recovery gate.

4. **R4 — High — T8, T10, T19 / completion coverage: D1’s ten-message deadline is unowned.**  
   AC-002 tests three queued messages; AC-041 tests one hung item. No task explicitly requires delivery of **ten** pending messages within ten seconds with quota available. An implementation delivering three in six seconds and ten in twenty seconds could pass the listed timing checks. T10 also narrows FR-004’s “before **or during** the outage” to “pre-outage attempt.”  
   **Smallest fix:** add the ten-message deadline to a task’s `Done when` and E2E evidence. Include an attempt started during an already-active outage, then recovered without waiting for the 30/45-second timeout/lease.

5. **R5 — High — T4 and T17 / Task, Verify by: mentions through the unqueued attachment path are not established.**  
   FR-023/024 do not exclude messages containing files or voice. T17 describes mention IDs traveling through the outbox, while FR-010 correctly excludes those messages from that outbox. The existing attachment path uses a separate transactional RPC ([create/route.ts:310](E:/projects/virtual-office/src/app/api/messages/create/route.ts:310)); T4’s verification does not expressly prove atomic mentions on that path.  
   **Smallest fix:** require mention IDs on both queued text and existing unqueued creates. Add a real attachment-create test where mention persistence fails and neither the message nor its attachment links commit, plus an attachment mention/retry E2E.

6. **R6 — Medium — T15 / Task, Done when, Verify by: typing recovery loses part of FR-015.**  
   T13 expressly requires application-owned recovery after errors, timeouts, and terminal closures with capped exponential backoff—but only for messages/list. T15 says typing “recovers after drops”; its verification lists a typing-only drop without terminal-closure or increasing-delay evidence. SDK socket recovery could satisfy that test while application recovery from a terminal typing-channel closure remains absent. The current typing hook only clears its subscribed flag on failure ([useConversationPresence.ts:150](E:/projects/virtual-office/src/hooks/useConversationPresence.ts:150)).  
   **Smallest fix:** assign the complete typing recovery/backoff clauses to T15 and verify each failure class independently.

7. **R7 — Medium — T17 / Task, Verify by: the current-member roster has no established server producer.**  
   Existing conversation representations expose `conversations.participants` ([SupabaseConversationRepository.ts:25](E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseConversationRepository.ts:25)). Removing a member deletes only `conversation_members`, leaving that array unchanged ([messaging-test-seeder.ts:600](E:/projects/virtual-office/src/lib/test-utils/messaging-test-seeder.ts:600)). Browser membership SELECT is own-row-only in the baseline policies. Thus neither the existing participant array nor a browser membership query supplies the required current roster. Testing only a user who *never joined* will miss removed members.  
   **Smallest fix:** assign an authorized current-member read contract to T4 or T17, and test that a removed member disappears from autocomplete.

8. **R8 — Medium — T4/T9/T18, T9/T19, T21/T23 / split completion clauses: three clauses lack explicit completion evidence.**

   | Contract clause | Gap | Smallest fix |
   |---|---|---|
   | **AC-046:** unchanged replay after recipient removal returns the stored message **and notifies no removed recipient** | T4 verifies the database replay; T9 verifies drawer outcomes; T18 does not claim this replay scenario. | Give T18 the complete replay/removal notification scenario. |
   | **FR-009:** expired manual retry preserves the **original press-send time for metrics** | T9 requires the same key and a new delivery window; its completion checks do not preserve the original metric origin. | Assert the original timestamp survives and latency uses it. |
   | **BR-014:** rollback is **application first, then migrations** | Recorded rollback SQL does not establish that operational ordering. | Require the ordering in T23’s handoff. |

9. **R9 — Medium — T9, T14, T19 / Depends on: the dependency graph omits real producers.**  
   T9’s AC-046 replay behavior needs T4’s mention contract. T14’s AC-048 mention case needs T4’s enrichment, with observable mention rendering arriving in T17. T19 instruments *every* messaging stream, but does not depend on T15’s typing lifecycle. Lower-numbered dependencies alone do not prove correct ordering.  
   **Smallest fix:** add T4 to T9/T14, place mention-specific AC-048 evidence after the rendering producer, and add T15 to T19.

10. **R10 — Medium — standing test rule; T7–T22 / Verify by: the named runner cannot establish the browser gate.**  
    The local configuration inherits an explicit Phase 4 filename allowlist and a Chromium project without `channel: 'chrome'` or `msedge` ([playwright.config.ts:62](E:/projects/virtual-office/playwright.config.ts:62)). New Phase 5 filenames are excluded unless configuration changes. The cross-browser configuration selects only the voice playback spec. The notification spec additionally forces `channel: 'chromium'`, overriding browser project selection ([notification spec:24](E:/projects/virtual-office/__tests__/api/playwright/messaging-desktop-notifications.spec.ts:24)).  
    **Smallest fix:** before the first new E2E gate, register Phase 5 specs and real Chrome/Edge projects, remove conflicting file-level overrides, and record three consecutive runs with zero retries/flaky/skipped critical tests. Chrome and Edge executables are present; configuration is the missing prerequisite.

11. **R11 — Medium — T2/T9/T11/T15/T16 / verification prerequisites: existing fixtures cannot create several required states.**  
    The E2E fixture supplies two signed-in users and an optional third member that never signs in ([fixtures/messaging.ts:34](E:/projects/virtual-office/__tests__/api/playwright/fixtures/messaging.ts:34)). AC-018 needs four active users; session switching and removal scenarios need additional authenticated members. There is no re-add or quota-exhaustion helper. Worse, attempting rejoin after fixture removal returns success from the stale participants array without restoring membership ([join/route.ts:39](E:/projects/virtual-office/src/app/api/conversations/join/route.ts:39)). Phase 4 already required replanning for fixture and interrupted-run failures—TRACK T1 and T27.  
    **Smallest fix:** add an early local-only fixture task providing A–E, removal/re-add, quota exhaustion/reset, second-device contexts, and cleanup of new server/browser state after interrupted runs.

12. **R12 — Medium — T13/T15 / Verify by: independent stream failures lack a proven harness.**  
    The existing outage helper closes **every** Realtime socket and rejects reconnects ([drawer-helpers.ts:465](E:/projects/virtual-office/__tests__/api/playwright/helpers/drawer-helpers.ts:465)). That cannot prove messages-only, list-only, or typing-only failure. Merely dropping event frames can leave the channel reported healthy, so it also does not establish banner/polling triggers. Playwright supports frame routing, but socket closure affects the entire multiplexed connection. [Playwright WebSocketRoute documentation](https://playwright.dev/docs/api/class-websocketroute).  
    **Smallest fix:** prove a topic-specific fault method before these tasks, including terminal closure and evidence that other streams remain healthy. Keep the real transport/application and preserve the independent-failure ACs.

13. **R13 — Medium — T6/T19 / Verify by: E2E log redaction evidence has no capture path.**  
    The local server configuration pipes stdout/stderr but provides no test-readable messaging log artifact ([local config:47](E:/projects/virtual-office/playwright.messaging-local.config.ts:47)). The existing capture wrapper is auth-specific and sanitizes lines before recording them ([auth metrics wrapper:46](E:/projects/virtual-office/scripts/playwright-auth-metrics-server.mjs:46)); reusing that sanitization could hide the very forbidden fields the test must detect.  
    **Smallest fix:** establish messaging log capture before T19 and scan emitted metric lines before additional test-side field sanitization. T6 can retain real in-process route log capture.

14. **R14 — Medium — T8/T9/T10 / sizing and risk ordering: the client protocol is committed too broadly before lease feasibility is proven.**  
    T8 combines durable enqueue, ordered delivery, reload/close recovery, attachment preservation, and storage failures. T9 combines unknown fencing, definitive failures, queue blocking, quota recovery, key replacement, cancellation eligibility, and expiry. These are independently failing postconditions, despite the quality gate’s “one observable Done when” claim. Cross-tab takeover is then tested only at T10. Phase 4 TRACK T16/T20/T21 shows why a broad green slice can still require substantial continuation work.  
    **Smallest fix:** separate durable enqueue from fenced recovery, and separate unknown recovery from definitive/expiry UI. Prove the minimal two-tab claim/takeover protocol immediately after the durable store/server fence, before unrelated mention and metrics work.

15. **R15 — Medium — standing review rule; T22/T23 / acceptance gate: the whole-work-item adversarial review is not scheduled.**  
    The standing rule covers each task’s diff. T22 requires suites/build/accessibility; T23 requires rollout and owner acceptance. Neither requires the separate final review of the combined work-item diff before REPORT. AGENTS.md explicitly requires that review, and state D7 waives only another **SPEC** review.  
    **Smallest fix:** add the accepted whole-diff review and finding dispositions to the final acceptance boundary, preferably before T23.

16. **R16 — Low — Observations 25/27; T12 / Verify by: two grounding claims are inaccurate.**  
    `useConversationRealtime` already exports `connectionStatus` and performs confirmed-stream catch-up ([hook:58](E:/projects/virtual-office/src/hooks/realtime/useConversationRealtime.ts:58)); it lacks application backoff and consumer wiring, rather than all health information. Also, the dashboard header’s sign-out handler is unused: its rendered entry point is `EnhancedUserMenu` ([dashboard-header.tsx:81](E:/projects/virtual-office/src/components/shell/dashboard-header.tsx:81)). “Both entry points” does not name two reachable controls.  
    **Smallest fix:** correct the observations and enumerate actual reachable logout surfaces for T12.

Claims verified as correct:

- Current keyed creation uses the stated composite uniqueness contract; `Message` lacks key correlation and optimistic matching uses content/time.
- Typing currently uses a public topic, broadcasts auth UID/display name, and does not refresh its initial true signal during continuous input.
- Committed migrations already publish both `conversation_members` and `message_read_receipts`; their publication is not inherently missing.
- T2 places server fencing early, and T18 correctly depends on T15’s removal-detection work.
- The plan explicitly prohibits online migrations before T23, requires named-target authorization, preserves Presence logout sequencing, and provides no unit-test exception.

Read-only review completed; no files modified.