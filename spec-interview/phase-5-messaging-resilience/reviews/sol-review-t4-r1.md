**Verdict: revision required.** Two Medium findings remain.

1. **Medium — Bulk mention reads silently truncate.**  
   [SupabaseMessageRepository.ts:234](E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseMessageRepository.ts:234) fetches all mention rows in one request. The configured limit is [1,000 rows](E:/projects/virtual-office/supabase/config.toml:18), a [hard PostgREST limit](https://docs.postgrest.org/en/stable/references/configuration.html#db-max-rows). A supported 100-message feed page containing 11 mentions per message requires 1,100 rows. The truncated response succeeds, leaving some `mentionedUserIds` incomplete or empty. Starred and pinned reads share this loader.  
   **Smallest fix:** paginate deterministically or batch message IDs within the row limit. Add real integration coverage exceeding 1,000 mention rows.

2. **Medium — The roster silently excludes members beyond row 1,000.**  
   [SupabaseConversationRepository.ts:638](E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseConversationRepository.ts:638) calls the table-returning RPC once, without pagination. With 1,001 current members, the endpoint returns only 1,000 while claiming a complete roster. No corresponding membership-size bound exists.  
   **Smallest fix:** paginate the RPC with stable ordering and combine every page before returning. Cover a roster exceeding the configured limit.

3. **Low — The migration overstates RPC-exclusive writes.**  
   [Migration:7](E:/projects/virtual-office/supabase/migrations/20261007153119_message_mentions_and_conversation_roster.sql:7) says mentions are written “ONLY” by `create_message_attempt`, but `service_role` has direct INSERT and bypasses RLS. No trigger prevents that trusted role from appending mentions to an existing message; membership and self-exclusion are enforced inside the RPC.  
   **Smallest fix:** qualify this as the current application write path and document the trusted service-role boundary.

Independent checks passed: type-check, lint with zero errors and 12 existing warnings, and diff checks. Local migration `20261007153119` is present; installed function bodies and ACLs match the source. Rollback bodies and ACLs match T3 verbatim. Integration/E2E suites and rollback execution were not rerun under the read-only constraint; the truncation scenarios are established from code and configuration.

The known membership-policy gap does not change this T4 verdict; its privacy guarantees remain conditional on that separate fix. No files or database state were changed, and no online database was accessed.