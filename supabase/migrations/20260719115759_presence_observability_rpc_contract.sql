-- Migration: presence_observability_rpc_contract
-- Purpose:   Expose transaction-authoritative Presence observability fields without widening browser data access.
-- Author:    Giuliano Lemes   Date (UTC): 2026-07-19

begin;

grant presence_maintenance_owner to postgres;
grant create on schema public, private to presence_maintenance_owner;

-- Preserve the exact pre-transition version without changing the already
-- deployed transition function's public result type. The row written by the
-- current transaction is identified by xmin; another transition for the same
-- user may be waiting with a different transaction ID and must not be touched.
alter table public.location_transition_requests
  add column if not exists previous_location_version integer;

create or replace function private.capture_presence_transition_previous_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.location_version is distinct from old.location_version then
    update public.location_transition_requests as request
    set previous_location_version = old.location_version
    where request.user_id = old.id
      and request.result is null
      and request.previous_location_version is null
      and request.xmin::text = pg_catalog.pg_current_xact_id()::text;
  end if;

  return new;
end;
$$;

alter function private.capture_presence_transition_previous_version()
  owner to presence_maintenance_owner;
revoke all on function private.capture_presence_transition_previous_version()
  from public, anon, authenticated, service_role;

drop trigger if exists users_capture_presence_transition_previous_version
  on public.users;
create trigger users_capture_presence_transition_previous_version
before update on public.users
for each row
execute function private.capture_presence_transition_previous_version();

-- A stored terminal result with no user-version update (for example a
-- rejected command or Logout that preserves another active device) captures
-- the still-current version at the same result write. Successful mutations
-- already populated the exact OLD value through the users trigger above.
create or replace function private.fill_presence_transition_previous_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.result is null
     and new.result is not null
     and new.previous_location_version is null then
    select app_user.location_version
    into new.previous_location_version
    from public.users as app_user
    where app_user.id = new.user_id;
  end if;

  return new;
end;
$$;

alter function private.fill_presence_transition_previous_version()
  owner to presence_maintenance_owner;
revoke all on function private.fill_presence_transition_previous_version()
  from public, anon, authenticated, service_role;

drop trigger if exists transition_result_fill_previous_location_version
  on public.location_transition_requests;
create trigger transition_result_fill_previous_location_version
before update of result on public.location_transition_requests
for each row
execute function private.fill_presence_transition_previous_version();

