**Verdict: revision required.** Two Medium findings remain.

1. **Medium — Direct keyed inserts bypass fencing.**

   The commit-time guard exists only inside [create_message_attempt](/E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:469). The migration explicitly preserves message policies, while [send_message_as_self](/E:/projects/virtual-office/supabase/migrations/20261005004335_message_attachment_uploads.sql:120) permits a member to insert their own nonempty keyed message.

   **Failure scenario:** A fences key K at generation 2, receives `not_stored`, and cancels the item. A tampered authenticated client then inserts K directly through PostgREST. That transaction commits and produces a recipient-visible Realtime event despite the fence. The local catalog confirms authenticated INSERT privileges and no message trigger enforcing attempt state. Direct inserts can also recreate a previously delivered, deleted key.

   This affects the caller’s own messages; it does not permit sender impersonation. Deploying server and client together limits honest mixed-version use, but does not close this authenticated path. An older Phase 4 server’s direct service-role insert also bypasses the guard if it overlaps with the new server.

   **Smallest fix:** deny raw authenticated keyed inserts and key reassignment, routing keyed creates through the fenced contract. Guard remaining raw service-role keyed writes at the database boundary if older server requests can remain in flight. Preserve legacy unkeyed writes. Add a real RLS regression test.

2. **Medium — Legacy keyed messages never acquire a delivery tombstone when fenced.**

   [fence_message_attempt](/E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:248) creates an empty attempt row and advances its generation. When it discovers an existing message, [it returns `stored`](/E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:280) without recording `committed_at` or `message_id`. The early replay path likewise records nothing.

   **Failure scenario:** K was created before T2. A generation-carrying replay or fence finds it and reports delivery. The sender deletes that message. A later fence now returns `not_stored`, because both the live message and `committed_at` are absent. A current-generation create passes the [deleted-message check](/E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:488) and recreates K.

   **Smallest fix:** backfill delivery records for existing keyed messages, leaving `fence_generation` and unavailable original compositions null. When fencing discovers an untracked stored message, persist its delivery record under the key lock. Add legacy-create → fence → delete → fence/retry coverage.

**Claims verified true, within these limits**

- The RPC lock sequence supports mutual exclusion: the post-INSERT check holds the key lock through commit, and fence reads use fresh snapshots. Concurrent attempt-row insertion is serialized by the primary key. The local functions are `VOLATILE`, consistent with [PostgreSQL’s snapshot rules](https://www.postgresql.org/docs/15/xfunc-volatility.html). This does not cover the bypass in finding 1.
- Through the new server, generation-less creates retain create/replay/409 behavior, record no fence generation, and lose new insertions to existing fence state. The attachment wrapper delegates to the same guarded function.
- Expected-sender mismatch is checked before conversation/key operations. Authentication uses `auth.getUser()` and resolves `users.id` through `supabase_uid`. Fence lookup is caller-scoped; another sender’s matching UUID neither leaks nor affects their message.
- The status changes do not introduce a 404-specific client regression: both inspected client versions handle unsuccessful creates generically. Other callers retain the authorization helper’s default 404 behavior.
- For messages created through T2, delivery survives deletion and prevents generation-carrying recreation. Phase 4 generation-less recreation without fence state remains the explicit compatibility behavior.
- A database 400 leaves the same generation admissible. That is not a fenced-generation bypass: the contract excludes lower generations after fencing. Cancellation of an outstanding uncertain request still requires a higher fence.
- Composition comparison covers T2’s normalized content, effective type, reply target, and order-insensitive attachment IDs. Mentions remain T4 work.
- Local catalog checks confirm attempt-table RLS with no policies, denied client privileges, and all four functions using invoker security, empty search paths, and denied anon/authenticated EXECUTE. Their bodies match the migration; there is no dynamic SQL.
- AC-045 tests use real database locks and real route handlers. Only the Next.js cookie transport is replaced; Auth, repositories, and database behavior remain real.
- The rollback sequence is dependency-correct **when the referenced Phase 4 function body is executed before the drops**. The header is a manual recipe, not self-contained rollback SQL.
- The fail-open fence limiter is deferred to T3. Fence calls themselves contain no message insertion.

Verification: the tracked diff matches the supplied snapshot; typecheck passes; scoped lint has zero errors and nine existing warnings; diff check passes. Migration `20261007095045` is applied locally. Integration tests and rollback were not executed because they mutate the database. No files were modified and no online database was accessed.