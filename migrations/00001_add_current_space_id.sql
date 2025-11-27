-- Add current_space_id column to users table
ALTER TABLE public.users
ADD COLUMN current_space_id UUID NULL;

-- Add foreign key constraint with ON DELETE SET NULL
ALTER TABLE public.users
ADD CONSTRAINT users_current_space_id_fkey
FOREIGN KEY (current_space_id) 
REFERENCES public.spaces(id) 
ON DELETE SET NULL;

-- Add index for performance when querying users by space
CREATE INDEX idx_users_current_space_id 
ON public.users(current_space_id);