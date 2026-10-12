**Verdict: revision required.**

Source-only review against Final v4 and D1–D11. No files changed, services accessed, or runtime processes started.

**Findings, most severe first**

1. **High — Initial joins can leave an old account’s subscription alive.**  
   **Trigger:** realistic failure — socket outage followed by account switch.  
   **Location:** [realtime-health.ts:219](E:/projects/virtual-office/src/lib/messaging/realtime-health.ts:219), initial invocation at line 328.

   The socket-down guard exists only in the retry timer. An initial join can therefore enter Phoenix’s socket buffer. A subsequent socket error resets its join reference; cleanup then queues a leave with a null reference. On reconnect, the buffered join can create the orphan server channel already described in TRACK. With A’s still-valid token captured in that join, A-authorized message frames can continue reaching the browser after C signs in. `isCurrent()` protects application callbacks, but does not remove that server subscription.

   **Smallest fix:** defer initial joins as well as retries until the shared socket is connected.  
   **Test:** extend `realtime-recovery-banner.spec.ts`: mount A’s channels while the socket is unavailable, switch to C, restore it, and assert no A topic remains joined or receives fresh A-private message frames.

2. **Medium — Normal clients retain typing access during a removal-stream outage.**  
   **Trigger:** realistic failure — membership removal while only the list stream is down.  
   **Location:** [useConversationTyping.ts:79](E:/projects/virtual-office/src/hooks/realtime/useConversationTyping.ts:79), [useConversationRealtime.ts:139](E:/projects/virtual-office/src/hooks/realtime/useConversationRealtime.ts:139).

   The cached roster keeps `canJoin` true. Nothing checks it periodically during the outage; T14 does not poll rosters, and refreshing the conversation list does not revoke the active typing hook. E can therefore remain joined and receive/send typing well beyond five seconds after removal.

   D3/D6 accept continued access for **tampered clients**, not this normal-client behavior. The test at `typing-indicator.spec.ts:348` instead measures from recovery and explicitly expects no earlier leave.

   **Smallest fix:** suspend typing when its independent removal signal becomes unavailable, then revalidate membership before resuming.  
   **Test:** keep the list stream unavailable beyond five seconds after removal; require departure measured from removal and no subsequent typing delivery.

3. **Medium — A delayed online event can supersede a fresh, live claim.**  
   **Trigger:** realistic failure — a suspended tab processes connectivity recovery late; clock adjustment also defeats the timestamp heuristic.  
   **Location:** [message-outbox.ts:858](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:858), [outbox-db.ts:366](E:/projects/virtual-office/src/lib/messaging/outbox/outbox-db.ts:366).

   A resumes at time zero and starts a fresh generation at +100 ms. B processes its queued `online` event at +3 s. After B’s grace period, A’s fresh claim satisfies `updatedAt < reconnectedAt − 1 s`, so B steals and replaces it. Losing the Web Lock does not abort A’s create, allowing two creates for the conversation to remain in flight. Server fencing protects the stored key; it does not satisfy FR-004’s request-exclusion rule.

   **Smallest fix:** identify pre-outage claims through a shared outage epoch, rather than each tab’s recovery timestamp.  
   **Test:** extend `cross-tab-outbox.spec.ts`: hold A’s fresh post-recovery create, thaw B late, and assert no replacement claim, fence, or second create before A resolves.

4. **Medium — Block A finding #7 remains open when connectivity returns without a browser online event.**  
   **Trigger:** realistic failure — WAN/gateway outage while `navigator.onLine` remains true, with the holder frozen.  
   **Location:** [message-outbox.ts:487](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:487), takeover eligibility at line 858.

   Realtime recovery calls `resumeDrains()`, but does not establish recovery takeover eligibility. With `reconnectedAt === null`, the active tab respects the frozen holder’s 45-second lease and misses the ten-second deadline. FR-002 explicitly includes Realtime recovery; the recorded browser-online-only deviation is not a SPEC waiver.

   **Smallest fix:** make recovery from an observed connectivity outage eligible through the same shared recovery mechanism, while preserving fresh claims.  
   **Test:** adapt the #7 test so HTTP and Realtime recover while the browser remains online throughout; enforce ten-second delivery through the active tab.

