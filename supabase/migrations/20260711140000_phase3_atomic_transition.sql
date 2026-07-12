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

GRANT presence_maintenance_owner TO postgres;
GRANT USAGE ON SCHEMA public, private TO presence_maintenance_owner;
GRANT CREATE ON SCHEMA private TO presence_maintenance_owner;

GRANT SELECT, UPDATE ON TABLE public.user_presence_sessions TO service_role;
GRANT SELECT, INSERT ON TABLE public.revoked_presence_auth_sessions TO service_role;

CREATE OR REPLACE FUNCTION private.presence_runtime_mode()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT c.mode
    FROM private.presence_runtime_control AS c
    WHERE c.singleton_id;
$$;

ALTER FUNCTION private.presence_runtime_mode() OWNER TO presence_maintenance_owner;
REVOKE ALL ON FUNCTION private.presence_runtime_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.presence_runtime_mode() TO service_role;

CREATE OR REPLACE FUNCTION public.transition_user_location(
    p_user_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid,
    p_transition_id uuid,
    p_target_space_id uuid,
    p_reason text,
    p_knock_request_id text,
    p_expected_location_version integer
)
RETURNS TABLE (
    ok boolean,
    code text,
    message text,
    transition_id uuid,
    previous_space_id uuid,
    current_space_id uuid,
    location_version integer,
    already_applied boolean,
    authorized_by uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_mode text;
    v_claimed boolean := false;
    v_existing public.location_transition_requests%ROWTYPE;
    v_prelim_knock public.knock_requests%ROWTYPE;
    v_knock public.knock_requests%ROWTYPE;
    v_user public.users%ROWTYPE;
    v_responder public.users%ROWTYPE;
    v_target public.spaces%ROWTYPE;
    v_exact_session public.user_presence_sessions%ROWTYPE;
    v_user_lock_ids uuid[];
    v_space_lock_ids uuid[];
    v_prelim_responder_id uuid;
    v_operation_server_time timestamp with time zone;
    v_pre_transition_version integer;
    v_result_location_version integer;
    v_previous_space_id uuid;
    v_current_space_id uuid;
    v_authorized_by uuid;
    v_authorization_mode text;
    v_retryable boolean := false;
    v_store_result boolean := false;
    v_delete_claim boolean := false;
    v_result jsonb;
    v_target_missing boolean := false;
    v_knock_missing boolean := false;
    v_knock_identity_invalid boolean := false;
    v_marker_set boolean := false;
    v_access_type text;
    v_is_public_type text;
    v_restricted boolean := false;
    v_direct_access boolean := false;
    v_rejoin_access boolean := false;
    v_knock_access boolean := false;
    v_capacity integer;
    v_occupants integer;
    v_has_other_active_session boolean := false;
    v_rows integer;
BEGIN
    -- Mode is validated only for NEWLY claimed commands (below, after the
    -- idempotency replay path): a stored replay must return its result in any
    -- runtime mode (handoff step 4 — e.g. exact logout replay during a
    -- maintenance window), and it performs no gated write.
    v_mode := private.presence_runtime_mode();

    IF p_user_id IS NULL
       OR p_auth_session_id IS NULL
       OR p_transition_id IS NULL
       OR p_reason NOT IN (
           'manual-enter',
           'manual-leave',
           'knock-enter',
           'auto-first-placement',
           'auto-rejoin',
           'auto-fallback',
           'teleport-accept',
           'logout'
       )
       OR (p_reason <> 'logout' AND p_session_id IS NULL)
       OR (p_reason IN (
              'manual-enter',
              'auto-first-placement',
              'auto-rejoin',
              'auto-fallback',
              'teleport-accept'
           ) AND p_target_space_id IS NULL)
       OR (p_reason IN ('manual-leave', 'logout')
           AND (p_target_space_id IS NOT NULL OR p_knock_request_id IS NOT NULL))
       OR (p_reason = 'knock-enter'
           AND (p_target_space_id IS NULL OR p_knock_request_id IS NULL))
       OR (p_reason <> 'knock-enter' AND p_knock_request_id IS NOT NULL)
       OR (p_reason IN ('auto-first-placement', 'auto-rejoin', 'auto-fallback', 'knock-enter')
           AND (p_expected_location_version IS NULL OR p_expected_location_version < 0))
       OR (p_reason NOT IN ('auto-first-placement', 'auto-rejoin', 'auto-fallback', 'knock-enter')
           AND p_expected_location_version IS NOT NULL) THEN
        ok := false;
        code := 'INVALID_REQUEST';
        message := 'Invalid location transition request';
        transition_id := p_transition_id;
        previous_space_id := NULL;
        current_space_id := NULL;
        location_version := NULL;
        already_applied := false;
        authorized_by := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    INSERT INTO public.location_transition_requests (
        user_id,
        transition_id,
        auth_session_id,
        requested_space_id,
        reason,
        knock_request_id,
        expected_location_version,
        result
    )
    VALUES (
        p_user_id,
        p_transition_id,
        p_auth_session_id,
        p_target_space_id,
        p_reason,
        p_knock_request_id,
        p_expected_location_version,
        NULL
    )
    ON CONFLICT DO NOTHING
    RETURNING true INTO v_claimed;

    IF NOT COALESCE(v_claimed, false) THEN
        SELECT r.*
        INTO v_existing
        FROM public.location_transition_requests AS r
        WHERE r.user_id = p_user_id
          AND r.transition_id = p_transition_id;

        IF NOT FOUND THEN
            ok := false;
            code := 'INTERNAL_ERROR';
            message := 'Transition replay could not be resolved';
            transition_id := p_transition_id;
            previous_space_id := NULL;
            current_space_id := NULL;
            location_version := NULL;
            already_applied := false;
            authorized_by := NULL;
            RETURN NEXT;
            RETURN;
        END IF;

        IF v_existing.auth_session_id <> p_auth_session_id
           OR v_existing.reason <> p_reason
           OR v_existing.requested_space_id IS DISTINCT FROM p_target_space_id
           OR v_existing.knock_request_id IS DISTINCT FROM p_knock_request_id
           OR v_existing.expected_location_version IS DISTINCT FROM p_expected_location_version THEN
            ok := false;
            code := 'IDEMPOTENCY_CONFLICT';
            message := 'Transition id was reused with a different request';
            transition_id := p_transition_id;
            previous_space_id := NULL;
            current_space_id := NULL;
            location_version := NULL;
            already_applied := false;
            authorized_by := NULL;
            RETURN NEXT;
            RETURN;
        END IF;

        IF v_existing.result IS NULL THEN
            ok := false;
            code := 'INTERNAL_ERROR';
            message := 'Transition is still in progress after conflict resolution';
            transition_id := p_transition_id;
            previous_space_id := NULL;
            current_space_id := NULL;
            location_version := NULL;
            already_applied := false;
            authorized_by := NULL;
            RETURN NEXT;
            RETURN;
        END IF;

        ok := COALESCE((v_existing.result ->> 'ok')::boolean, false);
        code := v_existing.result ->> 'code';
        message := v_existing.result ->> 'message';
        transition_id := p_transition_id;
        previous_space_id := (v_existing.result ->> 'previousSpaceId')::uuid;
        current_space_id := (v_existing.result ->> 'currentSpaceId')::uuid;
        location_version := (v_existing.result ->> 'locationVersion')::integer;
        already_applied := true;
        authorized_by := (v_existing.result ->> 'authorizedBy')::uuid;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Newly claimed command: reject before any gated side effect when the
    -- atomic writer is not active. The still-null claim is removed so a retry
    -- after cutover/maintenance reuses the same transition id (uncached).
    IF v_mode IS DISTINCT FROM 'atomic' THEN
        DELETE FROM public.location_transition_requests AS r
        WHERE r.user_id = p_user_id
          AND r.transition_id = p_transition_id
          AND r.result IS NULL;

        ok := false;
        code := 'PRESENCE_MAINTENANCE';
        message := 'Presence is temporarily unavailable';
        transition_id := p_transition_id;
        previous_space_id := NULL;
        current_space_id := NULL;
        location_version := NULL;
        already_applied := false;
        authorized_by := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    <<transition_block>>
    BEGIN
        IF p_reason = 'knock-enter' THEN
            SELECT kr.*
            INTO v_prelim_knock
            FROM public.knock_requests AS kr
            WHERE kr.id = p_knock_request_id;

            IF NOT FOUND
               OR v_prelim_knock.status <> 'approved'
               OR v_prelim_knock.responder_id IS NULL THEN
                ok := false;
                code := 'KNOCK_NOT_READY';
                message := 'Knock approval is not ready';
                v_retryable := true;
                v_delete_claim := true;
                EXIT transition_block;
            END IF;

            v_prelim_responder_id := v_prelim_knock.responder_id;
        END IF;

        SELECT pg_catalog.array_agg(lock_ids.id ORDER BY lock_ids.id)
        INTO v_user_lock_ids
        FROM (
            SELECT DISTINCT id
            FROM (
                VALUES (p_user_id), (v_prelim_responder_id)
            ) AS candidate(id)
            WHERE id IS NOT NULL
        ) AS lock_ids;

        PERFORM u.id
        FROM public.users AS u
        WHERE u.id = ANY (v_user_lock_ids)
        ORDER BY u.id
        FOR NO KEY UPDATE;

        SELECT u.*
        INTO v_user
        FROM public.users AS u
        WHERE u.id = p_user_id;

        IF NOT FOUND THEN
            ok := false;
            code := 'INVALID_REQUEST';
            message := 'User was not found';
            v_delete_claim := true;
            EXIT transition_block;
        END IF;

        v_previous_space_id := v_user.current_space_id;
        v_current_space_id := v_user.current_space_id;
        v_result_location_version := v_user.location_version;

        IF v_prelim_responder_id IS NOT NULL THEN
            SELECT u.*
            INTO v_responder
            FROM public.users AS u
            WHERE u.id = v_prelim_responder_id;

            IF NOT FOUND THEN
                v_knock_identity_invalid := true;
            END IF;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.revoked_presence_auth_sessions AS f
            WHERE f.user_id = p_user_id
              AND f.auth_session_id = p_auth_session_id
        ) THEN
            ok := false;
            code := 'AUTH_SESSION_REVOKED';
            message := 'Authentication session has been revoked';
            v_delete_claim := true;
            EXIT transition_block;
        END IF;

        SELECT pg_catalog.array_agg(lock_ids.id ORDER BY lock_ids.id)
        INTO v_space_lock_ids
        FROM (
            SELECT DISTINCT id
            FROM (
                VALUES (v_user.current_space_id), (p_target_space_id)
            ) AS candidate(id)
            WHERE id IS NOT NULL
        ) AS lock_ids;

        IF COALESCE(pg_catalog.array_length(v_space_lock_ids, 1), 0) > 0 THEN
            PERFORM sp.id
            FROM public.spaces AS sp
            WHERE sp.id = ANY (v_space_lock_ids)
            ORDER BY sp.id
            FOR NO KEY UPDATE;
        END IF;

        IF p_target_space_id IS NOT NULL THEN
            SELECT sp.*
            INTO v_target
            FROM public.spaces AS sp
            WHERE sp.id = p_target_space_id;

            v_target_missing := NOT FOUND;
        END IF;

        IF p_knock_request_id IS NOT NULL THEN
            SELECT kr.*
            INTO v_knock
            FROM public.knock_requests AS kr
            WHERE kr.id = p_knock_request_id
            FOR UPDATE;

            v_knock_missing := NOT FOUND;
            IF NOT v_knock_missing
               AND v_knock.responder_id IS DISTINCT FROM v_prelim_responder_id THEN
                v_knock_identity_invalid := true;
            END IF;
        END IF;

        PERFORM s.id
        FROM public.user_presence_sessions AS s
        WHERE (
            p_reason = 'logout'
            AND s.user_id = p_user_id
        )
        OR (
            p_reason <> 'logout'
            AND (
                s.id = p_session_id
                OR s.user_id = p_user_id
                OR (
                    p_target_space_id IS NOT NULL
                    AND s.space_id = p_target_space_id
                    AND s.retired_at IS NULL
                )
            )
        )
        ORDER BY s.id
        FOR UPDATE;

        PERFORM l.id
        FROM public.space_presence_log AS l
        WHERE l.user_id = p_user_id
          AND l.exited_at IS NULL
        ORDER BY l.id
        FOR UPDATE;

        v_operation_server_time := pg_catalog.clock_timestamp();

        IF p_reason <> 'logout' THEN
            SELECT s.*
            INTO v_exact_session
            FROM public.user_presence_sessions AS s
            WHERE s.id = p_session_id;

            IF NOT FOUND
               OR v_exact_session.user_id <> p_user_id
               OR v_exact_session.auth_session_id <> p_auth_session_id
               OR v_exact_session.retired_at IS NOT NULL
               OR v_exact_session.expires_at <= v_operation_server_time THEN
                ok := false;
                code := 'SESSION_INVALID';
                message := 'Presence session is no longer active';
                v_retryable := true;
                v_delete_claim := true;
                EXIT transition_block;
            END IF;
        END IF;

        IF p_reason IN ('auto-first-placement', 'auto-rejoin', 'auto-fallback', 'knock-enter')
           AND v_user.location_version <> p_expected_location_version THEN
            ok := false;
            code := 'LOCATION_SUPERSEDED';
            message := 'Location changed before this transition could be applied';
            v_store_result := true;
            EXIT transition_block;
        END IF;

        IF p_reason = 'logout' THEN
            v_pre_transition_version := v_user.location_version;
            v_result_location_version := v_pre_transition_version;

            INSERT INTO public.revoked_presence_auth_sessions (
                auth_session_id,
                user_id,
                revoked_at
            )
            VALUES (
                p_auth_session_id,
                p_user_id,
                v_operation_server_time
            );

            UPDATE public.user_presence_sessions AS s
            SET retired_at = v_operation_server_time,
                retirement_reason = 'logout',
                expires_at = v_operation_server_time,
                space_id = NULL,
                placement_version = NULL,
                user_access_revision = NULL,
                space_access_revision = NULL
            WHERE s.user_id = p_user_id
              AND s.auth_session_id = p_auth_session_id
              AND s.retired_at IS NULL;

            SELECT EXISTS (
                SELECT 1
                FROM public.user_presence_sessions AS s
                WHERE s.user_id = p_user_id
                  AND s.auth_session_id <> p_auth_session_id
                  AND s.retired_at IS NULL
                  AND s.expires_at > v_operation_server_time
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.revoked_presence_auth_sessions AS f
                      WHERE f.user_id = s.user_id
                        AND f.auth_session_id = s.auth_session_id
                  )
            )
            INTO v_has_other_active_session;

            IF NOT v_has_other_active_session THEN
                v_result_location_version := v_pre_transition_version + 1;
                PERFORM set_config('app.presence_internal_writer', 'atomic-transition', true);
                v_marker_set := true;

                UPDATE public.users AS u
                SET current_space_id = NULL,
                    location_version = v_result_location_version
                WHERE u.id = p_user_id
                RETURNING u.* INTO v_user;

                UPDATE public.user_presence_sessions AS s
                SET space_id = NULL,
                    placement_version = NULL,
                    user_access_revision = NULL,
                    space_access_revision = NULL
                WHERE s.user_id = p_user_id
                  AND s.retired_at IS NULL;

                UPDATE public.space_presence_log AS l
                SET exited_at = greatest(
                    v_operation_server_time,
                    l.entered_at + INTERVAL '1 microsecond'
                )
                WHERE l.user_id = p_user_id
                  AND l.exited_at IS NULL;

                v_current_space_id := NULL;
            ELSE
                v_current_space_id := v_previous_space_id;
            END IF;

            ok := true;
            code := CASE
                WHEN v_previous_space_id IS DISTINCT FROM v_current_space_id
                    THEN 'LOCATION_UPDATED'
                ELSE 'LOCATION_UNCHANGED'
            END;
            message := CASE
                WHEN code = 'LOCATION_UPDATED' THEN 'Location updated'
                ELSE 'Location unchanged'
            END;
            v_store_result := true;
            EXIT transition_block;
        END IF;

        IF v_target_missing THEN
            ok := false;
            code := 'SPACE_NOT_FOUND';
            message := 'Space was not found';
            v_store_result := true;
            EXIT transition_block;
        END IF;

        IF p_target_space_id IS NOT NULL THEN
            IF v_user.company_id IS NULL
               OR v_target.company_id IS DISTINCT FROM v_user.company_id THEN
                ok := false;
                code := 'CROSS_COMPANY_SPACE';
                message := 'Space belongs to a different company';
                v_store_result := true;
                EXIT transition_block;
            END IF;

            IF v_target.status::text NOT IN ('active', 'available') THEN
                ok := false;
                code := 'SPACE_UNAVAILABLE';
                message := 'Space is not available';
                v_store_result := true;
                EXIT transition_block;
            END IF;

            v_capacity := v_target.capacity;
            IF v_capacity IS NOT NULL AND v_capacity > 0 THEN
                SELECT pg_catalog.count(DISTINCT s.user_id)::integer
                INTO v_occupants
                FROM public.user_presence_sessions AS s
                JOIN public.users AS occupant ON occupant.id = s.user_id
                WHERE s.space_id = p_target_space_id
                  AND s.user_id <> p_user_id
                  AND s.retired_at IS NULL
                  AND s.expires_at > v_operation_server_time
                  AND occupant.current_space_id = p_target_space_id
                  AND s.placement_version = occupant.location_version
                  AND s.user_access_revision = occupant.presence_access_revision
                  AND s.space_access_revision = v_target.presence_access_revision;

                IF v_occupants >= v_capacity THEN
                    ok := false;
                    code := 'SPACE_FULL';
                    message := 'Space is full';
                    v_store_result := true;
                    EXIT transition_block;
                END IF;
            END IF;

            IF v_target.access_control IS NULL
               OR v_target.access_control = 'null'::jsonb THEN
                v_authorization_mode := 'public';
            ELSE
                v_access_type := jsonb_typeof(v_target.access_control);
                IF v_access_type IS DISTINCT FROM 'object' THEN
                    ok := false;
                    code := 'SPACE_ACCESS_CONFIGURATION_INVALID';
                    message := 'Space access configuration is invalid';
                    v_store_result := true;
                    EXIT transition_block;
                ELSIF v_target.access_control = '{}'::jsonb THEN
                    v_authorization_mode := 'public';
                ELSE
                    v_is_public_type := jsonb_typeof(v_target.access_control -> 'isPublic');
                    IF v_is_public_type IS DISTINCT FROM 'boolean' THEN
                        ok := false;
                        code := 'SPACE_ACCESS_CONFIGURATION_INVALID';
                        message := 'Space access configuration is invalid';
                        v_store_result := true;
                        EXIT transition_block;
                    ELSIF (v_target.access_control ->> 'isPublic')::boolean THEN
                        v_authorization_mode := 'public';
                    ELSE
                        v_restricted := true;
                    END IF;
                END IF;
            END IF;

            IF v_restricted THEN
                v_direct_access := COALESCE(
                    v_user.role::text = 'admin'
                    OR (v_target.access_control ->> 'ownerId') = v_user.id::text
                    OR (
                        jsonb_typeof(v_target.access_control -> 'allowedUsers') = 'array'
                        AND (v_target.access_control -> 'allowedUsers') ? v_user.id::text
                    )
                    OR (
                        jsonb_typeof(v_target.access_control -> 'allowedRoles') = 'array'
                        AND (v_target.access_control -> 'allowedRoles') ? v_user.role::text
                    ),
                    false
                );

                IF v_direct_access THEN
                    v_authorization_mode := 'direct';
                ELSE
                    SELECT EXISTS (
                        SELECT 1
                        FROM public.user_presence_sessions AS s
                        WHERE s.user_id = p_user_id
                          AND s.space_id = p_target_space_id
                          AND s.placement_version = v_user.location_version
                          AND s.user_access_revision = v_user.presence_access_revision
                          AND s.space_access_revision = v_target.presence_access_revision
                          AND coalesce(s.retired_at, s.expires_at)
                                >= v_operation_server_time - INTERVAL '5 minutes'
                    )
                    INTO v_rejoin_access;

                    IF v_rejoin_access THEN
                        v_authorization_mode := 'rejoin';
                    END IF;
                END IF;
            END IF;

            IF p_reason = 'knock-enter' THEN
                IF v_knock_missing OR v_knock_identity_invalid THEN
                    ok := false;
                    code := 'KNOCK_INVALID';
                    message := 'Knock approval is invalid';
                    v_store_result := true;
                    EXIT transition_block;
                END IF;

                IF v_knock.consumed_at IS NOT NULL OR v_knock.status = 'consumed' THEN
                    ok := false;
                    code := 'KNOCK_ALREADY_CONSUMED';
                    message := 'Knock approval was already consumed';
                    v_store_result := true;
                    EXIT transition_block;
                END IF;

                IF v_knock.expires_at <= v_operation_server_time
                   OR v_knock.status = 'expired' THEN
                    ok := false;
                    code := 'KNOCK_EXPIRED';
                    message := 'Knock approval has expired';
                    v_store_result := true;
                    EXIT transition_block;
                END IF;

                IF v_knock.status <> 'approved'
                   OR v_knock.responder_id IS NULL
                   OR v_knock.requester_id <> p_user_id
                   OR v_knock.company_id <> v_user.company_id
                   OR v_knock.space_id <> p_target_space_id THEN
                    ok := false;
                    code := 'KNOCK_INVALID';
                    message := 'Knock approval is invalid';
                    v_store_result := true;
                    EXIT transition_block;
                END IF;

                IF v_knock.requester_location_version <> p_expected_location_version
                   OR v_knock.requester_location_version <> v_user.location_version
                   OR v_knock.requester_access_revision <> v_user.presence_access_revision
                   OR v_knock.space_access_revision <> v_target.presence_access_revision
                   OR v_knock.responder_access_revision <> v_responder.presence_access_revision THEN
                    ok := false;
                    code := 'KNOCK_SUPERSEDED';
                    message := 'Knock approval was superseded';
                    v_store_result := true;
                    EXIT transition_block;
                END IF;

                v_knock_access := true;
                v_authorization_mode := 'knock';
            END IF;

            IF v_restricted
               AND NOT COALESCE(v_direct_access, false)
               AND NOT COALESCE(v_rejoin_access, false)
               AND NOT COALESCE(v_knock_access, false) THEN
                ok := false;
                code := 'SPACE_ACCESS_DENIED';
                message := 'Space access denied';
                v_store_result := true;
                EXIT transition_block;
            END IF;
        END IF;

        v_pre_transition_version := v_user.location_version;
        v_result_location_version := v_pre_transition_version + 1;

        IF p_reason = 'knock-enter' THEN
            PERFORM set_config('app.presence_internal_writer', 'atomic-transition', true);
            v_marker_set := true;

            UPDATE public.knock_requests AS kr
            SET status = 'consumed',
                consumed_at = v_operation_server_time,
                updated_at = v_operation_server_time
            WHERE kr.id = p_knock_request_id
              AND kr.status = 'approved'
              AND kr.consumed_at IS NULL
              AND kr.expires_at > v_operation_server_time
              AND kr.requester_id = p_user_id
              AND kr.company_id = v_user.company_id
              AND kr.space_id = p_target_space_id
              AND kr.responder_id = v_prelim_responder_id
              AND kr.requester_location_version = p_expected_location_version
              AND kr.requester_location_version = v_pre_transition_version
              AND kr.requester_access_revision = v_user.presence_access_revision
              AND kr.space_access_revision = v_target.presence_access_revision
              AND kr.responder_access_revision = v_responder.presence_access_revision
            RETURNING kr.responder_id INTO v_authorized_by;

            GET DIAGNOSTICS v_rows = ROW_COUNT;
            IF v_rows = 0 THEN
                IF v_knock.consumed_at IS NOT NULL OR v_knock.status = 'consumed' THEN
                    code := 'KNOCK_ALREADY_CONSUMED';
                    message := 'Knock approval was already consumed';
                ELSIF v_knock.expires_at <= v_operation_server_time
                      OR v_knock.status = 'expired' THEN
                    code := 'KNOCK_EXPIRED';
                    message := 'Knock approval has expired';
                ELSIF v_knock.requester_location_version IS DISTINCT FROM p_expected_location_version
                      OR v_knock.requester_location_version IS DISTINCT FROM v_pre_transition_version
                      OR v_knock.requester_access_revision IS DISTINCT FROM v_user.presence_access_revision
                      OR v_knock.space_access_revision IS DISTINCT FROM v_target.presence_access_revision
                      OR v_knock.responder_access_revision IS DISTINCT FROM v_responder.presence_access_revision THEN
                    code := 'KNOCK_SUPERSEDED';
                    message := 'Knock approval was superseded';
                ELSE
                    code := 'KNOCK_INVALID';
                    message := 'Knock approval is invalid';
                END IF;

                ok := false;
                v_store_result := true;
                EXIT transition_block;
            END IF;
        END IF;

        IF NOT v_marker_set THEN
            PERFORM set_config('app.presence_internal_writer', 'atomic-transition', true);
            v_marker_set := true;
        END IF;

        UPDATE public.users AS u
        SET current_space_id = p_target_space_id,
            location_version = v_result_location_version,
            initial_placement_completed_at = CASE
                WHEN p_target_space_id IS NOT NULL
                    THEN coalesce(u.initial_placement_completed_at, v_operation_server_time)
                ELSE u.initial_placement_completed_at
            END
        WHERE u.id = p_user_id
        RETURNING u.* INTO v_user;

        IF p_target_space_id IS NULL THEN
            UPDATE public.user_presence_sessions AS s
            SET space_id = NULL,
                placement_version = NULL,
                user_access_revision = NULL,
                space_access_revision = NULL
            WHERE s.user_id = p_user_id
              AND s.retired_at IS NULL;
        ELSE
            UPDATE public.user_presence_sessions AS s
            SET space_id = p_target_space_id,
                placement_version = v_result_location_version,
                user_access_revision = v_user.presence_access_revision,
                space_access_revision = v_target.presence_access_revision
            WHERE s.user_id = p_user_id
              AND s.retired_at IS NULL
              AND s.expires_at > v_operation_server_time;
        END IF;

        UPDATE public.space_presence_log AS l
        SET exited_at = greatest(
            v_operation_server_time,
            l.entered_at + INTERVAL '1 microsecond'
        )
        WHERE l.user_id = p_user_id
          AND l.exited_at IS NULL
          AND (
              p_target_space_id IS NULL
              OR l.space_id IS DISTINCT FROM p_target_space_id
          );

        IF p_target_space_id IS NOT NULL THEN
            INSERT INTO public.space_presence_log (
                user_id,
                space_id,
                entered_at,
                session_type,
                context,
                authorized_by
            )
            SELECT
                p_user_id,
                p_target_space_id,
                v_operation_server_time,
                'workspace'::public.session_type_enum,
                'atomic-transition',
                v_authorized_by
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.space_presence_log AS l
                WHERE l.user_id = p_user_id
                  AND l.space_id = p_target_space_id
                  AND l.exited_at IS NULL
            );
        END IF;

        v_current_space_id := p_target_space_id;
        ok := true;
        code := CASE
            WHEN v_previous_space_id IS DISTINCT FROM v_current_space_id
                THEN 'LOCATION_UPDATED'
            ELSE 'LOCATION_UNCHANGED'
        END;
        message := CASE
            WHEN code = 'LOCATION_UPDATED' THEN 'Location updated'
            ELSE 'Location unchanged'
        END;
        v_store_result := true;
    END;

    transition_id := p_transition_id;
    previous_space_id := v_previous_space_id;
    current_space_id := v_current_space_id;
    location_version := v_result_location_version;
    already_applied := false;
    authorized_by := v_authorized_by;

    IF v_delete_claim THEN
        DELETE FROM public.location_transition_requests AS r
        WHERE r.user_id = p_user_id
          AND r.transition_id = p_transition_id
          AND r.result IS NULL;
    END IF;

    IF v_store_result THEN
        v_result := jsonb_build_object(
            'ok', ok,
            'code', code,
            'message', message,
            'transitionId', p_transition_id,
            'previousSpaceId', previous_space_id,
            'currentSpaceId', current_space_id,
            'locationVersion', location_version,
            'alreadyApplied', false,
            'authorizedBy', authorized_by,
            'retryable', v_retryable,
            'reason', p_reason,
            'expectedLocationVersion', p_expected_location_version,
            'authorizationMode', v_authorization_mode,
            'operationServerTime', v_operation_server_time
        );

        UPDATE public.location_transition_requests AS r
        SET result = v_result
        WHERE r.user_id = p_user_id
          AND r.transition_id = p_transition_id
          AND r.result IS NULL;
    END IF;

    RETURN NEXT;
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_user_location(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_user_location(
    uuid,
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_company_presence_snapshot(p_viewer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_snapshot jsonb;
    v_error text;
BEGIN
    WITH server_time AS MATERIALIZED (
        SELECT clock_timestamp() AS server_time
    ),
    viewer AS (
        SELECT u.id, u.company_id, u.initial_placement_completed_at
        FROM public.users AS u
        WHERE u.id = p_viewer_user_id
    ),
    same_company_users AS (
        SELECT
            u.id,
            u.display_name,
            u.avatar_url,
            u.current_space_id,
            u.location_version,
            u.presence_access_revision,
            u.status,
            u.status_message,
            u.initial_placement_completed_at,
            sp.presence_access_revision AS space_access_revision
        FROM viewer AS v
        JOIN public.users AS u ON u.company_id = v.company_id
        LEFT JOIN public.spaces AS sp ON sp.id = u.current_space_id
        WHERE v.company_id IS NOT NULL
    ),
    company_size AS (
        SELECT count(*)::integer AS user_count
        FROM same_company_users
    ),
    guard AS (
        SELECT CASE
            WHEN NOT EXISTS (SELECT 1 FROM viewer)
                OR EXISTS (SELECT 1 FROM viewer AS v WHERE v.company_id IS NULL)
                THEN 'PRESENCE_VIEWER_NO_COMPANY'
            WHEN (SELECT user_count FROM company_size) > 5000
                THEN 'PRESENCE_SNAPSHOT_TOO_LARGE'
            ELSE NULL
        END AS error_code
    ),
    user_flags AS (
        SELECT
            u.*,
            EXISTS (
                SELECT 1
                FROM public.user_presence_sessions AS s
                CROSS JOIN server_time AS st
                WHERE s.user_id = u.id
                  AND s.retired_at IS NULL
                  AND s.expires_at > st.server_time
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.revoked_presence_auth_sessions AS f
                      WHERE f.user_id = s.user_id
                        AND f.auth_session_id = s.auth_session_id
                  )
            ) AS is_connected,
            EXISTS (
                SELECT 1
                FROM public.user_presence_sessions AS s
                CROSS JOIN server_time AS st
                WHERE s.user_id = u.id
                  AND s.retired_at IS NULL
                  AND s.expires_at > st.server_time
                  AND s.space_id = u.current_space_id
                  AND s.placement_version = u.location_version
                  AND s.user_access_revision = u.presence_access_revision
                  AND s.space_access_revision = u.space_access_revision
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public.revoked_presence_auth_sessions AS f
                      WHERE f.user_id = s.user_id
                        AND f.auth_session_id = s.auth_session_id
                  )
            ) AS is_occupying_current_space
        FROM same_company_users AS u
    ),
    users_json AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', uf.id,
                'displayName', uf.display_name,
                'avatarUrl', uf.avatar_url,
                'currentSpaceId', uf.current_space_id,
                'locationVersion', uf.location_version,
                'availabilityStatus', CASE
                    WHEN uf.status::text = 'offline' THEN 'online'
                    ELSE uf.status::text
                END,
                'isConnected', uf.is_connected,
                'isOccupyingCurrentSpace', uf.is_occupying_current_space,
                'displayStatus', CASE
                    WHEN NOT uf.is_connected THEN 'offline'
                    WHEN uf.status::text = 'away' THEN 'away'
                    WHEN uf.status::text = 'busy' THEN 'busy'
                    ELSE 'online'
                END,
                'statusMessage', uf.status_message
            )
            ORDER BY uf.id
        ) AS users
        FROM user_flags AS uf
    )
    SELECT CASE
        WHEN guard.error_code IS NOT NULL THEN
            jsonb_build_object('error', guard.error_code)
        ELSE
            jsonb_build_object(
                'serverTime', st.server_time,
                'companyId', v.company_id,
                'viewerUserId', v.id,
                'currentUser', jsonb_build_object(
                    'initialPlacementCompletedAt', v.initial_placement_completed_at
                ),
                'users', coalesce(users_json.users, '[]'::jsonb)
            )
    END
    INTO v_snapshot
    FROM guard
    CROSS JOIN server_time AS st
    LEFT JOIN viewer AS v ON true
    CROSS JOIN users_json;

    v_error := v_snapshot ->> 'error';
    IF v_error = 'PRESENCE_SNAPSHOT_TOO_LARGE' THEN
        RAISE EXCEPTION 'PRESENCE_SNAPSHOT_TOO_LARGE' USING ERRCODE = 'P0001';
    END IF;
    IF v_error = 'PRESENCE_VIEWER_NO_COMPANY' THEN
        RAISE EXCEPTION 'PRESENCE_VIEWER_NO_COMPANY' USING ERRCODE = 'P0001';
    END IF;

    RETURN v_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_presence_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_presence_snapshot(uuid) TO service_role;

