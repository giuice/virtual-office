import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PresenceFixtures } from './fixtures';
import { LOCAL_DB_URL } from './setup';
import {
  createAuthedUser,
  createServiceClient,
  type AuthedUser,
} from './auth-clients';

const NS = `write-gate-${randomUUID()}`;
const COMPANY_NAME = `phase3-write-gate-company::${NS}`;
const SPACE_A_NAME = `phase3-write-gate-a::${NS}`;
const SPACE_B_NAME = `phase3-write-gate-b::${NS}`;
const SPACE_C_NAME = `phase3-write-gate-c::${NS}`;

type CompanyRow = { readonly id: string };
type SpaceRow = { readonly id: string };
type UserRow = {
  readonly id: string;
  readonly supabase_uid: string;
};
type CountRow = { readonly count: string };
type ControlRow = {
  readonly mode: 'legacy' | 'maintenance' | 'atomic';
  readonly cutover_id: string | null;
};
type RepairResult = {
  readonly before_open_rows: number;
  readonly before_duplicate_users: number;
  readonly before_mismatched_rows: number;
  readonly repaired_rows: number;
  readonly after_open_rows: number;
  readonly after_duplicate_users: number;
  readonly after_mismatched_rows: number;
};

describe('presence-db write gate', () => {
  let fixtures: PresenceFixtures;
  let serviceClient: ReturnType<typeof createServiceClient>;
  let companyId: string;
  let spaceAId: string;
  let spaceBId: string;
  let spaceCId: string;
  let primaryUser: UserRow;
  let secondaryUser: UserRow;
  let authBackedUser: AuthedUser;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    serviceClient = createServiceClient();

    const [company] = await fixtures.sql<CompanyRow>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [COMPANY_NAME],
    );
    if (!company) throw new Error('Failed to create write-gate company');
    companyId = company.id;

    spaceAId = await createSpace(SPACE_A_NAME);
    spaceBId = await createSpace(SPACE_B_NAME);
    spaceCId = await createSpace(SPACE_C_NAME);
    primaryUser = await createPlainUser('primary');
    secondaryUser = await createPlainUser('secondary');
    authBackedUser = await createAuthedUser(fixtures, NS, {
      key: 'write-gate-member',
      companyId,
      displayName: 'Phase 3 Write Gate Member',
      role: 'member',
    });
  });

  beforeEach(async () => {
    await resetWriteGate('legacy', null);
    await asPmo(() =>
      fixtures.sql(`delete from private.presence_legacy_writer_inflight`),
    );
    await fixtures.sql(
      `drop index if exists public.ux_space_presence_log_one_open_per_user`,
    );
    await fixtures.sql(
      `delete from public.space_presence_log
       where user_id in ($1, $2, $3)`,
      [primaryUser.id, secondaryUser.id, authBackedUser.appUserId],
    );
    await fixtures.sql(
      `update public.users
       set current_space_id = null
       where id in ($1, $2, $3)`,
      [primaryUser.id, secondaryUser.id, authBackedUser.appUserId],
    );
  });

  afterAll(async () => {
    if (fixtures) {
      await resetWriteGate('legacy', null);
      await fixtures.sql(
        `drop index if exists public.ux_space_presence_log_one_open_per_user`,
      );
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  async function createSpace(name: string): Promise<string> {
    const [space] = await fixtures.sql<SpaceRow>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'workspace'::public.space_type, 'active'::public.space_status, 10, '{"isPublic": true}'::jsonb)
       returning id`,
      [companyId, name],
    );
    if (!space) throw new Error(`Failed to create space ${name}`);
    return space.id;
  }

  async function createPlainUser(key: string): Promise<UserRow> {
    const supabaseUid = randomUUID();
    const [user] = await fixtures.sql<UserRow>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, $3, $4, 'member'::public.user_role)
       returning id, supabase_uid`,
      [
        supabaseUid,
        `phase3-write-gate-${key}::${NS}@example.test`,
        `Phase 3 Write Gate ${key}`,
        companyId,
      ],
    );
    if (!user) throw new Error(`Failed to create user ${key}`);
    return user;
  }

  // The gate tables are owned by presence_maintenance_owner with zero grants for
  // postgres, so harness access needs transient membership (postgres created the
  // role and can grant it). Session-scoped: fixtures.sql shares one client.
  async function asPmo<T>(fn: () => Promise<T>): Promise<T> {
    await fixtures.sql(`grant presence_maintenance_owner to postgres`);
    await fixtures.sql(`set role presence_maintenance_owner`);
    try {
      return await fn();
    } finally {
      await fixtures.sql(`reset role`);
      await fixtures.sql(`revoke presence_maintenance_owner from postgres`);
    }
  }

  async function resetWriteGate(
    mode: 'legacy' | 'maintenance' | 'atomic',
    cutoverId: string | null,
  ): Promise<void> {
    await asPmo(() =>
      fixtures.sql(
        `update private.presence_runtime_control
         set mode = $1,
             cutover_id = $2,
             changed_at = pg_catalog.clock_timestamp(),
             changed_by = 'test-reset',
             legacy_adapter_enabled = true,
             legacy_adapter_disabled_at = null
         where singleton_id`,
        [mode, cutoverId],
      ),
    );
  }

  async function controlRow(): Promise<ControlRow> {
    const rows = await asPmo(() =>
      fixtures.sql<ControlRow>(
        `select mode, cutover_id
         from private.presence_runtime_control
         where singleton_id`,
      ),
    );
    const row = rows[0];
    if (!row) throw new Error('Missing presence_runtime_control row');
    return row;
  }

  async function beginLegacyWrite(requestId = randomUUID()): Promise<Date> {
    const { data, error } = await serviceClient.rpc('begin_legacy_presence_write', {
      p_request_id: requestId,
    });
    if (error) throw new Error(error.message);
    return new Date(data as string);
  }

  async function endLegacyWrite(
    requestId: string,
    status: 'completed' | 'rejected' | 'failed' | string,
  ): Promise<boolean> {
    const { data, error } = await serviceClient.rpc('end_legacy_presence_write', {
      p_request_id: requestId,
      p_completion_status: status,
    });
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async function expectRpcCode(
    fn: () => Promise<unknown>,
    expectedCode: string,
  ): Promise<void> {
    await expect(fn()).rejects.toThrow(expectedCode);
  }

  async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async function attemptMarkedUserUpdate(params: {
    readonly mode: 'legacy' | 'maintenance' | 'atomic';
    readonly marker: string;
    readonly jwtClaims?: string;
  }): Promise<void> {
    await resetWriteGate(params.mode, randomUUID());
    await withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(
          `select set_config('request.jwt.claims', $1, true)`,
          [params.jwtClaims ?? '{"role":"service_role"}'],
        );
        await client.query(
          `select set_config('app.presence_internal_writer', $1, true)`,
          [params.marker],
        );
        await client.query(
          `update public.users
           set current_space_id = $1
           where id = $2`,
          [spaceAId, primaryUser.id],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  it('enforces the control singleton and hides private gate tables from browser and service clients', async () => {
    // As the owner role (implicit ACL) the insert must still fail on the
    // singleton primary key, proving a second control row is impossible.
    await expect(
      asPmo(() =>
        fixtures.sql(
          `insert into private.presence_runtime_control (singleton_id, mode)
           values (true, 'legacy')`,
        ),
      ),
    ).rejects.toThrow();

    for (const table of ['presence_runtime_control', 'presence_legacy_writer_inflight']) {
      const { error: authSelectError } = await authBackedUser.client
        .schema('private')
        .from(table)
        .select('*');
      expect(authSelectError, `authenticated SELECT ${table}`).not.toBeNull();

      const { error: serviceSelectError } = await serviceClient
        .schema('private')
        .from(table)
        .select('*');
      expect(serviceSelectError, `service SELECT ${table}`).not.toBeNull();

      const { error: serviceInsertError } = await serviceClient
        .schema('private')
        .from(table)
        .insert({});
      expect(serviceInsertError, `service INSERT ${table}`).not.toBeNull();
    }
  });

  it('allows current legacy movement writes in legacy mode', async () => {
    const { error: userError } = await serviceClient
      .from('users')
      .update({ current_space_id: spaceAId })
      .eq('id', primaryUser.id);
    expect(userError).toBeNull();

    const { error: logError } = await serviceClient
      .from('space_presence_log')
      .insert({
        user_id: primaryUser.id,
        space_id: spaceAId,
        entered_at: new Date().toISOString(),
      });
    expect(logError).toBeNull();
  });

  it('drains shared gate locks before entering maintenance and then blocks later legacy writes', async () => {
    const cutoverId = randomUUID();
    const connectionA = new Client({ connectionString: LOCAL_DB_URL });
    const connectionB = new Client({ connectionString: LOCAL_DB_URL });
    await connectionA.connect();
    await connectionB.connect();

    try {
      await connectionA.query('begin');
      await connectionA.query(
        `insert into public.space_presence_log (user_id, space_id, entered_at)
         values ($1, $2, pg_catalog.clock_timestamp())`,
        [primaryUser.id, spaceAId],
      );

      let maintenanceCommitted = false;
      const maintenancePromise = connectionB
        .query(`select public.enter_presence_maintenance($1)`, [cutoverId])
        .then(() => {
          maintenanceCommitted = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(maintenanceCommitted).toBe(false);

      await connectionA.query('commit');
      await maintenancePromise;
      expect(maintenanceCommitted).toBe(true);

      await expect(
        fixtures.sql(
          `insert into public.space_presence_log (user_id, space_id, entered_at)
           values ($1, $2, pg_catalog.clock_timestamp())`,
          [secondaryUser.id, spaceBId],
        ),
      ).rejects.toThrow(/PRESENCE_MAINTENANCE/);

      await asPmo(() =>
        fixtures.sql(
          `insert into private.presence_legacy_writer_inflight
             (request_id, started_at, hard_deadline)
           values (
             $1,
             pg_catalog.clock_timestamp() - interval '120 seconds',
             pg_catalog.clock_timestamp() - interval '60 seconds'
           )`,
          [randomUUID()],
        ),
      );

      await expect(
        fixtures.sql(
          `update public.users
           set current_space_id = $1
           where id = $2`,
          [spaceBId, secondaryUser.id],
        ),
      ).rejects.toThrow(/PRESENCE_MAINTENANCE/);
    } finally {
      await connectionA.query('rollback').catch(() => undefined);
      await connectionA.end();
      await connectionB.end();
    }
  });

  it('gates legacy writer ledger begin/end by runtime mode and validates completion', async () => {
    const requestId = randomUUID();
    const deadline = await beginLegacyWrite(requestId);
    const secondsOut = (deadline.getTime() - Date.now()) / 1000;
    expect(secondsOut).toBeGreaterThan(45);
    expect(secondsOut).toBeLessThanOrEqual(65);
    await expect(endLegacyWrite(requestId, 'completed')).resolves.toBe(true);

    await expect(endLegacyWrite(randomUUID(), 'completed')).resolves.toBe(false);
    await expect(endLegacyWrite(randomUUID(), 'bogus')).rejects.toThrow(
      /PRESENCE_COMPLETION_STATUS_INVALID/,
    );

    const maintenanceCutoverId = randomUUID();
    await fixtures.sql(`select public.enter_presence_maintenance($1)`, [
      maintenanceCutoverId,
    ]);
    await expectRpcCode(() => beginLegacyWrite(), 'PRESENCE_MAINTENANCE');

    await resetWriteGate('atomic', maintenanceCutoverId);
    await expectRpcCode(() => beginLegacyWrite(), 'CLIENT_UPGRADE_REQUIRED');
  });

  it('rejects authenticated marker spoofing and invalid markers while allowing reviewed maintenance repair', async () => {
    for (const mode of ['legacy', 'maintenance', 'atomic'] as const) {
      await expect(
        attemptMarkedUserUpdate({
          mode,
          marker: 'atomic-transition',
          jwtClaims: '{"role":"authenticated"}',
        }),
      ).rejects.toThrow(/PRESENCE_INTERNAL_WRITER_FORBIDDEN|PRESENCE_INTERNAL_WRITER_MODE_INVALID/);
    }

    await expect(
      attemptMarkedUserUpdate({
        mode: 'atomic',
        marker: 'not-a-reviewed-writer',
      }),
    ).rejects.toThrow(/PRESENCE_INTERNAL_WRITER_INVALID/);

    await resetWriteGate('legacy', null);
    await fixtures.sql(
      `update public.users
       set current_space_id = $1
       where id = $2`,
      [spaceAId, primaryUser.id],
    );
    await fixtures.sql(
      `insert into public.space_presence_log (user_id, space_id, entered_at)
       values ($1, $2, pg_catalog.clock_timestamp() - interval '5 minutes'),
              ($1, $3, pg_catalog.clock_timestamp() - interval '1 minute')`,
      [primaryUser.id, spaceAId, spaceBId],
    );
    const cutoverId = randomUUID();
    await fixtures.sql(`select public.enter_presence_maintenance($1)`, [cutoverId]);
    const [repair] = await fixtures.sql<RepairResult>(
      `select * from public.repair_presence_logs_for_cutover($1)`,
      [cutoverId],
    );
    expect(repair?.repaired_rows).toBeGreaterThan(0);
    expect(repair?.after_duplicate_users).toBe(0);
    expect(repair?.after_mismatched_rows).toBe(0);
  });

  it('repairs duplicate and mismatched open space presence logs for the active cutover', async () => {
    await fixtures.sql(
      `update public.users
       set current_space_id = case
         when id = $1 then $2::uuid
         when id = $3 then $4::uuid
         else current_space_id
       end
       where id in ($1, $3)`,
      [primaryUser.id, spaceAId, secondaryUser.id, spaceBId],
    );

    await fixtures.sql(
      `insert into public.space_presence_log (user_id, space_id, entered_at)
       values
         ($1, $2, pg_catalog.clock_timestamp() - interval '5 minutes'),
         ($1, $3, pg_catalog.clock_timestamp() - interval '1 minute'),
         ($4, $5, pg_catalog.clock_timestamp() - interval '2 minutes')`,
      [primaryUser.id, spaceAId, spaceBId, secondaryUser.id, spaceCId],
    );

    const cutoverId = randomUUID();
    await fixtures.sql(`select public.enter_presence_maintenance($1)`, [cutoverId]);
    const [repair] = await fixtures.sql<RepairResult>(
      `select * from public.repair_presence_logs_for_cutover($1)`,
      [cutoverId],
    );

    expect(repair?.before_open_rows).toBe(3);
    expect(repair?.before_duplicate_users).toBe(1);
    expect(repair?.before_mismatched_rows).toBe(2);
    expect(repair?.after_duplicate_users).toBe(0);
    expect(repair?.after_mismatched_rows).toBe(0);

    const [closed] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.space_presence_log
       where user_id in ($1, $2)
         and exited_at is not null
         and exited_at >= entered_at`,
      [primaryUser.id, secondaryUser.id],
    );
    expect(Number(closed?.count)).toBeGreaterThanOrEqual(3);
  });

  it('activates atomic mode only after index/readiness checks and then rejects marker-less DML', async () => {
    const cutoverId = randomUUID();
    await fixtures.sql(`select public.enter_presence_maintenance($1)`, [cutoverId]);
    await expect(
      fixtures.sql(`select public.activate_atomic_presence_writer($1)`, [cutoverId]),
    ).rejects.toThrow(/PRESENCE_OPEN_LOG_UNIQUE_INDEX_REQUIRED/);

    await fixtures.sql(
      `create unique index ux_space_presence_log_one_open_per_user
       on public.space_presence_log (user_id)
       where exited_at is null`,
    );

    await fixtures.sql(`select public.activate_atomic_presence_writer($1)`, [cutoverId]);
    const control = await controlRow();
    expect(control.mode).toBe('atomic');

    const { error: markerlessServiceError } = await serviceClient
      .from('users')
      .update({ current_space_id: spaceAId })
      .eq('id', primaryUser.id);
    expect(markerlessServiceError).not.toBeNull();

    await withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(
          `select set_config('app.presence_internal_writer', 'atomic-transition', true)`,
        );
        await client.query(
          `update public.users
           set current_space_id = $1
           where id = $2`,
          [spaceAId, primaryUser.id],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  it('supports atomic incident maintenance and has no function path back to legacy', async () => {
    await expect(
      fixtures.sql(`select public.enter_atomic_presence_maintenance($1, $2)`, [
        randomUUID(),
        'not atomic yet',
      ]),
    ).rejects.toThrow(/PRESENCE_ATOMIC_MAINTENANCE_REQUIRES_ATOMIC/);

    const atomicCutoverId = randomUUID();
    await resetWriteGate('atomic', atomicCutoverId);
    const maintenanceCutoverId = randomUUID();
    await fixtures.sql(`select public.enter_atomic_presence_maintenance($1, $2)`, [
      maintenanceCutoverId,
      'incident rehearsal',
    ]);

    const control = await controlRow();
    expect(control).toMatchObject({
      mode: 'maintenance',
      cutover_id: maintenanceCutoverId,
    });

    await expect(
      fixtures.sql(`select public.enter_presence_maintenance($1)`, [randomUUID()]),
    ).rejects.toThrow(/PRESENCE_MAINTENANCE_REQUIRES_LEGACY/);

    const legacyEntryFunctions = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from pg_catalog.pg_proc AS p
       join pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'enter_legacy_presence_maintenance',
           'activate_legacy_presence_writer',
           'exit_presence_maintenance'
         )`,
    );
    expect(legacyEntryFunctions[0]?.count).toBe('0');
  });

  it('catalog grants expose only the reviewed function execution surface', async () => {
    const functions = await fixtures.sql<{
      readonly function_name: string;
      readonly owner_name: string;
      readonly prosecdef: boolean;
      readonly search_path_fixed: boolean;
      readonly grants: string[];
    }>(
      `select
         p.proname as function_name,
         owner.rolname as owner_name,
         p.prosecdef,
         p.proconfig @> array['search_path=pg_catalog'] as search_path_fixed,
         COALESCE(
           array_agg(
             case
               when acl.grantee = 0 then 'PUBLIC'
               else grantee.rolname
             end || ':' || acl.privilege_type
             order by
               case
                 when acl.grantee = 0 then 'PUBLIC'
                 else grantee.rolname
               end,
               acl.privilege_type
           ) filter (where acl.grantee is not null and acl.grantee <> p.proowner),
           '{}'::text[]
         ) as grants
       from pg_catalog.pg_proc as p
       join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
       join pg_catalog.pg_roles as owner on owner.oid = p.proowner
       left join lateral pg_catalog.aclexplode(p.proacl) as acl on true
       left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
       where n.nspname = 'public'
         and p.proname in (
           'begin_legacy_presence_write',
           'end_legacy_presence_write',
           'enter_presence_maintenance',
           'enter_atomic_presence_maintenance',
           'repair_presence_logs_for_cutover',
           'activate_atomic_presence_writer'
         )
       group by p.oid, p.proname, owner.rolname
       order by p.proname`,
    );

    expect(functions).toHaveLength(6);
    const expectedGrants = new Map<string, readonly string[]>([
      ['activate_atomic_presence_writer', ['postgres:EXECUTE']],
      ['begin_legacy_presence_write', ['service_role:EXECUTE']],
      ['end_legacy_presence_write', ['service_role:EXECUTE']],
      ['enter_atomic_presence_maintenance', ['postgres:EXECUTE']],
      ['enter_presence_maintenance', ['postgres:EXECUTE']],
      ['repair_presence_logs_for_cutover', ['postgres:EXECUTE']],
    ]);

    for (const fn of functions) {
      expect(fn.owner_name, fn.function_name).toBe('presence_maintenance_owner');
      expect(fn.prosecdef, fn.function_name).toBe(true);
      expect(fn.search_path_fixed, fn.function_name).toBe(true);
      expect(fn.grants.sort(), fn.function_name).toEqual(
        [...(expectedGrants.get(fn.function_name) ?? [])].sort(),
      );
    }
  });
});
