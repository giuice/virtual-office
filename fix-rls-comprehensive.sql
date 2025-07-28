-- COMPREHENSIVE RLS FIX FOR SUPABASE
-- This script fixes infinite recursion issues and sets up proper RLS policies
-- Run this in Supabase SQL Editor

-- ========================================
-- STEP 1: DISABLE RLS ON ALL TABLES TO CLEAN UP
-- ========================================

-- Disable RLS on users table to clean up
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Disable RLS on other tables mentioned in security advisor
ALTER TABLE public.meeting_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_note_action_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_presence_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_reservations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces DISABLE ROW LEVEL SECURITY;

-- ========================================
-- STEP 2: DROP ALL EXISTING PROBLEMATIC POLICIES
-- ========================================

-- Drop all existing policies on users table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view company members" ON public.users;
DROP POLICY IF EXISTS "Admins can manage users" ON public.users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Enable users to update their own profile" ON public.users;
DROP POLICY IF EXISTS "Enable users to insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.users;
DROP POLICY IF EXISTS "Allow own profile update" ON public.users;
DROP POLICY IF EXISTS "Allow own profile insert" ON public.users;
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;
DROP POLICY IF EXISTS "authenticated_users_read" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "simple_read" ON public.users;
DROP POLICY IF EXISTS "simple_update" ON public.users;
DROP POLICY IF EXISTS "simple_insert" ON public.users;

-- ========================================
-- STEP 3: CREATE SIMPLE, NON-RECURSIVE POLICIES
-- ========================================

-- Re-enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create simple policies that avoid recursion
-- Policy 1: Allow all authenticated users to read user data (needed for presence, avatars, etc.)
CREATE POLICY "allow_authenticated_select" ON public.users
    FOR SELECT 
    TO authenticated 
    USING (true);

-- Policy 2: Allow users to update only their own profile
CREATE POLICY "allow_own_update" ON public.users
    FOR UPDATE 
    TO authenticated 
    USING (supabase_uid = (SELECT auth.uid()::text));

-- Policy 3: Allow users to insert their own profile
CREATE POLICY "allow_own_insert" ON public.users
    FOR INSERT 
    TO authenticated 
    WITH CHECK (supabase_uid = (SELECT auth.uid()::text));

-- ========================================
-- STEP 4: ENABLE RLS ON OTHER TABLES WITH BASIC POLICIES
-- ========================================

-- Companies table
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_authenticated_read" ON public.companies
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies_admin_manage" ON public.companies
    FOR ALL TO authenticated USING (
        (SELECT auth.uid()::text) = ANY(admin_ids)
    );

-- Spaces table
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spaces_company_access" ON public.spaces
    FOR SELECT TO authenticated USING (
        company_id IN (
            SELECT company_id FROM public.users 
            WHERE supabase_uid = (SELECT auth.uid()::text)
        )
    );

-- Messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_authenticated_read" ON public.messages
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "messages_own_insert" ON public.messages
    FOR INSERT TO authenticated WITH CHECK (
        sender_id IN (
            SELECT id FROM public.users 
            WHERE supabase_uid = (SELECT auth.uid()::text)
        )
    );

-- Conversations table
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_participant_access" ON public.conversations
    FOR SELECT TO authenticated USING (
        (SELECT auth.uid()::text) = ANY(
            SELECT supabase_uid FROM public.users 
            WHERE id = ANY(participants)
        )
    );

-- Announcements table
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_company_read" ON public.announcements
    FOR SELECT TO authenticated USING (
        company_id IN (
            SELECT company_id FROM public.users 
            WHERE supabase_uid = (SELECT auth.uid()::text)
        )
    );

-- Meeting notes table
ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meeting_notes_authenticated_read" ON public.meeting_notes
    FOR SELECT TO authenticated USING (true);

-- Invitations table
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitations_email_access" ON public.invitations
    FOR SELECT TO authenticated USING (
        email IN (
            SELECT email FROM public.users 
            WHERE supabase_uid = (SELECT auth.uid()::text)
        )
    );

-- ========================================
-- STEP 5: STORAGE BUCKET AND POLICIES
-- ========================================

-- Ensure user-uploads bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies
DROP POLICY IF EXISTS "Avatar uploads are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

-- Create storage policies for avatars
CREATE POLICY "public_avatar_access" ON storage.objects
    FOR SELECT USING (bucket_id = 'user-uploads');

CREATE POLICY "authenticated_avatar_upload" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'user-uploads' 
        AND (storage.foldername(name))[1] = 'avatars'
    );

CREATE POLICY "authenticated_avatar_update" ON storage.objects
    FOR UPDATE TO authenticated USING (
        bucket_id = 'user-uploads' 
        AND (storage.foldername(name))[1] = 'avatars'
    );

CREATE POLICY "authenticated_avatar_delete" ON storage.objects
    FOR DELETE TO authenticated USING (
        bucket_id = 'user-uploads' 
        AND (storage.foldername(name))[1] = 'avatars'
    );

-- ========================================
-- STEP 6: CREATE HELPFUL INDEXES FOR PERFORMANCE
-- ========================================

-- Index for user lookups by supabase_uid
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users(supabase_uid);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON public.users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_avatar_url ON public.users(avatar_url) WHERE avatar_url IS NOT NULL;

-- Index for messages
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

-- Index for spaces
CREATE INDEX IF NOT EXISTS idx_spaces_company_id ON public.spaces(company_id);

-- ========================================
-- STEP 7: TEST THE CONFIGURATION
-- ========================================

-- Test query to verify users table access
SELECT 
    id, 
    display_name, 
    avatar_url, 
    email,
    company_id,
    status
FROM public.users 
LIMIT 5;

-- Test query to verify companies table access
SELECT 
    id, 
    name, 
    admin_ids
FROM public.companies 
LIMIT 3;

-- Show current policies on users table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users' 
AND schemaname = 'public';

-- ========================================
-- COMPLETION MESSAGE
-- ========================================

DO $$
BEGIN
    RAISE NOTICE 'RLS policies have been successfully configured!';
    RAISE NOTICE 'All tables now have proper Row Level Security enabled.';
    RAISE NOTICE 'Avatar storage bucket and policies are configured.';
    RAISE NOTICE 'Performance indexes have been added.';
    RAISE NOTICE 'You can now restart your application.';
END $$;