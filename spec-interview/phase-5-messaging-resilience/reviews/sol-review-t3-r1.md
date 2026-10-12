**Verdict: revision required — 1 High, 3 Medium, 1 Low.**

1. **High — Direct unkeyed inserts bypass every budget.**  
   [T2’s INSERT policy:835](E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:835) still permits authenticated members to insert their own unkeyed messages directly. The local catalog confirms INSERT permission and no quota trigger for these rows; [the current test:781](E:/projects/virtual-office/__tests__/messaging-db/message-attempt-fencing.test.ts:781) explicitly requires success. A member can therefore bulk-insert messages after exhausting both route budgets.  
   **Smallest fix:** remove authenticated direct INSERT access in T3, preserving the service-role legacy routes, and replace that success assertion with budget-bypass rejection coverage.

2. **Medium — Minute rollover can reopen an exhausted insertion quota.**  
   [T3’s final charge:588](E:/projects/virtual-office/supabase/migrations/20261007114454_message_create_budgets_insert_quota.sql:588) reuses a limiter whose [window calculation:42](E:/projects/virtual-office/supabase/migrations/20260612190000_messaging_rate_limits.sql:42) uses transaction-start `now()` and whose cleanup deletes older buckets. Scenario: W0 already contains 30 charges; another insert starts in W0 and blocks before charging. A W1 insertion commits and deletes W0’s counter. The delayed insertion resumes, recreates W0 with count 1, and commits an additional message. Different window rows do not share the claimed serialization. PostgreSQL documents the transaction-start behavior of [`now()`](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).  
   **Smallest fix:** choose the charge window under serialization across windows and make cleanup safe for in-flight transactions. Add a real blocked-insert rollover regression; the current boundary test deliberately avoids rollover.

3. **Medium — Failed unkeyed route inserts still consume insertion quota.**  
   [create/route.ts:513](E:/projects/virtual-office/src/app/api/messages/create/route.ts:513) commits the quota charge separately from the INSERT at line 517. If a reply target disappears after validation, the INSERT fails its foreign key, stores nothing, and leaves the insertion charge committed. This violates T3’s winning-insertion-only accounting.  
   **Smallest fix:** route unkeyed text creation through the existing transactional create RPC with a null key/generation and the insertion quota. Keep the request-budget charge separate.

4. **Medium — Infrastructure permission failures become definitive membership failures.**  
   [message-attempt-rpc.ts:109](E:/projects/virtual-office/src/repositories/implementations/supabase/message-attempt-rpc.ts:109) converts every `42501` into `NOT_PARTICIPANT`. Revoking EXECUTE on `create_message_attempt`, or a required helper/table grant, therefore produces 403 despite valid membership and stops automatic recovery. The create/fence handlers have equivalent broad mappings. `42501` means general insufficient privileges, as the [PostgREST error contract](https://docs.postgrest.org/en/stable/references/errors.html) confirms. Limiter-origin permission failures inside the new exception block are correctly wrapped; permission failures outside it remain vulnerable.  
   **Smallest fix:** recognize only the explicit membership refusal as 403; preserve infrastructure failures as recoverable server errors and budget failures as 429. Add grant-failure integration coverage with restoration in `finally`.

5. **Low — The documented rollback order creates a temporary outage.**  
   [T3 migration:66](E:/projects/virtual-office/supabase/migrations/20261007114454_message_create_budgets_insert_quota.sql:66) instructs deploying T2 first, although its nine-argument RPC is absent until the SQL rollback runs. T2 keyed and attachment creates fail during that interval.  
   **Smallest fix:** roll back first to the compatible Phase 4 build, or restore the nine-argument signature alongside the eleven-argument signature before switching applications.

Claims verified from source and the local catalog:

- Current keyed text and attachment paths pass the quota exactly once; replay and same-key-loser branches return before charging. Quota refusal rolls back the insertion transaction.
- Create-request and fence budgets run before body parsing. Request charges survive insertion rollback. Authentication uses `getUser()` and resolves `users.id` through `supabase_uid`.
- Fail-closed boolean/error handling is present; the other listed actions retain fail-open behavior. Counter keys isolate users and actions.
- Ten items with one create, lookup, and replay each require **10 insertion charges, 20 create requests, and 30 fence charges**, within 30/60/90. This establishes capacity, not the ten-second runtime guarantee.
- Phase 4 servers charge at their route; the compatibility wrapper adds no second charge. Active callers use eleven arguments. Rollback function bodies match T2.
- Tests use real local infrastructure, with only the Next.js cookie transport replaced. Limiter mutations have `finally` restoration, and the runner serializes files.
- Malformed anonymous requests change from 400 to 401; neither inspected legacy client depends on that ordering. The strict **120 new attempt rows/minute** claim remains conditional on safe rollover and charged legacy paths.

The T3 migration is applied on **LOCAL Supabase at `127.0.0.1:54322`**, and its live function bodies match the file. Typecheck passed; lint reported zero errors and nine existing warnings; tracked diff-check passed. Mutating integration tests and rollback execution were not run. No files were modified and no online database was accessed.