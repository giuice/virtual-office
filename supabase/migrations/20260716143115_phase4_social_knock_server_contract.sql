-- Migration: phase4_social_knock_server_contract
-- Purpose: Restore server-owned Knock as a social action for every occupied room.
-- Date (UTC): 2026-07-16

begin;

-- Knock remains inaccessible to browser roles. All state transitions and reads go
-- through authenticated server routes which invoke these functions as service_role.
revoke all on table public.knock_requests from public, anon, authenticated;

create or replace function public.create_knock_request(
    p_requester_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid,
    p_space_id uuid,
    p_request_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
    v_requester public.users%rowtype;
    v_space public.spaces%rowtype;
    v_session public.user_presence_sessions%rowtype;
    v_existing public.knock_requests%rowtype;
    v_op timestamptz;
    v_recipient_count integer;
    v_recent_count integer;
    v_retry_after integer;
begin
    if p_requester_id is null
       or p_auth_session_id is null
       or p_session_id is null
       or p_space_id is null
       or p_request_id is null
       or p_request_id = '' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
    end if;

    select u.* into v_requester
    from public.users as u
    where u.id = p_requester_id
    for no key update;

    if not found or v_requester.company_id is null then
        return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
    end if;

    select sp.* into v_space
    from public.spaces as sp
    where sp.id = p_space_id
    for no key update;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'SPACE_NOT_FOUND');
    end if;

    select s.* into v_session
    from public.user_presence_sessions as s
    where s.id = p_session_id
    for update;

    v_op := clock_timestamp();

    if not found
       or v_session.user_id <> p_requester_id
       or v_session.auth_session_id <> p_auth_session_id
       or v_session.company_id <> v_requester.company_id
       or v_session.retired_at is not null
       or v_session.expires_at <= v_op
       or exists (
            select 1
            from public.revoked_presence_auth_sessions as f
            where f.user_id = p_requester_id
              and f.auth_session_id = p_auth_session_id
       ) then
        return jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
    end if;

    if v_space.company_id <> v_requester.company_id then
        return jsonb_build_object('ok', false, 'code', 'CROSS_COMPANY_SPACE');
    end if;

    if v_space.status::text not in ('active', 'available') then
        return jsonb_build_object('ok', false, 'code', 'SPACE_UNAVAILABLE');
    end if;

    if v_requester.current_space_id = p_space_id then
        return jsonb_build_object('ok', false, 'code', 'KNOCK_NOT_REQUIRED');
    end if;

    -- A valid presence lease proves connectivity. In legacy mode the lease is not
    -- placement-bound yet, so canonical users.current_space_id supplies placement.
    -- Atomic mode additionally requires revision/version-bound session placement.
    select count(distinct occupant.id)::integer
    into v_recipient_count
    from public.users as occupant
    where occupant.company_id = v_space.company_id
      and occupant.current_space_id = p_space_id
      and occupant.id <> p_requester_id
      and exists (
          select 1
          from public.user_presence_sessions as os
          where os.user_id = occupant.id
            and os.company_id = occupant.company_id
            and os.retired_at is null
            and os.expires_at > v_op
            and (
                private.presence_runtime_mode() = 'legacy'
                or (
                    os.space_id = p_space_id
                    and os.placement_version = occupant.location_version
                    and os.user_access_revision = occupant.presence_access_revision
                    and os.space_access_revision = v_space.presence_access_revision
                )
            )
      );

    if v_recipient_count = 0 then
        return jsonb_build_object(
            'ok', false,
            'code', 'NO_KNOCK_RECIPIENTS',
            'recipientCount', 0
        );
    end if;

    -- Expire stale live rows while holding the same requester/space serialization
    -- locks used by create. History remains immutable and browser-invisible.
    update public.knock_requests as kr
    set status = 'expired',
        updated_at = v_op
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.status in ('pending', 'approved')
      and kr.consumed_at is null
      and kr.expires_at <= v_op;

    select kr.* into v_existing
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.status in ('pending', 'approved')
      and kr.consumed_at is null
      and kr.expires_at > v_op
    order by kr.created_at desc
    limit 1
    for update;

    if found then
        if v_existing.id = p_request_id then
            return jsonb_build_object(
                'ok', true,
                'code', 'KNOCK_CREATED',
                'requestId', v_existing.id,
                'status', v_existing.status,
                'expiresAt', to_jsonb(v_existing.expires_at),
                'recipientCount', v_recipient_count,
                'requesterLocationVersion', v_existing.requester_location_version,
                'alreadyApplied', true
            );
        end if;

        return jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_ALREADY_PENDING',
            'requestId', v_existing.id
        );
    end if;

    select count(*)::integer
    into v_recent_count
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.created_at > v_op - interval '10 seconds';

    if v_recent_count > 0 then
        select greatest(
            1,
            ceil(extract(epoch from (max(kr.created_at) + interval '10 seconds' - v_op)))::integer
        )
        into v_retry_after
        from public.knock_requests as kr
        where kr.requester_id = p_requester_id
          and kr.space_id = p_space_id
          and kr.created_at > v_op - interval '10 seconds';

        return jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_RATE_LIMITED',
            'retryAfterSeconds', coalesce(v_retry_after, 1)
        );
    end if;

    select count(*)::integer
    into v_recent_count
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.company_id = v_requester.company_id
      and kr.created_at > v_op - interval '60 seconds';

    if v_recent_count >= 5 then
        select greatest(
            1,
            ceil(extract(epoch from (min(kr.created_at) + interval '60 seconds' - v_op)))::integer
        )
        into v_retry_after
        from public.knock_requests as kr
        where kr.requester_id = p_requester_id
          and kr.company_id = v_requester.company_id
          and kr.created_at > v_op - interval '60 seconds';

        return jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_RATE_LIMITED',
            'retryAfterSeconds', coalesce(v_retry_after, 1)
        );
    end if;

    -- Starting Knock is a new manual intent. Advance the requester generation
    -- once so older automatic work and approvals cannot move them later.
    update public.users as u
    set location_version = u.location_version + 1
    where u.id = v_requester.id
      and u.location_version = v_requester.location_version
    returning u.* into v_requester;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'KNOCK_SUPERSEDED');
    end if;

    update public.user_presence_sessions as ps
    set placement_version = v_requester.location_version
    where ps.user_id = v_requester.id
      and ps.retired_at is null
      and ps.expires_at > v_op
      and ps.space_id = v_requester.current_space_id
      and ps.placement_version = v_requester.location_version - 1;

    insert into public.knock_requests (
        id,
        space_id,
        requester_id,
        requester_name,
        requester_avatar_url,
        company_id,
        expires_at,
        requester_location_version,
        requester_access_revision,
        space_access_revision,
        status,
        created_at,
        updated_at
    ) values (
        p_request_id,
        p_space_id,
        v_requester.id,
        v_requester.display_name,
        v_requester.avatar_url,
        v_requester.company_id,
        v_op + interval '30 seconds',
        v_requester.location_version,
        v_requester.presence_access_revision,
        v_space.presence_access_revision,
        'pending',
        v_op,
        v_op
    )
    returning * into v_existing;

    return jsonb_build_object(
        'ok', true,
        'code', 'KNOCK_CREATED',
        'requestId', v_existing.id,
        'status', v_existing.status,
        'expiresAt', to_jsonb(v_existing.expires_at),
        'recipientCount', v_recipient_count,
        'requesterLocationVersion', v_existing.requester_location_version,
        'alreadyApplied', false
    );
