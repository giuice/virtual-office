-- Migration: phase6_presence_legacy_cutover_audit
-- Purpose:   Install immutable aggregate evidence for the legacy presence-writer cutover.
-- Date (UTC): 2026-07-18

begin;

do $$
declare
    v_role pg_catalog.pg_roles%rowtype;
begin
    select *
    into v_role
    from pg_catalog.pg_roles
    where rolname = 'presence_maintenance_owner';

    if not found then
        raise exception 'presence_maintenance_owner must be installed before the Phase 6 audit';
    end if;

    if v_role.rolcanlogin
       or v_role.rolinherit
       or v_role.rolbypassrls
       or v_role.rolsuper
       or v_role.rolcreaterole
       or v_role.rolcreatedb
       or v_role.rolreplication then
        raise exception 'presence_maintenance_owner has unexpected attributes';
    end if;
end;
$$;

-- Ownership transfers need transient membership/CREATE. Both are removed at
-- the end of the migration so the maintenance owner remains a NOLOGIN island.
grant presence_maintenance_owner to postgres;
grant usage on schema public, private to presence_maintenance_owner;
grant create on schema public, private to presence_maintenance_owner;

create table private.presence_legacy_user_write_audit (
    event_day date not null,
    field_group text not null,
    call_count bigint not null default 0,
    primary key (event_day, field_group),
    constraint presence_legacy_user_write_audit_group_check check (
        field_group in (
            'current_space_id',
            'status',
            'last_active',
            'any_authenticated_users_update'
        )
    ),
    constraint presence_legacy_user_write_audit_count_check check (call_count >= 0)
);

create table private.presence_legacy_route_call_audit (
    event_day date not null,
    route_group text not null,
    call_count bigint not null default 0,
    primary key (event_day, route_group),
    constraint presence_legacy_route_call_audit_group_check check (
        route_group in ('users-location', 'users-offline-status')
    ),
    constraint presence_legacy_route_call_audit_count_check check (call_count >= 0)
);

create table private.presence_legacy_cutover_audit_meta (
    singleton_id boolean primary key default true,
    installed_at timestamptz not null default pg_catalog.clock_timestamp(),
    observation_started_at timestamptz,
    expected_schema_fingerprint text,
    disabled_at timestamptz,
    constraint presence_legacy_cutover_audit_meta_singleton check (singleton_id),
    constraint presence_legacy_cutover_audit_meta_start_pair check (
        (observation_started_at is null) = (expected_schema_fingerprint is null)
    ),
    constraint presence_legacy_cutover_audit_meta_fingerprint_check check (
        expected_schema_fingerprint is null
        or expected_schema_fingerprint ~ '^[0-9a-f]{32}$'
    ),
    constraint presence_legacy_cutover_audit_meta_disable_check check (
        disabled_at is null or observation_started_at is not null
    )
);

create table private.presence_legacy_cutover_audit_coverage (
    coverage_hour timestamptz primary key,
    checked_at timestamptz not null,
    schema_fingerprint text not null,
    healthy boolean not null,
    constraint presence_legacy_cutover_audit_coverage_hour_check check (
        coverage_hour = date_trunc('hour', coverage_hour)
    ),
    constraint presence_legacy_cutover_audit_coverage_fingerprint_check check (
        schema_fingerprint ~ '^[0-9a-f]{32}$'
    )
);

insert into private.presence_legacy_cutover_audit_meta (singleton_id)
values (true);

alter table private.presence_legacy_user_write_audit enable row level security;
alter table private.presence_legacy_user_write_audit force row level security;
alter table private.presence_legacy_route_call_audit enable row level security;
alter table private.presence_legacy_route_call_audit force row level security;
alter table private.presence_legacy_cutover_audit_meta enable row level security;
alter table private.presence_legacy_cutover_audit_meta force row level security;
alter table private.presence_legacy_cutover_audit_coverage enable row level security;
alter table private.presence_legacy_cutover_audit_coverage force row level security;

revoke all on table private.presence_legacy_user_write_audit
    from public, anon, authenticated, service_role;
revoke all on table private.presence_legacy_route_call_audit
    from public, anon, authenticated, service_role;
revoke all on table private.presence_legacy_cutover_audit_meta
    from public, anon, authenticated, service_role;
revoke all on table private.presence_legacy_cutover_audit_coverage
    from public, anon, authenticated, service_role;

grant select, insert, update on table private.presence_legacy_user_write_audit
    to presence_maintenance_owner;
grant select, insert, update on table private.presence_legacy_route_call_audit
    to presence_maintenance_owner;
grant select, update on table private.presence_legacy_cutover_audit_meta
    to presence_maintenance_owner;
grant select, insert on table private.presence_legacy_cutover_audit_coverage
    to presence_maintenance_owner;

create policy pmo_presence_legacy_user_write_audit_select
    on private.presence_legacy_user_write_audit
    for select to presence_maintenance_owner using (true);
create policy pmo_presence_legacy_user_write_audit_insert
    on private.presence_legacy_user_write_audit
    for insert to presence_maintenance_owner with check (true);
create policy pmo_presence_legacy_user_write_audit_update
    on private.presence_legacy_user_write_audit
    for update to presence_maintenance_owner using (true) with check (true);

create policy pmo_presence_legacy_route_call_audit_select
    on private.presence_legacy_route_call_audit
    for select to presence_maintenance_owner using (true);
create policy pmo_presence_legacy_route_call_audit_insert
    on private.presence_legacy_route_call_audit
    for insert to presence_maintenance_owner with check (true);
create policy pmo_presence_legacy_route_call_audit_update
    on private.presence_legacy_route_call_audit
    for update to presence_maintenance_owner using (true) with check (true);

create policy pmo_presence_legacy_cutover_audit_meta_select
    on private.presence_legacy_cutover_audit_meta
    for select to presence_maintenance_owner using (true);
create policy pmo_presence_legacy_cutover_audit_meta_update
    on private.presence_legacy_cutover_audit_meta
    for update to presence_maintenance_owner using (true) with check (true);

create policy pmo_presence_legacy_cutover_audit_coverage_select
    on private.presence_legacy_cutover_audit_coverage
    for select to presence_maintenance_owner using (true);
create policy pmo_presence_legacy_cutover_audit_coverage_insert
    on private.presence_legacy_cutover_audit_coverage
    for insert to presence_maintenance_owner with check (true);

