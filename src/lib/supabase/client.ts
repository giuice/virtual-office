import { createClient } from '@supabase/supabase-js';

// Only throw in client-side code, log in server-side
const isBrowser = typeof window !== 'undefined';

// Get environment variables with fallbacks to prevent crashes
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  const message = 'Supabase URL or Anon Key is missing from environment variables.';
  if (isBrowser) {
    console.error(message);
  } else {
    // In server context, just log but don't throw to prevent complete API failure
    console.error(`[SERVER] ${message} API functionality using Supabase will fail.`);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);