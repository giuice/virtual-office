**Verdict: revision required.**

**Findings, most severe first**

1. **Medium — A received removal signal does not immediately suppress a pending notification.**  
   **Trigger:** realistic failure: membership removal plus HTTP latency.  
   **Location:** [use-message-notifications.ts:235](E:/projects/virtual-office/src/hooks/ui/use-message-notifications.ts:235), [useConversationRealtime.ts:37](E:/projects/virtual-office/src/hooks/realtime/useConversationRealtime.ts:37).  
   Hold an authorization response containing “member,” remove B, deliver B’s membership DELETE, and delay the resulting list/roster reads. Those caches still authorize display, so releasing the old response shows the notification. D6 permits an **unreceived** removal signal; this signal was received.  
   **Smallest fix:** synchronously record the identified removal and check its generation before display.  
   **Test:** extend AC-049 to release authorization after DELETE delivery but **before** removal refetches finish. The current test waits for the conversation to disappear.

2. **Medium — A mention arriving during the first feed fetch can disappear.**  
   **Trigger:** realistic failure: delayed initial HTTP response.  
   **Location:** [useMessageSubscription.ts:90](E:/projects/virtual-office/src/hooks/realtime/useMessageSubscription.ts:90), [message-cache.ts:210](E:/projects/virtual-office/src/lib/messaging/message-cache.ts:210).  
   Open an empty conversation and hold its initial feed response after the server reads it. Another member mentions the viewer. The INSERT arrives, but the append skips the cache because it has no data; `lacksStoredMentions` then returns false. Releasing the empty response leaves the message and mention absent until another refetch. This differs from the recorded silent Realtime miss: the event arrives.  
   **Smallest fix:** schedule deferred enrichment when an initial feed fetch exists, even without cached data.  
   **Test:** add this held-initial-response scenario to `mentions.spec.ts`, asserting one bubble and the mention cue without focus or reconnect.

3. **Medium — Mention identity follows matching text rather than the selected occurrence.**  
   **Trigger:** real user: duplicate names or replacing a draft by paste.  
   **Location:** [use-composer-mentions.ts:75](E:/projects/virtual-office/src/hooks/ui/use-composer-mentions.ts:75), [mentions.ts:113](E:/projects/virtual-office/src/lib/messaging/mentions.ts:113).  
   Selecting two members named “Ana” produces two tokens, but segmentation assigns both to the first candidate and sends only that ID. Also, selecting B and then replacing the entire draft with unselected text containing B’s `@name` retains B’s mention. Users can miss an intended recipient or accidentally notify someone.  
   **Smallest fix:** track selected occurrences with their user IDs and ranges; update or invalidate them on edits and paste. Derive IDs from those occurrences.  
   **Test:** add duplicate-name and whole-draft replacement cases to `mentions.spec.ts`, checking submitted and stored IDs.

4. **Medium — One tab’s failed authorization consumes every tab’s notification opportunity.**  
   **Trigger:** realistic failure: a lost authorization request in one of two hidden tabs.  
   **Location:** [use-message-notifications.ts:211](E:/projects/virtual-office/src/hooks/ui/use-message-notifications.ts:211).  
   H1 claims the message, then its authorization read fails. H2 receives the same message with working HTTP, but cannot claim it and never authorizes or displays it. Catch-up and polling do not notify, so recovery does not repair the loss.  
   **Smallest fix:** authorize before committing the notification claim, preserving the final synchronous identity/removal/view checks.  
   **Test:** extend the two-hidden-tabs test: fail H1’s authorization read, allow H2’s, and require exactly one notification.

