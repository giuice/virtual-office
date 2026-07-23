-- Migration: screen_share_lease_and_media_realtime
-- Purpose: Authoritative per-space presenter lease and private Realtime media authorization.
-- This migration is intentionally local-first; no online target is changed here.

begin;

-- The established isolated owner has the minimum data rights required to
-- revalidate Presence under locks. Membership and CREATE are temporary.
grant presence_maintenance_owner to postgres;
grant create on schema public, private to presence_maintenance_owner;
grant select (id, supabase_uid, company_id, current_space_id, location_version, presence_access_revision)
  on public.users to presence_maintenance_owner;
grant select (id, company_id, status, presence_access_revision)
  on public.spaces to presence_maintenance_owner;
grant select on public.user_presence_sessions to presence_maintenance_owner;
grant select on public.revoked_presence_auth_sessions to presence_maintenance_owner;

create table public.screen_share_leases (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  presenter_user_id uuid not null references public.users(id) on delete cascade,
  presence_session_id uuid not null references public.user_presence_sessions(id) on delete cascade,
  auth_session_id uuid not null,
  share_id uuid not null,
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  heartbeat_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  released_at timestamptz,
  constraint screen_share_leases_company_share_key unique (company_id, share_id),
  constraint screen_share_leases_heartbeat_order check (heartbeat_at >= claimed_at),
  constraint screen_share_leases_expiry_order check (expires_at > heartbeat_at),
  constraint screen_share_leases_release_order check (
    released_at is null or released_at >= claimed_at
  )
);

alter table public.screen_share_leases owner to presence_maintenance_owner;
alter table public.screen_share_leases enable row level security;
alter table public.screen_share_leases force row level security;

revoke all on table public.screen_share_leases from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.screen_share_leases to presence_maintenance_owner;

create policy pmo_screen_share_leases_select
  on public.screen_share_leases for select to presence_maintenance_owner using (true);
create policy pmo_screen_share_leases_insert
  on public.screen_share_leases for insert to presence_maintenance_owner with check (true);
create policy pmo_screen_share_leases_update
  on public.screen_share_leases for update to presence_maintenance_owner using (true) with check (true);
create policy pmo_screen_share_leases_delete
  on public.screen_share_leases for delete to presence_maintenance_owner using (true);

-- Each FK has a supporting index. The active expiry index is intentionally
-- partial so stale/released lease history does not affect reconciliation scans.
create index idx_screen_share_leases_company_id on public.screen_share_leases (company_id);
create index idx_screen_share_leases_presenter_user_id on public.screen_share_leases (presenter_user_id);
create index idx_screen_share_leases_presence_session_id on public.screen_share_leases (presence_session_id);
create index idx_screen_share_leases_active_expiry
  on public.screen_share_leases (expires_at, space_id)
  where released_at is null;

