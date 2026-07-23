-- Migration: screen_share_lease_and_media_realtime
-- Purpose: authoritative per-space presenter lease and private Realtime media authorization.
-- This migration is local-first; it does not apply or link an online project.

begin;

grant presence_maintenance_owner to postgres;
grant create on schema public, private to presence_maintenance_owner;

-- The isolated function owner receives only the columns used by the lease
-- revalidation path. Do not replace these with table-wide SELECT grants.
grant select (id, supabase_uid, company_id, current_space_id, location_version, presence_access_revision)
  on public.users to presence_maintenance_owner;
grant select (id, company_id, status, presence_access_revision)
  on public.spaces to presence_maintenance_owner;
grant select (id, user_id, auth_session_id, company_id, space_id, placement_version,
              user_access_revision, space_access_revision, expires_at, retired_at)
  on public.user_presence_sessions to presence_maintenance_owner;
grant select (auth_session_id, user_id) on public.revoked_presence_auth_sessions
  to presence_maintenance_owner;

create table public.screen_share_leases (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  presenter_user_id uuid not null references public.users(id) on delete cascade,
  presence_session_id uuid not null references public.user_presence_sessions(id) on delete cascade,
  auth_session_id uuid not null,
  share_id uuid not null,
  presenter_location_version integer not null,
  presenter_access_revision bigint not null,
  space_access_revision bigint not null,
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  heartbeat_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  released_at timestamptz,
  constraint screen_share_leases_company_share_key unique (company_id, share_id),
  constraint screen_share_leases_heartbeat_order check (heartbeat_at >= claimed_at),
  constraint screen_share_leases_expiry_order check (expires_at > heartbeat_at),
  constraint screen_share_leases_release_order check (released_at is null or released_at >= claimed_at)
);

alter table public.screen_share_leases owner to presence_maintenance_owner;
alter table public.screen_share_leases enable row level security;
alter table public.screen_share_leases force row level security;
revoke all on table public.screen_share_leases from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.screen_share_leases to presence_maintenance_owner;
create policy pmo_screen_share_leases_all on public.screen_share_leases
  for all to presence_maintenance_owner using (true) with check (true);

create index idx_screen_share_leases_company_id on public.screen_share_leases (company_id);
create index idx_screen_share_leases_presenter_user_id on public.screen_share_leases (presenter_user_id);
create index idx_screen_share_leases_presence_session_id on public.screen_share_leases (presence_session_id);
create index idx_screen_share_leases_active_expiry
  on public.screen_share_leases (expires_at, space_id) where released_at is null;

