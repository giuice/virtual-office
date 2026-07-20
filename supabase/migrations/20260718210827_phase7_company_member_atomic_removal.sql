-- Phase 7: company membership removal and Presence cleanup must commit together.
-- The caller resolves all three IDs after authentication; the database repeats
-- authorization while holding the global user/company/space/session/log order.

begin;

grant presence_maintenance_owner to postgres;
grant usage on schema public, private to presence_maintenance_owner;
grant create on schema public, private to presence_maintenance_owner;

grant select (id, company_id, role, email, display_name, current_space_id, location_version, presence_access_revision),
      update (company_id, role, display_name, current_space_id, location_version)
    on table public.users to presence_maintenance_owner;
grant select (id, name, admin_ids, settings, created_at),
      insert (name, admin_ids, settings),
      update (admin_ids)
    on table public.companies to presence_maintenance_owner;
grant select (id, token, email, company_id, role, expires_at, status, created_at),
      insert (token, email, company_id, role, expires_at, status),
      update (status)
    on table public.invitations to presence_maintenance_owner;
grant select (id, user_id),
      update (user_id)
    on table public.platform_admins to presence_maintenance_owner;

alter table public.user_presence_sessions
    drop constraint user_presence_sessions_retirement_pair;
alter table public.user_presence_sessions
    add constraint user_presence_sessions_retirement_pair
    check (
      (retired_at is null and retirement_reason is null)
      or
      (retired_at is not null and retirement_reason in (
        'explicit-disconnect', 'expired', 'logout', 'company-removal',
        'role-change', 'membership-entry-reset'
      ))
    );

do $$
begin
    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'companies'
          and policy.polname = 'presence_maintenance_owner_companies_select'
    ) then
        create policy presence_maintenance_owner_companies_select
            on public.companies
            for select
            to presence_maintenance_owner
            using (true);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'companies'
          and policy.polname = 'presence_maintenance_owner_companies_insert'
    ) then
        create policy presence_maintenance_owner_companies_insert
            on public.companies
            for insert
            to presence_maintenance_owner
            with check (true);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'companies'
          and policy.polname = 'presence_maintenance_owner_companies_update'
    ) then
        create policy presence_maintenance_owner_companies_update
            on public.companies
            for update
            to presence_maintenance_owner
            using (true)
            with check (true);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'invitations'
          and policy.polname = 'presence_maintenance_owner_invitations_select'
    ) then
        create policy presence_maintenance_owner_invitations_select
            on public.invitations
            for select
            to presence_maintenance_owner
            using (true);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'invitations'
          and policy.polname = 'presence_maintenance_owner_invitations_update'
    ) then
        create policy presence_maintenance_owner_invitations_update
            on public.invitations
            for update
            to presence_maintenance_owner
            using (true)
            with check (true);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'invitations'
          and policy.polname = 'presence_maintenance_owner_invitations_insert'
    ) then
        create policy presence_maintenance_owner_invitations_insert
            on public.invitations
            for insert
            to presence_maintenance_owner
            with check (true);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'platform_admins'
          and policy.polname = 'presence_maintenance_owner_platform_admins_select'
    ) then
        create policy presence_maintenance_owner_platform_admins_select
            on public.platform_admins
            for select
            to presence_maintenance_owner
            using (true);
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'platform_admins'
          and policy.polname = 'presence_maintenance_owner_platform_admins_update'
    ) then
        create policy presence_maintenance_owner_platform_admins_update
            on public.platform_admins
            for update
            to presence_maintenance_owner
            using (true)
            with check (true);
    end if;
end;
$$;

-- Repair legacy companyless placement drift before any user can enter a new
-- membership scope. The same cleanup is repeated inside both entry RPCs.
do $$
declare
    v_user record;
    v_operation_time timestamptz;
begin
    -- The rollout starts in legacy mode, where the movement gate permits only
    -- an unmarked verified service writer. Atomic mode uses the reviewed
    -- reconciliation marker inside the runtime RPCs below.
    perform pg_catalog.set_config(
        'request.jwt.claims',
        '{"role":"service_role"}',
        true
    );

    for v_user in
        select member.id, member.current_space_id
        from public.users as member
        where member.company_id is null
          and (
            member.current_space_id is not null
            or exists (
              select 1 from public.user_presence_sessions as session
              where session.user_id = member.id and session.retired_at is null
            )
            or exists (
              select 1 from public.space_presence_log as log_row
              where log_row.user_id = member.id and log_row.exited_at is null
            )
          )
        order by member.id
        for update
    loop
        v_operation_time := pg_catalog.clock_timestamp();

        if v_user.current_space_id is not null then
            perform space.id
            from public.spaces as space
            where space.id = v_user.current_space_id
            for update;
        end if;

        perform session.id
        from public.user_presence_sessions as session
        where session.user_id = v_user.id
        order by session.id
        for update;

        perform log_row.id
        from public.space_presence_log as log_row
        where log_row.user_id = v_user.id
        order by log_row.id
        for update;

        update public.user_presence_sessions as session
        set retired_at = v_operation_time,
            expires_at = v_operation_time,
            retirement_reason = 'membership-entry-reset',
            space_id = null,
            placement_version = null,
            user_access_revision = null,
            space_access_revision = null
        where session.user_id = v_user.id
          and session.retired_at is null;

        update public.space_presence_log as log_row
        set exited_at = v_operation_time
        where log_row.user_id = v_user.id
          and log_row.exited_at is null;

        update public.users as member
        set current_space_id = null,
            location_version = case
              when member.current_space_id is null then member.location_version
              else member.location_version + 1
            end
        where member.id = v_user.id;
    end loop;

    perform pg_catalog.set_config('request.jwt.claims', '', true);
