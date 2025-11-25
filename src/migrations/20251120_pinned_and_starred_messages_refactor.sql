-- Migration: Refactor Pinned and Starred Messages
-- Date: 2025-11-20
-- Purpose: Rename tables, add conversation_id, and update RLS for shared pins and private stars.

-- 1. Rename tables to match new convention
ALTER TABLE IF EXISTS public.message_pins RENAME TO pinned_messages;
ALTER TABLE IF EXISTS public.message_stars RENAME TO starred_messages;

-- 2. Add conversation_id column
ALTER TABLE public.pinned_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.starred_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;

-- 3. Populate conversation_id from messages table
UPDATE public.pinned_messages pm
SET conversation_id = m.conversation_id
FROM public.messages m
WHERE pm.message_id = m.id
AND pm.conversation_id IS NULL;

UPDATE public.starred_messages sm
SET conversation_id = m.conversation_id
FROM public.messages m
WHERE sm.message_id = m.id
AND sm.conversation_id IS NULL;

-- 4. Make conversation_id NOT NULL (after population)
-- We need to handle cases where message might be deleted or missing, but FK handles that.
-- If table was empty, this is fine.
ALTER TABLE public.pinned_messages ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE public.starred_messages ALTER COLUMN conversation_id SET NOT NULL;

-- 5. Rename user_id to pinned_by in pinned_messages for clarity
-- 5. Rename user_id to pinned_by in pinned_messages for clarity
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pinned_messages' AND column_name = 'user_id') THEN
        ALTER TABLE public.pinned_messages RENAME COLUMN user_id TO pinned_by;
    END IF;
END $$;

-- 6. Update RLS Policies

-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own message pins" ON public.pinned_messages;
DROP POLICY IF EXISTS "Users can insert their own message pins" ON public.pinned_messages;
DROP POLICY IF EXISTS "Users can delete their own message pins" ON public.pinned_messages;

DROP POLICY IF EXISTS "Users can view their own message stars" ON public.starred_messages;
DROP POLICY IF EXISTS "Users can insert their own message stars" ON public.starred_messages;
DROP POLICY IF EXISTS "Users can delete their own message stars" ON public.starred_messages;

-- Pinned Messages (Shared)
-- View: Visible to all participants of the conversation
CREATE POLICY "Participants can view pinned messages"
    ON public.pinned_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
            AND auth.uid() = ANY(c.participants)
        )
    );

-- Insert: Participants can pin messages
CREATE POLICY "Participants can pin messages"
    ON public.pinned_messages
    FOR INSERT
    WITH CHECK (
        auth.uid() = pinned_by
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
            AND auth.uid() = ANY(c.participants)
        )
    );

-- Delete: Participants can unpin messages (Shared control)
CREATE POLICY "Participants can unpin messages"
    ON public.pinned_messages
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
            AND auth.uid() = ANY(c.participants)
        )
    );

-- Starred Messages (Private)
-- View: Only owner can view
CREATE POLICY "Users can view their own starred messages"
    ON public.starred_messages
    FOR SELECT
    USING (auth.uid() = user_id);

-- Insert: Only owner can insert
CREATE POLICY "Users can star messages"
    ON public.starred_messages
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
            AND auth.uid() = ANY(c.participants)
        )
    );

-- Delete: Only owner can delete
CREATE POLICY "Users can unstar messages"
    ON public.starred_messages
    FOR DELETE
    USING (auth.uid() = user_id);

-- 7. Realtime Publication
-- Table is likely already in publication or will be added separately.
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;
