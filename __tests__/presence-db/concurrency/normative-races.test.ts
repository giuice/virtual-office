import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ensurePresenceOpenLogUniqueIndex,
  PresenceFixtures,
} from "../fixtures";
import { LOCAL_DB_URL } from "../setup";
import { presenceConcurrencyTestName } from "./support";

const NS = `normative-concurrency-${randomUUID()}`;
type UserRow = {
  readonly id: string;
  readonly location_version: number;
  readonly presence_access_revision: string;
};
type SpaceRow = {
  readonly id: string;
  readonly presence_access_revision: string;
};
type TransitionRow = {
  readonly ok: boolean;
  readonly code: string;
  readonly transition_id: string;
  readonly location_version: number | null;
  readonly already_applied: boolean;
};
type JsonResult = {
  readonly ok: boolean;
  readonly code: string;
  readonly alreadyApplied?: boolean;
};

describe("presence-db normative concurrency races", () => {
  let fixtures: PresenceFixtures;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
  });
  beforeEach(async () => {
    await setRuntimeMode("legacy", null);
    await cleanupTransitionRows();
    await fixtures.cleanup();
    await fixtures.sql(
      "drop index if exists public.ux_space_presence_log_one_open_per_user",
    );
  });
  afterAll(async () => {
    if (!fixtures) return;
    try {
      await setRuntimeMode("legacy", null);
      await cleanupTransitionRows();
      await fixtures.cleanup();
    } finally {
      try {
        await ensurePresenceOpenLogUniqueIndex(fixtures);
      } finally {
        await fixtures.end();
      }
    }
  });

  async function cleanupTransitionRows(): Promise<void> {
    await fixtures.sql(
      `delete from public.location_transition_requests
       where user_id in (select id from public.users where email like $1)`,
      [`%::${NS}%`],
    );
  }
  async function asPmo<T>(fn: () => Promise<T>): Promise<T> {
    await fixtures.sql("grant presence_maintenance_owner to postgres");
    await fixtures.sql("set role presence_maintenance_owner");
    try {
      return await fn();
    } finally {
      await fixtures.sql("reset role");
      await fixtures.sql("revoke presence_maintenance_owner from postgres");
    }
  }
  async function setRuntimeMode(
    mode: "legacy" | "maintenance" | "atomic",
    cutoverId: string | null,
  ): Promise<void> {
    await asPmo(() =>
      fixtures.sql(
        `update private.presence_runtime_control
       set mode = $1, cutover_id = $2,
           changed_at = pg_catalog.clock_timestamp(),
           changed_by = 'normative-concurrency-test',
           legacy_adapter_enabled = true, legacy_adapter_disabled_at = null
       where singleton_id`,
        [mode, cutoverId],
      ),
    );
  }
  async function activateAtomic(): Promise<void> {
    await fixtures.sql(
      `create unique index if not exists ux_space_presence_log_one_open_per_user
       on public.space_presence_log (user_id) where exited_at is null`,
    );
    await setRuntimeMode("atomic", randomUUID());
  }
  async function createCompany(key: string): Promise<string> {
    const [row] = await fixtures.sql<{ readonly id: string }>(
      `insert into public.companies (name, settings) values ($1, '{}'::jsonb) returning id`,
      [`${key}::${NS}`],
    );
    if (!row) throw new Error("Failed to create company");
    return row.id;
  }
  async function createSpace(
    companyId: string,
    key: string,
  ): Promise<SpaceRow> {
    const [row] = await fixtures.sql<SpaceRow>(
      `insert into public.spaces (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'workspace'::public.space_type, 'active'::public.space_status,
               20, '{"isPublic":true}'::jsonb)
       returning id, presence_access_revision`,
      [companyId, `${key}-${randomUUID()}::${NS}`],
    );
    if (!row) throw new Error("Failed to create space");
    return row;
  }
  async function createUser(
    companyId: string,
    key: string,
    currentSpaceId: string | null = null,
  ): Promise<UserRow> {
    const [row] = await fixtures.sql<UserRow>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role, current_space_id)
       values ($1, $2, $3, $4, 'member'::public.user_role, $5)
       returning id, location_version, presence_access_revision`,
      [
        randomUUID(),
        `${key}-${randomUUID()}::${NS}@example.test`,
        `Concurrency ${key}`,
        companyId,
        currentSpaceId,
      ],
    );
    if (!row) throw new Error("Failed to create user");
    return row;
  }
  async function createSession(params: {
    readonly companyId: string;
    readonly user: UserRow;
    readonly authSessionId: string;
    readonly space?: SpaceRow | null;
  }): Promise<string> {
    const [row] = await fixtures.sql<{ readonly id: string }>(
      `insert into public.user_presence_sessions (
         registration_id, user_id, auth_session_id, company_id, space_id,
         placement_version, user_access_revision, space_access_revision,
         connected_at, last_seen_at, expires_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8,
                 pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
                 pg_catalog.clock_timestamp() + interval '2 minutes') returning id`,
      [
        randomUUID(),
        params.user.id,
        params.authSessionId,
        params.companyId,
        params.space?.id ?? null,
        params.space ? params.user.location_version : null,
        params.space ? params.user.presence_access_revision : null,
        params.space?.presence_access_revision ?? null,
      ],
    );
    if (!row) throw new Error("Failed to create session");
    return row.id;
  }
  async function withClient<T>(
    key: string,
    fn: (client: Client, pid: number) => Promise<T>,
  ): Promise<T> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    await client.query(
      `select pg_catalog.set_config('application_name', $1, false),
              pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`,
      [`presence-${key}-${randomUUID()}`],
    );
    const pid = Number(
      (
        await client.query<{ readonly pid: number }>(
          "select pg_catalog.pg_backend_pid() as pid",
        )
      ).rows[0]?.pid,
    );
    try {
      return await fn(client, pid);
    } finally {
      await client.end();
    }
  }
  async function waitForObservedLock(
    waitingPid: number,
    blockingPid: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [row] = await fixtures.sql<{
        readonly wait_event_type: string | null;
        readonly blockers: number[];
        readonly ungranted: string;
      }>(
        `select activity.wait_event_type,
                pg_catalog.pg_blocking_pids(activity.pid) as blockers,
                (select pg_catalog.count(*)::text from pg_catalog.pg_locks as lock_row
                 where lock_row.pid = activity.pid and not lock_row.granted) as ungranted
         from pg_catalog.pg_stat_activity as activity where activity.pid = $1`,
        [waitingPid],
      );
      if (
        row?.wait_event_type === "Lock" &&
        row.blockers.includes(blockingPid) &&
        Number(row.ungranted) > 0
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      `PID ${waitingPid} did not show the expected database lock wait`,
    );
  }
  async function callCreate(
    client: Client,
    p: {
      requesterId: string;
      authSessionId: string;
      sessionId: string;
      spaceId: string;
      requestId: string;
    },
  ): Promise<JsonResult> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const row = (
        await client.query<{ readonly result: JsonResult }>(
          "select public.create_knock_request_observed($1, $2, $3, $4, $5) as result",
          [p.requesterId, p.authSessionId, p.sessionId, p.spaceId, p.requestId],
        )
      ).rows[0]?.result;
      if (!row) throw new Error("Knock create returned no result");
      if (row.code !== "RETRY_LOCK_SET" || attempt === 3) return row;
    }
    throw new Error("Knock create retry loop exhausted unexpectedly");
  }
  async function callRespond(
    client: Client,
    p: {
      responderId: string;
      authSessionId: string;
      sessionId: string;
      requestId: string;
    },
  ): Promise<JsonResult> {
    const row = (
      await client.query<{ readonly result: JsonResult }>(
        "select public.respond_to_knock_observed($1, $2, $3, $4, $5) as result",
        [p.responderId, p.authSessionId, p.sessionId, p.requestId, "APPROVE"],
      )
    ).rows[0]?.result;
    if (!row) throw new Error("Knock response returned no result");
    return row;
  }
  async function callTransition(
    client: Client,
    p: {
      userId: string;
      authSessionId: string;
      sessionId: string | null;
      transitionId: string;
      targetSpaceId: string | null;
      reason: string;
    },
  ): Promise<TransitionRow> {
    const row = (
      await client.query<TransitionRow>(
        "select * from public.transition_user_location($1, $2, $3, $4, $5, $6, null, null)",
        [
          p.userId,
          p.authSessionId,
          p.sessionId,
          p.transitionId,
          p.targetSpaceId,
          p.reason,
        ],
      )
    ).rows[0];
    if (!row) throw new Error("Transition returned no row");
    return row;
  }
  async function createKnockActors(key: string) {
    const companyId = await createCompany(key);
    const space = await createSpace(companyId, `${key}-space`);
    const requester = await createUser(companyId, `${key}-requester`);
    const responder = await createUser(companyId, `${key}-responder`, space.id);
    const requesterAuthSessionId = randomUUID();
    const responderAuthSessionId = randomUUID();
    const requesterSessionId = await createSession({
      companyId,
      user: requester,
      authSessionId: requesterAuthSessionId,
    });
    const responderSessionId = await createSession({
      companyId,
      user: responder,
      authSessionId: responderAuthSessionId,
      space,
    });
    return {
      companyId,
      space,
      requester,
      responder,
      requesterAuthSessionId,
      responderAuthSessionId,
      requesterSessionId,
      responderSessionId,
    };
  }

  it(
    presenceConcurrencyTestName(
      "29-knock-create-respond",
      "creates one live Knock and applies one immutable concurrent response",
    ),
    async () => {
      const a = await createKnockActors("case29");
      const requestId = randomUUID();
      const createParams = {
        requesterId: a.requester.id,
        authSessionId: a.requesterAuthSessionId,
        sessionId: a.requesterSessionId,
        spaceId: a.space.id,
        requestId,
      };
      const creates = await Promise.all([
        withClient("case29-create-a", (client) =>
          callCreate(client, createParams),
        ),
        withClient("case29-create-b", (client) =>
          callCreate(client, createParams),
        ),
      ]);
      expect(creates.map((row) => row.code)).toEqual([
        "KNOCK_CREATED",
        "KNOCK_CREATED",
      ]);
      expect(
        creates.filter((row) => row.alreadyApplied === false),
      ).toHaveLength(1);
      expect(creates.filter((row) => row.alreadyApplied === true)).toHaveLength(
        1,
      );
      const respondParams = {
        responderId: a.responder.id,
        authSessionId: a.responderAuthSessionId,
        sessionId: a.responderSessionId,
        requestId,
      };
      const responses = await Promise.all([
        withClient("case29-respond-a", (client) =>
          callRespond(client, respondParams),
        ),
        withClient("case29-respond-b", (client) =>
          callRespond(client, respondParams),
        ),
      ]);
      expect(responses.map((row) => row.code)).toEqual([
        "KNOCK_RESPONDED",
        "KNOCK_RESPONDED",
      ]);
      expect(
        responses.filter((row) => row.alreadyApplied === false),
      ).toHaveLength(1);
      expect(
        responses.filter((row) => row.alreadyApplied === true),
      ).toHaveLength(1);
      const [stored] = await fixtures.sql<{ readonly count: string }>(
        `select pg_catalog.count(*)::text as count from public.knock_requests
       where id = $1 and status = 'approved'`,
        [requestId],
      );
      expect(stored?.count).toBe("1");
    },
  );

  it(
    presenceConcurrencyTestName(
      "37-knock-rate-limits",
      "serializes pair and global Knock rate-limit boundaries",
    ),
    async () => {
      const pair = await createKnockActors("case37-pair");
      const pairResults = await Promise.all(
        [randomUUID(), randomUUID()].map((requestId, index) =>
          withClient(`case37-pair-${index}`, (client) =>
            callCreate(client, {
              requesterId: pair.requester.id,
              authSessionId: pair.requesterAuthSessionId,
              sessionId: pair.requesterSessionId,
              spaceId: pair.space.id,
              requestId,
            }),
          ),
        ),
      );
      expect(pairResults.map((row) => row.code).sort()).toEqual([
        "KNOCK_CREATED",
        "KNOCK_RATE_LIMITED",
      ]);

      const companyId = await createCompany("case37-global");
      const requester = await createUser(companyId, "case37-global-requester");
      const authSessionId = randomUUID();
      const sessionId = await createSession({
        companyId,
        user: requester,
        authSessionId,
      });
      const targets: SpaceRow[] = [];
      for (let index = 0; index < 6; index += 1) {
        const space = await createSpace(
          companyId,
          `case37-global-space-${index}`,
        );
        const responder = await createUser(
          companyId,
          `case37-global-responder-${index}`,
          space.id,
        );
        await createSession({
          companyId,
          user: responder,
          authSessionId: randomUUID(),
          space,
        });
        targets.push(space);
      }
      for (const target of targets.slice(0, 4)) {
        const seeded = await withClient("case37-seed", (client) =>
          callCreate(client, {
            requesterId: requester.id,
            authSessionId,
            sessionId,
            spaceId: target.id,
            requestId: randomUUID(),
          }),
        );
        expect(seeded.code).toBe("KNOCK_CREATED");
      }
      const globalResults = await Promise.all(
        targets.slice(4).map((target, index) =>
          withClient(`case37-global-${index}`, (client) =>
            callCreate(client, {
              requesterId: requester.id,
              authSessionId,
              sessionId,
              spaceId: target.id,
              requestId: randomUUID(),
            }),
          ),
        ),
      );
      expect(globalResults.map((row) => row.code).sort()).toEqual([
        "KNOCK_CREATED",
        "KNOCK_RATE_LIMITED",
      ]);
    },
  );

  it(
    presenceConcurrencyTestName(
      "33-session-invalidation",
      "revalidates disconnect, expiry, and Logout after observed waits",
    ),
    async () => {
      await activateAtomic();
      for (const invalidation of ["disconnect", "expiry"] as const) {
        const companyId = await createCompany(`case33-${invalidation}`);
        const space = await createSpace(
          companyId,
          `case33-${invalidation}-space`,
        );
        const user = await createUser(companyId, `case33-${invalidation}-user`);
        const authSessionId = randomUUID();
        const sessionId = await createSession({
          companyId,
          user,
          authSessionId,
        });
        const transitionId = randomUUID();
        await withClient(
          `case33-${invalidation}-blocker`,
          async (blocker, blockerPid) =>
            withClient(
              `case33-${invalidation}-mover`,
              async (mover, moverPid) => {
                await blocker.query("begin");
                await blocker.query(
                  "select id from public.users where id = $1 for no key update",
                  [user.id],
                );
                const movement = callTransition(mover, {
                  userId: user.id,
                  authSessionId,
                  sessionId,
                  transitionId,
                  targetSpaceId: space.id,
                  reason: "manual-enter",
                });
                await waitForObservedLock(moverPid, blockerPid);
                if (invalidation === "disconnect") {
                  const disconnected = await withClient(
                    "case33-disconnect",
                    (client) =>
                      client.query(
                        "select public.disconnect_presence_session($1, $2, $3) as result",
                        [user.id, authSessionId, sessionId],
                      ),
                  );
                  expect(disconnected.rows[0]?.result).toMatchObject({
                    ok: true,
                  });
                } else {
                  await fixtures.sql(
                    `update public.user_presence_sessions
               set expires_at = last_seen_at where id = $1`,
                    [sessionId],
                  );
                }
                await blocker.query("commit");
                await expect(movement).resolves.toMatchObject({
                  ok: false,
                  code: "SESSION_INVALID",
                });
              },
            ),
        );
        const [claim] = await fixtures.sql<{ readonly count: string }>(
          `select pg_catalog.count(*)::text as count from public.location_transition_requests
         where user_id = $1 and transition_id = $2`,
          [user.id, transitionId],
        );
        expect(claim?.count).toBe("0");
      }

      const companyId = await createCompany("case33-logout");
      const space = await createSpace(companyId, "case33-logout-space");
      const user = await createUser(companyId, "case33-logout-user");
      const authSessionId = randomUUID();
      const sessionId = await createSession({ companyId, user, authSessionId });
      const movementId = randomUUID();
      const advisoryKey = Math.floor(Math.random() * 1_000_000_000);
      const triggerName = `pause_case33_${randomUUID().replaceAll("-", "")}`;
      await withClient("case33-logout-blocker", async (blocker, blockerPid) =>
        withClient("case33-logout-first", async (logoutClient) =>
          withClient("case33-logout-mover", async (mover, moverPid) => {
            await blocker.query("begin");
            await blocker.query("select pg_catalog.pg_advisory_xact_lock($1)", [
              advisoryKey,
            ]);
            await mover.query(
              `create or replace function pg_temp.pause_case33_claim()
               returns trigger
               language plpgsql
               as $trigger$
               begin
                 if new.transition_id = '${movementId}'::uuid then
                   perform pg_catalog.pg_advisory_xact_lock(${advisoryKey});
                 end if;
                 return new;
               end;
               $trigger$`,
            );
            await mover.query(
              `create trigger ${triggerName}
               before insert on public.location_transition_requests
               for each row execute function pg_temp.pause_case33_claim()`,
            );
            try {
              const movement = callTransition(mover, {
                userId: user.id,
                authSessionId,
                sessionId,
                transitionId: movementId,
                targetSpaceId: space.id,
                reason: "manual-enter",
              });
              await waitForObservedLock(moverPid, blockerPid);

              const logout = await callTransition(logoutClient, {
                userId: user.id,
                authSessionId,
                sessionId: null,
                transitionId: randomUUID(),
                targetSpaceId: null,
                reason: "logout",
              });
              expect(logout).toMatchObject({ ok: true });

              await blocker.query("commit");
              await expect(movement).resolves.toMatchObject({
                ok: false,
                code: "AUTH_SESSION_REVOKED",
              });
            } finally {
              await blocker.query("rollback");
              await mover.query(
                `drop trigger if exists ${triggerName}
                 on public.location_transition_requests`,
              );
            }
          }),
        ),
      );
      const [claim] = await fixtures.sql<{ readonly count: string }>(
        `select pg_catalog.count(*)::text as count from public.location_transition_requests
       where user_id = $1 and transition_id = $2`,
        [user.id, movementId],
      );
      expect(claim?.count).toBe("0");
    },
  );

  it(
    presenceConcurrencyTestName(
      "50-different-id-logout",
      "applies one cleanup for concurrent different-ID Logouts",
    ),
    async () => {
      await activateAtomic();
      const companyId = await createCompany("case50");
      const space = await createSpace(companyId, "case50-space");
      const user = await createUser(companyId, "case50-user");
      const authSessionId = randomUUID();
      const sessionId = await createSession({ companyId, user, authSessionId });
      const entered = await withClient("case50-enter", (client) =>
        callTransition(client, {
          userId: user.id,
          authSessionId,
          sessionId,
          transitionId: randomUUID(),
          targetSpaceId: space.id,
          reason: "manual-enter",
        }),
      );
      expect(entered).toMatchObject({ ok: true, code: "LOCATION_UPDATED" });
      const transitionIds = [randomUUID(), randomUUID()];
      const results = await Promise.all(
        transitionIds.map((transitionId, index) =>
          withClient(`case50-logout-${index}`, (client) =>
            callTransition(client, {
              userId: user.id,
              authSessionId,
              sessionId: null,
              transitionId,
              targetSpaceId: null,
              reason: "logout",
            }),
          ),
        ),
      );
      expect(results.map((row) => row.code).sort()).toEqual([
        "AUTH_SESSION_REVOKED",
        "LOCATION_UPDATED",
      ]);
      const [state] = await fixtures.sql<{
        readonly current_space_id: string | null;
        readonly location_version: number;
        readonly active_sessions: string;
        readonly stored_results: string;
      }>(
        `select u.current_space_id, u.location_version,
              (select pg_catalog.count(*)::text from public.user_presence_sessions as s
               where s.user_id = u.id and s.retired_at is null) as active_sessions,
              (select pg_catalog.count(*)::text from public.location_transition_requests as r
               where r.user_id = u.id and r.transition_id = any ($2::uuid[])) as stored_results
       from public.users as u where u.id = $1`,
        [user.id, transitionIds],
      );
      expect(state).toMatchObject({
        current_space_id: null,
        location_version: Number(entered.location_version) + 1,
        active_sessions: "0",
        stored_results: "1",
      });
    },
  );
});
