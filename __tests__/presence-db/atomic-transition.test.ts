import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ensurePresenceOpenLogUniqueIndex,
  PresenceFixtures,
} from './fixtures';
import { LOCAL_DB_URL } from './setup';
import {
  createAuthedUser,
  createServiceClient,
  type AuthedUser,
} from './auth-clients';

const NS = `atomic-transition-${randomUUID()}`;

type CompanyRow = { readonly id: string };
type SpaceRow = { readonly id: string };
type UserRow = {
  readonly id: string;
  readonly supabase_uid: string;
};
type CountRow = { readonly count: string };
type RevisionState = {
  readonly location_version: number;
  readonly user_access_revision: string;
  readonly space_access_revision: string;
};
type UserPlacementRow = {
  readonly current_space_id: string | null;
  readonly location_version: number;
  readonly initial_placement_completed_at: Date | null;
};
type SessionPlacementRow = {
  readonly space_id: string | null;
  readonly placement_version: number | null;
  readonly user_access_revision: string | null;
  readonly space_access_revision: string | null;
  readonly retired_at: Date | null;
  readonly retirement_reason: string | null;
};
type TransitionResult = {
  readonly ok: boolean;
  readonly code: string;
  readonly message: string;
  readonly transition_id: string;
  readonly previous_space_id: string | null;
  readonly current_space_id: string | null;
  readonly location_version: number | null;
  readonly already_applied: boolean;
  readonly authorized_by: string | null;
};
type ObservedTransitionResult = TransitionResult & {
  readonly previous_location_version: number | null;
  readonly authorization_mode: 'public' | 'direct' | 'rejoin' | 'knock' | null;
};
type SnapshotUser = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly currentSpaceId: string | null;
  readonly locationVersion: number;
  readonly availabilityStatus: string;
  readonly isConnected: boolean;
  readonly isOccupyingCurrentSpace: boolean;
  readonly displayStatus: string;
  readonly statusMessage: string | null;
  readonly lastActive?: unknown;
};
type PresenceSnapshot = {
  readonly serverTime: string;
  readonly companyId: string;
  readonly viewerUserId: string;
  readonly currentUser: {
    readonly initialPlacementCompletedAt: string | null;
  };
  readonly users: SnapshotUser[];
};

