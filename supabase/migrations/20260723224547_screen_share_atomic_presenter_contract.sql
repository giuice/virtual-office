-- Atomic presenter-name contract for observed screen-share RPCs.
-- Local-first migration: no online database target is linked or changed here.

begin;

grant presence_maintenance_owner to postgres;
grant create on schema public, private to presence_maintenance_owner;
grant select (display_name) on public.users to presence_maintenance_owner;

-- This set is the ECMAScript TrimString whitespace set used by String.prototype.trim.
-- Keep it in lockstep with screenSharePresenterNameSchema: names are canonicalized,
-- then checked as one to one hundred Unicode code points without truncation.
create or replace function private.screen_share_canonical_presenter_name_observed(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_display_name text;
  v_presenter_name text;
  v_trim_characters text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  -- The caller has already acquired the user lock in the observed context. Taking
  -- the same row lock here makes this helper safe if it is reused by a future RPC.
  select u.display_name into v_display_name
    from public.users as u
   where u.id = p_user_id
   for no key update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRESENTER_PROFILE_INVALID');
  end if;

  v_presenter_name := pg_catalog.btrim(v_display_name, v_trim_characters);
  if v_presenter_name is null
     or pg_catalog.char_length(v_presenter_name) not between 1 and 100 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRESENTER_PROFILE_INVALID');
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'presenterName', v_presenter_name);
end;
$$;

-- The claim-specific preflight first builds and locks the same ordered user set as
-- screen_share_context_observed. It validates the caller's current display name
-- before the context can retire a stale lease or the claim can upsert a lease.
create or replace function private.screen_share_claim_presenter_name_observed(
  p_auth_subject text,
  p_space_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_viewer_id uuid;
  v_preliminary_owner_id uuid;
begin
  select l.presenter_user_id into v_preliminary_owner_id
    from public.screen_share_leases as l
   where l.space_id = p_space_id;

  select u.id into v_viewer_id
    from public.users as u
   where u.supabase_uid = p_auth_subject;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  perform u.id
    from public.users as u
   where u.id in (v_viewer_id, v_preliminary_owner_id)
   order by u.id
   for no key update;

  -- Re-read the subject after the ordered lock, then validate and canonicalize it
  -- under that lock. No raw display name is returned on an invalid profile.
  select u.id into v_viewer_id
    from public.users as u
   where u.id = v_viewer_id
     and u.supabase_uid = p_auth_subject;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_INVALID');
  end if;

  return private.screen_share_canonical_presenter_name_observed(v_viewer_id);
end;
$$;

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
  v_context jsonb;
  v_viewer jsonb;
  v_lease jsonb;
  v_name_result jsonb;
  v_now timestamptz;
begin
  if nullif(p_auth_subject, '') is null
     or p_auth_session_id is null
     or p_presence_session_id is null
     or p_space_id is null
     or p_share_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  v_name_result := private.screen_share_claim_presenter_name_observed(p_auth_subject, p_space_id);
  if not coalesce((v_name_result ->> 'ok')::boolean, false) then
    return v_name_result;
  end if;

  v_context := private.screen_share_context_observed(
    p_auth_subject, p_auth_session_id, p_presence_session_id, p_space_id
  );
  if not coalesce((v_context ->> 'ok')::boolean, false) then
    return v_context;
  end if;

  v_lease := v_context -> 'lease';
  if coalesce((v_lease ->> 'active')::boolean, false) and (
    (v_lease ->> 'presenterUserId')::uuid is distinct from (v_context -> 'viewer' ->> 'id')::uuid
    or (v_lease ->> 'presenceSessionId')::uuid is distinct from p_presence_session_id
    or (v_lease ->> 'authSessionId')::uuid is distinct from p_auth_session_id
    or (v_lease ->> 'shareId')::uuid is distinct from p_share_id
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PRESENTER_BUSY');
  end if;

  v_viewer := v_context -> 'viewer';
  v_now := pg_catalog.clock_timestamp();
  insert into public.screen_share_leases as l (
    space_id, company_id, presenter_user_id, presence_session_id, auth_session_id,
    share_id, presenter_location_version, presenter_access_revision,
    space_access_revision, claimed_at, heartbeat_at, expires_at, released_at
  ) values (
    p_space_id, (v_viewer ->> 'companyId')::uuid, (v_viewer ->> 'id')::uuid,
    p_presence_session_id, p_auth_session_id, p_share_id,
    (v_viewer ->> 'locationVersion')::integer,
    (v_viewer ->> 'accessRevision')::bigint,
    (v_viewer ->> 'spaceAccessRevision')::bigint,
    v_now, v_now, v_now + interval '30 seconds', null
  ) on conflict (space_id) do update set
    company_id = excluded.company_id,
    presenter_user_id = excluded.presenter_user_id,
    presence_session_id = excluded.presence_session_id,
    auth_session_id = excluded.auth_session_id,
    share_id = excluded.share_id,
    presenter_location_version = excluded.presenter_location_version,
    presenter_access_revision = excluded.presenter_access_revision,
    space_access_revision = excluded.space_access_revision,
    claimed_at = excluded.claimed_at,
    heartbeat_at = excluded.heartbeat_at,
    expires_at = excluded.expires_at,
    released_at = null;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'CLAIMED',
    'shareId', p_share_id,
    'expiresAt', v_now + interval '30 seconds',
    'presenterName', v_name_result -> 'presenterName'
  );
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
  v_context jsonb;
  v_lease jsonb;
  v_name_result jsonb;
begin
  if nullif(p_auth_subject, '') is null
     or p_auth_session_id is null
     or p_presence_session_id is null
     or p_space_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  v_context := private.screen_share_context_observed(
    p_auth_subject, p_auth_session_id, p_presence_session_id, p_space_id
  );
  if not coalesce((v_context ->> 'ok')::boolean, false) then
    return v_context;
  end if;

  v_lease := v_context -> 'lease';
  if not coalesce((v_lease ->> 'active')::boolean, false) then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'ACTIVE_READ', 'active', null);
  end if;

  v_name_result := private.screen_share_canonical_presenter_name_observed(
    (v_lease ->> 'presenterUserId')::uuid
  );
  if not coalesce((v_name_result ->> 'ok')::boolean, false) then
    return v_name_result;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'ACTIVE_READ',
    'active', pg_catalog.jsonb_build_object(
      'spaceId', p_space_id,
      'presenterUserId', (v_lease ->> 'presenterUserId')::uuid,
      'presenterName', v_name_result -> 'presenterName',
      'shareId', (v_lease ->> 'shareId')::uuid,
      'expiresAt', v_lease -> 'expiresAt'
    )
  );
