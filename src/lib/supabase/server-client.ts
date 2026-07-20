import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

interface ServerClientOptions {
  onAuthCookiesSet?: () => void;
}

export async function createSupabaseServerClient(
  role?: 'service_role',
  options: ServerClientOptions = {}
): Promise<SupabaseClient> {
  // If service_role is requested, use the service role key instead of the anon key
  if (role === 'service_role') {
    // Make sure the SUPABASE_SERVICE_ROLE_KEY is set in your environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment variables')
    }
    
    // Create a direct Supabase client with service role permissions
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  }

  const cookieStore = await cookies()
  
  // Regular SSR client with cookie handling
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Next.js cookies() supports getAll in route handlers/server components
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          if (cookiesToSet.length > 0) {
            options.onAuthCookiesSet?.();
          }
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // When called from Server Components without response context, ignore
          }
        },
      },
    }
  )
}
