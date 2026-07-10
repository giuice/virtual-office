# Phase 0 — Live database catalog readback (2026-07-10)

Read-only evidence captured via Supabase MCP `execute_sql` against the live project.
Handoff: `docs/presence-safety-remediation-handoff-2026-07-09.md`. Audited baseline: `b18ab26`.
No credentials in this file. No mutations were performed.

## Migration history (CRITICAL DRIFT)

Live `supabase_migrations.schema_migrations` contains only 4 entries:

| version | name |
|---|---|
| 20250829092004 | add_messages_to_realtime_publication |
| 20251120190125 | refactor_pinned_and_starred_messages_v2 |
| 20251210120345 | allow_public_invitation_validation_by_token |
| 20260210123736 | invitation_system_hardening |

**`20260610183139_enable_core_table_rls` is NOT in live history, yet its policies/grants ARE live** (see below). RLS enablement was applied outside migration tracking (SQL editor / MCP apply without history entry). The legacy root `migrations/` set (incl. `20260209_knock_requests_table.sql`) is likewise untracked but applied. Per handoff: migration-history plan must be reviewed against this before any `db push`; never fabricate history entries.

## Tables

Existing: `public.users`, `public.spaces`, `public.space_presence_log`, `public.knock_requests`, `public.messages`, `auth.sessions`.
Not yet existing (expected, created by later phases): `user_presence_sessions`, `revoked_presence_auth_sessions`, `location_transition_requests`, entire `private.presence_*` control/audit set, role `presence_maintenance_owner`.

Column notes vs audited baseline:

- `users`: id uuid PK (uuid_generate_v4), supabase_uid text UNIQUE (constraint still named `users_firebase_uid_key`), company_id uuid NULL, status user_status default 'offline', last_active timestamptz NOT NULL default now(), current_space_id uuid FK→spaces ON DELETE SET NULL. **No `location_version`, no `presence_access_revision`** (added Phase 1).
- `spaces`: capacity int NOT NULL default 0, **no CHECK constraint on capacity**; access_control jsonb NULL; status space_status; **no `presence_access_revision`**.
- `space_presence_log`: id uuid PK, space_id/user_id FK CASCADE, entered_at NOT NULL, exited_at NULL, session_type session_type_enum, authorized_by FK SET NULL, CHECK exited_at > entered_at.
- `knock_requests`: **id is TEXT PK (client-supplied)**, requester_name/requester_avatar_url stored (client-authored identity), status CHECK (pending/approved/denied/expired), decision CHECK (APPROVE/DENY), created_at/updated_at default now(). **No expiry column** (KNOCK-02 confirmed).
- `auth.sessions`: has `id`, `user_id`, `not_after`, `refreshed_at`, etc. Exact-session absence check by `id` is feasible server-side.

## RLS state

RLS enabled (not forced) on: users, spaces, space_presence_log, knock_requests, messages, auth.sessions.

### Policies (live, verbatim semantics)

- `knock_requests_insert` (PUBLIC role, PERMISSIVE): WITH CHECK only `requester_id = current app user`. **No status restriction → authenticated requester can INSERT pre-approved rows. SEC-01 CONFIRMED LIVE, matches `migrations/20260209_knock_requests_table.sql` → no stop condition.**
- `knock_requests_update` (PUBLIC): qual = `space_id IN (SELECT current_space_id ...)` — placement-only responder check (KNOCK-01 confirmed).
- `knock_requests_select` / `knock_requests_delete` (PUBLIC): requester OR current-space occupant.
- `users_select_same_company_or_self`, `users_update_own_safe_columns` (authenticated): self-scoped UPDATE policy.
- `spaces_*`: select same-company; insert/update/delete company-admin (`private.is_company_admin`). Direct authenticated space UPDATE/DELETE is live (relevant to revision triggers + spaces DELETE disposition).
- `space_presence_log_select_same_company` (authenticated, SELECT only).
- `messages` policies use `private.current_app_user_id()` / `private.is_conversation_member()`.

## Grants (from pg_class.relacl / pg_attribute.attacl)