ALTER TABLE public.space_presence_log
    DROP CONSTRAINT IF EXISTS space_presence_log_space_id_fkey;
ALTER TABLE public.space_presence_log
    ADD CONSTRAINT space_presence_log_space_id_fkey
    FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT;

ALTER TABLE public.user_presence_sessions
    DROP CONSTRAINT IF EXISTS user_presence_sessions_space_id_fkey;
ALTER TABLE public.user_presence_sessions
    ADD CONSTRAINT user_presence_sessions_space_id_fkey
    FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT;

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_current_space_id_fkey;
ALTER TABLE public.users
    ADD CONSTRAINT users_current_space_id_fkey
    FOREIGN KEY (current_space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT;

REVOKE DELETE ON TABLE public.spaces FROM authenticated, anon;

COMMENT ON CONSTRAINT space_presence_log_space_id_fkey ON public.space_presence_log
    IS 'Presence audit history intentionally restricts space deletion; the server deletion route maps FK violations to 409 SPACE_IN_USE.';
COMMENT ON CONSTRAINT user_presence_sessions_space_id_fkey ON public.user_presence_sessions
    IS 'Active or retained presence sessions intentionally restrict space deletion; the server deletion route maps FK violations to 409 SPACE_IN_USE.';
COMMENT ON CONSTRAINT users_current_space_id_fkey ON public.users
    IS 'Current user placement intentionally restricts space deletion; the server deletion route maps FK violations to 409 SPACE_IN_USE.';

DROP FUNCTION IF EXISTS public.remove_user_from_all_spaces(uuid);

-- Logout confirmation path (handoff L1174): after local-scope sign-out the route
-- confirms the fence only when the exact auth.sessions absence check succeeds.
-- Same absence bridge + fence-column privileges the nightly purge already uses;
-- an unconfirmed fence stays indefinitely (purge confirms it later).
GRANT EXECUTE ON FUNCTION private.presence_auth_session_absent(uuid, uuid) TO presence_maintenance_owner;

CREATE OR REPLACE FUNCTION public.confirm_presence_auth_session_revoked(
    p_user_id uuid,
    p_auth_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_fence public.revoked_presence_auth_sessions%ROWTYPE;
    v_now timestamp with time zone;
BEGIN
    IF p_user_id IS NULL OR p_auth_session_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT f.*
    INTO v_fence
    FROM public.revoked_presence_auth_sessions AS f
    WHERE f.auth_session_id = p_auth_session_id
      AND f.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_fence.auth_session_absence_confirmed_at IS NOT NULL THEN
        RETURN true;
    END IF;

    IF NOT private.presence_auth_session_absent(p_auth_session_id, p_user_id) THEN
        RETURN false;
    END IF;

    v_now := pg_catalog.clock_timestamp();

    UPDATE public.revoked_presence_auth_sessions AS f
    SET auth_session_absence_confirmed_at = v_now,
        purge_after = v_now + INTERVAL '1800 seconds' + INTERVAL '7 days'
    WHERE f.auth_session_id = p_auth_session_id
      AND f.user_id = p_user_id;

    RETURN true;
END;
$$;

-- Ownership transfer into schema public needs transient CREATE there (the
-- earlier transient grant in this file covers schema private only).
GRANT CREATE ON SCHEMA public TO presence_maintenance_owner;
ALTER FUNCTION public.confirm_presence_auth_session_revoked(uuid, uuid) OWNER TO presence_maintenance_owner;
REVOKE CREATE ON SCHEMA public FROM presence_maintenance_owner;
REVOKE ALL ON FUNCTION public.confirm_presence_auth_session_revoked(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_presence_auth_session_revoked(uuid, uuid) TO service_role;

REVOKE CREATE ON SCHEMA private FROM presence_maintenance_owner;
REVOKE presence_maintenance_owner FROM postgres;
