-- Realtime Messaging Setup Migration
-- This migration sets up publications and RLS policies for realtime messaging functionality
-- Run this migration in your Supabase database

-- Step 1: Add messaging tables to the supabase_realtime publication
-- Note: This publication is created by default in Supabase projects

-- Add messages table to publication for realtime updates (skip if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
END $$;

-- Add message_reactions table if you want to subscribe to reactions directly
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'message_reactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
END $$;

-- Step 2: Enable Row Level Security (RLS) on all messaging tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Step 3: Create RLS policies for conversations

-- Policy: Users can read conversations they are participants in
CREATE POLICY "read_own_conversations" ON public.conversations
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.supabase_uid = auth.uid()::text
        AND u.id = ANY(conversations.participants)
    )
  );

-- Policy: Users can create conversations where they are a participant
CREATE POLICY "create_conversations_as_participant" ON public.conversations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.supabase_uid = auth.uid()::text
        AND u.id = ANY(conversations.participants)
    )
  );

-- Policy: Users can update conversations they participate in (for last_activity updates)
CREATE POLICY "update_own_conversations" ON public.conversations
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.supabase_uid = auth.uid()::text
        AND u.id = ANY(conversations.participants)
    )
  );

-- Step 4: Create RLS policies for messages

-- Policy: Users can read messages in conversations they participate in
CREATE POLICY "read_messages_in_own_conversations" ON public.messages
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.users u ON u.id = ANY(c.participants)
      WHERE c.id = messages.conversation_id
        AND u.supabase_uid = auth.uid()::text
    )
  );

-- Policy: Users can send messages as themselves in conversations they participate in
CREATE POLICY "send_message_as_self" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    sender_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text) AND
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.users u ON u.id = ANY(c.participants)
      WHERE c.id = messages.conversation_id
        AND u.supabase_uid = auth.uid()::text
    )
  );

-- Policy: Users can update their own messages (for editing/status changes)
CREATE POLICY "update_own_messages" ON public.messages
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND
    sender_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
  );

-- Policy: Users can delete their own messages
CREATE POLICY "delete_own_messages" ON public.messages
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND
    sender_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
  );

-- Step 5: Create RLS policies for message_attachments

-- Policy: Users can read attachments for messages in conversations they participate in
CREATE POLICY "read_attachments_in_own_conversations" ON public.message_attachments
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      JOIN public.users u ON u.id = ANY(c.participants)
      WHERE m.id = message_attachments.message_id
        AND u.supabase_uid = auth.uid()::text
    )
  );

-- Policy: Users can add attachments to their own messages
CREATE POLICY "add_attachments_to_own_messages" ON public.message_attachments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_attachments.message_id
        AND m.sender_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
    )
  );

-- Policy: Users can delete attachments from their own messages
CREATE POLICY "delete_own_message_attachments" ON public.message_attachments
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_attachments.message_id
        AND m.sender_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
    )
  );

-- Step 6: Create RLS policies for message_reactions

-- Policy: Users can read reactions for messages in conversations they participate in
CREATE POLICY "read_reactions_in_own_conversations" ON public.message_reactions
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      JOIN public.users u ON u.id = ANY(c.participants)
      WHERE m.id = message_reactions.message_id
        AND u.supabase_uid = auth.uid()::text
    )
  );

-- Policy: Users can add reactions as themselves
CREATE POLICY "add_own_reactions" ON public.message_reactions
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text) AND
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      JOIN public.users u ON u.id = ANY(c.participants)
      WHERE m.id = message_reactions.message_id
        AND u.supabase_uid = auth.uid()::text
    )
  );

-- Policy: Users can remove their own reactions
CREATE POLICY "remove_own_reactions" ON public.message_reactions
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND
    user_id = (SELECT id FROM public.users WHERE supabase_uid = auth.uid()::text)
  );

-- Step 7: Verify the publication setup
-- Run this query to verify that the tables are in the publication:
-- SELECT * FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
-- AND tablename IN ('messages','message_reactions');

-- Step 8: Optional - Set replica identity for UPDATE/DELETE events with OLD values
-- Uncomment if you need OLD values in realtime events (increases WAL size)
-- ALTER TABLE public.messages REPLICA IDENTITY FULL;
-- ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

COMMENT ON TABLE public.conversations IS 'Conversations table with RLS policies for multi-tenant messaging';
COMMENT ON TABLE public.messages IS 'Messages table with RLS policies and realtime publication enabled';
COMMENT ON TABLE public.message_attachments IS 'Message attachments table with RLS policies';
COMMENT ON TABLE public.message_reactions IS 'Message reactions table with RLS policies and realtime publication enabled';