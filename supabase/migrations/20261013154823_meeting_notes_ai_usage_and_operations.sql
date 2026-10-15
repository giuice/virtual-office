-- Phase 6 T9: AI usage accounting, admission, settlement, and idempotent
-- processing operations (spec-interview/phase-6-meeting-notes; SPEC FR-022,
-- FR-023, FR-031, BR-008, BR-013; AC-016, AC-025, AC-028, AC-034 DB side).
-- Depends on 20261013103447 (notes with company/revision/transcript identity),
-- 20261013105021 (private.meeting_note_lock_caller), 20261013110632
-- (private.meeting_note_lock_for_change), 20261013142351 (AI settings + Vault
-- secret 'meeting_notes_ai_key:<company_id>'), and pg_cron (1.6 locally and on
-- vhabpcoyypobgasacsko, read-only check 2026-10-13).
--
-- Objects:
--   * public.meeting_note_ai_operations — one row per admitted processing
--     operation, WITHOUT transcript or draft content: id, idempotency_key
--     (server-generated at ticket issuance, unique), kind, company_id
--     (→ companies ON DELETE CASCADE: a deleted company takes its usage with
--     it), user_id and note_id (NO foreign keys: deleting a note or a user
--     never removes usage or replenishes the limit), the binding
--     (source_revision, transcript_id, settings_revision, ticket_issued_at),
--     the provider/model/reasoning_level snapshot taken at admission,
--     admission_day (calendar date in America/Sao_Paulo at admission),
--     status, admitted_at, dispatched_at, settled_at.
--     Usage = the number of COUNTED operations of a company on an
--     admission_day; no separate counter can drift from the records.
--     RLS enabled with no policy; anon/authenticated: no privilege at all;
--     service_role: SELECT only. Every write goes through the
--     SECURITY DEFINER functions below. Not in any publication.
--   * State machine (status):
--       admitted   — reserved by admission; COUNTED.
--       dispatched — server code is about to send / has sent the one provider
--                    request (mark_meeting_note_ai_operation_dispatched);
--                    COUNTED.
--       succeeded | failed | discarded — terminal, COUNTED (settled from
--                    dispatched; discarded = the client left / the draft was
--                    dropped after dispatch, FR-021).
--       refunded   — terminal, NOT counted: the provider's initial response
--                    was a listed pre-processing rejection (settled from
--                    dispatched; the classification is server code's, T11).
--       released   — terminal, NOT counted: the request demonstrably was
--                    never sent (size preflight refusal, cancellation before
--                    send, error before dispatch); settled from admitted only.
--     Transitions: admitted → dispatched | released;
--                  dispatched → succeeded | failed | discarded | refunded;
--                  admitted/dispatched → failed by the stale-operation job
--                  (no outcome 10 minutes after dispatch — or after admission
--                  when dispatch was never recorded — FR-022 "a reservation
--                  without a recorded outcome stays counted").
--     A terminal operation never changes again: settlement of a terminal
--     operation returns its status with changed=false (idempotent, at most
--     once, always against its own admission_day).
--   * Lock order (PLAN lock order rule, extended exactly as the block A fix
--     did for create_meeting_note): (1) actor users row FOR KEY SHARE,
--     (2) the company row FOR KEY SHARE (the operation's FK target; taken
--     here so the FK check never takes it late), (3) the company's AI
--     settings row FOR UPDATE — serializes every admission of the company
--     against each other and against save_meeting_note_ai_settings (which
--     takes the same row FOR UPDATE after the actor users row), (4) the note
--     row FOR UPDATE (shared helper), (5) the new operation row. Settlement,
--     dispatch marking, and the jobs lock only operation rows (no other row
--     locks), so no cycle exists with T8's save, T17 note mutations, T2 item
--     writes, member removal / role change (users FOR UPDATE → companies).
--   * public.admit_meeting_note_ai_operation(p_actor_user_id uuid,
--     p_company_id uuid, p_note_id uuid, p_idempotency_key uuid,
--     p_ticket_issued_at timestamptz, p_source_revision bigint,
--     p_transcript_id uuid, p_settings_revision bigint) RETURNS jsonb —
--     service_role only; called by the start route AFTER it verified the
--     signed ticket and that the ticket's user/company/note equal the
--     authenticated application user's; p_actor_user_id is that
--     server-derived users.id. One transaction (READ COMMITTED; each
--     statement after a lock wait reads the latest committed state):
--       0. ticket age: issued > 24 h ago, or > 5 min in the future →
--          EXPIRED, before any lock or lookup (records or not), on the
--          clock time at the call;
--       1. locks (above); the actor must be a current member of p_company_id
--          and an editor of the note (author while a member, current
--          participant, company admin — private.meeting_note_lock_note_for_actor,
--          the same rule as every note mutation) — for replays too;
--       2. existing operation for the key: same binding → its status
--          (replay=true, no key, no transcript, nothing reserved), regardless
--          of later settings or source changes; different binding →
--          BINDING_MISMATCH;
--       3. new operation: settings row + Vault secret present (else
--          NOT_CONFIGURED); settings revision current (else SETTINGS_STALE
--          with the current provider/model/reasoning level); note revision and
--          transcript identity equal the ticket's (else SOURCE_STALE); used <
--          daily_limit on today's America/Sao_Paulo day — clock time after
--          the locks were granted, so a wait across midnight counts on the
--          new day (else LIMIT_REACHED
--          with limit, used, reset_at); then inserts the operation (admitted)
--          and returns operation id, the provider/model/reasoning snapshot,
--          the decrypted key, and the bound transcript text — all read under
--          the same locks in the same transaction.
--   * public.mark_meeting_note_ai_operation_dispatched(p_operation_id uuid)
--     RETURNS jsonb — service_role only; admitted → dispatched (idempotent
--     when already dispatched; INVALID_TRANSITION from a terminal state, so
--     an operation the stale job already failed is never dispatched).
--   * public.settle_meeting_note_ai_operation(p_operation_id uuid,
--     p_outcome text) RETURNS jsonb — service_role only; outcome in
--     succeeded|failed|discarded|refunded (from dispatched) or released (from
--     admitted); terminal → changed=false.
--   * public.get_meeting_note_ai_usage() RETURNS jsonb — authenticated only;
--     the CALLER's company (users.supabase_uid = auth.uid()) count for today:
--     {configured, daily_limit, used, usage_day, reset_at}. No parameter, so
--     no other company is addressable.
--   * public.fail_stale_meeting_note_ai_operations() RETURNS integer and
--     public.purge_meeting_note_ai_operations() RETURNS integer —
--     service_role only (tests and server code), run by pg_cron as postgres:
--     'meeting-notes-ai-fail-stale-v1' every minute, and
--     'meeting-notes-ai-purge-operations-v1' daily at 03:40 UTC (deletes
--     operations admitted more than 30 days ago).
--   * private.meeting_note_lock_actor(uuid) — the actor's users row by id,
--     FOR KEY SHARE (the by-id twin of private.meeting_note_lock_caller).
--   * private.meeting_note_lock_note_for_actor(...) — the note lock + rights
--     body of private.meeting_note_lock_for_change, extracted unchanged so
--     admission (service_role, actor by id, settings lock in between) and the
--     auth.uid() mutations share ONE rights rule. private.meeting_note_lock_for_change
--     keeps its signature, outputs, tokens, and behavior and now delegates.
--   * private.meeting_note_ai_usage_day(timestamptz),
--     private.meeting_note_ai_reset_at(date),
--     private.meeting_note_ai_used_count(uuid, date) — helpers.
--   Every function: owner postgres, SET search_path = '', schema-qualified,
--   REVOKE ALL FROM PUBLIC, anon, authenticated, service_role, then EXECUTE
--   only as listed (private helpers: none).
--
-- Error tokens (message = token; SQLSTATE; DETAIL JSON where listed):
--   22023 MEETING_NOTE_AI_INVALID_ARGUMENT (a NULL argument)
--   22023 MEETING_NOTE_AI_OUTCOME_INVALID (unknown settlement outcome)
--   P0001 MEETING_NOTE_AI_TICKET_EXPIRED
--   P0002 MEETING_NOTE_NOT_FOUND (actor missing / not a current member of
--         p_company_id / note missing, deleted, or of another company)
--   42501 MEETING_NOTE_FORBIDDEN (a current member who is not an editor)
--   P0001 MEETING_NOTE_AI_BINDING_MISMATCH
--   P0001 MEETING_NOTE_AI_NOT_CONFIGURED
--   P0001 MEETING_NOTE_AI_SETTINGS_STALE  DETAIL {current_revision, provider,
--         model, reasoning_level}
--   P0001 MEETING_NOTE_AI_SOURCE_STALE    DETAIL {current_revision,
--         transcript_id}
--   P0001 MEETING_NOTE_AI_LIMIT_REACHED   DETAIL {limit, used, usage_day,
--         reset_at}
--   P0002 MEETING_NOTE_AI_OPERATION_NOT_FOUND
--   P0001 MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION DETAIL {status}
--   42501 MEETING_NOTE_AI_USAGE_FORBIDDEN (usage read without a company)
--
-- Online expectations (T15 preflight): pg_cron in pg_catalog with
-- cron.schedule/cron.unschedule executable by postgres and the jobs owned by
-- postgres (cron.job.username = 'postgres'); a successful run of each job in
-- cron.job_run_details after applying; supabase_vault as for 20261013142351.
--
-- Rollback (order: FIRST roll the application back to a build without the
-- ticket/start routes, THEN run this SQL). Usage history is lost; the note
-- helpers return to the 20261013110632 body:
--   begin;
--   do $$ declare v_job record; begin
--     for v_job in select jobid from cron.job
--       where jobname in ('meeting-notes-ai-fail-stale-v1', 'meeting-notes-ai-purge-operations-v1')
--     loop perform cron.unschedule(v_job.jobid); end loop; end $$;
--   drop function if exists public.admit_meeting_note_ai_operation(uuid, uuid, uuid, uuid, timestamptz, bigint, uuid, bigint);
--   drop function if exists public.mark_meeting_note_ai_operation_dispatched(uuid);
--   drop function if exists public.settle_meeting_note_ai_operation(uuid, text);
--   drop function if exists public.get_meeting_note_ai_usage();
--   drop function if exists public.fail_stale_meeting_note_ai_operations();
--   drop function if exists public.purge_meeting_note_ai_operations();
--   drop table if exists public.meeting_note_ai_operations;
--   drop function if exists private.meeting_note_ai_used_count(uuid, date);
--   drop function if exists private.meeting_note_ai_reset_at(date);
--   drop function if exists private.meeting_note_ai_usage_day(timestamptz);
--   -- Re-run the "create or replace function private.meeting_note_lock_for_change"
--   -- statement of 20261013110632_meeting_note_action_items_contract.sql
--   -- (through its "$$;") and its owner/revoke lines, THEN:
--   drop function if exists private.meeting_note_lock_note_for_actor(uuid, text, uuid, uuid, boolean);
--   drop function if exists private.meeting_note_lock_actor(uuid);
--   commit;

-- ---------------------------------------------------------------------------
-- Operations table
-- ---------------------------------------------------------------------------

create table public.meeting_note_ai_operations (
  id uuid not null default pg_catalog.gen_random_uuid(),
  idempotency_key uuid not null,
  kind text not null default 'transcript_draft'
    constraint meeting_note_ai_operations_kind_check
      check (kind = 'transcript_draft'),
  company_id uuid not null
    references public.companies (id) on delete cascade,
  user_id uuid not null,
  note_id uuid not null,
  source_revision bigint not null
    constraint meeting_note_ai_operations_source_revision_check
      check (source_revision >= 1),
  transcript_id uuid not null,
  settings_revision bigint not null
    constraint meeting_note_ai_operations_settings_revision_check
      check (settings_revision >= 1),
  ticket_issued_at timestamptz not null,
  provider text not null
    constraint meeting_note_ai_operations_provider_check
      check (provider in ('anthropic', 'openai', 'kimi', 'glm')),
  model text not null,
  reasoning_level text not null,
  admission_day date not null,
  status text not null default 'admitted'
    constraint meeting_note_ai_operations_status_check
      check (status in ('admitted', 'dispatched', 'succeeded', 'failed', 'discarded', 'refunded', 'released')),
  admitted_at timestamptz not null default pg_catalog.now(),
  dispatched_at timestamptz,
  settled_at timestamptz,
  constraint meeting_note_ai_operations_pkey primary key (id),
  constraint meeting_note_ai_operations_idempotency_key_key unique (idempotency_key),
  constraint meeting_note_ai_operations_settled_check
    check ((settled_at is null) = (status in ('admitted', 'dispatched'))),
  constraint meeting_note_ai_operations_dispatched_check
    check (
      (status in ('admitted', 'released') and dispatched_at is null)
      or (status in ('dispatched', 'succeeded', 'discarded', 'refunded') and dispatched_at is not null)
      or status = 'failed'
    )
);

comment on table public.meeting_note_ai_operations is
  'Phase 6: AI processing operations (idempotency + usage), no transcript or draft content. Counted statuses: admitted, dispatched, succeeded, failed, discarded. Written only by the service_role meeting-note AI RPCs; kept 30 days.';
comment on column public.meeting_note_ai_operations.user_id is
  'Application users.id of the requester (no FK: deleting the user never changes usage).';
comment on column public.meeting_note_ai_operations.note_id is
  'The note the operation was admitted for (no FK: deleting the note never changes usage).';
comment on column public.meeting_note_ai_operations.admission_day is
  'Calendar date in America/Sao_Paulo at admission; usage and settlement always count against this day.';

-- Today's count per company (admission and the usage read).
create index meeting_note_ai_operations_company_day_idx
  on public.meeting_note_ai_operations (company_id, admission_day, status);
-- Stale-operation job.
create index meeting_note_ai_operations_dispatched_open_idx
  on public.meeting_note_ai_operations (dispatched_at)
  where status = 'dispatched';
-- Stale admitted operations and the 30-day purge.
create index meeting_note_ai_operations_admitted_at_idx
  on public.meeting_note_ai_operations (admitted_at);

alter table public.meeting_note_ai_operations enable row level security;

-- Baseline default privileges grant ALL on new public tables to anon,
-- authenticated, and service_role; reset, then let service_role read only.
revoke all on table public.meeting_note_ai_operations from public, anon, authenticated, service_role;
grant select on table public.meeting_note_ai_operations to service_role;

-- ---------------------------------------------------------------------------
-- Shared note lock + rights (one rule for mutations and admission)
-- ---------------------------------------------------------------------------

-- The actor's users row by application id, FOR KEY SHARE (first lock of the
-- service_role transactions that act for a server-authorized user). All OUT
-- values are NULL when the row does not exist.
create or replace function private.meeting_note_lock_actor(
  p_user_id uuid,
  out caller_id uuid,
  out caller_company_id uuid,
  out caller_is_admin boolean,
  out caller_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  select u.id, u.company_id, (u.role = 'admin'::public.user_role), u.display_name
  into caller_id, caller_company_id, caller_is_admin, caller_name
  from public.users as u
  where u.id = p_user_id
  for key share;
end;
$$;

-- For an actor whose users row the caller has ALREADY locked FOR KEY SHARE:
-- locks the note FOR UPDATE (only for a member of the note's company) and
-- reports the actor's rights on the locked pre-change state. Raises
-- p_not_found (P0002) when the note is missing or the actor is not a current
-- member of its company. Body moved unchanged from
-- private.meeting_note_lock_for_change (20261013110632).
create or replace function private.meeting_note_lock_note_for_actor(
  p_note_id uuid,
  p_not_found text,
  p_actor_id uuid,
  p_actor_company_id uuid,
  p_actor_is_admin boolean,
  out note_company_id uuid,
  out note_revision bigint,
  out can_edit boolean,
  out can_delete boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note record;
begin
  if p_note_id is null or p_actor_id is null or p_actor_company_id is null then
    raise exception '%', p_not_found using errcode = 'P0002';
  end if;

  -- Outsiders never take the note lock: the company check runs on an
  -- unlocked read first (company_id is immutable, so it cannot go stale).
  if not exists (
    select 1
    from public.meeting_notes as n
    where n.id = p_note_id
      and n.company_id = p_actor_company_id
  ) then
    raise exception '%', p_not_found using errcode = 'P0002';
  end if;

  select n.id, n.company_id, n.author_user_id, n.revision
  into v_note
  from public.meeting_notes as n
  where n.id = p_note_id
  for update;

  if not found then
    -- Deleted by a transaction that committed while this one waited.
    raise exception '%', p_not_found using errcode = 'P0002';
  end if;

  -- Two-valued by construction (a NULL input never grants a right).
  can_delete := coalesce(v_note.author_user_id = p_actor_id, false)
                or coalesce(p_actor_is_admin, false);
  can_edit := can_delete or exists (
    select 1
    from public.meeting_note_participants as p
    where p.note_id = v_note.id
      and p.user_id = p_actor_id
  );
  note_company_id := v_note.company_id;
  note_revision := v_note.revision;
end;
$$;

-- Same signature, outputs, checks, order, and tokens as in 20261013110632;
-- the note lock + rights part now lives in the shared helper above.
create or replace function private.meeting_note_lock_for_change(
  p_note_id uuid,
  p_not_found text,
  out caller_id uuid,
  out caller_name text,
  out note_company_id uuid,
  out note_revision bigint,
  out can_edit boolean,
  out can_delete boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller record;
  v_note record;
begin
  select * into v_caller from private.meeting_note_lock_caller();
  if p_note_id is null or v_caller.caller_id is null or v_caller.caller_company_id is null then
    raise exception '%', p_not_found using errcode = 'P0002';
  end if;

  select * into v_note
  from private.meeting_note_lock_note_for_actor(
    p_note_id, p_not_found, v_caller.caller_id, v_caller.caller_company_id, v_caller.caller_is_admin
  );

  caller_id := v_caller.caller_id;
  caller_name := v_caller.caller_name;
  note_company_id := v_note.note_company_id;
  note_revision := v_note.note_revision;
  can_edit := v_note.can_edit;
  can_delete := v_note.can_delete;
end;
$$;

alter function private.meeting_note_lock_actor(uuid) owner to postgres;
alter function private.meeting_note_lock_note_for_actor(uuid, text, uuid, uuid, boolean) owner to postgres;
alter function private.meeting_note_lock_for_change(uuid, text) owner to postgres;
revoke all on function private.meeting_note_lock_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_lock_note_for_actor(uuid, text, uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_lock_for_change(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Usage helpers
-- ---------------------------------------------------------------------------

-- The usage day of an instant: its calendar date in America/Sao_Paulo.
create or replace function private.meeting_note_ai_usage_day(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.timezone('America/Sao_Paulo', p_at))::date
$$;

-- When a usage day ends: the next 00:00 in America/Sao_Paulo.
create or replace function private.meeting_note_ai_reset_at(p_day date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select pg_catalog.timezone('America/Sao_Paulo', (p_day + 1)::timestamp)
$$;

-- Counted operations of a company on a usage day.
create or replace function private.meeting_note_ai_used_count(p_company_id uuid, p_day date)
returns integer
language sql
stable
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
  from public.meeting_note_ai_operations as o
  where o.company_id = p_company_id
    and o.admission_day = p_day
    and o.status in ('admitted', 'dispatched', 'succeeded', 'failed', 'discarded')
$$;

alter function private.meeting_note_ai_usage_day(timestamptz) owner to postgres;
alter function private.meeting_note_ai_reset_at(date) owner to postgres;
alter function private.meeting_note_ai_used_count(uuid, date) owner to postgres;
revoke all on function private.meeting_note_ai_usage_day(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_ai_reset_at(date) from public, anon, authenticated, service_role;
revoke all on function private.meeting_note_ai_used_count(uuid, date) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admission (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.admit_meeting_note_ai_operation(
  p_actor_user_id uuid,
  p_company_id uuid,
  p_note_id uuid,
  p_idempotency_key uuid,
  p_ticket_issued_at timestamptz,
  p_source_revision bigint,
  p_transcript_id uuid,
  p_settings_revision bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_actor record;
  v_settings public.meeting_note_ai_settings%rowtype;
  v_has_settings boolean;
  v_note record;
  v_existing public.meeting_note_ai_operations%rowtype;
  v_transcript text;
  v_transcript_id uuid;
  v_api_key text;
  v_day date;
  v_used integer;
  v_operation public.meeting_note_ai_operations%rowtype;
begin
  if p_actor_user_id is null or p_company_id is null or p_note_id is null
     or p_idempotency_key is null or p_ticket_issued_at is null
     or p_source_revision is null or p_transcript_id is null or p_settings_revision is null then
    raise exception 'MEETING_NOTE_AI_INVALID_ARGUMENT' using errcode = '22023';
  end if;

  -- (0) The ticket and its key expire 24 h after issuance — checked before any
  -- lock or lookup, so an expired key is refused whether or not its
  -- operation record still exists. A ticket from the future is not valid.
  if p_ticket_issued_at <= v_now - interval '24 hours'
     or p_ticket_issued_at > v_now + interval '5 minutes' then
    raise exception 'MEETING_NOTE_AI_TICKET_EXPIRED' using errcode = 'P0001';
  end if;

  -- (1) Actor row FOR KEY SHARE; a removal/role change that committed first
  -- is seen by the locking read.
  select * into v_actor from private.meeting_note_lock_actor(p_actor_user_id);
  if v_actor.caller_id is null
     or v_actor.caller_company_id is distinct from p_company_id then
    raise exception 'MEETING_NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- (2) The company row FOR KEY SHARE (users → company, as every product RPC).
  perform 1 from public.companies as c where c.id = p_company_id for key share;
  if not found then
    raise exception 'MEETING_NOTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- (3) The company's AI settings row FOR UPDATE: one admission of the
  -- company at a time, and no settings save in between.
  select s.* into v_settings
  from public.meeting_note_ai_settings as s
  where s.company_id = p_company_id
  for update;
  v_has_settings := found;

  -- (4) The note FOR UPDATE + the actor's rights on the locked state.
  select * into v_note
  from private.meeting_note_lock_note_for_actor(
    p_note_id, 'MEETING_NOTE_NOT_FOUND', v_actor.caller_id, v_actor.caller_company_id, v_actor.caller_is_admin
  );
  if v_note.can_edit is not true then
    raise exception 'MEETING_NOTE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Lock waits may have crossed 00:00 America/Sao_Paulo: the usage day, the
  -- limit check, and admitted_at use the time after the locks were granted.
  v_now := pg_catalog.clock_timestamp();

  -- (5) Replay: an operation already admitted for this key.
  select o.* into v_existing
  from public.meeting_note_ai_operations as o
  where o.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> p_actor_user_id
       or v_existing.company_id <> p_company_id
       or v_existing.note_id <> p_note_id
       or v_existing.source_revision <> p_source_revision
       or v_existing.transcript_id <> p_transcript_id
       or v_existing.settings_revision <> p_settings_revision
       or v_existing.ticket_issued_at <> p_ticket_issued_at then
      raise exception 'MEETING_NOTE_AI_BINDING_MISMATCH' using errcode = 'P0001';
    end if;
    return pg_catalog.jsonb_build_object(
      'replay', true,
      'operation_id', v_existing.id,
      'status', v_existing.status,
      'admission_day', v_existing.admission_day,
      'admitted_at', v_existing.admitted_at,
      'dispatched_at', v_existing.dispatched_at,
      'settled_at', v_existing.settled_at,
      'provider', v_existing.provider,
      'model', v_existing.model,
      'reasoning_level', v_existing.reasoning_level,
      'settings_revision', v_existing.settings_revision
    );
  end if;

  -- (6) New operation: configured, current settings, current source, quota.
  if v_has_settings then
    select ds.decrypted_secret into v_api_key
    from vault.decrypted_secrets as ds
    where ds.name = private.meeting_note_ai_secret_name(p_company_id);
  end if;
  if not v_has_settings or v_api_key is null then
    raise exception 'MEETING_NOTE_AI_NOT_CONFIGURED' using errcode = 'P0001';
  end if;

  if v_settings.revision <> p_settings_revision then
    raise exception 'MEETING_NOTE_AI_SETTINGS_STALE'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'current_revision', v_settings.revision,
              'provider', v_settings.provider,
              'model', v_settings.model,
              'reasoning_level', v_settings.reasoning_level
            )::text;
  end if;

  select n.transcript, n.transcript_id into v_transcript, v_transcript_id
  from public.meeting_notes as n
  where n.id = p_note_id;
  if v_note.note_revision <> p_source_revision
     or v_transcript_id is distinct from p_transcript_id
     or v_transcript is null then
    raise exception 'MEETING_NOTE_AI_SOURCE_STALE'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'current_revision', v_note.note_revision,
              'transcript_id', v_transcript_id
            )::text;
  end if;

  v_day := private.meeting_note_ai_usage_day(v_now);
  v_used := private.meeting_note_ai_used_count(p_company_id, v_day);
  if v_used >= v_settings.daily_limit then
    raise exception 'MEETING_NOTE_AI_LIMIT_REACHED'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object(
              'limit', v_settings.daily_limit,
              'used', v_used,
              'usage_day', v_day,
              'reset_at', private.meeting_note_ai_reset_at(v_day)
            )::text;
  end if;

  insert into public.meeting_note_ai_operations (
    idempotency_key, company_id, user_id, note_id, source_revision, transcript_id,
    settings_revision, ticket_issued_at, provider, model, reasoning_level,
    admission_day, status, admitted_at
  )
  values (
    p_idempotency_key, p_company_id, p_actor_user_id, p_note_id, p_source_revision, p_transcript_id,
    v_settings.revision, p_ticket_issued_at, v_settings.provider, v_settings.model, v_settings.reasoning_level,
    v_day, 'admitted', v_now
  )
  returning * into v_operation;

  return pg_catalog.jsonb_build_object(
    'replay', false,
    'operation_id', v_operation.id,
    'status', v_operation.status,
    'admission_day', v_operation.admission_day,
    'admitted_at', v_operation.admitted_at,
    'provider', v_settings.provider,
    'model', v_settings.model,
    'reasoning_level', v_settings.reasoning_level,
    'settings_revision', v_settings.revision,
    'source_revision', v_note.note_revision,
    'transcript_id', v_transcript_id,
    'api_key', v_api_key,
    'transcript', v_transcript,
    'usage', pg_catalog.jsonb_build_object(
      'limit', v_settings.daily_limit,
      'used', v_used + 1,
      'usage_day', v_day,
      'reset_at', private.meeting_note_ai_reset_at(v_day)
    )
  );
end;
$$;

alter function public.admit_meeting_note_ai_operation(uuid, uuid, uuid, uuid, timestamptz, bigint, uuid, bigint) owner to postgres;
revoke all on function public.admit_meeting_note_ai_operation(uuid, uuid, uuid, uuid, timestamptz, bigint, uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.admit_meeting_note_ai_operation(uuid, uuid, uuid, uuid, timestamptz, bigint, uuid, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- Dispatch marking and settlement (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.mark_meeting_note_ai_operation_dispatched(p_operation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operation public.meeting_note_ai_operations%rowtype;
  v_changed boolean := false;
begin
  if p_operation_id is null then
    raise exception 'MEETING_NOTE_AI_INVALID_ARGUMENT' using errcode = '22023';
  end if;

  select o.* into v_operation
  from public.meeting_note_ai_operations as o
  where o.id = p_operation_id
  for update;
  if not found then
    raise exception 'MEETING_NOTE_AI_OPERATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_operation.status = 'admitted' then
    update public.meeting_note_ai_operations as o
    set status = 'dispatched',
        dispatched_at = pg_catalog.now()
    where o.id = p_operation_id
    returning o.* into v_operation;
    v_changed := true;
  elsif v_operation.status <> 'dispatched' then
    raise exception 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION'
      using errcode = 'P0001',
            detail = pg_catalog.jsonb_build_object('status', v_operation.status)::text;
  end if;

  return pg_catalog.jsonb_build_object(
    'operation_id', v_operation.id,
    'status', v_operation.status,
    'changed', v_changed,
    'dispatched_at', v_operation.dispatched_at
  );
end;
$$;

alter function public.mark_meeting_note_ai_operation_dispatched(uuid) owner to postgres;
revoke all on function public.mark_meeting_note_ai_operation_dispatched(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_meeting_note_ai_operation_dispatched(uuid) to service_role;

create or replace function public.settle_meeting_note_ai_operation(p_operation_id uuid, p_outcome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operation public.meeting_note_ai_operations%rowtype;
  v_changed boolean := false;
begin
  if p_operation_id is null or p_outcome is null then
    raise exception 'MEETING_NOTE_AI_INVALID_ARGUMENT' using errcode = '22023';
  end if;
  if p_outcome not in ('succeeded', 'failed', 'discarded', 'refunded', 'released') then
    raise exception 'MEETING_NOTE_AI_OUTCOME_INVALID' using errcode = '22023';
  end if;

  select o.* into v_operation
  from public.meeting_note_ai_operations as o
  where o.id = p_operation_id
  for update;
  if not found then
    raise exception 'MEETING_NOTE_AI_OPERATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_operation.status in ('admitted', 'dispatched') then
    -- released only for a request never sent; every other outcome only after
    -- the dispatch was recorded.
    if (p_outcome = 'released') <> (v_operation.status = 'admitted') then
      raise exception 'MEETING_NOTE_AI_OPERATION_INVALID_TRANSITION'
        using errcode = 'P0001',
              detail = pg_catalog.jsonb_build_object('status', v_operation.status)::text;
    end if;

    update public.meeting_note_ai_operations as o
    set status = p_outcome,
        settled_at = pg_catalog.now()
    where o.id = p_operation_id
    returning o.* into v_operation;
    v_changed := true;
  end if;
  -- A terminal operation is never settled again (idempotent).

  return pg_catalog.jsonb_build_object(
    'operation_id', v_operation.id,
    'status', v_operation.status,
    'changed', v_changed,
    'counted', v_operation.status in ('admitted', 'dispatched', 'succeeded', 'failed', 'discarded'),
    'admission_day', v_operation.admission_day,
    'settled_at', v_operation.settled_at
  );
end;
$$;

alter function public.settle_meeting_note_ai_operation(uuid, text) owner to postgres;
revoke all on function public.settle_meeting_note_ai_operation(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.settle_meeting_note_ai_operation(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Member usage read (authenticated: own company only)
-- ---------------------------------------------------------------------------

create or replace function public.get_meeting_note_ai_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_company_id uuid;
  v_limit integer;
  v_configured boolean;
  v_day date := private.meeting_note_ai_usage_day(pg_catalog.now());
begin
  if v_uid is not null then
    select u.company_id into v_company_id
    from public.users as u
    where u.supabase_uid = v_uid;
  end if;
  if v_company_id is null then
    raise exception 'MEETING_NOTE_AI_USAGE_FORBIDDEN' using errcode = '42501';
  end if;

  select s.daily_limit into v_limit
  from public.meeting_note_ai_settings as s
  where s.company_id = v_company_id;
  v_configured := found;

  return pg_catalog.jsonb_build_object(
    'configured', v_configured,
    'daily_limit', coalesce(v_limit, 20),
    'used', private.meeting_note_ai_used_count(v_company_id, v_day),
    'usage_day', v_day,
    'reset_at', private.meeting_note_ai_reset_at(v_day)
  );
end;
$$;

alter function public.get_meeting_note_ai_usage() owner to postgres;
revoke all on function public.get_meeting_note_ai_usage() from public, anon, authenticated, service_role;
grant execute on function public.get_meeting_note_ai_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- Maintenance jobs (service_role; scheduled with pg_cron as postgres)
-- ---------------------------------------------------------------------------

-- An operation with no recorded outcome 10 minutes after dispatch (or after
-- admission when no dispatch was recorded) becomes terminal "failed" and stays
-- counted (FR-022, FR-031). Rows being settled right now are skipped and
-- picked up by the next run.
create or replace function public.fail_stale_meeting_note_ai_operations()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := pg_catalog.clock_timestamp();
  v_count integer := 0;
begin
  with stale as materialized (
    select o.id
    from public.meeting_note_ai_operations as o
    where (o.status = 'dispatched' and o.dispatched_at <= v_at - interval '10 minutes')
       or (o.status = 'admitted' and o.admitted_at <= v_at - interval '10 minutes')
    order by o.admitted_at, o.id
    for update skip locked
    limit 1000
  )
  update public.meeting_note_ai_operations as o
  set status = 'failed',
      settled_at = v_at
  from stale
  where o.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Operation records are kept 30 days after admission (a ticket is valid for
-- 24 h, so no replay can need an older record).
create or replace function public.purge_meeting_note_ai_operations()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := pg_catalog.clock_timestamp();
  v_count integer := 0;
begin
  with purgeable as materialized (
    select o.id
    from public.meeting_note_ai_operations as o
    where o.admitted_at <= v_at - interval '30 days'
    order by o.admitted_at, o.id
    for update skip locked
    limit 10000
  )
  delete from public.meeting_note_ai_operations as o
  using purgeable
  where o.id = purgeable.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter function public.fail_stale_meeting_note_ai_operations() owner to postgres;
alter function public.purge_meeting_note_ai_operations() owner to postgres;
revoke all on function public.fail_stale_meeting_note_ai_operations() from public, anon, authenticated, service_role;
revoke all on function public.purge_meeting_note_ai_operations() from public, anon, authenticated, service_role;
grant execute on function public.fail_stale_meeting_note_ai_operations() to service_role;
grant execute on function public.purge_meeting_note_ai_operations() to service_role;

-- Idempotent scheduling: drop any job with the same name first.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in ('meeting-notes-ai-fail-stale-v1', 'meeting-notes-ai-purge-operations-v1')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'meeting-notes-ai-fail-stale-v1',
  '* * * * *',
  'select public.fail_stale_meeting_note_ai_operations();'
);

select cron.schedule(
  'meeting-notes-ai-purge-operations-v1',
  '40 3 * * *',
  'select public.purge_meeting_note_ai_operations();'
);