end;
$$;

-- Registration must compare the client-observed company while holding the same
-- user lock that serializes membership writers. A route-time comparison alone
-- permits an A -> B change between authorization and lease creation.
drop function public.register_presence_session(uuid, uuid, uuid);

create function public.register_presence_session(
    p_user_id uuid,
    p_auth_session_id uuid,
    p_registration_id uuid,
    p_expected_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_user_id uuid;
    v_company_id uuid;
    v_existing public.user_presence_sessions%rowtype;
    v_session public.user_presence_sessions%rowtype;
    v_operation_time timestamptz;
begin
    if p_expected_company_id is null then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'PRESENCE_COMPANY_SCOPE_CHANGED'
        );
    end if;

    select member.id, member.company_id
    into v_user_id, v_company_id
    from public.users as member
    where member.id = p_user_id
    for no key update;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND');
    end if;

    if v_company_id is null then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'NO_COMPANY');
    end if;

    if v_company_id is distinct from p_expected_company_id then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'PRESENCE_COMPANY_SCOPE_CHANGED'
        );
    end if;

    if exists (
        select 1
        from public.revoked_presence_auth_sessions as fence
        where fence.auth_session_id = p_auth_session_id
          and fence.user_id = p_user_id
    ) then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'AUTH_SESSION_REVOKED'
        );
    end if;

    select session.*
    into v_existing
    from public.user_presence_sessions as session
    where session.user_id = p_user_id
      and session.registration_id = p_registration_id
    for update;

    v_operation_time := pg_catalog.clock_timestamp();

    if found then
        if v_existing.retired_at is not null
           or v_existing.expires_at <= v_operation_time then
            return pg_catalog.jsonb_build_object(
                'ok', false,
                'code', 'SESSION_RETIRED'
            );
        end if;

        if v_existing.auth_session_id is distinct from p_auth_session_id
           or v_existing.company_id is distinct from v_company_id then
            return pg_catalog.jsonb_build_object(
                'ok', false,
                'code', 'REGISTRATION_CONFLICT'
            );
        end if;

        update public.user_presence_sessions as session
        set last_seen_at = v_operation_time,
            expires_at = v_operation_time + interval '90 seconds'
        where session.id = v_existing.id
        returning session.* into v_session;

        return pg_catalog.jsonb_build_object(
            'ok', true,
            'sessionId', v_session.id,
            'companyId', v_company_id,
            'registrationId', v_session.registration_id,
            'sessionSpaceId', v_session.space_id,
            'expiresAt', pg_catalog.to_jsonb(v_session.expires_at),
            'refreshed', true
        );
    end if;

    insert into public.user_presence_sessions (
        registration_id,
        user_id,
        auth_session_id,
        company_id,
        connected_at,
        last_seen_at,
        expires_at
    ) values (
        p_registration_id,
        p_user_id,
        p_auth_session_id,
        v_company_id,
        v_operation_time,
        v_operation_time,
        v_operation_time + interval '90 seconds'
    )
    returning * into v_session;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'sessionId', v_session.id,
        'companyId', v_company_id,
        'registrationId', v_session.registration_id,
        'sessionSpaceId', v_session.space_id,
        'expiresAt', pg_catalog.to_jsonb(v_session.expires_at),
        'refreshed', false
    );
end;
$$;

alter function public.register_presence_session(uuid, uuid, uuid, uuid)
    owner to presence_maintenance_owner;
revoke all on function public.register_presence_session(uuid, uuid, uuid, uuid)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.register_presence_session(uuid, uuid, uuid, uuid)
    to service_role;

-- Legacy invitation creation was not serialized with membership acceptance.
-- Lock the full membership-capacity surface in the global user -> company ->
-- invitation order, refuse unsafe member overflow, and deterministically expire
-- newest reservations beyond the ten-seat limit.
do $$
begin
    perform member.id
    from public.users as member
    where member.company_id is not null
    order by member.id
    for update;

    perform company.id
    from public.companies as company
    order by company.id
    for update;

    perform invitation.id
    from public.invitations as invitation
    where invitation.status = 'pending'::public.invitation_status
    order by invitation.id
    for update;

    update public.invitations as invitation
    set status = 'expired'::public.invitation_status
    where invitation.status = 'pending'::public.invitation_status
      and invitation.expires_at <= pg_catalog.clock_timestamp();

    if exists (
        select 1
        from public.users as member
        where member.company_id is not null
        group by member.company_id
        having pg_catalog.count(*) > 10
    ) then
        raise exception 'PHASE7_COMPANY_MEMBER_LIMIT_PRECHECK_FAILED'
            using errcode = 'P0001';
    end if;

    with member_counts as (
        select member.company_id, pg_catalog.count(*)::integer as member_count
        from public.users as member
        where member.company_id is not null
        group by member.company_id
    ),
    ranked_pending as (
        select invitation.id,
               pg_catalog.row_number() over (
                   partition by invitation.company_id
                   order by invitation.created_at, invitation.id
               ) as reservation_rank,
               10 - coalesce(member_counts.member_count, 0) as available_slots
        from public.invitations as invitation
        left join member_counts
          on member_counts.company_id = invitation.company_id
        where invitation.status = 'pending'::public.invitation_status
          and invitation.expires_at > pg_catalog.clock_timestamp()
    )
    update public.invitations as invitation
    set status = 'expired'::public.invitation_status
    from ranked_pending
    where invitation.id = ranked_pending.id
      and ranked_pending.reservation_rank > ranked_pending.available_slots;