exception
    when unique_violation then
        select kr.* into v_existing
        from public.knock_requests as kr
        where kr.requester_id = p_requester_id
          and kr.space_id = p_space_id
          and kr.status in ('pending', 'approved')
          and kr.consumed_at is null
        order by kr.created_at desc
        limit 1;

        return jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_ALREADY_PENDING',
            'requestId', v_existing.id
        );
end;
$$;

create or replace function public.respond_to_knock(
    p_responder_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid,
    p_request_id text,
    p_decision text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
    v_knock public.knock_requests%rowtype;
    v_responder public.users%rowtype;
    v_requester public.users%rowtype;
    v_space public.spaces%rowtype;
    v_session public.user_presence_sessions%rowtype;
    v_op timestamptz;
begin
    if p_responder_id is null
       or p_auth_session_id is null
       or p_session_id is null
       or p_request_id is null
       or p_decision not in ('APPROVE', 'DENY') then
        return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
    end if;

    select kr.* into v_knock
    from public.knock_requests as kr
    where kr.id = p_request_id;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'KNOCK_NOT_FOUND');
    end if;

    perform u.id
    from public.users as u
    where u.id in (p_responder_id, v_knock.requester_id)
    order by u.id
    for no key update;

    select u.* into v_responder from public.users as u where u.id = p_responder_id;
    select u.* into v_requester from public.users as u where u.id = v_knock.requester_id;
    select sp.* into v_space from public.spaces as sp where sp.id = v_knock.space_id for no key update;
    select kr.* into v_knock from public.knock_requests as kr where kr.id = p_request_id for update;
    select s.* into v_session from public.user_presence_sessions as s where s.id = p_session_id for update;

    v_op := clock_timestamp();

    if v_responder.id is null
       or v_requester.id is null
       or v_space.id is null
       or v_session.id is null
       or v_session.user_id <> p_responder_id
       or v_session.auth_session_id <> p_auth_session_id
       or v_session.retired_at is not null
       or v_session.expires_at <= v_op
       or v_responder.company_id is null
       or v_responder.company_id <> v_space.company_id
       or v_requester.company_id <> v_space.company_id
       or v_responder.current_space_id <> v_space.id
       or exists (
            select 1
            from public.revoked_presence_auth_sessions as f
            where f.user_id = p_responder_id
              and f.auth_session_id = p_auth_session_id
       )
       or (
            private.presence_runtime_mode() <> 'legacy'
            and (
                v_session.space_id <> v_space.id
                or v_session.placement_version <> v_responder.location_version
                or v_session.user_access_revision <> v_responder.presence_access_revision
                or v_session.space_access_revision <> v_space.presence_access_revision
            )
       ) then
        return jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
    end if;

    if v_knock.status in ('approved', 'denied') then
        if v_knock.responder_id = p_responder_id and v_knock.decision = p_decision then
            return jsonb_build_object(
                'ok', true,
                'code', 'KNOCK_RESPONDED',
                'requestId', v_knock.id,
                'status', v_knock.status,
                'decision', v_knock.decision,
                'responderId', v_knock.responder_id,
                'expiresAt', to_jsonb(v_knock.expires_at),
                'usable', v_knock.status = 'approved' and v_knock.expires_at > v_op,
                'alreadyApplied', true
            );
        end if;
        return jsonb_build_object('ok', false, 'code', 'KNOCK_ALREADY_RESOLVED');
    end if;

    if v_knock.status = 'expired' or v_knock.expires_at <= v_op then
        if v_knock.status = 'pending' then
            update public.knock_requests as kr
            set status = 'expired', updated_at = v_op
            where kr.id = v_knock.id and kr.status = 'pending';
        end if;
        return jsonb_build_object('ok', false, 'code', 'KNOCK_EXPIRED');
    end if;

    if v_knock.status <> 'pending'
       or v_knock.company_id <> v_responder.company_id
       or v_knock.requester_access_revision <> v_requester.presence_access_revision
       or v_knock.space_access_revision <> v_space.presence_access_revision
       or v_space.status::text not in ('active', 'available') then
        return jsonb_build_object('ok', false, 'code', 'KNOCK_SUPERSEDED');
    end if;

    update public.knock_requests as kr
    set responder_id = v_responder.id,
        responder_name = v_responder.display_name,
        responder_access_revision = v_responder.presence_access_revision,
        decision = p_decision,
        status = case when p_decision = 'APPROVE' then 'approved' else 'denied' end,
        expires_at = case when p_decision = 'APPROVE' then v_op + interval '30 seconds' else kr.expires_at end,
        updated_at = v_op
    where kr.id = v_knock.id
      and kr.status = 'pending'
      and kr.expires_at > v_op
    returning * into v_knock;

    if not found then
        return jsonb_build_object('ok', false, 'code', 'KNOCK_ALREADY_RESOLVED');
    end if;

    return jsonb_build_object(
        'ok', true,
        'code', 'KNOCK_RESPONDED',
        'requestId', v_knock.id,
        'status', v_knock.status,
        'decision', v_knock.decision,
        'responderId', v_knock.responder_id,
        'expiresAt', to_jsonb(v_knock.expires_at),
        'usable', v_knock.status = 'approved',
        'alreadyApplied', false
    );
