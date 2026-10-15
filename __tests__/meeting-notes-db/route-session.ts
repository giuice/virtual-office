// Invokes the /api/meeting-notes route handlers in-process with a REAL local
// Supabase session (same approach as __tests__/messaging-db/route-session.ts).
// Only the Next.js request-cookie transport (`next/headers`) is replaced by
// this in-memory jar: auth.getUser(), the users.supabase_uid lookup, RLS, the
// note/item RPCs, and the rate-limit RPC all run against the local stack.
import { createServerClient } from '@supabase/ssr';
import { NextRequest, type NextResponse } from 'next/server';
import { vi } from 'vitest';

import { MEETING_NOTES_DB_PASSWORD } from './fixtures';
import { MEETING_NOTES_ANON_KEY, MEETING_NOTES_API_URL, MEETING_NOTES_SERVICE_ROLE_KEY } from './setup';

export interface SessionCookie {
  readonly name: string;
  readonly value: string;
}

const jar: { current: SessionCookie[] } = { current: [] };

/**
 * Replacement for `next/headers`. Register it in the test file:
 *   vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);
 */
export const nextHeadersMock = {
  // Snapshot per request (like Next.js): a concurrent call that swaps the jar
  // never changes the cookies of a request already in flight.
  cookies: async () => {
    const snapshot = jar.current;
    return {
      getAll: () => snapshot.map(({ name, value }) => ({ name, value })),
      set: () => undefined,
    };
  },
};

/** Points the server Supabase clients at the loopback stack (guarded in setup.ts). */
export function useLocalSupabaseEnv(): void {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', MEETING_NOTES_API_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', MEETING_NOTES_ANON_KEY);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', MEETING_NOTES_SERVICE_ROLE_KEY);
}

/** Signs in through @supabase/ssr and returns the auth cookies it wrote. */
export async function signInSessionCookies(email: string): Promise<SessionCookie[]> {
  const written = new Map<string, string>();
  const client = createServerClient(MEETING_NOTES_API_URL, MEETING_NOTES_ANON_KEY, {
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
  const { error } = await client.auth.signInWithPassword({ email, password: MEETING_NOTES_DB_PASSWORD });
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

export interface RouteCall<P> {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path and query, e.g. `/api/meeting-notes?spaceId=...`. */
  readonly path: string;
  readonly body?: unknown;
  /** A multipart/form-data body (fetch sets the boundary); excludes `body`. */
  readonly form?: FormData;
  readonly params?: P;
  /**
   * Extra request headers (e.g. a forged `origin` / `sec-fetch-site`). Without
   * them the request carries neither header, like a non-browser client.
   */
  readonly headers?: Readonly<Record<string, string>>;
  /** The client request's signal (aborting it = the browser left the page). */
  readonly signal?: AbortSignal;
}

export interface RouteResult {
  readonly status: number;
  // Response bodies are asserted field by field in the tests.
  readonly body: Record<string, unknown>;
}

type Handler<P> = (request: NextRequest, context: { params: Promise<P> }) => Promise<NextResponse>;

/** Invokes `handler` as `cookies`' session and returns status + JSON body. */
export async function callRoute<P extends Record<string, string>>(
  cookies: readonly SessionCookie[],
  handler: Handler<P>,
  call: RouteCall<P>,
): Promise<RouteResult> {
  return asSession(cookies, async () => {
    const init: {
      method: string;
      headers?: Record<string, string>;
      body?: string | Uint8Array<ArrayBuffer>;
      signal?: AbortSignal;
    } = {
      method: call.method,
      signal: call.signal,
    };
    if (call.form !== undefined) {
      // Serialized up front, like bytes arriving from the network (a request
      // streaming a live FormData cannot be cancelled cleanly in undici).
      const encoded = new Response(call.form);
      init.headers = { 'content-type': encoded.headers.get('content-type') ?? '' };
      init.body = new Uint8Array(await encoded.arrayBuffer());
    } else if (call.body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(call.body);
    }
    if (call.headers !== undefined) init.headers = { ...init.headers, ...call.headers };
    const request = new NextRequest(`http://localhost${call.path}`, init);
    const response = await handler(request, { params: Promise.resolve(call.params ?? ({} as P)) });
    const text = await response.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // A non-JSON success (e.g. the Markdown export) is kept as raw text.
      body = { raw: text };
    }
    return { status: response.status, body };
  });
}
