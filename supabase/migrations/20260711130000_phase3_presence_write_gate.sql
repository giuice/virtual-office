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

-- Local/hosted `postgres` is not superuser. Ownership transfer to
-- presence_maintenance_owner requires transient membership and transient CREATE
-- on the target schemas; both are revoked at the end of this migration.
GRANT presence_maintenance_owner TO postgres;
GRANT USAGE ON SCHEMA public, private TO presence_maintenance_owner;
GRANT CREATE ON SCHEMA public, private TO presence_maintenance_owner;

CREATE TABLE private.presence_runtime_control (
    singleton_id boolean PRIMARY KEY DEFAULT true,
    mode text NOT NULL CHECK (mode IN ('legacy', 'maintenance', 'atomic')),
    cutover_id uuid,
    changed_at timestamp with time zone NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    changed_by text NOT NULL DEFAULT CURRENT_USER,
    legacy_adapter_enabled boolean NOT NULL DEFAULT true,
    legacy_adapter_disabled_at timestamp with time zone,
    CONSTRAINT presence_runtime_control_singleton CHECK (singleton_id),
    CONSTRAINT presence_runtime_control_adapter_pair CHECK (
        (legacy_adapter_disabled_at IS NOT NULL) = (NOT legacy_adapter_enabled)
    )
);

CREATE TABLE private.presence_legacy_writer_inflight (
    request_id uuid PRIMARY KEY,
    started_at timestamp with time zone NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    hard_deadline timestamp with time zone NOT NULL DEFAULT (
        pg_catalog.clock_timestamp() + INTERVAL '60 seconds'
    ),
    completed_at timestamp with time zone,
    completion_status text CHECK (
        completion_status IS NULL
        OR completion_status IN ('completed', 'rejected', 'failed', 'abandoned')
    ),
    CONSTRAINT presence_legacy_writer_completion_pair CHECK (
        (completed_at IS NULL) = (completion_status IS NULL)
    )
);

INSERT INTO private.presence_runtime_control (
    singleton_id,
    mode,
    cutover_id,
    changed_at,
    changed_by,
    legacy_adapter_enabled,
    legacy_adapter_disabled_at
)
VALUES (
    true,
    'legacy',
    NULL,
    pg_catalog.clock_timestamp(),
    'migration',
    true,
    NULL
);

ALTER TABLE private.presence_runtime_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.presence_runtime_control FORCE ROW LEVEL SECURITY;
ALTER TABLE private.presence_legacy_writer_inflight ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.presence_legacy_writer_inflight FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.presence_runtime_control FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.presence_legacy_writer_inflight FROM PUBLIC, anon, authenticated, service_role;

CREATE POLICY pmo_presence_runtime_control_all
    ON private.presence_runtime_control
    FOR ALL
    TO presence_maintenance_owner
    USING (true)
    WITH CHECK (true);

CREATE POLICY pmo_presence_legacy_writer_all
    ON private.presence_legacy_writer_inflight
    FOR ALL
    TO presence_maintenance_owner
    USING (true)
    WITH CHECK (true);

GRANT SELECT, UPDATE ON private.presence_runtime_control TO presence_maintenance_owner;
GRANT SELECT, INSERT, UPDATE ON private.presence_legacy_writer_inflight TO presence_maintenance_owner;

ALTER TABLE private.presence_runtime_control OWNER TO presence_maintenance_owner;
ALTER TABLE private.presence_legacy_writer_inflight OWNER TO presence_maintenance_owner;

CREATE OR REPLACE FUNCTION public.begin_legacy_presence_write(p_request_id uuid)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_mode text;
    v_started_at timestamp with time zone;
    v_deadline timestamp with time zone;