end;
$$;

alter function private.screen_share_canonical_presenter_name_observed(uuid) owner to presence_maintenance_owner;
alter function private.screen_share_claim_presenter_name_observed(text, uuid) owner to presence_maintenance_owner;
alter function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid) owner to presence_maintenance_owner;
alter function public.get_active_screen_share_observed(text, uuid, uuid, uuid) owner to presence_maintenance_owner;

revoke all on function private.screen_share_canonical_presenter_name_observed(uuid),
  private.screen_share_claim_presenter_name_observed(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid),
  public.get_active_screen_share_observed(text, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_screen_share_observed(text, uuid, uuid, uuid, uuid),
  public.get_active_screen_share_observed(text, uuid, uuid, uuid)
  to service_role;

do $$
declare
  v_count integer;
begin
  if not pg_catalog.has_column_privilege(
    'presence_maintenance_owner', 'public.users', 'display_name', 'SELECT'
  ) then
    raise exception 'SCREEN_SHARE_PRESENTER_NAME_GRANT_READBACK_FAILED';
  end if;

  select count(*) into v_count
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where (n.nspname, p.proname) in (
      ('private', 'screen_share_canonical_presenter_name_observed'),
      ('private', 'screen_share_claim_presenter_name_observed'),
      ('public', 'claim_screen_share_observed'),
      ('public', 'get_active_screen_share_observed')
   )
     and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
     and p.prosecdef
     and p.proconfig = array['search_path=pg_catalog']::text[];
  if v_count <> 4 then
    raise exception 'SCREEN_SHARE_PRESENTER_FUNCTION_READBACK_FAILED';
  end if;

  if pg_catalog.has_function_privilege(
      'authenticated', 'private.screen_share_canonical_presenter_name_observed(uuid)', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role', 'private.screen_share_canonical_presenter_name_observed(uuid)', 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated', 'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)', 'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'service_role', 'public.claim_screen_share_observed(text,uuid,uuid,uuid,uuid)', 'EXECUTE'
    ) then
    raise exception 'SCREEN_SHARE_PRESENTER_FUNCTION_GRANT_READBACK_FAILED';
  end if;
end;
$$;

revoke create on schema public, private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;
commit;
