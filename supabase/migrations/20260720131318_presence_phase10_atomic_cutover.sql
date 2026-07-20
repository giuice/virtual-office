-- Migration: presence_phase10_atomic_cutover
-- Purpose:   Align the Realtime company helper and enforce one open Presence log per user.
-- Author:    Giuliano Lemes   Date (UTC): 2026-07-20

begin;

-- The Phase 4 migration was applied to the shared test project before its
-- invalid pg_catalog.coalesce qualification was corrected locally. Replace the
-- helper through its existing narrow owner boundary so private Realtime joins
-- execute on every previously migrated target.
grant presence_maintenance_owner to postgres;
grant create on schema private to presence_maintenance_owner;

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

    if coalesce(pg_catalog.array_length(v_company_ids, 1), 0) <> 1 then
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

-- Phase 10 runs the reviewed maintenance repair before this migration. The
-- unique index is the permanent database backstop; any remaining duplicate
-- aborts this migration instead of silently discarding history.
create unique index ux_space_presence_log_one_open_per_user
    on public.space_presence_log (user_id)
    where exited_at is null;

revoke create on schema private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

commit;
