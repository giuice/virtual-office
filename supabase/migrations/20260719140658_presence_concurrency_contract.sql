-- Migration: presence_concurrency_contract
-- Purpose: Close normative Presence concurrency cases 52 and 59 before the immutable cutover audit begins.
-- Date (UTC): 2026-07-19

begin;

-- Hosted/local postgres is intentionally not superuser. Membership and schema
-- CREATE are temporary and restored before the immutable fingerprint is taken.
grant presence_maintenance_owner to postgres;
grant create on schema private to presence_maintenance_owner;

-- The atomic writer's terminal gate. The definer owns only the singleton
-- runtime-control row contract; callers receive the locked mode, not table
-- access. Every matching row is locked so missing or duplicated state fails
-- closed even if catalog constraints have drifted.
create or replace function private.acquire_presence_atomic_write_gate()
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
    v_mode text;
    v_locked_mode text;
    v_count integer := 0;
begin
    for v_locked_mode in
        select control.mode
        from private.presence_runtime_control as control
        where control.singleton_id
        order by control.singleton_id
        for share
    loop
        v_count := v_count + 1;
        v_mode := v_locked_mode;
    end loop;

    if v_count = 0 then
        raise exception 'PRESENCE_RUNTIME_CONTROL_MISSING'
            using errcode = 'P0001';
    end if;

    if v_count <> 1
       or v_mode not in ('legacy', 'maintenance', 'atomic') then
        raise exception 'PRESENCE_RUNTIME_CONTROL_INVALID'
            using errcode = 'P0001';
    end if;

    return v_mode;
end;
$$;

alter function private.acquire_presence_atomic_write_gate()
    owner to presence_maintenance_owner;
revoke all on function private.acquire_presence_atomic_write_gate()
    from public, anon, authenticated, service_role, presence_maintenance_owner, postgres;
grant execute on function private.acquire_presence_atomic_write_gate()
    to service_role;

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

    -- This unlocked read is only a fast rejection. The authoritative shared
    -- gate is acquired after every domain lock, immediately before time and
    -- mutation. Stored replays above never touch either gate.
    v_mode := private.presence_runtime_mode();

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

        -- Company is the only tenant-wide authority row used by this
        -- transition. It follows the UUID-sorted user locks and precedes spaces.
        IF v_user.company_id IS NOT NULL THEN
            PERFORM company_row.id
            FROM public.companies AS company_row
            WHERE company_row.id = v_user.company_id
            FOR NO KEY UPDATE;
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

        -- Terminal runtime-control lock: domain rows are already held in the
        -- canonical order, and this shared lock persists until transaction end.
        -- A maintenance transition that committed while this statement waited
        -- wins; the transient null claim is removed and no result is cached.
        v_mode := private.acquire_presence_atomic_write_gate();
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

alter function public.transition_user_location(
    uuid, uuid, uuid, uuid, uuid, text, text, integer
) owner to postgres;
revoke all on function public.transition_user_location(
    uuid, uuid, uuid, uuid, uuid, text, text, integer
) from public, anon, authenticated, service_role, presence_maintenance_owner, postgres;
grant execute on function public.transition_user_location(
    uuid, uuid, uuid, uuid, uuid, text, text, integer
) to service_role;