alter table private.presence_legacy_user_write_audit owner to presence_maintenance_owner;
alter table private.presence_legacy_route_call_audit owner to presence_maintenance_owner;
alter table private.presence_legacy_cutover_audit_meta owner to presence_maintenance_owner;
alter table private.presence_legacy_cutover_audit_coverage owner to presence_maintenance_owner;

create or replace function private.enforce_presence_legacy_cutover_meta_immutability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_marker text;
begin
    if tg_op = 'DELETE' then
        raise exception 'PRESENCE_LEGACY_CUTOVER_META_IMMUTABLE' using errcode = 'P0001';
    end if;

    v_marker := nullif(pg_catalog.current_setting('app.presence_cutover_audit_meta_writer', true), '');

    if v_marker = 'audit-start'
       and old.singleton_id
       and new.singleton_id
       and new.installed_at is not distinct from old.installed_at
       and old.observation_started_at is null
       and old.expected_schema_fingerprint is null
       and old.disabled_at is null
       and new.observation_started_at is not null
       and new.expected_schema_fingerprint is not null
       and new.disabled_at is null then
        return new;
    end if;

    -- Reserved exclusively for the later reviewed removal migration.
    if v_marker = 'audit-disable'
       and old.singleton_id
       and new.singleton_id
       and new.installed_at is not distinct from old.installed_at
       and new.observation_started_at is not distinct from old.observation_started_at
       and new.expected_schema_fingerprint is not distinct from old.expected_schema_fingerprint
       and old.disabled_at is null
       and new.disabled_at is not null then
        return new;
    end if;

    raise exception 'PRESENCE_LEGACY_CUTOVER_META_IMMUTABLE' using errcode = 'P0001';
end;
$$;

alter function private.enforce_presence_legacy_cutover_meta_immutability()
    owner to presence_maintenance_owner;

create trigger presence_audit_meta_immutable
    before update or delete on private.presence_legacy_cutover_audit_meta
    for each row
    execute function private.enforce_presence_legacy_cutover_meta_immutability();

revoke all on function private.enforce_presence_legacy_cutover_meta_immutability()
    from public, anon, authenticated, service_role, presence_maintenance_owner;

create or replace function private.audit_legacy_user_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_claims jsonb;
    v_role text;
    v_marker text;
    v_event_day date;
    v_field_group text;
begin
    if tg_nargs <> 1 then
        raise exception 'PRESENCE_AUDIT_TRIGGER_ARGUMENT_INVALID' using errcode = 'P0001';
    end if;

    v_field_group := tg_argv[0];
    if v_field_group not in (
        'current_space_id',
        'status',
        'last_active',
        'any_authenticated_users_update'
    ) then
        raise exception 'PRESENCE_AUDIT_FIELD_GROUP_INVALID' using errcode = 'P0001';
    end if;

    begin
        v_claims := nullif(
            pg_catalog.current_setting('request.jwt.claims', true),
            ''
        )::jsonb;
        v_role := v_claims ->> 'role';
    exception when others then
        v_role := null;
    end;

    v_marker := nullif(pg_catalog.current_setting('app.presence_internal_writer', true), '');

    if v_marker is not null
       and v_marker not in (
           'atomic-transition',
           'atomic-reconciliation',
           'maintenance-repair',
           'audit-maintenance-backfill'
       ) then
        raise exception 'PRESENCE_AUDIT_INTERNAL_WRITER_INVALID' using errcode = 'P0001';
    end if;

    if v_role = 'authenticated' then
        if v_marker is not null then
            raise exception 'PRESENCE_AUDIT_INTERNAL_WRITER_FORBIDDEN' using errcode = 'P0001';
        end if;

        v_event_day := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
        insert into private.presence_legacy_user_write_audit as audit_row (
            event_day,
            field_group,
            call_count
        )
        values (v_event_day, v_field_group, 1)
        on conflict (event_day, field_group)
        do update set call_count = audit_row.call_count + 1;

        return null;
    end if;

    if v_role = 'service_role' then
        return null;
    end if;

    if v_marker is not null then
        return null;
    end if;

    raise exception 'PRESENCE_AUDIT_ROLE_UNVERIFIED' using errcode = 'P0001';
end;
$$;

alter function private.audit_legacy_user_write() owner to presence_maintenance_owner;

create trigger presence_audit_users_current_space_id
    after update of current_space_id on public.users
    for each statement
    execute function private.audit_legacy_user_write('current_space_id');

create trigger presence_audit_users_status
    after update of status on public.users
    for each statement
    execute function private.audit_legacy_user_write('status');

create trigger presence_audit_users_last_active
    after update of last_active on public.users
    for each statement
    execute function private.audit_legacy_user_write('last_active');

create trigger presence_audit_users_any_authenticated_update
    after update on public.users
    for each statement
    execute function private.audit_legacy_user_write('any_authenticated_users_update');

revoke all on function private.audit_legacy_user_write()
    from public, anon, authenticated, service_role, presence_maintenance_owner;