describe('presence-db atomic transition', () => {
  let fixtures: PresenceFixtures;
  let serviceClient: ReturnType<typeof createServiceClient>;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    serviceClient = createServiceClient();
  });

  beforeEach(async () => {
    await resetRuntimeMode('legacy', null);
    await fixtures.sql(
      `drop index if exists public.ux_space_presence_log_one_open_per_user`,
    );
    await cleanupNamespacedRows();
  });

  afterAll(async () => {
    if (fixtures) {
      try {
        await resetRuntimeMode('legacy', null);
        await cleanupNamespacedRows();
      } finally {
        try {
          await ensurePresenceOpenLogUniqueIndex(fixtures);
        } finally {
          await fixtures.end();
        }
      }
    }
  });

  async function cleanupNamespacedRows(): Promise<void> {
    const tag = `%::${NS}%`;
    await fixtures.sql(
      `delete from public.knock_requests
       where requester_id in (select id from public.users where email like $1)
          or responder_id in (select id from public.users where email like $1)
          or space_id in (select id from public.spaces where name like $1)`,
      [tag],
    );
    await fixtures.sql(
      `delete from public.location_transition_requests
       where user_id in (select id from public.users where email like $1)`,
      [tag],
    );
    await fixtures.sql(
      `delete from public.user_presence_sessions
       where user_id in (select id from public.users where email like $1)
          or space_id in (select id from public.spaces where name like $1)`,
      [tag],
    );
    await fixtures.sql(
      `delete from public.revoked_presence_auth_sessions
       where user_id in (select id from public.users where email like $1)`,
      [tag],
    );
    await fixtures.sql(
      `delete from public.space_presence_log
       where user_id in (select id from public.users where email like $1)
          or space_id in (select id from public.spaces where name like $1)`,
      [tag],
    );
    await fixtures.sql(
      `update public.users
       set current_space_id = null
       where current_space_id in (
         select id from public.spaces where name like $1
       )`,
      [tag],
    );
    await fixtures.sql(`delete from public.users where email like $1`, [tag]);
    await fixtures.sql(`delete from public.spaces where name like $1`, [tag]);
    await fixtures.sql(`delete from public.companies where name like $1`, [tag]);
  }

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

  async function resetRuntimeMode(
    mode: 'legacy' | 'maintenance' | 'atomic',
    cutoverId: string | null,
  ): Promise<void> {
    await asPmo(() =>
      fixtures.sql(
        `update private.presence_runtime_control
         set mode = $1,
             cutover_id = $2,
             changed_at = pg_catalog.clock_timestamp(),
             changed_by = 'atomic-transition-test',
             legacy_adapter_enabled = true,
             legacy_adapter_disabled_at = null
         where singleton_id`,
        [mode, cutoverId],
      ),
    );
  }

  async function activateAtomic(): Promise<void> {
    await fixtures.sql(
      `create unique index if not exists ux_space_presence_log_one_open_per_user
       on public.space_presence_log (user_id)
       where exited_at is null`,
    );
    await resetRuntimeMode('atomic', randomUUID());
  }

  async function createCompany(key: string): Promise<string> {
    const [company] = await fixtures.sql<CompanyRow>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [`phase3-atomic-${key}::${NS}`],
    );
    if (!company) throw new Error(`Failed to create company ${key}`);
    return company.id;
  }

  async function createSpace(
    companyId: string,
    key: string,
    opts: {
      readonly status?: string;
      readonly capacity?: number;
      readonly accessControl?: unknown;
    } = {},
  ): Promise<string> {
    const [space] = await fixtures.sql<SpaceRow>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values (
         $1,
         $2,
         'workspace'::public.space_type,
         $3::public.space_status,
         $4,
         $5::jsonb
       )
       returning id`,
      [
        companyId,
        `phase3-atomic-${key}-${randomUUID()}::${NS}`,
        opts.status ?? 'active',
        opts.capacity ?? 10,
        JSON.stringify(opts.accessControl ?? { isPublic: true }),
      ],
    );
    if (!space) throw new Error(`Failed to create space ${key}`);
    return space.id;
  }

  async function createPlainUser(
    companyId: string,
    key: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<UserRow> {
    const supabaseUid = randomUUID();
    const [user] = await fixtures.sql<UserRow>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, $3, $4, $5::public.user_role)
       returning id, supabase_uid`,
      [
        supabaseUid,
        `phase3-atomic-${key}-${randomUUID()}::${NS}@example.test`,
        `Phase 3 Atomic ${key}`,
        companyId,
        role,
      ],
    );
    if (!user) throw new Error(`Failed to create user ${key}`);
    return user;
  }

  async function revisionState(
    userId: string,
    spaceId: string,
  ): Promise<RevisionState> {
    const [row] = await fixtures.sql<RevisionState>(
      `select
         u.location_version,
         u.presence_access_revision as user_access_revision,
         sp.presence_access_revision as space_access_revision
       from public.users as u
       join public.spaces as sp on sp.id = $2
       where u.id = $1`,
      [userId, spaceId],
    );
    if (!row) throw new Error('Failed to read revision state');
    return row;
  }

  async function seedSession(opts: {
    readonly companyId: string;
    readonly userId: string;
    readonly authSessionId: string;
    readonly targetSpaceId?: string | null;
    readonly placementVersion?: number | null;
    readonly userAccessRevision?: string | null;
    readonly spaceAccessRevision?: string | null;
    readonly expiresAtSql?: string;
    readonly retiredAtSql?: string | null;
    readonly retirementReason?: string | null;
  }): Promise<string> {
    const [row] = await fixtures.sql<{ readonly id: string }>(
      `insert into public.user_presence_sessions
         (
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
           expires_at,
           retired_at,
           retirement_reason
         )
       values (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         pg_catalog.clock_timestamp() - interval '5 seconds',
         pg_catalog.clock_timestamp() - interval '5 seconds',
         ${opts.expiresAtSql ?? "pg_catalog.clock_timestamp() + interval '90 seconds'"},
         ${opts.retiredAtSql ?? 'null'},
         $9
       )
       returning id`,
      [
        randomUUID(),
        opts.userId,
        opts.authSessionId,
        opts.companyId,
        opts.targetSpaceId ?? null,
        opts.placementVersion ?? null,
        opts.userAccessRevision ?? null,
        opts.spaceAccessRevision ?? null,
        opts.retirementReason ?? null,
      ],
    );
    if (!row) throw new Error('Failed to seed presence session');
    return row.id;
  }

  async function seedPlacedUser(opts: {
    readonly companyId: string;
    readonly userId: string;
    readonly spaceId: string;
    readonly authSessionId: string;
    readonly openLog?: boolean;
  }): Promise<string> {
    await fixtures.sql(
      `update public.users
       set current_space_id = $1,
           location_version = location_version + 1
       where id = $2`,
      [opts.spaceId, opts.userId],
    );
    const state = await revisionState(opts.userId, opts.spaceId);
    const sessionId = await seedSession({
      companyId: opts.companyId,
      userId: opts.userId,
      authSessionId: opts.authSessionId,
      targetSpaceId: opts.spaceId,
      placementVersion: state.location_version,
      userAccessRevision: state.user_access_revision,
      spaceAccessRevision: state.space_access_revision,
    });
    if (opts.openLog) {
      await fixtures.sql(
        `insert into public.space_presence_log
           (user_id, space_id, entered_at, session_type, context)
         values (
           $1,
           $2,
           pg_catalog.clock_timestamp() - interval '1 minute',
           'workspace'::public.session_type_enum,
           'seeded'
         )`,
        [opts.userId, opts.spaceId],
      );
    }
    return sessionId;
  }

  async function transition(params: {
    readonly userId: string | null;
    readonly authSessionId: string | null;
    readonly sessionId: string | null;
    readonly transitionId?: string;
    readonly targetSpaceId: string | null;
    readonly reason: string;
    readonly knockRequestId?: string | null;
    readonly expectedLocationVersion?: number | null;
  }): Promise<TransitionResult> {
    const { data, error } = await serviceClient.rpc('transition_user_location', {
      p_user_id: params.userId,
      p_auth_session_id: params.authSessionId,
      p_session_id: params.sessionId,
      p_transition_id: params.transitionId ?? randomUUID(),
      p_target_space_id: params.targetSpaceId,
      p_reason: params.reason,
      p_knock_request_id: params.knockRequestId ?? null,
      p_expected_location_version: params.expectedLocationVersion ?? null,
    });
    if (error) {
      throw new Error(`transition_user_location failed: ${error.message}`);
    }
    const rows = data as TransitionResult[] | TransitionResult;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error('transition_user_location returned no row');
    return row;
  }

  async function observedTransition(params: {
    readonly userId: string;
    readonly authSessionId: string;
    readonly sessionId: string;
    readonly transitionId: string;
    readonly targetSpaceId: string | null;
    readonly reason: string;
    readonly expectedLocationVersion: number | null;
  }): Promise<ObservedTransitionResult> {
    const { data, error } = await serviceClient.rpc(
      'transition_user_location_observed',
      {
        p_user_id: params.userId,
        p_auth_session_id: params.authSessionId,
        p_session_id: params.sessionId,
        p_transition_id: params.transitionId,
        p_target_space_id: params.targetSpaceId,
        p_reason: params.reason,
        p_knock_request_id: null,
        p_expected_location_version: params.expectedLocationVersion,
      },
    );
    if (error) {
      throw new Error(
        `transition_user_location_observed failed: ${error.message}`,
      );
    }
    const rows = data as ObservedTransitionResult[] | ObservedTransitionResult;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error('transition_user_location_observed returned no row');
    return row;
  }

  async function getSnapshot(viewerUserId: string): Promise<PresenceSnapshot> {
    const { data, error } = await serviceClient.rpc(
      'get_company_presence_snapshot',
      { p_viewer_user_id: viewerUserId },
    );
    if (error) {
      throw new Error(`get_company_presence_snapshot failed: ${error.message}`);
    }
    return data as PresenceSnapshot;
  }

  async function transitionRowCount(
    userId: string,
    transitionId: string,
  ): Promise<number> {
    const [row] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.location_transition_requests
       where user_id = $1
         and transition_id = $2`,
      [userId, transitionId],
    );
    return Number(row?.count ?? '0');
  }

  async function userPlacement(userId: string): Promise<UserPlacementRow> {
    const [row] = await fixtures.sql<UserPlacementRow>(
      `select current_space_id, location_version, initial_placement_completed_at
       from public.users
       where id = $1`,
      [userId],
    );
    if (!row) throw new Error('Missing user placement row');
    return row;
  }

  async function sessionPlacement(sessionId: string): Promise<SessionPlacementRow> {
    const [row] = await fixtures.sql<SessionPlacementRow>(
      `select
         space_id,
         placement_version,
         user_access_revision,
         space_access_revision,
         retired_at,
         retirement_reason
       from public.user_presence_sessions
       where id = $1`,
      [sessionId],
    );
    if (!row) throw new Error('Missing session row');
    return row;
  }

  async function seedApprovedKnock(opts: {
    readonly id?: string;
    readonly requesterId: string;
    readonly responderId: string;
    readonly spaceId: string;
    readonly requesterLocationVersion?: number;
    readonly expiresAtSql?: string;
  }): Promise<string> {
    const knockId = opts.id ?? randomUUID();
    const [state] = await fixtures.sql<{
      readonly company_id: string;
      readonly requester_location_version: number;
      readonly requester_access_revision: string;
      readonly space_access_revision: string;
      readonly responder_access_revision: string;
    }>(
      `select
         requester.company_id,
         requester.location_version as requester_location_version,
         requester.presence_access_revision as requester_access_revision,
         sp.presence_access_revision as space_access_revision,
         responder.presence_access_revision as responder_access_revision
       from public.users as requester
       join public.spaces as sp on sp.id = $2
       join public.users as responder on responder.id = $3
       where requester.id = $1`,
      [opts.requesterId, opts.spaceId, opts.responderId],
    );
    if (!state) throw new Error('Failed to read knock seed state');

    await fixtures.sql(
      `insert into public.knock_requests
         (
           id,
           space_id,
           requester_id,
           requester_name,
           responder_id,
           responder_name,
           decision,
           status,
           company_id,
           expires_at,
           requester_location_version,
           requester_access_revision,
           space_access_revision,
           responder_access_revision
         )
       values (
         $1,
         $2,
         $3,
         'Requester',
         $4,
         'Responder',
         'APPROVE',
         'approved',
         $5,
         ${opts.expiresAtSql ?? "pg_catalog.clock_timestamp() + interval '5 minutes'"},
         $6,
         $7,
         $8,
         $9
       )`,
      [
        knockId,
        opts.spaceId,
        opts.requesterId,
        opts.responderId,
        state.company_id,
        opts.requesterLocationVersion ?? state.requester_location_version,
        state.requester_access_revision,
        state.space_access_revision,
        state.responder_access_revision,
      ],
    );
    return knockId;
  }

  async function withPgClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async function waitForTransitionLockWait(): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const [row] = await fixtures.sql<CountRow>(
        `select count(*)::text as count
         from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock'
           and query ilike '%transition_user_location%'`,
      );
      if (Number(row?.count ?? '0') > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for transition_user_location lock wait');
  }

  it('returns transaction-authoritative previous version and authorization mode on replay', async () => {
    const companyId = await createCompany('observed-transition');
    const spaceId = await createSpace(companyId, 'observed-transition');
    const user = await createPlainUser(companyId, 'observed-transition');
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    const transitionId = randomUUID();

    await activateAtomic();
    const applied = await observedTransition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId,
      targetSpaceId: spaceId,
      reason: 'manual-enter',
      expectedLocationVersion: null,
    });
    expect(applied).toMatchObject({
      ok: true,
      code: 'LOCATION_UPDATED',
      previous_location_version: 0,
      location_version: 1,
      authorization_mode: 'public',
      already_applied: false,
    });

    const replay = await observedTransition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId,
      targetSpaceId: spaceId,
      reason: 'manual-enter',
      expectedLocationVersion: null,
    });
    expect(replay).toMatchObject({
      ok: true,
      previous_location_version: 0,
      location_version: 1,
      authorization_mode: 'public',
      already_applied: true,
    });

    const [ledger] = await fixtures.sql<{
      previous_location_version: number | null;
    }>(
      `select previous_location_version
       from public.location_transition_requests
       where user_id = $1 and transition_id = $2`,
      [user.id, transitionId],
    );
    expect(ledger?.previous_location_version).toBe(0);
  });

  it('returns uncached PRESENCE_MAINTENANCE in legacy mode without claiming idempotency', async () => {
    const companyId = await createCompany('legacy-mode');
    const user = await createPlainUser(companyId, 'legacy-mode-user');
    const spaceId = await createSpace(companyId, 'legacy-mode-space');
    const authSessionId = randomUUID();
    const sessionId = await seedSession({ companyId, userId: user.id, authSessionId });
    const transitionId = randomUUID();

    const result = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId,
      targetSpaceId: spaceId,
      reason: 'manual-enter',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'PRESENCE_MAINTENANCE',
      already_applied: false,
    });
    expect(await transitionRowCount(user.id, transitionId)).toBe(0);
  });

  it('rejects structural reason and parameter shape violations without a claim row', async () => {
    const companyId = await createCompany('shape');
    const user = await createPlainUser(companyId, 'shape-user');
    const spaceId = await createSpace(companyId, 'shape-space');
    const authSessionId = randomUUID();
    const sessionId = await seedSession({ companyId, userId: user.id, authSessionId });
    await activateAtomic();

    const cases: ReadonlyArray<{
      readonly name: string;
      readonly reason: string;
      readonly targetSpaceId: string | null;
      readonly sessionId?: string | null;
      readonly knockRequestId?: string | null;
      readonly expectedLocationVersion?: number | null;
    }> = [
      { name: 'unknown reason', reason: 'bogus', targetSpaceId: spaceId },
      { name: 'manual-enter missing target', reason: 'manual-enter', targetSpaceId: null },
      {
        name: 'manual-enter unexpected knock',
        reason: 'manual-enter',
        targetSpaceId: spaceId,
        knockRequestId: randomUUID(),
      },
      { name: 'manual-enter unexpected expected version', reason: 'manual-enter', targetSpaceId: spaceId, expectedLocationVersion: 0 },
      { name: 'manual-leave unexpected target', reason: 'manual-leave', targetSpaceId: spaceId },
      { name: 'manual-leave unexpected knock', reason: 'manual-leave', targetSpaceId: null, knockRequestId: randomUUID() },
      { name: 'logout unexpected target', reason: 'logout', targetSpaceId: spaceId, sessionId: null },
      { name: 'logout unexpected knock', reason: 'logout', targetSpaceId: null, sessionId: null, knockRequestId: randomUUID() },
      { name: 'knock-enter missing target', reason: 'knock-enter', targetSpaceId: null, knockRequestId: randomUUID(), expectedLocationVersion: 0 },
      { name: 'knock-enter missing knock', reason: 'knock-enter', targetSpaceId: spaceId, expectedLocationVersion: 0 },
      { name: 'auto-first missing expected', reason: 'auto-first-placement', targetSpaceId: spaceId },
      { name: 'auto-rejoin negative expected', reason: 'auto-rejoin', targetSpaceId: spaceId, expectedLocationVersion: -1 },
      { name: 'auto-fallback missing target', reason: 'auto-fallback', targetSpaceId: null, expectedLocationVersion: 0 },
      { name: 'teleport missing target', reason: 'teleport-accept', targetSpaceId: null },
      { name: 'non-logout missing session', reason: 'manual-enter', targetSpaceId: spaceId, sessionId: null },
    ];

    for (const testCase of cases) {
      const transitionId = randomUUID();
      const result = await transition({
        userId: user.id,
        authSessionId,
        sessionId: testCase.sessionId === undefined ? sessionId : testCase.sessionId,
        transitionId,
        targetSpaceId: testCase.targetSpaceId,
        reason: testCase.reason,
        knockRequestId: testCase.knockRequestId,
        expectedLocationVersion: testCase.expectedLocationVersion,
      });
      expect(result.code, testCase.name).toBe('INVALID_REQUEST');
      expect(await transitionRowCount(user.id, transitionId)).toBe(0);
    }
  });

  it('applies manual-enter into a public space, syncs sessions/logs, and preserves initial placement time', async () => {
    const companyId = await createCompany('manual-enter');
    const user = await createPlainUser(companyId, 'manual-enter-user');
    const spaceId = await createSpace(companyId, 'manual-enter-space');
    const authSessionId = randomUUID();
    const sessionId = await seedSession({ companyId, userId: user.id, authSessionId });
    const secondSessionId = await seedSession({ companyId, userId: user.id, authSessionId });
    await activateAtomic();

    const before = await userPlacement(user.id);
    const first = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: randomUUID(),
      targetSpaceId: spaceId,
      reason: 'manual-enter',
    });

    expect(first).toMatchObject({
      ok: true,
      code: 'LOCATION_UPDATED',
      previous_space_id: null,
      current_space_id: spaceId,
      location_version: before.location_version + 1,
      already_applied: false,
    });

    const afterFirst = await userPlacement(user.id);
    expect(afterFirst.current_space_id).toBe(spaceId);
    expect(afterFirst.location_version).toBe(before.location_version + 1);
    expect(afterFirst.initial_placement_completed_at).not.toBeNull();

    for (const id of [sessionId, secondSessionId]) {
      await expect(sessionPlacement(id)).resolves.toMatchObject({
        space_id: spaceId,
        placement_version: first.location_version,
      });
    }

    const [openLogs] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.space_presence_log
       where user_id = $1
         and space_id = $2
         and exited_at is null`,
      [user.id, spaceId],
    );
    expect(openLogs?.count).toBe('1');

    const second = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: randomUUID(),
      targetSpaceId: spaceId,
      reason: 'manual-enter',
    });
    expect(second.code).toBe('LOCATION_UNCHANGED');
    expect(second.location_version).toBe(before.location_version + 2);

    const afterSecond = await userPlacement(user.id);
    expect(afterSecond.initial_placement_completed_at?.toISOString()).toBe(
      afterFirst.initial_placement_completed_at?.toISOString(),
    );
  });

  it('does not short-circuit same-target authorization after access changes', async () => {
    const companyId = await createCompany('same-target');
    const user = await createPlainUser(companyId, 'same-target-user');
    const spaceId = await createSpace(companyId, 'same-target-space');
    const authSessionId = randomUUID();
    const sessionId = await seedSession({ companyId, userId: user.id, authSessionId });
    await activateAtomic();

    await expect(
      transition({
        userId: user.id,
        authSessionId,
        sessionId,
        transitionId: randomUUID(),
        targetSpaceId: spaceId,
        reason: 'manual-enter',
      }),
    ).resolves.toMatchObject({ code: 'LOCATION_UPDATED' });

    await fixtures.sql(
      `update public.spaces
       set access_control = '{"isPublic": false}'::jsonb
       where id = $1`,
      [spaceId],
    );

    const denied = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: randomUUID(),
      targetSpaceId: spaceId,
      reason: 'manual-enter',
    });
    expect(denied).toMatchObject({
      ok: false,
      code: 'SPACE_ACCESS_DENIED',
      already_applied: false,
    });
  });

  it('clears placement on manual-leave while keeping retained leases connected', async () => {
    const companyId = await createCompany('manual-leave');
    const user = await createPlainUser(companyId, 'manual-leave-user');
    const spaceId = await createSpace(companyId, 'manual-leave-space');
    const authSessionId = randomUUID();
    const sessionId = await seedPlacedUser({
      companyId,
      userId: user.id,
      spaceId,
      authSessionId,
      openLog: true,
    });
    const before = await userPlacement(user.id);
    await activateAtomic();

    const result = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: randomUUID(),
      targetSpaceId: null,
      reason: 'manual-leave',
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'LOCATION_UPDATED',
      previous_space_id: spaceId,
      current_space_id: null,
      location_version: before.location_version + 1,
    });
    await expect(userPlacement(user.id)).resolves.toMatchObject({
      current_space_id: null,
      location_version: before.location_version + 1,
    });
    await expect(sessionPlacement(sessionId)).resolves.toMatchObject({
      space_id: null,
      placement_version: null,
      retired_at: null,
    });

    const [openLogs] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.space_presence_log
       where user_id = $1
         and exited_at is null`,
      [user.id],
    );
    expect(openLogs?.count).toBe('0');
  });

  it('replays exact transition IDs and rejects conflicting fingerprints', async () => {
    const companyId = await createCompany('replay');
    const user = await createPlainUser(companyId, 'replay-user');
    const spaceAId = await createSpace(companyId, 'replay-space-a');
    const spaceBId = await createSpace(companyId, 'replay-space-b');
    const authSessionId = randomUUID();
    const otherAuthSessionId = randomUUID();
    const sessionId = await seedSession({ companyId, userId: user.id, authSessionId });
    const transitionId = randomUUID();
    await activateAtomic();

    const first = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId,
      targetSpaceId: spaceAId,
      reason: 'manual-enter',
    });
    const replay = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId,
      targetSpaceId: spaceAId,
      reason: 'manual-enter',
    });

    expect(replay).toMatchObject({
      ok: first.ok,
      code: first.code,
      previous_space_id: first.previous_space_id,
      current_space_id: first.current_space_id,
      location_version: first.location_version,
      already_applied: true,
    });

    const afterReplay = await userPlacement(user.id);
    expect(afterReplay.location_version).toBe(first.location_version);

    const conflict = await transition({
      userId: user.id,
      authSessionId: otherAuthSessionId,
      sessionId,
      transitionId,
      targetSpaceId: spaceBId,
      reason: 'manual-enter',
    });
    expect(conflict).toMatchObject({
      ok: false,
      code: 'IDEMPOTENCY_CONFLICT',
      already_applied: false,
    });

    // Handoff step 4: a STORED replay returns its result in ANY runtime mode
    // (e.g. exact logout replay during a maintenance window) — only newly
    // claimed commands are rejected with PRESENCE_MAINTENANCE.
    await resetRuntimeMode('legacy', null);
    const replayInLegacy = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId,
      targetSpaceId: spaceAId,
      reason: 'manual-enter',
    });
    expect(replayInLegacy).toMatchObject({
      ok: first.ok,
      code: first.code,
      location_version: first.location_version,
      already_applied: true,
    });
  });

  it('stores SPACE_FULL when capacity is reached by a valid active occupant session', async () => {
    const companyId = await createCompany('capacity');
    const occupant = await createPlainUser(companyId, 'capacity-occupant');
    const mover = await createPlainUser(companyId, 'capacity-mover');
    const spaceId = await createSpace(companyId, 'capacity-space', { capacity: 1 });
    const moverAuthSessionId = randomUUID();
    const occupantAuthSessionId = randomUUID();
    const moverSessionId = await seedSession({
      companyId,
      userId: mover.id,
      authSessionId: moverAuthSessionId,
    });
    await seedPlacedUser({
      companyId,
      userId: occupant.id,
      spaceId,
      authSessionId: occupantAuthSessionId,
    });
    const transitionId = randomUUID();
    await activateAtomic();

    const result = await transition({
      userId: mover.id,
      authSessionId: moverAuthSessionId,
      sessionId: moverSessionId,
      transitionId,
      targetSpaceId: spaceId,
      reason: 'manual-enter',
    });
    expect(result).toMatchObject({ ok: false, code: 'SPACE_FULL' });

    const [stored] = await fixtures.sql<{ readonly code: string | null }>(
      `select result ->> 'code' as code
       from public.location_transition_requests
       where user_id = $1
         and transition_id = $2`,
      [mover.id, transitionId],
    );
    expect(stored?.code).toBe('SPACE_FULL');
  });

  it('evaluates public, restricted, and malformed access_control branches', async () => {
    const companyId = await createCompany('access-control');
    await activateAtomic();

    async function attemptAccess(
      key: string,
      accessControl: unknown,
      expectedCode: string,
      mutateAccessControl?: (user: UserRow) => unknown,
    ): Promise<void> {
      const user = await createPlainUser(companyId, key);
      const finalAccessControl = mutateAccessControl
        ? mutateAccessControl(user)
        : accessControl;
      const spaceId = await createSpace(companyId, key, {
        accessControl: finalAccessControl,
      });
      const authSessionId = randomUUID();
      const sessionId = await seedSession({ companyId, userId: user.id, authSessionId });

      await expect(
        transition({
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId: randomUUID(),
          targetSpaceId: spaceId,
          reason: 'manual-enter',
        }),
      ).resolves.toMatchObject({ code: expectedCode });
    }

    await attemptAccess('empty-public', {}, 'LOCATION_UPDATED');
    await attemptAccess(
      'allowed-user',
      null,
      'LOCATION_UPDATED',
      (user) => ({ isPublic: false, allowedUsers: [user.id] }),
    );
    await attemptAccess('denied-private', { isPublic: false }, 'SPACE_ACCESS_DENIED');
    await attemptAccess(
      'malformed-string',
      { isPublic: 'yes' },
      'SPACE_ACCESS_CONFIGURATION_INVALID',
    );
    await attemptAccess(
      'malformed-missing',
      { allowedUsers: [] },
      'SPACE_ACCESS_CONFIGURATION_INVALID',
    );
  });

  it('consumes valid knock-enter grants and stores typed knock terminal results', async () => {
    const companyId = await createCompany('knock-enter');
    await activateAtomic();

    async function setupKnockCase(key: string): Promise<{
      readonly requester: UserRow;
      readonly responder: UserRow;
      readonly spaceId: string;
      readonly authSessionId: string;
      readonly sessionId: string;
      readonly expectedVersion: number;
    }> {
      const requester = await createPlainUser(companyId, `${key}-requester`);
      const responder = await createPlainUser(companyId, `${key}-responder`);
      const spaceId = await createSpace(companyId, `${key}-space`, {
        accessControl: { isPublic: false },
      });
      const authSessionId = randomUUID();
      const sessionId = await seedSession({
        companyId,
        userId: requester.id,
        authSessionId,
      });
      const state = await revisionState(requester.id, spaceId);
      return {
        requester,
        responder,
        spaceId,
        authSessionId,
        sessionId,
        expectedVersion: state.location_version,
      };
    }

    const happy = await setupKnockCase('happy');
    const knockId = await seedApprovedKnock({
      requesterId: happy.requester.id,
      responderId: happy.responder.id,
      spaceId: happy.spaceId,
    });
    const transitionId = randomUUID();
    const first = await transition({
      userId: happy.requester.id,
      authSessionId: happy.authSessionId,
      sessionId: happy.sessionId,
      transitionId,
      targetSpaceId: happy.spaceId,
      reason: 'knock-enter',
      knockRequestId: knockId,
      expectedLocationVersion: happy.expectedVersion,
    });
    expect(first).toMatchObject({
      ok: true,
      code: 'LOCATION_UPDATED',
      authorized_by: happy.responder.id,
    });
    const [consumed] = await fixtures.sql<{
      readonly status: string;
      readonly consumed_at: Date | null;
    }>(
      `select status, consumed_at
       from public.knock_requests
       where id = $1`,
      [knockId],
    );
    expect(consumed).toMatchObject({ status: 'consumed' });
    expect(consumed?.consumed_at).not.toBeNull();

    await expect(
      transition({
        userId: happy.requester.id,
        authSessionId: happy.authSessionId,
        sessionId: happy.sessionId,
        transitionId,
        targetSpaceId: happy.spaceId,
        reason: 'knock-enter',
        knockRequestId: knockId,
        expectedLocationVersion: happy.expectedVersion,
      }),
    ).resolves.toMatchObject({ code: 'LOCATION_UPDATED', already_applied: true });

    const stale = await setupKnockCase('stale');
    await fixtures.sql(
      `update public.users
       set location_version = location_version + 1
       where id = $1`,
      [stale.requester.id],
    );
    const staleCurrent = await userPlacement(stale.requester.id);
    const staleKnockId = await seedApprovedKnock({
      requesterId: stale.requester.id,
      responderId: stale.responder.id,
      spaceId: stale.spaceId,
      requesterLocationVersion: staleCurrent.location_version - 1,
    });
    await expect(
      transition({
        userId: stale.requester.id,
        authSessionId: stale.authSessionId,
        sessionId: stale.sessionId,
        transitionId: randomUUID(),
        targetSpaceId: stale.spaceId,
        reason: 'knock-enter',
        knockRequestId: staleKnockId,
        expectedLocationVersion: staleCurrent.location_version,
      }),
    ).resolves.toMatchObject({ ok: false, code: 'KNOCK_SUPERSEDED' });

    const expired = await setupKnockCase('expired');
    const expiredKnockId = await seedApprovedKnock({
      requesterId: expired.requester.id,
      responderId: expired.responder.id,
      spaceId: expired.spaceId,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '1 second'",
    });
    await expect(
      transition({
        userId: expired.requester.id,
        authSessionId: expired.authSessionId,
        sessionId: expired.sessionId,
        transitionId: randomUUID(),
        targetSpaceId: expired.spaceId,
        reason: 'knock-enter',
        knockRequestId: expiredKnockId,
        expectedLocationVersion: expired.expectedVersion,
      }),
    ).resolves.toMatchObject({ ok: false, code: 'KNOCK_EXPIRED' });

    const consumedRace = await setupKnockCase('consumed');
    const consumedKnockId = await seedApprovedKnock({
      requesterId: consumedRace.requester.id,
      responderId: consumedRace.responder.id,
      spaceId: consumedRace.spaceId,
    });
    await withPgClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(
          `select id
           from public.users
           where id = $1
           for no key update`,
          [consumedRace.requester.id],
        );
        const blockedTransition = transition({
          userId: consumedRace.requester.id,
          authSessionId: consumedRace.authSessionId,
          sessionId: consumedRace.sessionId,
          transitionId: randomUUID(),
          targetSpaceId: consumedRace.spaceId,
          reason: 'knock-enter',
          knockRequestId: consumedKnockId,
          expectedLocationVersion: consumedRace.expectedVersion,
        });
        await waitForTransitionLockWait();
        await client.query(
          `select set_config('app.presence_internal_writer', 'atomic-transition', true)`,
        );
        await client.query(
          `update public.knock_requests
           set status = 'consumed',
               consumed_at = pg_catalog.clock_timestamp(),
               updated_at = pg_catalog.clock_timestamp()
           where id = $1`,
          [consumedKnockId],
        );
        await client.query('commit');
        await expect(blockedTransition).resolves.toMatchObject({
          ok: false,
          code: 'KNOCK_ALREADY_CONSUMED',
        });
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  it('rolls back movement, log, session, idempotency, and grant under same-connection pg_temp knock failure injection', async () => {
    const companyId = await createCompany('knock-consume-failure');
    const requester = await createPlainUser(companyId, 'knock-failure-requester');
    const responder = await createPlainUser(companyId, 'knock-failure-responder');
    const spaceId = await createSpace(companyId, 'knock-failure-space', {
      accessControl: { isPublic: false },
    });
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: requester.id,
      authSessionId,
    });
    const expectedVersion = (await revisionState(requester.id, spaceId)).location_version;
    const knockId = await seedApprovedKnock({
      requesterId: requester.id,
      responderId: responder.id,
      spaceId,
    });
    const transitionId = randomUUID();
    const beforeUser = await userPlacement(requester.id);
    const beforeSession = await sessionPlacement(sessionId);
    await activateAtomic();

    await fixtures.sql('begin');
    try {
      await fixtures.sql(
        `create or replace function pg_temp.fail_fixture_knock_consume()
         returns trigger
         language plpgsql
         as $function$
         begin
           if old.id = tg_argv[0] and new.status = 'consumed' then
             raise exception 'forced fixture knock-consume failure';
           end if;
           return new;
         end
         $function$;

         create trigger fixture_knock_consume_failure
         before update on public.knock_requests
         for each row
         execute function pg_temp.fail_fixture_knock_consume('${knockId}')`,
      );
      await fixtures.sql('savepoint before_injected_knock_transition');

      await expect(
        fixtures.sql(
          `select *
           from public.transition_user_location(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             'knock-enter'::text,
             $6::text,
             $7::integer
           )`,
          [
            requester.id,
            authSessionId,
            sessionId,
            transitionId,
            spaceId,
            knockId,
            expectedVersion,
          ],
        ),
      ).rejects.toThrow(/forced fixture knock-consume failure/i);
      await fixtures.sql('rollback to savepoint before_injected_knock_transition');

      await expect(userPlacement(requester.id)).resolves.toEqual(beforeUser);
      await expect(sessionPlacement(sessionId)).resolves.toEqual(beforeSession);
      expect(await transitionRowCount(requester.id, transitionId)).toBe(0);
      const [openLog] = await fixtures.sql<CountRow>(
        `select count(*)::text as count
         from public.space_presence_log
         where user_id = $1 and exited_at is null`,
        [requester.id],
      );
      expect(openLog?.count).toBe('0');
      const [knock] = await fixtures.sql<{
        readonly status: string;
        readonly consumed_at: Date | null;
      }>(
        `select status, consumed_at
         from public.knock_requests
         where id = $1`,
        [knockId],
      );
      expect(knock).toEqual({ status: 'approved', consumed_at: null });
    } catch (error) {
      await fixtures.sql('rollback').catch(() => undefined);
      throw error;
    }
    await fixtures.sql('rollback');
  });

  it('returns uncached SESSION_INVALID for expired, retired, and mismatched-auth leases', async () => {
    const companyId = await createCompany('session-invalid');
    const spaceId = await createSpace(companyId, 'session-invalid-space');
    await activateAtomic();

    const cases: ReadonlyArray<{
      readonly key: string;
      readonly expiresAtSql?: string;
      readonly retiredAtSql?: string | null;
      readonly retirementReason?: string | null;
      readonly callAuthSessionOverride?: string;
    }> = [
      {
        key: 'expired',
        expiresAtSql: "pg_catalog.clock_timestamp() - interval '1 second'",
      },
      {
        key: 'retired',
        retiredAtSql: "pg_catalog.clock_timestamp() - interval '1 second'",
        retirementReason: 'explicit-disconnect',
      },
      {
        key: 'mismatched-auth',
        callAuthSessionOverride: randomUUID(),
      },
    ];

    for (const testCase of cases) {
      const user = await createPlainUser(companyId, testCase.key);
      const storedAuthSessionId = randomUUID();
      const sessionId = await seedSession({
        companyId,
        userId: user.id,
        authSessionId: storedAuthSessionId,
        expiresAtSql: testCase.expiresAtSql,
        retiredAtSql: testCase.retiredAtSql,
        retirementReason: testCase.retirementReason,
      });
      const authSessionId = testCase.callAuthSessionOverride ?? storedAuthSessionId;
      const transitionId = randomUUID();
      const result = await transition({
        userId: user.id,
        authSessionId,
        sessionId,
        transitionId,
        targetSpaceId: spaceId,
        reason: 'manual-enter',
      });
      expect(result.code, testCase.key).toBe('SESSION_INVALID');
      expect(await transitionRowCount(user.id, transitionId)).toBe(0);
    }
  });

  it('fences logout auth sessions, preserves another active auth session, and replays across the fence', async () => {
    const companyId = await createCompany('logout');
    const user = await createPlainUser(companyId, 'logout-user');
    const spaceId = await createSpace(companyId, 'logout-space');
    const logoutAuthSessionId = randomUUID();
    const retainedAuthSessionId = randomUUID();
    const logoutSessionId = await seedPlacedUser({
      companyId,
      userId: user.id,
      spaceId,
      authSessionId: logoutAuthSessionId,
      openLog: true,
    });
    const state = await revisionState(user.id, spaceId);
    const retainedSessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId: retainedAuthSessionId,
      targetSpaceId: spaceId,
      placementVersion: state.location_version,
      userAccessRevision: state.user_access_revision,
      spaceAccessRevision: state.space_access_revision,
    });
    const before = await userPlacement(user.id);
    const transitionId = randomUUID();
    await activateAtomic();

    const first = await transition({
      userId: user.id,
      authSessionId: logoutAuthSessionId,
      sessionId: null,
      transitionId,
      targetSpaceId: null,
      reason: 'logout',
    });
    expect(first).toMatchObject({
      ok: true,
      code: 'LOCATION_UNCHANGED',
      current_space_id: spaceId,
      location_version: before.location_version,
    });

    const [fence] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.revoked_presence_auth_sessions
       where user_id = $1
         and auth_session_id = $2`,
      [user.id, logoutAuthSessionId],
    );
    expect(fence?.count).toBe('1');
    await expect(sessionPlacement(logoutSessionId)).resolves.toMatchObject({
      space_id: null,
      retired_at: expect.any(Date),
      retirement_reason: 'logout',
    });
    await expect(sessionPlacement(retainedSessionId)).resolves.toMatchObject({
      space_id: spaceId,
      retired_at: null,
    });
    await expect(userPlacement(user.id)).resolves.toMatchObject({
      current_space_id: spaceId,
      location_version: before.location_version,
    });

    await expect(
      transition({
        userId: user.id,
        authSessionId: logoutAuthSessionId,
        sessionId: null,
        transitionId,
        targetSpaceId: null,
        reason: 'logout',
      }),
    ).resolves.toMatchObject({ code: 'LOCATION_UNCHANGED', already_applied: true });

    const newTransitionId = randomUUID();
    await expect(
      transition({
        userId: user.id,
        authSessionId: logoutAuthSessionId,
        sessionId: null,
        transitionId: newTransitionId,
        targetSpaceId: null,
        reason: 'logout',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'AUTH_SESSION_REVOKED' });
    expect(await transitionRowCount(user.id, newTransitionId)).toBe(0);
  });

  it('returns a one-statement presence snapshot shape with connection and occupancy derivation', async () => {
    const companyId = await createCompany('snapshot');
    const spaceId = await createSpace(companyId, 'snapshot-space');
    const valid = await createPlainUser(companyId, 'snapshot-valid');
    const stale = await createPlainUser(companyId, 'snapshot-stale');
    const retired = await createPlainUser(companyId, 'snapshot-retired');
    const offline = await createPlainUser(companyId, 'snapshot-offline');

    const validAuthSessionId = randomUUID();
    const staleAuthSessionId = randomUUID();
    const retiredAuthSessionId = randomUUID();
    await seedPlacedUser({
      companyId,
      userId: valid.id,
      spaceId,
      authSessionId: validAuthSessionId,
    });

    await fixtures.sql(
      `update public.users
       set current_space_id = $1,
           location_version = location_version + 1
       where id = $2`,
      [spaceId, stale.id],
    );
    const staleState = await revisionState(stale.id, spaceId);
    await seedSession({
      companyId,
      userId: stale.id,
      authSessionId: staleAuthSessionId,
      targetSpaceId: spaceId,
      placementVersion: staleState.location_version + 100,
      userAccessRevision: staleState.user_access_revision,
      spaceAccessRevision: staleState.space_access_revision,
    });

    await seedSession({
      companyId,
      userId: retired.id,
      authSessionId: retiredAuthSessionId,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '1 second'",
      retiredAtSql: "pg_catalog.clock_timestamp() - interval '1 second'",
      retirementReason: 'expired',
    });
    await fixtures.sql(
      `update public.users
       set status = 'offline'::public.user_status
       where id = $1`,
      [offline.id],
    );

    const snapshot = await getSnapshot(valid.id);
    expect(Object.keys(snapshot).sort()).toEqual([
      'companyId',
      'currentUser',
      'serverTime',
      'users',
      'viewerUserId',
    ]);
    expect(snapshot.companyId).toBe(companyId);
    expect(snapshot.viewerUserId).toBe(valid.id);
    expect(Object.keys(snapshot.currentUser)).toEqual([
      'initialPlacementCompletedAt',
    ]);

    const ids = snapshot.users.map((user) => user.id);
    expect(ids).toEqual([...ids].sort());
    for (const user of snapshot.users) {
      expect(user).not.toHaveProperty('lastActive');
    }

    const byId = new Map(snapshot.users.map((user) => [user.id, user]));
    expect(byId.get(valid.id)).toMatchObject({
      isConnected: true,
      isOccupyingCurrentSpace: true,
      displayStatus: 'online',
    });
    expect(byId.get(stale.id)).toMatchObject({
      isConnected: true,
      isOccupyingCurrentSpace: false,
      displayStatus: 'online',
    });
    expect(byId.get(retired.id)).toMatchObject({
      isConnected: false,
      isOccupyingCurrentSpace: false,
      displayStatus: 'offline',
    });
    expect(byId.get(offline.id)).toMatchObject({
      availabilityStatus: 'online',
      isConnected: false,
      displayStatus: 'offline',
    });
  });

  it('covers the complete connectivity by availability display and occupancy matrix', async () => {
    const companyId = await createCompany('snapshot-status-matrix');
    const spaceId = await createSpace(companyId, 'snapshot-status-matrix-space');
    const statuses = ['online', 'away', 'busy', 'offline'] as const;
    const cases: Array<{
      user: UserRow;
      connected: boolean;
      rawStatus: (typeof statuses)[number];
    }> = [];

    for (const connected of [false, true]) {
      for (const rawStatus of statuses) {
        const user = await createPlainUser(
          companyId,
          `matrix-${connected ? 'connected' : 'disconnected'}-${rawStatus}`,
        );
        await fixtures.sql(
          `update public.users set status = $1::public.user_status where id = $2`,
          [rawStatus, user.id],
        );
        if (connected) {
          await seedPlacedUser({
            companyId,
            userId: user.id,
            spaceId,
            authSessionId: randomUUID(),
          });
        }
        cases.push({ user, connected, rawStatus });
      }
    }

    const viewer = cases.find((entry) => entry.connected)?.user;
    if (!viewer) throw new Error('matrix requires a connected viewer');
    const snapshot = await getSnapshot(viewer.id);
    const byId = new Map(snapshot.users.map((user) => [user.id, user]));

    for (const entry of cases) {
      const actual = byId.get(entry.user.id);
      const normalizedAvailability =
        entry.rawStatus === 'offline' ? 'online' : entry.rawStatus;
      expect(actual).toMatchObject({
        availabilityStatus: normalizedAvailability,
        isConnected: entry.connected,
        isOccupyingCurrentSpace: entry.connected,
        displayStatus: entry.connected ? normalizedAvailability : 'offline',
      });
    }
  });

  it('hardens space deletion for browser users and service-role referenced deletes', async () => {
    const companyId = await createCompany('delete');
    const authBackedUser: AuthedUser = await createAuthedUser(fixtures, NS, {
      key: `atomic-delete-${randomUUID()}`,
      companyId,
      displayName: 'Phase 3 Atomic Delete Member',
      role: 'member',
    });
    const spaceId = await createSpace(companyId, 'delete-space');
    const authSessionId = randomUUID();
    await seedPlacedUser({
      companyId,
      userId: authBackedUser.appUserId,
      spaceId,
      authSessionId,
      openLog: true,
    });

    const { error: authDeleteError } = await authBackedUser.client
      .from('spaces')
      .delete()
      .eq('id', spaceId);
    expect(authDeleteError).not.toBeNull();

    const { error: serviceDeleteError } = await serviceClient
      .from('spaces')
      .delete()
      .eq('id', spaceId);
    expect(serviceDeleteError).not.toBeNull();
    expect(serviceDeleteError?.code).toBe('23503');
  });
});