end;
$$;

create or replace function private.reject_direct_service_role_membership_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    if current_user = 'service_role' then
        if tg_table_name = 'invitations' and tg_op = 'INSERT' then
            raise exception 'DIRECT_SERVICE_ROLE_INVITATION_INSERT_FORBIDDEN'
                using errcode = '42501';
        end if;

        if tg_table_name = 'users'
           and tg_op = 'UPDATE'
           and (
             old.company_id is distinct from new.company_id
             or old.role is distinct from new.role
           ) then
            raise exception 'DIRECT_SERVICE_ROLE_MEMBERSHIP_UPDATE_FORBIDDEN'
                using errcode = '42501';
        end if;
    end if;

    return new;
end;
$$;

alter function private.reject_direct_service_role_membership_write()
    owner to presence_maintenance_owner;

drop trigger if exists presence_block_service_role_invitation_insert
    on public.invitations;
create trigger presence_block_service_role_invitation_insert
    before insert on public.invitations
    for each row
    execute function private.reject_direct_service_role_membership_write();

drop trigger if exists presence_block_service_role_membership_update
    on public.users;
create trigger presence_block_service_role_membership_update
    before update of company_id, role on public.users
    for each row
    execute function private.reject_direct_service_role_membership_write();

revoke all on function private.reject_direct_service_role_membership_write()
    from public, anon, authenticated, service_role, presence_maintenance_owner;

create or replace function public.create_company_with_initial_admin_invitation(
    p_platform_admin_auth_user_id uuid,
    p_name text,
    p_settings jsonb,
    p_email text,
    p_token text,
    p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_platform_admin_id uuid;
    v_company public.companies%rowtype;
    v_invitation record;
    v_normalized_email text;
    v_operation_time timestamptz;
begin
    v_operation_time := pg_catalog.clock_timestamp();
    v_normalized_email := pg_catalog.lower(pg_catalog.btrim(p_email));

    if p_platform_admin_auth_user_id is null
       or p_name is null
       or pg_catalog.length(pg_catalog.btrim(p_name)) = 0
       or pg_catalog.length(pg_catalog.btrim(p_name)) > 160
       or p_settings is null
       or pg_catalog.jsonb_typeof(p_settings) <> 'object'
       or v_normalized_email is null
       or pg_catalog.length(v_normalized_email) < 3
       or pg_catalog.length(v_normalized_email) > 320
       or pg_catalog.strpos(v_normalized_email, '@') <= 1
       or p_token is null
       or p_token !~ '^[0-9a-f]{64}$'
       or p_expires_at is null
       or p_expires_at <= v_operation_time
       or p_expires_at > v_operation_time + interval '8 days' then
        raise exception 'PLATFORM_COMPANY_CREATE_INVALID_ARGUMENT'
            using errcode = 'P0001';
    end if;

    select platform_admin.id into v_platform_admin_id
    from public.platform_admins as platform_admin
    where platform_admin.user_id = p_platform_admin_auth_user_id
    for update;
    if not found then
        raise exception 'PLATFORM_COMPANY_CREATE_FORBIDDEN'
            using errcode = 'P0001';
    end if;

    insert into public.companies (name, admin_ids, settings)
    values (pg_catalog.btrim(p_name), array[]::uuid[], p_settings)
    returning * into v_company;

    insert into public.invitations (
        token,
        email,
        company_id,
        role,
        expires_at,
        status
    ) values (
        p_token,
        v_normalized_email,
        v_company.id,
        'admin'::public.user_role,
        p_expires_at,
        'pending'::public.invitation_status
    )
    returning id, token, email, role, expires_at, created_at into v_invitation;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'PLATFORM_COMPANY_AND_INVITATION_CREATED',
        'platformAdminId', v_platform_admin_id,
        'companyId', v_company.id,
        'companyName', v_company.name,
        'companySettings', v_company.settings,
        'companyCreatedAt', v_company.created_at,
        'invitationId', v_invitation.id,
        'email', v_invitation.email,
        'role', v_invitation.role,
        'token', v_invitation.token,
        'expiresAt', v_invitation.expires_at,
        'invitationCreatedAt', v_invitation.created_at
    );
end;
$$;

alter function public.create_company_with_initial_admin_invitation(uuid, text, jsonb, text, text, timestamptz)
    owner to presence_maintenance_owner;
revoke all on function public.create_company_with_initial_admin_invitation(uuid, text, jsonb, text, text, timestamptz)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.create_company_with_initial_admin_invitation(uuid, text, jsonb, text, text, timestamptz)
    to service_role;

