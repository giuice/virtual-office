**Verdict: revision required.**

1. **Medium — Valid replay responses can block the conversation indefinitely.**  
   [outbox-outcome.ts:62](/E:/projects/virtual-office/src/lib/messaging/outbox/outbox-outcome.ts:62) requires the stored text and reply target to equal the original outbox values. After a committed reply loses its response, deleting its parent sets the stored `replyToId` to null. The server deliberately returns 200 for the unchanged original composition; [message-attempt-fencing.test.ts:739](/E:/projects/virtual-office/__tests__/messaging-db/message-attempt-fencing.test.ts:739) documents this contract. Editing the stored text creates the same mismatch.

   Reopening without that conversation’s feed prevents observation from rescuing the item. Every valid replay becomes unknown, retrying indefinitely with backoff capped at 15 seconds and blocking later queued items. Server uniqueness prevents duplicates, but delivery never advances. **Smallest fix:** validate renderable field types and immutable sender/conversation/key correlation without requiring mutable stored fields to equal their original values. Preserve rejection of missing content. Add E2E coverage with the feed unopened after parent deletion or an edit.

2. **Medium — Malformed reply fields still confirm and delete durable content.**  
   [outbox-outcome.ts:39](/E:/projects/virtual-office/src/lib/messaging/outbox/outbox-outcome.ts:39) converts every non-string value to null. For an item without a reply, an otherwise correlated 201 containing `replyToId: {}`, `[]`, or `42` passes validation. The item is subsequently deleted even if the malformed response never represented a server commit.

   **Smallest fix:** accept absent/null explicitly; otherwise require a UUID string. Do not coerce malformed values into absence. Extend the existing malformed-response E2E case to prove that such an acknowledgement leaves the item recoverable.

3. **Low — Failed D1 runs lose the diagnostics needed to explain the failure.**  
   [durable-outbox.spec.ts:432](/E:/projects/virtual-office/__tests__/api/playwright/messaging-phase5/durable-outbox.spec.ts:432) records timing only after the arrival assertion passes. All three superseded 9/10 failures therefore lack annotations. Their server-log create durations total roughly 6.8–7.6 seconds, which does not establish that server time alone caused the missed deadline. **Smallest fix:** capture partial arrivals and request timings in `finally`, preserving the assertions.

The conversation reset addresses the original switch case, guards both send paths, and does not itself clear composer text. Its conditional render-time update follows React’s documented pattern. Bodyless and other unconfirmed 2xx responses now correctly remain unknown. [React documentation](https://react.dev/reference/react/useState#storing-information-from-previous-renders)

Relaxed claim/delete durability can lose recent changes after an OS crash. Under the current T8 protocol, reused generations still encounter server key uniqueness and replay/tombstone handling; I found no resulting duplicate-row path. Deferred publication flushes on empty, blocked, offline, and error exits. Disposal suppresses publication; session and cross-tab lifecycle completion remain assigned to T10/T11. [IndexedDB durability specification](https://w3c.github.io/IndexedDB/)

Retained evidence confirms **three 34/34 runs**, **51/51 regression**, zero retries/flakes/skips, meaningful reverted-fix failures, matching final hashes, and cookie redaction. Final D1 arrivals span **7.212–9.426 seconds**, measured before reconnect; inter-create gaps total **49–443 ms**. Typecheck, touched-file lint, and diff checks pass.

Review remained read-only. No database queries, browser, or dev server were started.