**Verdict: approve.** No High or Medium findings remain. Three Low findings follow.

| r2 finding | Disposition |
|---|---|
| Medium 1 — exhausted bucket reopened | Fixed. Generic actions acquire the transaction lock before reading `clock_timestamp()`, charging and cleaning up. |
| Low 2 — earliest-time overclaim | Fixed. The comment identifies a chosen clock policy and acknowledges dropped backward-dated events. |
| Low 3 — diagnostics versus metrics | Fixed. Comments distinguish metric lines from limiter and API diagnostics. |

1. **Low — The log-volume comment still overclaims emission timing.** [rate-limit.ts:64](E:/projects/virtual-office/src/lib/auth/rate-limit.ts:64)  
   Thirty batches charged just before rollover can finish streaming afterward, alongside thirty newly charged batches: **3,000 lines emitted in one fixed bucket**. Completions from three admission buckets can also bunch within a rolling minute. The limiter correctly bounds admissions; it does not bound when their logs appear. **Smallest fix:** describe the limits by admission time and avoid promising an emission-time ceiling.

2. **Low — The new regressions do not exercise advisory-lock contention.** [message-send-budgets.test.ts:818](E:/projects/virtual-office/__tests__/messaging-db/message-send-budgets.test.ts:818)  
   The old transaction reaches the function after W1 commits. Removing the advisory lock while retaining `clock_timestamp()` would still pass all three cases. **Smallest fix:** hold the exact advisory key on another connection, dispatch the check during W0, confirm its backend is blocked, cross rollover, release, and assert charging occurs in W1.

3. **Low — Invalid-input examples need an action qualifier.** [migration:35](E:/projects/virtual-office/supabase/migrations/20261008012709_rate_limit_window_serialization.sql:35)  
   The described `23502`, `22012`, and NULL-result behavior applies to generic actions. For `message:create`, read-only local probes confirmed that NULL user, NULL limit and zero window all raise **`22023 INSERT_QUOTA_INVALID`**, unchanged from T3. **Smallest fix:** qualify those examples as applying to non-`message:create` actions.

The advisory-lock inventory is complete for repository source and the local catalog:

- Generic limiter: `hashtextextended('virtual_office.rate_limit:' || user || ':' || action, 0)`.
- T3 quota helper: `hashtextextended('virtual_office.message_insertion_quota:' || user, 0)`.
- Presence test barriers: random numeric bigint keys in [screen-share-lease:1012](E:/projects/virtual-office/__tests__/presence-db/screen-share-lease.test.ts:1012), [presence-concurrency-contract:755](E:/projects/virtual-office/__tests__/presence-db/presence-concurrency-contract.test.ts:755), and [normative-races:556](E:/projects/virtual-office/__tests__/presence-db/concurrency/normative-races.test.ts:556).

These share the bigint key space; prefixes do not guarantee collision-free lock IDs. A collision adds waiting without merging counters. Current callers introduce no new lock-order cycle: generic checks run in separate RPC transactions, while `create_message_attempt` calls the T3 helper directly. Transaction locks remain held until transaction end. [PostgreSQL advisory-lock documentation](https://www.postgresql.org/docs/15/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS)

Cleanup remains scoped to `(user, action)`, including actions using different window lengths. The accepted backward-clock and mixed-window-size limitations remain. The Phase 4 RPC contract is preserved; historical hosted ref `e27dd10` has no limiter caller.

Local readback confirmed migration `20261008012709`, the exact applied body, boolean signature, owner, SECURITY DEFINER, empty search path and restricted ACL. The `message:create` branch is byte-for-byte unchanged. Rollback restores the exact T3 definition and ACL statements; **undo this migration before T3**.

Typecheck, touched-file ESLint and whitespace checks passed. DB/E2E suites and rollback rehearsals were not rerun under the read-only constraint; their reported results remain performer evidence. No files were changed or online database accessed.