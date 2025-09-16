-- Update trigger function: perform operation check inside function instead of WHEN clause
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS participants_fingerprint text;

CREATE OR REPLACE FUNCTION public.set_participants_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- clear search_path for security
  PERFORM set_config('search_path', '', false);

  -- If UPDATE and participants didn't change, do nothing
  IF TG_OP = 'UPDATE' THEN
    IF OLD.participants IS NOT DISTINCT FROM NEW.participants THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.participants IS NULL THEN
    NEW.participants_fingerprint := NULL;
  ELSE
    SELECT md5(array_to_string(a, ':')) INTO STRICT NEW.participants_fingerprint
    FROM (
      SELECT array_agg(p_text ORDER BY p_text) AS a
      FROM (
        SELECT participant::text AS p_text
        FROM unnest(NEW.participants) AS participant
      ) t
    ) s;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_set_participants_fingerprint ON public.conversations;
CREATE TRIGGER conversations_set_participants_fingerprint
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_participants_fingerprint();

-- Recreate unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_direct_participants_fingerprint
ON public.conversations (participants_fingerprint)
WHERE type = 'direct';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_room_conversation
ON public.conversations (room_id)
WHERE type = 'room' AND room_id IS NOT NULL;