create or replace function public.record_legacy_presence_route_call(p_route_group text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_event_day date;
begin
    if p_route_group is null
       or p_route_group not in ('users-location', 'users-offline-status') then
        raise exception 'PRESENCE_LEGACY_ROUTE_GROUP_INVALID' using errcode = 'P0001';
    end if;

    v_event_day := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
    insert into private.presence_legacy_route_call_audit as audit_row (
        event_day,
        route_group,
        call_count
    )
    values (v_event_day, p_route_group, 1)
    on conflict (event_day, route_group)
    do update set call_count = audit_row.call_count + 1;
end;
$$;

alter function public.record_legacy_presence_route_call(text)
    owner to presence_maintenance_owner;
revoke all on function public.record_legacy_presence_route_call(text)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.record_legacy_presence_route_call(text) to service_role;

-- pg_cron protects cron.job with username-based RLS. This fixed-query bridge is
-- the same narrow platform adaptation used for auth.sessions elsewhere: it is
-- postgres-owned, returns only this job's non-secret catalog fields, and is
-- callable only by the NOLOGIN maintenance owner.
create or replace function private.read_presence_cutover_audit_cron_job()
returns table (
    jobname text,
    schedule text,
    command text,
    database text,
    username text,
    active boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
select
    j.jobname::text,
    j.schedule::text,
    j.command::text,
    j.database::text,
    j.username::text,
    j.active
from cron.job as j
where j.jobname = 'presence-audit-legacy-cutover-v1';
$$;

alter function private.read_presence_cutover_audit_cron_job() owner to postgres;
revoke all on function private.read_presence_cutover_audit_cron_job()
    from public, anon, authenticated, service_role, postgres;
grant execute on function private.read_presence_cutover_audit_cron_job()
    to presence_maintenance_owner;

-- The sole checksum implementation. Every field is length-prefixed before the
-- sorted rows are concatenated, preventing ambiguous catalog serializations.
create or replace function private.compute_presence_cutover_audit_fingerprint()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
with audit_tables(table_name) as (
    values
        ('presence_legacy_user_write_audit'::text),
        ('presence_legacy_route_call_audit'::text),
        ('presence_legacy_cutover_audit_meta'::text),
        ('presence_legacy_cutover_audit_coverage'::text)
),
table_rows as (
    select
        'table'::text as object_kind,
        n.nspname::text as schema_name,
        c.relname::text as identity,
        pg_catalog.jsonb_build_object(
            'columns', (
                select pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                        'number', a.attnum,
                        'name', a.attname,
                        'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
                        'not_null', a.attnotnull,
                        'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
                    ) order by a.attnum
                )
                from pg_catalog.pg_attribute as a
                left join pg_catalog.pg_attrdef as d
                  on d.adrelid = a.attrelid and d.adnum = a.attnum
                where a.attrelid = c.oid
                  and a.attnum > 0
                  and not a.attisdropped
            ),
            'constraints', (
                select pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                        'name', con.conname,
                        'type', con.contype,
                        'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
                    ) order by con.conname
                )
                from pg_catalog.pg_constraint as con
                where con.conrelid = c.oid
            )
        )::text as definition,
        pg_catalog.pg_get_userbyid(c.relowner)::text as owner_name,
        null::text as security_definer,
        null::text as config,
        (
            select coalesce(
                pg_catalog.string_agg(acl_item::text, E'\n' order by acl_item::text),
                ''
            )
            from pg_catalog.unnest(
                coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
            ) as acl_item
        )::text as acl,
        pg_catalog.format('rls=%s;force_rls=%s', c.relrowsecurity, c.relforcerowsecurity)::text as state
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and (
        (
          n.nspname = 'private'
          and c.relname in (
            'presence_legacy_user_write_audit',
            'presence_legacy_route_call_audit',
            'presence_legacy_cutover_audit_meta',
            'presence_legacy_cutover_audit_coverage'
          )
        )
        or (n.nspname = 'public' and c.relname = 'platform_admins')
      )
),
audit_function_names(schema_name, function_name) as (
    values
        ('private'::text, 'enforce_presence_legacy_cutover_meta_immutability'::text),
        ('private'::text, 'audit_legacy_user_write'::text),
        ('private'::text, 'compute_presence_cutover_audit_fingerprint'::text),
        ('private'::text, 'is_presence_cutover_audit_catalog_healthy'::text),
        ('private'::text, 'start_presence_legacy_cutover_audit'::text),
        ('private'::text, 'record_presence_legacy_cutover_audit_coverage'::text),
        ('private'::text, 'assert_presence_legacy_cutover_gate'::text),
        ('private'::text, 'assert_presence_legacy_adapter_removal_gate'::text),
        ('private'::text, 'backfill_presence_availability_status'::text),
        ('private'::text, 'read_presence_cutover_audit_cron_job'::text),
        ('private'::text, 'reject_direct_service_role_membership_write'::text),
        ('public'::text, 'transition_user_location'::text),
        ('public'::text, 'repair_presence_logs_for_cutover'::text),
        ('public'::text, 'reconcile_stale_presence_placements'::text),
        ('public'::text, 'record_legacy_presence_route_call'::text),
        ('public'::text, 'disable_legacy_presence_adapter'::text),
        ('public'::text, 'register_presence_session'::text),
        ('public'::text, 'remove_company_member_and_presence'::text),
        ('public'::text, 'update_company_member_role'::text),
        ('public'::text, 'accept_company_invitation_membership'::text),
        ('public'::text, 'create_company_for_user'::text),
        ('public'::text, 'create_company_invitation'::text),
        ('public'::text, 'create_company_with_initial_admin_invitation'::text)
),
function_rows as (
    select
        'function'::text as object_kind,
        n.nspname::text as schema_name,
        (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text as identity,
        pg_catalog.pg_get_functiondef(p.oid)::text as definition,
        pg_catalog.pg_get_userbyid(p.proowner)::text as owner_name,
        p.prosecdef::text as security_definer,
        (
            select coalesce(
                pg_catalog.string_agg(setting, E'\n' order by setting),
                ''
            )
            from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as setting
        )::text as config,
        (
            select coalesce(
                pg_catalog.string_agg(acl_item::text, E'\n' order by acl_item::text),
                ''
            )
            from pg_catalog.unnest(
                coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
            ) as acl_item
        )::text as acl,
        pg_catalog.format('volatile=%s;parallel=%s;strict=%s', p.provolatile, p.proparallel, p.proisstrict)::text as state
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    join audit_function_names as wanted
      on wanted.schema_name = n.nspname and wanted.function_name = p.proname
),
policy_rows as (
    select
        'policy'::text as object_kind,
        n.nspname::text as schema_name,
        (c.relname || '.' || pol.polname)::text as identity,
        pg_catalog.format(
            'command=%s;permissive=%s;roles=%s;using=%s;check=%s',
            pol.polcmd,
            pol.polpermissive,
            (
                select coalesce(
                    pg_catalog.string_agg(coalesce(r.rolname, 'PUBLIC'), ',' order by coalesce(r.rolname, 'PUBLIC')),
                    ''
                )
                from pg_catalog.unnest(pol.polroles) as role_oid
                left join pg_catalog.pg_roles as r on r.oid = role_oid
            ),
            pg_catalog.pg_get_expr(pol.polqual, pol.polrelid),
            pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)
        )::text as definition,
        null::text as owner_name,
        null::text as security_definer,
        null::text as config,
        null::text as acl,
        null::text as state
    from pg_catalog.pg_policy as pol
    join pg_catalog.pg_class as c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where (
        n.nspname = 'private'
        and c.relname in (
            'presence_legacy_user_write_audit',
            'presence_legacy_route_call_audit',
            'presence_legacy_cutover_audit_meta',
            'presence_legacy_cutover_audit_coverage'
        )
    ) or (
        n.nspname = 'public'
        and c.relname = 'platform_admins'
    )
),
trigger_rows as (
    select
        'trigger'::text as object_kind,
        n.nspname::text as schema_name,
        (c.relname || '.' || t.tgname)::text as identity,
        pg_catalog.pg_get_triggerdef(t.oid, true)::text as definition,
        pg_catalog.pg_get_userbyid(p.proowner)::text as owner_name,
        p.prosecdef::text as security_definer,
        (
            select coalesce(
                pg_catalog.string_agg(setting, E'\n' order by setting),
                ''
            )
            from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as setting
        )::text as config,
        null::text as acl,
        t.tgenabled::text as state
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    join pg_catalog.pg_proc as p on p.oid = t.tgfoid
    where not t.tgisinternal
      and (
          (n.nspname = 'private' and c.relname in (
              'presence_legacy_user_write_audit',
              'presence_legacy_route_call_audit',
              'presence_legacy_cutover_audit_meta',
              'presence_legacy_cutover_audit_coverage'
          ))
          or (n.nspname = 'public' and t.tgname like 'presence_audit_users_%')
          or (n.nspname = 'public' and t.tgname in (
              'presence_block_service_role_invitation_insert',
              'presence_block_service_role_membership_update'
          ))
      )
),
cron_rows as (
    select
        'cron'::text as object_kind,
        'cron'::text as schema_name,
        j.jobname::text as identity,
        pg_catalog.format('schedule=%s;command=%s;database=%s', j.schedule, j.command, j.database)::text as definition,
        j.username::text as owner_name,
        null::text as security_definer,
        null::text as config,
        null::text as acl,
        ('active=' || j.active::text)::text as state
    from private.read_presence_cutover_audit_cron_job() as j
),
role_rows as (
    select
        'role'::text as object_kind,
        'pg_catalog'::text as schema_name,
        r.rolname::text as identity,
        pg_catalog.format(
            'login=%s;inherit=%s;super=%s;createrole=%s;createdb=%s;replication=%s;bypassrls=%s',
            r.rolcanlogin,
            r.rolinherit,
            r.rolsuper,
            r.rolcreaterole,
            r.rolcreatedb,
            r.rolreplication,
            r.rolbypassrls
        )::text as definition,
        null::text as owner_name,
        null::text as security_definer,
        null::text as config,
        (
            select coalesce(
                pg_catalog.string_agg(membership_description, E'\n' order by membership_description),
                ''
            )
            from (
                select 'member_of:' || parent.rolname as membership_description
                from pg_catalog.pg_auth_members as membership
                join pg_catalog.pg_roles as parent on parent.oid = membership.roleid
                where membership.member = r.oid
                union all
                select 'member:' || child.rolname as membership_description
                from pg_catalog.pg_auth_members as membership
                join pg_catalog.pg_roles as child on child.oid = membership.member
                where membership.roleid = r.oid
            ) as memberships
        )::text as acl,
        null::text as state
    from pg_catalog.pg_roles as r
    where r.rolname = 'presence_maintenance_owner'
),
catalog_rows as (
    select * from table_rows
    union all select * from function_rows
    union all select * from policy_rows
    union all select * from trigger_rows
    union all select * from cron_rows
    union all select * from role_rows
),
encoded_rows as (
    select
        object_kind,
        schema_name,
        identity,
        pg_catalog.concat(
            pg_catalog.octet_length(object_kind), ':', object_kind,
            pg_catalog.octet_length(schema_name), ':', schema_name,
            pg_catalog.octet_length(identity), ':', identity,
            case when definition is null then '-1:' else pg_catalog.octet_length(definition)::text || ':' || definition end,
            case when owner_name is null then '-1:' else pg_catalog.octet_length(owner_name)::text || ':' || owner_name end,
            case when security_definer is null then '-1:' else pg_catalog.octet_length(security_definer)::text || ':' || security_definer end,
            case when config is null then '-1:' else pg_catalog.octet_length(config)::text || ':' || config end,
            case when acl is null then '-1:' else pg_catalog.octet_length(acl)::text || ':' || acl end,
            case when state is null then '-1:' else pg_catalog.octet_length(state)::text || ':' || state end
        ) as encoded
    from catalog_rows
)
select pg_catalog.lower(
    pg_catalog.md5(
        coalesce(
            pg_catalog.string_agg(encoded, '' order by object_kind, schema_name, identity),
            ''
        )
    )
)
from encoded_rows;
$$;

