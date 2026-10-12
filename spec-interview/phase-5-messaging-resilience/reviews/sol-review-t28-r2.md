**Verdict: revision required — 0 High, 1 Medium, 1 Low.**

Disposition of r1 findings:

| Finding | Disposition |
|---|---|
| 1. Delayed legacy rewrite restores a revoked member | Resolved. The insertion trigger locks an existing membership and checks revocations after authorization waits; it no longer clears them. |
| 2. Initialization misses concurrent DELETE | Resolved for membership integrity. Locks cover backfill through trigger installation. A separate migration-time deadlock remains below. |
| 3. SQL/JavaScript numeric truthiness | Resolved. Independently checked 996 cases against the actual TypeScript guard; no differences beyond `ROOM_ACL_INVALID` denials. |
| 4. Restore after space deletion | Resolved. Room type is checked first; missing room raises `ROOM_NOT_FOUND` without clearing revocation. |
| 5. Join versus space DELETE | Resolved for current join/restore paths. The documented legacy reverse-order risk remains during rollout. |
| 6. Exact old-build creation shape | Evidence gap resolved. The test reproduces e27dd10’s request shape. Its distinct-ID failure is supported by the unchanged baseline SELECT policies; it is an inherited limitation, requiring the documentation correction below. |

1. **Medium — Opening migration locks can deadlock active application transactions.** [Migration:263](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:263).

   The asserted global `users → conversations → conversation_members` order is incorrect. Installed [mark_conversation_read:100](E:/projects/virtual-office/supabase/migrations/20261007031057_read_state_membership_guard_and_unread_counts_acl.sql:100) updates `conversation_members` first, then inserts receipts whose FK acquires a lock on `conversations`.

   An active read transaction can therefore hold `conversation_members`; the migration acquires `ACCESS EXCLUSIVE` on `conversations` and waits for membership access to drain; the read transaction then waits for `conversations`. PostgreSQL can abort the application transaction with `40P01`. Local `deadlock_timeout` is 1 second, so the migration’s 5-second `lock_timeout` does not guarantee that the migration becomes the victim. [PostgreSQL locking documentation](https://www.postgresql.org/docs/15/explicit-locking.html)

   The users lock also permits a three-party cycle: Presence holds a user row; join holds conversation-table access while waiting for that user; migration holds the users-table lock while waiting for join; Presence subsequently requests its users UPDATE lock.

   **Smallest fix:** acquire both opening lock statements with `NOWAIT`, and retry the entire migration transaction after contention. Do not merely swap the messaging tables: application paths use both orders. Add held read/apply and Presence/join/apply regressions. [PostgreSQL `LOCK`](https://www.postgresql.org/docs/15/sql-lock.html)

2. **Low — The compatibility header still claims successful hosted-build creation.** [Migration:118](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:118), [test:1041](E:/projects/virtual-office/__tests__/messaging-db/conversation-membership-integrity.test.ts:1041).

   The header says hosted builds keep creating conversations, while the exact e27dd10 test expects `403/42501`. Recording that inherited failure is useful evidence, but it does not establish successful creation compatibility.

   **Smallest fix:** qualify the header and record the build, distinct-ID condition, baseline/migrated result, and specific T21 exception in TRACK/state. D8 currently covers missing-member read errors only.

Local read-only checks confirmed all 13 T28 function bodies, preserved T1–T4 bodies and ACLs, both rollback bodies matching their predecessors, and the opening locks in migration history. The unlocked current-member return writes no membership and grants no new message/fence/roster authorization. No additional client-reachable revocation bypass was found.

Concurrency findings are static interleavings grounded in installed functions and FKs. Reported suites, baseline rollback, and migration concurrency scripts were not rerun. No files or database state changed; no online database was accessed.