end;
$$;

create or replace function public.get_knock_request_status(
    p_requester_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid,
    p_request_id text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
    with operation as (
        select clock_timestamp() as server_time
    ), authorized as (
        select u.id, u.company_id, u.location_version, u.presence_access_revision
        from public.users as u, operation as op
        where u.id = p_requester_id
          and not exists (
              select 1 from public.revoked_presence_auth_sessions as f
              where f.user_id = u.id and f.auth_session_id = p_auth_session_id
          )
          and exists (
              select 1 from public.user_presence_sessions as ps
              where ps.id = p_session_id
                and ps.user_id = u.id
                and ps.auth_session_id = p_auth_session_id
                and ps.retired_at is null
                and ps.expires_at > op.server_time
          )
    ), resolved as (
        select
            kr.*,
            op.server_time,
            requester.location_version as current_location_version,
            requester.presence_access_revision as current_requester_revision,
            sp.company_id as current_space_company_id,
            sp.status::text as current_space_status,
            sp.presence_access_revision as current_space_revision,
            responder.company_id as current_responder_company_id,
            responder.presence_access_revision as current_responder_revision
        from operation as op
        join authorized as requester on true
        join public.knock_requests as kr
          on kr.id = p_request_id and kr.requester_id = requester.id
        join public.spaces as sp on sp.id = kr.space_id
        left join public.users as responder on responder.id = kr.responder_id
        where kr.company_id = requester.company_id
    )
    select case
        when not exists (select 1 from authorized) then
            jsonb_build_object('ok', false, 'code', 'SESSION_INVALID')
        when not exists (select 1 from resolved) then
            jsonb_build_object('ok', false, 'code', 'KNOCK_NOT_FOUND')
        when exists (
            select 1 from resolved as r
            where r.current_location_version <> r.requester_location_version
               or r.current_requester_revision <> r.requester_access_revision
               or r.current_space_company_id <> r.company_id
               or r.current_space_status not in ('active', 'available')
               or r.current_space_revision <> r.space_access_revision
               or (
                    r.status = 'approved'
                    and (
                        r.responder_id is null
                        or r.current_responder_company_id <> r.company_id
                        or r.current_responder_revision <> r.responder_access_revision
                    )
               )
        ) then jsonb_build_object('ok', false, 'code', 'KNOCK_SUPERSEDED', 'requestId', p_request_id)
        else (
            select jsonb_build_object(
                'ok', true,
                'code', 'KNOCK_STATUS',
                'requestId', r.id,
                'spaceId', r.space_id,
                'status', case
                    when r.status in ('pending', 'approved') and r.expires_at <= r.server_time then 'expired'
                    else r.status
                end,
                'decision', r.decision,
                'responderId', r.responder_id,
                'expiresAt', to_jsonb(r.expires_at),
                'consumedAt', to_jsonb(r.consumed_at),
                'requesterLocationVersion', r.requester_location_version
            ) from resolved as r
        )
    end;
$$;

create or replace function public.get_pending_knock_requests_for_session(
    p_responder_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid,
    p_space_id uuid
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
    with operation as (
        select clock_timestamp() as server_time, private.presence_runtime_mode() as mode
    ), responder as (
        select u.*
        from public.users as u, operation as op
        where u.id = p_responder_id
          and u.company_id is not null
          and u.current_space_id = p_space_id
          and not exists (
              select 1 from public.revoked_presence_auth_sessions as f
              where f.user_id = u.id and f.auth_session_id = p_auth_session_id
          )
          and exists (
              select 1 from public.user_presence_sessions as ps
              join public.spaces as occupied_space on occupied_space.id = p_space_id
              where ps.id = p_session_id
                and ps.user_id = u.id
                and ps.auth_session_id = p_auth_session_id
                and ps.company_id = u.company_id
                and ps.retired_at is null
                and ps.expires_at > op.server_time
                and (
                    op.mode = 'legacy'
                    or (
                        ps.space_id = p_space_id
                        and ps.placement_version = u.location_version
                        and ps.user_access_revision = u.presence_access_revision
                        and ps.space_access_revision = occupied_space.presence_access_revision
                    )
                )
          )
    ), pending as (
        select
            kr.id,
            kr.space_id,
            kr.created_at,
            kr.expires_at,
            requester.id as requester_id,
            requester.display_name,
            requester.avatar_url
        from responder as r
        join public.knock_requests as kr
          on kr.company_id = r.company_id
         and kr.space_id = p_space_id
         and kr.status = 'pending'
        join public.users as requester
          on requester.id = kr.requester_id
         and requester.company_id = r.company_id
         and requester.presence_access_revision = kr.requester_access_revision
        join public.spaces as sp
          on sp.id = kr.space_id
         and sp.company_id = r.company_id
         and sp.presence_access_revision = kr.space_access_revision
         and sp.status::text in ('active', 'available')
        cross join operation as op
        where kr.expires_at > op.server_time
        order by kr.created_at
    )
    select case
        when not exists (select 1 from responder) then
            jsonb_build_object('ok', false, 'code', 'SESSION_INVALID')
        else jsonb_build_object(
            'ok', true,
            'code', 'KNOCK_PENDING_LIST',
            'requests', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'requestId', p.id,
                    'requester', jsonb_build_object(
                        'id', p.requester_id,
                        'displayName', p.display_name,
                        'avatarUrl', p.avatar_url
                    ),
                    'spaceId', p.space_id,
                    'createdAt', to_jsonb(p.created_at),
                    'expiresAt', to_jsonb(p.expires_at)
                ) order by p.created_at)
                from pending as p
            ), '[]'::jsonb)
        )
    end;
$$;

create or replace function public.expire_knock_requests()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
    v_count integer;
begin
    update public.knock_requests as kr
    set status = 'expired', updated_at = clock_timestamp()
    where kr.status in ('pending', 'approved')
      and kr.consumed_at is null
      and kr.expires_at <= clock_timestamp();

    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke all on function public.create_knock_request(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.respond_to_knock(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_knock_request_status(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_pending_knock_requests_for_session(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_knock_requests() from public, anon, authenticated, service_role;

grant execute on function public.create_knock_request(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.respond_to_knock(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.get_knock_request_status(uuid, uuid, uuid, text) to service_role;
grant execute on function public.get_pending_knock_requests_for_session(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.expire_knock_requests() to postgres;

-- Browser subscriptions can no longer read this table, and canonical polling is
-- now the delivery guarantee. Stop publishing retained Knock audit rows.
do $$
begin
    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'knock_requests'
    ) then
        alter publication supabase_realtime drop table public.knock_requests;
    end if;
end;
$$;

commit;
