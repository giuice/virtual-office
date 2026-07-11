CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
    r pg_catalog.pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO r FROM pg_catalog.pg_roles WHERE rolname = 'presence_maintenance_owner';
    IF NOT FOUND THEN
        CREATE ROLE presence_maintenance_owner NOLOGIN NOINHERIT NOBYPASSRLS;
    ELSIF r.rolcanlogin OR r.rolinherit OR r.rolbypassrls OR r.rolsuper
        OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN
        RAISE EXCEPTION 'presence_maintenance_owner exists with unexpected attributes';
    END IF;
END $$;

-- Local/hosted `postgres` is NOT superuser: the ALTER ... OWNER statements below require
-- membership in the target role. Granted here and REVOKED at the end of this migration —
-- the handoff forbids leaving presence_maintenance_owner granted to any login role.
GRANT presence_maintenance_owner TO postgres;

-- `postgres` holds USAGE on schema auth WITHOUT grant option, so the handoff's direct
-- auth.sessions grant to presence_maintenance_owner cannot be installed. Platform-specific
-- narrow design instead: private.presence_auth_session_absent() below (owned by postgres,
-- which has grantable SELECT on auth.sessions) returns only a boolean and is executable
-- only by presence_maintenance_owner. No auth.sessions row data ever leaves it.
GRANT USAGE ON SCHEMA public, private TO presence_maintenance_owner;
GRANT SELECT (id, company_id, supabase_uid, current_space_id, location_version, presence_access_revision),
    UPDATE (current_space_id, location_version) ON public.users TO presence_maintenance_owner;
-- UPDATE(updated_at) exists only so reconcile can take FOR SHARE row locks.
GRANT SELECT (id, presence_access_revision),
    UPDATE (updated_at) ON public.spaces TO presence_maintenance_owner;
GRANT SELECT, UPDATE (exited_at) ON public.space_presence_log TO presence_maintenance_owner;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'users'
          AND c.relrowsecurity
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS p
            JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'users'
              AND p.polname = 'presence_maintenance_owner_users_select'
        ) THEN
            CREATE POLICY presence_maintenance_owner_users_select
                ON public.users
                FOR SELECT
                TO presence_maintenance_owner
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS p
            JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'users'
              AND p.polname = 'presence_maintenance_owner_users_update'
        ) THEN
            CREATE POLICY presence_maintenance_owner_users_update
                ON public.users
                FOR UPDATE
                TO presence_maintenance_owner
                USING (true)
                WITH CHECK (true);
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'spaces'
          AND c.relrowsecurity
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS p
            JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'spaces'
              AND p.polname = 'presence_maintenance_owner_spaces_select'
        ) THEN
            CREATE POLICY presence_maintenance_owner_spaces_select
                ON public.spaces
                FOR SELECT
                TO presence_maintenance_owner
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS p
            JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'spaces'
              AND p.polname = 'presence_maintenance_owner_spaces_update'
        ) THEN
            CREATE POLICY presence_maintenance_owner_spaces_update
                ON public.spaces
                FOR UPDATE
                TO presence_maintenance_owner
                USING (true)
                WITH CHECK (true);
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'space_presence_log'
          AND c.relrowsecurity
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS p
            JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'space_presence_log'
              AND p.polname = 'presence_maintenance_owner_space_presence_log_select'
        ) THEN
            CREATE POLICY presence_maintenance_owner_space_presence_log_select
                ON public.space_presence_log
                FOR SELECT
                TO presence_maintenance_owner
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS p
            JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
            JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'space_presence_log'
              AND p.polname = 'presence_maintenance_owner_space_presence_log_update'
        ) THEN
            CREATE POLICY presence_maintenance_owner_space_presence_log_update
                ON public.space_presence_log
                FOR UPDATE
                TO presence_maintenance_owner
                USING (true)
                WITH CHECK (true);
        END IF;
    END IF;
END $$;

