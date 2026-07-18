-- Migration: phase4_knock_delivery_and_retention
-- Purpose:   Add private company-scoped Knock invalidation and scheduled expiry/retention.
-- Author:    Giuliano Lemes   Date (UTC): 2026-07-16

begin;

-- Realtime Authorization evaluates this helper with the authenticated request
-- claims. It returns NULL for missing or ambiguous app-user mappings.
grant presence_maintenance_owner to postgres;
grant create on schema public, private to presence_maintenance_owner;

create or replace function private.current_presence_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
    v_claims jsonb;
    v_sub text;
    v_company_ids uuid[];
begin
    begin
        v_claims := nullif(
            pg_catalog.current_setting('request.jwt.claims', true),
            ''
        )::jsonb;
    exception when invalid_text_representation then
        return null;
    end;

    v_sub := nullif(v_claims ->> 'sub', '');
    if v_sub is null then
        return null;
    end if;

    select pg_catalog.array_agg(u.company_id order by u.id)
    into v_company_ids
    from public.users as u
    where u.supabase_uid = v_sub;

    if pg_catalog.coalesce(pg_catalog.array_length(v_company_ids, 1), 0) <> 1 then
        return null;
    end if;

    return v_company_ids[1];
end;
$$;

alter function private.current_presence_company_id()
    owner to presence_maintenance_owner;
revoke all on function private.current_presence_company_id()
    from public, anon, authenticated, service_role;
grant execute on function private.current_presence_company_id()
    to authenticated, service_role;

-- Clients may only receive the minimal invalidation event for their own
-- company. They receive no INSERT policy and therefore cannot publish it.
drop policy if exists phase4_knock_broadcast_receive on realtime.messages;
create policy phase4_knock_broadcast_receive
on realtime.messages
for select
to authenticated
using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) =
        'company:' || private.current_presence_company_id()::text || ':knock'
    and private.is_presence_auth_session_unfenced()
);

-- The cleanup principal is non-login and can touch Knock rows only through the
-- fixed-search-path SECURITY DEFINER wrapper below.
grant select (id, status, consumed_at, expires_at, updated_at),
      update (status, updated_at),
      delete
on public.knock_requests
to presence_maintenance_owner;

drop policy if exists presence_maintenance_owner_knock_select
    on public.knock_requests;
create policy presence_maintenance_owner_knock_select
on public.knock_requests
for select
to presence_maintenance_owner
using (true);

drop policy if exists presence_maintenance_owner_knock_update
    on public.knock_requests;
create policy presence_maintenance_owner_knock_update
on public.knock_requests
for update
to presence_maintenance_owner
using (true)
with check (true);

drop policy if exists presence_maintenance_owner_knock_delete
    on public.knock_requests;
create policy presence_maintenance_owner_knock_delete
on public.knock_requests
for delete
to presence_maintenance_owner
using (true);

-- The scheduled worker scans across all spaces. The earlier request-path
-- indexes lead with requester/space and cannot efficiently serve these two
-- bounded global queues.
create index if not exists knock_requests_live_expiry_idx
    on public.knock_requests (expires_at, id)
    where status in ('pending', 'approved') and consumed_at is null;

create index if not exists knock_requests_terminal_retention_idx
    on public.knock_requests (updated_at, id)
    where status in ('expired', 'denied', 'consumed');

create or replace function public.expire_knock_requests()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_operation_time timestamptz := pg_catalog.clock_timestamp();
    v_expired_count integer := 0;
    v_deleted_count integer := 0;
begin
    with expirable as materialized (
        select kr.id
        from public.knock_requests as kr
        where kr.status in ('pending', 'approved')
          and kr.consumed_at is null
          and kr.expires_at <= v_operation_time
        order by kr.expires_at, kr.id
        for update skip locked
        limit 1000
    )
    update public.knock_requests as kr
    set status = 'expired',
        updated_at = v_operation_time
    from expirable
    where kr.id = expirable.id;

    get diagnostics v_expired_count = row_count;

    with purgeable as materialized (
        select kr.id
        from public.knock_requests as kr
        where kr.status in ('expired', 'denied', 'consumed')
          and kr.updated_at <= v_operation_time - interval '30 days'
        order by kr.updated_at, kr.id
        for update skip locked
        limit 1000
    )
    delete from public.knock_requests as kr
    using purgeable
    where kr.id = purgeable.id;

    get diagnostics v_deleted_count = row_count;
    return v_expired_count + v_deleted_count;
end;
$$;

alter function public.expire_knock_requests()
    owner to presence_maintenance_owner;
revoke all on function public.expire_knock_requests()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.expire_knock_requests() to postgres;

do $$
declare
    v_job record;
begin
    for v_job in
        select jobid
        from cron.job
        where jobname = 'presence-expire-knocks-v1'
    loop
        perform cron.unschedule(v_job.jobid);
    end loop;
end;
$$;

select cron.schedule(
    'presence-expire-knocks-v1',
    '* * * * *',
    'select public.expire_knock_requests();'
);

revoke create on schema public, private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

commit;
