import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Client, type QueryResult } from 'pg';
import { describe, expect, it } from 'vitest';
import { LOCAL_DB_URL } from './setup';

type HealthRow = {
  readonly check_name: string;
  readonly observed_count: string | null;
  readonly expected: 'zero' | 'zero-after-atomic' | 'counter' | 'review';
  readonly evidence_source: 'database' | 'structured-log';
  readonly gate_pass: boolean | null;
};

const REQUIRED_CHECKS = [
  'runtime_control_singleton_cardinality',
  'monitor_authority_is_postgres',
  'capacity_invariant_violation',
  'open_presence_log_unique_index',
  'multiple_open_presence_logs',
  'placement_open_log_mismatch',
  'transition_claim_without_result_over_5m',
  'placement_without_valid_evidence_beyond_grace',
  'revision_invalid_active_session',
  'revision_invalid_live_knock',
  'invalid_or_expired_live_knock_state',
  'cross_company_presence_authority',
  'retention_backlog',
  'retention_session_retirement_backlog',
  'retention_session_history_backlog',
  'retention_transition_backlog',
  'retention_auth_fence_backlog',
  'retention_knock_backlog',
  'stale_automatic_transition_rejections',
  'session_heartbeat_failures',
  'invalid_or_replayed_knock_attempts',
  'realtime_reconnect_and_reconciliation',
  'scoped_presence_query_errors',
] as const;

async function readHealthSql(): Promise<string> {
  return readFile(
    path.resolve(process.cwd(), 'scripts/presence-health-check.sql'),
    'utf8',
  );
}

function healthRowsFrom(raw: QueryResult<HealthRow> | QueryResult<HealthRow>[]): HealthRow[] {
  const resultSets = (Array.isArray(raw) ? raw : [raw]) as QueryResult<HealthRow>[];
  return resultSets
    .flatMap((result) => result.rows ?? [])
    .filter((row) => typeof row.check_name === 'string');
}

function healthQueryWithoutTransaction(sql: string): string {
  return sql
    .replace(/^begin transaction read only;\s*/i, '')
    .replace(/\s*commit;\s*$/i, '');
}

