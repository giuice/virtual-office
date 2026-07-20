import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceFixtures } from "./fixtures";
import { LOCAL_DB_URL } from "./setup";
import { presenceConcurrencyTestName } from "./concurrency/support";

const NS = `presence-concurrency-contract-${randomUUID()}`;

type DbFunction = {
  readonly identity: string;
  readonly owner_name: string;
  readonly security_definer: boolean;
  readonly volatility: string;
  readonly config: string[] | null;
  readonly acl: string[];
};

type UserRow = {
  readonly id: string;
  readonly location_version: number;
  readonly presence_access_revision: string;
};

type SpaceRow = {
  readonly id: string;
  readonly presence_access_revision: string;
};

type SessionRow = { readonly id: string };

type RpcResult = {
  readonly ok: boolean;
  readonly code: string;
  readonly status?: string;
  readonly alreadyApplied?: boolean;
};

describe("presence-db corrective concurrency contract", () => {
  let fixtures: PresenceFixtures;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
  });

  afterAll(async () => {
    if (!fixtures) return;
    await setRuntimeMode("legacy", null);
    await fixtures.cleanup();
    await fixtures.end();
  });

  async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    await client.query(
      `select pg_catalog.set_config(
         'request.jwt.claims',
         '{"role":"service_role"}',
         false
       )`,
    );
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async function asPmo<T>(client: Client, fn: () => Promise<T>): Promise<T> {
    await client.query("grant presence_maintenance_owner to postgres");
    await client.query("set role presence_maintenance_owner");
    try {
      return await fn();
    } finally {
      await client.query("reset role");
      await client.query("revoke presence_maintenance_owner from postgres");
    }
  }

  async function setRuntimeMode(
    mode: "legacy" | "maintenance" | "atomic",
    cutoverId: string | null,
  ): Promise<void> {
    await asPmo(fixtures.client, () =>
      fixtures.client.query(
        `update private.presence_runtime_control
         set mode = $1,
             cutover_id = $2,
             changed_at = pg_catalog.clock_timestamp(),
             changed_by = 'presence-concurrency-contract-test',
             legacy_adapter_enabled = true,
             legacy_adapter_disabled_at = null
         where singleton_id`,
        [mode, cutoverId],
      ),
    );
  }

  async function createCompany(key: string): Promise<string> {
    const [company] = await fixtures.sql<{ readonly id: string }>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [`${key}::${NS}`],
    );
    if (!company) throw new Error("Failed to create company fixture");
    return company.id;
  }

  async function createSpace(
    companyId: string,
    key: string,
  ): Promise<SpaceRow> {
    const [space] = await fixtures.sql<SpaceRow>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values (
         $1,
         $2,
         'workspace'::public.space_type,
         'active'::public.space_status,
         20,
         '{"isPublic": true}'::jsonb
       )
       returning id, presence_access_revision`,
      [companyId, `${key}::${NS}`],
    );
    if (!space) throw new Error("Failed to create space fixture");
    return space;
  }

  async function createUser(
    companyId: string,
    key: string,
    currentSpaceId: string | null = null,
  ): Promise<UserRow> {
    const [user] = await fixtures.sql<UserRow>(
      `insert into public.users (
         supabase_uid,
         email,
         display_name,
         company_id,
         role,
         current_space_id
       )
       values (
         $1,
         $2,
         $3,
         $4,
         'member'::public.user_role,
         $5
       )
       returning id, location_version, presence_access_revision`,
      [
        randomUUID(),
        `${key}-${randomUUID()}::${NS}@example.test`,
        `Concurrency ${key}`,
        companyId,
        currentSpaceId,
      ],
    );
    if (!user) throw new Error("Failed to create user fixture");
    return user;
  }

  async function createSession(params: {
    readonly companyId: string;
    readonly userId: string;
    readonly authSessionId: string;
    readonly spaceId?: string | null;
    readonly placementVersion?: number | null;
    readonly userAccessRevision?: string | null;
    readonly spaceAccessRevision?: string | null;
  }): Promise<SessionRow> {
    const [session] = await fixtures.sql<SessionRow>(
      `insert into public.user_presence_sessions (
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
         pg_catalog.clock_timestamp() - interval '1 second',
         pg_catalog.clock_timestamp() - interval '1 second',
         pg_catalog.clock_timestamp() + interval '2 minutes'
       )
       returning id`,
      [
        randomUUID(),
        params.userId,
        params.authSessionId,
        params.companyId,
        params.spaceId ?? null,
        params.placementVersion ?? null,
        params.userAccessRevision ?? null,
        params.spaceAccessRevision ?? null,
      ],
    );
    if (!session) throw new Error("Failed to create session fixture");
    return session;
  }

  async function waitForObservedLock(params: {
    readonly waitingPid: number;
    readonly blockingPid: number;
    readonly queryPattern: string;
  }): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const [evidence] = await fixtures.sql<{
        readonly wait_event_type: string | null;
        readonly blockers: number[];
        readonly ungranted: string;
      }>(
        `select activity.wait_event_type,
                pg_catalog.pg_blocking_pids(activity.pid) as blockers,
                (
                  select pg_catalog.count(*)::text
                  from pg_catalog.pg_locks as lock_row
                  where lock_row.pid = activity.pid
                    and not lock_row.granted
                ) as ungranted
         from pg_catalog.pg_stat_activity as activity
         where activity.pid = $1
           and activity.query ilike $2`,
        [params.waitingPid, `%${params.queryPattern}%`],
      );
      if (
        evidence?.wait_event_type === "Lock" &&
        evidence.blockers.includes(params.blockingPid) &&
        Number(evidence.ungranted) > 0
      ) {
        expect(evidence.wait_event_type).toBe("Lock");
        expect(evidence.blockers).toContain(params.blockingPid);
        expect(Number(evidence.ungranted)).toBeGreaterThan(0);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `No pg_stat_activity/pg_blocking_pids/pg_locks evidence for PID ${params.waitingPid}`,
    );
  }

  it("installs exact writer/gate catalog shape and starts a healthy immutable audit last", async () => {
    const functions = await fixtures.sql<DbFunction>(
      `select
         namespace.nspname || '.' || procedure.proname || '(' ||
           pg_catalog.pg_get_function_identity_arguments(procedure.oid) || ')' as identity,
         pg_catalog.pg_get_userbyid(procedure.proowner) as owner_name,
         procedure.prosecdef as security_definer,
         procedure.provolatile::text as volatility,
         procedure.proconfig as config,
         coalesce(
           (
             select pg_catalog.array_agg(
               coalesce(role_row.rolname, 'PUBLIC') || ':' || privilege.privilege_type
               order by coalesce(role_row.rolname, 'PUBLIC'), privilege.privilege_type
             )
             from pg_catalog.aclexplode(
               coalesce(
                 procedure.proacl,
                 pg_catalog.acldefault('f', procedure.proowner)
               )
             ) as privilege
             left join pg_catalog.pg_roles as role_row
               on role_row.oid = privilege.grantee
           ),
           array[]::text[]
         ) as acl
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace
         on namespace.oid = procedure.pronamespace
       where procedure.oid in (
         'private.acquire_presence_atomic_write_gate()'::pg_catalog.regprocedure,
         'public.transition_user_location(uuid,uuid,uuid,uuid,uuid,text,text,integer)'::pg_catalog.regprocedure,
         'public.create_knock_request(uuid,uuid,uuid,uuid,text)'::pg_catalog.regprocedure
       )
       order by identity`,
    );

    expect(functions).toEqual([
      {
        identity: "private.acquire_presence_atomic_write_gate()",
        owner_name: "presence_maintenance_owner",
        security_definer: true,
        volatility: "v",
        config: ["search_path=pg_catalog"],
        acl: ["service_role:EXECUTE"],
      },
      {
        identity:
          "public.create_knock_request(p_requester_id uuid, p_auth_session_id uuid, p_session_id uuid, p_space_id uuid, p_request_id text)",
        owner_name: "postgres",
        security_definer: false,
        volatility: "v",
        config: ["search_path=pg_catalog"],
        acl: ["service_role:EXECUTE"],
      },
      {
        identity:
          "public.transition_user_location(p_user_id uuid, p_auth_session_id uuid, p_session_id uuid, p_transition_id uuid, p_target_space_id uuid, p_reason text, p_knock_request_id text, p_expected_location_version integer)",
        owner_name: "postgres",
        security_definer: false,
        volatility: "v",
        config: ["search_path=pg_catalog"],
        acl: ["service_role:EXECUTE"],
      },
    ]);

    const [runtimeTable] = await fixtures.sql<{
      readonly owner_name: string;
      readonly rls: boolean;
      readonly force_rls: boolean;
      readonly policy_count: string;
      readonly browser_or_service_access: boolean;
    }>(
      `select
         pg_catalog.pg_get_userbyid(relation.relowner) as owner_name,
         relation.relrowsecurity as rls,
         relation.relforcerowsecurity as force_rls,
         (
           select pg_catalog.count(*)::text
           from pg_catalog.pg_policy as policy
           where policy.polrelid = relation.oid
             and policy.polname = 'pmo_presence_runtime_control_all'
             and policy.polroles = array[
               'presence_maintenance_owner'::pg_catalog.regrole::oid
             ]
         ) as policy_count,
         (
           pg_catalog.has_table_privilege(
             'anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
           )
           or pg_catalog.has_table_privilege(
             'authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
           )
           or pg_catalog.has_table_privilege(
             'service_role', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
           )
         ) as browser_or_service_access
       from pg_catalog.pg_class as relation
       where relation.oid =
         'private.presence_runtime_control'::pg_catalog.regclass`,
    );
    expect(runtimeTable).toEqual({
      owner_name: "presence_maintenance_owner",
      rls: true,
      force_rls: true,
      policy_count: "1",
      browser_or_service_access: false,
    });

    const [audit] = await fixtures.sql<{
      readonly started: boolean;
      readonly fingerprint_stable: boolean;
      readonly healthy: boolean;
      readonly initial_coverage_healthy: boolean;
    }>(
      `select
         meta.observation_started_at is not null as started,
         meta.expected_schema_fingerprint =
           private.compute_presence_cutover_audit_fingerprint()
           as fingerprint_stable,
         private.is_presence_cutover_audit_catalog_healthy(
           meta.expected_schema_fingerprint
         ) as healthy,
         exists (
           select 1
           from private.presence_legacy_cutover_audit_coverage as coverage
           where coverage.schema_fingerprint = meta.expected_schema_fingerprint
             and coverage.healthy
         ) as initial_coverage_healthy
       from private.presence_legacy_cutover_audit_meta as meta
       where meta.singleton_id`,
    );
    expect(audit).toEqual({
      started: true,
      fingerprint_stable: true,
      healthy: true,
      initial_coverage_healthy: true,
    });

    const [baseline] = await fixtures.sql<{ readonly fingerprint: string }>(
      `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
    );
    expect(baseline?.fingerprint).toBeTruthy();

    await fixtures.client.query("begin");
    try {
      await fixtures.client.query(
        "grant presence_maintenance_owner to postgres",
      );
      await fixtures.client.query("set local role presence_maintenance_owner");
      await fixtures.client.query(
        `alter table private.presence_runtime_control
         drop constraint presence_runtime_control_adapter_pair`,
      );
      await fixtures.client.query("reset role");
      await fixtures.client.query(
        "revoke presence_maintenance_owner from postgres",
      );
      const [drift] = await fixtures.sql<{
        readonly fingerprint_changed: boolean;
        readonly healthy: boolean;
      }>(
        `select
           private.compute_presence_cutover_audit_fingerprint() <> $1
             as fingerprint_changed,
           private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
        [baseline!.fingerprint],
      );
      expect(drift).toEqual({ fingerprint_changed: true, healthy: false });
    } finally {
      await fixtures.client.query("rollback");
    }

    await fixtures.client.query("begin");
    try {
      await fixtures.client.query(
        "grant presence_maintenance_owner to postgres",
      );
      await fixtures.client.query("set local role presence_maintenance_owner");
      await fixtures.client.query(
        `grant execute on function
           public.transition_user_location_observed(
             uuid, uuid, uuid, uuid, uuid, text, text, integer
           )
         to authenticated`,
      );
      await fixtures.client.query("reset role");
      await fixtures.client.query(
        "revoke presence_maintenance_owner from postgres",
      );
      const [drift] = await fixtures.sql<{
        readonly fingerprint_changed: boolean;
        readonly healthy: boolean;
      }>(
        `select
           private.compute_presence_cutover_audit_fingerprint() <> $1
             as fingerprint_changed,
           private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
        [baseline!.fingerprint],
      );
      expect(drift).toEqual({ fingerprint_changed: true, healthy: false });
    } finally {
      await fixtures.client.query("rollback");
    }

    await fixtures.client.query("begin");
    try {
      await fixtures.client.query(
        `alter table public.users
         disable trigger presence_gate_users_current_space`,
      );
      const [drift] = await fixtures.sql<{
        readonly fingerprint_changed: boolean;
        readonly healthy: boolean;
      }>(
        `select
           private.compute_presence_cutover_audit_fingerprint() <> $1
             as fingerprint_changed,
           private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
        [baseline!.fingerprint],
      );
      expect(drift).toEqual({ fingerprint_changed: true, healthy: false });
    } finally {
      await fixtures.client.query("rollback");
    }

    const [restored] = await fixtures.sql<{
      readonly fingerprint_restored: boolean;
      readonly healthy: boolean;
    }>(
      `select
         private.compute_presence_cutover_audit_fingerprint() = $1
           as fingerprint_restored,
         private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
      [baseline!.fingerprint],
    );
    expect(restored).toEqual({ fingerprint_restored: true, healthy: true });
  });

  it("preserves the first unhealthy current-hour observation against a later writer", async () => {
    await withClient(async (finalizer) => {
      await withClient(async (cron) => {
        await finalizer.query("grant presence_maintenance_owner to postgres");
        await finalizer.query("begin");
        await finalizer.query("set local role presence_maintenance_owner");
        try {
          await finalizer.query(
            `lock table private.presence_legacy_cutover_audit_coverage
             in share row exclusive mode`,
          );
          await finalizer.query(
            `delete from private.presence_legacy_cutover_audit_coverage
             where coverage_hour = pg_catalog.date_trunc(
               'hour', pg_catalog.clock_timestamp()
             )`,
          );

          const finalizerPid = (
            await finalizer.query<{ readonly pid: number }>(
              "select pg_catalog.pg_backend_pid() as pid",
            )
          ).rows[0]!.pid;
          const cronPid = (
            await cron.query<{ readonly pid: number }>(
              "select pg_catalog.pg_backend_pid() as pid",
            )
          ).rows[0]!.pid;
          const concurrentCron = cron.query(
            "select private.record_presence_legacy_cutover_audit_coverage()",
          );

          await waitForObservedLock({
            waitingPid: cronPid,
            blockingPid: finalizerPid,
            queryPattern: "record_presence_legacy_cutover_audit_coverage",
          });
          await finalizer.query("reset role");
          await finalizer.query(
            "revoke presence_maintenance_owner from postgres",
          );
          await finalizer.query(
            "select private.record_presence_legacy_cutover_audit_coverage()",
          );
          await finalizer.query("commit");
          await expect(concurrentCron).resolves.toBeDefined();
        } catch (error) {
          await finalizer.query("rollback");
          throw error;
        } finally {
          await finalizer.query(
            "revoke presence_maintenance_owner from postgres",
          );
        }
      });
    });

    const [coverage] = await fixtures.sql<{
      readonly count: string;
      readonly healthy: boolean;
    }>(
      `select
         pg_catalog.count(*)::text as count,
         pg_catalog.bool_and(coverage.healthy) as healthy
       from private.presence_legacy_cutover_audit_coverage as coverage
       where coverage.coverage_hour = pg_catalog.date_trunc(
         'hour', pg_catalog.clock_timestamp()
       )`,
    );
    expect(coverage).toEqual({ count: "1", healthy: false });
  });

  it("returns a stored transition replay without touching the locked runtime gate", async () => {
    const companyId = await createCompany("replay");
    const user = await createUser(companyId, "replay-user");
    const authSessionId = randomUUID();
    const sessionId = randomUUID();
    const transitionId = randomUUID();

    await fixtures.sql(
      `insert into public.location_transition_requests (
         user_id,
         transition_id,
         auth_session_id,
         requested_space_id,
         reason,
         knock_request_id,
         expected_location_version,
         result
       )
       values (
         $1,
         $2,
         $3,
         null,
         'manual-leave',
         null,
         null,
         pg_catalog.jsonb_build_object(
           'ok', true,
           'code', 'LOCATION_UNCHANGED',
           'message', 'Location unchanged',
           'previousSpaceId', null,
           'currentSpaceId', null,
           'locationVersion', 0,
           'authorizedBy', null
         )
       )`,
      [user.id, transitionId, authSessionId],
    );

    await withClient(async (locker) => {
      await locker.query("grant presence_maintenance_owner to postgres");
      await locker.query("begin");
      await locker.query("set local role presence_maintenance_owner");
      await locker.query(
        `select singleton_id
         from private.presence_runtime_control
         where singleton_id
         for update`,
      );

      try {
        await withClient(async (caller) => {
          await caller.query(`set statement_timeout = '750ms'`);
          const result = await caller.query<RpcResult>(
            `select *
             from public.transition_user_location(
               $1, $2, $3, $4, null, 'manual-leave', null, null
             )`,
            [user.id, authSessionId, sessionId, transitionId],
          );
          expect(result.rows[0]).toMatchObject({
            ok: true,
            code: "LOCATION_UNCHANGED",
          });
          expect(
            (result.rows[0] as RpcResult & { already_applied: boolean })
              .already_applied,
          ).toBe(true);
        });
      } finally {
        await locker.query("rollback");
        await locker.query("revoke presence_maintenance_owner from postgres");
      }
    });
  });

  it(
    presenceConcurrencyTestName(
      "59-atomic-maintenance",
      "holds the shared atomic gate and makes a pre-gate transition lose to maintenance",
    ),
    async () => {
      await setRuntimeMode("atomic", randomUUID());

      const gateCompanyId = await createCompany("held-shared-gate");
      const gateUser = await createUser(gateCompanyId, "held-shared-gate-user");
      const gateAuthSessionId = randomUUID();
      const gateSession = await createSession({
        companyId: gateCompanyId,
        userId: gateUser.id,
        authSessionId: gateAuthSessionId,
      });
      const advisoryKey = Math.floor(Math.random() * 1_000_000_000);
      const triggerName = `pause_after_gate_${randomUUID().replaceAll("-", "")}`;

      await withClient(async (blocker) => {
        await withClient(async (transitionClient) => {
          await withClient(async (maintenanceClient) => {
            await blocker.query("begin");
            await blocker.query("select pg_catalog.pg_advisory_xact_lock($1)", [
              advisoryKey,
            ]);
            await transitionClient.query(
              `create or replace function pg_temp.pause_presence_after_gate()
               returns trigger
               language plpgsql
               as $trigger$
               begin
                 perform pg_catalog.pg_advisory_xact_lock(${advisoryKey});
                 return new;
               end;
               $trigger$`,
            );
            await transitionClient.query(
              `create trigger ${triggerName}
               before insert on public.revoked_presence_auth_sessions
               for each row
               execute function pg_temp.pause_presence_after_gate()`,
            );

            try {
              const blockerPid = (
                await blocker.query<{ readonly pid: number }>(
                  "select pg_catalog.pg_backend_pid() as pid",
                )
              ).rows[0]!.pid;
              const transitionPid = (
                await transitionClient.query<{ readonly pid: number }>(
                  "select pg_catalog.pg_backend_pid() as pid",
                )
              ).rows[0]!.pid;
              const maintenancePid = (
                await maintenanceClient.query<{ readonly pid: number }>(
                  "select pg_catalog.pg_backend_pid() as pid",
                )
              ).rows[0]!.pid;

              const transition = transitionClient.query<RpcResult>(
                `select *
                 from public.transition_user_location(
                   $1, $2, $3, $4, null, 'logout', null, null
                 )`,
                [gateUser.id, gateAuthSessionId, gateSession.id, randomUUID()],
              );
              await waitForObservedLock({
                waitingPid: transitionPid,
                blockingPid: blockerPid,
                queryPattern: "transition_user_location",
              });

              const maintenance = maintenanceClient.query(
                "select public.enter_atomic_presence_maintenance($1, $2)",
                [randomUUID(), "real transition holds shared gate"],
              );
              await waitForObservedLock({
                waitingPid: maintenancePid,
                blockingPid: transitionPid,
                queryPattern: "enter_atomic_presence_maintenance",
              });

              await blocker.query("commit");
              await expect(transition).resolves.toMatchObject({
                rows: [expect.objectContaining({ ok: true })],
              });
              await expect(maintenance).resolves.toBeDefined();
            } finally {
              await blocker.query("rollback");
              await transitionClient.query(
                `drop trigger if exists ${triggerName}
                 on public.revoked_presence_auth_sessions`,
              );
            }
          });
        });
      });

      await setRuntimeMode("atomic", randomUUID());

      const companyId = await createCompany("maintenance-wins");
      const user = await createUser(companyId, "maintenance-wins-user");
      const authSessionId = randomUUID();
      const session = await createSession({
        companyId,
        userId: user.id,
        authSessionId,
      });
      const transitionId = randomUUID();

      await withClient(async (blocker) => {
        await withClient(async (transitionClient) => {
          await withClient(async (maintenanceClient) => {
            await blocker.query("begin");
            await blocker.query(
              "select id from public.users where id = $1 for no key update",
              [user.id],
            );
            const blockerPid = (
              await blocker.query<{ readonly pid: number }>(
                "select pg_catalog.pg_backend_pid() as pid",
              )
            ).rows[0]!.pid;
            const transitionPid = (
              await transitionClient.query<{ readonly pid: number }>(
                "select pg_catalog.pg_backend_pid() as pid",
              )
            ).rows[0]!.pid;

            const transition = transitionClient.query<RpcResult>(
              `select *
             from public.transition_user_location(
               $1, $2, $3, $4, null, 'manual-leave', null, null
             )`,
              [user.id, authSessionId, session.id, transitionId],
            );

            await waitForObservedLock({
              waitingPid: transitionPid,
              blockingPid: blockerPid,
              queryPattern: "transition_user_location",
            });

            await maintenanceClient.query(
              "select public.enter_atomic_presence_maintenance($1, $2)",
              [randomUUID(), "maintenance wins before terminal gate"],
            );
            await blocker.query("commit");

            const result = (await transition).rows[0];
            expect(result).toMatchObject({
              ok: false,
              code: "PRESENCE_MAINTENANCE",
            });
          });
        });
      });

      const [state] = await fixtures.sql<{
        readonly location_version: number;
        readonly current_space_id: string | null;
        readonly claim_count: string;
      }>(
        `select
         member.location_version,
         member.current_space_id,
         (
           select pg_catalog.count(*)::text
           from public.location_transition_requests as request
           where request.user_id = member.id
             and request.transition_id = $2
         ) as claim_count
       from public.users as member
       where member.id = $1`,
        [user.id, transitionId],
      );
      expect(state).toEqual({
        location_version: 0,
        current_space_id: null,
        claim_count: "0",
      });
    },
  );

  it(
    presenceConcurrencyTestName(
      "52-responder-lock-set",
      "returns uncached RETRY_LOCK_SET when a pending Knock gains a responder",
    ),
    async () => {
      await setRuntimeMode("legacy", null);
      const companyId = await createCompany("knock-lock-set");
      const space = await createSpace(companyId, "knock-lock-set-space");
      const requester = await createUser(companyId, "knock-requester");
      const responder = await createUser(
        companyId,
        "knock-responder",
        space.id,
      );
      const requesterAuthSessionId = randomUUID();
      const responderAuthSessionId = randomUUID();
      const requesterSession = await createSession({
        companyId,
        userId: requester.id,
        authSessionId: requesterAuthSessionId,
      });
      await createSession({
        companyId,
        userId: responder.id,
        authSessionId: responderAuthSessionId,
        spaceId: space.id,
        placementVersion: responder.location_version,
        userAccessRevision: responder.presence_access_revision,
        spaceAccessRevision: space.presence_access_revision,
      });
      const requestId = randomUUID();

      await fixtures.sql(
        `insert into public.knock_requests (
         id,
         space_id,
         requester_id,
         requester_name,
         requester_avatar_url,
         company_id,
         expires_at,
         requester_location_version,
         requester_access_revision,
         space_access_revision,
         status,
         created_at,
         updated_at
       )
       values (
         $1,
         $2,
         $3,
         'Requester',
         null,
         $4,
         pg_catalog.clock_timestamp() + interval '5 minutes',
         $5,
         $6,
         $7,
         'pending',
         pg_catalog.clock_timestamp(),
         pg_catalog.clock_timestamp()
       )`,
        [
          requestId,
          space.id,
          requester.id,
          companyId,
          requester.location_version,
          requester.presence_access_revision,
          space.presence_access_revision,
        ],
      );

      await withClient(async (blocker) => {
        await withClient(async (caller) => {
          await blocker.query("begin");
          await blocker.query(
            "select id from public.users where id = $1 for no key update",
            [requester.id],
          );
          const blockerPid = (
            await blocker.query<{ readonly pid: number }>(
              "select pg_catalog.pg_backend_pid() as pid",
            )
          ).rows[0]!.pid;
          const callerPid = (
            await caller.query<{ readonly pid: number }>(
              "select pg_catalog.pg_backend_pid() as pid",
            )
          ).rows[0]!.pid;

          const create = caller.query<{ readonly result: RpcResult }>(
            `select public.create_knock_request(
             $1, $2, $3, $4, $5
           ) as result`,
            [
              requester.id,
              requesterAuthSessionId,
              requesterSession.id,
              space.id,
              requestId,
            ],
          );

          await waitForObservedLock({
            waitingPid: callerPid,
            blockingPid: blockerPid,
            queryPattern: "create_knock_request",
          });

          await blocker.query(
            `update public.knock_requests
           set status = 'approved',
               decision = 'APPROVE',
               responder_id = $2,
               responder_name = 'Responder',
               responder_access_revision = $3,
               updated_at = pg_catalog.clock_timestamp()
           where id = $1`,
            [requestId, responder.id, responder.presence_access_revision],
          );
          await blocker.query("commit");

          expect((await create).rows[0]?.result).toEqual({
            ok: false,
            code: "RETRY_LOCK_SET",
          });
        });
      });

      const [afterRetry] = await fixtures.sql<{
        readonly location_version: number;
        readonly placement_version: number | null;
        readonly status: string;
        readonly responder_id: string | null;
      }>(
        `select
         member.location_version,
         session.placement_version,
         knock.status,
         knock.responder_id
       from public.users as member
       join public.user_presence_sessions as session
         on session.id = $2
       join public.knock_requests as knock
         on knock.id = $3
       where member.id = $1`,
        [requester.id, requesterSession.id, requestId],
      );
      expect(afterRetry).toEqual({
        location_version: 0,
        placement_version: null,
        status: "approved",
        responder_id: responder.id,
      });

      await withClient(async (caller) => {
        const stable = await caller.query<{ readonly result: RpcResult }>(
          `select public.create_knock_request(
           $1, $2, $3, $4, $5
         ) as result`,
          [
            requester.id,
            requesterAuthSessionId,
            requesterSession.id,
            space.id,
            requestId,
          ],
        );
        expect(stable.rows[0]?.result).toMatchObject({
          ok: true,
          code: "KNOCK_CREATED",
          status: "approved",
          alreadyApplied: true,
        });

        const differentId = await caller.query<{ readonly result: RpcResult }>(
          `select public.create_knock_request(
           $1, $2, $3, $4, $5
         ) as result`,
          [
            requester.id,
            requesterAuthSessionId,
            requesterSession.id,
            space.id,
            randomUUID(),
          ],
        );
        expect(differentId.rows[0]?.result).toMatchObject({
          ok: false,
          code: "KNOCK_RATE_LIMITED",
        });
      });

      const fallbackResponder = await createUser(
        companyId,
        "knock-fallback-responder",
        space.id,
      );
      await createSession({
        companyId,
        userId: fallbackResponder.id,
        authSessionId: randomUUID(),
        spaceId: space.id,
        placementVersion: fallbackResponder.location_version,
        userAccessRevision: fallbackResponder.presence_access_revision,
        spaceAccessRevision: space.presence_access_revision,
      });
      const otherCompanyId = await createCompany("cross-company-responder");
      const [movedResponder] = await fixtures.sql<{
        readonly presence_access_revision: string;
      }>(
        `update public.users
         set company_id = $2
         where id = $1
         returning presence_access_revision`,
        [responder.id, otherCompanyId],
      );
      await fixtures.sql(
        `update public.knock_requests
         set responder_access_revision = $2
         where id = $1`,
        [requestId, movedResponder!.presence_access_revision],
      );

      await withClient(async (caller) => {
        const staleApproval = await caller.query<{
          readonly result: RpcResult;
        }>(
          `select public.create_knock_request(
             $1, $2, $3, $4, $5
           ) as result`,
          [
            requester.id,
            requesterAuthSessionId,
            requesterSession.id,
            space.id,
            requestId,
          ],
        );
        expect(staleApproval.rows[0]?.result).toMatchObject({
          ok: false,
          code: "KNOCK_SUPERSEDED",
        });
      });

      const [expired] = await fixtures.sql<{ readonly status: string }>(
        `select status from public.knock_requests where id = $1`,
        [requestId],
      );
      expect(expired?.status).toBe("expired");
    },
  );
});
