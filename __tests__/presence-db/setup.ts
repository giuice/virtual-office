import { beforeAll } from 'vitest';

// Standard Supabase LOCAL demo keys/URLs. These are identical across every local
// Supabase install and are NOT secret — do not put prod values here.
export const LOCAL_DB_URL =
  process.env.PRESENCE_TEST_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const LOCAL_API_URL =
  process.env.PRESENCE_TEST_API_URL ?? 'http://127.0.0.1:54321';
export const LOCAL_ANON_KEY =
  process.env.PRESENCE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
export const LOCAL_SERVICE_ROLE_KEY =
  process.env.PRESENCE_TEST_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// ponytail: guard, not a mock. If Postgres is unreachable the whole suite must
// fail loudly here rather than let individual tests skip and read as "passed".
beforeAll(async () => {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: LOCAL_DB_URL });
  try {
    await client.connect();
    await client.query('select 1');
  } catch (err) {
    throw new Error(
      `Presence DB tests require a running local Supabase stack at ${LOCAL_DB_URL}. ` +
        `Run \`npm run db:local:start\` (and \`npm run db:local:reset\`) first. Cause: ${
          (err as Error).message
        }`,
    );
  } finally {
    await client.end();
  }
});