BEGIN
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'PRESENCE_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    UPDATE private.presence_legacy_writer_inflight AS l
    SET completed_at = l.hard_deadline,
        completion_status = 'abandoned'
    WHERE l.completed_at IS NULL
      AND l.hard_deadline <= pg_catalog.clock_timestamp();

    -- Gate functions lock only the singleton control row. Per handoff L823,
    -- they never enter presence domain lock order.
    SELECT c.mode
    INTO v_mode
    FROM private.presence_runtime_control AS c
    WHERE c.singleton_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRESENCE_RUNTIME_CONTROL_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_mode = 'maintenance' THEN
        RAISE EXCEPTION 'PRESENCE_MAINTENANCE' USING ERRCODE = 'P0001';
    END IF;

    IF v_mode = 'atomic' THEN
        RAISE EXCEPTION 'CLIENT_UPGRADE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    IF v_mode <> 'legacy' THEN
        RAISE EXCEPTION 'PRESENCE_RUNTIME_MODE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    v_started_at := pg_catalog.clock_timestamp();
    v_deadline := v_started_at + INTERVAL '60 seconds';

    INSERT INTO private.presence_legacy_writer_inflight (
        request_id,
        started_at,
        hard_deadline
    )
    VALUES (
        p_request_id,
        v_started_at,
        v_deadline
    );

    RETURN v_deadline;
END;
$$;