create or replace function public.create_knock_request(
    p_requester_id uuid,
    p_auth_session_id uuid,
    p_session_id uuid,
    p_space_id uuid,
    p_request_id text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $$
declare
    v_prelim_requester public.users%rowtype;
    v_prelim_space public.spaces%rowtype;
    v_prelim_existing public.knock_requests%rowtype;
    v_prelim_responder public.users%rowtype;
    v_requester public.users%rowtype;
    v_space public.spaces%rowtype;
    v_session public.user_presence_sessions%rowtype;
    v_existing public.knock_requests%rowtype;
    v_responder public.users%rowtype;
    v_same_id public.knock_requests%rowtype;
    v_prelim_requester_fingerprint jsonb;
    v_prelim_space_fingerprint jsonb;
    v_prelim_responder_fingerprint jsonb;
    v_requester_fingerprint jsonb;
    v_space_fingerprint jsonb;
    v_responder_fingerprint jsonb;
    v_prelim_recipient_ids uuid[] := array[]::uuid[];
    v_recipient_ids uuid[] := array[]::uuid[];
    v_user_lock_ids uuid[] := array[]::uuid[];
    v_prelim_live_count integer := 0;
    v_live_count integer := 0;
    v_prelim_existing_found boolean := false;
    v_existing_found boolean := false;
    v_prelim_responder_found boolean := false;
    v_recipient_count integer := 0;
    v_recent_count integer := 0;
    v_retry_after integer;
    v_existing_effective boolean := false;
    v_op timestamptz;
begin
    if p_requester_id is null
       or p_auth_session_id is null
       or p_session_id is null
       or p_space_id is null
       or p_request_id is null
       or p_request_id = '' then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
    end if;

    -- Unlocked preliminary snapshot. It is authority only for constructing the
    -- complete lock set; every relied-on value is fingerprinted and re-read.
    select u.* into v_prelim_requester
    from public.users as u
    where u.id = p_requester_id;

    if not found or v_prelim_requester.company_id is null then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
    end if;

    v_prelim_requester_fingerprint := pg_catalog.jsonb_build_object(
        'id', v_prelim_requester.id,
        'companyId', v_prelim_requester.company_id,
        'role', v_prelim_requester.role::text,
        'status', v_prelim_requester.status::text,
        'currentSpaceId', v_prelim_requester.current_space_id,
        'locationVersion', v_prelim_requester.location_version,
        'accessRevision', v_prelim_requester.presence_access_revision,
        'displayName', v_prelim_requester.display_name,
        'avatarUrl', v_prelim_requester.avatar_url
    );

    select sp.* into v_prelim_space
    from public.spaces as sp
    where sp.id = p_space_id;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'SPACE_NOT_FOUND');
    end if;

    v_prelim_space_fingerprint := pg_catalog.jsonb_build_object(
        'id', v_prelim_space.id,
        'companyId', v_prelim_space.company_id,
        'status', v_prelim_space.status::text,
        'accessRevision', v_prelim_space.presence_access_revision
    );

    select pg_catalog.count(*)::integer
    into v_prelim_live_count
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.status in ('pending', 'approved')
      and kr.consumed_at is null;

    if v_prelim_live_count > 1 then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'RETRY_LOCK_SET');
    end if;

    select kr.* into v_prelim_existing
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.status in ('pending', 'approved')
      and kr.consumed_at is null
    order by kr.created_at desc, kr.id
    limit 1;

    v_prelim_existing_found := found;

    if v_prelim_existing_found and v_prelim_existing.responder_id is not null then
        select u.* into v_prelim_responder
        from public.users as u
        where u.id = v_prelim_existing.responder_id;

        v_prelim_responder_found := found;
        if not v_prelim_responder_found then
            -- Never authorize or expire an approval whose stored responder
            -- cannot be included in the canonical user lock set.
            return pg_catalog.jsonb_build_object(
                'ok', false,
                'code', 'RETRY_LOCK_SET'
            );
        end if;

        v_prelim_responder_fingerprint := pg_catalog.jsonb_build_object(
            'id', v_prelim_responder.id,
            'companyId', v_prelim_responder.company_id,
            'role', v_prelim_responder.role::text,
            'status', v_prelim_responder.status::text,
            'currentSpaceId', v_prelim_responder.current_space_id,
            'locationVersion', v_prelim_responder.location_version,
            'accessRevision', v_prelim_responder.presence_access_revision
        );
    end if;

    select coalesce(
        pg_catalog.array_agg(candidate.id order by candidate.id),
        array[]::uuid[]
    )
    into v_prelim_recipient_ids
    from (
        select distinct occupant.id
        from public.users as occupant
        where occupant.company_id = v_prelim_space.company_id
          and occupant.current_space_id = p_space_id
          and occupant.id <> p_requester_id
          and exists (
              select 1
              from public.user_presence_sessions as os
              where os.user_id = occupant.id
                and os.company_id = occupant.company_id
                and os.retired_at is null
          )
    ) as candidate;

    select coalesce(
        pg_catalog.array_agg(candidate.id order by candidate.id),
        array[]::uuid[]
    )
    into v_user_lock_ids
    from (
        select distinct lock_id as id
        from pg_catalog.unnest(
            array[p_requester_id, v_prelim_existing.responder_id]::uuid[]
            || v_prelim_recipient_ids
        ) as lock_id
        where lock_id is not null
    ) as candidate;

    perform u.id
    from public.users as u
    where u.id = any(v_user_lock_ids)
    order by u.id
    for no key update;

    -- Canonical order: all users, tenant authority, space, exact live Knock,
    -- then every relevant presence session in UUID order.
    perform company_row.id
    from public.companies as company_row
    where company_row.id = v_prelim_requester.company_id
    for no key update;

    perform sp.id
    from public.spaces as sp
    where sp.id = p_space_id
    for no key update;

    if v_prelim_existing_found then
        perform kr.id
        from public.knock_requests as kr
        where kr.id = v_prelim_existing.id
        for update;
    else
        perform kr.id
        from public.knock_requests as kr
        where kr.requester_id = p_requester_id
          and kr.space_id = p_space_id
          and kr.status in ('pending', 'approved')
          and kr.consumed_at is null
        order by kr.created_at desc, kr.id
        limit 1
        for update;
    end if;

    perform ps.id
    from public.user_presence_sessions as ps
    where ps.id = p_session_id
       or ps.user_id = p_requester_id
       or ps.user_id = any(v_prelim_recipient_ids)
    order by ps.id
    for update;

    -- Re-read under the complete lock set. Any changed presence/absence,
    -- fingerprint, or recipient candidate set is transient and never cached.
    select u.* into v_requester
    from public.users as u
    where u.id = p_requester_id;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'RETRY_LOCK_SET');
    end if;

    v_requester_fingerprint := pg_catalog.jsonb_build_object(
        'id', v_requester.id,
        'companyId', v_requester.company_id,
        'role', v_requester.role::text,
        'status', v_requester.status::text,
        'currentSpaceId', v_requester.current_space_id,
        'locationVersion', v_requester.location_version,
        'accessRevision', v_requester.presence_access_revision,
        'displayName', v_requester.display_name,
        'avatarUrl', v_requester.avatar_url
    );

    select sp.* into v_space
    from public.spaces as sp
    where sp.id = p_space_id;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'RETRY_LOCK_SET');
    end if;

    v_space_fingerprint := pg_catalog.jsonb_build_object(
        'id', v_space.id,
        'companyId', v_space.company_id,
        'status', v_space.status::text,
        'accessRevision', v_space.presence_access_revision
    );

    select pg_catalog.count(*)::integer
    into v_live_count
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.status in ('pending', 'approved')
      and kr.consumed_at is null;

    select kr.* into v_existing
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.status in ('pending', 'approved')
      and kr.consumed_at is null
    order by kr.created_at desc, kr.id
    limit 1;

    v_existing_found := found;

    if v_prelim_existing_found
       and v_prelim_existing.responder_id is not null then
        select u.* into v_responder
        from public.users as u
        where u.id = v_prelim_existing.responder_id;

        if found then
            v_responder_fingerprint := pg_catalog.jsonb_build_object(
                'id', v_responder.id,
                'companyId', v_responder.company_id,
                'role', v_responder.role::text,
                'status', v_responder.status::text,
                'currentSpaceId', v_responder.current_space_id,
                'locationVersion', v_responder.location_version,
                'accessRevision', v_responder.presence_access_revision
            );
        end if;
    end if;

    select coalesce(
        pg_catalog.array_agg(candidate.id order by candidate.id),
        array[]::uuid[]
    )
    into v_recipient_ids
    from (
        select distinct occupant.id
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
          )
    ) as candidate;

    if v_requester_fingerprint is distinct from v_prelim_requester_fingerprint
       or v_space_fingerprint is distinct from v_prelim_space_fingerprint
       or v_live_count <> v_prelim_live_count
       or v_existing_found is distinct from v_prelim_existing_found
       or (
           v_existing_found
           and pg_catalog.to_jsonb(v_existing)
               is distinct from pg_catalog.to_jsonb(v_prelim_existing)
       )
       or v_recipient_ids is distinct from v_prelim_recipient_ids
       or (
           v_prelim_existing_found
           and v_prelim_existing.responder_id is not null
           and (
               v_prelim_responder_found is distinct from (v_responder.id is not null)
               or v_responder_fingerprint is distinct from v_prelim_responder_fingerprint
           )
       ) then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'RETRY_LOCK_SET');
    end if;

    -- Stable lock set. Capture time once, then revalidate every authority fence.
    v_op := pg_catalog.clock_timestamp();

    select s.* into v_session
    from public.user_presence_sessions as s
    where s.id = p_session_id;

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
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
    end if;

    if v_space.company_id <> v_requester.company_id then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'CROSS_COMPANY_SPACE');
    end if;

    if v_space.status::text not in ('active', 'available') then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'SPACE_UNAVAILABLE');
    end if;

    if v_requester.current_space_id = p_space_id then
        return pg_catalog.jsonb_build_object('ok', false, 'code', 'KNOCK_NOT_REQUIRED');
    end if;

    select pg_catalog.count(distinct occupant.id)::integer
    into v_recipient_count
    from public.users as occupant
    where occupant.id = any(v_recipient_ids)
      and occupant.company_id = v_space.company_id
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
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'NO_KNOCK_RECIPIENTS',
            'recipientCount', 0
        );
    end if;

    select kr.* into v_same_id
    from public.knock_requests as kr
    where kr.id = p_request_id;

    if found
       and (
           v_same_id.requester_id <> p_requester_id
           or v_same_id.space_id <> p_space_id
       ) then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'IDEMPOTENCY_CONFLICT'
        );
    end if;

    if v_existing_found then
        v_existing_effective := coalesce(
            v_existing.requester_id = v_requester.id
            and v_existing.company_id = v_requester.company_id
            and v_existing.space_id = v_space.id
            and v_existing.requester_location_version = v_requester.location_version
            and v_existing.requester_access_revision = v_requester.presence_access_revision
            and v_existing.space_access_revision = v_space.presence_access_revision
            and (
                (
                    v_existing.status = 'pending'
                    and v_existing.responder_id is null
                    and v_existing.responder_access_revision is null
                )
                or (
                    v_existing.status = 'approved'
                    and v_existing.responder_id is not null
                    and v_responder.id = v_existing.responder_id
                    and v_responder.company_id = v_requester.company_id
                    and v_existing.responder_access_revision =
                        v_responder.presence_access_revision
                )
            ),
            false
        );

        if v_existing.expires_at <= v_op or not v_existing_effective then
            -- An approved row reaches this branch only after its stored
            -- responder was part of the preliminary user lock set and re-read.
            update public.knock_requests as kr
            set status = 'expired',
                updated_at = v_op
            where kr.id = v_existing.id
              and kr.status in ('pending', 'approved')
              and kr.consumed_at is null;

            if v_existing.id = p_request_id then
                return pg_catalog.jsonb_build_object(
                    'ok', false,
                    'code', 'KNOCK_SUPERSEDED'
                );
            end if;

            v_existing_found := false;
        elsif v_existing.id = p_request_id then
            return pg_catalog.jsonb_build_object(
                'ok', true,
                'code', 'KNOCK_CREATED',
                'requestId', v_existing.id,
                'status', v_existing.status,
                'expiresAt', pg_catalog.to_jsonb(v_existing.expires_at),
                'recipientCount', v_recipient_count,
                'requesterLocationVersion', v_existing.requester_location_version,
                'alreadyApplied', true
            );
        end if;
    end if;

    if v_same_id.id is not null then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_SUPERSEDED'
        );
    end if;

    -- For a different request ID, rate limits precede the live-row result.
    -- This makes pair/global concurrency deterministic after bounded retries.
    select pg_catalog.count(*)::integer
    into v_recent_count
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.space_id = p_space_id
      and kr.created_at > v_op - interval '10 seconds';

    if v_recent_count > 0 then
        select greatest(
            1,
            ceil(extract(epoch from (
                max(kr.created_at) + interval '10 seconds' - v_op
            )))::integer
        )
        into v_retry_after
        from public.knock_requests as kr
        where kr.requester_id = p_requester_id
          and kr.space_id = p_space_id
          and kr.created_at > v_op - interval '10 seconds';

        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_RATE_LIMITED',
            'retryAfterSeconds', coalesce(v_retry_after, 1)
        );
    end if;

    select pg_catalog.count(*)::integer
    into v_recent_count
    from public.knock_requests as kr
    where kr.requester_id = p_requester_id
      and kr.company_id = v_requester.company_id
      and kr.created_at > v_op - interval '60 seconds';

    if v_recent_count >= 5 then
        select greatest(
            1,
            ceil(extract(epoch from (
                min(kr.created_at) + interval '60 seconds' - v_op
            )))::integer
        )
        into v_retry_after
        from public.knock_requests as kr
        where kr.requester_id = p_requester_id
          and kr.company_id = v_requester.company_id
          and kr.created_at > v_op - interval '60 seconds';

        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_RATE_LIMITED',
            'retryAfterSeconds', coalesce(v_retry_after, 1)
        );
    end if;

    if v_existing_found then
        return pg_catalog.jsonb_build_object(
            'ok', false,
            'code', 'KNOCK_ALREADY_PENDING',
            'requestId', v_existing.id
        );
    end if;

    -- Version/session/insert mutations share an exception subtransaction.
    -- A defensive partial-unique or request-ID conflict rolls all three back.
    begin
        update public.users as u
        set location_version = u.location_version + 1
        where u.id = v_requester.id
          and u.location_version = v_requester.location_version
        returning u.* into v_requester;

        if not found then
            return pg_catalog.jsonb_build_object(
                'ok', false,
                'code', 'KNOCK_SUPERSEDED'
            );
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
    exception
        when unique_violation then
            return pg_catalog.jsonb_build_object(
                'ok', false,
                'code', 'RETRY_LOCK_SET'
            );
    end;

    return pg_catalog.jsonb_build_object(
        'ok', true,
        'code', 'KNOCK_CREATED',
        'requestId', v_existing.id,
        'status', v_existing.status,
        'expiresAt', pg_catalog.to_jsonb(v_existing.expires_at),
        'recipientCount', v_recipient_count,
        'requesterLocationVersion', v_existing.requester_location_version,
        'alreadyApplied', false
    );
