-- Migration: require_server_media_broadcast
-- Purpose: block forged browser media broadcasts and cut clients to a versioned topic.
-- Author: Giuliano Lemes   Date (UTC): 2026-08-01

begin;

grant presence_maintenance_owner to postgres;

-- Realtime caches authorization for a joined channel. The v2 topic prevents
-- newly corrected clients from sharing a cached v1 authorization boundary.
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
  v_parts text[];
  v_user_id uuid;
  v_company_id uuid;
  v_space_id uuid;
  v_user_space_id uuid;
  v_location_version integer;
  v_user_access_revision bigint;
  v_space_access_revision bigint;
  v_now timestamptz;
  v_found boolean := false;
begin
  begin
    v_claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
    v_auth_session_id := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  v_subject := nullif(v_claims ->> 'sub', '');
  v_parts := pg_catalog.regexp_match(
    p_topic,
    '^company:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):space:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):media:v2$'
  );
  if v_subject is null or v_auth_session_id is null or v_parts is null then
    return false;
  end if;

  select u.id, u.company_id, u.current_space_id, u.location_version,
         u.presence_access_revision
    into v_user_id, v_company_id, v_user_space_id, v_location_version,
         v_user_access_revision
    from public.users as u
   where u.supabase_uid = v_subject;
  v_found := found;
  if not v_found
     or v_company_id is null
     or p_topic is distinct from
       'company:' || v_company_id::text || ':space:' || v_parts[2]::uuid::text || ':media:v2' then
    return false;
  end if;

  v_space_id := v_parts[2]::uuid;
  select s.presence_access_revision
    into v_space_access_revision
    from public.spaces as s
   where s.id = v_space_id
     and s.company_id = v_company_id
     and s.status::text in ('active', 'available');
  v_found := found;
  if not v_found or v_user_space_id is distinct from v_space_id then
    return false;
  end if;

  v_now := pg_catalog.clock_timestamp();
  return exists (
    select 1
      from public.user_presence_sessions as ps
     where ps.user_id = v_user_id
       and ps.auth_session_id = v_auth_session_id
       and ps.company_id = v_company_id
       and ps.space_id = v_space_id
       and ps.placement_version = v_location_version
       and ps.user_access_revision = v_user_access_revision
       and ps.space_access_revision = v_space_access_revision
       and ps.retired_at is null
       and ps.expires_at > v_now
  )
  and not exists (
    select 1
      from public.revoked_presence_auth_sessions as f
     where f.user_id = v_user_id
       and f.auth_session_id = v_auth_session_id
  )
  and not private.presence_auth_session_absent(v_auth_session_id, v_user_id);
exception when invalid_text_representation then
  return false;
end;
$$;

alter function private.is_media_topic_authorized(text)
  owner to presence_maintenance_owner;

-- Browsers retain Broadcast SELECT for receiving server-authenticated signals.
-- Presence read/write remains browser-owned. Browser Broadcast INSERT is removed.
drop policy if exists phase8_media_broadcast_send on realtime.messages;

do $$
declare
  v_count integer;
begin
  if exists (
    select 1
      from pg_catalog.pg_policy as p
     where p.polrelid = 'realtime.messages'::pg_catalog.regclass
       and p.polname = 'phase8_media_broadcast_send'
  ) then
    raise exception 'SCREEN_SHARE_BROWSER_BROADCAST_POLICY_STILL_PRESENT';
  end if;

  select pg_catalog.count(*) into v_count
    from pg_catalog.pg_policy as p
   where p.polrelid = 'realtime.messages'::pg_catalog.regclass
     and p.polname in (
       'phase8_media_broadcast_receive',
       'phase8_media_presence_receive',
       'phase8_media_presence_track'
     )
     and p.polroles = array['authenticated'::pg_catalog.regrole::oid];
  if v_count <> 3 then
    raise exception 'SCREEN_SHARE_SERVER_BROADCAST_POLICY_READBACK_FAILED';
  end if;

  if pg_catalog.to_regprocedure(
      'public.check_rate_limit(uuid,text,integer,integer)'
    ) is null
    or not pg_catalog.has_function_privilege(
      'service_role',
      'public.check_rate_limit(uuid,text,integer,integer)',
      'EXECUTE'
    ) then
    raise exception 'SCREEN_SHARE_SIGNAL_RATE_LIMIT_CONTRACT_MISSING';
  end if;

  if pg_catalog.pg_get_userbyid((
      select p.proowner
        from pg_catalog.pg_proc as p
       where p.oid = 'private.is_media_topic_authorized(text)'::pg_catalog.regprocedure
    )) <> 'presence_maintenance_owner'
    or not (
      select p.prosecdef
        from pg_catalog.pg_proc as p
       where p.oid = 'private.is_media_topic_authorized(text)'::pg_catalog.regprocedure
    )
    or (
      select p.proconfig
        from pg_catalog.pg_proc as p
       where p.oid = 'private.is_media_topic_authorized(text)'::pg_catalog.regprocedure
    ) is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'SCREEN_SHARE_MEDIA_HELPER_READBACK_FAILED';
  end if;
end;
$$;

revoke presence_maintenance_owner from postgres;

commit;