-- Every observed RPC maps the verified Auth subject to the application user via
-- users.supabase_uid. The server route supplies the Auth subject only after
-- auth.getUser() verification; the database never compares auth UUIDs to users.id.
create or replace function public.claim_screen_share_observed(
  p_auth_subject text,
  p_auth_session_id uuid,
  p_presence_session_id uuid,
  p_space_id uuid,
  p_share_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user public.users%rowtype;
  v_space public.spaces%rowtype;
  v_session public.user_presence_sessions%rowtype;
  v_lease public.screen_share_leases%rowtype;
  v_user_count integer;
  v_now timestamptz;
begin
  if nullif(p_auth_subject, '') is null
     or p_auth_session_id is null
     or p_presence_session_id is null
     or p_space_id is null
     or p_share_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select pg_catalog.count(*)::integer
    into v_user_count
    from public.users as candidate
   where candidate.supabase_uid = p_auth_subject;
  if v_user_count <> 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  -- Canonical lock order: application user, space, exact Presence session, lease.
  select u.* into v_user
    from public.users as u
   where u.supabase_uid = p_auth_subject
   for no key update;
  select sp.* into v_space
    from public.spaces as sp
   where sp.id = p_space_id
   for no key update;
  select ps.* into v_session
    from public.user_presence_sessions as ps
   where ps.id = p_presence_session_id
   for update;
  select lease.* into v_lease
    from public.screen_share_leases as lease
   where lease.space_id = p_space_id
   for update;

  v_now := pg_catalog.clock_timestamp();
  if not found or v_user.company_id is null
     or v_space.company_id is distinct from v_user.company_id
     or v_space.status::text not in ('active', 'available')
     or v_user.current_space_id is distinct from p_space_id
     or v_session.user_id is distinct from v_user.id
     or v_session.company_id is distinct from v_user.company_id
     or v_session.auth_session_id is distinct from p_auth_session_id
     or v_session.space_id is distinct from p_space_id
     or v_session.placement_version is distinct from v_user.location_version
     or v_session.user_access_revision is distinct from v_user.presence_access_revision
     or v_session.space_access_revision is distinct from v_space.presence_access_revision
     or v_session.retired_at is not null
     or v_session.expires_at <= v_now
     or exists (
       select 1 from public.revoked_presence_auth_sessions as fence
        where fence.user_id = v_user.id
          and fence.auth_session_id = p_auth_session_id
     ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
  end if;

  if found and v_lease.released_at is null and v_lease.expires_at > v_now
     and (
       v_lease.presenter_user_id is distinct from v_user.id
       or v_lease.presence_session_id is distinct from p_presence_session_id
       or v_lease.auth_session_id is distinct from p_auth_session_id
       or v_lease.share_id is distinct from p_share_id
     ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRESENTER_BUSY');
  end if;

  insert into public.screen_share_leases as lease (
    space_id, company_id, presenter_user_id, presence_session_id,
    auth_session_id, share_id, claimed_at, heartbeat_at, expires_at, released_at
  ) values (
    p_space_id, v_user.company_id, v_user.id, p_presence_session_id,
    p_auth_session_id, p_share_id, v_now, v_now, v_now + interval '30 seconds', null
  ) on conflict (space_id) do update
    set company_id = excluded.company_id,
        presenter_user_id = excluded.presenter_user_id,
        presence_session_id = excluded.presence_session_id,
        auth_session_id = excluded.auth_session_id,
        share_id = excluded.share_id,
        claimed_at = excluded.claimed_at,
        heartbeat_at = excluded.heartbeat_at,
        expires_at = excluded.expires_at,
        released_at = null;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'CLAIMED',
    'shareId', p_share_id,
    'expiresAt', v_now + interval '30 seconds'
  );
end;
$$;

create or replace function public.renew_screen_share_observed(
  p_auth_subject text,
  p_auth_session_id uuid,
  p_presence_session_id uuid,
  p_space_id uuid,
  p_share_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user public.users%rowtype;
  v_space public.spaces%rowtype;
  v_session public.user_presence_sessions%rowtype;
  v_lease public.screen_share_leases%rowtype;
  v_user_count integer;
  v_now timestamptz;
begin
  if nullif(p_auth_subject, '') is null
     or p_auth_session_id is null
     or p_presence_session_id is null
     or p_space_id is null
     or p_share_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select pg_catalog.count(*)::integer into v_user_count
    from public.users as candidate where candidate.supabase_uid = p_auth_subject;
  if v_user_count <> 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  select u.* into v_user from public.users as u
   where u.supabase_uid = p_auth_subject for no key update;
  select sp.* into v_space from public.spaces as sp
   where sp.id = p_space_id for no key update;
  select ps.* into v_session from public.user_presence_sessions as ps
   where ps.id = p_presence_session_id for update;
  select lease.* into v_lease from public.screen_share_leases as lease
   where lease.space_id = p_space_id for update;

  v_now := pg_catalog.clock_timestamp();
  if not found or v_user.company_id is null
     or v_space.company_id is distinct from v_user.company_id
     or v_space.status::text not in ('active', 'available')
     or v_user.current_space_id is distinct from p_space_id
     or v_session.user_id is distinct from v_user.id
     or v_session.company_id is distinct from v_user.company_id
     or v_session.auth_session_id is distinct from p_auth_session_id
     or v_session.space_id is distinct from p_space_id
     or v_session.placement_version is distinct from v_user.location_version
     or v_session.user_access_revision is distinct from v_user.presence_access_revision
     or v_session.space_access_revision is distinct from v_space.presence_access_revision
     or v_session.retired_at is not null
     or v_session.expires_at <= v_now
     or exists (
       select 1 from public.revoked_presence_auth_sessions as fence
        where fence.user_id = v_user.id and fence.auth_session_id = p_auth_session_id
     ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
  end if;

  if not found
     or v_lease.released_at is not null
     or v_lease.expires_at <= v_now
     or v_lease.presenter_user_id is distinct from v_user.id
     or v_lease.presence_session_id is distinct from p_presence_session_id
     or v_lease.auth_session_id is distinct from p_auth_session_id
     or v_lease.share_id is distinct from p_share_id then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'LEASE_STALE');
  end if;

  update public.screen_share_leases as lease
     set heartbeat_at = v_now,
         expires_at = v_now + interval '30 seconds'
   where lease.space_id = p_space_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'RENEWED', 'shareId', p_share_id,
    'expiresAt', v_now + interval '30 seconds'
  );
end;
$$;

create or replace function public.release_screen_share_observed(
  p_auth_subject text,
  p_auth_session_id uuid,
  p_presence_session_id uuid,
  p_space_id uuid,
  p_share_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user public.users%rowtype;
  v_space public.spaces%rowtype;
  v_session public.user_presence_sessions%rowtype;
  v_lease public.screen_share_leases%rowtype;
  v_user_count integer;
  v_now timestamptz;
begin
  if nullif(p_auth_subject, '') is null
     or p_auth_session_id is null
     or p_presence_session_id is null
     or p_space_id is null
     or p_share_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select pg_catalog.count(*)::integer into v_user_count
    from public.users as candidate where candidate.supabase_uid = p_auth_subject;
  if v_user_count <> 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  select u.* into v_user from public.users as u
   where u.supabase_uid = p_auth_subject for no key update;
  select sp.* into v_space from public.spaces as sp
   where sp.id = p_space_id for no key update;
  select ps.* into v_session from public.user_presence_sessions as ps
   where ps.id = p_presence_session_id for update;
  select lease.* into v_lease from public.screen_share_leases as lease
   where lease.space_id = p_space_id for update;

  v_now := pg_catalog.clock_timestamp();
  if not found or v_user.company_id is null
     or v_space.company_id is distinct from v_user.company_id
     or v_space.status::text not in ('active', 'available')
     or v_user.current_space_id is distinct from p_space_id
     or v_session.user_id is distinct from v_user.id
     or v_session.company_id is distinct from v_user.company_id
     or v_session.auth_session_id is distinct from p_auth_session_id
     or v_session.space_id is distinct from p_space_id
     or v_session.placement_version is distinct from v_user.location_version
     or v_session.user_access_revision is distinct from v_user.presence_access_revision
     or v_session.space_access_revision is distinct from v_space.presence_access_revision
     or v_session.retired_at is not null
     or v_session.expires_at <= v_now
     or exists (
       select 1 from public.revoked_presence_auth_sessions as fence
        where fence.user_id = v_user.id and fence.auth_session_id = p_auth_session_id
     ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
  end if;

  if not found
     or v_lease.released_at is not null
     or v_lease.expires_at <= v_now
     or v_lease.presenter_user_id is distinct from v_user.id
     or v_lease.presence_session_id is distinct from p_presence_session_id
     or v_lease.auth_session_id is distinct from p_auth_session_id
     or v_lease.share_id is distinct from p_share_id then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'RELEASED', 'alreadyReleased', true);
  end if;

  update public.screen_share_leases as lease
     set released_at = v_now,
         expires_at = v_now
   where lease.space_id = p_space_id;

  return pg_catalog.jsonb_build_object('ok', true, 'code', 'RELEASED', 'alreadyReleased', false);
end;
$$;

create or replace function public.get_active_screen_share_observed(
  p_auth_subject text,
  p_auth_session_id uuid,
  p_presence_session_id uuid,
  p_space_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user public.users%rowtype;
  v_space public.spaces%rowtype;
  v_session public.user_presence_sessions%rowtype;
  v_lease public.screen_share_leases%rowtype;
  v_user_count integer;
  v_now timestamptz;
begin
  if nullif(p_auth_subject, '') is null
     or p_auth_session_id is null
     or p_presence_session_id is null
     or p_space_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select pg_catalog.count(*)::integer into v_user_count
    from public.users as candidate where candidate.supabase_uid = p_auth_subject;
  if v_user_count <> 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  select u.* into v_user from public.users as u
   where u.supabase_uid = p_auth_subject for no key update;
  select sp.* into v_space from public.spaces as sp
   where sp.id = p_space_id for no key update;
  select ps.* into v_session from public.user_presence_sessions as ps
   where ps.id = p_presence_session_id for update;
  select lease.* into v_lease from public.screen_share_leases as lease
   where lease.space_id = p_space_id for update;

  v_now := pg_catalog.clock_timestamp();
  if not found or v_user.company_id is null
     or v_space.company_id is distinct from v_user.company_id
     or v_space.status::text not in ('active', 'available')
     or v_user.current_space_id is distinct from p_space_id
     or v_session.user_id is distinct from v_user.id
     or v_session.company_id is distinct from v_user.company_id
     or v_session.auth_session_id is distinct from p_auth_session_id
     or v_session.space_id is distinct from p_space_id
     or v_session.placement_version is distinct from v_user.location_version
     or v_session.user_access_revision is distinct from v_user.presence_access_revision
     or v_session.space_access_revision is distinct from v_space.presence_access_revision
     or v_session.retired_at is not null
     or v_session.expires_at <= v_now
     or exists (
       select 1 from public.revoked_presence_auth_sessions as fence
        where fence.user_id = v_user.id and fence.auth_session_id = p_auth_session_id
     ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
  end if;

  if found and v_lease.released_at is null and v_lease.expires_at <= v_now then
    update public.screen_share_leases as lease
       set released_at = v_now
     where lease.space_id = p_space_id
       and lease.released_at is null
       and lease.expires_at <= v_now;
    select lease.* into v_lease from public.screen_share_leases as lease
     where lease.space_id = p_space_id;
  end if;

  if not found or v_lease.released_at is not null or v_lease.expires_at <= v_now then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'ACTIVE_READ', 'active', null);
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'ACTIVE_READ',
    'active', pg_catalog.jsonb_build_object(
      'spaceId', v_lease.space_id,
      'presenterUserId', v_lease.presenter_user_id,
      'shareId', v_lease.share_id,
      'expiresAt', v_lease.expires_at
    )
  );
end;
$$;

-- Realtime authorization is evaluated at channel connect and cached there.
-- This helper accepts exactly company:<uuid>:space:<uuid>:media and proves the
-- requester is a current qualifying occupant for that exact Presence session.
create or replace function private.is_media_topic_authorized(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_claims jsonb;
  v_subject text;
  v_auth_session_id uuid;
  v_topic text;
  v_parts text[];
  v_user public.users%rowtype;
  v_space public.spaces%rowtype;
  v_session public.user_presence_sessions%rowtype;
  v_now timestamptz;
begin
  begin
    v_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
    v_auth_session_id := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  v_subject := nullif(v_claims ->> 'sub', '');
  v_topic := p_topic;
  v_parts := pg_catalog.regexp_match(
    v_topic,
    '^company:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):space:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):media$'
  );
  if v_subject is null or v_auth_session_id is null or v_parts is null then
    return false;
  end if;

  select u.* into v_user
    from public.users as u
   where u.supabase_uid = v_subject;
  if not found or v_user.company_id is null then
    return false;
  end if;

  begin
    if v_topic is distinct from
       'company:' || v_user.company_id::text || ':space:' || v_parts[2]::uuid::text || ':media' then
      return false;
    end if;
  exception when invalid_text_representation then
    return false;
  end;

  select sp.* into v_space
    from public.spaces as sp
   where sp.id = v_parts[2]::uuid;
  if not found or v_space.company_id is distinct from v_user.company_id
     or v_space.status::text not in ('active', 'available')
     or v_user.current_space_id is distinct from v_space.id then
    return false;
  end if;

  v_now := pg_catalog.clock_timestamp();
  select ps.* into v_session
    from public.user_presence_sessions as ps
   where ps.user_id = v_user.id
     and ps.auth_session_id = v_auth_session_id
     and ps.company_id = v_user.company_id
     and ps.space_id = v_space.id
     and ps.placement_version = v_user.location_version
     and ps.user_access_revision = v_user.presence_access_revision
     and ps.space_access_revision = v_space.presence_access_revision
     and ps.retired_at is null
     and ps.expires_at > v_now
   order by ps.id
   limit 1;

  return found and not exists (
    select 1 from public.revoked_presence_auth_sessions as fence
     where fence.user_id = v_user.id and fence.auth_session_id = v_auth_session_id
  );
end;
$$;

alter function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid)
  owner to presence_maintenance_owner;
alter function public.renew_screen_share_observed(text, uuid, uuid, uuid, uuid)
  owner to presence_maintenance_owner;
alter function public.release_screen_share_observed(text, uuid, uuid, uuid, uuid)
  owner to presence_maintenance_owner;
alter function public.get_active_screen_share_observed(text, uuid, uuid, uuid)
  owner to presence_maintenance_owner;
alter function private.is_media_topic_authorized(text)
  owner to presence_maintenance_owner;

revoke all on function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.renew_screen_share_observed(text, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.release_screen_share_observed(text, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_active_screen_share_observed(text, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.is_media_topic_authorized(text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function public.renew_screen_share_observed(text, uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function public.release_screen_share_observed(text, uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function public.get_active_screen_share_observed(text, uuid, uuid, uuid)
  to service_role;
grant execute on function private.is_media_topic_authorized(text)
  to authenticated;

-- Do not create custom objects in realtime. Its supported surface is four exact
-- RLS policies on realtime.messages for private Broadcast and Presence traffic.
drop policy if exists phase8_media_broadcast_receive on realtime.messages;
create policy phase8_media_broadcast_receive
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.is_media_topic_authorized((select realtime.topic()))
  );

drop policy if exists phase8_media_broadcast_send on realtime.messages;
create policy phase8_media_broadcast_send
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and private.is_media_topic_authorized((select realtime.topic()))
  );

drop policy if exists phase8_media_presence_receive on realtime.messages;
create policy phase8_media_presence_receive
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'presence'
    and private.is_media_topic_authorized((select realtime.topic()))
  );

drop policy if exists phase8_media_presence_track on realtime.messages;
create policy phase8_media_presence_track
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and private.is_media_topic_authorized((select realtime.topic()))
  );

-- Migration-time local catalog assertions make drift a hard failure.
do $$
declare
  v_constraint_count integer;
  v_index_count integer;
  v_function_count integer;
  v_policy_count integer;
  v_media_policy_count integer;
begin
  if not exists (
    select 1 from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'screen_share_leases'
      and relation.relkind = 'r'
      and relation.relrowsecurity
      and relation.relforcerowsecurity
      and pg_catalog.pg_get_userbyid(relation.relowner) = 'presence_maintenance_owner'
  ) then
    raise exception 'SCREEN_SHARE_LEASE_RLS_READBACK_FAILED';
  end if;

  select pg_catalog.count(*) into v_constraint_count
    from pg_catalog.pg_constraint as constraint_row
   where constraint_row.conrelid = 'public.screen_share_leases'::pg_catalog.regclass
     and constraint_row.conname in (
       'screen_share_leases_pkey',
       'screen_share_leases_company_share_key',
       'screen_share_leases_heartbeat_order',
       'screen_share_leases_expiry_order',
       'screen_share_leases_release_order'
     );
  if v_constraint_count <> 5 then
    raise exception 'SCREEN_SHARE_LEASE_CONSTRAINT_READBACK_FAILED count=%', v_constraint_count;
  end if;

  select pg_catalog.count(*) into v_index_count
    from pg_catalog.pg_indexes as index_row
   where index_row.schemaname = 'public'
     and index_row.tablename = 'screen_share_leases'
     and index_row.indexname in (
       'idx_screen_share_leases_company_id',
       'idx_screen_share_leases_presenter_user_id',
       'idx_screen_share_leases_presence_session_id',
       'idx_screen_share_leases_active_expiry'
     );
  if v_index_count <> 4 then
    raise exception 'SCREEN_SHARE_LEASE_INDEX_READBACK_FAILED count=%', v_index_count;
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.screen_share_leases', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.screen_share_leases', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.screen_share_leases', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.screen_share_leases', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.screen_share_leases', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.screen_share_leases', 'SELECT') then
    raise exception 'SCREEN_SHARE_LEASE_GRANT_READBACK_FAILED';
  end if;

  select pg_catalog.count(*) into v_function_count
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure_row.pronamespace
   where (namespace.nspname, procedure_row.proname) in (
       ('public', 'claim_screen_share_observed'),
       ('public', 'renew_screen_share_observed'),
       ('public', 'release_screen_share_observed'),
       ('public', 'get_active_screen_share_observed'),
       ('private', 'is_media_topic_authorized')
   )
     and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'presence_maintenance_owner'
     and procedure_row.prosecdef
     and procedure_row.proconfig = array['search_path=pg_catalog']::text[];
  if v_function_count <> 5 then
    raise exception 'SCREEN_SHARE_FUNCTION_READBACK_FAILED count=%', v_function_count;
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.renew_screen_share_observed(text,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.release_screen_share_observed(text,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.get_active_screen_share_observed(text,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'SCREEN_SHARE_FUNCTION_GRANT_READBACK_FAILED';
  end if;

  select pg_catalog.count(*) into v_policy_count
    from pg_catalog.pg_policy as policy_row
   where policy_row.polrelid = 'realtime.messages'::pg_catalog.regclass
     and policy_row.polname in (
       'phase8_media_broadcast_receive',
       'phase8_media_broadcast_send',
       'phase8_media_presence_receive',
       'phase8_media_presence_track'
     )
     and policy_row.polroles = array['authenticated'::pg_catalog.regrole::oid];
  if v_policy_count <> 4 then
    raise exception 'SCREEN_SHARE_REALTIME_POLICY_READBACK_FAILED count=%', v_policy_count;
  end if;

  select pg_catalog.count(*) into v_media_policy_count
    from pg_catalog.pg_policies as policy_row
   where policy_row.schemaname = 'realtime'
     and policy_row.tablename = 'messages'
     and policy_row.policyname in (
       'phase8_media_broadcast_receive',
       'phase8_media_broadcast_send',
       'phase8_media_presence_receive',
       'phase8_media_presence_track'
     )
     and (
       policy_row.qual ilike '%is_media_topic_authorized%'
       or policy_row.with_check ilike '%is_media_topic_authorized%'
     );
  if v_media_policy_count <> 4 then
    raise exception 'SCREEN_SHARE_REALTIME_POLICY_EXPRESSION_READBACK_FAILED count=%', v_media_policy_count;
  end if;
end;
$$;

revoke create on schema public, private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

commit;