create or replace function public.remove_company_member_and_presence(
    p_actor_user_id uuid,
    p_target_user_id uuid,
    p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_actor record;
    v_target record;
    v_company_admin_ids uuid[];
    v_operation_time timestamptz;
    v_retired_session_count integer;
    v_closed_log_count integer;
    v_removed_admin_reference boolean;
    v_invalidated_invitation_count integer;
    v_new_location_version integer;
    v_new_access_revision bigint;
begin
    if p_actor_user_id is null
       or p_target_user_id is null
       or p_company_id is null then
        raise exception 'COMPANY_REMOVAL_INVALID_ARGUMENT'
            using errcode = 'P0001';
    end if;

    -- Global order: both user rows by UUID, company, target space, sessions,
    -- then logs. Every overlapping membership writer must use this order or be
    -- proven not to overlap before production rollout.
    perform member.id
    from public.users as member
    where member.id = any (array[p_actor_user_id, p_target_user_id])
    order by member.id
    for update;

    select actor.id, actor.company_id, actor.role
    into v_actor
    from public.users as actor
    where actor.id = p_actor_user_id;

    if not found then
        raise exception 'COMPANY_REMOVAL_ACTOR_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    select target.id, target.company_id, target.role, target.email, target.current_space_id
    into v_target
    from public.users as target
    where target.id = p_target_user_id;

    if not found then
        raise exception 'COMPANY_REMOVAL_TARGET_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    select company.admin_ids
    into v_company_admin_ids
    from public.companies as company
    where company.id = p_company_id
    for update;

    if not found then
        raise exception 'COMPANY_REMOVAL_COMPANY_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    perform invitation.id
    from public.invitations as invitation
    where invitation.company_id = p_company_id
      and pg_catalog.lower(invitation.email) = pg_catalog.lower(v_target.email)
      and invitation.status = 'pending'::public.invitation_status
    order by invitation.id
    for update;

    if v_target.current_space_id is not null then
        perform space.id
        from public.spaces as space
        where space.id = v_target.current_space_id
        for update;

        if not found then
            raise exception 'COMPANY_REMOVAL_SPACE_NOT_FOUND'
                using errcode = 'P0001';
        end if;
    end if;

    perform session.id
    from public.user_presence_sessions as session
    where session.user_id = p_target_user_id
    order by session.id
    for update;

    perform log_row.id
    from public.space_presence_log as log_row
    where log_row.user_id = p_target_user_id
    order by log_row.id
    for update;

    -- Re-authorize against the locked rows, never against route-time state.
    if v_actor.company_id is distinct from p_company_id
       or v_actor.role is distinct from 'admin'::public.user_role then
        raise exception 'COMPANY_REMOVAL_FORBIDDEN'
            using errcode = 'P0001';
    end if;

    if p_actor_user_id = p_target_user_id then
        raise exception 'COMPANY_REMOVAL_SELF_FORBIDDEN'
            using errcode = 'P0001';
    end if;

    if v_target.company_id is distinct from p_company_id then
        raise exception 'COMPANY_REMOVAL_TARGET_OUTSIDE_COMPANY'
            using errcode = 'P0001';
    end if;

    v_operation_time := pg_catalog.clock_timestamp();
    if private.presence_runtime_mode() = 'atomic' then
        perform pg_catalog.set_config(
            'app.presence_internal_writer',
            'atomic-reconciliation',
            true
        );
    end if;
    v_removed_admin_reference := p_target_user_id = any (
        coalesce(v_company_admin_ids, array[]::uuid[])
    );

    update public.invitations as invitation
    set status = 'expired'::public.invitation_status
    where invitation.company_id = p_company_id
      and pg_catalog.lower(invitation.email) = pg_catalog.lower(v_target.email)
      and invitation.status = 'pending'::public.invitation_status;
    get diagnostics v_invalidated_invitation_count = row_count;

    update public.user_presence_sessions as session
    set retired_at = v_operation_time,
        expires_at = v_operation_time,
        retirement_reason = 'company-removal',
        space_id = null,
        placement_version = null,
        user_access_revision = null,
        space_access_revision = null
    where session.user_id = p_target_user_id;
    get diagnostics v_retired_session_count = row_count;

    update public.space_presence_log as log_row
    set exited_at = v_operation_time
    where log_row.user_id = p_target_user_id
      and log_row.exited_at is null;
    get diagnostics v_closed_log_count = row_count;

    update public.companies as company
    set admin_ids = pg_catalog.array_remove(company.admin_ids, p_target_user_id)
    where company.id = p_company_id;

    update public.users as target
    set company_id = null,
        role = 'member'::public.user_role,
        current_space_id = null,
        location_version = target.location_version + 1
    where target.id = p_target_user_id
    returning target.location_version, target.presence_access_revision
    into v_new_location_version, v_new_access_revision;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'COMPANY_MEMBER_REMOVED',
        'actorUserId', p_actor_user_id,
        'targetUserId', p_target_user_id,
        'companyId', p_company_id,
        'previousSpaceId', v_target.current_space_id,
        'locationVersion', v_new_location_version,
        'presenceAccessRevision', v_new_access_revision,
        'retiredSessionCount', v_retired_session_count,
        'closedLogCount', v_closed_log_count,
        'invalidatedInvitationCount', v_invalidated_invitation_count,
        'removedAdminReference', v_removed_admin_reference,
        'operationTime', v_operation_time
    );
