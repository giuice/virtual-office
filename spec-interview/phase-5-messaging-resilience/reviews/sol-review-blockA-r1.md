**Verdict: revision required.**

This was a read-only source review against SPEC Final v4 and D1–D11. No services, browser processes, or database connections were used.

1. **High — crash recovery can make a dispatched item cancellable.**  
   **Trigger:** realistic failure: OS crash and a delayed create.  
   **Location:** [outbox-db.ts:344](E:/projects/virtual-office/src/lib/messaging/outbox/outbox-db.ts:344), [message-outbox.ts:349](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:349).

   The initial `waiting / generation 0` write is strict, but the pre-dispatch claim is relaxed. A crash can therefore recover generation 0 after generation 1 has left the machine. If Cancel wins against the recovery claim, it deletes the item without fencing; the original request can still commit. This violates FR-005/006. Stored-row uniqueness does not prevent delivery after cancellation.

   **Smallest fix:** durably commit the generation and dispatched state before allowing its request onto the network.  
   **Test:** extend `durable-outbox.spec.ts` with storage-crash recovery and an outstanding real create. Verify that recovery cannot expose an unfenced dispatched item as cancellable. Ordinary tab-close coverage is insufficient.

2. **Medium — a stale tab exposes and modifies A’s outbox while C is authenticated.**  
   **Trigger:** real user: another-tab OAuth/magic-link sign-in changes cookies without immediately updating the stale tab’s profile.  
   **Location:** [message-outbox.ts:474](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:474), [message-outbox.ts:243](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:243), [useMessageOutbox.ts:96](E:/projects/virtual-office/src/hooks/useMessageOutbox.ts:96).

   Identity verification correctly detects C and holds dispatch, but `hold()` leaves A’s pending views visible. Rendering also ignores `held`. Enqueue checks neither identity nor `held`, while sign-out count/purge use the stale profile’s `ownerId` directly. Consequently C can see A’s queued text, enqueue text under A for later delivery, or confirm sign-out and delete A’s items.

   **Smallest fix:** hide owner views on identity loss; verify identity for enqueue, count and purge; bind confirmation to the verified owner and recheck it when confirming. Preserve A’s stored items during an account switch.  
   **Test:** extend `identity-fencing.spec.ts` by keeping the stale tab open after the cookie swap. Assert that A’s copies disappear, C cannot enqueue under A, and C’s sign-out leaves A’s items intact. The current test closes that tab at line 377 before testing visibility.

3. **Medium — Realtime confirmation can remove the only takeover lease and stall the conversation indefinitely.**  
   **Trigger:** realistic failure: a frozen holder with its successful HTTP response still outstanding.  
   **Location:** [message-outbox.ts:514](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:514), [message-outbox.ts:717](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:717).

   Tab A holds the Web Lock for m1. Tab B observes m1’s stored message and deletes its claimed row. A freezes before finishing its request; m2 is now the oldest row and is `waiting`. B cannot acquire A’s lock, and `holderLeaseEnded()` only permits stealing when the oldest row is `claimed`. With that row gone, no lease expiry enables takeover. m2 waits until A resumes or closes.

   **Smallest fix:** retain a conversation ownership lease independently of message retirement, or retain the active claimed row until ownership is released.  
   **Test:** combine `cross-tab-outbox.spec.ts` with the correlation scenario: hold a real successful response, let B observe and retire m1, freeze A, and queue m2. Verify m2 recovers after the lease without resuming A.

4. **Medium — stolen ownership and successful responses are not consistently generation-checked.**  
   **Trigger:** realistic failure: a robbed tab resumes during takeover; concurrent tabs attempt takeover.  
   **Location:** [outbox-db.ts:333](E:/projects/virtual-office/src/lib/messaging/outbox/outbox-db.ts:333), [message-outbox.ts:751](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:751), [message-outbox.ts:786](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:786).

   Claiming unconditionally replaces an eligible row, including another holder’s live claim. The lost-lock check happens after that mutation and is not repeated after the awaited owner verification before dispatch. Separately, a released successful generation-1 response is accepted while generation 2 belongs to B: the delivered branch and final deletion have no current-holder/generation predicate and can erase B’s claim. Server fencing protects stored-row uniqueness, but FR-011’s newer-claim protection is missing.

   **Smallest fix:** validate ownership atomically when claiming and applying every outcome, including successful deletion; recheck lost ownership after awaits before dispatch. A steal must validate the lease it intends to supersede.  
   **Test:** resume the robbed tab while the takeover still has a live claim and held real response; assert that claim remains unchanged and the robbed tab sends nothing. Add simultaneous takeover by two contenders. Existing hung-tab tests finish takeover before unfreezing the victim.

5. **Medium — sign-out deletion has no shared barrier against subsequent enqueue.**  
   **Trigger:** realistic failure: missed broadcast, frozen/new tab, or enqueue racing purge.  
   **Location:** [outbox-sign-out.ts:88](E:/projects/virtual-office/src/lib/messaging/outbox/outbox-sign-out.ts:88), [outbox-sign-out.ts:108](E:/projects/virtual-office/src/lib/messaging/outbox/outbox-sign-out.ts:108), [message-outbox.ts:246](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:246).

   The stop exists only in live instances and BroadcastChannel messages. The deletion transaction has no shared stop marker checked by enqueue. A tab that misses the message—or an enqueue that already passed its local guard—can add a row after deletion. That row survives confirmed sign-out and can send on A’s next sign-in.

   There is also a receiving-tab dispatch gap: after owner verification, `fenceThenAttempt()` awaits IndexedDB and checks the claim, but does not check `held`/sign-out stop before starting its create ([message-outbox.ts:887](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:887)).

   **Smallest fix:** persist an owner-scoped stop/epoch, enforce it atomically with enqueue and claim, and check stopped ownership immediately before dispatch.  
   **Test:** extend `sign-out-unsent.spec.ts` with a missed-stop/new-tab case and an enqueue committed after purge. Also stop a fence continuation during its IndexedDB await. After re-login, assert an empty outbox and no post-stop create.