ALTER FUNCTION public.begin_legacy_presence_write(uuid) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.begin_legacy_presence_write(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_legacy_presence_write(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.end_legacy_presence_write(
    p_request_id uuid,
    p_completion_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_closed boolean := false;
BEGIN
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'PRESENCE_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    IF p_completion_status NOT IN ('completed', 'rejected', 'failed') THEN
        RAISE EXCEPTION 'PRESENCE_COMPLETION_STATUS_INVALID' USING ERRCODE = 'P0001';
    END IF;

    UPDATE private.presence_legacy_writer_inflight AS l
    SET completed_at = l.hard_deadline,
        completion_status = 'abandoned'
    WHERE l.completed_at IS NULL
      AND l.hard_deadline <= pg_catalog.clock_timestamp();

    UPDATE private.presence_legacy_writer_inflight AS l
    SET completed_at = pg_catalog.clock_timestamp(),
        completion_status = p_completion_status
    WHERE l.request_id = p_request_id
      AND l.completed_at IS NULL
    RETURNING true INTO v_closed;

    RETURN COALESCE(v_closed, false);
END;
$$;

ALTER FUNCTION public.end_legacy_presence_write(uuid, text) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.end_legacy_presence_write(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_legacy_presence_write(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION private.presence_movement_write_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_mode text;
    v_marker text;
    v_claims jsonb;
    v_jwt_role text;
BEGIN
    -- Terminal gate lock only. Per handoff L823, the trigger never locks or
    -- mutates users/spaces/knocks/logs after taking the runtime-control lock.
    SELECT c.mode
    INTO v_mode
    FROM private.presence_runtime_control AS c
    WHERE c.singleton_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRESENCE_RUNTIME_CONTROL_MISSING' USING ERRCODE = 'P0001';
    END IF;

    v_marker := current_setting('app.presence_internal_writer', true);
    IF v_marker = '' THEN
        v_marker := NULL;
    END IF;

    BEGIN
        v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
        v_claims := NULL;
    END;

    v_jwt_role := v_claims ->> 'role';

    IF v_marker IS NOT NULL
       AND v_marker NOT IN (
           'atomic-transition',
           'atomic-reconciliation',
           'maintenance-repair'
       ) THEN
        RAISE EXCEPTION 'PRESENCE_INTERNAL_WRITER_INVALID' USING ERRCODE = 'P0001';
    END IF;

    IF v_jwt_role = 'authenticated' AND v_marker IS NOT NULL THEN
        RAISE EXCEPTION 'PRESENCE_INTERNAL_WRITER_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;

    IF v_mode = 'legacy' THEN
        IF v_marker IS NULL THEN
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'PRESENCE_INTERNAL_WRITER_MODE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    IF v_mode = 'maintenance' THEN
        IF v_marker = 'maintenance-repair' THEN
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'PRESENCE_MAINTENANCE' USING ERRCODE = 'P0001';
    END IF;

    IF v_mode = 'atomic' THEN
        IF v_marker IN ('atomic-transition', 'atomic-reconciliation') THEN
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'CLIENT_UPGRADE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'PRESENCE_RUNTIME_MODE_INVALID' USING ERRCODE = 'P0001';
END;
$$;

ALTER FUNCTION private.presence_movement_write_gate() OWNER TO presence_maintenance_owner;

DROP TRIGGER IF EXISTS presence_gate_users_current_space ON public.users;
CREATE TRIGGER presence_gate_users_current_space
    BEFORE UPDATE OF current_space_id ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION private.presence_movement_write_gate();

DROP TRIGGER IF EXISTS presence_gate_space_presence_log ON public.space_presence_log;
CREATE TRIGGER presence_gate_space_presence_log
    BEFORE INSERT OR UPDATE OR DELETE ON public.space_presence_log
    FOR EACH ROW
    EXECUTE FUNCTION private.presence_movement_write_gate();

DROP TRIGGER IF EXISTS presence_gate_knock_consume ON public.knock_requests;
CREATE TRIGGER presence_gate_knock_consume
    BEFORE UPDATE ON public.knock_requests
    FOR EACH ROW
    WHEN (
        (OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL)
        OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'consumed')
    )
    EXECUTE FUNCTION private.presence_movement_write_gate();

REVOKE ALL ON FUNCTION private.presence_movement_write_gate() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enter_presence_maintenance(p_cutover_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_control private.presence_runtime_control%ROWTYPE;
    v_changed_at timestamp with time zone;
BEGIN
    IF p_cutover_id IS NULL THEN
        RAISE EXCEPTION 'PRESENCE_CUTOVER_ID_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    -- Gate functions lock only the singleton control row and do not enter
    -- presence domain lock order (handoff L823).
    SELECT c.*
    INTO v_control
    FROM private.presence_runtime_control AS c
    WHERE c.singleton_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRESENCE_RUNTIME_CONTROL_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_control.mode <> 'legacy' THEN
        RAISE EXCEPTION 'PRESENCE_MAINTENANCE_REQUIRES_LEGACY' USING ERRCODE = 'P0001';
    END IF;

    v_changed_at := pg_catalog.clock_timestamp();

    UPDATE private.presence_runtime_control AS c
    SET mode = 'maintenance',
        cutover_id = p_cutover_id,
        changed_at = v_changed_at,
        changed_by = SESSION_USER
    WHERE c.singleton_id;

    RETURN jsonb_build_object(
        'mode', 'maintenance',
        'cutoverId', p_cutover_id,
        'changedAt', to_jsonb(v_changed_at)
    );
END;
$$;

ALTER FUNCTION public.enter_presence_maintenance(uuid) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.enter_presence_maintenance(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enter_presence_maintenance(uuid) TO postgres;

CREATE OR REPLACE FUNCTION public.enter_atomic_presence_maintenance(
    p_cutover_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_control private.presence_runtime_control%ROWTYPE;
    v_reason text;
    v_changed_at timestamp with time zone;
BEGIN
    IF p_cutover_id IS NULL THEN
        RAISE EXCEPTION 'PRESENCE_CUTOVER_ID_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    v_reason := btrim(p_reason);
    IF v_reason IS NULL OR length(v_reason) < 1 OR length(v_reason) > 500 THEN
        RAISE EXCEPTION 'PRESENCE_MAINTENANCE_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;

    -- Gate functions lock only the singleton control row and do not enter
    -- presence domain lock order (handoff L823).
    SELECT c.*
    INTO v_control
    FROM private.presence_runtime_control AS c
    WHERE c.singleton_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRESENCE_RUNTIME_CONTROL_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_control.mode <> 'atomic' THEN
        RAISE EXCEPTION 'PRESENCE_ATOMIC_MAINTENANCE_REQUIRES_ATOMIC' USING ERRCODE = 'P0001';
    END IF;

    IF v_control.cutover_id IS NOT DISTINCT FROM p_cutover_id THEN
        RAISE EXCEPTION 'PRESENCE_CUTOVER_ID_MUST_BE_NEW' USING ERRCODE = 'P0001';
    END IF;

    v_changed_at := pg_catalog.clock_timestamp();

    UPDATE private.presence_runtime_control AS c
    SET mode = 'maintenance',
        cutover_id = p_cutover_id,
        changed_at = v_changed_at,
        changed_by = SESSION_USER || ': ' || v_reason
    WHERE c.singleton_id;

    RETURN jsonb_build_object(
        'mode', 'maintenance',
        'cutoverId', p_cutover_id,
        'changedAt', to_jsonb(v_changed_at)
    );
END;
$$;

ALTER FUNCTION public.enter_atomic_presence_maintenance(uuid, text) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.enter_atomic_presence_maintenance(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enter_atomic_presence_maintenance(uuid, text) TO postgres;

CREATE OR REPLACE FUNCTION public.repair_presence_logs_for_cutover(p_cutover_id uuid)
RETURNS TABLE (
    before_open_rows integer,
    before_duplicate_users integer,
    before_mismatched_rows integer,
    repaired_rows integer,
    after_open_rows integer,
    after_duplicate_users integer,
    after_mismatched_rows integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_control private.presence_runtime_control%ROWTYPE;
BEGIN
    IF p_cutover_id IS NULL THEN
        RAISE EXCEPTION 'PRESENCE_CUTOVER_ID_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    SELECT c.*
    INTO v_control
    FROM private.presence_runtime_control AS c
    WHERE c.singleton_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRESENCE_RUNTIME_CONTROL_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_control.mode <> 'maintenance'
       OR v_control.cutover_id IS DISTINCT FROM p_cutover_id THEN
        RAISE EXCEPTION 'PRESENCE_CUTOVER_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*)::integer
    INTO before_open_rows
    FROM public.space_presence_log AS spl
    WHERE spl.exited_at IS NULL;

    SELECT count(*)::integer
    INTO before_duplicate_users
    FROM (
        SELECT spl.user_id
        FROM public.space_presence_log AS spl
        WHERE spl.exited_at IS NULL
        GROUP BY spl.user_id
        HAVING count(*) > 1
    ) AS duplicate_users;

    SELECT count(*)::integer
    INTO before_mismatched_rows
    FROM public.space_presence_log AS spl
    JOIN public.users AS u ON u.id = spl.user_id
    WHERE spl.exited_at IS NULL
      AND spl.space_id IS DISTINCT FROM u.current_space_id;

    PERFORM set_config('app.presence_internal_writer', 'maintenance-repair', true);

    WITH repair_time AS MATERIALIZED (
      SELECT clock_timestamp() AS repaired_at
    ),
    ranked_open_rows AS (
      SELECT
        spl.id,
        spl.user_id,
        spl.space_id,
        spl.entered_at,
        u.current_space_id,
        row_number() OVER (
          PARTITION BY spl.user_id
          ORDER BY spl.entered_at DESC, spl.id DESC
        ) AS row_rank
      FROM public.space_presence_log spl
      JOIN public.users u ON u.id = spl.user_id
      WHERE spl.exited_at IS NULL
    )
    UPDATE public.space_presence_log spl
    SET exited_at = greatest(repair_time.repaired_at, ranked.entered_at)
    FROM ranked_open_rows ranked
    CROSS JOIN repair_time
    WHERE spl.id = ranked.id
      AND (
        ranked.row_rank > 1
        OR ranked.space_id IS DISTINCT FROM ranked.current_space_id
      );

    GET DIAGNOSTICS repaired_rows = ROW_COUNT;

    SELECT count(*)::integer
    INTO after_open_rows
    FROM public.space_presence_log AS spl
    WHERE spl.exited_at IS NULL;

    SELECT count(*)::integer
    INTO after_duplicate_users
    FROM (
        SELECT spl.user_id
        FROM public.space_presence_log AS spl
        WHERE spl.exited_at IS NULL
        GROUP BY spl.user_id
        HAVING count(*) > 1
    ) AS duplicate_users;

    SELECT count(*)::integer
    INTO after_mismatched_rows
    FROM public.space_presence_log AS spl
    JOIN public.users AS u ON u.id = spl.user_id
    WHERE spl.exited_at IS NULL
      AND spl.space_id IS DISTINCT FROM u.current_space_id;

    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.repair_presence_logs_for_cutover(uuid) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.repair_presence_logs_for_cutover(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repair_presence_logs_for_cutover(uuid) TO postgres;

CREATE OR REPLACE FUNCTION public.activate_atomic_presence_writer(p_cutover_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_control private.presence_runtime_control%ROWTYPE;
    v_duplicate_users integer;
    v_mismatched_rows integer;
    v_unfinished_legacy integer;
    v_indexdef text;
    v_expected_indexdef text := 'CREATE UNIQUE INDEX ux_space_presence_log_one_open_per_user ON public.space_presence_log USING btree (user_id) WHERE (exited_at IS NULL)';
    v_changed_at timestamp with time zone;
BEGIN
    IF p_cutover_id IS NULL THEN
        RAISE EXCEPTION 'PRESENCE_CUTOVER_ID_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    SELECT c.*
    INTO v_control
    FROM private.presence_runtime_control AS c
    WHERE c.singleton_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRESENCE_RUNTIME_CONTROL_MISSING' USING ERRCODE = 'P0001';
    END IF;

    IF v_control.mode <> 'maintenance'
       OR v_control.cutover_id IS DISTINCT FROM p_cutover_id THEN
        RAISE EXCEPTION 'PRESENCE_CUTOVER_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    UPDATE private.presence_legacy_writer_inflight AS l
    SET completed_at = l.hard_deadline,
        completion_status = 'abandoned'
    WHERE l.completed_at IS NULL
      AND l.hard_deadline <= pg_catalog.clock_timestamp();

    SELECT count(*)::integer
    INTO v_duplicate_users
    FROM (
        SELECT spl.user_id
        FROM public.space_presence_log AS spl
        WHERE spl.exited_at IS NULL
        GROUP BY spl.user_id
        HAVING count(*) > 1
    ) AS duplicate_users;

    SELECT count(*)::integer
    INTO v_mismatched_rows
    FROM public.space_presence_log AS spl
    JOIN public.users AS u ON u.id = spl.user_id
    WHERE spl.exited_at IS NULL
      AND spl.space_id IS DISTINCT FROM u.current_space_id;

    IF v_duplicate_users <> 0 OR v_mismatched_rows <> 0 THEN
        RAISE EXCEPTION 'PRESENCE_OPEN_LOG_REPAIR_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_get_indexdef(i.indexrelid)
    INTO v_indexdef
    FROM pg_index AS i
    JOIN pg_class AS idx ON idx.oid = i.indexrelid
    JOIN pg_class AS tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace AS n ON n.oid = tbl.relnamespace
    WHERE n.nspname = 'public'
      AND tbl.relname = 'space_presence_log'
      AND idx.relname = 'ux_space_presence_log_one_open_per_user';

    IF v_indexdef IS DISTINCT FROM v_expected_indexdef THEN
        RAISE EXCEPTION 'PRESENCE_OPEN_LOG_UNIQUE_INDEX_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*)::integer
    INTO v_unfinished_legacy
    FROM private.presence_legacy_writer_inflight AS l
    WHERE l.completed_at IS NULL
      AND l.hard_deadline > pg_catalog.clock_timestamp();

    IF v_unfinished_legacy <> 0 THEN
        RAISE EXCEPTION 'PRESENCE_LEGACY_WRITERS_INFLIGHT' USING ERRCODE = 'P0001';
    END IF;

    v_changed_at := pg_catalog.clock_timestamp();

    UPDATE private.presence_runtime_control AS c
    SET mode = 'atomic',
        changed_at = v_changed_at,
        changed_by = SESSION_USER
    WHERE c.singleton_id;

    RETURN jsonb_build_object(
        'mode', 'atomic',
        'cutoverId', p_cutover_id,
        'changedAt', to_jsonb(v_changed_at)
    );
END;
$$;

ALTER FUNCTION public.activate_atomic_presence_writer(uuid) OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.activate_atomic_presence_writer(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_atomic_presence_writer(uuid) TO postgres;

REVOKE CREATE ON SCHEMA public, private FROM presence_maintenance_owner;
REVOKE presence_maintenance_owner FROM postgres;