create table public.user_presence_sessions (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  auth_session_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete restrict,
  placement_version integer,
  user_access_revision bigint,
  space_access_revision bigint,
  connected_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  retired_at timestamptz,
  retirement_reason text,
  unique (user_id, registration_id),
  constraint user_presence_sessions_expiry_order
    check (expires_at >= last_seen_at),
  constraint user_presence_sessions_space_revision_pair
    check (
      (
        space_id is null
        and placement_version is null
        and user_access_revision is null
        and space_access_revision is null
      )
      or
      (
        space_id is not null
        and placement_version is not null
        and user_access_revision is not null
        and space_access_revision is not null
      )
    ),
  constraint user_presence_sessions_retirement_pair
    check (
      (retired_at is null and retirement_reason is null)
      or
      (retired_at is not null and retirement_reason in (
        'explicit-disconnect', 'expired', 'logout', 'company-removal'
      ))
    )
);

create index on public.user_presence_sessions (user_id, expires_at);
create index on public.user_presence_sessions (auth_session_id, expires_at);
create index on public.user_presence_sessions (company_id, expires_at);
create index on public.user_presence_sessions (space_id, expires_at);
create index on public.user_presence_sessions (user_id, space_id, placement_version, expires_at desc);

create table public.revoked_presence_auth_sessions (
  auth_session_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  revoked_at timestamptz not null,
  auth_session_absence_confirmed_at timestamptz,
  purge_after timestamptz,
  constraint revoked_presence_auth_sessions_purge_pair check (
    (auth_session_absence_confirmed_at is null and purge_after is null)
    or
    (
      auth_session_absence_confirmed_at is not null
      and purge_after is not null
      and purge_after > auth_session_absence_confirmed_at
    )
  )
);

ALTER TABLE public.user_presence_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.revoked_presence_auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revoked_presence_auth_sessions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_presence_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.revoked_presence_auth_sessions FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.user_presence_sessions TO service_role;
GRANT SELECT ON public.revoked_presence_auth_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presence_sessions TO presence_maintenance_owner;
GRANT SELECT, UPDATE (auth_session_absence_confirmed_at, purge_after), DELETE ON public.revoked_presence_auth_sessions TO presence_maintenance_owner;

CREATE POLICY presence_maintenance_owner_user_presence_sessions_select
    ON public.user_presence_sessions
    FOR SELECT
    TO presence_maintenance_owner
    USING (true);

CREATE POLICY presence_maintenance_owner_user_presence_sessions_insert
    ON public.user_presence_sessions
    FOR INSERT
    TO presence_maintenance_owner
    WITH CHECK (true);

CREATE POLICY presence_maintenance_owner_user_presence_sessions_update
    ON public.user_presence_sessions
    FOR UPDATE
    TO presence_maintenance_owner
    USING (true)
    WITH CHECK (true);

CREATE POLICY presence_maintenance_owner_user_presence_sessions_delete
    ON public.user_presence_sessions
    FOR DELETE
    TO presence_maintenance_owner
    USING (true);

-- Shorter names: the presence_maintenance_owner_revoked_presence_auth_sessions_* form
-- exceeds the 63-char identifier limit and would truncate.
CREATE POLICY pmo_revoked_auth_sessions_select
    ON public.revoked_presence_auth_sessions
    FOR SELECT
    TO presence_maintenance_owner
    USING (true);

CREATE POLICY pmo_revoked_auth_sessions_update
    ON public.revoked_presence_auth_sessions
    FOR UPDATE
    TO presence_maintenance_owner
    USING (true)
    WITH CHECK (true);

CREATE POLICY pmo_revoked_auth_sessions_delete
    ON public.revoked_presence_auth_sessions
    FOR DELETE
    TO presence_maintenance_owner
    USING (true);

-- Platform-specific bridge to auth.sessions (see grant comments above). SECURITY DEFINER
-- as its creator (postgres), which has grantable SELECT on auth.sessions; intentionally
-- NOT owned by presence_maintenance_owner and returns only a boolean.
CREATE OR REPLACE FUNCTION private.presence_auth_session_absent(
    p_auth_session_id uuid,
    p_app_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM auth.sessions AS s
        WHERE s.id = p_auth_session_id
          AND s.user_id::text = (
              SELECT u.supabase_uid
              FROM public.users AS u
              WHERE u.id = p_app_user_id
          )
    );
