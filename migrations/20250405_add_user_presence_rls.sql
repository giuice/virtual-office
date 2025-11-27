-- Add RLS policy for user presence data
CREATE POLICY "Allow authenticated users to read company user presence"
ON public.users
FOR SELECT
USING (
  auth.role() = 'authenticated' AND
  company_id = (SELECT company_id FROM users WHERE id = auth.uid())
);

-- Enable realtime for users table if not already enabled
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;