// src/lib/supabase/browser-client.ts
import { createBrowserClient } from '@supabase/ssr';
// import { Database } from './database.types'; // Uncomment if you have generated types

export function createSupabaseBrowserClient() {
  // If using generated types:
  // return createBrowserClient<Database>(
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
