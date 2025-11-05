-- Migration: Messaging Features Phase 1 - New Tables
-- Date: 2025-10-09
-- Purpose: Add tables for per-user conversation preferences, read receipts, message pins, and message stars
-- Related: tasks/tasks-0001-prd-unified-messaging-system.md (Task 1.1)

-- =============================================================================
-- 1. CONVERSATION_PREFERENCES: Per-user conversation settings
-- =============================================================================
-- Replaces global conversations.is_archived with per-user control
-- Adds pin/star functionality for conversations

CREATE TABLE IF NOT EXISTS public.conversation_preferences (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Pin/Star/Archive flags
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    pinned_order INTEGER DEFAULT NULL, -- NULL = not pinned, 0-N for user-defined order
    is_starred BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,

    -- Notification settings
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT conversation_preferences_unique_user_conversation UNIQUE (conversation_id, user_id),
    CONSTRAINT pinned_order_positive CHECK (pinned_order IS NULL OR pinned_order >= 0)
);

COMMENT ON TABLE public.conversation_preferences IS 'Per-user conversation settings including pin, star, archive, and notification preferences';
COMMENT ON COLUMN public.conversation_preferences.pinned_order IS 'User-defined order for pinned conversations (NULL = unpinned, 0-N for order)';
COMMENT ON COLUMN public.conversation_preferences.is_archived IS 'Per-user archive status (replaces global conversations.is_archived)';

-- Indexes for performance
CREATE INDEX idx_conversation_preferences_user_id ON public.conversation_preferences(user_id);
CREATE INDEX idx_conversation_preferences_conversation_id ON public.conversation_preferences(conversation_id);
CREATE INDEX idx_conversation_preferences_pinned ON public.conversation_preferences(user_id, is_pinned, pinned_order) WHERE is_pinned = true;
CREATE INDEX idx_conversation_preferences_archived ON public.conversation_preferences(user_id, is_archived) WHERE is_archived = true;

-- RLS Policies
ALTER TABLE public.conversation_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see and modify their own preferences
CREATE POLICY "Users can view their own conversation preferences"
    ON public.conversation_preferences
    FOR SELECT
    USING (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

CREATE POLICY "Users can insert their own conversation preferences"
    ON public.conversation_preferences
    FOR INSERT
    WITH CHECK (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

CREATE POLICY "Users can update their own conversation preferences"
    ON public.conversation_preferences
    FOR UPDATE
    USING (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

CREATE POLICY "Users can delete their own conversation preferences"
    ON public.conversation_preferences
    FOR DELETE
    USING (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

-- =============================================================================
-- 2. MESSAGE_READ_RECEIPTS: Track who read which message when
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.message_read_receipts (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT message_read_receipts_unique_user_message UNIQUE (message_id, user_id)
);

COMMENT ON TABLE public.message_read_receipts IS 'Tracks read receipts for messages (who read what and when)';

-- Indexes
CREATE INDEX idx_message_read_receipts_message_id ON public.message_read_receipts(message_id);
CREATE INDEX idx_message_read_receipts_user_id ON public.message_read_receipts(user_id);

-- RLS Policies
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- Users can see their own receipts and receipts for messages they sent
CREATE POLICY "Users can view their own read receipts"
    ON public.message_read_receipts
    FOR SELECT
    USING (
        auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id)
        OR
        auth.uid()::text = (
            SELECT u.supabase_uid
            FROM public.messages m
            JOIN public.users u ON m.sender_id = u.id
            WHERE m.id = message_id
        )
    );

CREATE POLICY "Users can insert their own read receipts"
    ON public.message_read_receipts
    FOR INSERT
    WITH CHECK (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

-- No update/delete policies - read receipts are immutable once created

-- =============================================================================
-- 3. MESSAGE_PINS: User-specific pinned messages within conversations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.message_pins (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT message_pins_unique_user_message UNIQUE (message_id, user_id)
);

COMMENT ON TABLE public.message_pins IS 'User-specific pinned messages within conversations for quick reference';

-- Indexes
CREATE INDEX idx_message_pins_message_id ON public.message_pins(message_id);
CREATE INDEX idx_message_pins_user_id_pinned_at ON public.message_pins(user_id, pinned_at DESC);

-- RLS Policies
ALTER TABLE public.message_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own message pins"
    ON public.message_pins
    FOR SELECT
    USING (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

CREATE POLICY "Users can insert their own message pins"
    ON public.message_pins
    FOR INSERT
    WITH CHECK (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

CREATE POLICY "Users can delete their own message pins"
    ON public.message_pins
    FOR DELETE
    USING (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

-- =============================================================================
-- 4. MESSAGE_STARS: Cross-conversation message bookmarks
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.message_stars (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    starred_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT message_stars_unique_user_message UNIQUE (message_id, user_id)
);

COMMENT ON TABLE public.message_stars IS 'User-specific starred messages across all conversations for bookmarking';

-- Indexes
CREATE INDEX idx_message_stars_message_id ON public.message_stars(message_id);
CREATE INDEX idx_message_stars_user_id_starred_at ON public.message_stars(user_id, starred_at DESC);

-- RLS Policies
ALTER TABLE public.message_stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own message stars"
    ON public.message_stars
    FOR SELECT
    USING (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

CREATE POLICY "Users can insert their own message stars"
    ON public.message_stars
    FOR INSERT
    WITH CHECK (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

CREATE POLICY "Users can delete their own message stars"
    ON public.message_stars
    FOR DELETE
    USING (auth.uid()::text = (SELECT supabase_uid FROM public.users WHERE id = user_id));

-- =============================================================================
-- 5. HELPER FUNCTIONS (Optional - for convenience)
-- =============================================================================

-- Function to auto-create default preferences when user joins a conversation
CREATE OR REPLACE FUNCTION public.create_default_conversation_preference()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert default preferences for each participant in the new conversation
    INSERT INTO public.conversation_preferences (conversation_id, user_id)
    SELECT NEW.id, unnest(NEW.participants)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_default_conversation_preference IS 'Auto-creates default conversation preferences for all participants when a conversation is created';

-- Trigger to auto-create preferences
CREATE TRIGGER trigger_create_default_conversation_preferences
    AFTER INSERT ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_conversation_preference();

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