-- Lock order matches Presence transitions: sorted user rows, company, space,
-- sorted sessions, then this space's lease. A lease owner changed after the
-- preliminary lookup returns RETRY_LOCK_SET rather than taking an out-of-order
-- owner lock. Callers may retry the bounded structural conflict.
create or replace function private.screen_share_context_observed(
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
  v_now timestamptz;
  v_viewer_id uuid;
  v_viewer_company_id uuid;
  v_viewer_space_id uuid;
  v_viewer_location_version integer;
  v_viewer_access_revision bigint;
  v_preliminary_owner_id uuid;
  v_preliminary_owner_session_id uuid;
  v_lease_space_id uuid;
  v_lease_company_id uuid;
  v_lease_owner_id uuid;
  v_lease_presence_session_id uuid;
  v_lease_auth_session_id uuid;
  v_lease_share_id uuid;
  v_lease_location_version integer;
  v_lease_user_access_revision bigint;
  v_lease_space_access_revision bigint;
  v_lease_expires_at timestamptz;
  v_lease_released_at timestamptz;
  v_space_company_id uuid;
  v_space_status text;
  v_space_access_revision bigint;
  v_session_user_id uuid;
  v_session_auth_session_id uuid;
  v_session_company_id uuid;
  v_session_space_id uuid;
  v_session_location_version integer;
  v_session_user_access_revision bigint;
  v_session_space_access_revision bigint;
  v_session_expires_at timestamptz;
  v_session_retired_at timestamptz;
  v_owner_company_id uuid;
  v_owner_space_id uuid;
  v_owner_location_version integer;
  v_owner_access_revision bigint;
  v_owner_subject text;
  v_owner_session_user_id uuid;
  v_owner_session_auth_session_id uuid;
  v_owner_session_company_id uuid;
  v_owner_session_space_id uuid;
  v_owner_session_location_version integer;
  v_owner_session_user_access_revision bigint;
  v_owner_session_space_access_revision bigint;
  v_owner_session_expires_at timestamptz;
  v_owner_session_retired_at timestamptz;
  v_viewer_found boolean := false;
  v_company_found boolean := false;
  v_space_found boolean := false;
  v_session_found boolean := false;
  v_lease_found boolean := false;
  v_owner_found boolean := false;
  v_owner_session_found boolean := false;
  v_lease_valid boolean := false;
  v_viewer_valid boolean := false;
  v_owner_changed boolean := false;
begin
  if nullif(p_auth_subject, '') is null or p_auth_session_id is null
     or p_presence_session_id is null or p_space_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  -- This unlocked read only builds the complete lock set; all authority is reread.
  select l.presenter_user_id, l.presence_session_id
    into v_preliminary_owner_id, v_preliminary_owner_session_id
    from public.screen_share_leases as l where l.space_id = p_space_id;
  v_lease_found := found;

  select u.id into v_viewer_id from public.users as u where u.supabase_uid = p_auth_subject;
  v_viewer_found := found;
  if not v_viewer_found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  perform u.id from public.users as u
   where u.id in (v_viewer_id, v_preliminary_owner_id)
   order by u.id for no key update;

  select u.id, u.company_id, u.current_space_id, u.location_version, u.presence_access_revision
    into v_viewer_id, v_viewer_company_id, v_viewer_space_id, v_viewer_location_version, v_viewer_access_revision
    from public.users as u where u.id = v_viewer_id and u.supabase_uid = p_auth_subject;
  v_viewer_found := found;
  if not v_viewer_found or v_viewer_company_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  perform c.id from public.companies as c where c.id = v_viewer_company_id for no key update;
  v_company_found := found;
  perform s.id from public.spaces as s where s.id = p_space_id for no key update;
  select s.company_id, s.status::text, s.presence_access_revision
    into v_space_company_id, v_space_status, v_space_access_revision
    from public.spaces as s where s.id = p_space_id;
  v_space_found := found;

  perform ps.id from public.user_presence_sessions as ps
   where ps.id in (p_presence_session_id, v_preliminary_owner_session_id)
   order by ps.id for update;

  select l.space_id, l.company_id, l.presenter_user_id, l.presence_session_id,
         l.auth_session_id, l.share_id, l.presenter_location_version,
         l.presenter_access_revision, l.space_access_revision, l.expires_at, l.released_at
    into v_lease_space_id, v_lease_company_id, v_lease_owner_id, v_lease_presence_session_id,
         v_lease_auth_session_id, v_lease_share_id, v_lease_location_version,
         v_lease_user_access_revision, v_lease_space_access_revision, v_lease_expires_at, v_lease_released_at
    from public.screen_share_leases as l where l.space_id = p_space_id for update;
  v_lease_found := found;

  v_owner_changed := v_lease_found and (
    v_lease_owner_id is distinct from v_preliminary_owner_id
    or v_lease_presence_session_id is distinct from v_preliminary_owner_session_id
  );
  if v_owner_changed then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'RETRY_LOCK_SET');
  end if;

  select ps.user_id, ps.auth_session_id, ps.company_id, ps.space_id, ps.placement_version,
         ps.user_access_revision, ps.space_access_revision, ps.expires_at, ps.retired_at
    into v_session_user_id, v_session_auth_session_id, v_session_company_id, v_session_space_id,
         v_session_location_version, v_session_user_access_revision, v_session_space_access_revision,
         v_session_expires_at, v_session_retired_at
    from public.user_presence_sessions as ps where ps.id = p_presence_session_id;
  v_session_found := found;
  v_now := pg_catalog.clock_timestamp();

  v_viewer_valid := v_company_found and v_space_found
    and v_space_company_id is not distinct from v_viewer_company_id
    and v_space_status in ('active', 'available')
    and v_viewer_space_id is not distinct from p_space_id
    and v_session_found
    and v_session_user_id is not distinct from v_viewer_id
    and v_session_auth_session_id is not distinct from p_auth_session_id
    and v_session_company_id is not distinct from v_viewer_company_id
    and v_session_space_id is not distinct from p_space_id
    and v_session_location_version is not distinct from v_viewer_location_version
    and v_session_user_access_revision is not distinct from v_viewer_access_revision
    and v_session_space_access_revision is not distinct from v_space_access_revision
    and v_session_retired_at is null and v_session_expires_at > v_now
    and not exists (
      select 1 from public.revoked_presence_auth_sessions as f
       where f.user_id = v_viewer_id and f.auth_session_id = p_auth_session_id
    )
    and not private.presence_auth_session_absent(p_auth_session_id, v_viewer_id);
  if not v_viewer_valid then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
  end if;

  if v_lease_found and v_lease_released_at is null and v_lease_expires_at > v_now then
    select u.company_id, u.current_space_id, u.location_version, u.presence_access_revision, u.supabase_uid
      into v_owner_company_id, v_owner_space_id, v_owner_location_version, v_owner_access_revision, v_owner_subject
      from public.users as u where u.id = v_lease_owner_id;
    v_owner_found := found;
    select ps.user_id, ps.auth_session_id, ps.company_id, ps.space_id, ps.placement_version,
           ps.user_access_revision, ps.space_access_revision, ps.expires_at, ps.retired_at
      into v_owner_session_user_id, v_owner_session_auth_session_id, v_owner_session_company_id,
           v_owner_session_space_id, v_owner_session_location_version,
           v_owner_session_user_access_revision, v_owner_session_space_access_revision,
           v_owner_session_expires_at, v_owner_session_retired_at
      from public.user_presence_sessions as ps where ps.id = v_lease_presence_session_id;
    v_owner_session_found := found;

    v_lease_valid := v_owner_found and v_owner_session_found
      and v_lease_company_id is not distinct from v_viewer_company_id
      and v_owner_company_id is not distinct from v_lease_company_id
      and v_owner_space_id is not distinct from p_space_id
      and v_owner_location_version is not distinct from v_lease_location_version
      and v_owner_access_revision is not distinct from v_lease_user_access_revision
      and v_lease_space_access_revision is not distinct from v_space_access_revision
      and v_owner_subject is not null
      and v_owner_session_user_id is not distinct from v_lease_owner_id
      and v_owner_session_auth_session_id is not distinct from v_lease_auth_session_id
      and v_owner_session_company_id is not distinct from v_lease_company_id
      and v_owner_session_space_id is not distinct from p_space_id
      and v_owner_session_location_version is not distinct from v_lease_location_version
      and v_owner_session_user_access_revision is not distinct from v_lease_user_access_revision
      and v_owner_session_space_access_revision is not distinct from v_lease_space_access_revision
      and v_owner_session_retired_at is null and v_owner_session_expires_at > v_now
      and not exists (
        select 1 from public.revoked_presence_auth_sessions as f
         where f.user_id = v_lease_owner_id and f.auth_session_id = v_lease_auth_session_id
      )
      and not private.presence_auth_session_absent(v_lease_auth_session_id, v_lease_owner_id);

    if not v_lease_valid then
      update public.screen_share_leases as l
         set released_at = v_now, expires_at = v_now
       where l.space_id = p_space_id and l.released_at is null;
      v_lease_released_at := v_now;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'CONTEXT_VALID',
    'viewer', pg_catalog.jsonb_build_object(
      'id', v_viewer_id, 'companyId', v_viewer_company_id,
      'locationVersion', v_viewer_location_version, 'accessRevision', v_viewer_access_revision,
      'spaceAccessRevision', v_space_access_revision
    ),
    'lease', case when v_lease_found then pg_catalog.jsonb_build_object(
      'presenterUserId', v_lease_owner_id, 'presenceSessionId', v_lease_presence_session_id,
      'authSessionId', v_lease_auth_session_id, 'shareId', v_lease_share_id,
      'locationVersion', v_lease_location_version, 'userAccessRevision', v_lease_user_access_revision,
      'spaceAccessRevision', v_lease_space_access_revision, 'expiresAt', v_lease_expires_at,
      'releasedAt', v_lease_released_at,
      'active', coalesce(v_lease_valid, false) and v_lease_released_at is null and v_lease_expires_at > v_now
    ) else null end
  );