$$;

REVOKE ALL ON FUNCTION private.presence_auth_session_absent(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.presence_auth_session_absent(uuid, uuid) TO presence_maintenance_owner;

-- Owning a function requires CREATE on its schema at transfer time. Granted only for
-- the ALTER ... OWNER statements below and revoked again at the end of this migration.
GRANT CREATE ON SCHEMA public, private TO presence_maintenance_owner;

CREATE OR REPLACE FUNCTION public.register_presence_session(
    p_user_id uuid,
    p_auth_session_id uuid,
    p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
    v_existing public.user_presence_sessions%ROWTYPE;
    v_session public.user_presence_sessions%ROWTYPE;
    v_op timestamp with time zone;
BEGIN
    SELECT u.id, u.company_id
    INTO v_user_id, v_company_id
    FROM public.users AS u
    WHERE u.id = p_user_id
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND');
    END IF;

    IF v_company_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'NO_COMPANY');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.revoked_presence_auth_sessions AS f
        WHERE f.auth_session_id = p_auth_session_id
          AND f.user_id = p_user_id
    ) THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_SESSION_REVOKED');
    END IF;

    SELECT s.*
    INTO v_existing
    FROM public.user_presence_sessions AS s
    WHERE s.user_id = p_user_id
      AND s.registration_id = p_registration_id
    FOR UPDATE;

    v_op := pg_catalog.clock_timestamp();

    IF FOUND THEN
        IF v_existing.retired_at IS NOT NULL OR v_existing.expires_at <= v_op THEN
            RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_RETIRED');
        END IF;

        IF v_existing.auth_session_id <> p_auth_session_id THEN
            RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'REGISTRATION_CONFLICT');
        END IF;

        UPDATE public.user_presence_sessions AS s
        SET last_seen_at = v_op,
            expires_at = v_op + INTERVAL '90 seconds'
        WHERE s.id = v_existing.id
        RETURNING s.* INTO v_session;

        RETURN pg_catalog.jsonb_build_object(
            'ok', true,
            'sessionId', v_session.id,
            'registrationId', v_session.registration_id,
            'sessionSpaceId', v_session.space_id,
            'expiresAt', pg_catalog.to_jsonb(v_session.expires_at),
            'refreshed', true
        );
    END IF;

    INSERT INTO public.user_presence_sessions (
        registration_id,
        user_id,
        auth_session_id,
        company_id,
        connected_at,
        last_seen_at,
        expires_at
    )
    VALUES (
        p_registration_id,
        p_user_id,
        p_auth_session_id,
        v_company_id,
        v_op,
        v_op,
        v_op + INTERVAL '90 seconds'
    )
    RETURNING * INTO v_session;

    RETURN pg_catalog.jsonb_build_object(
        'ok', true,
        'sessionId', v_session.id,
        'registrationId', v_session.registration_id,
        'sessionSpaceId', v_session.space_id,
        'expiresAt', pg_catalog.to_jsonb(v_session.expires_at),
        'refreshed', false
    );
END;
$$;

