---
name: create-migration
description: >-
  Scaffold a new Supabase SQL migration in supabase/migrations/ with the correct
  UTC-timestamp filename and an RLS-aware template that bakes in the project's
  users.id-vs-supabase_uid rule. Use when creating a database migration, schema
  change, new table, column, index, or RLS / storage-bucket policy.
disable-model-invocation: true
---

# create-migration

Generate a new migration file for this repo. Migrations live in
`supabase/migrations/` and are named `YYYYMMDDHHMMSS_<snake_case_name>.sql`
(UTC, 14-digit timestamp — ordering is significant).

## Steps

1. **Resolve the name.** Use `$ARGUMENTS` as the migration name if provided
   (slugify to `snake_case`). Otherwise ask the user for a short purpose, e.g.
   `add_space_reservations` or `messages_read_receipts_rls`.

2. **Compute the filename** with a real UTC timestamp — do not hand-type it:
   ```bash
   echo "supabase/migrations/$(date -u +%Y%m%d%H%M%S)_<snake_case_name>.sql"
   ```

3. **Verify the schema first.** Check `migrations/database-structure.md` (or
   `mcp__supabase__list_tables`) for exact table/column names before writing SQL.
   Never invent column names. Remember:
   - `users.id` (UUID) → app-table foreign keys (`messages.sender_id`, `spaces.created_by`).
   - `users.supabase_uid` (TEXT) → matches `auth.uid()`. **`users.id = auth.uid()` is always wrong.**
   - `profiles` does not exist (use `users`); `messages.room_id` does not exist
     (messages link via `conversations.room_id`).

4. **Write the file** with the Write tool using this template, filling the body:

   ```sql
   -- Migration: <name>
   -- Purpose:   <one line — what & why>
   -- Author:    <git user>   Date (UTC): <YYYY-MM-DD>

   begin;

   -- 1. Schema change
   --    e.g. create table / alter table / add index here.

   -- 2. Row Level Security (REQUIRED for any new table)
   --    alter table public.<table> enable row level security;
   --
   --    Match the caller via supabase_uid, never users.id:
   --    create policy "<table>_select_own"
   --      on public.<table> for select
   --      using (
   --        user_id in (
   --          select id from public.users
   --          where supabase_uid = (select auth.uid())::text
   --        )
   --      );
   --    -- repeat for insert (with check), update (using + with check), delete.
   --    -- Enforce company/tenant isolation where applicable.

   -- 3. Storage buckets (if any) — create PRIVATE unless explicitly public,
   --    and add object policies scoped to the owning user/company.

   commit;
   ```

   Notes baked in on purpose:
   - Wrap `auth.uid()` in a subquery — `(select auth.uid())` — so Postgres caches
     it per-statement instead of per-row (Supabase RLS performance best practice).
   - Use the enum values from CLAUDE.md (`user_status`, `space_status`, etc.).

5. **Remind the user** to:
   - Update `migrations/database-structure.md` to reflect the change.
   - Apply locally / to the branch via the Supabase CLI or MCP, and add a test.
   - Consider invoking the `supabase-rls-reviewer` subagent on the new migration.

Do not apply the migration automatically. Scaffold + report, then end with
`Status: Pending user confirmation`.
