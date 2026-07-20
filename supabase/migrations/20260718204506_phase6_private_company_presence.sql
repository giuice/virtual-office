-- Migration: phase6_private_company_presence
-- Purpose:   Authorize private company Presence and pin retained Postgres Changes publication members.
-- Author:    Giuliano Lemes   Date (UTC): 2026-07-18

begin;

do $$
declare
    v_table text;
begin
    if not exists (
        select 1
        from pg_catalog.pg_publication
        where pubname = 'supabase_realtime'
    ) then
        raise exception 'PHASE6_SUPABASE_REALTIME_PUBLICATION_MISSING';
    end if;

    foreach v_table in array array['users', 'spaces']
    loop
        if not exists (
            select 1
            from pg_catalog.pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = v_table
        ) then
            execute pg_catalog.format(
                'alter publication supabase_realtime add table only public.%I',
                v_table
            );
        end if;
    end loop;

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'knock_requests'
    ) then
        alter publication supabase_realtime drop table only public.knock_requests;
    end if;
end;
$$;

drop policy if exists phase6_company_presence_receive on realtime.messages;
create policy phase6_company_presence_receive
on realtime.messages
for select
to authenticated
using (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) =
        'company:' || private.current_presence_company_id()::text || ':presence'
    and private.is_presence_auth_session_unfenced()
);

-- A private channel join always probes Broadcast read authorization alongside
-- Presence read authorization. Permit only that synthetic/read path on the
-- exact company Presence topic; clients still receive no Broadcast INSERT grant.
drop policy if exists phase6_company_presence_channel_broadcast_receive
    on realtime.messages;
create policy phase6_company_presence_channel_broadcast_receive
on realtime.messages
for select
to authenticated
using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) =
        'company:' || private.current_presence_company_id()::text || ':presence'
    and private.is_presence_auth_session_unfenced()
);

drop policy if exists phase6_company_presence_track on realtime.messages;
create policy phase6_company_presence_track
on realtime.messages
for insert
to authenticated
with check (
    realtime.messages.extension = 'presence'
    and (select realtime.topic()) =
        'company:' || private.current_presence_company_id()::text || ':presence'
    and private.is_presence_auth_session_unfenced()
);

do $$
declare
    v_users_count integer;
    v_spaces_count integer;
    v_knock_count integer;
    v_presence_policy_count integer;
begin
    select
        pg_catalog.count(*) filter (where tablename = 'users'),
        pg_catalog.count(*) filter (where tablename = 'spaces'),
        pg_catalog.count(*) filter (where tablename = 'knock_requests')
    into v_users_count, v_spaces_count, v_knock_count
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('users', 'spaces', 'knock_requests');

    if v_users_count <> 1 or v_spaces_count <> 1 or v_knock_count <> 0 then
        raise exception
            'PHASE6_REALTIME_PUBLICATION_READBACK_FAILED users=% spaces=% knock=%',
            v_users_count,
            v_spaces_count,
            v_knock_count;
    end if;

    select pg_catalog.count(*)
    into v_presence_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
          'phase6_company_presence_channel_broadcast_receive',
          'phase6_company_presence_receive',
          'phase6_company_presence_track'
      );

    if v_presence_policy_count <> 3 then
        raise exception
            'PHASE6_REALTIME_POLICY_READBACK_FAILED count=%',
            v_presence_policy_count;
    end if;
end;
$$;

commit;
