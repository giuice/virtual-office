-- Migration: Messaging Features Phase 2 - Extend Existing Tables
-- Date: 2025-10-09
-- Purpose: Add voice note metadata to message_attachments and deprecate global archive flag
-- Related: tasks/tasks-0001-prd-unified-messaging-system.md (Task 1.1)

-- =============================================================================
-- 1. EXTEND message_attachments for voice notes
-- =============================================================================

-- Add voice note metadata columns
ALTER TABLE public.message_attachments
ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS waveform_data JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS transcription TEXT DEFAULT NULL;

COMMENT ON COLUMN public.message_attachments.duration IS 'Duration in seconds for voice/audio attachments';
COMMENT ON COLUMN public.message_attachments.waveform_data IS 'Waveform amplitude data (array of numbers) for voice note visualization';
COMMENT ON COLUMN public.message_attachments.transcription IS 'Optional AI-generated transcription of voice note content';

-- Add check constraint to ensure duration is positive
ALTER TABLE public.message_attachments
ADD CONSTRAINT check_duration_positive CHECK (duration IS NULL OR duration > 0);

-- =============================================================================
-- 2. DEPRECATE conversations.is_archived
-- =============================================================================

-- Add deprecation comment (is_archived field stays for backward compatibility)
COMMENT ON COLUMN public.conversations.is_archived IS
    'DEPRECATED: Use conversation_preferences.is_archived for per-user archive control. This global flag is kept for backward compatibility during migration.';

-- =============================================================================
-- 3. ADD INDEXES for new attachment queries
-- =============================================================================

-- Index for finding voice notes
CREATE INDEX IF NOT EXISTS idx_message_attachments_voice_notes
    ON public.message_attachments(message_id, type)
    WHERE duration IS NOT NULL;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