alter function private.compute_presence_cutover_audit_fingerprint()
    owner to presence_maintenance_owner;
revoke all on function private.compute_presence_cutover_audit_fingerprint()
    from public, anon, authenticated, service_role;
grant execute on function private.compute_presence_cutover_audit_fingerprint()
    to presence_maintenance_owner, postgres;

create or replace function private.is_presence_cutover_audit_catalog_healthy(
    p_expected_fingerprint text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
    v_tables integer;
    v_functions integer;
    v_policies integer;
    v_triggers integer;
    v_cron integer;
    v_current_fingerprint text;
begin
    select count(*)::integer
    into v_tables
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in (
          'presence_legacy_user_write_audit',
          'presence_legacy_route_call_audit',
          'presence_legacy_cutover_audit_meta',
          'presence_legacy_cutover_audit_coverage'
      )
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relforcerowsecurity
      and pg_catalog.pg_get_userbyid(c.relowner) = 'presence_maintenance_owner';

    if v_tables <> 4 then
        return false;
    end if;

    if exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as role_row
          on role_row.oid in (membership.roleid, membership.member)
        where role_row.rolname = 'presence_maintenance_owner'
    ) then
        return false;
    end if;

    if pg_catalog.has_schema_privilege(
           'presence_maintenance_owner', 'public', 'CREATE'
       )
       or pg_catalog.has_schema_privilege(
           'presence_maintenance_owner', 'private', 'CREATE'
       ) then
        return false;
    end if;

    select count(*)::integer
    into v_functions
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
        ('private', 'enforce_presence_legacy_cutover_meta_immutability'),
        ('private', 'audit_legacy_user_write'),
        ('private', 'compute_presence_cutover_audit_fingerprint'),
        ('private', 'is_presence_cutover_audit_catalog_healthy'),
        ('private', 'start_presence_legacy_cutover_audit'),
        ('private', 'record_presence_legacy_cutover_audit_coverage'),
        ('private', 'assert_presence_legacy_cutover_gate'),
        ('private', 'assert_presence_legacy_adapter_removal_gate'),
        ('private', 'backfill_presence_availability_status'),
        ('public', 'repair_presence_logs_for_cutover'),
        ('public', 'reconcile_stale_presence_placements'),
        ('public', 'record_legacy_presence_route_call'),
        ('public', 'disable_legacy_presence_adapter'),
        ('public', 'register_presence_session'),
        ('public', 'remove_company_member_and_presence'),
        ('public', 'update_company_member_role'),
        ('public', 'accept_company_invitation_membership'),
        ('public', 'create_company_for_user'),
        ('public', 'create_company_invitation'),
        ('public', 'create_company_with_initial_admin_invitation')
    )
      and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
      and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog']::text[];

    if v_functions <> 20 then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'platform_admins'
          and relation.relkind = 'r'
          and relation.relrowsecurity
          and not relation.relforcerowsecurity
          and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
    ) then
        return false;
    end if;

    -- The main transition intentionally remains SECURITY INVOKER under the
    -- postgres owner; service_role supplies the narrow table/function rights.
    -- Do not accidentally "harden" it into a broad definer boundary.
    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'public.transition_user_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and not p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'public.register_presence_session(uuid,uuid,uuid,uuid)'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege(
              'presence_maintenance_owner', p.oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 'postgres'::pg_catalog.regrole::oid
                and privilege.privilege_type = 'EXECUTE'
          )
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'private.assert_presence_legacy_cutover_gate()'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege(
              'presence_maintenance_owner', p.oid, 'EXECUTE'
          )
          and pg_catalog.has_function_privilege('postgres', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'public.disable_legacy_presence_adapter(uuid)'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('postgres', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    )
       or not exists (
           select 1
           from pg_catalog.pg_proc as p
           where p.oid = pg_catalog.to_regprocedure(
                     'private.assert_presence_legacy_adapter_removal_gate()'
                 )
             and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
             and p.prosecdef
             and p.proconfig = array['search_path=pg_catalog']::text[]
             and pg_catalog.has_function_privilege('postgres', p.oid, 'EXECUTE')
             and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
             and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
             and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
             and not exists (
                 select 1
                 from pg_catalog.aclexplode(
                     coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
                 ) as privilege
                 where privilege.grantee = 0
                   and privilege.privilege_type = 'EXECUTE'
             )
       ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'read_presence_cutover_audit_cron_job'
          and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
    ) then
        return false;
    end if;

    select count(*)::integer
    into v_policies
    from pg_catalog.pg_policy as pol
    join pg_catalog.pg_class as c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in (
          'presence_legacy_user_write_audit',
          'presence_legacy_route_call_audit',
          'presence_legacy_cutover_audit_meta',
          'presence_legacy_cutover_audit_coverage'
      )
      and pol.polname like 'pmo_presence_legacy_%';

    if v_policies <> 10 then
        return false;
    end if;

    -- The platform-admin tenant creator locks the authorization row. Keep the
    -- isolated owner on the smallest ACL and exact pair of RLS policies needed
    -- for SELECT ... FOR UPDATE; catalog drift must invalidate the evidence.
    if (
        select pg_catalog.count(*)
        from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = 'public.platform_admins'::pg_catalog.regclass
          and attribute.attnum > 0
          and not attribute.attisdropped
          and pg_catalog.has_column_privilege(
              'presence_maintenance_owner',
              attribute.attrelid,
              attribute.attname,
              'SELECT'
          )
    ) <> 2
       or not pg_catalog.has_column_privilege(
           'presence_maintenance_owner',
           'public.platform_admins',
           'user_id',
           'UPDATE'
       )
       or (
           select pg_catalog.count(*)
           from pg_catalog.pg_attribute as attribute
           where attribute.attrelid = 'public.platform_admins'::pg_catalog.regclass
             and attribute.attnum > 0
             and not attribute.attisdropped
             and pg_catalog.has_column_privilege(
                 'presence_maintenance_owner',
                 attribute.attrelid,
                 attribute.attname,
                 'UPDATE'
             )
       ) <> 1
       or (
           select pg_catalog.count(*)
           from pg_catalog.pg_policy as policy
           where policy.polrelid = 'public.platform_admins'::pg_catalog.regclass
             and policy.polname in (
                 'presence_maintenance_owner_platform_admins_select',
                 'presence_maintenance_owner_platform_admins_update'
             )
             and policy.polroles = array[
                 'presence_maintenance_owner'::pg_catalog.regrole::oid
             ]
             and policy.polpermissive
             and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) = 'true'
             and (
                 (
                     policy.polname = 'presence_maintenance_owner_platform_admins_select'
                     and policy.polcmd = 'r'
                     and policy.polwithcheck is null
                 )
                 or (
                     policy.polname = 'presence_maintenance_owner_platform_admins_update'
                     and policy.polcmd = 'w'
                     and pg_catalog.pg_get_expr(
                         policy.polwithcheck,
                         policy.polrelid
                     ) = 'true'
                 )
             )
       ) <> 2 then
        return false;
    end if;

    select count(*)::integer
    into v_triggers
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where not t.tgisinternal
      and t.tgenabled = 'O'
      and (
          (n.nspname = 'public' and c.relname = 'users' and t.tgname in (
              'presence_audit_users_current_space_id',
              'presence_audit_users_status',
              'presence_audit_users_last_active',
              'presence_audit_users_any_authenticated_update',
              'presence_block_service_role_membership_update'
          ))
          or (
              n.nspname = 'public'
              and c.relname = 'invitations'
              and t.tgname = 'presence_block_service_role_invitation_insert'
          )
          or (
              n.nspname = 'private'
              and c.relname = 'presence_legacy_cutover_audit_meta'
              and t.tgname = 'presence_audit_meta_immutable'
          )
      );

    if v_triggers <> 7 then
        return false;
    end if;

    if pg_catalog.has_table_privilege('anon', 'private.presence_legacy_user_write_audit', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_user_write_audit', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_user_write_audit', 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'private.presence_legacy_route_call_audit', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_route_call_audit', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_route_call_audit', 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'private.presence_legacy_cutover_audit_meta', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_cutover_audit_meta', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_cutover_audit_meta', 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'private.presence_legacy_cutover_audit_coverage', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_cutover_audit_coverage', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_cutover_audit_coverage', 'SELECT') then
        return false;
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        'public.record_legacy_presence_route_call(text)',
        'EXECUTE'
    )
       or pg_catalog.has_function_privilege(
           'authenticated',
           'public.record_legacy_presence_route_call(text)',
           'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
           'anon',
           'public.record_legacy_presence_route_call(text)',
           'EXECUTE'
       ) then
        return false;
    end if;

    select count(*)::integer
    into v_cron
    from private.read_presence_cutover_audit_cron_job() as j
    where j.jobname = 'presence-audit-legacy-cutover-v1'
      and j.schedule = '5 * * * *'
      and j.command = 'select private.record_presence_legacy_cutover_audit_coverage();'
      and j.username = 'postgres'
      and j.active;

    if v_cron <> 1 then
        return false;
    end if;

    if p_expected_fingerprint is not null then
        v_current_fingerprint := private.compute_presence_cutover_audit_fingerprint();
        if v_current_fingerprint is distinct from p_expected_fingerprint then
            return false;
        end if;
    end if;

    return true;
