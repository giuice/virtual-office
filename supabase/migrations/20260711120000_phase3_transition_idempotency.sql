create table if not exists public.location_transition_requests (
  user_id uuid not null references public.users(id) on delete cascade,
  transition_id uuid not null,
  auth_session_id uuid not null,
  requested_space_id uuid,
  reason text not null,
  knock_request_id text,
  expected_location_version integer,
  result jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (user_id, transition_id),
  constraint location_transition_requests_reason_check
    check (reason in (
      'manual-enter',
      'manual-leave',
      'knock-enter',
      'auto-first-placement',
      'auto-rejoin',
      'auto-fallback',
      'teleport-accept',
      'logout'
    ))
);

alter table public.location_transition_requests enable row level security;
alter table public.location_transition_requests force row level security;

revoke all on table public.location_transition_requests from public, anon, authenticated;
-- service_role needs update/delete: transition fn stores results and removes still-null claims
grant select, insert, update, delete on table public.location_transition_requests to service_role;
-- UPDATE privilege is required by the purge batch's SELECT ... FOR UPDATE row locks;
-- there is deliberately no UPDATE policy, so pmo still cannot rewrite stored results.
grant select, update, delete on table public.location_transition_requests to presence_maintenance_owner;

create policy pmo_location_transition_requests_select
  on public.location_transition_requests
  for select
  to presence_maintenance_owner
  using (true);

create policy pmo_location_transition_requests_delete
  on public.location_transition_requests
  for delete
  to presence_maintenance_owner
  using (true);

-- Under RLS, SELECT ... FOR UPDATE row locks require the row to pass an UPDATE
-- policy's USING clause. WITH CHECK (false) still forbids rewriting any row, so
-- stored idempotency results stay immutable to the maintenance owner.
create policy pmo_location_transition_requests_lock
  on public.location_transition_requests
  for update
  to presence_maintenance_owner
  using (true)
  with check (false);

-- users.initial_placement_completed_at add + backfill already shipped in
-- 20260710120000_presence_revisions_and_placement.sql (WHERE IS NULL guard) — no-op here.

-- knock_requests schema hardening (columns, NOT NULL, state CHECK, indexes, expire
-- backfill) already shipped in 20260710121000_knock_requests_hardening.sql — no-op here.

grant presence_maintenance_owner to postgres;
grant create on schema public to presence_maintenance_owner;

create or replace function public.purge_presence_history()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_op timestamp with time zone := pg_catalog.clock_timestamp();
    v_retired_deleted integer;
    v_fences_confirmed integer;
    v_fences_deleted integer;
    v_transitions_deleted integer;
begin
    with batch as (
        select s.id
        from public.user_presence_sessions as s
        where s.retired_at is not null
          and coalesce(s.retired_at, s.expires_at) < v_op - interval '24 hours'
        order by s.id
        limit 1000
        for update skip locked
    ),
    deleted as (
        delete from public.user_presence_sessions as s
        using batch
        where s.id = batch.id
        returning s.id
    )
    select pg_catalog.count(*)::integer
    into v_retired_deleted
    from deleted;

    with batch as (
        select f.auth_session_id, f.user_id
        from public.revoked_presence_auth_sessions as f
        where f.auth_session_absence_confirmed_at is null
        order by f.auth_session_id
        limit 1000
        for update skip locked
    ),
    absent as (
        select b.auth_session_id
        from batch as b
        where private.presence_auth_session_absent(b.auth_session_id, b.user_id)
    ),
    confirmed as (
        update public.revoked_presence_auth_sessions as f
        set auth_session_absence_confirmed_at = v_op,
            purge_after = v_op + interval '1800 seconds' + interval '7 days'
        from absent
        where f.auth_session_id = absent.auth_session_id
        returning f.auth_session_id
    )
    select pg_catalog.count(*)::integer
    into v_fences_confirmed
    from confirmed;

    with batch as (
        select f.auth_session_id, f.user_id
        from public.revoked_presence_auth_sessions as f
        where f.auth_session_absence_confirmed_at is not null
          and f.purge_after <= v_op
        order by f.auth_session_id
        limit 1000
        for update skip locked
    ),
    absent as (
        select b.auth_session_id
        from batch as b
        where private.presence_auth_session_absent(b.auth_session_id, b.user_id)
    ),
    deleted as (
        delete from public.revoked_presence_auth_sessions as f
        using absent
        where f.auth_session_id = absent.auth_session_id
        returning f.auth_session_id
    )
    select pg_catalog.count(*)::integer
    into v_fences_deleted
    from deleted;

    with batch as (
        select r.user_id, r.transition_id
        from public.location_transition_requests as r
        where r.result is not null
          and r.created_at < v_op - interval '30 days'
          and (
            r.reason <> 'logout'
            or not exists (
              select 1
              from public.revoked_presence_auth_sessions as f
              where f.user_id = r.user_id
                and f.auth_session_id = r.auth_session_id
            )
          )
        order by r.user_id, r.transition_id
        limit 1000
        for update skip locked
    ),
    deleted as (
        delete from public.location_transition_requests as r
        using batch
        where r.user_id = batch.user_id
          and r.transition_id = batch.transition_id
        returning r.transition_id
    )
    select pg_catalog.count(*)::integer
    into v_transitions_deleted
    from deleted;

    return pg_catalog.jsonb_build_object(
        'retiredSessionsDeleted', v_retired_deleted,
        'fencesConfirmed', v_fences_confirmed,
        'fencesDeleted', v_fences_deleted,
        'transitionsDeleted', v_transitions_deleted
    );
end;
$$;

alter function public.purge_presence_history() owner to presence_maintenance_owner;
revoke all on function public.purge_presence_history() from public, anon, authenticated, service_role;
grant execute on function public.purge_presence_history() to postgres;

revoke create on schema public from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

do $$
declare
    j record;
begin
    for j in
        select jobid
        from cron.job
        where jobname = 'presence-purge-history-v1'
    loop
        perform cron.unschedule(j.jobid);
    end loop;
end $$;

select cron.schedule(
  'presence-purge-history-v1',
  '30 3 * * *',
  'select public.purge_presence_history();'
);
