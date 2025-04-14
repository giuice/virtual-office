// src/lib/supabase/client.ts
// This file exports a singleton instance of the Supabase browser client.
// It ensures that the client is created only once and reused across client components.
import { createSupabaseBrowserClient } from './browser-client';

// Create a singleton instance of the Supabase browser client
// Note: We don't need the URL/Key checks here as browser-client.ts handles it.
export const supabase = createSupabaseBrowserClient();