describe('presence remediation health-check artifact', () => {
  it('executes read-only and returns every required database/log counter', async () => {
    const sql = await readHealthSql();
    expect(sql).toMatch(/begin transaction read only/i);

    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    try {
      const raw = await client.query(sql);
      const healthRows = healthRowsFrom(raw);

      expect(healthRows.map((row) => row.check_name)).toEqual(REQUIRED_CHECKS);
      expect(
        healthRows
          .filter((row) => row.expected === 'zero')
          .every((row) => row.observed_count === '0' && row.gate_pass === true),
      ).toBe(true);
      expect(
        healthRows
          .filter((row) => row.expected === 'review')
          .every((row) => row.evidence_source === 'structured-log' && row.observed_count === null),
      ).toBe(true);
    } finally {
      await client.end();
    }
  });

  it('fails explicitly instead of returning an empty report when runtime control is missing', async () => {
    const sql = healthQueryWithoutTransaction(await readHealthSql());
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    try {
      await client.query('begin');
      await client.query('grant presence_maintenance_owner to postgres');
      await client.query('set role presence_maintenance_owner');
      await client.query(
        `delete from private.presence_runtime_control where singleton_id`,
      );
      await client.query('reset role');

      const rows = healthRowsFrom(await client.query(sql));
      expect(rows.map((row) => row.check_name)).toEqual(REQUIRED_CHECKS);
      expect(rows[0]).toMatchObject({
        check_name: 'runtime_control_singleton_cardinality',
        observed_count: '1',
        gate_pass: false,
      });
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.query('revoke presence_maintenance_owner from postgres')
        .catch(() => undefined);
      await client.end();
    }
  });

  it('surfaces every database abort family when corruption or cleanup lag is present', async () => {
    const sql = healthQueryWithoutTransaction(await readHealthSql());
    const companyId = randomUUID();
    const foreignCompanyId = randomUUID();
    const capacitySpaceId = randomUUID();
    const auxiliarySpaceId = randomUUID();
    const capacityUserA = randomUUID();
    const capacityUserB = randomUUID();
    const mismatchUser = randomUUID();
    const invalidSessionUser = randomUUID();
    const multipleLogUser = randomUUID();
    const stalePlacementUser = randomUUID();
    const invalidKnockUser = randomUUID();
    const expiredKnockUser = randomUUID();
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    try {
      await client.query('begin');
      // This test deliberately injects duplicate open logs to prove the
      // health check detects pre-cutover corruption. The rollback restores the
      // permanent Phase 10 unique index after the simulated legacy state.
      await client.query(
        'drop index public.ux_space_presence_log_one_open_per_user',
      );
      await client.query(
        `select pg_catalog.set_config(
           'request.jwt.claims',
           '{"role":"service_role"}',
           true
         )`,
      );
      await client.query(
        `insert into public.companies (id, name) values
           ($1, $3),
           ($2, $4)`,
        [
          companyId,
          foreignCompanyId,
          `health-abort-families::${companyId}`,
          `health-abort-foreign::${foreignCompanyId}`,
        ],
      );
      await client.query(
        `insert into public.spaces (id, company_id, name, type, status, capacity)
         values
           ($1, $3, 'Capacity fixture', 'workspace', 'available', 1),
           ($2, $3, 'Auxiliary fixture', 'workspace', 'available', 0)`,
        [capacitySpaceId, auxiliarySpaceId, companyId],
      );

      const users = [
        capacityUserA,
        capacityUserB,
        mismatchUser,
        invalidSessionUser,
        multipleLogUser,
        stalePlacementUser,
        invalidKnockUser,
        expiredKnockUser,
      ];
      for (const [index, userId] of users.entries()) {
        await client.query(
          `insert into public.users (id, company_id, email, display_name)
           values ($1, $2, $3, $4)`,
          [
            userId,
            userId === invalidSessionUser || userId === stalePlacementUser
              ? foreignCompanyId
              : companyId,
            `health-abort-${index}-${userId}@example.test`,
            `Health Abort ${index}`,
          ],
        );
      }

      await client.query(
        `update public.users
         set current_space_id = case
           when id = any($1::uuid[]) then $2::uuid
           else $3::uuid
         end
         where id = any($4::uuid[])`,
        [
          [capacityUserA, capacityUserB],
          capacitySpaceId,
          auxiliarySpaceId,
          [
            capacityUserA,
            capacityUserB,
            mismatchUser,
            invalidSessionUser,
            multipleLogUser,
            stalePlacementUser,
          ],
        ],
      );

      const activeSessionRows = [
        [capacityUserA, capacitySpaceId, 1],
        [capacityUserB, capacitySpaceId, 1],
        [invalidSessionUser, auxiliarySpaceId, 2],
      ] as const;
      for (const [userId, spaceId, userRevision] of activeSessionRows) {
        await client.query(
          `insert into public.user_presence_sessions (
             id,
             registration_id,
             user_id,
             auth_session_id,
             company_id,
             space_id,
             placement_version,
             user_access_revision,
             space_access_revision,
             connected_at,
             last_seen_at,
             expires_at
           ) values (
             $1, $2, $3, $4, $5, $6, 0, $7, 1,
             pg_catalog.clock_timestamp(),
             pg_catalog.clock_timestamp(),
             pg_catalog.clock_timestamp() + interval '5 minutes'
           )`,
          [
            randomUUID(),
            randomUUID(),
            userId,
            randomUUID(),
            companyId,
            spaceId,
            userRevision,
          ],
        );
      }

      await client.query(
        `insert into public.space_presence_log (space_id, user_id, entered_at)
         values
           ($1, $3, pg_catalog.clock_timestamp()),
           ($1, $4, pg_catalog.clock_timestamp()),
           ($2, $5, pg_catalog.clock_timestamp()),
           ($2, $6, pg_catalog.clock_timestamp()),
           ($1, $6, pg_catalog.clock_timestamp()),
           ($2, $7, pg_catalog.clock_timestamp())`,
        [
          capacitySpaceId,
          auxiliarySpaceId,
          capacityUserA,
          capacityUserB,
          invalidSessionUser,
          multipleLogUser,
          stalePlacementUser,
        ],
      );

      await client.query(
        `insert into public.location_transition_requests (
           user_id,
           transition_id,
           auth_session_id,
           requested_space_id,
           reason,
           result,
           created_at
         ) values (
           $1, $2, $3, $4, 'manual-enter', null,
           pg_catalog.clock_timestamp() - interval '6 minutes'
         )`,
        [mismatchUser, randomUUID(), randomUUID(), auxiliarySpaceId],
      );

      await client.query(
        `insert into public.knock_requests (
           id,
           space_id,
           requester_id,
           requester_name,
           company_id,
           expires_at,
           requester_location_version,
           requester_access_revision,
           space_access_revision,
           status
         ) values
           ($1, $3, $4, 'Revision invalid requester', $5,
            pg_catalog.clock_timestamp() + interval '1 minute', 1, 1, 1, 'pending'),
           ($2, $3, $6, 'Expired live requester', $5,
            pg_catalog.clock_timestamp() - interval '3 minutes', 0, 1, 1, 'pending')`,
        [
          randomUUID(),
          randomUUID(),
          auxiliarySpaceId,
          invalidKnockUser,
          companyId,
          expiredKnockUser,
        ],
      );

      await client.query('grant presence_maintenance_owner to postgres');
      await client.query('set local role presence_maintenance_owner');
      await client.query(
        `update private.presence_runtime_control
         set mode = 'atomic', changed_at = pg_catalog.clock_timestamp(), changed_by = current_user
         where singleton_id`,
      );
      await client.query('reset role');

      const rows = healthRowsFrom(await client.query(sql));
      const byName = new Map(rows.map((row) => [row.check_name, row]));
      const expectedFailures = [
        'capacity_invariant_violation',
        'open_presence_log_unique_index',
        'multiple_open_presence_logs',
        'placement_open_log_mismatch',
        'transition_claim_without_result_over_5m',
        'placement_without_valid_evidence_beyond_grace',
        'revision_invalid_active_session',
        'revision_invalid_live_knock',
        'invalid_or_expired_live_knock_state',
        'cross_company_presence_authority',
      ] as const;

      for (const checkName of expectedFailures) {
        const row = byName.get(checkName);
        expect(Number(row?.observed_count ?? 0), checkName).toBeGreaterThan(0);
        expect(row?.gate_pass, checkName).toBe(false);
      }
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });

  it('detects canonical 24-hour session and orphan-logout retention backlog', async () => {
    const sql = healthQueryWithoutTransaction(await readHealthSql());
    const companyId = randomUUID();
    const userId = randomUUID();
    const authSessionId = randomUUID();
    const transitionId = randomUUID();
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    try {
      await client.query('begin');
      await client.query(
        `select pg_catalog.set_config(
           'request.jwt.claims',
           '{"role":"service_role"}',
           false
         )`,
      );
      await client.query(
        `insert into public.companies (id, name) values ($1, $2)`,
        [companyId, `health-check::${companyId}`],
      );
      await client.query(
        `insert into public.users (id, company_id, email, display_name)
         values ($1, $2, $3, 'Health Check Fixture')`,
        [userId, companyId, `health-check-${userId}@example.test`],
      );
      await client.query(
        `insert into public.user_presence_sessions (
           id,
           registration_id,
           user_id,
           auth_session_id,
           company_id,
           connected_at,
           last_seen_at,
           expires_at,
           retired_at,
           retirement_reason
         ) values (
           $1,
           $2,
           $3,
           $4,
           $5,
           pg_catalog.clock_timestamp() - interval '26 hours',
           pg_catalog.clock_timestamp() - interval '26 hours',
           pg_catalog.clock_timestamp() - interval '25 hours',
           pg_catalog.clock_timestamp() - interval '25 hours',
           'expired'
         )`,
        [randomUUID(), randomUUID(), userId, authSessionId, companyId],
      );
      await client.query(
        `insert into public.location_transition_requests (
           user_id,
           transition_id,
           auth_session_id,
           requested_space_id,
           reason,
           result,
           created_at
         ) values (
           $1,
           $2,
           $3,
           null,
           'logout',
           '{"code":"LOCATION_UNCHANGED"}'::jsonb,
           pg_catalog.clock_timestamp() - interval '31 days'
         )`,
        [userId, transitionId, authSessionId],
      );

      const raw = await client.query(sql);
      const rows = healthRowsFrom(raw);
      const retention = rows.find((row) => row.check_name === 'retention_backlog');
      const retiredSessions = rows.find(
        (row) => row.check_name === 'retention_session_history_backlog',
      );
      const orphanTransitions = rows.find(
        (row) => row.check_name === 'retention_transition_backlog',
      );
      expect(Number(retention?.observed_count ?? 0)).toBeGreaterThanOrEqual(2);
      expect(retention?.gate_pass).toBe(false);
      expect(Number(retiredSessions?.observed_count ?? 0)).toBeGreaterThanOrEqual(1);
      expect(retiredSessions?.gate_pass).toBe(false);
      expect(Number(orphanTransitions?.observed_count ?? 0)).toBeGreaterThanOrEqual(1);
      expect(orphanTransitions?.gate_pass).toBe(false);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
  });
});
