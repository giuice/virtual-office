**Verdict: revision required — 2 High and 4 Medium findings.**

SQL references below point to [20261007184118_conversation_membership_integrity.sql](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:1).

1. **High — A delayed legacy participant rewrite can undo committed revocation.** [SQL:678](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:678), [SQL:442](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:442).

   Concurrent legacy joins can leave B’s membership present while B is absent from `participants`. A rewrite adding B checks revocations, then waits for the space lock. Meanwhile, administrative DELETE removes B and commits its revocation; the grant’s conversation/user locks permit that DELETE to complete. After resuming, the postgres insert trigger **deletes the new revocation and recreates B’s membership**. This defeats the “only restore lifts revocation” claim and restores message/mention access.

   **Smallest fix:** only the restore RPC should clear revocations. Lock existing membership rows and re-check revocation after authorization waits, at the insertion boundary. Add this held legacy-rewrite-versus-DELETE regression.

2. **High — Migration initialization can miss a concurrent removal.** [SQL:245](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:245), [SQL:452](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:452).

   The backfill runs before any write-blocking lock or delete trigger is installed on `conversation_members`. A DELETE committing after the backfill snapshot but before the membership trigger DDL leaves no tombstone. Subsequently, `/join` sees a missing row, an existing participant, and no revocation, so it restores the removed membership.

   **Smallest fix:** acquire a write-blocking membership-table lock before the backfill, using a consistent migration lock order, and hold it through trigger installation. Verify migration initialization against a held concurrent DELETE.

3. **Medium — SQL room authorization differs from JavaScript numeric truthiness.** [SQL:326](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:326).

   A read-only probe reproduced this mismatch: stored `{"isPublic":1e-400}` decodes to `{isPublic:0}` in JavaScript. `assertRoomAccess` denies a company-less user with empty allowed lists; SQL treats the nonzero numeric as public and returns **allowed**. The new join route uses SQL directly, so it can grant access that the former TypeScript check refused. This exceeds the documented malformed-list exception.

   **Smallest fix:** align numeric normalization or consistently reject malformed numeric ACL values before authorization. Add a database-round-trip comparison against the actual TypeScript guard.

4. **Medium — Restore bypasses room authorization after space deletion.** [SQL:806](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:806).

   Deleting a space sets `conversations.room_id` to NULL while preserving the conversation and its history. For such a `type='room'` conversation, restore falls into the direct/group branch. An original participant can therefore be restored and have its revocation cleared without any room authorization.

   **Smallest fix:** branch on conversation type first. A room conversation with no room must raise `ROOM_NOT_FOUND` and preserve its revocation; restrict the original-participant fallback to direct/group conversations.

5. **Medium — Join and space deletion have opposite lock ordering.** [SQL:717](E:/projects/virtual-office/supabase/migrations/20261007184118_conversation_membership_integrity.sql:717), [spaces/route.ts:202](E:/projects/virtual-office/src/app/api/spaces/route.ts:202).

   Join holds the conversation lock before acquiring the space lock. Space DELETE holds the space lock, then its installed `ON DELETE SET NULL` FK needs to update that conversation. Each transaction can wait for the other. One is aborted with `40P01`, which these routes return as 500. The header’s “no lock cycle” claim overlooks implicit FK writes. [PostgreSQL locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html)

   **Smallest fix:** make the transactional space-delete path lock affected conversations before deleting the space, and audit other parent deletions for implicit FK locks. Add a held join/delete integration test.

6. **Medium — Old-build conversation creation is not actually emulated.** [conversation-membership-integrity.test.ts:844](E:/projects/virtual-office/__tests__/messaging-db/conversation-membership-integrity.test.ts:844).

   Creation coverage calls the current resolver/repository, which avoids `INSERT … RETURNING`. Build `e27dd10` uses `.insert(...).select('*').single()`. Its SELECT authorization is evaluated before the AFTER trigger supplies membership; with separate application/auth IDs, that request shape encounters the missing-membership RETURNING problem. The existing-row upsert checks do not establish creation compatibility. This appears inherited from before T28, but D8 only accepts the missing-member **read** error.

   **Smallest fix:** test the exact old PostgREST creation shape, including `return=representation`, against both baseline and migrated local DBs. Resolve failures or record a specific compatibility exception before claiming T28’s postcondition.

Local read-only checks confirmed the installed migration, all 12 T28 function bodies, effective client DELETE/TRUNCATE denial, service-only join/restore execution, and preserved T1/T4 RPC bodies and ACLs. Both rollback bodies match their predecessors after line-ending normalization. The actual SQL/TypeScript guards agreed on 204 representative cases; the additional numeric probes exposed finding 3.

The concurrency findings are static interleavings grounded in the installed locks and FKs. Reported suites and rollback rehearsals were not rerun. No files or database state were changed, and no online database was accessed.