-- Migration: Remove user_ids array from spaces table
ALTER TABLE public.spaces DROP COLUMN IF EXISTS user_ids;
