-- Phase 6 T8: company AI settings with a server-only encrypted key
-- (spec-interview/phase-6-meeting-notes; SPEC FR-024, BR-009, AC-017, AC-023).
-- Depends on the baseline (companies, users, private.is_company_member) and on
-- the supabase_vault extension in schema `vault` (0.3.1 locally and on
-- vhabpcoyypobgasacsko, read-only check 2026-10-13).
--
-- Objects:
--   * public.meeting_note_ai_settings — one row per company (company_id PK →
--     companies ON DELETE CASCADE): provider (anthropic/openai/kimi/glm),
--     model, reasoning_level, daily_limit 1–200, revision (bumped by every
--     save), updated_by_user_id (users.id, ON DELETE SET NULL) +
--     updated_by_name snapshot, updated_at, key_last_four. A company without a
--     row is "not configured" with the default limit 20 (read side, app code).
--     NO key material and NO secret reference live in this table: the key is
--     a Vault secret named 'meeting_notes_ai_key:<company_id>' (vault.secrets
--     has a unique name index), located by that name only inside the
--     SECURITY DEFINER functions below. Members therefore read every column of
--     the row without learning anything usable against the key.
--   * Grants: authenticated SELECT only, rows of its own company
--     (private.is_company_member: users.supabase_uid = auth.uid()); anon
--     nothing; service_role SELECT only; no INSERT/UPDATE/DELETE/TRUNCATE for
--     any client role — the save RPC is the only write path. The table is not
--     added to any publication (supabase_realtime is not FOR ALL TABLES), and
--     vault.secrets / vault.decrypted_secrets keep their extension grants
--     (postgres, service_role; nothing for anon/authenticated).
--   * public.save_meeting_note_ai_settings(p_actor_user_id uuid,
--     p_company_id uuid, p_expected_revision bigint, p_provider text,
--     p_model text, p_reasoning_level text, p_daily_limit integer,
--     p_api_key text) RETURNS jsonb — service_role only. Called by the
--     /api/companies/ai-settings route AFTER it authorized the session user as
--     an admin of that company; p_actor_user_id is that server-derived
--     users.id. One transaction (READ COMMITTED), lock order (PLAN lock order
--     rule): (1) actor users row FOR KEY SHARE — blocks the member-removal and
--     role-change RPCs (they lock users FOR UPDATE) and does not conflict with
--     presence's NO KEY UPDATE writes; (2) the company's settings row FOR
--     UPDATE (or, on a first save, the INSERT ... ON CONFLICT DO NOTHING that
--     creates it; its FK check takes the company row FOR KEY SHARE, after the
--     users row, as every product RPC orders users → company); (3) only then
--     re-verify that the locked actor row is an admin of p_company_id. A
--     removal/demotion that committed first is seen by the locking read and
--     refuses the save (nothing changes); a save that holds the lock first
--     makes the removal wait until it commits (no cycle: the save never waits
--     for a lock the removal holds). Then: revision check (stale →
--     P0001 MEETING_NOTE_AI_SETTINGS_STALE_REVISION, DETAIL
--     {"current_revision": n|null}), validation (provider enum; model/reasoning
--     shape — the curated per-provider lists are enforced by the route from
--     the server capability matrix; limit 1–200; key printable ASCII 8–512, no
--     whitespace; first save requires a key, and keeping the key requires a
--     stored secret), write, Vault secret created or
--     replaced IN THE SAME TRANSACTION (vault.create_secret /
--     vault.update_secret), key_last_four set, revision + 1. Returns masked
--     metadata only (never the key). Exception messages are fixed tokens and
--     never contain parameter values.
--   * public.read_meeting_note_ai_key(p_company_id uuid) RETURNS jsonb —
--     service_role only; {revision, provider, model, reasoning_level,
--     daily_limit, api_key} from one snapshot, or NULL when not configured.
--     For server code that has already authorized the user (T9 admission).
--   * private.meeting_note_ai_secret_name(uuid) — the secret name (no grants).
--   * private.delete_meeting_note_ai_secret() + AFTER DELETE trigger: when a
--     settings row is deleted (company deletion cascades), its Vault secret is
--     deleted in the same transaction — no readable orphan remains.
--   Every function: owner postgres, SET search_path = '', schema-qualified,
--   REVOKE ALL FROM PUBLIC, anon, authenticated, service_role, then EXECUTE
--   only to service_role for the two RPCs (none for the private helpers).
--
-- Error tokens (message = token; SQLSTATE):
--   42501 MEETING_NOTE_AI_SETTINGS_FORBIDDEN (actor missing, not in the
--         company, or not an admin — evaluated on the locked row)
--   P0001 MEETING_NOTE_AI_SETTINGS_STALE_REVISION (DETAIL current_revision)
--   22023 MEETING_NOTE_AI_SETTINGS_INVALID_ARGUMENT (null actor/company),
--         MEETING_NOTE_AI_PROVIDER_INVALID, MEETING_NOTE_AI_MODEL_INVALID,
--         MEETING_NOTE_AI_REASONING_INVALID, MEETING_NOTE_AI_DAILY_LIMIT_INVALID,
--         MEETING_NOTE_AI_KEY_REQUIRED, MEETING_NOTE_AI_KEY_INVALID
--
-- Rollback (order: FIRST roll the application back to a build without the AI
-- settings route/section, THEN run this SQL). It deletes every company's AI
-- settings and their Vault secrets (keys are lost; admins re-enter them after
-- a re-apply):
--   begin;
--   drop function if exists public.save_meeting_note_ai_settings(uuid, uuid, bigint, text, text, text, integer, text);
--   drop function if exists public.read_meeting_note_ai_key(uuid);
--   delete from public.meeting_note_ai_settings;  -- the trigger deletes each secret
--   delete from vault.secrets where name like 'meeting\_notes\_ai\_key:%';  -- orphans, if any
--   drop table if exists public.meeting_note_ai_settings;
--   drop function if exists private.delete_meeting_note_ai_secret();
--   drop function if exists private.meeting_note_ai_secret_name(uuid);
--   commit;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.meeting_note_ai_settings (
  company_id uuid primary key
    references public.companies (id) on delete cascade,
  provider text not null
    constraint meeting_note_ai_settings_provider_check
      check (provider in ('anthropic', 'openai', 'kimi', 'glm')),
  model text not null
    constraint meeting_note_ai_settings_model_check
      check (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'),
  reasoning_level text not null
    constraint meeting_note_ai_settings_reasoning_level_check
      check (reasoning_level ~ '^[a-z][a-z_]{0,31}$'),
  daily_limit integer not null
    constraint meeting_note_ai_settings_daily_limit_check
      check (daily_limit between 1 and 200),
  revision bigint not null
    constraint meeting_note_ai_settings_revision_check
      check (revision >= 1),
  key_last_four text not null
    constraint meeting_note_ai_settings_key_last_four_check
      check (key_last_four ~ '^[!-~]{4}$'),
  updated_by_user_id uuid
    references public.users (id) on delete set null,
  updated_by_name text not null,
  updated_at timestamptz not null default now()
);

comment on table public.meeting_note_ai_settings is
  'Phase 6: per-company AI provider metadata (no key material). Written only by public.save_meeting_note_ai_settings; the key is the Vault secret meeting_notes_ai_key:<company_id>.';

create index meeting_note_ai_settings_updated_by_idx
  on public.meeting_note_ai_settings (updated_by_user_id);

alter table public.meeting_note_ai_settings enable row level security;

-- Baseline default privileges grant ALL on new public tables to anon,
-- authenticated, and service_role; reset, then grant reads only.
revoke all on table public.meeting_note_ai_settings from public, anon, authenticated, service_role;
grant select on table public.meeting_note_ai_settings to authenticated;
grant select on table public.meeting_note_ai_settings to service_role;

create policy meeting_note_ai_settings_select_same_company
  on public.meeting_note_ai_settings
  for select
  to authenticated
  using (private.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.meeting_note_ai_secret_name(p_company_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'meeting_notes_ai_key:' || p_company_id::text
$$;

alter function private.meeting_note_ai_secret_name(uuid) owner to postgres;
revoke all on function private.meeting_note_ai_secret_name(uuid) from public, anon, authenticated, service_role;

create or replace function private.delete_meeting_note_ai_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets
  where name = private.meeting_note_ai_secret_name(old.company_id);
  return null;
end;
$$;

alter function private.delete_meeting_note_ai_secret() owner to postgres;
revoke all on function private.delete_meeting_note_ai_secret() from public, anon, authenticated, service_role;

create trigger meeting_note_ai_settings_delete_secret
  after delete on public.meeting_note_ai_settings
  for each row
  execute function private.delete_meeting_note_ai_secret();

-- ---------------------------------------------------------------------------
-- Save (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.save_meeting_note_ai_settings(
  p_actor_user_id uuid,
  p_company_id uuid,
  p_expected_revision bigint,
  p_provider text,
  p_model text,
  p_reasoning_level text,
  p_daily_limit integer,
  p_api_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_company_id uuid;
  v_actor_role public.user_role;
  v_actor_name text;
  v_current public.meeting_note_ai_settings%rowtype;
  v_exists boolean;
  v_inserted integer;
  v_secret_name text;
  v_secret_id uuid;
  v_saved public.meeting_note_ai_settings%rowtype;
begin
  if p_actor_user_id is null or p_company_id is null then
    raise exception 'MEETING_NOTE_AI_SETTINGS_INVALID_ARGUMENT' using errcode = '22023';
  end if;

  -- (1) Actor row, FOR KEY SHARE; the locking read returns the latest
  -- committed version (a removal/demotion that committed first is seen).
  select u.id, u.company_id, u.role, u.display_name
  into v_actor_id, v_actor_company_id, v_actor_role, v_actor_name
  from public.users as u
  where u.id = p_actor_user_id
  for key share;

  -- (2) The company's settings row.
  select s.*
  into v_current
  from public.meeting_note_ai_settings as s
  where s.company_id = p_company_id
  for update;
  v_exists := found;

  -- (3) Re-verify on the locked actor row.
  if v_actor_id is null
     or v_actor_company_id is distinct from p_company_id
     or v_actor_role is distinct from 'admin'::public.user_role then
    raise exception 'MEETING_NOTE_AI_SETTINGS_FORBIDDEN' using errcode = '42501';
  end if;

  if v_exists then
    if p_expected_revision is null or p_expected_revision <> v_current.revision then
      raise exception 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION'
        using errcode = 'P0001',
              detail = pg_catalog.jsonb_build_object('current_revision', v_current.revision)::text;
    end if;
  elsif p_expected_revision is not null then
    raise exception 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object('current_revision', null)::text;
  end if;

  if p_provider is null or p_provider not in ('anthropic', 'openai', 'kimi', 'glm') then
    raise exception 'MEETING_NOTE_AI_PROVIDER_INVALID' using errcode = '22023';
  end if;
  if p_model is null or p_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$' then
    raise exception 'MEETING_NOTE_AI_MODEL_INVALID' using errcode = '22023';
  end if;
  if p_reasoning_level is null or p_reasoning_level !~ '^[a-z][a-z_]{0,31}$' then
    raise exception 'MEETING_NOTE_AI_REASONING_INVALID' using errcode = '22023';
  end if;
  if p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 200 then
    raise exception 'MEETING_NOTE_AI_DAILY_LIMIT_INVALID' using errcode = '22023';
  end if;
  if p_api_key is null then
    if not v_exists then
      raise exception 'MEETING_NOTE_AI_KEY_REQUIRED' using errcode = '22023';
    end if;
  elsif pg_catalog.length(p_api_key) not between 8 and 512 or p_api_key !~ '^[!-~]+$' then
    raise exception 'MEETING_NOTE_AI_KEY_INVALID' using errcode = '22023';
  end if;

  v_secret_name := private.meeting_note_ai_secret_name(p_company_id);
  -- "Keep the current key" needs a stored key: a settings row whose secret is
  -- gone (manual Vault delete, TRUNCATE without row triggers) must not stay
  -- "configured" without one.
  if p_api_key is null
     and not exists (select 1 from vault.secrets as vs where vs.name = v_secret_name) then
    raise exception 'MEETING_NOTE_AI_KEY_REQUIRED' using errcode = '22023';
  end if;

  if v_exists then
    update public.meeting_note_ai_settings as s
    set provider = p_provider,
        model = p_model,
        reasoning_level = p_reasoning_level,
        daily_limit = p_daily_limit,
        revision = s.revision + 1,
        key_last_four = case when p_api_key is null then s.key_last_four
                             else pg_catalog.right(p_api_key, 4) end,
        updated_by_user_id = v_actor_id,
        updated_by_name = v_actor_name,
        updated_at = pg_catalog.now()
    where s.company_id = p_company_id
    returning s.* into v_saved;
  else
    -- First save. A concurrent first save that committed first wins the
    -- primary key; this one then inserts nothing and is stale.
    insert into public.meeting_note_ai_settings (
      company_id, provider, model, reasoning_level, daily_limit, revision,
      key_last_four, updated_by_user_id, updated_by_name, updated_at
    )
    values (
      p_company_id, p_provider, p_model, p_reasoning_level, p_daily_limit, 1,
      pg_catalog.right(p_api_key, 4), v_actor_id, v_actor_name, pg_catalog.now()
    )
    on conflict (company_id) do nothing
    returning * into v_saved;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      select s.revision into v_current.revision
      from public.meeting_note_ai_settings as s
      where s.company_id = p_company_id;
      raise exception 'MEETING_NOTE_AI_SETTINGS_STALE_REVISION'
        using errcode = 'P0001',
              detail = pg_catalog.jsonb_build_object('current_revision', v_current.revision)::text;
    end if;
  end if;

  if p_api_key is not null then
    select vs.id into v_secret_id
    from vault.secrets as vs
    where vs.name = v_secret_name;
    if v_secret_id is null then
      perform vault.create_secret(p_api_key, v_secret_name, 'Meeting notes AI provider key');
    else
      perform vault.update_secret(v_secret_id, p_api_key);
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'configured', true,
    'provider', v_saved.provider,
    'model', v_saved.model,
    'reasoning_level', v_saved.reasoning_level,
    'daily_limit', v_saved.daily_limit,
    'revision', v_saved.revision,
    'key_last_four', v_saved.key_last_four,
    'updated_by_user_id', v_saved.updated_by_user_id,
    'updated_by_name', v_saved.updated_by_name,
    'updated_at', v_saved.updated_at
  );
end;
$$;

alter function public.save_meeting_note_ai_settings(uuid, uuid, bigint, text, text, text, integer, text) owner to postgres;
revoke all on function public.save_meeting_note_ai_settings(uuid, uuid, bigint, text, text, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_meeting_note_ai_settings(uuid, uuid, bigint, text, text, text, integer, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Read key (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.read_meeting_note_ai_key(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'revision', s.revision,
    'provider', s.provider,
    'model', s.model,
    'reasoning_level', s.reasoning_level,
    'daily_limit', s.daily_limit,
    'api_key', ds.decrypted_secret
  )
  from public.meeting_note_ai_settings as s
  join vault.decrypted_secrets as ds
    on ds.name = private.meeting_note_ai_secret_name(s.company_id)
  where s.company_id = p_company_id
$$;

alter function public.read_meeting_note_ai_key(uuid) owner to postgres;
revoke all on function public.read_meeting_note_ai_key(uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_meeting_note_ai_key(uuid) to service_role;
