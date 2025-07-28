-- Run this SQL directly in Supabase SQL Editor to fix RLS policy issues
-- This will resolve the "infinite recursion detected in policy for relation 'users'" error

-- Step 1: Disable RLS temporarily to clean up
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop all existing problematic policies
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

-- Step 3: Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 4: Create simple, non-recursive policies
CREATE POLICY "users_select_policy" ON public.users
    FOR SELECT USING (true);

CREATE POLICY "users_insert_policy" ON public.users
    FOR INSERT WITH CHECK (auth.uid()::text = supabase_uid);

CREATE POLICY "users_update_policy" ON public.users
    FOR UPDATE USING (auth.uid()::text = supabase_uid);

-- Step 5: Ensure storage bucket exists and has proper policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Step 6: Create storage policies for avatars
DROP POLICY IF EXISTS "Avatar uploads are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;

CREATE POLICY "Avatar uploads are publicly accessible" ON storage.objects
    FOR SELECT USING (bucket_id = 'user-uploads');

CREATE POLICY "Users can upload their own avatars" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'user-uploads' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'avatars'
    );

CREATE POLICY "Users can update their own avatars" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'user-uploads' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'avatars'
    );

CREATE POLICY "Users can delete their own avatars" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'user-uploads' 
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'avatars'
    );

-- Step 7: Test the fix
SELECT id, display_name, avatar_url FROM public.users LIMIT 5;