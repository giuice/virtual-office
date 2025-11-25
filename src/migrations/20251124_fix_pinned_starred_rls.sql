-- Migration: Fix RLS policies for pinned_messages and starred_messages tables
-- Date: 2025-11-24
-- Purpose: Correct the RLS policies to properly check user participation via users.supabase_uid lookup

-- Drop the incorrect policies
DROP POLICY IF EXISTS "Participants can view pinned messages" ON public.pinned_messages;
DROP POLICY IF EXISTS "Participants can pin messages" ON public.pinned_messages;
DROP POLICY IF EXISTS "Participants can unpin messages" ON public.pinned_messages;

DROP POLICY IF EXISTS "Users can view their own starred messages" ON public.starred_messages;
DROP POLICY IF EXISTS "Users can star messages" ON public.starred_messages;
DROP POLICY IF EXISTS "Users can unstar messages" ON public.starred_messages;

-- ============================================
-- Pinned Messages (Shared) - Corrected Policies
-- ============================================

-- View: Visible to all participants of the conversation
-- Must join through users table to map auth.uid() to user.id
CREATE POLICY "Participants can view pinned messages"
    ON public.pinned_messages
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.conversations c
            JOIN public.users u ON u.id = ANY(c.participants)
            WHERE c.id = pinned_messages.conversation_id
            AND u.supabase_uid = auth.uid()::text
        )
    );

-- Insert: Participants can pin messages (pinned_by must be their own user id)
CREATE POLICY "Participants can pin messages"
    ON public.pinned_messages
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        -- Ensure pinned_by matches the authenticated user's DB ID
        pinned_by = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text) AND
        -- Ensure user is participant in the conversation
        EXISTS (
            SELECT 1 FROM public.conversations c
            JOIN public.users u ON u.id = ANY(c.participants)
            WHERE c.id = pinned_messages.conversation_id
            AND u.supabase_uid = auth.uid()::text
        )
    );

-- Delete: Any participant can unpin messages (shared control)
CREATE POLICY "Participants can unpin messages"
    ON public.pinned_messages
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.conversations c
            JOIN public.users u ON u.id = ANY(c.participants)
            WHERE c.id = pinned_messages.conversation_id
            AND u.supabase_uid = auth.uid()::text
        )
    );

-- ============================================
-- Starred Messages (Private) - Corrected Policies
-- ============================================

-- View: Only owner can view their own stars
CREATE POLICY "Users can view their own starred messages"
    ON public.starred_messages
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND
        user_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
    );

-- Insert: Only owner can insert (user_id must match their DB ID)
CREATE POLICY "Users can star messages"
    ON public.starred_messages
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL AND
        -- Ensure user_id matches the authenticated user's DB ID
        user_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text) AND
        -- Ensure user is participant in the conversation
        EXISTS (
            SELECT 1 FROM public.conversations c
            JOIN public.users u ON u.id = ANY(c.participants)
            WHERE c.id = starred_messages.conversation_id
            AND u.supabase_uid = auth.uid()::text
        )
    );

-- Delete: Only owner can delete their own stars
CREATE POLICY "Users can unstar messages"
    ON public.starred_messages
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL AND
        user_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
    );
