import { beforeAll } from 'vitest';

import {
  LOCAL_SUPABASE_ANON_KEY,
  LOCAL_SUPABASE_API_URL,
  LOCAL_SUPABASE_SERVICE_ROLE_KEY,
  isLoopbackUrl,
} from '../api/playwright/helpers/local-supabase-mode';

// Standard Supabase CLI demo values (not secret). Overrides exist only to point
// at another LOCAL stack; anything that is not loopback is rejected below.
export const MESSAGING_DB_URL =
  process.env.MESSAGING_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const MESSAGING_API_URL = process.env.MESSAGING_TEST_API_URL ?? LOCAL_SUPABASE_API_URL;
export const MESSAGING_ANON_KEY = LOCAL_SUPABASE_ANON_KEY;
export const MESSAGING_SERVICE_ROLE_KEY = LOCAL_SUPABASE_SERVICE_ROLE_KEY;

function assertLoopback(label: string, value: string): void {
  const host = new URL(value.replace(/^postgres(ql)?:/, 'http:')).hostname;
  if (!isLoopbackUrl(`http://${host}`)) {
    throw new Error(`Messaging DB tests only run against local Supabase; ${label} is not loopback.`);
  }
}

assertLoopback('MESSAGING_TEST_API_URL', MESSAGING_API_URL);
assertLoopback('MESSAGING_TEST_DB_URL', MESSAGING_DB_URL);

// Guard, not a mock: an unreachable stack must fail the suite loudly instead
// of letting tests skip and read as passed.
beforeAll(async () => {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: MESSAGING_DB_URL });
  try {
    await client.connect();
    await client.query('select 1 from public.conversation_members limit 1');
    const response = await fetch(`${MESSAGING_API_URL}/auth/v1/health`, {
      headers: { apikey: MESSAGING_ANON_KEY },
    });
    if (!response.ok) {
      throw new Error(`Auth health returned ${response.status}`);
    }
  } catch (err) {
    throw new Error(
      `Messaging DB tests require the local Supabase stack (${MESSAGING_API_URL}, ${MESSAGING_DB_URL}) ` +
        `with repository migrations applied. Cause: ${(err as Error).message}`,
    );
  } finally {
    await client.end();
  }
});