end;
$$;

alter function public.remove_company_member_and_presence(uuid, uuid, uuid)
    owner to presence_maintenance_owner;
revoke all on function public.remove_company_member_and_presence(uuid, uuid, uuid)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.remove_company_member_and_presence(uuid, uuid, uuid)
    to service_role;

create or replace function public.update_company_member_role(
    p_actor_user_id uuid,
    p_target_user_id uuid,
    p_company_id uuid,
    p_role public.user_role
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_actor record;
    v_target record;
    v_admin_ids uuid[];
    v_operation_time timestamptz;
    v_retired_session_count integer := 0;
    v_closed_log_count integer := 0;
    v_invalidated_invitation_count integer;
    v_location_version integer;
    v_access_revision bigint;
begin
    if p_actor_user_id is null
       or p_target_user_id is null
       or p_company_id is null
       or p_role is null then
        raise exception 'COMPANY_ROLE_UPDATE_INVALID_ARGUMENT'
            using errcode = 'P0001';
    end if;

    perform member.id
    from public.users as member
    where member.id = any (array[p_actor_user_id, p_target_user_id])
    order by member.id
    for update;

    select actor.id, actor.company_id, actor.role into v_actor
    from public.users as actor
    where actor.id = p_actor_user_id;
    if not found then
        raise exception 'COMPANY_ROLE_UPDATE_ACTOR_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    select target.id, target.company_id, target.role, target.email, target.current_space_id,
           target.location_version
    into v_target
    from public.users as target
    where target.id = p_target_user_id;
    if not found then
        raise exception 'COMPANY_ROLE_UPDATE_TARGET_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    select company.admin_ids into v_admin_ids
    from public.companies as company
    where company.id = p_company_id
    for update;
    if not found then
        raise exception 'COMPANY_ROLE_UPDATE_COMPANY_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    perform invitation.id
    from public.invitations as invitation
    where invitation.company_id = p_company_id
      and pg_catalog.lower(invitation.email) = pg_catalog.lower(v_target.email)
      and invitation.status = 'pending'::public.invitation_status
    order by invitation.id
    for update;

    if v_target.current_space_id is not null then
        perform space.id
        from public.spaces as space
        where space.id = v_target.current_space_id
        for update;
    end if;

    perform session.id
    from public.user_presence_sessions as session
    where session.user_id = p_target_user_id
    order by session.id
    for update;

    perform log_row.id
    from public.space_presence_log as log_row
    where log_row.user_id = p_target_user_id
    order by log_row.id
    for update;

    if v_actor.company_id is distinct from p_company_id
       or v_actor.role is distinct from 'admin'::public.user_role
       or v_target.company_id is distinct from p_company_id then
        raise exception 'COMPANY_ROLE_UPDATE_FORBIDDEN'
            using errcode = 'P0001';
    end if;

    if p_actor_user_id = p_target_user_id
       and p_role is distinct from 'admin'::public.user_role then
        raise exception 'COMPANY_ROLE_UPDATE_SELF_DEMOTION_FORBIDDEN'
            using errcode = 'P0001';
    end if;

    v_operation_time := pg_catalog.clock_timestamp();
    if private.presence_runtime_mode() = 'atomic' then
        perform pg_catalog.set_config(
            'app.presence_internal_writer',
            'atomic-reconciliation',
            true
        );
    end if;

    update public.invitations as invitation
    set status = 'expired'::public.invitation_status
    where invitation.company_id = p_company_id
      and pg_catalog.lower(invitation.email) = pg_catalog.lower(v_target.email)
      and invitation.status = 'pending'::public.invitation_status;
    get diagnostics v_invalidated_invitation_count = row_count;

    update public.companies as company
    set admin_ids = case
        when p_role = 'admin'::public.user_role then
            case
                when p_target_user_id = any (coalesce(company.admin_ids, array[]::uuid[]))
                    then company.admin_ids
                else pg_catalog.array_append(
                    coalesce(company.admin_ids, array[]::uuid[]),
                    p_target_user_id
                )
            end
        else pg_catalog.array_remove(company.admin_ids, p_target_user_id)
    end
    where company.id = p_company_id;

    if v_target.current_space_id is not null
       and v_target.role is distinct from p_role then
        update public.user_presence_sessions as session
        set retired_at = v_operation_time,
            expires_at = v_operation_time,
            retirement_reason = 'role-change',
            space_id = null,
            placement_version = null,
            user_access_revision = null,
            space_access_revision = null
        where session.user_id = p_target_user_id
          and session.retired_at is null;
        get diagnostics v_retired_session_count = row_count;

        update public.space_presence_log as log_row
        set exited_at = v_operation_time
        where log_row.user_id = p_target_user_id
          and log_row.exited_at is null;
        get diagnostics v_closed_log_count = row_count;
    end if;

    update public.users as target
    set role = p_role,
        current_space_id = case
            when v_target.role is distinct from p_role then null
            else target.current_space_id
        end,
        location_version = case
            when v_target.role is distinct from p_role
                 and v_target.current_space_id is not null
                then target.location_version + 1
            else target.location_version
        end
    where target.id = p_target_user_id
    returning target.location_version, target.presence_access_revision
    into v_location_version, v_access_revision;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'COMPANY_MEMBER_ROLE_UPDATED',
        'actorUserId', p_actor_user_id,
        'targetUserId', p_target_user_id,
        'companyId', p_company_id,
        'role', p_role,
        'previousSpaceId', v_target.current_space_id,
        'locationVersion', v_location_version,
        'presenceAccessRevision', v_access_revision,
        'retiredSessionCount', v_retired_session_count,
        'closedLogCount', v_closed_log_count,
        'invalidatedInvitationCount', v_invalidated_invitation_count,
        'operationTime', v_operation_time
    );
