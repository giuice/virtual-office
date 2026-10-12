**Verdict: revision required.**

1. **Medium — F4 introduces an account-switch gap before notification display.**  
   **Trigger:** realistic failure — browser suspension or delayed lock acquisition during an account switch.  
   **Location:** [use-message-notifications.ts:240](E:/projects/virtual-office/src/hooks/ui/use-message-notifications.ts:240).

   The fresh session check runs before `await claimMessageNotification()`, which awaits a browser Web Lock. If B’s cookies change to C’s during that wait without an auth event, B’s React profile can remain unchanged. The final checks then permit B’s full message text to appear while C is authenticated. This exceeds D6’s accepted removal race.

   **Smallest fix:** perform the fresh identity check after acquiring the notification claim, immediately before the synchronous display checks. Keep authorization before claiming so F4’s failed-read fix remains effective.

   **Test:** extend `mention-notifications.spec.ts` AC-049: hold the real notification lock, wait until B’s claim is pending, replace cookies with C’s, then release. Assert no notification; an unchanged-session control must notify once. The current test switches cookies while authorization is held, before the identity check, so it misses this regression.

2. **Medium — A backward clock correction can strand a closed holder’s outbox.**  
   **Trigger:** realistic failure — clock correction plus tab close or crash.  
   **Location:** [outbox-db.ts:483](E:/projects/virtual-office/src/lib/messaging/outbox/outbox-db.ts:483), [message-outbox.ts:1004](E:/projects/virtual-office/src/lib/messaging/outbox/message-outbox.ts:1004).

   Tab 1 claims a message at 10:00, then closes before resolving it. After the computer’s clock moves back to 09:00, tab 2 can acquire the free Web Lock, but `leaseExpiresAt > now` and `updatedAt >= acquiredAt` classify the abandoned claim as untouchable. Retries remain blocked for roughly an hour, including every later message in that conversation. Without a new connectivity recovery, the epoch mechanism does not release it.

   **Smallest fix:** detect future-dated claim timestamps and bound their protection using elapsed monotonic time. Apply the same bound to lease takeover and the atomic claim guard; fence before redispatching.

   **Test:** extend `cross-tab-outbox.spec.ts` AC-041: hold tab 1’s create, close it, move tab 2’s clock backward, and require bounded takeover, fencing, and ordered delivery exactly once. Existing close/lease tests use an advancing clock.

**Claims checked**

- **True by source inspection:** F1 records removal synchronously; F2 schedules deferred catch-up during the initial fetch; F6 refreshes rosters; F7 guards composing keys. Their new tests target the reported failures.
- **True by source inspection:** F4 authorizes before claiming; F8 compares retained event sequences and passes through before substituting 500; F9 uses the database’s fixed-window clock.
- **True by source inspection:** the seven migrations preserve application-user identity mapping, explicit grants/revocations, secured function search paths, mention RLS, and rate-limit serialization. Metrics remain bounded and redacted; drawer storage is scoped by user and tab.
- **False or overstated:** notification identity fencing through emission fails during the new claim wait. The closed-holder/45-second takeover guarantee assumes wall-clock timestamps remain ordered.

No files changed, services started, E2E tests run, or hosted services accessed. Local Supabase refused connection at `127.0.0.1:54322`; catalog state remains unverified in this review. `git diff HEAD --check` passed.