end;
$$;

alter function private.is_presence_cutover_audit_catalog_healthy(text)
    owner to presence_maintenance_owner;
revoke all on function private.is_presence_cutover_audit_catalog_healthy(text)
    from public, anon, authenticated, service_role;
grant execute on function private.is_presence_cutover_audit_catalog_healthy(text)
    to presence_maintenance_owner, postgres;

create or replace function private.start_presence_legacy_cutover_audit()
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_meta private.presence_legacy_cutover_audit_meta%rowtype;
    v_fingerprint text;
    v_started_at timestamptz;
begin
    select m.*
    into v_meta
    from private.presence_legacy_cutover_audit_meta as m
    where m.singleton_id
    for update;

    if not found then
        raise exception 'PRESENCE_LEGACY_CUTOVER_META_MISSING' using errcode = 'P0001';
    end if;

    if v_meta.observation_started_at is not null
       or v_meta.expected_schema_fingerprint is not null
       or v_meta.disabled_at is not null then
        raise exception 'PRESENCE_LEGACY_CUTOVER_AUDIT_ALREADY_STARTED' using errcode = 'P0001';
    end if;

    if not private.is_presence_cutover_audit_catalog_healthy(null) then
        raise exception 'PRESENCE_LEGACY_CUTOVER_CATALOG_UNHEALTHY' using errcode = 'P0001';
    end if;

    v_fingerprint := private.compute_presence_cutover_audit_fingerprint();
    v_started_at := pg_catalog.clock_timestamp();
    perform pg_catalog.set_config('app.presence_cutover_audit_meta_writer', 'audit-start', true);

    update private.presence_legacy_cutover_audit_meta as m
    set observation_started_at = v_started_at,
        expected_schema_fingerprint = v_fingerprint
    where m.singleton_id;

    return v_started_at;
