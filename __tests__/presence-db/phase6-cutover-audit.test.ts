import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PresenceFixtures } from "./fixtures";
import { LOCAL_DB_URL } from "./setup";
import { presenceConcurrencyTestName } from "./concurrency/support";
import { createServiceClient } from "./auth-clients";

type CountRow = { readonly call_count: string };
type FingerprintRow = { readonly fingerprint: string };

const utcDayExpression = `(pg_catalog.clock_timestamp() at time zone 'UTC')::date`;
const serviceClient = createServiceClient();

async function recordRouteCall(routeGroup: string): Promise<void> {
  const { error } = await serviceClient.rpc(
    "record_legacy_presence_route_call",
    {
      p_route_group: routeGroup,
    },
  );
  if (error) throw new Error(error.message);
}

describe("presence-db Phase 6 immutable legacy cutover audit", () => {
  let fixtures: PresenceFixtures;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect("phase6-cutover-audit");
  });

  afterAll(async () => {
    if (fixtures) await fixtures.end();
  });

  async function writeCount(fieldGroup: string): Promise<number> {
    const [row] = await fixtures.sql<CountRow>(
      `select call_count::text as call_count
       from private.presence_legacy_user_write_audit
       where event_day = ${utcDayExpression}
         and field_group = $1`,
      [fieldGroup],
    );
    return Number(row?.call_count ?? 0);
  }

  async function routeCount(routeGroup: string): Promise<number> {
    const [row] = await fixtures.sql<CountRow>(
      `select call_count::text as call_count
       from private.presence_legacy_route_call_audit
       where event_day = ${utcDayExpression}
         and route_group = $1`,
      [routeGroup],
    );
    return Number(row?.call_count ?? 0);
  }

  async function rollbackQuietly(): Promise<void> {
    await fixtures.sql("rollback").catch(() => undefined);
  }

  async function asPmo<T>(fn: () => Promise<T>): Promise<T> {
    await fixtures.sql("grant presence_maintenance_owner to postgres");
    await fixtures.sql("set role presence_maintenance_owner");
    try {
      return await fn();
    } finally {
      try {
        await fixtures.sql("reset role");
      } catch {
        await rollbackQuietly();
        await fixtures.sql("reset role");
      }
      await fixtures.sql("revoke presence_maintenance_owner from postgres");
    }
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
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `No observed lock from PID ${params.blockingPid} to PID ${params.waitingPid}`,
    );
  }

  it("installs the four FORCE-RLS tables with a NOLOGIN isolated owner", async () => {
    const tables = await fixtures.sql<{
      readonly relname: string;
      readonly relrowsecurity: boolean;
      readonly relforcerowsecurity: boolean;
      readonly owner_name: string;
    }>(
      `select c.relname,
              c.relrowsecurity,
              c.relforcerowsecurity,
              pg_catalog.pg_get_userbyid(c.relowner) as owner_name
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'private'
         and c.relname in (
           'presence_legacy_user_write_audit',
           'presence_legacy_route_call_audit',
           'presence_legacy_cutover_audit_meta',
           'presence_legacy_cutover_audit_coverage'
         )
       order by c.relname`,
    );

    expect(tables).toHaveLength(4);
    expect(
      tables.every(
        (table) =>
          table.relrowsecurity &&
          table.relforcerowsecurity &&
          table.owner_name === "presence_maintenance_owner",
      ),
    ).toBe(true);

    const [owner] = await fixtures.sql<{
      readonly rolcanlogin: boolean;
      readonly rolinherit: boolean;
      readonly rolbypassrls: boolean;
      readonly memberships: string;
    }>(
      `select r.rolcanlogin,
              r.rolinherit,
              r.rolbypassrls,
              (
                select count(*)::text
                from pg_catalog.pg_auth_members as m
                where m.roleid = r.oid or m.member = r.oid
              ) as memberships
       from pg_catalog.pg_roles as r
       where r.rolname = 'presence_maintenance_owner'`,
    );

    expect(owner).toMatchObject({
      rolcanlogin: false,
      rolinherit: false,
      rolbypassrls: false,
      memberships: "0",
    });
  });

  it("has the exact enabled triggers and minute-five postgres Cron job", async () => {
    const triggers = await fixtures.sql<{ readonly tgname: string }>(
      `select t.tgname
       from pg_catalog.pg_trigger as t
       join pg_catalog.pg_class as c on c.oid = t.tgrelid
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where not t.tgisinternal
         and t.tgenabled = 'O'
         and (
           (n.nspname = 'public' and c.relname = 'users'
             and t.tgname like 'presence_audit_users_%')
           or (n.nspname = 'private'
             and c.relname = 'presence_legacy_cutover_audit_meta'
             and t.tgname = 'presence_audit_meta_immutable')
         )
       order by t.tgname`,
    );

    expect(triggers.map((row) => row.tgname)).toEqual([
      "presence_audit_meta_immutable",
      "presence_audit_users_any_authenticated_update",
      "presence_audit_users_current_space_id",
      "presence_audit_users_last_active",
      "presence_audit_users_status",
    ]);

    const cronRows = await asPmo(() =>
      fixtures.sql<{
        readonly jobname: string;
        readonly schedule: string;
        readonly command: string;
        readonly database: string;
        readonly username: string;
        readonly active: boolean;
      }>("select * from private.read_presence_cutover_audit_cron_job()"),
    );

    expect(cronRows).toEqual([
      {
        jobname: "presence-audit-legacy-cutover-v1",
        schedule: "5 * * * *",
        command:
          "select private.record_presence_legacy_cutover_audit_coverage();",
        database: "postgres",
        username: "postgres",
        active: true,
      },
    ]);
  });

  it("counts authenticated statements, including same-value zero-row attempts", async () => {
    const beforeStatus = await writeCount("status");
    const beforeAny = await writeCount("any_authenticated_users_update");

    await fixtures.sql(`
      begin;
      select pg_catalog.set_config(
        'request.jwt.claims',
        '{"role":"authenticated"}',
        true
      );
      update public.users set status = status where false;
      commit;
    `);

    expect(await writeCount("status")).toBe(beforeStatus + 1);
    expect(await writeCount("any_authenticated_users_update")).toBe(
      beforeAny + 1,
    );
  });

  it("excludes service-role statements and rejects unclassified writers", async () => {
    const beforeStatus = await writeCount("status");
    const beforeAny = await writeCount("any_authenticated_users_update");

    await fixtures.sql(`update public.users set status = status where false`);

    expect(await writeCount("status")).toBe(beforeStatus);
    expect(await writeCount("any_authenticated_users_update")).toBe(beforeAny);

    try {
      await fixtures.sql(`
        begin;
        select pg_catalog.set_config('request.jwt.claims', '{}', true);
        update public.users set status = status where false;
      `);
      throw new Error("expected unclassified writer rejection");
    } catch (error) {
      expect((error as Error).message).toContain(
        "PRESENCE_AUDIT_ROLE_UNVERIFIED",
      );
    } finally {
      await rollbackQuietly();
    }
  });

  it("accepts exact internal markers but never as an authenticated bypass", async () => {
    await fixtures.sql(`
      begin;
      select pg_catalog.set_config('request.jwt.claims', '{}', true);
      select pg_catalog.set_config(
        'app.presence_internal_writer',
        'atomic-transition',
        true
      );
      update public.users set current_space_id = current_space_id where false;
      commit;
    `);

    try {
      await fixtures.sql(`
        begin;
        select pg_catalog.set_config(
          'request.jwt.claims',
          '{"role":"authenticated"}',
          true
        );
        select pg_catalog.set_config(
          'app.presence_internal_writer',
          'atomic-transition',
          true
        );
        update public.users set current_space_id = current_space_id where false;
      `);
      throw new Error("expected authenticated marker rejection");
    } catch (error) {
      expect((error as Error).message).toContain(
        "PRESENCE_AUDIT_INTERNAL_WRITER_FORBIDDEN",
      );
    } finally {
      await rollbackQuietly();
    }
  });

  it("records only the two aggregate route groups through the service RPC", async () => {
    const beforeLocation = await routeCount("users-location");
    const beforeOffline = await routeCount("users-offline-status");

    await recordRouteCall("users-location");
    await recordRouteCall("users-offline-status");

    expect(await routeCount("users-location")).toBe(beforeLocation + 1);
    expect(await routeCount("users-offline-status")).toBe(beforeOffline + 1);
    await expect(recordRouteCall("identity-bearing-detail")).rejects.toThrow(
      "PRESENCE_LEGACY_ROUTE_GROUP_INVALID",
    );
  });

  it("keeps metadata immutable and never repairs the current coverage bucket", async () => {
    await expect(
      asPmo(() =>
        fixtures.sql(`
        update private.presence_legacy_cutover_audit_meta
        set installed_at = installed_at
        where singleton_id
      `),
      ),
    ).rejects.toThrow("PRESENCE_LEGACY_CUTOVER_META_IMMUTABLE");

    const [first] = await fixtures.sql<{
      readonly coverage_hour: Date;
      readonly checked_at: Date;
      readonly schema_fingerprint: string;
      readonly healthy: boolean;
    }>(`select * from private.record_presence_legacy_cutover_audit_coverage()`);
    const [second] = await fixtures.sql<{
      readonly coverage_hour: Date;
      readonly checked_at: Date;
      readonly schema_fingerprint: string;
      readonly healthy: boolean;
    }>(`select * from private.record_presence_legacy_cutover_audit_coverage()`);

    expect(second).toEqual(first);
  });

  it("fingerprints trigger drift transactionally and restores it on rollback", async () => {
    const [baseline] = await fixtures.sql<FingerprintRow>(
      `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
    );

    try {
      await fixtures.sql("begin");
      await fixtures.sql(
        `alter table public.users disable trigger presence_audit_users_status`,
      );
      const [drifted] = await fixtures.sql<FingerprintRow>(
        `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
      );
      expect(drifted?.fingerprint).not.toBe(baseline?.fingerprint);
    } finally {
      await rollbackQuietly();
    }

    const [restored] = await fixtures.sql<FingerprintRow>(
      `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
    );
    expect(restored?.fingerprint).toBe(baseline?.fingerprint);
  });

  it("fingerprints the direct service-role membership gate function body", async () => {
    await fixtures.sql(
      "grant create on schema private to presence_maintenance_owner",
    );
    try {
      await asPmo(async () => {
        await fixtures.sql(`
          grant execute on function private.reject_direct_service_role_membership_write()
            to presence_maintenance_owner
        `);
        try {
          const [baseline] = await fixtures.sql<FingerprintRow>(
            `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
          );
          try {
            await fixtures.sql("begin");
            await fixtures.sql(
              `create or replace function private.reject_direct_service_role_membership_write()
               returns trigger
               language plpgsql
               set search_path = pg_catalog
               as $$
               begin
                 return new;
               end;
               $$`,
            );
            const [drifted] = await fixtures.sql<FingerprintRow>(
              `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
            );
            expect(drifted?.fingerprint).not.toBe(baseline?.fingerprint);
          } finally {
            await rollbackQuietly();
          }
          const [restored] = await fixtures.sql<FingerprintRow>(
            `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
          );
          expect(restored?.fingerprint).toBe(baseline?.fingerprint);
        } finally {
          await fixtures.sql(
            `revoke execute on function private.reject_direct_service_role_membership_write()
               from presence_maintenance_owner`,
          );
        }
      });
    } finally {
      await fixtures.sql(
        "revoke create on schema private from presence_maintenance_owner",
      );
    }
  });

  it("invalidates the fingerprint and health when platform-admin RLS is disabled", async () => {
    const [baseline] = await fixtures.sql<FingerprintRow>(
      `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
    );
    if (!baseline) throw new Error("Missing audit fingerprint baseline");

    try {
      await fixtures.sql("begin");
      await fixtures.sql(
        "alter table public.platform_admins disable row level security",
      );
      const [drifted] = await fixtures.sql<FingerprintRow>(
        `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
      );
      const [health] = await fixtures.sql<{ readonly healthy: boolean }>(
        `select private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
        [baseline.fingerprint],
      );
      expect(drifted?.fingerprint).not.toBe(baseline.fingerprint);
      expect(health?.healthy).toBe(false);
    } finally {
      await rollbackQuietly();
    }

    const [restored] = await fixtures.sql<{
      readonly fingerprint: string;
      readonly healthy: boolean;
    }>(
      `select private.compute_presence_cutover_audit_fingerprint() as fingerprint,
              private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
      [baseline.fingerprint],
    );
    expect(restored).toEqual({
      fingerprint: baseline.fingerprint,
      healthy: true,
    });
  });

  it("invalidates the fingerprint and health for any new platform-admin policy", async () => {
    const [baseline] = await fixtures.sql<FingerprintRow>(
      `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
    );
    if (!baseline) throw new Error("Missing audit fingerprint baseline");

    try {
      await fixtures.sql("begin");
      await fixtures.sql(`
        create policy platform_admin_audit_probe
          on public.platform_admins
          for select
          to authenticated
          using (true)
      `);
      const [drifted] = await fixtures.sql<FingerprintRow>(
        `select private.compute_presence_cutover_audit_fingerprint() as fingerprint`,
      );
      const [health] = await fixtures.sql<{ readonly healthy: boolean }>(
        `select private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
        [baseline.fingerprint],
      );
      expect(drifted?.fingerprint).not.toBe(baseline.fingerprint);
      expect(health?.healthy).toBe(false);
    } finally {
      await rollbackQuietly();
    }

    const [restored] = await fixtures.sql<{
      readonly fingerprint: string;
      readonly healthy: boolean;
    }>(
      `select private.compute_presence_cutover_audit_fingerprint() as fingerprint,
              private.is_presence_cutover_audit_catalog_healthy($1) as healthy`,
      [baseline.fingerprint],
    );
    expect(restored).toEqual({
      fingerprint: baseline.fingerprint,
      healthy: true,
    });
  });

  it("pins the company-scoped session registration writer boundary", async () => {
    const [writer] = await fixtures.sql<{
      readonly owner_name: string;
      readonly security_definer: boolean;
      readonly config: string[];
      readonly service_execute: boolean;
      readonly owner_execute: boolean;
      readonly postgres_acl_execute: boolean;
      readonly authenticated_execute: boolean;
    }>(`
      select pg_catalog.pg_get_userbyid(function_row.proowner) as owner_name,
             function_row.prosecdef as security_definer,
             function_row.proconfig as config,
             pg_catalog.has_function_privilege(
               'service_role', function_row.oid, 'EXECUTE'
             ) as service_execute,
             pg_catalog.has_function_privilege(
               'presence_maintenance_owner', function_row.oid, 'EXECUTE'
             ) as owner_execute,
             exists (
               select 1
               from pg_catalog.aclexplode(
                 coalesce(
                   function_row.proacl,
                   pg_catalog.acldefault('f', function_row.proowner)
                 )
               ) as privilege
               where privilege.grantee = 'postgres'::pg_catalog.regrole::oid
                 and privilege.privilege_type = 'EXECUTE'
             ) as postgres_acl_execute,
             pg_catalog.has_function_privilege(
               'authenticated', function_row.oid, 'EXECUTE'
             ) as authenticated_execute
      from pg_catalog.pg_proc as function_row
      where function_row.oid = pg_catalog.to_regprocedure(
        'public.register_presence_session(uuid,uuid,uuid,uuid)'
      )
    `);

    expect(writer).toEqual({
      owner_name: "presence_maintenance_owner",
      security_definer: true,
      config: ["search_path=pg_catalog"],
      service_execute: true,
      owner_execute: false,
      postgres_acl_execute: false,
      authenticated_execute: false,
    });
  });

  it("requires the Phase 10 lock set before evaluating seven-day evidence", async () => {
    await expect(
      fixtures.sql(`select private.assert_presence_legacy_cutover_gate()`),
    ).rejects.toThrow("PRESENCE_LEGACY_CUTOVER_LOCKS_REQUIRED");

    try {
      await fixtures.sql("begin");
      await fixtures.sql("lock table public.users in access exclusive mode");
      await expect(
        fixtures.sql(`select private.assert_presence_legacy_cutover_gate()`),
      ).rejects.toThrow("PRESENCE_LEGACY_CUTOVER_GATE_FAILED");
    } finally {
      await rollbackQuietly();
    }
  });

  it("installs postgres-only adapter disable and removal gates", async () => {
    const functions = await fixtures.sql<{
      readonly proname: string;
      readonly owner_name: string;
      readonly prosecdef: boolean;
      readonly proconfig: string[];
      readonly postgres_execute: boolean;
      readonly authenticated_execute: boolean;
      readonly service_execute: boolean;
    }>(
      `select p.proname,
              pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
              p.prosecdef,
              p.proconfig,
              pg_catalog.has_function_privilege(
                'postgres', p.oid, 'EXECUTE'
              ) as postgres_execute,
              pg_catalog.has_function_privilege(
                'authenticated', p.oid, 'EXECUTE'
              ) as authenticated_execute,
              pg_catalog.has_function_privilege(
                'service_role', p.oid, 'EXECUTE'
              ) as service_execute
       from pg_catalog.pg_proc as p
       join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
       where (n.nspname, p.proname) in (
         ('public', 'disable_legacy_presence_adapter'),
         ('private', 'assert_presence_legacy_adapter_removal_gate')
       )
       order by p.proname`,
    );

    expect(functions).toHaveLength(2);
    expect(
      functions.every(
        (fn) =>
          fn.owner_name === "presence_maintenance_owner" &&
          fn.prosecdef &&
          fn.proconfig.join(",") === "search_path=pg_catalog" &&
          fn.postgres_execute &&
          !fn.authenticated_execute &&
          !fn.service_execute,
      ),
    ).toBe(true);

    await expect(
      fixtures.sql(
        `select private.assert_presence_legacy_adapter_removal_gate()`,
      ),
    ).rejects.toThrow("PRESENCE_LEGACY_ADAPTER_REMOVAL_GATE_FAILED");
  });

  it("rejects an unsafe adapter-gate ACL before accepting a baseline", async () => {
    await fixtures.sql("grant presence_maintenance_owner to postgres");
    await fixtures.sql("set role presence_maintenance_owner");
    try {
      await fixtures.sql("begin");
      await fixtures.sql(
        `grant execute on function public.disable_legacy_presence_adapter(uuid)
           to authenticated`,
      );
      await fixtures.sql("reset role");
      await fixtures.sql("revoke presence_maintenance_owner from postgres");
      const [health] = await fixtures.sql<{ readonly healthy: boolean }>(
        `select private.is_presence_cutover_audit_catalog_healthy(null) as healthy`,
      );
      expect(health?.healthy).toBe(false);
    } finally {
      await rollbackQuietly();
      await fixtures.sql("reset role").catch(() => undefined);
      await fixtures
        .sql("revoke presence_maintenance_owner from postgres")
        .catch(() => undefined);
    }
  });

  it(
    presenceConcurrencyTestName(
      "57-breaking-audit-races",
      "serializes breaking audit checks after direct-write and route receipts",
    ),
    async () => {
      const writerRole = `phase57_writer_${randomUUID().replaceAll("-", "")}`;
      const writerPassword = `phase57_writer_${randomUUID().replaceAll("-", "")}`;
      const receiptRole = `phase57_receipt_${randomUUID().replaceAll("-", "")}`;
      const receiptPassword = `phase57_receipt_${randomUUID().replaceAll("-", "")}`;
      const writerUrl = new URL(LOCAL_DB_URL);
      writerUrl.username = writerRole;
      writerUrl.password = writerPassword;
      const receiptUrl = new URL(LOCAL_DB_URL);
      receiptUrl.username = receiptRole;
      receiptUrl.password = receiptPassword;
      const writerConnection = new Client({
        connectionString: writerUrl.toString(),
      });
      const receiptConnection = new Client({
        connectionString: receiptUrl.toString(),
      });
      const breakingConnection = new Client({ connectionString: LOCAL_DB_URL });
      let backupCreated = false;

      await fixtures.sql(`
        create role ${writerRole} login password '${writerPassword}' noinherit;
        grant authenticated to ${writerRole};
        create role ${receiptRole} login password '${receiptPassword}' noinherit;
        grant service_role to ${receiptRole};
      `);
      await writerConnection.connect();
      await receiptConnection.connect();
      await breakingConnection.connect();

      try {
        await asPmo(() =>
          fixtures.sql(`
            create temp table phase57_meta_backup on commit preserve rows as
              table private.presence_legacy_cutover_audit_meta;
            create temp table phase57_coverage_backup on commit preserve rows as
              table private.presence_legacy_cutover_audit_coverage;
            create temp table phase57_direct_backup on commit preserve rows as
              table private.presence_legacy_user_write_audit;
            create temp table phase57_route_backup on commit preserve rows as
              table private.presence_legacy_route_call_audit;
          `),
        );
        await fixtures.sql(`
          create temp table phase57_fingerprint on commit preserve rows as
            select private.compute_presence_cutover_audit_fingerprint() as value;
          grant select on table pg_temp.phase57_fingerprint
            to presence_maintenance_owner;
        `);
        backupCreated = true;

        await asPmo(() =>
          fixtures.sql(`
            begin;
            alter table private.presence_legacy_cutover_audit_coverage
              no force row level security;
            alter table private.presence_legacy_user_write_audit
              no force row level security;
            alter table private.presence_legacy_route_call_audit
              no force row level security;
            alter table private.presence_legacy_cutover_audit_meta
              no force row level security;
            alter table private.presence_legacy_cutover_audit_meta
              disable trigger presence_audit_meta_immutable;
            update private.presence_legacy_cutover_audit_meta
            set installed_at = (
                  (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 8
                )::timestamp at time zone 'UTC',
                observation_started_at = (
                  (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 8
                )::timestamp at time zone 'UTC',
                expected_schema_fingerprint = (
                  select value from pg_temp.phase57_fingerprint
                ),
                disabled_at = null
            where singleton_id;
            alter table private.presence_legacy_cutover_audit_meta
              enable trigger presence_audit_meta_immutable;

            delete from private.presence_legacy_cutover_audit_coverage;
            insert into private.presence_legacy_cutover_audit_coverage (
              coverage_hour,
              checked_at,
              schema_fingerprint,
              healthy
            )
            select
              hour_value,
              hour_value + interval '5 minutes',
              (select value from pg_temp.phase57_fingerprint),
              true
            from pg_catalog.generate_series(
              (
                (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 7
              )::timestamp at time zone 'UTC',
              (
                (pg_catalog.transaction_timestamp() at time zone 'UTC')::date
              )::timestamp at time zone 'UTC' - interval '1 hour',
              interval '1 hour'
            ) as generated(hour_value);

            delete from private.presence_legacy_user_write_audit;
            delete from private.presence_legacy_route_call_audit;

            alter table private.presence_legacy_cutover_audit_coverage
              force row level security;
            alter table private.presence_legacy_user_write_audit
              force row level security;
            alter table private.presence_legacy_route_call_audit
              force row level security;
            alter table private.presence_legacy_cutover_audit_meta
              force row level security;
            commit;
          `),
        );

        await writerConnection.query("begin");
        await writerConnection.query("set local role authenticated");
        await writerConnection.query(
          `select pg_catalog.set_config(
             'request.jwt.claims',
             '{"role":"authenticated"}',
             true
           )`,
        );
        await writerConnection.query(
          "update public.users set status = status where false",
        );
        const writerPid = (
          await writerConnection.query<{ readonly pid: number }>(
            "select pg_catalog.pg_backend_pid() as pid",
          )
        ).rows[0]!.pid;
        const breakingPid = (
          await breakingConnection.query<{ readonly pid: number }>(
            "select pg_catalog.pg_backend_pid() as pid",
          )
        ).rows[0]!.pid;

        await breakingConnection.query("begin");
        const breakingUsersLock = breakingConnection.query(
          "lock table public.users in access exclusive mode",
        );
        await waitForObservedLock({
          waitingPid: breakingPid,
          blockingPid: writerPid,
          queryPattern: "lock table public.users",
        });
        await writerConnection.query("commit");
        await breakingUsersLock;
        await expect(
          breakingConnection.query(
            "select private.assert_presence_legacy_cutover_gate()",
          ),
        ).rejects.toThrow("PRESENCE_LEGACY_CUTOVER_RECEIPTS_NONZERO");
        await breakingConnection.query("rollback");
        expect(await writeCount("any_authenticated_users_update")).toBe(1);

        await asPmo(() =>
          fixtures.sql(`
            begin;
            alter table private.presence_legacy_user_write_audit
              no force row level security;
            delete from private.presence_legacy_user_write_audit;
            alter table private.presence_legacy_user_write_audit
              force row level security;
            commit;
          `),
        );

        await receiptConnection.query("begin");
        await receiptConnection.query("set local role service_role");
        await receiptConnection.query(
          "select public.record_legacy_presence_route_call('users-location')",
        );
        const receiptPid = (
          await receiptConnection.query<{ readonly pid: number }>(
            "select pg_catalog.pg_backend_pid() as pid",
          )
        ).rows[0]!.pid;

        await breakingConnection.query("begin");
        await breakingConnection.query(
          "lock table public.users in access exclusive mode",
        );
        const breakingGate = breakingConnection
          .query("select private.assert_presence_legacy_cutover_gate()")
          .then(
            () => ({ error: null }),
            (error: Error) => ({ error }),
          );
        await waitForObservedLock({
          waitingPid: breakingPid,
          blockingPid: receiptPid,
          queryPattern: "assert_presence_legacy_cutover_gate",
        });
        await receiptConnection.query("commit");
        const gateResult = await breakingGate;
        expect(gateResult.error?.message).toContain(
          "PRESENCE_LEGACY_CUTOVER_RECEIPTS_NONZERO",
        );
        await breakingConnection.query("rollback");
        expect(await routeCount("users-location")).toBe(1);
      } finally {
        await writerConnection.query("rollback").catch(() => undefined);
        await receiptConnection.query("rollback").catch(() => undefined);
        await breakingConnection.query("rollback").catch(() => undefined);
        await writerConnection.end();
        await receiptConnection.end();
        await breakingConnection.end();
        await fixtures
          .sql(`drop role if exists ${writerRole}`)
          .catch(() => undefined);
        await fixtures
          .sql(`drop role if exists ${receiptRole}`)
          .catch(() => undefined);

        if (backupCreated) {
          await asPmo(() =>
            fixtures.sql(`
              begin;
              alter table private.presence_legacy_cutover_audit_coverage
                no force row level security;
              alter table private.presence_legacy_user_write_audit
                no force row level security;
              alter table private.presence_legacy_route_call_audit
                no force row level security;
              alter table private.presence_legacy_cutover_audit_meta
                no force row level security;
              delete from private.presence_legacy_cutover_audit_coverage;
              insert into private.presence_legacy_cutover_audit_coverage
                select * from pg_temp.phase57_coverage_backup;
              delete from private.presence_legacy_user_write_audit;
              insert into private.presence_legacy_user_write_audit
                select * from pg_temp.phase57_direct_backup;
              delete from private.presence_legacy_route_call_audit;
              insert into private.presence_legacy_route_call_audit
                select * from pg_temp.phase57_route_backup;

              alter table private.presence_legacy_cutover_audit_meta
                disable trigger presence_audit_meta_immutable;
              delete from private.presence_legacy_cutover_audit_meta;
              insert into private.presence_legacy_cutover_audit_meta
                select * from pg_temp.phase57_meta_backup;
              alter table private.presence_legacy_cutover_audit_meta
                enable trigger presence_audit_meta_immutable;

              alter table private.presence_legacy_cutover_audit_coverage
                force row level security;
              alter table private.presence_legacy_user_write_audit
                force row level security;
              alter table private.presence_legacy_route_call_audit
                force row level security;
              alter table private.presence_legacy_cutover_audit_meta
                force row level security;
              commit;
            `),
          );
        }
      }
    },
  );

  it(
    presenceConcurrencyTestName(
      "58-adapter-disable",
      "serializes a concurrent route receipt before adapter disable and fails closed",
    ),
    async () => {
      const receiptRole = `phase6_receipt_${randomUUID().replaceAll("-", "")}`;
      const receiptPassword = `phase6_receipt_${randomUUID().replaceAll("-", "")}`;
      const receiptUrl = new URL(LOCAL_DB_URL);
      receiptUrl.username = receiptRole;
      receiptUrl.password = receiptPassword;
      const receiptConnection = new Client({
        connectionString: receiptUrl.toString(),
      });
      const disableConnection = new Client({ connectionString: LOCAL_DB_URL });
      const cutoverId = randomUUID();
      let backupCreated = false;

      await fixtures.sql(`
      create role ${receiptRole} login password '${receiptPassword}' noinherit;
      grant service_role to ${receiptRole};
    `);
      await receiptConnection.connect();
      await disableConnection.connect();

      try {
        await asPmo(() =>
          fixtures.sql(`
        create temp table phase6_meta_backup on commit preserve rows as
          table private.presence_legacy_cutover_audit_meta;
        create temp table phase6_coverage_backup on commit preserve rows as
          table private.presence_legacy_cutover_audit_coverage;
        create temp table phase6_direct_backup on commit preserve rows as
          table private.presence_legacy_user_write_audit;
        create temp table phase6_route_backup on commit preserve rows as
          table private.presence_legacy_route_call_audit;
        create temp table phase6_control_backup on commit preserve rows as
          table private.presence_runtime_control;
      `),
        );
        await fixtures.sql(`
        create temp table phase6_fingerprint on commit preserve rows as
          select private.compute_presence_cutover_audit_fingerprint() as value;
        grant select on table pg_temp.phase6_fingerprint
          to presence_maintenance_owner
      `);
        backupCreated = true;

        await asPmo(() =>
          fixtures.sql(`
        begin;
        alter table private.presence_legacy_cutover_audit_coverage
          no force row level security;
        alter table private.presence_legacy_user_write_audit
          no force row level security;
        alter table private.presence_legacy_route_call_audit
          no force row level security;
        alter table private.presence_legacy_cutover_audit_meta
          no force row level security;
        alter table private.presence_legacy_cutover_audit_meta
          disable trigger presence_audit_meta_immutable;
        update private.presence_legacy_cutover_audit_meta
        set installed_at = (
              (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 8
            )::timestamp at time zone 'UTC',
            observation_started_at = (
              (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 8
            )::timestamp at time zone 'UTC',
            expected_schema_fingerprint = (
              select value from pg_temp.phase6_fingerprint
            ),
            disabled_at = null
        where singleton_id;
        alter table private.presence_legacy_cutover_audit_meta
          enable trigger presence_audit_meta_immutable;

        delete from private.presence_legacy_cutover_audit_coverage;
        insert into private.presence_legacy_cutover_audit_coverage (
          coverage_hour,
          checked_at,
          schema_fingerprint,
          healthy
        )
        select
          hour_value,
          hour_value + interval '5 minutes',
          (select value from pg_temp.phase6_fingerprint),
          true
        from pg_catalog.generate_series(
          (
            (pg_catalog.transaction_timestamp() at time zone 'UTC')::date - 7
          )::timestamp at time zone 'UTC',
          (
            (pg_catalog.transaction_timestamp() at time zone 'UTC')::date
          )::timestamp at time zone 'UTC' - interval '1 hour',
          interval '1 hour'
        ) as generated(hour_value);

        delete from private.presence_legacy_user_write_audit;
        delete from private.presence_legacy_route_call_audit;
        update private.presence_runtime_control
        set mode = 'atomic',
            cutover_id = '${cutoverId}'::uuid,
            changed_at = pg_catalog.clock_timestamp(),
            changed_by = 'phase6-cutover-audit-test',
            legacy_adapter_enabled = true,
            legacy_adapter_disabled_at = null
        where singleton_id;

        alter table private.presence_legacy_cutover_audit_coverage
          force row level security;
        alter table private.presence_legacy_user_write_audit
          force row level security;
        alter table private.presence_legacy_route_call_audit
          force row level security;
        alter table private.presence_legacy_cutover_audit_meta
          force row level security;
        commit;
      `),
        );

        await receiptConnection.query("begin");
        await receiptConnection.query("set local role service_role");
        await receiptConnection.query(
          `select public.record_legacy_presence_route_call('users-location')`,
        );

        await disableConnection.query("begin");
        await disableConnection.query(
          "lock table public.users in access exclusive mode",
        );

        let disableSettled = false;
        const disablePromise = disableConnection
          .query(`select public.disable_legacy_presence_adapter($1)`, [
            cutoverId,
          ])
          .then(
            () => ({ error: null }),
            (error: Error) => ({ error }),
          )
          .finally(() => {
            disableSettled = true;
          });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(disableSettled).toBe(false);

        await receiptConnection.query("commit");
        const disableResult = await disablePromise;
        expect(disableResult.error?.message).toContain(
          "PRESENCE_LEGACY_CUTOVER_RECEIPTS_NONZERO",
        );
        await disableConnection.query("rollback");

        const [control] = await asPmo(() =>
          fixtures.sql<{
            readonly legacy_adapter_enabled: boolean;
            readonly legacy_adapter_disabled_at: Date | null;
          }>(
            `select legacy_adapter_enabled, legacy_adapter_disabled_at
         from private.presence_runtime_control
         where singleton_id`,
          ),
        );
        expect(control).toEqual({
          legacy_adapter_enabled: true,
          legacy_adapter_disabled_at: null,
        });
      } finally {
        await receiptConnection.query("rollback").catch(() => undefined);
        await disableConnection.query("rollback").catch(() => undefined);
        await receiptConnection.end();
        await disableConnection.end();
        await fixtures
          .sql(`drop role if exists ${receiptRole}`)
          .catch(() => undefined);

        if (backupCreated) {
          await asPmo(() =>
            fixtures.sql(`
          begin;
          alter table private.presence_legacy_cutover_audit_coverage
            no force row level security;
          alter table private.presence_legacy_user_write_audit
            no force row level security;
          alter table private.presence_legacy_route_call_audit
            no force row level security;
          alter table private.presence_legacy_cutover_audit_meta
            no force row level security;
          delete from private.presence_legacy_cutover_audit_coverage;
          insert into private.presence_legacy_cutover_audit_coverage
            select * from pg_temp.phase6_coverage_backup;
          delete from private.presence_legacy_user_write_audit;
          insert into private.presence_legacy_user_write_audit
            select * from pg_temp.phase6_direct_backup;
          delete from private.presence_legacy_route_call_audit;
          insert into private.presence_legacy_route_call_audit
            select * from pg_temp.phase6_route_backup;

          alter table private.presence_legacy_cutover_audit_meta
            disable trigger presence_audit_meta_immutable;
          delete from private.presence_legacy_cutover_audit_meta;
          insert into private.presence_legacy_cutover_audit_meta
            select * from pg_temp.phase6_meta_backup;
          alter table private.presence_legacy_cutover_audit_meta
            enable trigger presence_audit_meta_immutable;

          update private.presence_runtime_control as control
          set mode = backup.mode,
              cutover_id = backup.cutover_id,
              changed_at = backup.changed_at,
              changed_by = backup.changed_by,
              legacy_adapter_enabled = backup.legacy_adapter_enabled,
              legacy_adapter_disabled_at = backup.legacy_adapter_disabled_at
          from pg_temp.phase6_control_backup as backup
          where control.singleton_id = backup.singleton_id;

          alter table private.presence_legacy_cutover_audit_coverage
            force row level security;
          alter table private.presence_legacy_user_write_audit
            force row level security;
          alter table private.presence_legacy_route_call_audit
            force row level security;
          alter table private.presence_legacy_cutover_audit_meta
            force row level security;
          commit;
        `),
          );
        }
      }
    },
  );
});
