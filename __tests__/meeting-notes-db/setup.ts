import { beforeAll } from 'vitest';

import {
  LOCAL_SUPABASE_ANON_KEY,
  LOCAL_SUPABASE_API_URL,
  LOCAL_SUPABASE_SERVICE_ROLE_KEY,
  isLoopbackUrl,
} from '../api/playwright/helpers/local-supabase-mode';

// Standard Supabase CLI demo values (not secret). Overrides exist only to point
// at another LOCAL stack; anything that is not loopback is rejected below.
export const MEETING_NOTES_DB_URL =
  process.env.MEETING_NOTES_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const MEETING_NOTES_API_URL = process.env.MEETING_NOTES_TEST_API_URL ?? LOCAL_SUPABASE_API_URL;
export const MEETING_NOTES_ANON_KEY = LOCAL_SUPABASE_ANON_KEY;
export const MEETING_NOTES_SERVICE_ROLE_KEY = LOCAL_SUPABASE_SERVICE_ROLE_KEY;

function assertLoopback(label: string, value: string): void {
  const host = new URL(value.replace(/^postgres(ql)?:/, 'http:')).hostname;
  if (!isLoopbackUrl(`http://${host}`)) {
    throw new Error(`Meeting-notes DB tests only run against local Supabase; ${label} is not loopback.`);
  }
}

assertLoopback('MEETING_NOTES_TEST_API_URL', MEETING_NOTES_API_URL);
assertLoopback('MEETING_NOTES_TEST_DB_URL', MEETING_NOTES_DB_URL);

// Guard, not a mock: an unreachable stack or a missing migration must fail the
// suite loudly instead of letting tests skip and read as passed.
beforeAll(async () => {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: MEETING_NOTES_DB_URL });
  try {
    await client.connect();
    await client.query('select company_id, author_user_id, revision from public.meeting_notes limit 1');
    await client.query('select 1 from public.meeting_note_versions limit 1');
    const response = await fetch(`${MEETING_NOTES_API_URL}/auth/v1/health`, {
      headers: { apikey: MEETING_NOTES_ANON_KEY },
    });
    if (!response.ok) {
      throw new Error(`Auth health returned ${response.status}`);
    }
  } catch (err) {
    throw new Error(
      `Meeting-notes DB tests require the local Supabase stack (${MEETING_NOTES_API_URL}, ${MEETING_NOTES_DB_URL}) ` +
        `with repository migrations applied. Cause: ${(err as Error).message}`,
    );
  } finally {
    await client.end();
  }
});