end;
$$;

alter function private.start_presence_legacy_cutover_audit()
    owner to presence_maintenance_owner;
revoke all on function private.start_presence_legacy_cutover_audit()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function private.start_presence_legacy_cutover_audit() to postgres;

create or replace function private.record_presence_legacy_cutover_audit_coverage()
returns private.presence_legacy_cutover_audit_coverage
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_meta private.presence_legacy_cutover_audit_meta%rowtype;
    v_now timestamptz;
    v_hour timestamptz;
    v_fingerprint text;
    v_healthy boolean;
    v_result private.presence_legacy_cutover_audit_coverage%rowtype;
begin
    select m.*
    into v_meta
    from private.presence_legacy_cutover_audit_meta as m
    where m.singleton_id;

    if not found then
        raise exception 'PRESENCE_LEGACY_CUTOVER_META_MISSING' using errcode = 'P0001';
    end if;

    v_now := pg_catalog.clock_timestamp();
    v_hour := pg_catalog.date_trunc('hour', v_now);
    v_fingerprint := private.compute_presence_cutover_audit_fingerprint();
    v_healthy := v_meta.observation_started_at is not null
        and v_meta.disabled_at is null
        and v_meta.expected_schema_fingerprint is not null
        and private.is_presence_cutover_audit_catalog_healthy(v_meta.expected_schema_fingerprint);

    insert into private.presence_legacy_cutover_audit_coverage (
        coverage_hour,
        checked_at,
        schema_fingerprint,
        healthy
    )
    values (v_hour, v_now, v_fingerprint, v_healthy)
    on conflict (coverage_hour) do nothing;

    select c.*
    into v_result
    from private.presence_legacy_cutover_audit_coverage as c
    where c.coverage_hour = v_hour;

    return v_result;
end;
$$;

alter function private.record_presence_legacy_cutover_audit_coverage()
    owner to presence_maintenance_owner;
revoke all on function private.record_presence_legacy_cutover_audit_coverage()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function private.record_presence_legacy_cutover_audit_coverage() to postgres;

create or replace function private.assert_presence_legacy_cutover_gate()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_meta private.presence_legacy_cutover_audit_meta%rowtype;
    v_today date;
    v_first_day date;
    v_first_hour timestamptz;
    v_last_hour timestamptz;
    v_coverage_count integer;
    v_direct_count bigint;
    v_route_count bigint;
