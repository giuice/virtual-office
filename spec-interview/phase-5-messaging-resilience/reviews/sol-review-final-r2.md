**Verdict: revision required.**

1. **Medium — A failed final session read consumes the browser-wide notification claim.**

   **Location:** [use-message-notifications.ts:237](E:/projects/virtual-office/src/hooks/ui/use-message-notifications.ts:237).

   **Trigger/scenario:** B’s token expires during suspension or a long claim wait, then the winning tab’s refresh fails in transit. `claimMessageNotification()` has already persisted the claim when `identity.check()` returns `unverified`. Another tab cannot claim the message even if its session verification would succeed. Nothing displays, and catch-up does not retry notifications. Authorization-read failures remain protected, but the final identity read introduces the same lost-opportunity pattern.

   **Smallest fix:** check identity while holding the notification lock, before committing the claim. Leave `unverified` unclaimed; perform the final synchronous guards, claim commitment, and display without another await. Keep authorization before lock acquisition.

2. **Medium — The account-switch test can pass with the fix reverted.**

   **Location:** [mention-notifications.spec.ts:433](E:/projects/virtual-office/__tests__/api/playwright/messaging-phase5/mention-notifications.spec.ts:433).

   **Trigger/scenario:** delayed Realtime delivery of the message’s conversation UPDATE triggers a list refetch while C’s cookies are installed. That request returns C’s conversations into B’s existing query key; C’s list excludes the A–B DM. The independent `stillListed` guard then suppresses the notification even with identity checking reverted to before the claim. Restoring B’s cookies lets the later held-read step refetch B’s list, so the final read sequence need not expose this false pass. The unchanged-session control does not exclude this masking path.

   **Smallest fix:** hold list/roster refetches throughout the cookie-switch interval using the existing gate. Assert the DM remains listed through the negative observation, restore B’s cookies, then release refetches.

The fix closes the original lock-wait account-switch gap. Lock ordering, hidden-tab setup, and the synchronous removal/sign-out/toggle/view guards otherwise look sound. I do not dispute #2’s recorded Low clock follow-up.

Source-only review; no tests or services started, files changed, or hosted services accessed. `git diff HEAD --check` passed.