5. **Medium — A late successful join reply leaves a catch-up blind window.**  
   **Trigger:** realistic failure — delayed Realtime join reply that succeeds before timeout.  
   **Location:** [useMessageSubscription.ts:379](E:/projects/virtual-office/src/hooks/realtime/useMessageSubscription.ts:379), [useConversationRealtime.ts:139](E:/projects/virtual-office/src/hooks/realtime/useConversationRealtime.ts:139).

   Catch-up runs on `system: postgres_changes/ok`. Before the join reply installs binding IDs, specific-event listeners receive nothing. If that system confirmation triggers catch-up, a receipt/removal then occurs, and the delayed join reply subsequently succeeds, the skipped event receives no final reconciliation. `SUBSCRIBED` does not refetch the feed/readers/roster again.

   This is a recovery-window failure under FR-015, distinct from the recorded healthy-stream silent INSERT miss.

   **Smallest fix:** reconcile when binding installation completes as well as on stream confirmation, coalescing overlapping work.  
   **Test:** delay only the real join reply under D4, pass the system confirmation and subsequent receipt/removal, then release the reply before timeout and verify authoritative state without another event.

6. **Medium — One stalled request blocks every later polling round, including another account’s.**  
   **Trigger:** realistic failure — a request or response body stalls while other HTTP requests work.  
   **Location:** [useMessagingPollingFallback.ts:119](E:/projects/virtual-office/src/hooks/realtime/useMessagingPollingFallback.ts:119); fetches lack deadlines in `messaging-api.ts`.

   `roundInFlightRef` remains true until every round member settles. A held feed/list/readers request suppresses all subsequent rounds, visibility recovery, and polling after A switches to C. Browser transport timeouts can exceed the fifteen-second contract substantially. This is Medium under D11’s realistic-failure rule, despite its Low classification in TRACK.

   **Smallest fix:** bound and abort round requests; scope ownership by identity/generation so an obsolete round cannot block or release another user’s round.  
   **Test:** extend `realtime-polling-fallback.spec.ts` with a stalled round member, subsequent working HTTP, visibility changes, and account switch.

7. **Medium — An initial reader-list fetch can swallow a live receipt invalidation.**  
   **Trigger:** realistic failure — delayed initial reader response concurrent with another reader’s receipt.  
   **Location:** [useMessageSubscription.ts:355](E:/projects/virtual-office/src/hooks/realtime/useMessageSubscription.ts:355), also line 394.

   TanStack’s installed implementation cancels an in-flight refetch only when cached data already exists. While the initial readers query has `data === undefined`, invalidation reuses its pending promise. Its stale response then lands and clears invalidation, leaving reader details stale even though the feed summary updates.

   **Smallest fix:** defer reader reconciliation until an existing fetch settles, as the feed already does.  
   **Test:** extend `cross-device-read-state.spec.ts`: hold the first real readers response, have C read, release the stale response, and require both devices’ details to catch up.

8. **Medium — Unrelated feed writes can starve polling updates indefinitely.**  
   **Trigger:** real user — continued sends/reactions overlapping polls during an outage.  
   **Location:** [polling-fallback.ts:40](E:/projects/virtual-office/src/lib/messaging/polling-fallback.ts:40), [message-cache.ts:303](E:/projects/virtual-office/src/lib/messaging/message-cache.ts:303).

   Any feed write rejects updates to **every existing message**. A sending another message during each slow round prevents an older message’s new receipt/reaction from ever merging. “The next round catches up” is therefore not guaranteed, and FR-016’s receipt deadline fails while HTTP works.

   **Smallest fix:** preserve concurrently changed messages individually while updating unaffected messages.  
   **Test:** keep Realtime unavailable, overlap consecutive polls with unrelated composer sends, and require an older message’s receipt/reaction to update within the polling deadline.

