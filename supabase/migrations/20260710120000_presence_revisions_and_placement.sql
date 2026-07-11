-- The private schema PRE-EXISTS with RLS policy helpers (current_company_id,
-- is_company_admin, ...) that authenticated must keep USAGE/EXECUTE on.
-- Never blanket-revoke here; only the two new trigger functions are locked down
-- individually at the bottom of this file.
CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS location_version integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS presence_access_revision bigint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS initial_placement_completed_at timestamptz;

ALTER TABLE public.spaces
    ADD COLUMN IF NOT EXISTS presence_access_revision bigint NOT NULL DEFAULT 1;

ALTER TABLE public.users
    ADD CONSTRAINT users_location_version_nonnegative
        CHECK (location_version >= 0),
    ADD CONSTRAINT users_presence_access_revision_min
        CHECK (presence_access_revision >= 1);

ALTER TABLE public.spaces
    ADD CONSTRAINT spaces_presence_access_revision_min
        CHECK (presence_access_revision >= 1);

UPDATE public.users
SET initial_placement_completed_at = COALESCE(created_at, now())
WHERE initial_placement_completed_at IS NULL;

UPDATE public.spaces
SET capacity = 0
WHERE capacity < 0;

ALTER TABLE public.spaces
    ADD CONSTRAINT spaces_capacity_nonnegative
        CHECK (capacity >= 0);

CREATE OR REPLACE FUNCTION private.guard_user_presence_revisions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.location_version := 0;
        NEW.presence_access_revision := 1;
    ELSE
        IF NEW.company_id IS DISTINCT FROM OLD.company_id
            OR NEW.role IS DISTINCT FROM OLD.role THEN
            NEW.presence_access_revision := OLD.presence_access_revision + 1;
        ELSE
            NEW.presence_access_revision := OLD.presence_access_revision;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_space_presence_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.presence_access_revision := 1;
    ELSE
        IF NEW.company_id IS DISTINCT FROM OLD.company_id
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.access_control IS DISTINCT FROM OLD.access_control THEN
            NEW.presence_access_revision := OLD.presence_access_revision + 1;
        ELSE
            NEW.presence_access_revision := OLD.presence_access_revision;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_presence_revisions ON public.users;

CREATE TRIGGER users_guard_presence_revisions
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION private.guard_user_presence_revisions();

DROP TRIGGER IF EXISTS spaces_guard_presence_revision ON public.spaces;

CREATE TRIGGER spaces_guard_presence_revision
BEFORE INSERT OR UPDATE ON public.spaces
FOR EACH ROW
EXECUTE FUNCTION private.guard_space_presence_revision();

REVOKE UPDATE ON TABLE public.users FROM anon;
REVOKE UPDATE ON TABLE public.users FROM authenticated;

-- Exactly the pre-Phase-1 column list from 20260610183139_enable_core_table_rls.sql.
-- company_id/email/role/current_space_id stay service-role-only: the row-scoped
-- users_update_own_safe_columns policy limits WHICH row, not WHICH values, so any
-- widening here would let a member self-grant admin or bypass the location route.
GRANT UPDATE (
    display_name,
    avatar_url,
    status,
    status_message,
    preferences,
    last_active
) ON TABLE public.users TO authenticated;

REVOKE UPDATE ON TABLE public.spaces FROM anon;
REVOKE UPDATE ON TABLE public.spaces FROM authenticated;

GRANT UPDATE (
    company_id,
    name,
    type,
    status,
    capacity,
    features,
    position,
    description,
    access_control,
    created_by,
    updated_at,
    is_template,
    template_name,
    neighborhood_id
) ON TABLE public.spaces TO authenticated;

-- Trigger functions fire regardless of caller EXECUTE; nobody needs to call them.
REVOKE ALL ON FUNCTION private.guard_user_presence_revisions() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_space_presence_revision() FROM public, anon, authenticated;