- `knock_requests`: **anon AND authenticated hold FULL table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES)**. Worse than expected; Phase 1 must revoke all browser-role privileges.
- `users`: authenticated = SELECT (table) + **column UPDATE grants on: avatar_url, display_name, last_active, preferences, status, status_message** (matches enable_core_table_rls migration; SEC-02 substrate — client can write `last_active`/`status`).
- `spaces`: authenticated = SELECT/INSERT/UPDATE/DELETE (table-level, gated by admin policies).
- `space_presence_log`: authenticated = SELECT only; service_role full.
- `messages`: anon + authenticated full DML (policy-gated).
- `realtime.messages`: anon + authenticated INSERT/SELECT/UPDATE (default Supabase).
- Note: `information_schema.role_*_grants` returned empty through the MCP role; ACLs were read via `aclexplode(relacl)` and `pg_attribute.attacl`.

## Roles

- `presence_maintenance_owner`: **does not exist yet** (created later; Phase 0 local verification still pending).
- authenticator → member of anon/authenticated/service_role; postgres has BYPASSRLS and broad memberships; service_role BYPASSRLS. Standard Supabase topology.

## Functions

Existing relevant functions: `private.current_app_user_id()`, `private.current_company_id()`, `private.is_company_admin(uuid)`, `private.is_company_member(uuid)` — all SECURITY DEFINER, owner postgres.

`public.remove_user_from_all_spaces(user_id_param uuid)` — **exists live and is a documented NO-OP** (empty plpgsql body, comment: "logic deprecated"). Stop condition avoided (definition readable). Disposition: drop after the remaining caller (`SupabaseUserRepository.updateLocation`) stops invoking it; no invariant to port.

None of the target presence/knock functions (`transition_user_location`, `register_presence_session`, `create_knock_request`, etc.) exist yet.

## Realtime publication

`supabase_realtime` includes: conversations, message_attachments, message_reactions, messages, **spaces, users, knock_requests**, conversation_members, message_read_receipts. Knock signaling via postgres_changes on `knock_requests` is live (DOC-04 confirmed); `users`/`spaces` rows are broadcast to subscribers.

## Extensions / cron

- `pg_cron`: available (default 1.6), **NOT installed**. Cron-job readback deferred until installation phase; "jobs run as postgres" verification pending local/staging install.

## Triggers

No triggers on users, spaces, space_presence_log, knock_requests.

## Indexes

- users: idx_users_company_id, idx_users_current_space_id, idx_users_email, idx_users_supabase_uid, users_email_key, users_firebase_uid_key, users_pkey
- spaces: idx_spaces_company_id, idx_spaces_neighborhood_id, spaces_pkey
- space_presence_log: idx_space_presence_log_space_id, idx_space_presence_log_time, idx_space_presence_log_user_id, space_presence_log_pkey
- knock_requests: idx_knock_requests_requester_id, idx_knock_requests_space_id, idx_knock_requests_status, knock_requests_pkey

## Data-repair checks

- **Duplicate open presence logs: 1 user** — user_id `5cf7e176-4ac2-441d-8819-f6266cb20429`, 2 open rows (`5c7a92cc-a021-4dc5-879f-51ae8e5baac1` newest 2026-06-10, `79507eaa-c14b-41b3-87f6-5d509d162423` oldest 2026-03-24). Per stop condition, the cleanup query must be reviewed before any phase closes/repairs these rows. No repair performed.
- Malformed non-empty `access_control` (missing boolean `isPublic`): **0 rows** — no data-repair decision needed.
- Negative `spaces.capacity`: **0 rows** — CHECK constraint can be added without backfill.

## Observability sink (recorded per Phase 0)

The repo has no metrics-provider dependency (no Sentry/Datadog/OTel packages). Per handoff: mandatory implementation scope is **structured JSON server logs + committed SQL health checks**. Dashboard/alert integration is a **user-gated residual** pending provider selection.

## Baseline test state

Prescribed presence run at audited `b18ab26`: 14 files, 171 passed, 6 skipped, 3 TODO (recorded in handoff Baseline). No `src/` changes since; baseline remains valid at the handoff commit.

## Pending Phase 0 verifications (not yet captured)

- Verified JWT claims (`session_id`), JWT lifetime, Auth timebox/inactivity/single-session settings — requires dashboard/Auth-config readback or a decoded live token; not queryable via SQL.
- `presence_maintenance_owner` create/readback + pg_cron-as-postgres — requires local/staging instance (blocked on local bootstrap).
- Local bootstrap: repo has no `supabase/config.toml`; canonical `supabase/migrations` cannot build core schema from empty DB (baseline reconstruction required).