end;
$$;

alter function public.update_company_member_role(uuid, uuid, uuid, public.user_role)
    owner to presence_maintenance_owner;
revoke all on function public.update_company_member_role(uuid, uuid, uuid, public.user_role)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.update_company_member_role(uuid, uuid, uuid, public.user_role)
    to service_role;

create or replace function public.create_company_invitation(
    p_actor_user_id uuid,
    p_company_id uuid,
    p_email text,
    p_role public.user_role,
    p_token text,
    p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_actor record;
    v_existing record;
    v_created record;
    v_operation_time timestamptz;
    v_member_count integer;
    v_pending_count integer;
    v_normalized_email text;
begin
    v_operation_time := pg_catalog.clock_timestamp();
    v_normalized_email := pg_catalog.lower(pg_catalog.btrim(p_email));

    if p_actor_user_id is null
       or p_company_id is null
       or p_role is null
       or v_normalized_email is null
       or pg_catalog.length(v_normalized_email) < 3
       or pg_catalog.length(v_normalized_email) > 320
       or pg_catalog.strpos(v_normalized_email, '@') <= 1
       or p_token is null
       or p_token !~ '^[0-9a-f]{64}$'
       or p_expires_at is null
       or p_expires_at <= v_operation_time
       or p_expires_at > v_operation_time + interval '8 days' then
        raise exception 'INVITATION_CREATE_INVALID_ARGUMENT'
            using errcode = 'P0001';
    end if;

    -- Membership writers lock users first, then company, then invitations.
    perform member.id
    from public.users as member
    where member.id = p_actor_user_id
       or (
         member.company_id = p_company_id
         and pg_catalog.lower(member.email) = v_normalized_email
       )
    order by member.id
    for update;

    select actor.id, actor.company_id, actor.role into v_actor
    from public.users as actor
    where actor.id = p_actor_user_id;
    if not found then
        raise exception 'INVITATION_CREATE_ACTOR_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    perform company.id
    from public.companies as company
    where company.id = p_company_id
    for update;
    if not found then
        raise exception 'INVITATION_CREATE_COMPANY_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    perform invitation.id
    from public.invitations as invitation
    where invitation.company_id = p_company_id
      and invitation.status = 'pending'::public.invitation_status
    order by invitation.id
    for update;

    if v_actor.company_id is distinct from p_company_id
       or v_actor.role is distinct from 'admin'::public.user_role then
        raise exception 'INVITATION_CREATE_FORBIDDEN'
            using errcode = 'P0001';
    end if;

    if exists (
        select 1
        from public.users as member
        where member.company_id = p_company_id
          and pg_catalog.lower(member.email) = v_normalized_email
    ) then
        raise exception 'INVITATION_CREATE_EXISTING_MEMBER'
            using errcode = 'P0001';
    end if;

    update public.invitations as invitation
    set status = 'expired'::public.invitation_status
    where invitation.company_id = p_company_id
      and invitation.status = 'pending'::public.invitation_status
      and invitation.expires_at <= v_operation_time;

    select invitation.id,
           invitation.token,
           invitation.role,
           invitation.expires_at,
           invitation.created_at
    into v_existing
    from public.invitations as invitation
    where invitation.company_id = p_company_id
      and invitation.status = 'pending'::public.invitation_status
      and invitation.expires_at > v_operation_time
      and pg_catalog.lower(invitation.email) = v_normalized_email
    order by invitation.created_at desc, invitation.id
    limit 1;

    select pg_catalog.count(*)::integer into v_member_count
    from public.users as member
    where member.company_id = p_company_id;

    select pg_catalog.count(*)::integer into v_pending_count
    from public.invitations as invitation
    where invitation.company_id = p_company_id
      and invitation.status = 'pending'::public.invitation_status
      and invitation.expires_at > v_operation_time;

    if v_existing.id is not null then
        return pg_catalog.jsonb_build_object(
            'ok', true,
            'code', 'COMPANY_INVITATION_REUSED',
            'created', false,
            'invitationId', v_existing.id,
            'companyId', p_company_id,
            'email', v_normalized_email,
            'role', v_existing.role,
            'token', v_existing.token,
            'expiresAt', v_existing.expires_at,
            'createdAt', v_existing.created_at,
            'memberCount', v_member_count,
            'pendingCount', v_pending_count
        );
    end if;

    if v_member_count + v_pending_count >= 10 then
        raise exception 'INVITATION_CREATE_LIMIT_REACHED'
            using errcode = 'P0001';
    end if;

    insert into public.invitations (
        token,
        email,
        company_id,
        role,
        expires_at,
        status
    ) values (
        p_token,
        v_normalized_email,
        p_company_id,
        p_role,
        p_expires_at,
        'pending'::public.invitation_status
    )
    returning id, token, role, expires_at, created_at into v_created;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'COMPANY_INVITATION_CREATED',
        'created', true,
        'invitationId', v_created.id,
        'companyId', p_company_id,
        'email', v_normalized_email,
        'role', v_created.role,
        'token', v_created.token,
        'expiresAt', v_created.expires_at,
        'createdAt', v_created.created_at,
        'memberCount', v_member_count,
        'pendingCount', v_pending_count + 1
    );
