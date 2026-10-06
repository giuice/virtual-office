// Local Supabase test mode for the messaging E2E harness.
//
// Every value here is either a standard Supabase CLI demo value (identical on
// every local install, not secret) or a local-only test credential. Nothing in
// this file may point at a hosted Supabase project: `assertLocalSupabaseOnly`
// fails the run before any server starts if a hosted URL survives the overrides.

export const LOCAL_SUPABASE_API_URL = 'http://127.0.0.1:54321';

export const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Dedicated port: local mode never reuses a developer-owned server on :3000,
 * which may be targeting the hosted database.
 */
export const LOCAL_MESSAGING_PORT = 3210;
export const LOCAL_MESSAGING_BASE_URL = `http://localhost:${LOCAL_MESSAGING_PORT}`;

/** Isolated Next output so NEXT_PUBLIC_* values inlined for local never mix with `.next`. */
export const LOCAL_MESSAGING_DIST_DIR = '.next-messaging-local';

/** Flag read by the messaging fixture to enforce the loopback-only network guard. */
export const LOCAL_MESSAGING_FLAG = 'VO_MESSAGING_LOCAL_SUPABASE';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Overrides applied on top of whatever `.env.local` loaded. Next.js does not
 * overwrite variables already present in process.env, so these win inside the
 * dev server as well as in the Playwright runner and workers.
 */
export function buildLocalSupabaseEnv(): Record<string, string> {
  return {
    [LOCAL_MESSAGING_FLAG]: '1',
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_SUPABASE_ANON_KEY,
    SUPABASE_URL: LOCAL_SUPABASE_API_URL,
    SUPABASE_ANON_KEY: LOCAL_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: LOCAL_SUPABASE_SERVICE_ROLE_KEY,
    // Management-API token for the hosted project: never needed locally.
    SUPABASE_ACCESS_TOKEN: '',
    NEXT_PUBLIC_SITE_URL: LOCAL_MESSAGING_BASE_URL,
    NEXT_PUBLIC_APP_URL: LOCAL_MESSAGING_BASE_URL,
    // Local-only seed-route secret and accounts. The seed route provisions
    // these Auth users and their public.users rows in the local stack.
    PLAYWRIGHT_TEST_SECRET: 'local-messaging-e2e-secret',
    PLAYWRIGHT_PRIMARY_EMAIL: 'messaging-primary@local.test',
    PLAYWRIGHT_PRIMARY_PASSWORD: 'local-messaging-primary-pw',
    PLAYWRIGHT_PRIMARY_DISPLAY_NAME: 'Local Primary',
    PLAYWRIGHT_SECONDARY_EMAIL: 'messaging-secondary@local.test',
    PLAYWRIGHT_SECONDARY_PASSWORD: 'local-messaging-secondary-pw',
    PLAYWRIGHT_SECONDARY_DISPLAY_NAME: 'Local Secondary',
    // Opt-in third group member (never signs in; see the seed route PATCH).
    PLAYWRIGHT_TERTIARY_EMAIL: 'messaging-tertiary@local.test',
    PLAYWRIGHT_TERTIARY_PASSWORD: 'local-messaging-tertiary-pw',
    PLAYWRIGHT_TERTIARY_DISPLAY_NAME: 'Local Tertiary',
    // Hosted-account credentials from .env.local must not leak into local runs.
    AUTH_E2E_EMAIL: '',
    AUTH_E2E_PASSWORD: '',
    AUTH_E2E_MEMBER_EMAIL: '',
    AUTH_E2E_MEMBER_PASSWORD: '',
    VO_NEXT_DIST_DIR: LOCAL_MESSAGING_DIST_DIR,
    VO_NEXT_TSCONFIG: 'tsconfig.messaging-local.json',
  };
}

export function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** True for any URL whose host is a hosted Supabase domain. */
export function isHostedSupabaseUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host.endsWith('.supabase.co') || host.endsWith('.supabase.com');
  } catch {
    return /\.supabase\.(co|com)\b/i.test(value);
  }
}

/**
 * Fail closed: every Supabase URL must be loopback and no environment value may
 * reference a hosted Supabase domain.
 */
export function assertLocalSupabaseOnly(env: NodeJS.ProcessEnv): void {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) {
    const value = env[key];
    if (!value || !isLoopbackUrl(value)) {
      throw new Error(`Local messaging mode requires ${key} to be a loopback URL.`);
    }
  }
  const leaked = Object.entries(env)
    .filter(([, value]) => typeof value === 'string' && /\.supabase\.(co|com)\b/i.test(value))
    .map(([key]) => key);
  if (leaked.length > 0) {
    throw new Error(
      `Local messaging mode refuses to start: hosted Supabase values remain in ${leaked.join(', ')}.`,
    );
  }
}