9. **Medium — Polling permanently omits loaded history beyond 1,000 messages.**  
   **Trigger:** real user — loading sufficiently deep history.  
   **Location:** [polling-fallback.ts:84](E:/projects/virtual-office/src/lib/messaging/polling-fallback.ts:84), fallback condition at line 103.

   After ten pages, the oldest loaded message may remain uncovered. Because recent polled messages overlap the cache, the fallback condition is false. Every later round restarts at the newest page, so receipts on older loaded messages never update. FR-016 covers receipt summaries of loaded messages without this cutoff.

   **Smallest fix:** detect incomplete loaded-range coverage and reconcile the remaining range through a bounded continuation.  
   **Test:** load more than 1,000 messages, change a receipt beyond the poll’s range without sending new messages, and verify it updates.

10. **Medium — A throttled roster refresh may never run later.**  
    **Trigger:** real user — two newly joined typists within ten seconds.  
    **Location:** [useConversationTyping.ts:209](E:/projects/virtual-office/src/hooks/realtime/useConversationTyping.ts:209).

    C’s unknown signal refreshes the roster. D joins shortly afterward and starts typing; D’s refresh is throttled. No timer schedules it later. Continuous signals keep `unknownTypist` true, so the effect never runs again and D can remain invisible indefinitely.

    **Smallest fix:** schedule the remaining throttle delay while unknown typists persist, with conversation/identity cleanup.  
    **Test:** extend `typing-indicator.spec.ts` with two successive membership additions; require the second continuous typist to appear without stopping, focus, or reload.

11. **Low — Pagination starts new poll requests after hiding or recovery.**  
    **Trigger:** realistic failure — visibility/health changes during a multi-page poll.  
    **Location:** [polling-fallback.ts:84](E:/projects/virtual-office/src/lib/messaging/polling-fallback.ts:84).

    Eligibility is checked at round start only. Subsequent page requests check identity, so page two can start after the tab becomes hidden or all streams recover. FR-016 prohibits new requests in those states. The existing overlap test uses fewer than 100 messages and cannot detect this.

    **Smallest fix:** check request eligibility before each page dispatch.  
    **Test:** hold page one of a multi-page poll, hide/recover, release it, and assert no later poll request starts.

12. **Low — Malformed message rows remain crash-capable.**  
    **Trigger:** **server-tamper follow-up**.  
    **Location:** [useMessageSubscription.ts:57](E:/projects/virtual-office/src/hooks/realtime/useMessageSubscription.ts:57), [message-item.tsx:276](E:/projects/virtual-office/src/components/messaging/message-item.tsx:276).

    Table guards fix the demonstrated cross-table dispatch crash. They do not validate a `messages` row: object content can cause an invalid React child, and a numeric sender ID can reach `.slice()`. The date guard does not establish general malformed-row safety.

    **Smallest fix:** reject unusable message-row fields before cache insertion.  
    **Test:** a separately labelled robustness probe; synthetic malformed rows must not count as SPEC acceptance evidence.

**Claims verified true**

- Error/timeout/closure retries use capped exponential backoff; generation guards fence retired-channel callbacks.
- The banner uses the render-time five-second decision and an always-present polite live region.
- Typing uses the private topic, guards against REST fallback, hides own-session signals, and resolves names through the roster.
- Table/event checks address the demonstrated receipt-to-message/reaction dispatch crash.
- T16 adds the viewer’s own receipt-triggered, coalesced list refresh using `users.id`.
- The stale-poll test checks preservation of reactions, receipts, attachments, history, and duplicate suppression.
- FR-016 does not require healthy-stream polling; the known silent INSERT miss remains routed to REPORT.

**False or overstated claims**

- TRACK T13’s “no join of any kind while the socket is down” and “post-reconnect claims are never replaced” fail in findings 1 and 3.
- “Specific-event listeners … covered by catch-up on rejoin” omits the successful late-reply window in finding 5.
- The reader-fetch cancellation guarantee omits initial fetches with no cached data.
- T14’s removed stale-badge assertion was correctly identified as invalid. Its remaining assertions prove scheduling, but the badge can already be correct through the live receipt stream.
- The #7 test proves its deliberately aborted-request scenario; it does not prove exclusion of a still-live or fresh post-recovery create.