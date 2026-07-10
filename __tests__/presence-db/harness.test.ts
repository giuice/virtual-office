import { describe, it, expect, afterAll } from 'vitest';
import { PresenceFixtures } from './fixtures';

// Phase 0 exit-gate probe: prove the presence-DB test command actually reaches
// Postgres and sees the reconstructed baseline. Later phases add behavioural
// cases (SEC-01, capacity, revisions, leases, knock) to this directory.
describe('presence-db harness', () => {
  let fx: PresenceFixtures;

  afterAll(async () => {
    if (fx) {
      await fx.cleanup();
      await fx.end();
    }
  });

  it('reaches Postgres and finds the presence prerequisite tables', async () => {
    fx = await PresenceFixtures.connect('harness');
    const rows = await fx.sql<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('users','spaces','space_presence_log','knock_requests')
        order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'knock_requests',
      'space_presence_log',
      'spaces',
      'users',
    ]);
  });

  it('sees the baseline RLS policies (11 across presence tables)', async () => {
    const [{ count }] = await fx.sql<{ count: string }>(
      `select count(*)::text as count from pg_policies
        where schemaname = 'public'
          and tablename in ('users','spaces','space_presence_log','knock_requests')`,
    );
    expect(Number(count)).toBe(11);
  });
});