ALTER FUNCTION public.register_presence_session(uuid, uuid, uuid) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.register_presence_session(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_presence_session(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.heartbeat_presence_session(
    p_user_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_session public.user_presence_sessions%ROWTYPE;
    v_op timestamp with time zone;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.revoked_presence_auth_sessions AS f
        WHERE f.auth_session_id = p_auth_session_id
          AND f.user_id = p_user_id
    ) THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_SESSION_REVOKED');
    END IF;

    SELECT s.*
    INTO v_session
    FROM public.user_presence_sessions AS s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_RETIRED');
    END IF;

    IF v_session.user_id <> p_user_id OR v_session.auth_session_id <> p_auth_session_id THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_RETIRED');
    END IF;

    v_op := pg_catalog.clock_timestamp();

    IF v_session.retired_at IS NOT NULL OR v_session.expires_at <= v_op THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_RETIRED');
    END IF;

    UPDATE public.user_presence_sessions AS s
    SET last_seen_at = v_op,
        expires_at = v_op + INTERVAL '90 seconds'
    WHERE s.id = v_session.id
    RETURNING s.* INTO v_session;

    RETURN pg_catalog.jsonb_build_object(
        'ok', true,
        'expiresAt', pg_catalog.to_jsonb(v_session.expires_at)
    );
END;
$$;

ALTER FUNCTION public.heartbeat_presence_session(uuid, uuid, uuid) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.heartbeat_presence_session(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_presence_session(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.disconnect_presence_session(
    p_user_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_session public.user_presence_sessions%ROWTYPE;
    v_op timestamp with time zone;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.revoked_presence_auth_sessions AS f
        WHERE f.auth_session_id = p_auth_session_id
          AND f.user_id = p_user_id
    ) THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'AUTH_SESSION_REVOKED');
    END IF;

    SELECT s.*
    INTO v_session
    FROM public.user_presence_sessions AS s
    WHERE s.id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_RETIRED');
    END IF;

    IF v_session.user_id <> p_user_id OR v_session.auth_session_id <> p_auth_session_id THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_RETIRED');
    END IF;

    v_op := pg_catalog.clock_timestamp();

    IF v_session.retired_at IS NOT NULL
       AND v_session.retirement_reason = 'explicit-disconnect' THEN
        RETURN pg_catalog.jsonb_build_object(
            'ok', true,
            'retiredAt', pg_catalog.to_jsonb(v_session.retired_at),
            'alreadyDisconnected', true
        );
    END IF;

    IF v_session.retired_at IS NOT NULL OR v_session.expires_at <= v_op THEN
        RETURN pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_RETIRED');
    END IF;

    UPDATE public.user_presence_sessions AS s
    SET retired_at = v_op,
        retirement_reason = 'explicit-disconnect',
        expires_at = v_op
    WHERE s.id = v_session.id
    RETURNING s.* INTO v_session;

    RETURN pg_catalog.jsonb_build_object(
        'ok', true,
        'retiredAt', pg_catalog.to_jsonb(v_session.retired_at),
        'alreadyDisconnected', false
    );
END;
$$;

ALTER FUNCTION public.disconnect_presence_session(uuid, uuid, uuid) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.disconnect_presence_session(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disconnect_presence_session(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.is_presence_auth_session_unfenced()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_claims jsonb;
    v_sub text;
    v_sid_text text;
    v_sid uuid;
    v_user_id uuid;
BEGIN
    -- Same source auth.jwt() reads; avoids a schema-auth dependency the maintenance
    -- owner cannot be granted (postgres lacks grant option on schema auth).
    BEGIN
        v_claims := NULLIF(
            pg_catalog.current_setting('request.jwt.claims', true), ''
        )::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN false;
    END;

    IF v_claims IS NULL THEN
        RETURN false;
    END IF;

    v_sub := NULLIF(v_claims ->> 'sub', '');
    v_sid_text := NULLIF(v_claims ->> 'session_id', '');

    IF v_sub IS NULL OR v_sid_text IS NULL THEN
        RETURN false;
    END IF;

    BEGIN
        v_sid := v_sid_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN false;
    END;

    SELECT u.id
    INTO v_user_id
    FROM public.users AS u
    WHERE u.supabase_uid = v_sub;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN NOT EXISTS (
        SELECT 1
        FROM public.revoked_presence_auth_sessions AS f
        WHERE f.user_id = v_user_id
          AND f.auth_session_id = v_sid
    );
END;
$$;

ALTER FUNCTION private.is_presence_auth_session_unfenced() OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION private.is_presence_auth_session_unfenced() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_presence_auth_session_unfenced() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.retire_expired_presence_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.user_presence_sessions AS s
    SET retired_at = s.expires_at,
        retirement_reason = 'expired'
    WHERE s.retired_at IS NULL
      AND s.expires_at <= pg_catalog.clock_timestamp();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

ALTER FUNCTION public.retire_expired_presence_sessions() OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.retire_expired_presence_sessions() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retire_expired_presence_sessions() TO postgres;

CREATE OR REPLACE FUNCTION public.reconcile_stale_presence_placements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_candidate_ids uuid[];
    v_user_ids uuid[];
    v_space_ids uuid[];
    v_op timestamp with time zone;
    v_user record;
    v_cleared integer := 0;
BEGIN
    SELECT pg_catalog.array_agg(candidate.id ORDER BY candidate.id)
    INTO v_candidate_ids
    FROM (
        SELECT u.id
        FROM public.users AS u
        JOIN public.spaces AS sp ON sp.id = u.current_space_id
        WHERE u.current_space_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.user_presence_sessions AS s
              WHERE s.user_id = u.id
                AND s.retired_at IS NULL
                AND s.expires_at > pg_catalog.clock_timestamp()
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.user_presence_sessions AS s
              WHERE s.user_id = u.id
                AND s.space_id = u.current_space_id
                AND s.placement_version = u.location_version
                AND s.user_access_revision = u.presence_access_revision
                AND s.space_access_revision = sp.presence_access_revision
                AND COALESCE(s.retired_at, s.expires_at) >= pg_catalog.clock_timestamp() - INTERVAL '5 minutes'
          )
        ORDER BY u.id
        LIMIT 100
    ) AS candidate;

    IF COALESCE(pg_catalog.array_length(v_candidate_ids, 1), 0) = 0 THEN
        RETURN 0;
    END IF;

    WITH locked_users AS (
        SELECT u.id, u.current_space_id
        FROM public.users AS u
        WHERE u.id = ANY (v_candidate_ids)
        ORDER BY u.id
        FOR NO KEY UPDATE
    )
    SELECT
        pg_catalog.array_agg(locked_users.id ORDER BY locked_users.id),
        pg_catalog.array_agg(DISTINCT locked_users.current_space_id ORDER BY locked_users.current_space_id)
            FILTER (WHERE locked_users.current_space_id IS NOT NULL)
    INTO v_user_ids, v_space_ids
    FROM locked_users;

    IF COALESCE(pg_catalog.array_length(v_space_ids, 1), 0) > 0 THEN
        PERFORM 1
        FROM public.spaces AS sp
        WHERE sp.id = ANY (v_space_ids)
        ORDER BY sp.id
        FOR SHARE;
    END IF;

    PERFORM 1
    FROM public.user_presence_sessions AS s
    WHERE s.user_id = ANY (v_user_ids)
    ORDER BY s.user_id, s.id
    FOR UPDATE;

    v_op := pg_catalog.clock_timestamp();

    FOR v_user IN
        SELECT
            u.id,
            u.current_space_id,
            u.location_version,
            u.presence_access_revision,
            sp.presence_access_revision AS space_access_revision
        FROM public.users AS u
        JOIN public.spaces AS sp ON sp.id = u.current_space_id
        WHERE u.id = ANY (v_user_ids)
        ORDER BY u.id
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.user_presence_sessions AS s
            WHERE s.user_id = v_user.id
              AND s.retired_at IS NULL
              AND s.expires_at > v_op
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.user_presence_sessions AS s
            WHERE s.user_id = v_user.id
              AND s.space_id = v_user.current_space_id
              AND s.placement_version = v_user.location_version
              AND s.user_access_revision = v_user.presence_access_revision
              AND s.space_access_revision = v_user.space_access_revision
              AND COALESCE(s.retired_at, s.expires_at) >= v_op - INTERVAL '5 minutes'
        ) THEN
            UPDATE public.users AS u
            SET current_space_id = NULL,
                location_version = u.location_version + 1
            WHERE u.id = v_user.id;

            UPDATE public.user_presence_sessions AS s
            SET space_id = NULL,
                placement_version = NULL,
                user_access_revision = NULL,
                space_access_revision = NULL
            WHERE s.user_id = v_user.id;

            UPDATE public.space_presence_log AS l
            SET exited_at = v_op
            WHERE l.user_id = v_user.id
              AND l.exited_at IS NULL;

            v_cleared := v_cleared + 1;
        END IF;
    END LOOP;

    RETURN v_cleared;
END;
$$;

ALTER FUNCTION public.reconcile_stale_presence_placements() OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.reconcile_stale_presence_placements() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_presence_placements() TO postgres;

CREATE OR REPLACE FUNCTION public.purge_presence_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_op timestamp with time zone := pg_catalog.clock_timestamp();
    v_retired_deleted integer;
    v_fences_confirmed integer;
    v_fences_deleted integer;
BEGIN
    WITH batch AS (
        SELECT s.id
        FROM public.user_presence_sessions AS s
        WHERE s.retired_at IS NOT NULL
          AND COALESCE(s.retired_at, s.expires_at) < v_op - INTERVAL '24 hours'
        ORDER BY s.id
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
    ),
    deleted AS (
        DELETE FROM public.user_presence_sessions AS s
        USING batch
        WHERE s.id = batch.id
        RETURNING s.id
    )
    SELECT pg_catalog.count(*)::integer
    INTO v_retired_deleted
    FROM deleted;

    WITH batch AS (
        SELECT f.auth_session_id, f.user_id
        FROM public.revoked_presence_auth_sessions AS f
        WHERE f.auth_session_absence_confirmed_at IS NULL
        ORDER BY f.auth_session_id
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
    ),
    absent AS (
        SELECT b.auth_session_id
        FROM batch AS b
        WHERE private.presence_auth_session_absent(b.auth_session_id, b.user_id)
    ),
    confirmed AS (
        UPDATE public.revoked_presence_auth_sessions AS f
        SET auth_session_absence_confirmed_at = v_op,
            purge_after = v_op + INTERVAL '1800 seconds' + INTERVAL '7 days'
        FROM absent
        WHERE f.auth_session_id = absent.auth_session_id
        RETURNING f.auth_session_id
    )
    SELECT pg_catalog.count(*)::integer
    INTO v_fences_confirmed
    FROM confirmed;

    WITH batch AS (
        SELECT f.auth_session_id, f.user_id
        FROM public.revoked_presence_auth_sessions AS f
        WHERE f.auth_session_absence_confirmed_at IS NOT NULL
          AND f.purge_after <= v_op
        ORDER BY f.auth_session_id
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
    ),
    absent AS (
        SELECT b.auth_session_id
        FROM batch AS b
        WHERE private.presence_auth_session_absent(b.auth_session_id, b.user_id)
    ),
    deleted AS (
        DELETE FROM public.revoked_presence_auth_sessions AS f
        USING absent
        WHERE f.auth_session_id = absent.auth_session_id
        RETURNING f.auth_session_id
    )
    SELECT pg_catalog.count(*)::integer
    INTO v_fences_deleted
    FROM deleted;

    RETURN pg_catalog.jsonb_build_object(
        'retiredSessionsDeleted', v_retired_deleted,
        'fencesConfirmed', v_fences_confirmed,
        'fencesDeleted', v_fences_deleted
    );
END;
$$;

ALTER FUNCTION public.purge_presence_history() OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.purge_presence_history() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_presence_history() TO postgres;

REVOKE CREATE ON SCHEMA public, private FROM presence_maintenance_owner;
REVOKE presence_maintenance_owner FROM postgres;

DO $$
DECLARE
    j record;
BEGIN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname IN
        ('presence-retire-sessions-v1', 'presence-purge-history-v1', 'presence-reconcile-placement-v1')
    LOOP
        PERFORM cron.unschedule(j.jobid);
    END LOOP;
END $$;

SELECT cron.schedule('presence-retire-sessions-v1', '* * * * *', 'select public.retire_expired_presence_sessions();');
SELECT cron.schedule('presence-purge-history-v1', '30 3 * * *', 'select public.purge_presence_history();');
-- presence-reconcile-placement-v1 is INTENTIONALLY NOT scheduled until Phase 10 (legacy writer still active).