end;
$$;

alter function public.create_knock_request(uuid, uuid, uuid, uuid, text)
    owner to postgres;
revoke all on function public.create_knock_request(uuid, uuid, uuid, uuid, text)
    from public, anon, authenticated, service_role, presence_maintenance_owner, postgres;
grant execute on function public.create_knock_request(uuid, uuid, uuid, uuid, text)
    to service_role;

-- The immutable audit includes both corrected writers and the new terminal gate.
create or replace function private.compute_presence_cutover_audit_fingerprint()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
with audit_tables(table_name) as (
    values
        ('presence_legacy_user_write_audit'::text),
        ('presence_legacy_route_call_audit'::text),
        ('presence_legacy_cutover_audit_meta'::text),
        ('presence_legacy_cutover_audit_coverage'::text),
        ('presence_runtime_control'::text)
),
table_rows as (
    select
        'table'::text as object_kind,
        n.nspname::text as schema_name,
        c.relname::text as identity,
        pg_catalog.jsonb_build_object(
            'columns', (
                select pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                        'number', a.attnum,
                        'name', a.attname,
                        'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
                        'not_null', a.attnotnull,
                        'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
                    ) order by a.attnum
                )
                from pg_catalog.pg_attribute as a
                left join pg_catalog.pg_attrdef as d
                  on d.adrelid = a.attrelid and d.adnum = a.attnum
                where a.attrelid = c.oid
                  and a.attnum > 0
                  and not a.attisdropped
            ),
            'constraints', (
                select pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                        'name', con.conname,
                        'type', con.contype,
                        'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
                    ) order by con.conname
                )
                from pg_catalog.pg_constraint as con
                where con.conrelid = c.oid
            )
        )::text as definition,
        pg_catalog.pg_get_userbyid(c.relowner)::text as owner_name,
        null::text as security_definer,
        null::text as config,
        (
            select coalesce(
                pg_catalog.string_agg(acl_item::text, E'\n' order by acl_item::text),
                ''
            )
            from pg_catalog.unnest(
                coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
            ) as acl_item
        )::text as acl,
        pg_catalog.format('rls=%s;force_rls=%s', c.relrowsecurity, c.relforcerowsecurity)::text as state
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and (
        (
          n.nspname = 'private'
          and c.relname in (
            'presence_legacy_user_write_audit',
            'presence_legacy_route_call_audit',
            'presence_legacy_cutover_audit_meta',
            'presence_legacy_cutover_audit_coverage',
            'presence_runtime_control'
          )
        )
        or (n.nspname = 'public' and c.relname = 'platform_admins')
      )
),
audit_function_names(schema_name, function_name) as (
    values
        ('private'::text, 'enforce_presence_legacy_cutover_meta_immutability'::text),
        ('private'::text, 'audit_legacy_user_write'::text),
        ('private'::text, 'compute_presence_cutover_audit_fingerprint'::text),
        ('private'::text, 'is_presence_cutover_audit_catalog_healthy'::text),
        ('private'::text, 'start_presence_legacy_cutover_audit'::text),
        ('private'::text, 'record_presence_legacy_cutover_audit_coverage'::text),
        ('private'::text, 'assert_presence_legacy_cutover_gate'::text),
        ('private'::text, 'assert_presence_legacy_adapter_removal_gate'::text),
        ('private'::text, 'backfill_presence_availability_status'::text),
        ('private'::text, 'read_presence_cutover_audit_cron_job'::text),
        ('private'::text, 'reject_direct_service_role_membership_write'::text),
        ('private'::text, 'acquire_presence_atomic_write_gate'::text),
        ('private'::text, 'presence_movement_write_gate'::text),
        ('private'::text, 'guard_user_presence_revisions'::text),
        ('private'::text, 'guard_space_presence_revision'::text),
        ('private'::text, 'capture_presence_transition_previous_version'::text),
        ('private'::text, 'fill_presence_transition_previous_version'::text),
        ('public'::text, 'transition_user_location'::text),
        ('public'::text, 'transition_user_location_observed'::text),
        ('public'::text, 'create_knock_request'::text),
        ('public'::text, 'register_presence_session_observed'::text),
        ('public'::text, 'heartbeat_presence_session_observed'::text),
        ('public'::text, 'disconnect_presence_session_observed'::text),
        ('public'::text, 'create_knock_request_observed'::text),
        ('public'::text, 'respond_to_knock_observed'::text),
        ('public'::text, 'get_knock_request_status_observed'::text),
        ('public'::text, 'repair_presence_logs_for_cutover'::text),
        ('public'::text, 'reconcile_stale_presence_placements'::text),
        ('public'::text, 'record_legacy_presence_route_call'::text),
        ('public'::text, 'disable_legacy_presence_adapter'::text),
        ('public'::text, 'register_presence_session'::text),
        ('public'::text, 'remove_company_member_and_presence'::text),
        ('public'::text, 'update_company_member_role'::text),
        ('public'::text, 'accept_company_invitation_membership'::text),
        ('public'::text, 'create_company_for_user'::text),
        ('public'::text, 'create_company_invitation'::text),
        ('public'::text, 'create_company_with_initial_admin_invitation'::text)
),
function_rows as (
    select
        'function'::text as object_kind,
        n.nspname::text as schema_name,
        (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text as identity,
        pg_catalog.pg_get_functiondef(p.oid)::text as definition,
        pg_catalog.pg_get_userbyid(p.proowner)::text as owner_name,
        p.prosecdef::text as security_definer,
        (
            select coalesce(
                pg_catalog.string_agg(setting, E'\n' order by setting),
                ''
            )
            from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as setting
        )::text as config,
        (
            select coalesce(
                pg_catalog.string_agg(acl_item::text, E'\n' order by acl_item::text),
                ''
            )
            from pg_catalog.unnest(
                coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
            ) as acl_item
        )::text as acl,
        pg_catalog.format('volatile=%s;parallel=%s;strict=%s', p.provolatile, p.proparallel, p.proisstrict)::text as state
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    join audit_function_names as wanted
      on wanted.schema_name = n.nspname and wanted.function_name = p.proname
),
policy_rows as (
    select
        'policy'::text as object_kind,
        n.nspname::text as schema_name,
        (c.relname || '.' || pol.polname)::text as identity,
        pg_catalog.format(
            'command=%s;permissive=%s;roles=%s;using=%s;check=%s',
            pol.polcmd,
            pol.polpermissive,
            (
                select coalesce(
                    pg_catalog.string_agg(coalesce(r.rolname, 'PUBLIC'), ',' order by coalesce(r.rolname, 'PUBLIC')),
                    ''
                )
                from pg_catalog.unnest(pol.polroles) as role_oid
                left join pg_catalog.pg_roles as r on r.oid = role_oid
            ),
            pg_catalog.pg_get_expr(pol.polqual, pol.polrelid),
            pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)
        )::text as definition,
        null::text as owner_name,
        null::text as security_definer,
        null::text as config,
        null::text as acl,
        null::text as state
    from pg_catalog.pg_policy as pol
    join pg_catalog.pg_class as c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where (
        n.nspname = 'private'
        and c.relname in (
            'presence_legacy_user_write_audit',
            'presence_legacy_route_call_audit',
            'presence_legacy_cutover_audit_meta',
            'presence_legacy_cutover_audit_coverage',
            'presence_runtime_control'
        )
    ) or (
        n.nspname = 'public'
        and c.relname = 'platform_admins'
    )
),
trigger_rows as (
    select
        'trigger'::text as object_kind,
        n.nspname::text as schema_name,
        (c.relname || '.' || t.tgname)::text as identity,
        pg_catalog.pg_get_triggerdef(t.oid, true)::text as definition,
        pg_catalog.pg_get_userbyid(p.proowner)::text as owner_name,
        p.prosecdef::text as security_definer,
        (
            select coalesce(
                pg_catalog.string_agg(setting, E'\n' order by setting),
                ''
            )
            from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as setting
        )::text as config,
        null::text as acl,
        t.tgenabled::text as state
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    join pg_catalog.pg_proc as p on p.oid = t.tgfoid
    where not t.tgisinternal
      and (
          (n.nspname = 'private' and c.relname in (
              'presence_legacy_user_write_audit',
              'presence_legacy_route_call_audit',
              'presence_legacy_cutover_audit_meta',
              'presence_legacy_cutover_audit_coverage'
          ))
          or (n.nspname = 'public' and t.tgname like 'presence_audit_users_%')
          or (n.nspname = 'public' and t.tgname in (
              'users_capture_presence_transition_previous_version',
              'transition_result_fill_previous_location_version',
              'presence_gate_users_current_space',
              'presence_gate_space_presence_log',
              'presence_gate_knock_consume',
              'users_guard_presence_revisions',
              'spaces_guard_presence_revision'
          ))
          or (n.nspname = 'public' and t.tgname in (
              'presence_block_service_role_invitation_insert',
              'presence_block_service_role_membership_update'
          ))
      )
),
cron_rows as (
    select
        'cron'::text as object_kind,
        'cron'::text as schema_name,
        j.jobname::text as identity,
        pg_catalog.format('schedule=%s;command=%s;database=%s', j.schedule, j.command, j.database)::text as definition,
        j.username::text as owner_name,
        null::text as security_definer,
        null::text as config,
        null::text as acl,
        ('active=' || j.active::text)::text as state
    from private.read_presence_cutover_audit_cron_job() as j
),
role_rows as (
    select
        'role'::text as object_kind,
        'pg_catalog'::text as schema_name,
        r.rolname::text as identity,
        pg_catalog.format(
            'login=%s;inherit=%s;super=%s;createrole=%s;createdb=%s;replication=%s;bypassrls=%s',
            r.rolcanlogin,
            r.rolinherit,
            r.rolsuper,
            r.rolcreaterole,
            r.rolcreatedb,
            r.rolreplication,
            r.rolbypassrls
        )::text as definition,
        null::text as owner_name,
        null::text as security_definer,
        null::text as config,
        (
            select coalesce(
                pg_catalog.string_agg(membership_description, E'\n' order by membership_description),
                ''
            )
            from (
                select 'member_of:' || parent.rolname as membership_description
                from pg_catalog.pg_auth_members as membership
                join pg_catalog.pg_roles as parent on parent.oid = membership.roleid
                where membership.member = r.oid
                union all
                select 'member:' || child.rolname as membership_description
                from pg_catalog.pg_auth_members as membership
                join pg_catalog.pg_roles as child on child.oid = membership.member
                where membership.roleid = r.oid
            ) as memberships
        )::text as acl,
        null::text as state
    from pg_catalog.pg_roles as r
    where r.rolname = 'presence_maintenance_owner'
),
catalog_rows as (
    select * from table_rows
    union all select * from function_rows
    union all select * from policy_rows
    union all select * from trigger_rows
    union all select * from cron_rows
    union all select * from role_rows
),
encoded_rows as (
    select
        object_kind,
        schema_name,
        identity,
        pg_catalog.concat(
            pg_catalog.octet_length(object_kind), ':', object_kind,
            pg_catalog.octet_length(schema_name), ':', schema_name,
            pg_catalog.octet_length(identity), ':', identity,
            case when definition is null then '-1:' else pg_catalog.octet_length(definition)::text || ':' || definition end,
            case when owner_name is null then '-1:' else pg_catalog.octet_length(owner_name)::text || ':' || owner_name end,
            case when security_definer is null then '-1:' else pg_catalog.octet_length(security_definer)::text || ':' || security_definer end,
            case when config is null then '-1:' else pg_catalog.octet_length(config)::text || ':' || config end,
            case when acl is null then '-1:' else pg_catalog.octet_length(acl)::text || ':' || acl end,
            case when state is null then '-1:' else pg_catalog.octet_length(state)::text || ':' || state end
        ) as encoded
    from catalog_rows
)
select pg_catalog.lower(
    pg_catalog.md5(
        coalesce(
            pg_catalog.string_agg(encoded, '' order by object_kind, schema_name, identity),
            ''
        )
    )
)
from encoded_rows;
$$;