create or replace function public.transition_user_location_observed(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_session_id uuid,
  p_transition_id uuid,
  p_target_space_id uuid,
  p_reason text,
  p_knock_request_id text,
  p_expected_location_version integer
)
returns table (
  ok boolean,
  code text,
  message text,
  transition_id uuid,
  previous_space_id uuid,
  current_space_id uuid,
  location_version integer,
  already_applied boolean,
  authorized_by uuid,
  previous_location_version integer,
  authorization_mode text
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_core record;
begin
  select *
  into v_core
  from public.transition_user_location(
    p_user_id,
    p_auth_session_id,
    p_session_id,
    p_transition_id,
    p_target_space_id,
    p_reason,
    p_knock_request_id,
    p_expected_location_version
  );

  return query
  select
    v_core.ok::boolean,
    v_core.code::text,
    v_core.message::text,
    v_core.transition_id::uuid,
    v_core.previous_space_id::uuid,
    v_core.current_space_id::uuid,
    v_core.location_version::integer,
    v_core.already_applied::boolean,
    v_core.authorized_by::uuid,
    request.previous_location_version,
    request.result ->> 'authorizationMode'
  from (select 1) as singleton
  left join public.location_transition_requests as request
    on request.user_id = p_user_id
   and request.transition_id = p_transition_id;
end;
$$;

alter function public.transition_user_location_observed(
  uuid, uuid, uuid, uuid, uuid, text, text, integer
) owner to presence_maintenance_owner;
revoke all on function public.transition_user_location_observed(
  uuid, uuid, uuid, uuid, uuid, text, text, integer
) from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.transition_user_location_observed(
  uuid, uuid, uuid, uuid, uuid, text, text, integer
) to service_role;

-- These wrappers call the existing mutation first, then count active,
-- unfenced leases inside the same RPC transaction. No follow-up HTTP query or
-- client clock participates in the count.
create or replace function public.register_presence_session_observed(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_registration_id uuid,
  p_expected_company_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_count_at timestamptz;
  v_active_session_count integer;
begin
  v_result := public.register_presence_session(
    p_user_id,
    p_auth_session_id,
    p_registration_id,
    p_expected_company_id
  );
  v_count_at := pg_catalog.clock_timestamp();

  select pg_catalog.count(*)::integer
  into v_active_session_count
  from public.user_presence_sessions as session
  where session.user_id = p_user_id
    and session.retired_at is null
    and session.expires_at > v_count_at
    and not exists (
      select 1
      from public.revoked_presence_auth_sessions as fence
      where fence.user_id = session.user_id
        and fence.auth_session_id = session.auth_session_id
    );

  return v_result || pg_catalog.jsonb_build_object(
    'activeSessionCount', v_active_session_count
  );
end;
$$;

create or replace function public.heartbeat_presence_session_observed(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_count_at timestamptz;
  v_active_session_count integer;
begin
  v_result := public.heartbeat_presence_session(
    p_user_id,
    p_auth_session_id,
    p_session_id
  );
  v_count_at := pg_catalog.clock_timestamp();

  select pg_catalog.count(*)::integer
  into v_active_session_count
  from public.user_presence_sessions as session
  where session.user_id = p_user_id
    and session.retired_at is null
    and session.expires_at > v_count_at
    and not exists (
      select 1
      from public.revoked_presence_auth_sessions as fence
      where fence.user_id = session.user_id
        and fence.auth_session_id = session.auth_session_id
    );

  return v_result || pg_catalog.jsonb_build_object(
    'activeSessionCount', v_active_session_count
  );
end;
$$;

create or replace function public.disconnect_presence_session_observed(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_count_at timestamptz;
  v_active_session_count integer;
begin
  v_result := public.disconnect_presence_session(
    p_user_id,
    p_auth_session_id,
    p_session_id
  );
  v_count_at := pg_catalog.clock_timestamp();

  select pg_catalog.count(*)::integer
  into v_active_session_count
  from public.user_presence_sessions as session
  where session.user_id = p_user_id
    and session.retired_at is null
    and session.expires_at > v_count_at
    and not exists (
      select 1
      from public.revoked_presence_auth_sessions as fence
      where fence.user_id = session.user_id
        and fence.auth_session_id = session.auth_session_id
    );

  return v_result || pg_catalog.jsonb_build_object(
    'activeSessionCount', v_active_session_count
  );
end;
$$;

alter function public.register_presence_session_observed(uuid, uuid, uuid, uuid)
  owner to presence_maintenance_owner;
alter function public.heartbeat_presence_session_observed(uuid, uuid, uuid)
  owner to presence_maintenance_owner;
alter function public.disconnect_presence_session_observed(uuid, uuid, uuid)
  owner to presence_maintenance_owner;

revoke all on function public.register_presence_session_observed(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role, presence_maintenance_owner;
revoke all on function public.heartbeat_presence_session_observed(uuid, uuid, uuid)
  from public, anon, authenticated, service_role, presence_maintenance_owner;
revoke all on function public.disconnect_presence_session_observed(uuid, uuid, uuid)
  from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.register_presence_session_observed(uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function public.heartbeat_presence_session_observed(uuid, uuid, uuid)
  to service_role;
grant execute on function public.disconnect_presence_session_observed(uuid, uuid, uuid)
  to service_role;

-- Knock wrappers expose only immutable validation revisions and low-cardinality
-- version evidence. Routes keep these fields out of public HTTP bodies.
create or replace function public.create_knock_request_observed(
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
  v_result jsonb;
  v_knock public.knock_requests%rowtype;
  v_before integer;
begin
  v_result := public.create_knock_request(
    p_requester_id,
    p_auth_session_id,
    p_session_id,
    p_space_id,
    p_request_id
  );

  select knock.*
  into v_knock
  from public.knock_requests as knock
  where knock.id = p_request_id
    and knock.requester_id = p_requester_id;

  if not found or coalesce(v_result ->> 'code', '') <> 'KNOCK_CREATED' then
    return v_result;
  end if;

  v_before := v_knock.requester_location_version - 1;

  return v_result || pg_catalog.jsonb_build_object(
    'requesterLocationVersionBefore', v_before,
    'requesterLocationVersionAfter', v_knock.requester_location_version,
    'requesterAccessRevision', v_knock.requester_access_revision,
    'spaceAccessRevision', v_knock.space_access_revision
  );
end;
$$;

create or replace function public.respond_to_knock_observed(
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
  v_result jsonb;
  v_knock public.knock_requests%rowtype;
  v_observation jsonb;
begin
  v_result := public.respond_to_knock(
    p_responder_id,
    p_auth_session_id,
    p_session_id,
    p_request_id,
    p_decision
  );

  select knock.*
  into v_knock
  from public.knock_requests as knock
  where knock.id = p_request_id;

  -- Do not enrich pre-authorization failures. The core function returns one
  -- of these codes only after validating the responder lease and tenant.
  if not found or coalesce(v_result ->> 'code', '') not in (
    'KNOCK_RESPONDED',
    'KNOCK_ALREADY_RESOLVED',
    'KNOCK_EXPIRED',
    'KNOCK_SUPERSEDED'
  ) then
    return v_result;
  end if;

  v_observation := pg_catalog.jsonb_build_object(
    'requesterUserId', v_knock.requester_id,
    'spaceId', v_knock.space_id,
    'requesterLocationVersionAfter', v_knock.requester_location_version,
    'requesterAccessRevision', v_knock.requester_access_revision,
    'spaceAccessRevision', v_knock.space_access_revision
  );
  if v_knock.responder_access_revision is not null then
    v_observation := v_observation || pg_catalog.jsonb_build_object(
      'responderAccessRevision', v_knock.responder_access_revision
    );
  end if;

  return v_result || v_observation;
end;
$$;

create or replace function public.get_knock_request_status_observed(
  p_requester_id uuid,
  p_auth_session_id uuid,
  p_session_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_knock public.knock_requests%rowtype;
  v_observation jsonb;
begin
  -- Authorize first so a guessed cross-company ID cannot acquire a row lock.
  v_result := public.get_knock_request_status(
    p_requester_id,
    p_auth_session_id,
    p_session_id,
    p_request_id
  );

  -- KNOCK_NOT_FOUND includes cross-company IDs hidden by the core function;
  -- SESSION_INVALID is likewise pre-authorization. Never enrich either.
  if coalesce(v_result ->> 'code', '') not in (
    'KNOCK_STATUS',
    'KNOCK_SUPERSEDED'
  ) then
    return v_result;
  end if;

  -- After authorization, stabilize the Knock row against a concurrent
  -- responder. Re-read the core result while holding the row lock so the
  -- returned state and revision evidence describe the same row generation.
  select knock.*
  into v_knock
  from public.knock_requests as knock
  where knock.id = p_request_id
    and knock.requester_id = p_requester_id
  for share;

  if not found then
    return v_result;
  end if;

  v_result := public.get_knock_request_status(
    p_requester_id,
    p_auth_session_id,
    p_session_id,
    p_request_id
  );
  if coalesce(v_result ->> 'code', '') not in (
    'KNOCK_STATUS',
    'KNOCK_SUPERSEDED'
  ) then
    return v_result;
  end if;

  v_observation := pg_catalog.jsonb_build_object(
    'requesterUserId', v_knock.requester_id,
    'spaceId', v_knock.space_id,
    'requesterLocationVersionAfter', v_knock.requester_location_version,
    'requesterAccessRevision', v_knock.requester_access_revision,
    'spaceAccessRevision', v_knock.space_access_revision
  );
  if v_knock.responder_access_revision is not null then
    v_observation := v_observation || pg_catalog.jsonb_build_object(
      'responderAccessRevision', v_knock.responder_access_revision
    );
  end if;

  return v_result || v_observation;
end;
$$;

-- The core uses clock_timestamp() to normalize expiry and is therefore
-- truthfully VOLATILE. Snapshot coherence is provided by the wrapper's
-- post-authorization row lock and second core read, not a false volatility tag.
alter function public.get_knock_request_status(uuid, uuid, uuid, text) volatile;

alter function public.create_knock_request_observed(uuid, uuid, uuid, uuid, text)
  owner to presence_maintenance_owner;
alter function public.respond_to_knock_observed(uuid, uuid, uuid, text, text)
  owner to presence_maintenance_owner;
alter function public.get_knock_request_status_observed(uuid, uuid, uuid, text)
  owner to presence_maintenance_owner;

revoke all on function public.create_knock_request_observed(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role, presence_maintenance_owner;
revoke all on function public.respond_to_knock_observed(uuid, uuid, uuid, text, text)
  from public, anon, authenticated, service_role, presence_maintenance_owner;
revoke all on function public.get_knock_request_status_observed(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role, presence_maintenance_owner;
grant execute on function public.create_knock_request_observed(uuid, uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.respond_to_knock_observed(uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.get_knock_request_status_observed(uuid, uuid, uuid, text)
  to service_role;

revoke create on schema public, private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

commit;
