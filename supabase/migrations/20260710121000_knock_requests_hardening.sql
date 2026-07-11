ALTER TABLE public.knock_requests
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
    ADD COLUMN IF NOT EXISTS expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
    ADD COLUMN IF NOT EXISTS requester_location_version integer,
    ADD COLUMN IF NOT EXISTS requester_access_revision bigint,
    ADD COLUMN IF NOT EXISTS space_access_revision bigint,
    ADD COLUMN IF NOT EXISTS responder_access_revision bigint;

UPDATE public.knock_requests AS kr
SET company_id = COALESCE(s.company_id, u.company_id),
    expires_at = now(),
    requester_location_version = u.location_version,
    requester_access_revision = u.presence_access_revision,
    space_access_revision = s.presence_access_revision,
    status = 'expired',
    updated_at = now()
FROM public.spaces AS s,
     public.users AS u
WHERE s.id = kr.space_id
  AND u.id = kr.requester_id;

ALTER TABLE public.knock_requests
    ALTER COLUMN company_id SET NOT NULL,
    ALTER COLUMN expires_at SET NOT NULL,
    ALTER COLUMN requester_location_version SET NOT NULL,
    ALTER COLUMN requester_access_revision SET NOT NULL,
    ALTER COLUMN space_access_revision SET NOT NULL;

ALTER TABLE public.knock_requests
    DROP CONSTRAINT IF EXISTS knock_requests_space_id_fkey;

ALTER TABLE public.knock_requests
    ADD CONSTRAINT knock_requests_space_id_fkey
        FOREIGN KEY (space_id) REFERENCES public.spaces(id) ON DELETE RESTRICT;

ALTER TABLE public.knock_requests
    DROP CONSTRAINT IF EXISTS knock_requests_status_check;

ALTER TABLE public.knock_requests
    ADD CONSTRAINT knock_requests_status_check
        CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'consumed'));

ALTER TABLE public.knock_requests
    DROP CONSTRAINT IF EXISTS knock_requests_state_machine_check;

ALTER TABLE public.knock_requests
    ADD CONSTRAINT knock_requests_state_machine_check
        CHECK (
            (status = 'pending'
                AND decision IS NULL
                AND responder_id IS NULL
                AND responder_access_revision IS NULL
                AND consumed_at IS NULL)
            OR (status = 'approved'
                AND decision = 'APPROVE'
                AND responder_id IS NOT NULL
                AND responder_access_revision IS NOT NULL
                AND consumed_at IS NULL)
            OR (status = 'denied'
                AND decision = 'DENY'
                AND responder_id IS NOT NULL
                AND responder_access_revision IS NOT NULL
                AND consumed_at IS NULL)
            OR (status = 'consumed'
                AND decision = 'APPROVE'
                AND responder_id IS NOT NULL
                AND responder_access_revision IS NOT NULL
                AND consumed_at IS NOT NULL)
            OR (status = 'expired' AND consumed_at IS NULL)
        );

CREATE UNIQUE INDEX IF NOT EXISTS knock_requests_live_requester_space_uidx
    ON public.knock_requests (requester_id, space_id)
    WHERE status IN ('pending', 'approved')
      AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS knock_requests_requester_space_status_expires_idx
    ON public.knock_requests (requester_id, space_id, status, expires_at);

CREATE INDEX IF NOT EXISTS knock_requests_space_status_expires_idx
    ON public.knock_requests (space_id, status, expires_at);

CREATE INDEX IF NOT EXISTS knock_requests_requester_company_created_at_idx
    ON public.knock_requests (requester_id, company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS knock_requests_requester_space_created_at_idx
    ON public.knock_requests (requester_id, space_id, created_at DESC);

ALTER TABLE public.knock_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knock_requests_insert ON public.knock_requests;
DROP POLICY IF EXISTS knock_requests_select ON public.knock_requests;
DROP POLICY IF EXISTS knock_requests_update ON public.knock_requests;
DROP POLICY IF EXISTS knock_requests_delete ON public.knock_requests;

REVOKE ALL ON TABLE public.knock_requests FROM anon;
REVOKE ALL ON TABLE public.knock_requests FROM authenticated;
