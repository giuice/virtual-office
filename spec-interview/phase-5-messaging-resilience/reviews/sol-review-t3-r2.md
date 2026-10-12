**Verdict: revision required — 0 High, 2 Medium, 1 Low.**

R1 dispositions:

| Finding | Disposition |
|---|---|
| 1. Direct INSERT bypass | **Resolved.** LOCAL catalog confirms no anon/authenticated INSERT privilege or INSERT policy. No alternate client writer was found through RPCs, views, rules, or triggers. |
| 2. Minute rollover | **Partially resolved.** Current RPC charges are serialized correctly; the retained Phase 4 writer remains outside that serialization. |
| 3. Failed unkeyed inserts charged | **Resolved.** Unkeyed INSERT and quota charge now share one transaction. |
| 4. Broad `42501` → 403 | **Resolved.** Only the explicit membership marker maps to 403; infrastructure failures remain 500 and quota failures 429. |
| 5. Rollback order | **Resolved.** Phase 4-compatible application first, then SQL. Restored function bodies match T2. |

1. **Medium — Phase 4 can still reopen deleted quota windows.**  
   [Quota cleanup:538](/E:/projects/virtual-office/supabase/migrations/20261007114454_message_create_budgets_insert_quota.sql:538) deletes older buckets under a lock that [the retained limiter:41](/E:/projects/virtual-office/supabase/migrations/20260612190000_messaging_rate_limits.sql:41) never acquires. A Phase 4 limiter transaction starts in exhausted W0 and pauses before its UPSERT. A T3 W1 insertion deletes W0; the old transaction resumes, recreates W0 at count 1, and approves another legacy insertion. Its window still comes from transaction-start `now()`. [PostgreSQL reference](https://www.postgresql.org/docs/15/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)  
   **Smallest fix:** make `check_rate_limit` delegate `message:create` charges to the same quota helper. Add a mixed-writer rollover regression and restore the original limiter during rollback. The current rollover test exercises only the new writer.

2. **Medium — Unkeyed readback failures introduce duplicate-producing 500s.**  
   [createUnkeyed:529](/E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseMessageRepository.ts:529) performs a separate SELECT after the RPC has committed. A transient read failure makes [the route:562](/E:/projects/virtual-office/src/app/api/messages/create/route.ts:562) return 500 despite storing the message. A legacy retry has no composition key and inserts another copy; conversation activity is also skipped. Previously, unkeyed INSERT and returned-row selection were one database request.  
   **Smallest fix:** return the created message row from the transactional RPC and map it directly for unkeyed sends. Cover response construction failure within that transaction.

3. **Low — Rollover lock detection can identify an unrelated backend.**  
   [waitForLockWaiter:276](/E:/projects/virtual-office/__tests__/messaging-db/message-send-budgets.test.ts:276) searches every locked backend in the database. [The rollover assertion:715](/E:/projects/virtual-office/__tests__/messaging-db/message-send-budgets.test.ts:715) then treats the selected PID as the delayed insertion. Unrelated activity can certify the wrong transaction’s start window or cause a timeout.  
   **Smallest fix:** capture the delayed connection’s PID before dispatch and poll that PID, requiring the holder in `pg_blocking_pids(pid)`. [PostgreSQL reference](https://www.postgresql.org/docs/15/functions-info.html)

The quota helper’s SECURITY DEFINER boundary checks out locally: owner `postgres`, empty search path, qualified objects, no dynamic SQL, and EXECUTE denied to clients. HTTP input cannot supply quota limits. No new key/quota/fence/raw-trigger lock cycle was found in the inspected call paths.

Migration `20261007114454` is recorded on **LOCAL Supabase**, and its live function bodies match the revision. Typecheck, touched-file lint, and diff-check passed; lint reported 23 existing warnings. Mutating integration tests and rollback execution were not run. No files or database state were changed, and no online database was accessed.