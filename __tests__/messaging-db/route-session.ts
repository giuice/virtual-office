// Invokes App Router route handlers in-process with a REAL local Supabase
// session. Only the Next.js request-cookie transport (`next/headers`) is
// replaced by this in-memory jar: auth.getUser(), the users.supabase_uid
// lookup, membership checks, RPCs, and RLS all run against the local stack.
import { createServerClient } from '@supabase/ssr';
import { vi } from 'vitest';

import { MESSAGING_DB_PASSWORD } from './fixtures';
import { MESSAGING_ANON_KEY, MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

export interface SessionCookie {
  readonly name: string;
  readonly value: string;
}

const jar: { current: SessionCookie[] } = { current: [] };

/**
 * Replacement for `next/headers`. Register it in the test file (vi.mock is
 * only reliably hoisted there):
 *   vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);
 */
export const nextHeadersMock = {
  cookies: async () => ({
    getAll: () => jar.current.map(({ name, value }) => ({ name, value })),
    set: () => undefined,
  }),
};

/** Points the server Supabase clients at the loopback stack (guarded in setup.ts). */
export function useLocalSupabaseEnv(): void {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', MESSAGING_API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', MESSAGING_ANON_KEY);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', MESSAGING_SERVICE_ROLE_KEY);
}

/** Signs in through @supabase/ssr and returns the auth cookies it wrote. */
export async function signInSessionCookies(email: string): Promise<SessionCookie[]> {
  const written = new Map<string, string>();
  const client = createServerClient(MESSAGING_API_URL, MESSAGING_ANON_KEY, {
    cookies: {
      getAll: () => [...written].map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          if (value) written.set(name, value);
          else written.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: MESSAGING_DB_PASSWORD });
  if (error) {
    throw new Error(`Failed to create SSR session for ${email}: ${error.message}`);
  }
  if (written.size === 0) {
    throw new Error(`No auth cookies were written for ${email}`);
  }
  return [...written].map(([name, value]) => ({ name, value }));
}

/** Runs `fn` with the given session cookies as the incoming request cookies. */
export async function asSession<T>(cookies: readonly SessionCookie[], fn: () => Promise<T>): Promise<T> {
  const previous = jar.current;
  jar.current = [...cookies];
  try {
    return await fn();
  } finally {
    jar.current = previous;
  }
}
