**Verdict: approve.** No new High or Medium findings remain in T4.

Disposition of r1 findings:

1. **Medium 1 — fixed.** The [mention loader](/E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseMessageRepository.ts:232) deduplicates lowercase IDs and batches them by 500. Each RPC returns one scalar JSONB object, avoiding row truncation. Feed, starred, pinned enrichment, and `findById` share it; RPC errors propagate. [PostgREST scalar RPC contract](https://docs.postgrest.org/en/stable/references/api/functions.html#scalar-functions).
2. **Medium 2 — fixed.** The [roster RPC](/E:/projects/virtual-office/supabase/migrations/20261007153119_message_mentions_and_conversation_roster.sql:874) aggregates every member into one JSONB array, ordered by display name and user ID.
3. **Low 3 — fixed.** The [header](/E:/projects/virtual-office/supabase/migrations/20261007153119_message_mentions_and_conversation_roster.sql:7) distinguishes the application write path from trusted service-role INSERT privileges.

No arbitrary non-member message-ID path to service-role mention reads was found. Create/fence reads follow validated authentication, membership checks, and sender/conversation-scoped keys. Feed, starred, attachments, and reaction reads use user-scoped clients.

Local input probes confirmed: empty arrays return `{}`; null arrays raise `22004`; null elements are ignored; uppercase and duplicate UUIDs are accepted; 1,001 entries raise `MESSAGE_IDS_INVALID / 22023`. Malformed mention compositions raise `MENTION_IDS_INVALID`. Roster permissions and membership refusals match the claims.

All six deleted unit-test behaviors have replacement coverage on the [real route and local database](/E:/projects/virtual-office/__tests__/messaging-db/message-attempt-fencing.test.ts:949), including authorization, forced status, size limits, both invalid reply cases, and valid reply/activity updates.

One existing limit remains: the unused [pinned-message reader](/E:/projects/virtual-office/src/repositories/implementations/supabase/SupabaseMessageRepository.ts:891) still enumerates at most 1,000 messages. It is unchanged from HEAD and has no runtime callers, so it does not block T4. Paginate before wiring it into a workflow.

Independent checks passed: type-check, lint with zero errors and 12 existing warnings, and diff checks. Local migration/function bodies, ACLs, RLS, and publication state match the source. Extracted rollback definitions and ACLs match T3 verbatim.

Integration/E2E suites and rollback execution were not rerun under the read-only constraint. No files or persistent database state changed; no online database was accessed.