end;
$$;

alter function public.create_company_invitation(uuid, uuid, text, public.user_role, text, timestamptz)
    owner to presence_maintenance_owner;
revoke all on function public.create_company_invitation(uuid, uuid, text, public.user_role, text, timestamptz)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.create_company_invitation(uuid, uuid, text, public.user_role, text, timestamptz)
    to service_role;

create or replace function public.accept_company_invitation_membership(
    p_user_id uuid,
    p_invitation_id uuid,
    p_company_id uuid,
    p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_user record;
    v_invitation record;
    v_operation_time timestamptz;
    v_member_count integer;
    v_pending_count integer;
    v_retired_session_count integer := 0;
    v_closed_log_count integer := 0;
    v_location_version integer;
    v_access_revision bigint;
begin
    if p_user_id is null or p_invitation_id is null or p_company_id is null then
        raise exception 'INVITATION_ACCEPT_INVALID_ARGUMENT'
            using errcode = 'P0001';
    end if;
    if p_display_name is not null
       and (pg_catalog.length(pg_catalog.btrim(p_display_name)) = 0
            or pg_catalog.length(pg_catalog.btrim(p_display_name)) > 100) then
        raise exception 'INVITATION_ACCEPT_INVALID_DISPLAY_NAME'
            using errcode = 'P0001';
    end if;

    -- Membership writers share user -> company ordering with removal/role.
    select member.id, member.company_id, member.email, member.current_space_id into v_user
    from public.users as member
    where member.id = p_user_id
    for update;
    if not found then
        raise exception 'INVITATION_ACCEPT_USER_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    perform company.id
    from public.companies as company
    where company.id = p_company_id
    for update;
    if not found then
        raise exception 'INVITATION_ACCEPT_COMPANY_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    select
        invitation.id,
        invitation.email,
        invitation.company_id,
        invitation.role,
        invitation.expires_at,
        invitation.status
    into v_invitation
    from public.invitations as invitation
    where invitation.id = p_invitation_id
    for update;
    if not found then
        raise exception 'INVITATION_ACCEPT_NOT_FOUND'
            using errcode = 'P0001';
    end if;

    if v_user.current_space_id is not null then
        perform space.id
        from public.spaces as space
        where space.id = v_user.current_space_id
        for update;
    end if;

    perform session.id
    from public.user_presence_sessions as session
    where session.user_id = p_user_id
    order by session.id
    for update;

    perform log_row.id
    from public.space_presence_log as log_row
    where log_row.user_id = p_user_id
    order by log_row.id
    for update;

    if v_invitation.company_id is distinct from p_company_id
       or v_invitation.status is distinct from 'pending'::public.invitation_status
       or v_invitation.expires_at <= pg_catalog.clock_timestamp()
       or pg_catalog.lower(v_invitation.email) is distinct from pg_catalog.lower(v_user.email) then
        raise exception 'INVITATION_ACCEPT_FORBIDDEN'
            using errcode = 'P0001';
    end if;

    if v_user.company_id is not null then
        raise exception 'INVITATION_ACCEPT_ALREADY_HAS_COMPANY'
            using errcode = 'P0001';
    end if;

    select pg_catalog.count(*)::integer into v_member_count
    from public.users as member
    where member.company_id = p_company_id;

    select pg_catalog.count(*)::integer into v_pending_count
    from public.invitations as invitation
    where invitation.company_id = p_company_id
      and invitation.status = 'pending'::public.invitation_status
      and invitation.expires_at > pg_catalog.clock_timestamp();

    if v_member_count >= 10
       or v_member_count + v_pending_count > 10 then
        raise exception 'INVITATION_ACCEPT_LIMIT_REACHED'
            using errcode = 'P0001';
    end if;

    v_operation_time := pg_catalog.clock_timestamp();
    if private.presence_runtime_mode() = 'atomic' then
        perform pg_catalog.set_config(
            'app.presence_internal_writer',
            'atomic-reconciliation',
            true
        );
    end if;

    update public.user_presence_sessions as session
    set retired_at = v_operation_time,
        expires_at = v_operation_time,
        retirement_reason = 'membership-entry-reset',
        space_id = null,
        placement_version = null,
        user_access_revision = null,
        space_access_revision = null
    where session.user_id = p_user_id
      and session.retired_at is null;
    get diagnostics v_retired_session_count = row_count;

    update public.space_presence_log as log_row
    set exited_at = v_operation_time
    where log_row.user_id = p_user_id
      and log_row.exited_at is null;
    get diagnostics v_closed_log_count = row_count;

    update public.companies as company
    set admin_ids = case
        when v_invitation.role = 'admin'::public.user_role
             and not p_user_id = any (coalesce(company.admin_ids, array[]::uuid[]))
            then pg_catalog.array_append(
                coalesce(company.admin_ids, array[]::uuid[]),
                p_user_id
            )
        else company.admin_ids
    end
    where company.id = p_company_id;

    update public.users as member
    set company_id = p_company_id,
        role = v_invitation.role,
        display_name = coalesce(pg_catalog.btrim(p_display_name), member.display_name),
        current_space_id = null,
        location_version = case
            when member.current_space_id is null then member.location_version
            else member.location_version + 1
        end
    where member.id = p_user_id
    returning member.location_version, member.presence_access_revision
    into v_location_version, v_access_revision;

    update public.invitations as invitation
    set status = 'accepted'::public.invitation_status
    where invitation.id = p_invitation_id;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'COMPANY_INVITATION_ACCEPTED',
        'userId', p_user_id,
        'invitationId', p_invitation_id,
        'companyId', p_company_id,
        'role', v_invitation.role,
        'previousSpaceId', v_user.current_space_id,
        'locationVersion', v_location_version,
        'presenceAccessRevision', v_access_revision,
        'retiredSessionCount', v_retired_session_count,
        'closedLogCount', v_closed_log_count,
        'operationTime', v_operation_time
    );