5. **Medium — Restore treats failed or incomplete list data as lost access.**  
   **Trigger:** realistic failure: list-fetch failure; also a real user with more than 50 conversations.  
   **Location:** [MessagingContext.tsx:139](E:/projects/virtual-office/src/contexts/messaging/MessagingContext.tsx:139).  
   A failed initial list counts as “settled.” Restore chooses the list, completes its one-time decision, and overwrites the saved conversation. Later successful reads cannot restore it. An accessible saved conversation outside the first 50 results follows the same path. The latter is recorded in TRACK, but AC-032 has no corresponding waiver.  
   **Smallest fix:** preserve unresolved restore state through fetch errors and resolve the saved ID beyond the first page before concluding access is lost.  
   **Test:** extend `drawer-restore.spec.ts` with failed-list recovery and an accessible saved conversation outside page one.

6. **Medium — The autocomplete roster does not stay current after other members change.**  
   **Trigger:** real user: someone joins or is removed while the composer remains mounted.  
   **Location:** [use-composer-mentions.ts:59](E:/projects/virtual-office/src/hooks/ui/use-composer-mentions.ts:59), [useConversationRealtime.ts:114](E:/projects/virtual-office/src/hooks/realtime/useConversationRealtime.ts:114).  
   Participant updates refresh the conversation list, but not its cached roster. Another member’s DELETE is also excluded from refreshing a known conversation’s active roster. Removed members remain selectable; newly joined members remain unavailable until another roster refresh occurs. `staleTime` does not schedule one.  
   **Smallest fix:** refresh/invalidate the active roster for membership changes and when opening a new mention query; preserve already-submitted retry IDs.  
   **Test:** load the roster first, then remove/rejoin another member while A stays in the conversation and verify the next autocomplete list.

7. **Medium — IME keys can choose a mention or send before composition finishes.**  
   **Trigger:** real user: Enter/arrows while using an IME.  
   **Location:** [use-composer-mentions.ts:135](E:/projects/virtual-office/src/hooks/ui/use-composer-mentions.ts:135), [message-composer.tsx:318](E:/projects/virtual-office/src/components/messaging/message-composer.tsx:318).  
   Neither handler checks composition state. An IME’s composing Enter can select the active mention; with the list closed, the fallback can submit the unfinished draft.  
   **Smallest fix:** guard composing keyboard events before both mention handling and Enter-to-send.  
   **Test:** add browser E2E coverage proving composition confirmation neither selects a recipient nor creates a message prematurely.

8. **Low — AC-029’s test overstates its evidence.**  
   **Trigger:** realistic failure: metrics overload; coverage gap.  
   **Location:** [messaging-metrics.spec.ts:430](E:/projects/virtual-office/__tests__/api/playwright/messaging-phase5/messaging-metrics.spec.ts:430), [messaging-metrics.spec.ts:525](E:/projects/virtual-office/__tests__/api/playwright/messaging-phase5/messaging-metrics.spec.ts:525).  
   Buffer counters cannot distinguish dropping the oldest event from dropping the newest. The error phase also fabricates a 500 without passing through the real route, contrary to its “network shaping only” claim and SPEC §15.  
   **Smallest fix/test:** verify the emitted retained-event sequence after the pause, and pass through the real route before substituting a gateway 500.

**Claims verified true**

- Outbox attempts preserve copied mention IDs; Phase 4 retry-key comparison includes the mention set.
- Notification reads use server membership checks and stored mentions; the final display path contains no further awaits.
- Metrics delivery is not awaited by messaging. The implementation bounds the buffer/batches, enforces one request in flight, aborts after five seconds, and sends no content or identifiers.
- Drawer storage is scoped by `users.id` and tab; legacy global keys are not read.
- All seven T21 migrations match the ledger, contain rollback SQL, and exist in the **local** migration catalog. Saved Chrome-run counts match TRACK.

**False or overstated claims**

- T17’s “token intact,” “unchosen text stays plain,” “removed members never offered,” and unconditional live mention-enrichment claims have the gaps above.
- T18’s assertion that an unfinished removal refetch falls under D6 is incorrect once the removal signal has arrived.
- T19’s test does not prove oldest-event retention or exclusively real-route fault shaping. Its console-error observer also filters to metrics-related errors.

Read-only review completed. No tests or servers started, no files changed, and no online services accessed.