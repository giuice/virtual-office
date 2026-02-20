-- Migration: Create knock_requests table for DB-backed knock signaling
-- Replaces unreliable broadcast-only channels with postgres_changes listeners
-- This uses the same realtime mechanism as presence (which works reliably)

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.knock_requests (
  id TEXT PRIMARY KEY,  -- Client-generated request ID (crypto.randomUUID)
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requester_name TEXT NOT NULL,
  requester_avatar_url TEXT,
  responder_id UUID REFERENCES public.users(id),
  responder_name TEXT,
  decision TEXT CHECK (decision IN ('APPROVE', 'DENY')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for realtime filters and queries
CREATE INDEX IF NOT EXISTS idx_knock_requests_space_id ON public.knock_requests(space_id);
CREATE INDEX IF NOT EXISTS idx_knock_requests_requester_id ON public.knock_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_knock_requests_status ON public.knock_requests(status);

-- 3. RLS
ALTER TABLE public.knock_requests ENABLE ROW LEVEL SECURITY;

-- Users can create knock requests for themselves
CREATE POLICY "knock_requests_insert" ON public.knock_requests
  FOR INSERT WITH CHECK (
    requester_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
  );

-- Users can see knock requests for spaces they occupy or their own requests
CREATE POLICY "knock_requests_select" ON public.knock_requests
  FOR SELECT USING (
    requester_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
    OR space_id IN (
      SELECT current_space_id FROM public.users
      WHERE supabase_uid = auth.uid()::text AND current_space_id IS NOT NULL
    )
  );

-- Occupants can respond to knocks for their space
CREATE POLICY "knock_requests_update" ON public.knock_requests
  FOR UPDATE USING (
    space_id IN (
      SELECT current_space_id FROM public.users
      WHERE supabase_uid = auth.uid()::text AND current_space_id IS NOT NULL
    )
  );

-- Cleanup: anyone can delete their own old requests or occupants can delete for their space
CREATE POLICY "knock_requests_delete" ON public.knock_requests
  FOR DELETE USING (
    requester_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
    OR space_id IN (
      SELECT current_space_id FROM public.users
      WHERE supabase_uid = auth.uid()::text AND current_space_id IS NOT NULL
    )
  );

-- 4. Grant permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knock_requests TO authenticated;

-- 5. Enable Realtime (postgres_changes) for this table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'knock_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.knock_requests;
  END IF;
END $$;