end;
$$;

alter function public.accept_company_invitation_membership(uuid, uuid, uuid, text)
    owner to presence_maintenance_owner;
revoke all on function public.accept_company_invitation_membership(uuid, uuid, uuid, text)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.accept_company_invitation_membership(uuid, uuid, uuid, text)
    to service_role;

create or replace function public.create_company_for_user(
    p_user_id uuid,
    p_name text,
    p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_user record;
    v_company public.companies%rowtype;
    v_operation_time timestamptz;
    v_retired_session_count integer := 0;
    v_closed_log_count integer := 0;
    v_location_version integer;
    v_access_revision bigint;
begin
    if p_user_id is null
       or p_name is null
       or pg_catalog.length(pg_catalog.btrim(p_name)) = 0
       or pg_catalog.length(pg_catalog.btrim(p_name)) > 160
       or p_settings is null
       or pg_catalog.jsonb_typeof(p_settings) <> 'object' then
        raise exception 'COMPANY_CREATE_INVALID_ARGUMENT'
            using errcode = 'P0001';
    end if;

    select member.id, member.company_id, member.current_space_id into v_user
    from public.users as member
    where member.id = p_user_id
    for update;
    if not found then
        raise exception 'COMPANY_CREATE_USER_NOT_FOUND'
            using errcode = 'P0001';
    end if;
    if v_user.company_id is not null then
        raise exception 'COMPANY_CREATE_ALREADY_HAS_COMPANY'
            using errcode = 'P0001';
    end if;

    if v_user.current_space_id is not null then
        perform space.id
        from public.spaces as space
        where space.id = v_user.current_space_id
        for update;
    end if;

    perform session.id
    from public.user_presence_sessions as session
    where session.user_id = p_user_id
    order by session.id
    for update;

    perform log_row.id
    from public.space_presence_log as log_row
    where log_row.user_id = p_user_id
    order by log_row.id
    for update;

    v_operation_time := pg_catalog.clock_timestamp();
    if private.presence_runtime_mode() = 'atomic' then
        perform pg_catalog.set_config(
            'app.presence_internal_writer',
            'atomic-reconciliation',
            true
        );
    end if;

    update public.user_presence_sessions as session
    set retired_at = v_operation_time,
        expires_at = v_operation_time,
        retirement_reason = 'membership-entry-reset',
        space_id = null,
        placement_version = null,
        user_access_revision = null,
        space_access_revision = null
    where session.user_id = p_user_id
      and session.retired_at is null;
    get diagnostics v_retired_session_count = row_count;

    update public.space_presence_log as log_row
    set exited_at = v_operation_time
    where log_row.user_id = p_user_id
      and log_row.exited_at is null;
    get diagnostics v_closed_log_count = row_count;

    insert into public.companies (name, admin_ids, settings)
    values (pg_catalog.btrim(p_name), array[p_user_id]::uuid[], p_settings)
    returning * into v_company;

    update public.users as member
    set company_id = v_company.id,
        role = 'admin'::public.user_role,
        current_space_id = null,
        location_version = case
            when member.current_space_id is null then member.location_version
            else member.location_version + 1
        end
    where member.id = p_user_id
    returning member.location_version, member.presence_access_revision
    into v_location_version, v_access_revision;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'COMPANY_CREATED',
        'userId', p_user_id,
        'companyId', v_company.id,
        'name', v_company.name,
        'adminIds', v_company.admin_ids,
        'settings', v_company.settings,
        'createdAt', v_company.created_at,
        'previousSpaceId', v_user.current_space_id,
        'locationVersion', v_location_version,
        'presenceAccessRevision', v_access_revision,
        'retiredSessionCount', v_retired_session_count,
        'closedLogCount', v_closed_log_count,
        'operationTime', v_operation_time
    );
end;
$$;

alter function public.create_company_for_user(uuid, text, jsonb)
    owner to presence_maintenance_owner;
revoke all on function public.create_company_for_user(uuid, text, jsonb)
    from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.create_company_for_user(uuid, text, jsonb)
    to service_role;

revoke create on schema public, private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

commit;
