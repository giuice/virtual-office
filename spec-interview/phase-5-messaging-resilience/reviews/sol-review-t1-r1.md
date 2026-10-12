**Verdict: revision required.**

1. **Medium — Hosted compatibility is unproven.** [Migration:26](E:/projects/virtual-office/supabase/migrations/20261007031057_read_state_membership_guard_and_unread_counts_acl.sql:26) claims the hosted build already checks `conversation_members`. However, historical build `e27dd10` checks `participants` in `src/lib/auth/authorize.ts:54,97`, then calls this RPC through the service-role repository (`read/route.ts:33`). For a participant missing a membership row, its former successful read becomes HTTP 500. This state is possible: the existing DELETE policy permits removing one’s membership; the sync trigger only runs on conversation insertion/participant updates; [join/route.ts:40](E:/projects/virtual-office/src/app/api/conversations/join/route.ts:40) returns early for an existing participant. Normal joins and the historical backfill create rows, but do not eliminate that mismatch.
   
   **Smallest fix:** record the owner-confirmed hosted Git ref and verify its read/unread behavior locally, including missing-membership cases. Current `main` alone cannot establish hosted compatibility. I found no evidence identifying `e27dd10` as the deployed build.

2. **Medium — AC-030 does not exercise every executable role.** [Test:74](E:/projects/virtual-office/__tests__/messaging-db/read-state-membership-acl.test.ts:74) restricts discovery to four roles. The tests exercise `service_role` and `postgres`, but the local catalog reports three effective executors: `postgres`, `service_role`, and **`supabase_admin`**. The latter is omitted.
   
   **Smallest fix:** discover all effective EXECUTE roles without the allowlist and exercise each against the non-member fixture, asserting refusal and unchanged state.

3. **Low — Rollback instructions contradict BR-014.** [Migration:50](E:/projects/virtual-office/supabase/migrations/20261007031057_read_state_membership_guard_and_unread_counts_acl.sql:50) says no application rollback is needed first; [SPEC:145](E:/projects/virtual-office/spec-interview/phase-5-messaging-resilience/SPEC.md:145) requires application first, then migrations.
   
   **Smallest fix:** preserve that order, noting that the application step is a no-op before deployment.

**Claims verified true**

- The previous RPC UPSERT could enroll a non-member. The new body checks the exact conversation/application-user pair through UPDATE and raises before inserting receipts when absent.
- Current code and pre-Phase-4 candidate `b64a47a` authorize through `conversation_members` before the service-role call.
- The unread-count body matches the Phase 4 definition. Current and inspected historical callers authenticate before invoking it; no unauthenticated application caller was found.
- Read-only local checks reproduced anon’s `42501` denial and successful authenticated execution for a zero-unread member.
- The rollback body matches the prior migration body, ignoring whitespace, and restores its documented search path, comment, and ACL state. The migration is transactional and structurally re-runnable.
- The new tests use real local infrastructure without mocks. Their assertions distinguish the old UPSERT and anon ACL behavior, subject to the role-coverage gap above.
- Empty `search_path` is safe here: application tables and `now()` are qualified; remaining built-in operators resolve through implicit `pg_catalog`. [PostgreSQL documentation](https://www.postgresql.org/docs/15/ddl-schemas.html#DDL-SCHEMAS-CATALOG)

The local catalog records migration `20261007031057` as applied. Integration suites, rollback/reapply, and hosted-build smokes were not run during this read-only review. No files were modified or online database accessed.