6. **Medium — storage fallbacks silently preserve messages after explicit sign-out.**  
   **Trigger:** realistic failure: IndexedDB read/delete rejection or timeout.  
   **Location:** [enhanced-user-menu.tsx:74](E:/projects/virtual-office/src/components/shell/enhanced-user-menu.tsx:74), [enhanced-user-menu.tsx:102](E:/projects/virtual-office/src/components/shell/enhanced-user-menu.tsx:102).

   A failed count remains `0`, bypassing confirmation, stopping and purge. A failed confirmed purge is logged, then logout continues. Neither path records a discard intent. When storage recovers and A signs in again, surviving items become ordinary resumable items and can send, contrary to FR-013/BR-008.

   **Smallest fix:** treat unreadable count as unknown, and durably record explicit discard intent before bounded deletion. Prevent subsequent draining until that intent is fulfilled; surface failure if it cannot be recorded.  
   **Test:** add read/delete failure and timeout cases to `sign-out-unsent.spec.ts`, restore storage, then sign A in again. Verify leftovers cannot auto-send. Current tests cover successful storage operations.

7. **Medium — a frozen holder still breaks the recovery deadline.**  
   **Trigger:** realistic failure: a holder freezes across an outage.  
   **Location:** [message-outbox.ts:413](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:413), [message-outbox.ts:717](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:717).

   Recovery aborts only requests belonging to the tab handling `online`. An active second tab continues respecting the frozen holder’s live 45-second lease. A single pending item can therefore miss the required 10-second recovery deadline. TRACK records this at line 473; carrying it to T13 does not waive AC-041 under D11.

   **Smallest fix:** let an active recovering tab supersede pre-outage ownership through a shared recovery epoch and server fence.  
   **Test:** freeze the holder in the outage test at `cross-tab-outbox.spec.ts:530`, recover only through the other active tab, and enforce the same 10-second deadline.

8. **Medium — a deleted delivered message leaves an unresolvable pending copy in another tab.**  
   **Trigger:** realistic failure: missed Realtime events followed by an authorized deletion.  
   **Location:** [message-outbox.ts:548](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:548), [message-outbox.ts:613](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:613).

   B misses the stored INSERT and retains its pending copy. Another authorized A session deletes the message. A’s fence resolves `stored / message: null` and retires the outbox row, broadcasting only its delivered key. B then keeps the copy until it observes a stored message that no longer exists. With no database item left, retries and cancellation cannot resolve it.

   **Smallest fix:** propagate terminal deletion separately from “stored message awaits observation,” and retire the remote copy on that terminal result.  
   **Test:** extend `client-correlation.spec.ts` with missed INSERT delivery before the real authorized delete, then resolve through the real null-message fence. Its current deletion test first requires both tabs to observe INSERT.

9. **Low — feed-before-409 can lose the content intended for rekeying.**  
   **Trigger:** real user: explicit key reuse through another/older client; this is not a realistic accidental UUID collision.  
   **Location:** [message-outbox.ts:508](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:508), [message-outbox.ts:947](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:947).

   A conflicting stored message with the same sender/key can reach the feed before the create’s 409. The observer deletes the original item. When 409 arrives, its atomic update finds no row, so no rekeyed copy preserves the queued content.

   **Smallest fix:** preserve unresolved create state until the create outcome arbitrates key reuse; feed reconciliation must not destroy it prematurely.  
   **Test:** open the feed before the 409 in `definitive-failures-expiry.spec.ts`. The current test deliberately opens it only after rekeying.

**Claims verified true**

- Initial enqueue is strict and completes before pending publication/composer clearing; initial storage failure preserves the draft and reply.
- Owner identity compares `users.supabase_uid` with the session UID; request ownership uses application `users.id`.
- Unknown and expired—including generation-0—items fence before create; 403 is never classified as “not stored.”
- Ordinary generation-0 cancellation races claims atomically. `releaseUnsentClaim` cannot restore over a different holder or newer generation.
- Once its 409 handler runs, rekeying preserves content, order and pressed-send time atomically.
- Cancel/Esc handlers have no logout side effects, and the existing Presence logout sequence is unchanged.

**False claims and test limits**

- “Claim loss is harmless,” “every tab is stopped before deletion,” “another user’s tabs never read the items,” and “the robbed loop dispatches nothing more” are stronger than the code guarantees, as detailed above.
- `identity-fencing.spec.ts:42` falsely says the Auth server is stopped. Its implemented 401 case removes the forwarded Cookie header. It proves the valid-client-session/401 branch, not an actual Auth outage, and exceeds §15’s literal shaping list.
- Synthetic 201/204 and malformed successful-body cases in `durable-outbox.spec.ts:654` and `:893` exceed §15. These are **server-tamper follow-up** coverage; “Everything is real” does not describe those responses.
- CDP `Debugger.pause` reasonably models a hung tab, and real cookie replacement models the stipulated stale-tab switch. Their sequencing still misses the failures identified above.
- The cancel-race test accepts all three rounds choosing the same winner; it does not enforce the claimed “both branches exercised.”
- TRACK records permanent loss of T1–T11 raw run evidence. Historical runtime claims were not independently reverified in this source-only review.