alter function private.compute_presence_cutover_audit_fingerprint()
    owner to presence_maintenance_owner;
revoke all on function private.compute_presence_cutover_audit_fingerprint()
    from public, anon, authenticated, service_role;
grant execute on function private.compute_presence_cutover_audit_fingerprint()
    to presence_maintenance_owner, postgres;

create or replace function private.is_presence_cutover_audit_catalog_healthy(
    p_expected_fingerprint text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
    v_tables integer;
    v_functions integer;
    v_observability_functions integer;
    v_revision_guard_functions integer;
    v_policies integer;
    v_triggers integer;
    v_cron integer;
    v_current_fingerprint text;
begin
    select count(*)::integer
    into v_tables
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in (
          'presence_legacy_user_write_audit',
          'presence_legacy_route_call_audit',
          'presence_legacy_cutover_audit_meta',
          'presence_legacy_cutover_audit_coverage',
          'presence_runtime_control'
      )
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relforcerowsecurity
      and pg_catalog.pg_get_userbyid(c.relowner) = 'presence_maintenance_owner';

    if v_tables <> 5 then
        return false;
    end if;

    if (
        select pg_catalog.count(*)
        from pg_catalog.pg_constraint as constraint_row
        where constraint_row.conrelid = 'private.presence_runtime_control'::pg_catalog.regclass
          and constraint_row.conname in (
              'presence_runtime_control_pkey',
              'presence_runtime_control_mode_check',
              'presence_runtime_control_singleton',
              'presence_runtime_control_adapter_pair'
          )
    ) <> 4
       or not pg_catalog.has_table_privilege(
           'presence_maintenance_owner',
           'private.presence_runtime_control',
           'SELECT, UPDATE'
       )
       or (
           select pg_catalog.count(*)
           from pg_catalog.pg_class as runtime_relation
           cross join lateral pg_catalog.aclexplode(
               coalesce(
                   runtime_relation.relacl,
                   pg_catalog.acldefault('r', runtime_relation.relowner)
               )
           ) as privilege
           where runtime_relation.oid =
               'private.presence_runtime_control'::pg_catalog.regclass
             and privilege.grantee =
               'presence_maintenance_owner'::pg_catalog.regrole::oid
             and privilege.privilege_type in (
                 'SELECT', 'INSERT', 'UPDATE', 'DELETE',
                 'TRUNCATE', 'REFERENCES', 'TRIGGER'
             )
       ) <> 7
       or exists (
           select 1
           from pg_catalog.pg_class as runtime_relation
           cross join lateral pg_catalog.aclexplode(
               coalesce(
                   runtime_relation.relacl,
                   pg_catalog.acldefault('r', runtime_relation.relowner)
               )
           ) as privilege
           where runtime_relation.oid =
               'private.presence_runtime_control'::pg_catalog.regclass
             and privilege.grantee <>
               'presence_maintenance_owner'::pg_catalog.regrole::oid
       )
       or pg_catalog.has_table_privilege(
           'anon', 'private.presence_runtime_control', 'SELECT, INSERT, UPDATE, DELETE'
       )
       or pg_catalog.has_table_privilege(
           'authenticated', 'private.presence_runtime_control', 'SELECT, INSERT, UPDATE, DELETE'
       )
       or pg_catalog.has_table_privilege(
           'service_role', 'private.presence_runtime_control', 'SELECT, INSERT, UPDATE, DELETE'
       ) then
        return false;
    end if;

    if exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as role_row
          on role_row.oid in (membership.roleid, membership.member)
        where role_row.rolname = 'presence_maintenance_owner'
    ) then
        return false;
    end if;

    if pg_catalog.has_schema_privilege(
           'presence_maintenance_owner', 'public', 'CREATE'
       )
       or pg_catalog.has_schema_privilege(
           'presence_maintenance_owner', 'private', 'CREATE'
       ) then
        return false;
    end if;

    select count(*)::integer
    into v_functions
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
        ('private', 'enforce_presence_legacy_cutover_meta_immutability'),
        ('private', 'audit_legacy_user_write'),
        ('private', 'compute_presence_cutover_audit_fingerprint'),
        ('private', 'is_presence_cutover_audit_catalog_healthy'),
        ('private', 'start_presence_legacy_cutover_audit'),
        ('private', 'record_presence_legacy_cutover_audit_coverage'),
        ('private', 'assert_presence_legacy_cutover_gate'),
        ('private', 'assert_presence_legacy_adapter_removal_gate'),
        ('private', 'backfill_presence_availability_status'),
        ('private', 'acquire_presence_atomic_write_gate'),
        ('private', 'presence_movement_write_gate'),
        ('public', 'repair_presence_logs_for_cutover'),
        ('public', 'reconcile_stale_presence_placements'),
        ('public', 'record_legacy_presence_route_call'),
        ('public', 'disable_legacy_presence_adapter'),
        ('public', 'register_presence_session'),
        ('public', 'remove_company_member_and_presence'),
        ('public', 'update_company_member_role'),
        ('public', 'accept_company_invitation_membership'),
        ('public', 'create_company_for_user'),
        ('public', 'create_company_invitation'),
        ('public', 'create_company_with_initial_admin_invitation')
    )
      and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
      and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog']::text[];

    if v_functions <> 22 then
        return false;
    end if;

    select count(*)::integer
    into v_revision_guard_functions
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
          'guard_user_presence_revisions',
          'guard_space_presence_revision'
      )
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and not p.prosecdef
      and p.provolatile = 'v'
      and p.proconfig = array['search_path=pg_catalog, public']::text[];

    if v_revision_guard_functions <> 2 then
        return false;
    end if;

    select count(*)::integer
    into v_observability_functions
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
        ('private', 'capture_presence_transition_previous_version'),
        ('private', 'fill_presence_transition_previous_version'),
        ('public', 'transition_user_location_observed'),
        ('public', 'register_presence_session_observed'),
        ('public', 'heartbeat_presence_session_observed'),
        ('public', 'disconnect_presence_session_observed'),
        ('public', 'create_knock_request_observed'),
        ('public', 'respond_to_knock_observed'),
        ('public', 'get_knock_request_status_observed')
    )
      and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
      and not p.prosecdef
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not exists (
          select 1
          from pg_catalog.aclexplode(
              coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
          ) as privilege
          where privilege.grantee = 0
            and privilege.privilege_type = 'EXECUTE'
      )
      and (
          (
              n.nspname = 'private'
              and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          )
          or (
              n.nspname = 'public'
              and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          )
      );

    if v_observability_functions <> 9 then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'platform_admins'
          and relation.relkind = 'r'
          and relation.relrowsecurity
          and not relation.relforcerowsecurity
          and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
    ) then
        return false;
    end if;

    -- The main transition intentionally remains SECURITY INVOKER under the
    -- postgres owner; service_role supplies the narrow table/function rights.
    -- Do not accidentally "harden" it into a broad definer boundary.
    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'public.transition_user_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and not p.prosecdef
          and p.provolatile = 'v'
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'public.create_knock_request(uuid,uuid,uuid,uuid,text)'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and not p.prosecdef
          and p.provolatile = 'v'
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee in (
                  'presence_maintenance_owner'::pg_catalog.regrole::oid,
                  'postgres'::pg_catalog.regrole::oid
              )
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'private.acquire_presence_atomic_write_gate()'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
          and p.prosecdef
          and p.provolatile = 'v'
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege(
              'presence_maintenance_owner', p.oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee in (
                  0,
                  'postgres'::pg_catalog.regrole::oid
              )
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'public.register_presence_session(uuid,uuid,uuid,uuid)'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege(
              'presence_maintenance_owner', p.oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 'postgres'::pg_catalog.regrole::oid
                and privilege.privilege_type = 'EXECUTE'
          )
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'private.assert_presence_legacy_cutover_gate()'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege(
              'presence_maintenance_owner', p.oid, 'EXECUTE'
          )
          and pg_catalog.has_function_privilege('postgres', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
                  'public.disable_legacy_presence_adapter(uuid)'
              )
          and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
          and pg_catalog.has_function_privilege('postgres', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
          and not exists (
              select 1
              from pg_catalog.aclexplode(
                  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
          )
    )
       or not exists (
           select 1
           from pg_catalog.pg_proc as p
           where p.oid = pg_catalog.to_regprocedure(
                     'private.assert_presence_legacy_adapter_removal_gate()'
                 )
             and pg_catalog.pg_get_userbyid(p.proowner) = 'presence_maintenance_owner'
             and p.prosecdef
             and p.proconfig = array['search_path=pg_catalog']::text[]
             and pg_catalog.has_function_privilege('postgres', p.oid, 'EXECUTE')
             and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
             and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
             and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
             and not exists (
                 select 1
                 from pg_catalog.aclexplode(
                     coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
                 ) as privilege
                 where privilege.grantee = 0
                   and privilege.privilege_type = 'EXECUTE'
             )
       ) then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc as p
        join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'read_presence_cutover_audit_cron_job'
          and pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef
          and p.proconfig = array['search_path=pg_catalog']::text[]
    ) then
        return false;
    end if;

    select count(*)::integer
    into v_policies
    from pg_catalog.pg_policy as pol
    join pg_catalog.pg_class as c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in (
          'presence_legacy_user_write_audit',
          'presence_legacy_route_call_audit',
          'presence_legacy_cutover_audit_meta',
          'presence_legacy_cutover_audit_coverage'
      )
      and pol.polname like 'pmo_presence_legacy_%'
      or (
          n.nspname = 'private'
          and c.relname = 'presence_runtime_control'
          and pol.polname = 'pmo_presence_runtime_control_all'
      );

    if v_policies <> 11 then
        return false;
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_policy as policy
        where policy.polrelid = 'private.presence_runtime_control'::pg_catalog.regclass
          and policy.polname = 'pmo_presence_runtime_control_all'
          and policy.polroles = array[
              'presence_maintenance_owner'::pg_catalog.regrole::oid
          ]
          and policy.polpermissive
          and policy.polcmd = '*'
          and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) = 'true'
          and pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) = 'true'
    ) then
        return false;
    end if;

    -- The platform-admin tenant creator locks the authorization row. Keep the
    -- isolated owner on the smallest ACL and exact pair of RLS policies needed
    -- for SELECT ... FOR UPDATE; catalog drift must invalidate the evidence.
    if (
        select pg_catalog.count(*)
        from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = 'public.platform_admins'::pg_catalog.regclass
          and attribute.attnum > 0
          and not attribute.attisdropped
          and pg_catalog.has_column_privilege(
              'presence_maintenance_owner',
              attribute.attrelid,
              attribute.attname,
              'SELECT'
          )
    ) <> 2
       or not pg_catalog.has_column_privilege(
           'presence_maintenance_owner',
           'public.platform_admins',
           'user_id',
           'UPDATE'
       )
       or (
           select pg_catalog.count(*)
           from pg_catalog.pg_attribute as attribute
           where attribute.attrelid = 'public.platform_admins'::pg_catalog.regclass
             and attribute.attnum > 0
             and not attribute.attisdropped
             and pg_catalog.has_column_privilege(
                 'presence_maintenance_owner',
                 attribute.attrelid,
                 attribute.attname,
                 'UPDATE'
             )
       ) <> 1
       or (
           select pg_catalog.count(*)
           from pg_catalog.pg_policy as policy
           where policy.polrelid = 'public.platform_admins'::pg_catalog.regclass
             and policy.polname in (
                 'presence_maintenance_owner_platform_admins_select',
                 'presence_maintenance_owner_platform_admins_update'
             )
             and policy.polroles = array[
                 'presence_maintenance_owner'::pg_catalog.regrole::oid
             ]
             and policy.polpermissive
             and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) = 'true'
             and (
                 (
                     policy.polname = 'presence_maintenance_owner_platform_admins_select'
                     and policy.polcmd = 'r'
                     and policy.polwithcheck is null
                 )
                 or (
                     policy.polname = 'presence_maintenance_owner_platform_admins_update'
                     and policy.polcmd = 'w'
                     and pg_catalog.pg_get_expr(
                         policy.polwithcheck,
                         policy.polrelid
                     ) = 'true'
                 )
             )
       ) <> 2 then
        return false;
    end if;

    select count(*)::integer
    into v_triggers
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where not t.tgisinternal
      and t.tgenabled = 'O'
      and (
          (n.nspname = 'public' and c.relname = 'users' and t.tgname in (
              'presence_audit_users_current_space_id',
              'presence_audit_users_status',
               'presence_audit_users_last_active',
               'presence_audit_users_any_authenticated_update',
               'presence_block_service_role_membership_update',
               'users_capture_presence_transition_previous_version',
               'presence_gate_users_current_space',
               'users_guard_presence_revisions'
           ))
          or (
              n.nspname = 'public'
              and c.relname = 'location_transition_requests'
              and t.tgname = 'transition_result_fill_previous_location_version'
          )
          or (
              n.nspname = 'public'
              and c.relname = 'invitations'
              and t.tgname = 'presence_block_service_role_invitation_insert'
          )
          or (
              n.nspname = 'public'
              and c.relname = 'spaces'
              and t.tgname = 'spaces_guard_presence_revision'
          )
          or (
              n.nspname = 'public'
              and c.relname = 'space_presence_log'
              and t.tgname = 'presence_gate_space_presence_log'
          )
          or (
              n.nspname = 'public'
              and c.relname = 'knock_requests'
              and t.tgname = 'presence_gate_knock_consume'
          )
          or (
              n.nspname = 'private'
              and c.relname = 'presence_legacy_cutover_audit_meta'
              and t.tgname = 'presence_audit_meta_immutable'
          )
      );

    if v_triggers <> 14 then
        return false;
    end if;

    if pg_catalog.has_table_privilege('anon', 'private.presence_legacy_user_write_audit', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_user_write_audit', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_user_write_audit', 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'private.presence_legacy_route_call_audit', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_route_call_audit', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_route_call_audit', 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'private.presence_legacy_cutover_audit_meta', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_cutover_audit_meta', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_cutover_audit_meta', 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'private.presence_legacy_cutover_audit_coverage', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_legacy_cutover_audit_coverage', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_legacy_cutover_audit_coverage', 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'private.presence_runtime_control', 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', 'private.presence_runtime_control', 'SELECT')
       or pg_catalog.has_table_privilege('service_role', 'private.presence_runtime_control', 'SELECT') then
        return false;
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        'public.record_legacy_presence_route_call(text)',
        'EXECUTE'
    )
       or pg_catalog.has_function_privilege(
           'authenticated',
           'public.record_legacy_presence_route_call(text)',
           'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
           'anon',
           'public.record_legacy_presence_route_call(text)',
           'EXECUTE'
       ) then
        return false;
    end if;

    select count(*)::integer
    into v_cron
    from private.read_presence_cutover_audit_cron_job() as j
    where j.jobname = 'presence-audit-legacy-cutover-v1'
      and j.schedule = '5 * * * *'
      and j.command = 'select private.record_presence_legacy_cutover_audit_coverage();'
      and j.username = 'postgres'
      and j.active;

    if v_cron <> 1 then
        return false;
    end if;

    if p_expected_fingerprint is not null then
        v_current_fingerprint := private.compute_presence_cutover_audit_fingerprint();
        if v_current_fingerprint is distinct from p_expected_fingerprint then
            return false;
        end if;
    end if;

    return true;
end;
$$;

alter function private.is_presence_cutover_audit_catalog_healthy(text)
    owner to presence_maintenance_owner;
revoke all on function private.is_presence_cutover_audit_catalog_healthy(text)
    from public, anon, authenticated, service_role;
grant execute on function private.is_presence_cutover_audit_catalog_healthy(text)
    to presence_maintenance_owner, postgres;

-- Serialize the final current-hour evidence against the hourly cron. A stale
-- row inserted before this migration reached the final fingerprint must be
-- replaced, and a concurrent cron insert must not win the ON CONFLICT race.
lock table private.presence_legacy_cutover_audit_coverage
    in share row exclusive mode;
delete from private.presence_legacy_cutover_audit_coverage
where coverage_hour = pg_catalog.date_trunc('hour', pg_catalog.clock_timestamp());

-- Restore the temporary DDL authority before computing the final fingerprint.
revoke create on schema private from presence_maintenance_owner;
revoke presence_maintenance_owner from postgres;

-- No fingerprinted object may be changed after these final actions.
select private.start_presence_legacy_cutover_audit();
select private.record_presence_legacy_cutover_audit_coverage();

commit;
