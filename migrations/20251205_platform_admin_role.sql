-- =============================================================================
-- Migration: Platform Admin Role
-- Story: story-platform-admin
-- Date: 2025-12-05
-- Description: Creates platform_admins table and RLS policies for company/invitation management
-- =============================================================================

-- =============================================================================
-- 1. PLATFORM_ADMINS TABLE
-- Platform admins are Virtual Office staff who can create new companies
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

COMMENT ON TABLE public.platform_admins IS 'Platform administrators who can create companies and manage tenants. Story: story-platform-admin';

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_platform_admins_user_id ON public.platform_admins(user_id);

-- Enable RLS on platform_admins (platform admins can only read their own entry)
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Policy: Allow platform admins to read their own entry
CREATE POLICY "Platform admins can read own entry"
    ON public.platform_admins
    FOR SELECT
    USING (auth.uid() = user_id);

-- =============================================================================
-- 2. COMPANIES TABLE RLS POLICIES
-- Enable RLS and create policies for platform admin access
-- =============================================================================

-- Enable RLS on companies table
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Policy: Company members can read their company
CREATE POLICY "Company members can read their company"
    ON public.companies
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.supabase_uid = auth.uid()::text 
            AND users.company_id = companies.id
        )
    );

-- Policy: Company admins can update their company settings
CREATE POLICY "Company admins can update their company"
    ON public.companies
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.supabase_uid = auth.uid()::text 
            AND users.company_id = companies.id
            AND users.role = 'admin'
        )
    );

-- AC 1.3: Platform admins can INSERT into companies table
CREATE POLICY "Platform admins can create companies"
    ON public.companies
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.platform_admins 
            WHERE platform_admins.user_id = auth.uid()
        )
    );

-- =============================================================================
-- 3. INVITATIONS TABLE RLS POLICIES
-- Enable RLS and create policies for platform admin bypass
-- =============================================================================

-- Enable RLS on invitations table
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Company admins can read invitations for their company
CREATE POLICY "Company admins can read company invitations"
    ON public.invitations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.supabase_uid = auth.uid()::text 
            AND users.company_id = invitations.company_id
            AND users.role = 'admin'
        )
    );

-- Policy: Company admins can insert invitations for their company
CREATE POLICY "Company admins can create invitations for their company"
    ON public.invitations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.supabase_uid = auth.uid()::text 
            AND users.company_id = invitations.company_id
            AND users.role = 'admin'
        )
    );

-- Policy: Company admins can update invitations for their company
CREATE POLICY "Company admins can update company invitations"
    ON public.invitations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.supabase_uid = auth.uid()::text 
            AND users.company_id = invitations.company_id
            AND users.role = 'admin'
        )
    );

-- AC 1.4: Platform admins can INSERT into invitations for ANY company
CREATE POLICY "Platform admins can create invitations for any company"
    ON public.invitations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.platform_admins 
            WHERE platform_admins.user_id = auth.uid()
        )
    );

-- Policy: Platform admins can read all invitations (for management)
CREATE POLICY "Platform admins can read all invitations"
    ON public.invitations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.platform_admins 
            WHERE platform_admins.user_id = auth.uid()
        )
    );

-- =============================================================================
-- 4. HELPER FUNCTION: Check if user is platform admin
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.platform_admins 
        WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_platform_admin() IS 'Returns true if the current authenticated user is a platform admin';

-- =============================================================================
-- 5. GRANT PERMISSIONS
-- =============================================================================

-- Grant read access to platform_admins for authenticated users (to check their own status)
GRANT SELECT ON public.platform_admins TO authenticated;

-- Grant all access on companies for platform admins (via RLS)
GRANT ALL ON public.companies TO authenticated;

-- Grant all access on invitations for platform admins (via RLS)
GRANT ALL ON public.invitations TO authenticated;
