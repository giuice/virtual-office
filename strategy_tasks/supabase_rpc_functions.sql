-- Supabase RPC Functions for Virtual Office App
-- Date: 4/2/2025

-- Function to mark a conversation as read for a specific user
-- Sets the unread count for the given user_id to 0 in the JSONB field.
CREATE OR REPLACE FUNCTION mark_conversation_read(conv_id UUID, user_id_to_mark UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Or INVOKER depending on your RLS policy needs
AS $$
BEGIN
  UPDATE public.conversations
  SET unread_count = jsonb_set(
      COALESCE(unread_count, '{}'::jsonb), -- Ensure unread_count is not null
      ARRAY[user_id_to_mark::text],        -- Path to the user's key
      '0'::jsonb                           -- Value to set (as jsonb)
    )
  WHERE id = conv_id;
END;
$$;

-- Function to increment unread counts for multiple users in a conversation
-- Iterates through user_ids and increments their count in the JSONB field.
CREATE OR REPLACE FUNCTION increment_unread_counts(conv_id UUID, user_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Or INVOKER depending on your RLS policy needs
AS $$
DECLARE
  user_id_to_increment UUID;
  current_count int;
BEGIN
  FOREACH user_id_to_increment IN ARRAY user_ids
  LOOP
    -- Get the current count for the user, default to 0 if null or key doesn't exist
    SELECT COALESCE((unread_count->>user_id_to_increment::text)::int, 0)
    INTO current_count
    FROM public.conversations
    WHERE id = conv_id;

    -- Update the count for the user
    UPDATE public.conversations
    SET unread_count = jsonb_set(
        COALESCE(unread_count, '{}'::jsonb),
        ARRAY[user_id_to_increment::text],
        to_jsonb(current_count + 1) -- Increment and convert back to jsonb
      )
    WHERE id = conv_id;
  END LOOP;
END;
$$;

-- Grant execute permission to the authenticated role (or appropriate role)
-- Replace 'authenticated' with the role your application uses if different.
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_unread_counts(UUID, UUID[]) TO authenticated;

-- Optional: Grant execute permission to the service_role if needed for backend operations
-- GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID, UUID) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.increment_unread_counts(UUID, UUID[]) TO service_role;
