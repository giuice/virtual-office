-- Migration: Messaging Features Phase 3 - Realtime Publications
-- Date: 2025-10-09
-- Purpose: Add new messaging tables to Supabase Realtime publication for live updates
-- Related: tasks/tasks-0001-prd-unified-messaging-system.md (Task 1.1)

-- =============================================================================
-- ADD TABLES TO REALTIME PUBLICATION
-- =============================================================================

-- Note: The publication 'supabase_realtime' is created by default in Supabase
-- We're adding our new tables to enable realtime subscriptions

-- Add conversation_preferences to realtime
-- Enables: Live updates when users pin/star/archive conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_preferences;

-- Add message_read_receipts to realtime
-- Enables: Live read receipt updates in conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts;

-- Add message_pins to realtime
-- Enables: Live updates when messages are pinned/unpinned
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_pins;

-- Add message_stars to realtime
-- Enables: Live updates when messages are starred/unstarred
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_stars;

-- Verify existing tables are in publication (should already be added)
-- These might already exist from previous migrations
DO $$
BEGIN
    -- Ensure messages table is in realtime
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;

    -- Ensure conversations table is in realtime
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;

    -- Ensure message_reactions table is in realtime
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'message_reactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;

    -- Ensure message_attachments table is in realtime
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'message_attachments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
    END IF;
END $$;

-- =============================================================================
-- REALTIME CONFIGURATION NOTES
-- =============================================================================

-- Client-side subscription examples for developers:
--
-- 1. Subscribe to conversation preferences changes:
--    supabase
--      .channel('conversation_preferences_changes')
--      .on('postgres_changes', {
--        event: '*',
--        schema: 'public',
--        table: 'conversation_preferences',
--        filter: `user_id=eq.${userId}`
--      }, handlePreferenceChange)
--      .subscribe()
--
-- 2. Subscribe to read receipts for a conversation:
--    supabase
--      .channel('read_receipts')
--      .on('postgres_changes', {
--        event: 'INSERT',
--        schema: 'public',
--        table: 'message_read_receipts',
--        filter: `message_id=in.(${messageIds.join(',')})`
--      }, handleReadReceipt)
--      .subscribe()
--
-- 3. Subscribe to pinned messages in a conversation:
--    supabase
--      .channel('message_pins')
--      .on('postgres_changes', {
--        event: '*',
--        schema: 'public',
--        table: 'message_pins',
--        filter: `user_id=eq.${userId}`
--      }, handlePinChange)
--      .subscribe()

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
