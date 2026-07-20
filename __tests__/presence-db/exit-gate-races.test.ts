import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ensurePresenceOpenLogUniqueIndex,
  PresenceFixtures,
} from "./fixtures";
import { LOCAL_DB_URL } from "./setup";
import {
  createAuthedUser,
  createServiceClient,
  type AuthedUser,
} from "./auth-clients";
import {
  presenceConcurrencyTestName,
  standardOrHarnessIterations,
} from "./concurrency/support";

const NS = `exit-gate-races-${randomUUID()}`;
const CONCURRENCY_SOAK_ITERATIONS = (() => {
  const parsed = Number.parseInt(
    process.env.PRESENCE_SOAK_ITERATIONS ?? "50",
    10,
  );
  const standardIterations =
    Number.isSafeInteger(parsed) && parsed >= 50 && parsed <= 500 ? parsed : 50;
  return standardOrHarnessIterations(standardIterations);
})();
const REGISTER_LOGOUT_ITERATIONS = standardOrHarnessIterations(50);

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
};
type SessionPlacementRow = {
  readonly space_id: string | null;
  readonly placement_version: number | null;
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
type RegisterSuccess = {
  readonly ok: true;
  readonly sessionId: string;
  readonly companyId: string;
  readonly registrationId: string;
  readonly sessionSpaceId: string | null;
  readonly expiresAt: string;
  readonly refreshed: boolean;
};
type RegisterFailure = {
  readonly ok: false;
  readonly code:
    | "AUTH_SESSION_REVOKED"
    | "SESSION_RETIRED"
    | "REGISTRATION_CONFLICT"
    | "PRESENCE_COMPANY_SCOPE_CHANGED"
    | "USER_NOT_FOUND"
    | "NO_COMPANY";
};
type RegisterResult = RegisterSuccess | RegisterFailure;
type SnapshotUser = {
  readonly id: string;
  readonly currentSpaceId: string | null;
  readonly locationVersion: number;
  readonly isOccupyingCurrentSpace: boolean;
};
type PresenceSnapshot = {
  readonly serverTime: string;
  readonly companyId: string;
  readonly viewerUserId: string;
  readonly users: SnapshotUser[];
};

describe("presence-db Phase 3 exit-gate races", () => {
  let fixtures: PresenceFixtures;
  let serviceClient: ReturnType<typeof createServiceClient>;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    serviceClient = createServiceClient();
  });

  beforeEach(async () => {
    await fixtures.sql(
      `grant insert on table public.space_presence_log to service_role`,
    );
    await resetRuntimeMode("legacy", null);
    await fixtures.sql(
      `drop index if exists public.ux_space_presence_log_one_open_per_user`,
    );
    await cleanupNamespacedRows();
  });

  afterAll(async () => {
    if (fixtures) {
      try {
        await fixtures.sql(
          `grant insert on table public.space_presence_log to service_role`,
        );
        await resetRuntimeMode("legacy", null);
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
    await fixtures.sql(`delete from public.companies where name like $1`, [
      tag,
    ]);
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
    mode: "legacy" | "maintenance" | "atomic",
    cutoverId: string | null,
  ): Promise<void> {
    await asPmo(() =>
      fixtures.sql(
        `update private.presence_runtime_control
         set mode = $1,
             cutover_id = $2,
             changed_at = pg_catalog.clock_timestamp(),
             changed_by = 'exit-gate-races-test',
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
    await resetRuntimeMode("atomic", randomUUID());
  }

  async function createCompany(key: string): Promise<string> {
    const [company] = await fixtures.sql<CompanyRow>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [`phase3-exit-${key}::${NS}`],
    );
    if (!company) throw new Error(`Failed to create company ${key}`);
    return company.id;
  }

  async function createSpace(
    companyId: string,
    key: string,
    opts: {
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
         'active'::public.space_status,
         $3,
         $4::jsonb
       )
       returning id`,
      [
        companyId,
        `phase3-exit-${key}-${randomUUID()}::${NS}`,
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
  ): Promise<UserRow> {
    const supabaseUid = randomUUID();
    const [user] = await fixtures.sql<UserRow>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, $3, $4, 'member'::public.user_role)
       returning id, supabase_uid`,
      [
        supabaseUid,
        `phase3-exit-${key}-${randomUUID()}::${NS}@example.test`,
        `Phase 3 Exit ${key}`,
        companyId,
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
    if (!row) throw new Error("Failed to read revision state");
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
           expires_at
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
         ${opts.expiresAtSql ?? "pg_catalog.clock_timestamp() + interval '90 seconds'"}
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
      ],
    );
    if (!row) throw new Error("Failed to seed presence session");
    return row.id;
  }

  async function transition(params: {
    readonly userId: string;
    readonly authSessionId: string;
    readonly sessionId: string | null;
    readonly transitionId?: string;
    readonly targetSpaceId: string | null;
    readonly reason: string;
    readonly expectedLocationVersion?: number | null;
  }): Promise<TransitionResult> {
    const { data, error } = await serviceClient.rpc(
      "transition_user_location",
      {
        p_user_id: params.userId,
        p_auth_session_id: params.authSessionId,
        p_session_id: params.sessionId,
        p_transition_id: params.transitionId ?? randomUUID(),
        p_target_space_id: params.targetSpaceId,
        p_reason: params.reason,
        p_knock_request_id: null,
        p_expected_location_version: params.expectedLocationVersion ?? null,
      },
    );
    if (error) {
      throw new Error(`transition_user_location failed: ${error.message}`);
    }
    const rows = data as TransitionResult[] | TransitionResult;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("transition_user_location returned no row");
    return row;
  }

  async function registerSession(
    userId: string,
    authSessionId: string,
    registrationId: string,
    expectedCompanyId: string,
  ): Promise<RegisterResult> {
    const { data, error } = await serviceClient.rpc(
      "register_presence_session",
      {
        p_user_id: userId,
        p_auth_session_id: authSessionId,
        p_registration_id: registrationId,
        p_expected_company_id: expectedCompanyId,
      },
    );
    if (error) {
      throw new Error(`register_presence_session failed: ${error.message}`);
    }
    return data as RegisterResult;
  }

  async function getSnapshot(viewerUserId: string): Promise<PresenceSnapshot> {
    const { data, error } = await serviceClient.rpc(
      "get_company_presence_snapshot",
      { p_viewer_user_id: viewerUserId },
    );
    if (error) {
      throw new Error(`get_company_presence_snapshot failed: ${error.message}`);
    }
    return data as PresenceSnapshot;
  }

  async function userPlacement(userId: string): Promise<UserPlacementRow> {
    const [row] = await fixtures.sql<UserPlacementRow>(
      `select current_space_id, location_version
       from public.users
       where id = $1`,
      [userId],
    );
    if (!row) throw new Error("Missing user placement row");
    return row;
  }

  async function sessionPlacement(
    sessionId: string,
  ): Promise<SessionPlacementRow> {
    const [row] = await fixtures.sql<SessionPlacementRow>(
      `select space_id, placement_version, retired_at, retirement_reason
       from public.user_presence_sessions
       where id = $1`,
      [sessionId],
    );
    if (!row) throw new Error("Missing session row");
    return row;
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
    return Number(row?.count ?? "0");
  }

  async function nullTransitionResultCount(
    userId: string,
    transitionId: string,
  ): Promise<number> {
    const [row] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.location_transition_requests
       where user_id = $1
         and transition_id = $2
         and result is null`,
      [userId, transitionId],
    );
    return Number(row?.count ?? "0");
  }

  async function openLogCount(
    userId: string,
    spaceId?: string,
  ): Promise<number> {
    const [row] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.space_presence_log
       where user_id = $1
         and exited_at is null
         and ($2::uuid is null or space_id = $2)`,
      [userId, spaceId ?? null],
    );
    return Number(row?.count ?? "0");
  }

  async function activeAuthSessionCount(
    userId: string,
    authSessionId: string,
  ): Promise<number> {
    const [row] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.user_presence_sessions
       where user_id = $1
         and auth_session_id = $2
         and retired_at is null
         and expires_at > pg_catalog.clock_timestamp()`,
      [userId, authSessionId],
    );
    return Number(row?.count ?? "0");
  }

  async function waitForTransitionLockWait(): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const [row] = await fixtures.sql<CountRow>(
        `select count(*)::text as count
         from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock'
           and query ilike '%transition_user_location%'`,
      );
      if (Number(row?.count ?? "0") > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for transition_user_location lock wait");
  }

  async function waitForRegistrationLockWait(): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const [row] = await fixtures.sql<CountRow>(
        `select count(*)::text as count
         from pg_catalog.pg_stat_activity
         where wait_event_type = 'Lock'
           and query ilike '%register_presence_session%'`,
      );
      if (Number(row?.count ?? "0") > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      "Timed out waiting for register_presence_session lock wait",
    );
  }

  async function withPgClient<T>(
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  it(
    presenceConcurrencyTestName(
      "13-capacity-one",
      "serializes two capacity-one joins into one success and one SPACE_FULL",
    ),
    async () => {
      const companyId = await createCompany("capacity-race");
      const spaceId = await createSpace(companyId, "capacity-race-space", {
        capacity: 1,
      });
      const first = await createPlainUser(companyId, "capacity-race-first");
      const second = await createPlainUser(companyId, "capacity-race-second");
      const firstAuthSessionId = randomUUID();
      const secondAuthSessionId = randomUUID();
      const firstSessionId = await seedSession({
        companyId,
        userId: first.id,
        authSessionId: firstAuthSessionId,
      });
      const secondSessionId = await seedSession({
        companyId,
        userId: second.id,
        authSessionId: secondAuthSessionId,
      });
      await activateAtomic();

      const results = await Promise.all([
        transition({
          userId: first.id,
          authSessionId: firstAuthSessionId,
          sessionId: firstSessionId,
          transitionId: randomUUID(),
          targetSpaceId: spaceId,
          reason: "manual-enter",
        }),
        transition({
          userId: second.id,
          authSessionId: secondAuthSessionId,
          sessionId: secondSessionId,
          transitionId: randomUUID(),
          targetSpaceId: spaceId,
          reason: "manual-enter",
        }),
      ]);

      expect(results.map((result) => result.code).sort()).toEqual([
        "LOCATION_UPDATED",
        "SPACE_FULL",
      ]);

      const [occupants] = await fixtures.sql<CountRow>(
        `select count(*)::text as count
       from public.users
       where id in ($1, $2)
         and current_space_id = $3`,
        [first.id, second.id, spaceId],
      );
      const [sessions] = await fixtures.sql<CountRow>(
        `select count(*)::text as count
       from public.user_presence_sessions as s
       join public.users as u on u.id = s.user_id
       where s.user_id in ($1, $2)
         and s.space_id = $3
         and s.retired_at is null
         and s.expires_at > pg_catalog.clock_timestamp()
         and s.placement_version = u.location_version`,
        [first.id, second.id, spaceId],
      );
      const [logs] = await fixtures.sql<CountRow>(
        `select count(*)::text as count
       from public.space_presence_log
       where user_id in ($1, $2)
         and space_id = $3
         and exited_at is null`,
        [first.id, second.id, spaceId],
      );
      expect(occupants?.count).toBe("1");
      expect(sessions?.count).toBe("1");
      expect(logs?.count).toBe("1");
    },
  );

  it(
    presenceConcurrencyTestName(
      "16-same-user-moves",
      "leaves one final placement after distinct concurrent moves for one user",
    ),
    async () => {
      const companyId = await createCompany("same-user-moves");
      const spaceAId = await createSpace(companyId, "same-user-moves-a");
      const spaceBId = await createSpace(companyId, "same-user-moves-b");
      const user = await createPlainUser(companyId, "same-user-moves-user");
      const authSessionId = randomUUID();
      const sessionId = await seedSession({
        companyId,
        userId: user.id,
        authSessionId,
      });
      const before = await userPlacement(user.id);
      await activateAtomic();

      const results = await Promise.all([
        transition({
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId: randomUUID(),
          targetSpaceId: spaceAId,
          reason: "manual-enter",
        }),
        transition({
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId: randomUUID(),
          targetSpaceId: spaceBId,
          reason: "manual-enter",
        }),
      ]);

      expect(
        results.every((result) => result.code === "LOCATION_UPDATED"),
      ).toBe(true);
      const after = await userPlacement(user.id);
      expect([spaceAId, spaceBId]).toContain(after.current_space_id);
      expect(after.location_version).toBe(before.location_version + 2);
      expect(await openLogCount(user.id)).toBe(1);
      expect(
        await openLogCount(user.id, after.current_space_id ?? undefined),
      ).toBe(1);
      await expect(sessionPlacement(sessionId)).resolves.toMatchObject({
        space_id: after.current_space_id,
        placement_version: after.location_version,
      });
    },
  );

  it(
    presenceConcurrencyTestName(
      "49-distinct-id-deadlock",
      `completes ${CONCURRENCY_SOAK_ITERATIONS} distinct-ID same-user transition pairs without deadlock`,
    ),
    async () => {
      const companyId = await createCompany("transition-deadlock-soak");
      const user = await createPlainUser(
        companyId,
        "transition-deadlock-soak-user",
      );
      const spaceAId = await createSpace(
        companyId,
        "transition-deadlock-soak-a",
      );
      const spaceBId = await createSpace(
        companyId,
        "transition-deadlock-soak-b",
      );
      const authSessionId = randomUUID();
      const sessionId = await seedSession({
        companyId,
        userId: user.id,
        authSessionId,
      });
      const before = await userPlacement(user.id);
      await activateAtomic();

      for (
        let iteration = 0;
        iteration < CONCURRENCY_SOAK_ITERATIONS;
        iteration += 1
      ) {
        const results = await Promise.all([
          transition({
            userId: user.id,
            authSessionId,
            sessionId,
            transitionId: randomUUID(),
            targetSpaceId: spaceAId,
            reason: "manual-enter",
          }),
          transition({
            userId: user.id,
            authSessionId,
            sessionId,
            transitionId: randomUUID(),
            targetSpaceId: spaceBId,
            reason: "manual-enter",
          }),
        ]);
        if (
          !results.every(
            (result) =>
              result.ok &&
              ["LOCATION_UPDATED", "LOCATION_UNCHANGED"].includes(result.code),
          )
        ) {
          throw new Error(
            `Unexpected transition soak result at iteration ${iteration}: ${JSON.stringify(results)}`,
          );
        }
      }

      const after = await userPlacement(user.id);
      expect([spaceAId, spaceBId]).toContain(after.current_space_id);
      expect(after.location_version).toBe(
        before.location_version + CONCURRENCY_SOAK_ITERATIONS * 2,
      );
      expect(await openLogCount(user.id)).toBe(1);
      expect(
        await openLogCount(user.id, after.current_space_id ?? undefined),
      ).toBe(1);
      await expect(sessionPlacement(sessionId)).resolves.toMatchObject({
        space_id: after.current_space_id,
        placement_version: after.location_version,
      });
    },
  );

  it("rolls back placement and idempotency claim under same-connection pg_temp log failure injection", async () => {
    const companyId = await createCompany("log-failure");
    const user = await createPlainUser(companyId, "log-failure-user");
    const spaceId = await createSpace(companyId, "log-failure-space");
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    const transitionId = randomUUID();
    const before = await userPlacement(user.id);
    await activateAtomic();

    await fixtures.sql("begin");
    try {
      await fixtures.sql(
        `create or replace function pg_temp.fail_fixture_presence_log_insert()
         returns trigger
         language plpgsql
         as $function$
         begin
           if new.user_id::text = tg_argv[0] then
             raise exception 'forced fixture presence-log failure';
           end if;
           return new;
         end
         $function$;

         create trigger fixture_presence_log_insert_failure
         before insert on public.space_presence_log
         for each row
         execute function pg_temp.fail_fixture_presence_log_insert('${user.id}')`,
      );
      await fixtures.sql("savepoint before_injected_transition");
      await expect(
        fixtures.sql(
          `select *
           from public.transition_user_location(
             $1::uuid,
             $2::uuid,
             $3::uuid,
             $4::uuid,
             $5::uuid,
             'manual-enter'::text,
             null::text,
             null::integer
           )`,
          [user.id, authSessionId, sessionId, transitionId, spaceId],
        ),
      ).rejects.toThrow(/forced fixture presence-log failure/i);
      await fixtures.sql("rollback to savepoint before_injected_transition");

      await expect(userPlacement(user.id)).resolves.toEqual(before);
      await expect(sessionPlacement(sessionId)).resolves.toMatchObject({
        space_id: null,
        placement_version: null,
      });
      expect(await openLogCount(user.id)).toBe(0);
      expect(await transitionRowCount(user.id, transitionId)).toBe(0);
    } catch (error) {
      await fixtures.sql("rollback").catch(() => undefined);
      throw error;
    }
    await fixtures.sql("rollback");
  });

  it(
    presenceConcurrencyTestName(
      "15-same-id-replay",
      "applies a concurrent and sequential replay of the same transition ID once",
    ),
    async () => {
      const companyId = await createCompany("same-transition");
      const user = await createPlainUser(companyId, "same-transition-user");
      const spaceId = await createSpace(companyId, "same-transition-space");
      const authSessionId = randomUUID();
      const sessionId = await seedSession({
        companyId,
        userId: user.id,
        authSessionId,
      });
      const before = await userPlacement(user.id);
      const transitionId = randomUUID();
      await activateAtomic();

      const [first, second] = await Promise.all([
        transition({
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId,
          targetSpaceId: spaceId,
          reason: "manual-enter",
        }),
        transition({
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId,
          targetSpaceId: spaceId,
          reason: "manual-enter",
        }),
      ]);
      const replay = await transition({
        userId: user.id,
        authSessionId,
        sessionId,
        transitionId,
        targetSpaceId: spaceId,
        reason: "manual-enter",
      });

      for (const result of [first, second, replay]) {
        expect(result).toMatchObject({
          ok: true,
          code: "LOCATION_UPDATED",
          current_space_id: spaceId,
          location_version: before.location_version + 1,
        });
      }
      expect(
        [first, second, replay].some((result) => result.already_applied),
      ).toBe(true);
      await expect(userPlacement(user.id)).resolves.toMatchObject({
        current_space_id: spaceId,
        location_version: before.location_version + 1,
      });
      expect(await openLogCount(user.id, spaceId)).toBe(1);
      expect(await transitionRowCount(user.id, transitionId)).toBe(1);
      expect(await nullTransitionResultCount(user.id, transitionId)).toBe(0);
    },
  );

  it("stores separate results for distinct auto-fallback transition IDs", async () => {
    const companyId = await createCompany("fallback-ids");
    const user = await createPlainUser(companyId, "fallback-ids-user");
    const spaceAId = await createSpace(companyId, "fallback-ids-a");
    const spaceBId = await createSpace(companyId, "fallback-ids-b");
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    const before = await userPlacement(user.id);
    const firstTransitionId = randomUUID();
    const secondTransitionId = randomUUID();
    await activateAtomic();

    const first = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: firstTransitionId,
      targetSpaceId: spaceAId,
      reason: "auto-fallback",
      expectedLocationVersion: before.location_version,
    });
    const second = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: secondTransitionId,
      targetSpaceId: spaceBId,
      reason: "auto-fallback",
      expectedLocationVersion: before.location_version,
    });

    expect(first.code).toBe("LOCATION_UPDATED");
    expect(second.code).toBe("LOCATION_SUPERSEDED");
    const rows = await fixtures.sql<{
      readonly transition_id: string;
      readonly code: string | null;
    }>(
      `select transition_id::text, result ->> 'code' as code
       from public.location_transition_requests
       where user_id = $1
         and transition_id in ($2, $3)
       order by transition_id`,
      [user.id, firstTransitionId, secondTransitionId],
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.transition_id))).toEqual(
      new Set([firstTransitionId, secondTransitionId]),
    );
    expect(new Set(rows.map((row) => row.code))).toEqual(
      new Set(["LOCATION_UPDATED", "LOCATION_SUPERSEDED"]),
    );
  });

  it("supersedes an older automatic command after a manual transition commits elsewhere", async () => {
    const companyId = await createCompany("manual-before-auto");
    const user = await createPlainUser(companyId, "manual-before-auto-user");
    const manualSpaceId = await createSpace(
      companyId,
      "manual-before-auto-manual",
    );
    const autoSpaceId = await createSpace(companyId, "manual-before-auto-auto");
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    const before = await userPlacement(user.id);
    await activateAtomic();

    await expect(
      transition({
        userId: user.id,
        authSessionId,
        sessionId,
        transitionId: randomUUID(),
        targetSpaceId: manualSpaceId,
        reason: "manual-enter",
      }),
    ).resolves.toMatchObject({ code: "LOCATION_UPDATED" });
    const afterManual = await userPlacement(user.id);

    const auto = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: randomUUID(),
      targetSpaceId: autoSpaceId,
      reason: "auto-rejoin",
      expectedLocationVersion: before.location_version,
    });
    expect(auto.code).toBe("LOCATION_SUPERSEDED");
    await expect(userPlacement(user.id)).resolves.toEqual(afterManual);
    expect(await openLogCount(user.id, manualSpaceId)).toBe(1);
    expect(await openLogCount(user.id, autoSpaceId)).toBe(0);
  });

  it("denies same-target private entry after access is removed and revision changes", async () => {
    const companyId = await createCompany("same-target-private");
    const user = await createPlainUser(companyId, "same-target-private-user");
    const privateSpaceId = await createSpace(
      companyId,
      "same-target-private-space",
      {
        accessControl: { isPublic: false, allowedUsers: [user.id] },
      },
    );
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    await activateAtomic();

    await expect(
      transition({
        userId: user.id,
        authSessionId,
        sessionId,
        transitionId: randomUUID(),
        targetSpaceId: privateSpaceId,
        reason: "manual-enter",
      }),
    ).resolves.toMatchObject({ code: "LOCATION_UPDATED" });
    const afterEntry = await userPlacement(user.id);
    const beforeRevision = await revisionState(user.id, privateSpaceId);

    await fixtures.sql(
      `update public.spaces
       set access_control = '{"isPublic": false, "allowedUsers": []}'::jsonb
       where id = $1`,
      [privateSpaceId],
    );
    const afterRevision = await revisionState(user.id, privateSpaceId);
    expect(afterRevision.space_access_revision).not.toBe(
      beforeRevision.space_access_revision,
    );

    const denied = await transition({
      userId: user.id,
      authSessionId,
      sessionId,
      transitionId: randomUUID(),
      targetSpaceId: privateSpaceId,
      reason: "manual-enter",
    });
    expect(denied).toMatchObject({
      ok: false,
      code: "SPACE_ACCESS_DENIED",
      already_applied: false,
    });
    await expect(userPlacement(user.id)).resolves.toEqual(afterEntry);
    expect(await openLogCount(user.id, privateSpaceId)).toBe(1);
  });

  it("returns uncached SESSION_INVALID when a session expires while the transition waits on the user lock", async () => {
    const companyId = await createCompany("expiry-lock-wait");
    const user = await createPlainUser(companyId, "expiry-lock-wait-user");
    const spaceId = await createSpace(companyId, "expiry-lock-wait-space");
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    const before = await userPlacement(user.id);
    const transitionId = randomUUID();
    await activateAtomic();

    await withPgClient(async (connectionA) => {
      await connectionA.query("begin");
      try {
        await connectionA.query(
          `select id from public.users where id = $1 for no key update`,
          [user.id],
        );
        const transitionPromise = transition({
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId,
          targetSpaceId: spaceId,
          reason: "manual-enter",
        });
        await waitForTransitionLockWait();
        await fixtures.sql(
          `update public.user_presence_sessions
           set expires_at = pg_catalog.clock_timestamp() - interval '1 second'
           where id = $1`,
          [sessionId],
        );
        await connectionA.query("commit");
        await expect(transitionPromise).resolves.toMatchObject({
          ok: false,
          code: "SESSION_INVALID",
          already_applied: false,
        });
      } finally {
        await connectionA.query("rollback").catch(() => undefined);
      }
    });

    await expect(userPlacement(user.id)).resolves.toEqual(before);
    expect(await openLogCount(user.id)).toBe(0);
    expect(await transitionRowCount(user.id, transitionId)).toBe(0);
  });

  it("keeps presence snapshots internally consistent during concurrent commits", async () => {
    const companyId = await createCompany("snapshot-race");
    const user = await createPlainUser(companyId, "snapshot-race-user");
    const peer = await createPlainUser(companyId, "snapshot-race-peer");
    const spaceAId = await createSpace(companyId, "snapshot-race-a");
    const spaceBId = await createSpace(companyId, "snapshot-race-b");
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    const expectedUserIds = new Set([peer.id, user.id]);
    await activateAtomic();

    for (let i = 0; i < 10; i += 1) {
      const targetSpaceId = i % 2 === 0 ? spaceAId : spaceBId;
      const [snapshot, result] = await Promise.all([
        getSnapshot(user.id),
        transition({
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId: randomUUID(),
          targetSpaceId,
          reason: "manual-enter",
        }),
      ]);

      expect(result.ok).toBe(true);
      expect(typeof snapshot.serverTime).toBe("string");
      expect(snapshot.companyId).toBe(companyId);
      expect(snapshot.viewerUserId).toBe(user.id);
      const ids = snapshot.users.map((snapshotUser) => snapshotUser.id);
      expect(new Set(ids)).toEqual(expectedUserIds);
      expect(ids).toHaveLength(expectedUserIds.size);
      for (const snapshotUser of snapshot.users) {
        expect(Number.isInteger(snapshotUser.locationVersion)).toBe(true);
        if (snapshotUser.isOccupyingCurrentSpace) {
          expect(snapshotUser.currentSpaceId).not.toBeNull();
        }
      }
    }
  });

  it("keeps state consistent when atomic maintenance starts while a transition is mid-flight", async () => {
    const companyId = await createCompany("atomic-maintenance-race");
    const user = await createPlainUser(
      companyId,
      "atomic-maintenance-race-user",
    );
    const spaceId = await createSpace(
      companyId,
      "atomic-maintenance-race-space",
    );
    const authSessionId = randomUUID();
    const sessionId = await seedSession({
      companyId,
      userId: user.id,
      authSessionId,
    });
    const transitionId = randomUUID();
    await activateAtomic();

    const outcome = await withPgClient<TransitionResult | Error>(
      async (connectionA) => {
        await connectionA.query("begin");
        try {
          await connectionA.query(
            `select id from public.users where id = $1 for no key update`,
            [user.id],
          );
          const transitionPromise = transition({
            userId: user.id,
            authSessionId,
            sessionId,
            transitionId,
            targetSpaceId: spaceId,
            reason: "manual-enter",
          }).catch((error: unknown) =>
            error instanceof Error ? error : new Error(String(error)),
          );
          await waitForTransitionLockWait();
          await fixtures.sql(
            `select public.enter_atomic_presence_maintenance($1, $2)`,
            [randomUUID(), "exit gate mid-flight transition rehearsal"],
          );
          await connectionA.query("commit");
          return transitionPromise;
        } finally {
          await connectionA.query("rollback").catch(() => undefined);
        }
      },
    );

    expect(outcome).not.toBeInstanceOf(Error);
    expect(outcome).toMatchObject({
      ok: false,
      code: "PRESENCE_MAINTENANCE",
      already_applied: false,
    });
    expect(await transitionRowCount(user.id, transitionId)).toBe(0);

    const placement = await userPlacement(user.id);
    const [partial] = await fixtures.sql<CountRow>(
      `select count(*)::text as count
       from public.users as u
       where u.id = $1
         and u.current_space_id is not null
         and not exists (
           select 1
           from public.space_presence_log as l
           where l.user_id = u.id
             and l.space_id = u.current_space_id
             and l.exited_at is null
         )`,
      [user.id],
    );
    expect(partial?.count).toBe("0");
    expect(placement.current_space_id).toBeNull();
    expect(await openLogCount(user.id)).toBe(0);
  });

  it("rejects an A-scoped registration after waiting on an A-to-B membership change", async () => {
    const companyAId = await createCompany("register-scope-a");
    const companyBId = await createCompany("register-scope-b");
    const user = await createPlainUser(companyAId, "register-scope-user");
    const authSessionId = randomUUID();

    const result = await withPgClient(async (lockClient) => {
      let registration: Promise<RegisterResult> | null = null;
      await lockClient.query("begin");
      try {
        await lockClient.query(
          `select pg_catalog.set_config(
             'request.jwt.claims', '{"role":"service_role"}', true
           )`,
        );
        await lockClient.query(
          `update public.users set company_id = $1 where id = $2`,
          [companyBId, user.id],
        );

        registration = registerSession(
          user.id,
          authSessionId,
          randomUUID(),
          companyAId,
        );
        await waitForRegistrationLockWait();
        await lockClient.query("commit");
        return await registration;
      } catch (error) {
        await lockClient.query("rollback").catch(() => undefined);
        if (registration) await registration.catch(() => undefined);
        throw error;
      }
    });

    expect(result).toEqual({
      ok: false,
      code: "PRESENCE_COMPANY_SCOPE_CHANGED",
    });
    expect(await activeAuthSessionCount(user.id, authSessionId)).toBe(0);
  });

  it(
    presenceConcurrencyTestName(
      "45-register-logout",
      `allows only register-first or logout-first outcomes across ${REGISTER_LOGOUT_ITERATIONS} races`,
    ),
    async () => {
      const companyId = await createCompany("register-logout-race");
      const user: AuthedUser = await createAuthedUser(fixtures, NS, {
        key: `exit-register-logout-${randomUUID()}`,
        companyId,
        displayName: "Phase 3 Exit Register Logout",
        role: "member",
      });
      await activateAtomic();

      for (let i = 0; i < REGISTER_LOGOUT_ITERATIONS; i += 1) {
        const authSessionId = randomUUID();
        const registrationId = randomUUID();
        const transitionId = randomUUID();

        const [registered, logout] = await Promise.all([
          registerSession(
            user.appUserId,
            authSessionId,
            registrationId,
            companyId,
          ),
          transition({
            userId: user.appUserId,
            authSessionId,
            sessionId: null,
            transitionId,
            targetSpaceId: null,
            reason: "logout",
          }),
        ]);

        expect(logout.ok).toBe(true);
        if (registered.ok) {
          await expect(
            sessionPlacement(registered.sessionId),
          ).resolves.toMatchObject({
            retired_at: expect.any(Date),
            retirement_reason: "logout",
          });
        } else {
          expect(registered.code).toBe("AUTH_SESSION_REVOKED");
        }
        expect(
          await activeAuthSessionCount(user.appUserId, authSessionId),
        ).toBe(0);

        await fixtures.sql(
          `delete from public.location_transition_requests
         where user_id = $1
           and auth_session_id = $2`,
          [user.appUserId, authSessionId],
        );
        await fixtures.sql(
          `delete from public.user_presence_sessions
         where user_id = $1
           and auth_session_id = $2`,
          [user.appUserId, authSessionId],
        );
        await fixtures.sql(
          `delete from public.revoked_presence_auth_sessions
         where user_id = $1
           and auth_session_id = $2`,
          [user.appUserId, authSessionId],
        );
      }
    },
  );
});