end;
$$;

create or replace function public.claim_screen_share_observed(p_auth_subject text, p_auth_session_id uuid, p_presence_session_id uuid, p_space_id uuid, p_share_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_context jsonb; v_viewer jsonb; v_lease jsonb; v_now timestamptz;
begin
  if nullif(p_auth_subject, '') is null or p_auth_session_id is null or p_presence_session_id is null or p_space_id is null or p_share_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  v_context := private.screen_share_context_observed(p_auth_subject, p_auth_session_id, p_presence_session_id, p_space_id);
  if not coalesce((v_context ->> 'ok')::boolean, false) then return v_context; end if;
  v_lease := v_context -> 'lease';
  if coalesce((v_lease ->> 'active')::boolean, false) and (
    (v_lease ->> 'presenterUserId')::uuid is distinct from (v_context -> 'viewer' ->> 'id')::uuid
    or (v_lease ->> 'presenceSessionId')::uuid is distinct from p_presence_session_id
    or (v_lease ->> 'authSessionId')::uuid is distinct from p_auth_session_id
    or (v_lease ->> 'shareId')::uuid is distinct from p_share_id
  ) then return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRESENTER_BUSY'); end if;
  v_viewer := v_context -> 'viewer'; v_now := pg_catalog.clock_timestamp();
  insert into public.screen_share_leases as l (space_id, company_id, presenter_user_id, presence_session_id, auth_session_id, share_id, presenter_location_version, presenter_access_revision, space_access_revision, claimed_at, heartbeat_at, expires_at, released_at)
  values (p_space_id, (v_viewer ->> 'companyId')::uuid, (v_viewer ->> 'id')::uuid, p_presence_session_id, p_auth_session_id, p_share_id, (v_viewer ->> 'locationVersion')::integer, (v_viewer ->> 'accessRevision')::bigint, (v_viewer ->> 'spaceAccessRevision')::bigint, v_now, v_now, v_now + interval '30 seconds', null)
  on conflict (space_id) do update set company_id = excluded.company_id, presenter_user_id = excluded.presenter_user_id, presence_session_id = excluded.presence_session_id, auth_session_id = excluded.auth_session_id, share_id = excluded.share_id, presenter_location_version = excluded.presenter_location_version, presenter_access_revision = excluded.presenter_access_revision, space_access_revision = excluded.space_access_revision, claimed_at = excluded.claimed_at, heartbeat_at = excluded.heartbeat_at, expires_at = excluded.expires_at, released_at = null;
  return pg_catalog.jsonb_build_object('ok', true, 'code', 'CLAIMED', 'shareId', p_share_id, 'expiresAt', v_now + interval '30 seconds');
end;
$$;

create or replace function public.renew_screen_share_observed(p_auth_subject text, p_auth_session_id uuid, p_presence_session_id uuid, p_space_id uuid, p_share_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_context jsonb; v_lease jsonb; v_now timestamptz;
begin
  if nullif(p_auth_subject, '') is null or p_auth_session_id is null or p_presence_session_id is null or p_space_id is null or p_share_id is null then return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST'); end if;
  v_context := private.screen_share_context_observed(p_auth_subject, p_auth_session_id, p_presence_session_id, p_space_id);
  if not coalesce((v_context ->> 'ok')::boolean, false) then return v_context; end if;
  v_lease := v_context -> 'lease';
  if not coalesce((v_lease ->> 'active')::boolean, false)
     or (v_lease ->> 'presenterUserId')::uuid is distinct from (v_context -> 'viewer' ->> 'id')::uuid
     or (v_lease ->> 'presenceSessionId')::uuid is distinct from p_presence_session_id
     or (v_lease ->> 'authSessionId')::uuid is distinct from p_auth_session_id
     or (v_lease ->> 'shareId')::uuid is distinct from p_share_id then return pg_catalog.jsonb_build_object('ok', false, 'code', 'LEASE_STALE'); end if;
  v_now := pg_catalog.clock_timestamp();
  update public.screen_share_leases as l set heartbeat_at = v_now, expires_at = v_now + interval '30 seconds'
   where l.space_id = p_space_id and l.presenter_location_version = (v_context -> 'viewer' ->> 'locationVersion')::integer and l.presenter_access_revision = (v_context -> 'viewer' ->> 'accessRevision')::bigint;
  return pg_catalog.jsonb_build_object('ok', true, 'code', 'RENEWED', 'shareId', p_share_id, 'expiresAt', v_now + interval '30 seconds');
end;
$$;

create or replace function public.release_screen_share_observed(p_auth_subject text, p_auth_session_id uuid, p_presence_session_id uuid, p_space_id uuid, p_share_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_context jsonb; v_lease jsonb; v_now timestamptz; v_exact_owner boolean;
begin
  if nullif(p_auth_subject, '') is null or p_auth_session_id is null or p_presence_session_id is null or p_space_id is null or p_share_id is null then return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST'); end if;
  v_context := private.screen_share_context_observed(p_auth_subject, p_auth_session_id, p_presence_session_id, p_space_id);
  if not coalesce((v_context ->> 'ok')::boolean, false) then return v_context; end if;
  v_lease := v_context -> 'lease';
  if v_lease is null then return pg_catalog.jsonb_build_object('ok', false, 'code', 'LEASE_NOT_FOUND'); end if;
  v_exact_owner := (v_lease ->> 'presenterUserId')::uuid is not distinct from (v_context -> 'viewer' ->> 'id')::uuid
    and (v_lease ->> 'presenceSessionId')::uuid is not distinct from p_presence_session_id
    and (v_lease ->> 'authSessionId')::uuid is not distinct from p_auth_session_id
    and (v_lease ->> 'shareId')::uuid is not distinct from p_share_id;
  if not v_exact_owner then return pg_catalog.jsonb_build_object('ok', false, 'code', 'LEASE_NOT_OWNER'); end if;
  if not coalesce((v_lease ->> 'active')::boolean, false) then return pg_catalog.jsonb_build_object('ok', true, 'code', 'RELEASED', 'alreadyReleased', true); end if;
  v_now := pg_catalog.clock_timestamp();
  update public.screen_share_leases as l set released_at = v_now, expires_at = v_now
   where l.space_id = p_space_id and l.presenter_user_id = (v_context -> 'viewer' ->> 'id')::uuid and l.presence_session_id = p_presence_session_id and l.auth_session_id = p_auth_session_id and l.share_id = p_share_id;
  return pg_catalog.jsonb_build_object('ok', true, 'code', 'RELEASED', 'alreadyReleased', false);
end;
$$;

create or replace function public.get_active_screen_share_observed(p_auth_subject text, p_auth_session_id uuid, p_presence_session_id uuid, p_space_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_context jsonb; v_lease jsonb;
begin
  if nullif(p_auth_subject, '') is null or p_auth_session_id is null or p_presence_session_id is null or p_space_id is null then return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST'); end if;
  v_context := private.screen_share_context_observed(p_auth_subject, p_auth_session_id, p_presence_session_id, p_space_id);
  if not coalesce((v_context ->> 'ok')::boolean, false) then return v_context; end if;
  v_lease := v_context -> 'lease';
  if not coalesce((v_lease ->> 'active')::boolean, false) then return pg_catalog.jsonb_build_object('ok', true, 'code', 'ACTIVE_READ', 'active', null); end if;
  return pg_catalog.jsonb_build_object('ok', true, 'code', 'ACTIVE_READ', 'active', pg_catalog.jsonb_build_object('spaceId', p_space_id, 'presenterUserId', (v_lease ->> 'presenterUserId')::uuid, 'shareId', (v_lease ->> 'shareId')::uuid, 'expiresAt', v_lease -> 'expiresAt'));
end;
$$;

create or replace function private.is_media_topic_authorized(p_topic text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_claims jsonb; v_subject text; v_auth_session_id uuid; v_parts text[]; v_user_id uuid; v_company_id uuid; v_space_id uuid; v_user_space_id uuid; v_location_version integer; v_user_access_revision bigint; v_space_access_revision bigint; v_now timestamptz; v_found boolean := false;
begin
  begin
    v_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
    v_auth_session_id := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then return false; end;
  v_subject := nullif(v_claims ->> 'sub', '');
  v_parts := pg_catalog.regexp_match(p_topic, '^company:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):space:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):media$');
  if v_subject is null or v_auth_session_id is null or v_parts is null then return false; end if;
  select u.id, u.company_id, u.current_space_id, u.location_version, u.presence_access_revision into v_user_id, v_company_id, v_user_space_id, v_location_version, v_user_access_revision from public.users as u where u.supabase_uid = v_subject; v_found := found;
  if not v_found or v_company_id is null or p_topic is distinct from 'company:' || v_company_id::text || ':space:' || v_parts[2]::uuid::text || ':media' then return false; end if;
  v_space_id := v_parts[2]::uuid;
  select s.presence_access_revision into v_space_access_revision from public.spaces as s where s.id = v_space_id and s.company_id = v_company_id and s.status::text in ('active', 'available'); v_found := found;
  if not v_found or v_user_space_id is distinct from v_space_id then return false; end if;
  v_now := pg_catalog.clock_timestamp();
  return exists (select 1 from public.user_presence_sessions as ps where ps.user_id = v_user_id and ps.auth_session_id = v_auth_session_id and ps.company_id = v_company_id and ps.space_id = v_space_id and ps.placement_version = v_location_version and ps.user_access_revision = v_user_access_revision and ps.space_access_revision = v_space_access_revision and ps.retired_at is null and ps.expires_at > v_now)
    and not exists (select 1 from public.revoked_presence_auth_sessions as f where f.user_id = v_user_id and f.auth_session_id = v_auth_session_id)
    and not private.presence_auth_session_absent(v_auth_session_id, v_user_id);
exception when invalid_text_representation then return false;
end;
$$;

alter function private.screen_share_context_observed(text, uuid, uuid, uuid) owner to presence_maintenance_owner;
alter function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid) owner to presence_maintenance_owner;
alter function public.renew_screen_share_observed(text, uuid, uuid, uuid, uuid) owner to presence_maintenance_owner;
alter function public.release_screen_share_observed(text, uuid, uuid, uuid, uuid) owner to presence_maintenance_owner;
alter function public.get_active_screen_share_observed(text, uuid, uuid, uuid) owner to presence_maintenance_owner;
alter function private.is_media_topic_authorized(text) owner to presence_maintenance_owner;

revoke all on function private.screen_share_context_observed(text, uuid, uuid, uuid), public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid), public.renew_screen_share_observed(text, uuid, uuid, uuid, uuid), public.release_screen_share_observed(text, uuid, uuid, uuid, uuid), public.get_active_screen_share_observed(text, uuid, uuid, uuid), private.is_media_topic_authorized(text) from public, anon, authenticated, service_role;
grant execute on function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid), public.renew_screen_share_observed(text, uuid, uuid, uuid, uuid), public.release_screen_share_observed(text, uuid, uuid, uuid, uuid), public.get_active_screen_share_observed(text, uuid, uuid, uuid) to service_role;
grant execute on function private.is_media_topic_authorized(text) to authenticated;

drop policy if exists phase8_media_broadcast_receive on realtime.messages;
create policy phase8_media_broadcast_receive on realtime.messages for select to authenticated using (realtime.messages.extension = 'broadcast' and private.is_media_topic_authorized((select realtime.topic())));
drop policy if exists phase8_media_broadcast_send on realtime.messages;
create policy phase8_media_broadcast_send on realtime.messages for insert to authenticated with check (realtime.messages.extension = 'broadcast' and private.is_media_topic_authorized((select realtime.topic())));
drop policy if exists phase8_media_presence_receive on realtime.messages;
create policy phase8_media_presence_receive on realtime.messages for select to authenticated using (realtime.messages.extension = 'presence' and private.is_media_topic_authorized((select realtime.topic())));
drop policy if exists phase8_media_presence_track on realtime.messages;
create policy phase8_media_presence_track on realtime.messages for insert to authenticated with check (realtime.messages.extension = 'presence' and private.is_media_topic_authorized((select realtime.topic())));

-- Migration-time catalog assertions make privilege/policy drift fail replay.
do $$
declare v_count integer;
begin
  if not exists (select 1 from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'screen_share_leases' and c.relrowsecurity and c.relforcerowsecurity and pg_catalog.pg_get_userbyid(c.relowner) = 'presence_maintenance_owner') then raise exception 'SCREEN_SHARE_LEASE_RLS_READBACK_FAILED'; end if;
  select count(*) into v_count from pg_catalog.pg_constraint as c where c.conrelid = 'public.screen_share_leases'::pg_catalog.regclass and c.conname in ('screen_share_leases_pkey', 'screen_share_leases_company_share_key', 'screen_share_leases_heartbeat_order', 'screen_share_leases_expiry_order', 'screen_share_leases_release_order'); if v_count <> 5 then raise exception 'SCREEN_SHARE_LEASE_CONSTRAINT_READBACK_FAILED'; end if;
  select count(*) into v_count from pg_catalog.pg_indexes as i where i.schemaname = 'public' and i.tablename = 'screen_share_leases' and i.indexname in ('idx_screen_share_leases_company_id', 'idx_screen_share_leases_presenter_user_id', 'idx_screen_share_leases_presence_session_id', 'idx_screen_share_leases_active_expiry'); if v_count <> 4 then raise exception 'SCREEN_SHARE_LEASE_INDEX_READBACK_FAILED'; end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.screen_share_leases', 'SELECT, INSERT, UPDATE, DELETE') or pg_catalog.has_table_privilege('anon', 'public.screen_share_leases', 'SELECT, INSERT, UPDATE, DELETE') or pg_catalog.has_table_privilege('service_role', 'public.screen_share_leases', 'SELECT, INSERT, UPDATE, DELETE') then raise exception 'SCREEN_SHARE_LEASE_GRANT_READBACK_FAILED'; end if;
  select count(*) into v_count from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as n on n.oid = p.pronamespace where (n.nspname, p.proname) in (('private', 'screen_share_context_observed'), ('public', 'claim_screen_share_observed'), ('public', 'renew_screen_share_observed'), ('public', 'release_screen_share_observed'), ('public', 'get_active_screen_share_observed'), ('private', 'is_media_topic_authorized')) and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner' and p.prosecdef and p.proconfig = array['search_path=pg_catalog']::text[]; if v_count <> 6 then raise exception 'SCREEN_SHARE_FUNCTION_READBACK_FAILED'; end if;
  if not pg_catalog.has_function_privilege('service_role', 'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)', 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', 'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)', 'EXECUTE') or pg_catalog.has_function_privilege('anon', 'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)', 'EXECUTE') then raise exception 'SCREEN_SHARE_FUNCTION_GRANT_READBACK_FAILED'; end if;
  select count(*) into v_count from pg_catalog.pg_policy as p where p.polrelid = 'realtime.messages'::pg_catalog.regclass and p.polname in ('phase8_media_broadcast_receive', 'phase8_media_broadcast_send', 'phase8_media_presence_receive', 'phase8_media_presence_track') and p.polroles = array['authenticated'::pg_catalog.regrole::oid]; if v_count <> 4 then raise exception 'SCREEN_SHARE_REALTIME_POLICY_READBACK_FAILED'; end if;
end;
$$;

revoke create on schema public, private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;
commit;
