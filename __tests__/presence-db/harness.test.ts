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

  it('sees the expected RLS policies (13: baseline 11 minus 4 vulnerable knock policies dropped in Phase 1, plus 6 presence_maintenance_owner policies added in Phase 2)', async () => {
    const [{ count }] = await fx.sql<{ count: string }>(
      `select count(*)::text as count from pg_policies
        where schemaname = 'public'
          and tablename in ('users','spaces','space_presence_log','knock_requests')`,
    );
    expect(Number(count)).toBe(13);
    // The 6 Phase 2 additions are scoped to presence_maintenance_owner only —
    // no browser-facing policy was added back.
    const [{ count: pmoCount }] = await fx.sql<{ count: string }>(
      `select count(*)::text as count from pg_policies
        where schemaname = 'public'
          and tablename in ('users','spaces','space_presence_log','knock_requests')
          and roles = '{presence_maintenance_owner}'`,
    );
    expect(Number(pmoCount)).toBe(6);
  });
});
