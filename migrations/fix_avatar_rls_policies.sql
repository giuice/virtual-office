-- Fix RLS policies for avatar functionality
-- This script addresses the infinite recursion issue and ensures proper avatar access

-- First, let's drop any problematic policies that might cause recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view company members" ON public.users;
DROP POLICY IF EXISTS "Admins can manage users" ON public.users;

-- Create simple, non-recursive policies for users table
CREATE POLICY "Enable read access for authenticated users" ON public.users
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable users to update their own profile" ON public.users
    FOR UPDATE USING (auth.uid()::text = supabase_uid);

CREATE POLICY "Enable users to insert their own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid()::text = supabase_uid);

-- Ensure RLS is enabled on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create storage bucket for user uploads if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for avatar uploads
DROP POLICY IF EXISTS "Avatar uploads are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

-- Allow public read access to user-uploads bucket
CREATE POLICY "Avatar uploads are publicly accessible" ON storage.objects
    FOR SELECT USING (bucket_id = 'user-uploads');

-- Allow authenticated users to upload to avatars folder
CREATE POLICY "Users can upload their own avatars" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'user-uploads' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'avatars'
    );

-- Allow users to update their own avatar files
CREATE POLICY "Users can update their own avatars" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'user-uploads' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'avatars'
    );

-- Allow users to delete their own avatar files
CREATE POLICY "Users can delete their own avatars" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'user-uploads' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'avatars'
    );

-- Ensure storage RLS is enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create a function to safely get user avatar URL with fallback
CREATE OR REPLACE FUNCTION public.get_user_avatar_url(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    avatar_url text;
BEGIN
    SELECT u.avatar_url INTO avatar_url
    FROM public.users u
    WHERE u.id = user_id;
    
    RETURN COALESCE(avatar_url, '');
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_avatar_url(uuid) TO authenticated;

-- Create a view for safe user data access (including avatars)
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
    id,
    supabase_uid,
    company_id,
    email,
    display_name,
    avatar_url,
    status,
    status_message,
    role,
    last_active,
    created_at,
    current_space_id
FROM public.users;

-- Grant access to the view
GRANT SELECT ON public.user_profiles TO authenticated;

-- Create RLS policy for the view
ALTER VIEW public.user_profiles SET (security_barrier = true);

-- Add helpful indexes for avatar queries
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users(supabase_uid);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON public.users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_avatar_url ON public.users(avatar_url) WHERE avatar_url IS NOT NULL;

-- Update any existing NULL avatar_url values to empty string for consistency
UPDATE public.users SET avatar_url = '' WHERE avatar_url IS NULL;