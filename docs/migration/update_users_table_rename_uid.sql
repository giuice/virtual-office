-- Update script for the 'users' table
-- Renames firebase_uid to supabase_uid and updates the index.

-- Start transaction
BEGIN;

-- 1. Rename the column
ALTER TABLE public.users
RENAME COLUMN firebase_uid TO supabase_uid;

-- 2. Drop the old index (if it exists)
DROP INDEX IF EXISTS public.idx_users_firebase_uid;

-- 3. Create a new index on the renamed column
CREATE INDEX IF NOT EXISTS idx_users_supabase_uid ON public.users(supabase_uid);

-- Commit transaction
COMMIT;

-- Optional: Add a comment to the column for clarity
COMMENT ON COLUMN public.users.supabase_uid IS 'Stores the Supabase Authentication User ID.';