begin
    -- The caller owns/locks public.users. The isolated maintenance owner owns
    -- the FORCE-RLS audit tables, so acquire their SHARE locks inside this
    -- definer boundary on the same backend and transaction.
    lock table private.presence_legacy_user_write_audit in share mode;
    lock table private.presence_legacy_route_call_audit in share mode;

    if not exists (
        select 1
        from pg_catalog.pg_locks as l
        where l.pid = pg_catalog.pg_backend_pid()
          and l.locktype = 'relation'
          and l.relation = 'public.users'::pg_catalog.regclass
          and l.mode = 'AccessExclusiveLock'
          and l.granted
    )
       or not exists (
           select 1
           from pg_catalog.pg_locks as l
           where l.pid = pg_catalog.pg_backend_pid()
             and l.locktype = 'relation'
             and l.relation = 'private.presence_legacy_user_write_audit'::pg_catalog.regclass
             and l.mode in ('ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
             and l.granted
       )
       or not exists (
           select 1
           from pg_catalog.pg_locks as l
           where l.pid = pg_catalog.pg_backend_pid()
             and l.locktype = 'relation'
             and l.relation = 'private.presence_legacy_route_call_audit'::pg_catalog.regclass
             and l.mode in ('ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock')
             and l.granted
       ) then
        raise exception 'PRESENCE_LEGACY_CUTOVER_LOCKS_REQUIRED' using errcode = 'P0001';
    end if;

    select m.*
    into v_meta
    from private.presence_legacy_cutover_audit_meta as m
    where m.singleton_id;

    if not found then
        raise exception 'PRESENCE_LEGACY_CUTOVER_META_MISSING' using errcode = 'P0001';
    end if;

    v_today := (pg_catalog.transaction_timestamp() at time zone 'UTC')::date;
    v_first_day := v_today - 7;
    v_first_hour := v_first_day::timestamp at time zone 'UTC';
    v_last_hour := v_today::timestamp at time zone 'UTC' - interval '1 hour';

    if v_meta.installed_at > v_first_hour
       or v_meta.observation_started_at is null
       or v_meta.observation_started_at > v_first_hour
       or v_meta.disabled_at is not null
       or not private.is_presence_cutover_audit_catalog_healthy(v_meta.expected_schema_fingerprint) then
        raise exception 'PRESENCE_LEGACY_CUTOVER_GATE_FAILED' using errcode = 'P0001';
    end if;

    select count(*)::integer
    into v_coverage_count
    from private.presence_legacy_cutover_audit_coverage as c
    where c.coverage_hour between v_first_hour and v_last_hour
      and c.healthy
      and c.schema_fingerprint = v_meta.expected_schema_fingerprint;

    if v_coverage_count <> 168 then
        raise exception 'PRESENCE_LEGACY_CUTOVER_COVERAGE_INCOMPLETE' using errcode = 'P0001';
    end if;

    select coalesce(sum(a.call_count), 0)::bigint
    into v_direct_count
    from private.presence_legacy_user_write_audit as a
    where a.event_day between v_first_day and v_today
      and a.field_group in (
          'current_space_id',
          'status',
          'last_active',
          'any_authenticated_users_update'
      );

    select coalesce(sum(a.call_count), 0)::bigint
    into v_route_count
    from private.presence_legacy_route_call_audit as a
    where a.event_day between v_first_day and v_today
      and a.route_group in ('users-location', 'users-offline-status');

    if v_direct_count <> 0 or v_route_count <> 0 then
        raise exception 'PRESENCE_LEGACY_CUTOVER_RECEIPTS_NONZERO' using errcode = 'P0001';
    end if;

    return true;
end;
$$;

alter function private.assert_presence_legacy_cutover_gate()
    owner to presence_maintenance_owner;
revoke all on function private.assert_presence_legacy_cutover_gate()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function private.assert_presence_legacy_cutover_gate()
    to presence_maintenance_owner, postgres;

create or replace function public.disable_legacy_presence_adapter(p_cutover_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_control private.presence_runtime_control%rowtype;
    v_disabled_at timestamptz;
begin
    if p_cutover_id is null then
        raise exception 'PRESENCE_CUTOVER_ID_REQUIRED' using errcode = 'P0001';
    end if;

    select c.*
    into v_control
    from private.presence_runtime_control as c
    where c.singleton_id
    for update;

    if not found then
        raise exception 'PRESENCE_RUNTIME_CONTROL_MISSING' using errcode = 'P0001';
    end if;

    if v_control.mode <> 'atomic'
       or v_control.cutover_id is distinct from p_cutover_id then
        raise exception 'PRESENCE_CUTOVER_MISMATCH' using errcode = 'P0001';
    end if;

    if not v_control.legacy_adapter_enabled then
        raise exception 'PRESENCE_LEGACY_ADAPTER_ALREADY_DISABLED' using errcode = 'P0001';
    end if;

    perform private.assert_presence_legacy_cutover_gate();

    v_disabled_at := pg_catalog.clock_timestamp();

    update private.presence_runtime_control as c
    set legacy_adapter_enabled = false,
        legacy_adapter_disabled_at = v_disabled_at,
        changed_at = v_disabled_at,
        changed_by = session_user
    where c.singleton_id;

    return pg_catalog.jsonb_build_object(
        'mode', 'atomic',
        'cutoverId', p_cutover_id,
        'legacyAdapterEnabled', false,
        'legacyAdapterDisabledAt', pg_catalog.to_jsonb(v_disabled_at)
    );
end;
$$;

alter function public.disable_legacy_presence_adapter(uuid)
    owner to presence_maintenance_owner;
revoke all on function public.disable_legacy_presence_adapter(uuid)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.disable_legacy_presence_adapter(uuid) to postgres;

create or replace function private.assert_presence_legacy_adapter_removal_gate()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_control private.presence_runtime_control%rowtype;
    v_meta private.presence_legacy_cutover_audit_meta%rowtype;
    v_today date;
    v_first_day date;
    v_first_hour timestamptz;
    v_last_hour timestamptz;
    v_coverage_count integer;
    v_route_count bigint;
begin
    -- Keep the zero-receipt read live through the caller's transaction.
    lock table private.presence_legacy_route_call_audit in share mode;

    select c.*
    into v_control
    from private.presence_runtime_control as c
    where c.singleton_id
    for share;

    if not found then
        raise exception 'PRESENCE_RUNTIME_CONTROL_MISSING' using errcode = 'P0001';
    end if;

    select m.*
    into v_meta
    from private.presence_legacy_cutover_audit_meta as m
    where m.singleton_id;

    if not found then
        raise exception 'PRESENCE_LEGACY_CUTOVER_META_MISSING' using errcode = 'P0001';
    end if;

    v_today := (pg_catalog.transaction_timestamp() at time zone 'UTC')::date;
    v_first_day := v_today - 7;
    v_first_hour := v_first_day::timestamp at time zone 'UTC';
    v_last_hour := v_today::timestamp at time zone 'UTC' - interval '1 hour';

    if v_control.mode <> 'atomic'
       or v_control.legacy_adapter_enabled
       or v_control.legacy_adapter_disabled_at is null
       or v_control.legacy_adapter_disabled_at > v_first_hour
       or v_meta.installed_at > v_first_hour
       or v_meta.observation_started_at is null
       or v_meta.observation_started_at > v_first_hour
       or v_meta.disabled_at is not null
       or not private.is_presence_cutover_audit_catalog_healthy(
           v_meta.expected_schema_fingerprint
       ) then
        raise exception 'PRESENCE_LEGACY_ADAPTER_REMOVAL_GATE_FAILED' using errcode = 'P0001';
    end if;

    select count(*)::integer
    into v_coverage_count
    from private.presence_legacy_cutover_audit_coverage as c
    where c.coverage_hour between v_first_hour and v_last_hour
      and c.healthy
      and c.schema_fingerprint = v_meta.expected_schema_fingerprint;

    if v_coverage_count <> 168 then
        raise exception 'PRESENCE_LEGACY_ADAPTER_COVERAGE_INCOMPLETE' using errcode = 'P0001';
    end if;

    select coalesce(sum(a.call_count), 0)::bigint
    into v_route_count
    from private.presence_legacy_route_call_audit as a
    where a.event_day between v_first_day and v_today
      and a.route_group in ('users-location', 'users-offline-status');

    if v_route_count <> 0 then
        raise exception 'PRESENCE_LEGACY_ADAPTER_RECEIPTS_NONZERO' using errcode = 'P0001';
    end if;

    return true;
end;
$$;

alter function private.assert_presence_legacy_adapter_removal_gate()
    owner to presence_maintenance_owner;
revoke all on function private.assert_presence_legacy_adapter_removal_gate()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function private.assert_presence_legacy_adapter_removal_gate()
    to postgres;

-- Installed additively now; executable only by the Phase 10 privileged cutover
-- transaction after the locked assertion succeeds.
grant select (status), update (status) on public.users to presence_maintenance_owner;

create or replace function private.backfill_presence_availability_status()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_mode text;
    v_updated integer;
begin
    select c.mode
    into v_mode
    from private.presence_runtime_control as c
    where c.singleton_id
    for share;

    if v_mode is distinct from 'atomic' then
        raise exception 'PRESENCE_AVAILABILITY_BACKFILL_REQUIRES_ATOMIC' using errcode = 'P0001';
    end if;

    perform pg_catalog.set_config(
        'app.presence_internal_writer',
        'audit-maintenance-backfill',
        true
    );

    update public.users as u
    set status = 'online'::public.user_status
    where u.status = 'offline'::public.user_status;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

alter function private.backfill_presence_availability_status()
    owner to presence_maintenance_owner;
revoke all on function private.backfill_presence_availability_status()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function private.backfill_presence_availability_status() to postgres;

-- Reconciliation runs without a PostgREST JWT. Mark its writes so the audit
-- rejects every other unobservable database UPDATE while allowing this one
-- reviewed internal path.
create or replace function public.reconcile_stale_presence_placements()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_candidate_ids uuid[];
    v_user_ids uuid[];
    v_space_ids uuid[];
    v_op timestamptz;
    v_user record;
    v_cleared integer := 0;
begin
    select pg_catalog.array_agg(candidate.id order by candidate.id)
    into v_candidate_ids
    from (
        select u.id
        from public.users as u
        join public.spaces as sp on sp.id = u.current_space_id
        where u.current_space_id is not null
          and not exists (
              select 1
              from public.user_presence_sessions as s
              where s.user_id = u.id
                and s.retired_at is null
                and s.expires_at > pg_catalog.clock_timestamp()
          )
          and not exists (
              select 1
              from public.user_presence_sessions as s
              where s.user_id = u.id
                and s.space_id = u.current_space_id
                and s.placement_version = u.location_version
                and s.user_access_revision = u.presence_access_revision
                and s.space_access_revision = sp.presence_access_revision
                and coalesce(s.retired_at, s.expires_at)
                    >= pg_catalog.clock_timestamp() - interval '5 minutes'
          )
        order by u.id
        limit 100
    ) as candidate;

    if coalesce(pg_catalog.array_length(v_candidate_ids, 1), 0) = 0 then
        return 0;
    end if;

    with locked_users as (
        select u.id, u.current_space_id
        from public.users as u
        where u.id = any (v_candidate_ids)
        order by u.id
        for no key update
    )
    select
        pg_catalog.array_agg(locked_users.id order by locked_users.id),
        pg_catalog.array_agg(distinct locked_users.current_space_id order by locked_users.current_space_id)
            filter (where locked_users.current_space_id is not null)
    into v_user_ids, v_space_ids
    from locked_users;

    if coalesce(pg_catalog.array_length(v_space_ids, 1), 0) > 0 then
        perform 1
        from public.spaces as sp
        where sp.id = any (v_space_ids)
        order by sp.id
        for share;
    end if;

    perform 1
    from public.user_presence_sessions as s
    where s.user_id = any (v_user_ids)
    order by s.user_id, s.id
    for update;

    v_op := pg_catalog.clock_timestamp();
    perform pg_catalog.set_config('app.presence_internal_writer', 'atomic-reconciliation', true);

    for v_user in
        select
            u.id,
            u.current_space_id,
            u.location_version,
            u.presence_access_revision,
            sp.presence_access_revision as space_access_revision
        from public.users as u
        join public.spaces as sp on sp.id = u.current_space_id
        where u.id = any (v_user_ids)
        order by u.id
    loop
        if not exists (
            select 1
            from public.user_presence_sessions as s
            where s.user_id = v_user.id
              and s.retired_at is null
              and s.expires_at > v_op
        )
        and not exists (
            select 1
            from public.user_presence_sessions as s
            where s.user_id = v_user.id
              and s.space_id = v_user.current_space_id
              and s.placement_version = v_user.location_version
              and s.user_access_revision = v_user.presence_access_revision
              and s.space_access_revision = v_user.space_access_revision
              and coalesce(s.retired_at, s.expires_at) >= v_op - interval '5 minutes'
        ) then
            update public.users as u
            set current_space_id = null,
                location_version = u.location_version + 1
            where u.id = v_user.id;

            update public.user_presence_sessions as s
            set space_id = null,
                placement_version = null,
                user_access_revision = null,
                space_access_revision = null
            where s.user_id = v_user.id;

            update public.space_presence_log as l
            set exited_at = v_op
            where l.user_id = v_user.id
              and l.exited_at is null;

            v_cleared := v_cleared + 1;
        end if;
    end loop;

    return v_cleared;
end;
$$;

alter function public.reconcile_stale_presence_placements()
    owner to presence_maintenance_owner;
revoke all on function public.reconcile_stale_presence_placements()
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.reconcile_stale_presence_placements() to postgres;

-- The job must exist before the fingerprint is captured.
do $$
declare
    v_job_id bigint;
begin
    for v_job_id in
        select j.jobid
        from cron.job as j
        where j.jobname = 'presence-audit-legacy-cutover-v1'
    loop
        perform cron.unschedule(v_job_id);
    end loop;
end;
$$;

select cron.schedule(
    'presence-audit-legacy-cutover-v1',
    '5 * * * *',
    'select private.record_presence_legacy_cutover_audit_coverage();'
);

revoke create on schema public, private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

-- Phase 7 installs the final approved membership writers. It starts the
-- immutable window only after those functions and their grants are present.

commit;
