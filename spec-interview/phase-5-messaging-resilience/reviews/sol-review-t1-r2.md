**Verdict: approve.**

1. **Finding 1 — accepted residual risk under D8.** Not reopened; no different compatibility break found.

2. **Finding 2 — resolved.** [Role discovery](/E:/projects/virtual-office/__tests__/messaging-db/read-state-membership-acl.test.ts:95) has no allowlist. [Assertions](/E:/projects/virtual-office/__tests__/messaging-db/read-state-membership-acl.test.ts:173) reject empty discovery, success, and `UNREACHABLE`; each role must return `42501` with unchanged state. Autocommit exposes unexpected writes to those assertions, and fixture cleanup cascades remove membership and receipt rows.

   Read-only local checks confirmed all three executors: `postgres`, `service_role`, and `supabase_admin`, including direct superuser login. That login inherits the password from the guarded local DB URL—currently the [documented Supabase demo default](https://supabase.com/docs/guides/local-development/cli/getting-started). No shared-environment secret was added.

3. **Finding 3 — resolved.** [Migration lines 50–52](/E:/projects/virtual-office/supabase/migrations/20261007031057_read_state_membership_guard_and_unread_counts_acl.sql:50) specify application rollback first, then migration rollback, with the application step a no-op before deployment.

**New findings: none.**

Targeted lint passed. The local catalog confirms the migration is applied and its function body matches the file. Integration tests and rollback/reapply were not rerun because they write data. No files or database data changed; no online database access occurred.