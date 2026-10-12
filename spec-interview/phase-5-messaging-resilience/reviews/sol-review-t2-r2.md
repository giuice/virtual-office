**Verdict: approve.** No High or Medium findings remain. Two Low findings remain.

Both r1 Medium findings are fixed:

- **Direct keyed inserts bypass fencing:** [the revised policy](/E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:831) denies authenticated keyed inserts; the update trigger prevents key reassignment; the raw-insert trigger fences older service-role writes.
- **Legacy keyed messages lack delivery records:** [backfill](/E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:812), fence, and replay now record delivery. Subsequent deletion preserves the tombstone.
- **Rollback note:** resolved. The inlined function body matches Phase 4, and the policy expression matches exactly. ACL restoration, dependency order, object removal, and app-first ordering are correct by inspection.

Two new Low findings:

1. **Low — Lock comments overstate guarantees.**  
   [Migration:808](/E:/projects/virtual-office/supabase/migrations/20261007095045_message_send_attempt_fencing.sql:808) describes the first backfill as holding only read locks. On first application, FK creation has already acquired `SHARE ROW EXCLUSIVE` locks, so message writes remain blocked throughout that scan. Also, repairing an untracked delivery can acquire a message-row lock through its FK check; the unconditional “fence never waits on message rows” claim at line 93 is too broad. A populated migration or locked untracked message can therefore wait longer than these comments suggest. [PostgreSQL documents the referenced-table lock requirement.](https://www.postgresql.org/docs/15/sql-createtable.html)

   **Smallest fix:** make these comments consistent with the header’s existing lock warning and limit the non-waiting claim to ordinary tracked-message fencing.

2. **Low — Tests do not directly exercise migration backfill.**  
   [Test fixture:871](/E:/projects/virtual-office/__tests__/messaging-db/message-attempt-fencing.test.ts:871) removes an attempt record, then tests repair through fence/replay. Removing both backfill statements would leave these tests passing, while a preexisting keyed message deleted before its first post-migration RPC would lose its delivery history.

   **Smallest fix:** add a real local regression that seeds an untracked keyed message, executes the migration twice, deletes the message before fence/replay, and asserts `stored`/null plus `410 MESSAGE_DELETED`.

The requested attacks produced these conclusions:

- **Marker:** the GUC itself is settable through arbitrary SQL; it is not a privilege boundary. No exposed authenticated setter, header-driven hook, or privileged keyed-insert RPC was found. RLS denies authenticated raw keyed inserts independently of the marker. Headers and `Prefer` do not supply arbitrary settings. [PostgREST’s request settings and hooks](https://docs.postgrest.org/en/stable/references/transactions.html) support that distinction.
- **Marker lifetime:** successful inserts and conflict paths clear it immediately. Exceptions propagate and roll back its transaction/subtransaction changes. The attachment wrapper delegates without catching them. The generated UUID identifies exactly one row under the message primary key.
- **Concurrency:** raw inserts and RPC creates use compatible message-before-attempt lock ordering. Key locks persist through commit, and fence statements obtain fresh snapshots after waiting. The marked RPC insert skips raw-trigger bookkeeping, preventing double recording. This is a static concurrency assessment, supported by the local functions’ `VOLATILE` classification and [PostgreSQL snapshot semantics](https://www.postgresql.org/docs/15/xfunc-volatility.html).
- **Compatibility:** current, Phase 4, and pre-Phase-4 update paths change content/status/is_edited. Sender `SET NULL`, reply-target `SET NULL`, and conversation deletion cascades remain permitted. Message columns and Realtime publication are unchanged.
- **Backfill:** the existing unique index excludes duplicate non-null sender keys. Null-sender rows are intentionally omitted and cannot be retried by a surviving sender. Reapplication preserves fence generations and matching compositions.
- **Tests:** they use real sessions, routes, RLS, and database locks; only Next.js cookie transport is substituted. By inspection, the new insert/update denials, raw-insert fencing, and legacy fence/replay assertions would fail against r1.

Verification: migration `20261007095045` is recorded locally; all six active function bodies match the revised file, and the policy/triggers match. The tracked diff matches `t2-tracked-r2.diff`. Typecheck passes; scoped lint reports zero errors and nine existing warnings; diff check passes.

Mutating integration tests and rollback were not executed. The local dataset contains no keyed messages, so populated backfill remains unverified. No files changed and no online database was accessed.