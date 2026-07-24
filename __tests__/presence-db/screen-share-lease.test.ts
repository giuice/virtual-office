import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser, type AuthedUser } from "./auth-clients";
import { PresenceFixtures } from "./fixtures";
import { LOCAL_DB_URL } from "./setup";

const NS = `screen-share-lease-${randomUUID()}`;

interface Occupant {
  readonly user: AuthedUser;
  readonly authSessionId: string;
  readonly presenceSessionId: string;
}

interface LeaseScenario {
  readonly companyId: string;
  readonly spaceId: string;
  readonly spaceAccessRevision: string;
}

type RpcResult = Readonly<Record<string, unknown>> & {
  readonly ok?: boolean;
  readonly code?: string;
};

function sessionIdFromAccessToken(token: string): string {
  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) throw new Error("Local Auth token was malformed");
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as {
    session_id?: string;
  };
  if (!payload.session_id)
    throw new Error("Local Auth session did not include session_id");
  return payload.session_id;
}

describe("presence-db screen-share lease authority", () => {
  let fixtures: PresenceFixtures;
  let companyId: string;
  let spaceId: string;
  let spaceAccessRevision: string;
  let owner: Occupant;
  let viewer: Occupant;
  const companyIds = new Set<string>();

  async function createScenario(key: string): Promise<LeaseScenario> {
    const [company] = await fixtures.sql<{ id: string }>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [`Screen share ${key}::${NS}`],
    );
    if (!company)
      throw new Error(`Failed to create company fixture for ${key}`);
    companyIds.add(company.id);

    const [space] = await fixtures.sql<{
      id: string;
      presence_access_revision: string;
    }>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values
         ($1, $2, 'private_office'::public.space_type,
          'active'::public.space_status, 8, '{"isPublic":true}'::jsonb)
       returning id, presence_access_revision`,
      [company.id, `Screen share ${key} room::${NS}`],
    );
    if (!space) throw new Error(`Failed to create space fixture for ${key}`);
    return {
      companyId: company.id,
      spaceId: space.id,
      spaceAccessRevision: space.presence_access_revision,
    };
  }

  async function createScenarioOccupant(
    scenario: LeaseScenario,
    key: string,
    role: "admin" | "member" = "member",
  ): Promise<Occupant> {
    const user = await createAuthedUser(fixtures, NS, {
      key: `${key}-${randomUUID()}`,
      companyId: scenario.companyId,
      role,
    });
    const { data, error } = await user.client.auth.getSession();
    if (error || !data.session?.access_token)
      throw new Error("Missing local Auth session");
    const authSessionId = sessionIdFromAccessToken(data.session.access_token);
    const [placed] = await fixtures.sql<{
      location_version: number;
      presence_access_revision: string;
    }>(
      `update public.users
          set current_space_id = $1
        where id = $2
        returning location_version, presence_access_revision`,
      [scenario.spaceId, user.appUserId],
    );
    if (!placed) throw new Error(`Failed to place scenario occupant ${key}`);
    const [session] = await fixtures.sql<{ id: string }>(
      `insert into public.user_presence_sessions
         (registration_id, user_id, auth_session_id, company_id, space_id,
          placement_version, user_access_revision, space_access_revision,
          connected_at, last_seen_at, expires_at)
       values
         ($1, $2, $3, $4, $5, $6, $7, $8,
          pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
          pg_catalog.clock_timestamp() + interval '90 seconds')
       returning id`,
      [
        randomUUID(),
        user.appUserId,
        authSessionId,
        scenario.companyId,
        scenario.spaceId,
        placed.location_version,
        placed.presence_access_revision,
        scenario.spaceAccessRevision,
      ],
    );
    if (!session)
      throw new Error(`Failed to create scenario Presence session ${key}`);
    return { user, authSessionId, presenceSessionId: session.id };
  }

  async function callRpc(
    client: Client,
    functionName: string,
    scenario: LeaseScenario,
    occupant: Occupant,
    shareId?: string,
  ): Promise<RpcResult> {
    const params = shareId
      ? [
          occupant.user.supabaseUid,
          occupant.authSessionId,
          occupant.presenceSessionId,
          scenario.spaceId,
          shareId,
        ]
      : [
          occupant.user.supabaseUid,
          occupant.authSessionId,
          occupant.presenceSessionId,
          scenario.spaceId,
        ];
    const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
    const row = (
      await client.query<{ result: RpcResult }>(
        `select public.${functionName}(${placeholders}) as result`,
        params,
      )
    ).rows[0];
    if (!row) throw new Error(`No result from ${functionName}`);
    return row.result;
  }

  async function openServiceClient(): Promise<{ client: Client; pid: number }> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    await client.query(
      `select pg_catalog.set_config(
         'request.jwt.claims',
         '{"role":"service_role"}',
         false
       )`,
    );
    const pid = Number(
      (
        await client.query<{ pid: number }>(
          "select pg_catalog.pg_backend_pid() as pid",
        )
      ).rows[0]?.pid,
    );
    if (!pid) {
      await client.end();
      throw new Error("Could not read local Postgres backend PID");
    }
    return { client, pid };
  }

  async function asPresenceOwner<T>(operation: () => Promise<T>): Promise<T> {
    await fixtures.sql("grant presence_maintenance_owner to postgres");
    await fixtures.sql("set role presence_maintenance_owner");
    try {
      return await operation();
    } finally {
      await fixtures.sql("reset role");
      await fixtures.sql("revoke presence_maintenance_owner from postgres");
    }
  }

  async function waitForAdvisoryBarrier(
    pids: readonly number[],
  ): Promise<void> {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const rows = await fixtures.sql<{ pid: number }>(
        `select activity.pid
           from pg_catalog.pg_stat_activity as activity
          where activity.pid = any($1::integer[])
            and activity.wait_event_type = 'Lock'`,
        [pids],
      );
      if (rows.length === pids.length) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `Timed out waiting for advisory claim barrier: ${pids.join(", ")}`,
    );
  }

  async function waitForBlock(
    waitingPid: number,
    blockingPid: number,
  ): Promise<void> {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const [state] = await fixtures.sql<{
        wait_event_type: string | null;
        blockers: number[];
      }>(
        `select activity.wait_event_type,
                pg_catalog.pg_blocking_pids(activity.pid) as blockers
           from pg_catalog.pg_stat_activity as activity
          where activity.pid = $1`,
        [waitingPid],
      );
      if (
        state?.wait_event_type === "Lock" &&
        state.blockers.includes(blockingPid)
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `Timed out waiting for backend ${waitingPid} on blocker ${blockingPid}`,
    );
  }

  async function barrierClaim(
    client: Client,
    barrierKey: number,
    scenario: LeaseScenario,
    occupant: Occupant,
    shareId: string,
  ): Promise<RpcResult> {
    const row = (
      await client.query<{ result: RpcResult }>(
        `with barrier as materialized (
           select pg_catalog.pg_advisory_xact_lock_shared($1)
         )
         select public.claim_screen_share_observed($2, $3, $4, $5, $6) as result
           from barrier`,
        [
          barrierKey,
          occupant.user.supabaseUid,
          occupant.authSessionId,
          occupant.presenceSessionId,
          scenario.spaceId,
          shareId,
        ],
      )
    ).rows[0];
    if (!row) throw new Error("Barrier claim returned no result");
    return row.result;
  }

  async function startScenarioRpc(
    functionName: string,
    scenario: LeaseScenario,
    occupant: Occupant,
    shareId?: string,
  ): Promise<{
    client: Client;
    pid: number;
    result: Promise<RpcResult>;
  }> {
    const { client, pid } = await openServiceClient();
    return {
      client,
      pid,
      result: callRpc(client, functionName, scenario, occupant, shareId),
    };
  }

  async function createOccupant(
    key: string,
    displayName?: string,
  ): Promise<Occupant> {
    const user = await createAuthedUser(fixtures, NS, {
      key,
      companyId,
      ...(displayName ? { displayName } : {}),
    });
    const { data, error } = await user.client.auth.getSession();
    if (error || !data.session?.access_token)
      throw new Error("Missing local Auth session");
    const authSessionId = sessionIdFromAccessToken(data.session.access_token);

    const [placed] = await fixtures.sql<{
      location_version: number;
      presence_access_revision: string;
    }>(
      `update public.users set current_space_id = $1
       where id = $2 returning location_version, presence_access_revision`,
      [spaceId, user.appUserId],
    );
    if (!placed) throw new Error("Failed to place occupant fixture");
    const [session] = await fixtures.sql<{ id: string }>(
      `insert into public.user_presence_sessions
         (registration_id, user_id, auth_session_id, company_id, space_id,
          placement_version, user_access_revision, space_access_revision,
          connected_at, last_seen_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8,
               pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
               pg_catalog.clock_timestamp() + interval '90 seconds')
       returning id`,
      [
        randomUUID(),
        user.appUserId,
        authSessionId,
        companyId,
        spaceId,
        placed.location_version,
        placed.presence_access_revision,
        spaceAccessRevision,
      ],
    );
    if (!session)
      throw new Error("Failed to create qualifying Presence session");
    return { user, authSessionId, presenceSessionId: session.id };
  }

  async function observed(
    functionName: string,
    occupant: Occupant,
    shareId?: string,
  ): Promise<Record<string, unknown>> {
    const params = shareId
      ? [
          occupant.user.supabaseUid,
          occupant.authSessionId,
          occupant.presenceSessionId,
          spaceId,
          shareId,
        ]
      : [
          occupant.user.supabaseUid,
          occupant.authSessionId,
          occupant.presenceSessionId,
          spaceId,
        ];
    const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
    const [row] = await fixtures.sql<{ result: Record<string, unknown> }>(
      `select public.${functionName}(${placeholders}) as result`,
      params,
    );
    if (!row) throw new Error(`No result from ${functionName}`);
    return row.result;
  }

  async function startObserved(
    functionName: string,
    occupant: Occupant,
    shareId?: string,
  ): Promise<{
    client: Client;
    backendPid: number;
    result: Promise<Record<string, unknown>>;
  }> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    try {
      await client.connect();
      await client.query(
        `select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`,
      );
      const backend = await client.query<{ pid: number }>(
        "select pg_catalog.pg_backend_pid() as pid",
      );
      const backendPid = backend.rows[0]?.pid;
      if (!backendPid)
        throw new Error("Could not read observed RPC backend PID");

      const params = shareId
        ? [
            occupant.user.supabaseUid,
            occupant.authSessionId,
            occupant.presenceSessionId,
            spaceId,
            shareId,
          ]
        : [
            occupant.user.supabaseUid,
            occupant.authSessionId,
            occupant.presenceSessionId,
            spaceId,
          ];
      const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
      const result = client
        .query<{ result: Record<string, unknown> }>(
          `select public.${functionName}(${placeholders}) as result`,
          params,
        )
        .then(({ rows }) => {
          const [row] = rows;
          if (!row) throw new Error(`No result from ${functionName}`);
          return row.result;
        });

      return { client, backendPid, result };
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
  }

  async function waitForObservedUserLock(
    waiterPid: number,
    lockerPid: number,
  ): Promise<void> {
    const deadline = Date.now() + 2_000;
    let lastState: Record<string, unknown> | undefined;

    while (Date.now() < deadline) {
      const [state] = await fixtures.sql<{
        wait_event_type: string | null;
        wait_event: string | null;
        blocked_by_locker: boolean;
        waits_for_locker_transaction: boolean;
        locker_holds_users_write_lock: boolean;
      }>(
        `select activity.wait_event_type,
                activity.wait_event,
                pg_catalog.pg_blocking_pids($1) @> array[$2]::integer[] as blocked_by_locker,
                exists (
                  select 1
                    from pg_catalog.pg_locks as waiting
                    join pg_catalog.pg_locks as held
                      on waiting.locktype = 'transactionid'
                     and held.locktype = 'transactionid'
                     and waiting.transactionid = held.transactionid
                   where waiting.pid = $1
                     and not waiting.granted
                     and held.pid = $2
                     and held.granted
                ) as waits_for_locker_transaction,
                exists (
                  select 1
                    from pg_catalog.pg_locks as held_user
                   where held_user.pid = $2
                     and held_user.relation = 'public.users'::pg_catalog.regclass
                     and held_user.mode = 'RowExclusiveLock'
                     and held_user.granted
                ) as locker_holds_users_write_lock
           from pg_catalog.pg_stat_activity as activity
          where activity.pid = $1`,
        [waiterPid, lockerPid],
      );
      lastState = state;
      if (
        state?.wait_event_type === "Lock" &&
        state.blocked_by_locker &&
        state.waits_for_locker_transaction &&
        state.locker_holds_users_write_lock
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(
      `Timed out waiting for observed RPC backend ${waiterPid} on users-row locker ${lockerPid}: ${JSON.stringify(lastState)}`,
    );
  }

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    const [company] = await fixtures.sql<{ id: string }>(
      `insert into public.companies (name, settings) values ($1, '{}'::jsonb) returning id`,
      [`Screen share company::${NS}`],
    );
    if (!company) throw new Error("Failed to create company fixture");
    companyId = company.id;
    companyIds.add(companyId);
    const [space] = await fixtures.sql<{
      id: string;
      presence_access_revision: string;
    }>(
      `insert into public.spaces (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'private_office'::public.space_type, 'active'::public.space_status, 8, '{"isPublic":true}'::jsonb)
       returning id, presence_access_revision`,
      [companyId, `Screen share room::${NS}`],
    );
    if (!space) throw new Error("Failed to create space fixture");
    spaceId = space.id;
    spaceAccessRevision = space.presence_access_revision;
    owner = await createOccupant("owner");
    viewer = await createOccupant("viewer");
  });

  afterAll(async () => {
    if (fixtures) {
      await fixtures.sql(
        `delete from public.users where company_id = any($1::uuid[])`,
        [[...companyIds]],
      );
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  it("returns the documented empty-release result for a valid occupant with no lease", async () => {
    expect(
      await observed("release_screen_share_observed", owner, randomUUID()),
    ).toEqual({
      ok: false,
      code: "LEASE_NOT_FOUND",
    });
  });

  it("claims an initially empty lease and reads no active presenter before the claim", async () => {
    expect(
      await observed("get_active_screen_share_observed", owner),
    ).toMatchObject({
      ok: true,
      code: "ACTIVE_READ",
      active: null,
    });
    const shareId = randomUUID();
    expect(
      await observed("claim_screen_share_observed", owner, shareId),
    ).toMatchObject({
      ok: true,
      code: "CLAIMED",
      shareId,
      presenterName: "Phase 1 owner",
    });
    expect(
      await observed("get_active_screen_share_observed", viewer),
    ).toMatchObject({
      ok: true,
      code: "ACTIVE_READ",
      active: {
        presenterUserId: owner.user.appUserId,
        shareId,
        presenterName: "Phase 1 owner",
      },
    });
  });

  it("permits only the exact owner release and preserves repeated-release idempotency", async () => {
    const active = await observed("get_active_screen_share_observed", owner);
    const shareId = (active.active as { shareId: string }).shareId;
    expect(
      await observed("release_screen_share_observed", viewer, shareId),
    ).toEqual({
      ok: false,
      code: "LEASE_NOT_OWNER",
    });
    expect(
      await observed("release_screen_share_observed", owner, shareId),
    ).toEqual({
      ok: true,
      code: "RELEASED",
      alreadyReleased: false,
    });
    expect(
      await observed("release_screen_share_observed", owner, shareId),
    ).toEqual({
      ok: true,
      code: "RELEASED",
      alreadyReleased: true,
    });
  });

  it("invalidates stale owner session and movement/revision fences without mutating Presence", async () => {
    const shareId = randomUUID();
    expect(
      await observed("claim_screen_share_observed", owner, shareId),
    ).toMatchObject({ ok: true, code: "CLAIMED" });
    await fixtures.sql(
      `update public.user_presence_sessions set retired_at = pg_catalog.clock_timestamp(), retirement_reason = 'explicit-disconnect'
       where id = $1`,
      [owner.presenceSessionId],
    );
    expect(
      await observed("get_active_screen_share_observed", viewer),
    ).toMatchObject({ ok: true, code: "ACTIVE_READ", active: null });
    const [lease] = await fixtures.sql<{ released_at: string | null }>(
      `select released_at from public.screen_share_leases where space_id = $1`,
      [spaceId],
    );
    expect(lease?.released_at).not.toBeNull();

    const mover = await createOccupant("mover");
    const movedShareId = randomUUID();
    expect(
      await observed("claim_screen_share_observed", mover, movedShareId),
    ).toMatchObject({ ok: true, code: "CLAIMED" });
    // Legacy-mode fixture SQL simulates a committed move: neither the old
    // placement nor its claim-time revision may keep the presenter active.
    await fixtures.sql(
      `update public.users
          set current_space_id = null, location_version = location_version + 1
        where id = $1`,
      [mover.user.appUserId],
    );
    expect(
      await observed("get_active_screen_share_observed", viewer),
    ).toMatchObject({ ok: true, code: "ACTIVE_READ", active: null });
  });

  it("returns only PROFILE_INVALID and writes no active lease when a held rename commits an invalid current name", async () => {
    const presenter = await createOccupant("invalid-name-race");
    const locker = new Client({ connectionString: LOCAL_DB_URL });
    await locker.connect();
    await locker.query(
      `select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`,
    );
    try {
      const lockerBackend = await locker.query<{ pid: number }>(
        "select pg_catalog.pg_backend_pid() as pid",
      );
      const lockerPid = lockerBackend.rows[0]?.pid;
      if (!lockerPid) throw new Error("Could not read held-rename backend PID");
      await locker.query("begin");
      await locker.query(
        `update public.users set display_name = $1 where id = $2`,
        ["  ", presenter.user.appUserId],
      );

      const claim = await startObserved(
        "claim_screen_share_observed",
        presenter,
        randomUUID(),
      );
      try {
        await waitForObservedUserLock(claim.backendPid, lockerPid);
        await locker.query("commit");

        expect(await claim.result).toEqual({
          ok: false,
          code: "PRESENTER_PROFILE_INVALID",
        });
      } finally {
        await claim.client.end();
      }
      expect(
        await fixtures.sql(
          `select * from public.screen_share_leases
         where space_id = $1
           and presenter_user_id = $2
           and released_at is null
           and expires_at > pg_catalog.clock_timestamp()`,
          [spaceId, presenter.user.appUserId],
        ),
      ).toHaveLength(0);
    } finally {
      await locker.query("rollback").catch(() => undefined);
      await locker.end();
    }
  });

  it("canonicalizes whitespace and matches PostgreSQL Unicode code-point limits before mutation", async () => {
    const canonical = await createOccupant(
      "canonical-name",
      "   Canonical presenter  ",
    );
    const canonicalShareId = randomUUID();
    expect(
      await observed(
        "claim_screen_share_observed",
        canonical,
        canonicalShareId,
      ),
    ).toMatchObject({
      ok: true,
      code: "CLAIMED",
      presenterName: "Canonical presenter",
    });
    expect(
      await observed(
        "release_screen_share_observed",
        canonical,
        canonicalShareId,
      ),
    ).toMatchObject({
      ok: true,
      code: "RELEASED",
    });

    const boundary = await createOccupant("boundary-name", "x".repeat(100));
    const boundaryShareId = randomUUID();
    expect(
      await observed("claim_screen_share_observed", boundary, boundaryShareId),
    ).toMatchObject({
      ok: true,
      code: "CLAIMED",
      presenterName: "x".repeat(100),
    });
    expect(
      await observed(
        "release_screen_share_observed",
        boundary,
        boundaryShareId,
      ),
    ).toMatchObject({
      ok: true,
      code: "RELEASED",
    });
    await fixtures.sql(
      `update public.users set display_name = $1 where id = $2`,
      ["x".repeat(101), boundary.user.appUserId],
    );
    expect(
      await observed("claim_screen_share_observed", boundary, randomUUID()),
    ).toEqual({
      ok: false,
      code: "PRESENTER_PROFILE_INVALID",
    });

    const emoji = "😀";
    const emojiBoundary = await createOccupant(
      "emoji-boundary-name",
      `  ${emoji.repeat(100)}  `,
    );
    const emojiShareId = randomUUID();
    expect(
      await observed(
        "claim_screen_share_observed",
        emojiBoundary,
        emojiShareId,
      ),
    ).toMatchObject({
      ok: true,
      code: "CLAIMED",
      presenterName: emoji.repeat(100),
    });
    expect(
      await observed(
        "release_screen_share_observed",
        emojiBoundary,
        emojiShareId,
      ),
    ).toMatchObject({
      ok: true,
      code: "RELEASED",
    });

    const emojiOverflow = await createOccupant(
      "emoji-overflow-name",
      emoji.repeat(101),
    );
    expect(
      await observed(
        "claim_screen_share_observed",
        emojiOverflow,
        randomUUID(),
      ),
    ).toEqual({
      ok: false,
      code: "PRESENTER_PROFILE_INVALID",
    });
    expect(
      await fixtures.sql(
        `select * from public.screen_share_leases
       where space_id = $1
         and presenter_user_id = $2
         and released_at is null
         and expires_at > pg_catalog.clock_timestamp()`,
        [spaceId, emojiOverflow.user.appUserId],
      ),
    ).toHaveLength(0);
  });

  it("returns an active name from the same locked owner snapshot after a held rename commits", async () => {
    const presenter = await createOccupant("active-name-race", "Before rename");
    const shareId = randomUUID();
    expect(
      await observed("claim_screen_share_observed", presenter, shareId),
    ).toMatchObject({ ok: true, code: "CLAIMED" });

    const locker = new Client({ connectionString: LOCAL_DB_URL });
    await locker.connect();
    await locker.query(
      `select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`,
    );
    try {
      const lockerBackend = await locker.query<{ pid: number }>(
        "select pg_catalog.pg_backend_pid() as pid",
      );
      const lockerPid = lockerBackend.rows[0]?.pid;
      if (!lockerPid) throw new Error("Could not read held-rename backend PID");
      await locker.query("begin");
      await locker.query(
        `update public.users set display_name = 'After rename' where id = $1`,
        [presenter.user.appUserId],
      );

      const active = await startObserved(
        "get_active_screen_share_observed",
        viewer,
      );
      try {
        await waitForObservedUserLock(active.backendPid, lockerPid);
        await locker.query("commit");

        expect(await active.result).toMatchObject({
          ok: true,
          code: "ACTIVE_READ",
          active: {
            presenterUserId: presenter.user.appUserId,
            shareId,
            presenterName: "After rename",
          },
        });
      } finally {
        await active.client.end();
      }
    } finally {
      await locker.query("rollback").catch(() => undefined);
      await locker.end();
    }
  });

  it("reads back the owner, search_path, grants, and display-name privilege from local Postgres", async () => {
    const [catalog] = await fixtures.sql<{
      owner: string;
      security_definer: boolean;
      config: string[] | null;
      service_execute: boolean;
      authenticated_execute: boolean;
      display_name_select: boolean;
    }>(
      `select pg_catalog.pg_get_userbyid(p.proowner) as owner,
              p.prosecdef as security_definer,
              p.proconfig as config,
              pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
              pg_catalog.has_column_privilege('presence_maintenance_owner', 'public.users', 'display_name', 'SELECT') as display_name_select
         from pg_catalog.pg_proc as p
         join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'claim_screen_share_observed'`,
    );
    expect(catalog).toEqual({
      owner: "presence_maintenance_owner",
      security_definer: true,
      config: ["search_path=pg_catalog"],
      service_execute: true,
      authenticated_execute: false,
      display_name_select: true,
    });
  });

  it("enforces media-topic RLS for a mapped Auth UID rather than the application UUID", async () => {
    const topic = `company:${companyId}:space:${spaceId}:media`;
    await fixtures.sql("begin");
    try {
      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true), pg_catalog.set_config('realtime.topic', $2, true)`,
        [
          JSON.stringify({
            role: "authenticated",
            sub: viewer.user.supabaseUid,
            session_id: viewer.authSessionId,
          }),
          topic,
        ],
      );
      await fixtures.sql("set local role authenticated");
      expect(
        await fixtures.sql(
          `insert into realtime.messages (topic, extension) values ($1, 'broadcast') returning extension`,
          [topic],
        ),
      ).toEqual([{ extension: "broadcast" }]);
      await fixtures.sql(
        `select pg_catalog.set_config('realtime.topic', $1, true)`,
        [`company:${companyId}:space:${randomUUID()}:media`],
      );
      await expect(
        fixtures.sql(
          `insert into realtime.messages (topic, extension) values ($1, 'broadcast')`,
          [`company:${companyId}:space:${randomUUID()}:media`],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await fixtures.sql("rollback");
    }
  });

  it("repeats equal-order same-space claims with one canonical winner and one bounded loser", async () => {
    const scenario = await createScenario("same-space-race");
    const claimantA = await createScenarioOccupant(scenario, "race-a");
    const claimantB = await createScenarioOccupant(scenario, "race-b");
    const [deadlocksBefore] = await fixtures.sql<{ deadlocks: string }>(
      `select deadlocks::text
         from pg_catalog.pg_stat_database
        where datname = pg_catalog.current_database()`,
    );

    for (let iteration = 0; iteration < 8; iteration += 1) {
      await asPresenceOwner(() =>
        fixtures.sql(
          `delete from public.screen_share_leases where space_id = $1`,
          [scenario.spaceId],
        ),
      );
      const blocker = await openServiceClient();
      const first = await openServiceClient();
      const second = await openServiceClient();
      const barrierKey = 100_000 + Math.floor(Math.random() * 1_000_000_000);
      const shareA = randomUUID();
      const shareB = randomUUID();
      await blocker.client.query("select pg_catalog.pg_advisory_lock($1)", [
        barrierKey,
      ]);
      const startedAt = Date.now();
      try {
        const rawA = barrierClaim(
          first.client,
          barrierKey,
          scenario,
          claimantA,
          shareA,
        );
        const rawB = barrierClaim(
          second.client,
          barrierKey,
          scenario,
          claimantB,
          shareB,
        );
        await waitForAdvisoryBarrier([first.pid, second.pid]);
        await blocker.client.query("select pg_catalog.pg_advisory_unlock($1)", [
          barrierKey,
        ]);
        const rawResults = await Promise.all([rawA, rawB]);

        for (const result of rawResults) {
          expect(["CLAIMED", "PRESENTER_BUSY", "RETRY_LOCK_SET"]).toContain(
            result.code,
          );
        }
        const converged = await Promise.all(
          rawResults.map(async (result, index) => {
            if (result.code !== "RETRY_LOCK_SET") return result;
            const fresh = await openServiceClient();
            try {
              return await callRpc(
                fresh.client,
                "claim_screen_share_observed",
                scenario,
                index === 0 ? claimantA : claimantB,
                index === 0 ? shareA : shareB,
              );
            } finally {
              await fresh.client.end();
            }
          }),
        );
        expect(converged.filter(({ code }) => code === "CLAIMED")).toHaveLength(
          1,
        );
        expect(
          converged.filter(({ code }) => code === "PRESENTER_BUSY"),
        ).toHaveLength(1);
        expect(Date.now() - startedAt).toBeLessThan(2_000);

        const activeRows = await fixtures.sql<{
          presenter_user_id: string;
          share_id: string;
        }>(
          `select presenter_user_id, share_id
             from public.screen_share_leases
            where space_id = $1
              and released_at is null
              and expires_at > pg_catalog.clock_timestamp()`,
          [scenario.spaceId],
        );
        expect(activeRows).toHaveLength(1);
        expect([
          `${claimantA.user.appUserId}:${shareA}`,
          `${claimantB.user.appUserId}:${shareB}`,
        ]).toContain(
          `${activeRows[0]?.presenter_user_id}:${activeRows[0]?.share_id}`,
        );
      } finally {
        await blocker.client
          .query("select pg_catalog.pg_advisory_unlock($1)", [barrierKey])
          .catch(() => undefined);
        await Promise.all([
          blocker.client.end(),
          first.client.end(),
          second.client.end(),
        ]);
      }
    }

    const [deadlocksAfter] = await fixtures.sql<{ deadlocks: string }>(
      `select deadlocks::text
         from pg_catalog.pg_stat_database
        where datname = pg_catalog.current_database()`,
    );
    expect(deadlocksAfter?.deadlocks).toBe(deadlocksBefore?.deadlocks);
  }, 30_000);

  it("keeps independent-space claims independent and returns canonical empty/single reads", async () => {
    const scenarioA = await createScenario("independent-a");
    const scenarioB = await createScenario("independent-b");
    const claimantA = await createScenarioOccupant(scenarioA, "independent-a");
    const claimantB = await createScenarioOccupant(scenarioB, "independent-b");
    const serviceA = await openServiceClient();
    const serviceB = await openServiceClient();
    try {
      expect(
        await callRpc(
          serviceA.client,
          "get_active_screen_share_observed",
          scenarioA,
          claimantA,
        ),
      ).toEqual({ ok: true, code: "ACTIVE_READ", active: null });

      const shareA = randomUUID();
      const shareB = randomUUID();
      const startedAt = Date.now();
      const [claimA, claimB] = await Promise.all([
        callRpc(
          serviceA.client,
          "claim_screen_share_observed",
          scenarioA,
          claimantA,
          shareA,
        ),
        callRpc(
          serviceB.client,
          "claim_screen_share_observed",
          scenarioB,
          claimantB,
          shareB,
        ),
      ]);
      expect(claimA).toMatchObject({
        ok: true,
        code: "CLAIMED",
        shareId: shareA,
      });
      expect(claimB).toMatchObject({
        ok: true,
        code: "CLAIMED",
        shareId: shareB,
      });
      expect(Date.now() - startedAt).toBeLessThan(1_000);

      const active = await callRpc(
        serviceA.client,
        "get_active_screen_share_observed",
        scenarioA,
        claimantA,
      );
      expect(active).toMatchObject({
        ok: true,
        code: "ACTIVE_READ",
        active: {
          spaceId: scenarioA.spaceId,
          presenterUserId: claimantA.user.appUserId,
          shareId: shareA,
        },
      });
    } finally {
      await Promise.all([serviceA.client.end(), serviceB.client.end()]);
    }
  });

  it("fails every foreign or stale caller closed without replacing the active owner", async () => {
    const scenario = await createScenario("denials");
    const owner = await createScenarioOccupant(scenario, "denial-owner");
    const outsiderScenario = await createScenario("denials-outsider");
    const outsider = await createScenarioOccupant(
      outsiderScenario,
      "denial-outsider",
    );
    const service = await openServiceClient();
    const ownerShareId = randomUUID();
    try {
      expect(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          owner,
          ownerShareId,
        ),
      ).toMatchObject({ ok: true, code: "CLAIMED" });

      const attempts: RpcResult[] = [];
      attempts.push(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          { ...owner, authSessionId: randomUUID() },
          randomUUID(),
        ),
      );
      attempts.push(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          { ...owner, presenceSessionId: randomUUID() },
          randomUUID(),
        ),
      );
      attempts.push(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          outsider,
          randomUUID(),
        ),
      );
      attempts.push(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          {
            ...owner,
            user: { ...owner.user, supabaseUid: randomUUID() },
          },
          randomUUID(),
        ),
      );
      expect(attempts.map(({ code }) => code)).toEqual([
        "SESSION_INVALID",
        "SESSION_INVALID",
        "SESSION_INVALID",
        "AUTH_INVALID",
      ]);

      const [stored] = await fixtures.sql<{
        presenter_user_id: string;
        share_id: string;
      }>(
        `select presenter_user_id, share_id
           from public.screen_share_leases
          where space_id = $1`,
        [scenario.spaceId],
      );
      expect(stored).toEqual({
        presenter_user_id: owner.user.appUserId,
        share_id: ownerShareId,
      });
    } finally {
      await service.client.end();
    }
  });

  it("revalidates retirement, revocation, departure, and access revisions after ownership", async () => {
    const mutations = [
      {
        key: "retired",
        mutate: (occupant: Occupant) =>
          fixtures.sql(
            `update public.user_presence_sessions
                set retired_at = pg_catalog.clock_timestamp(),
                    retirement_reason = 'explicit-disconnect'
              where id = $1`,
            [occupant.presenceSessionId],
          ),
      },
      {
        key: "revoked",
        mutate: (occupant: Occupant) =>
          fixtures.sql(
            `insert into public.revoked_presence_auth_sessions
               (auth_session_id, user_id, revoked_at)
             values ($1, $2, pg_catalog.clock_timestamp())`,
            [occupant.authSessionId, occupant.user.appUserId],
          ),
      },
      {
        key: "departed",
        mutate: (occupant: Occupant) =>
          fixtures.sql(
            `update public.users
                set current_space_id = null,
                    location_version = location_version + 1
              where id = $1`,
            [occupant.user.appUserId],
          ),
      },
      {
        key: "user-revision",
        mutate: (occupant: Occupant) =>
          fixtures.sql(
            `update public.users
                set role = 'admin'::public.user_role
              where id = $1`,
            [occupant.user.appUserId],
          ),
      },
    ] as const;

    for (const mutation of mutations) {
      const scenario = await createScenario(`fence-${mutation.key}`);
      const presenter = await createScenarioOccupant(
        scenario,
        `fence-presenter-${mutation.key}`,
      );
      const reader = await createScenarioOccupant(
        scenario,
        `fence-reader-${mutation.key}`,
      );
      const service = await openServiceClient();
      try {
        expect(
          await callRpc(
            service.client,
            "claim_screen_share_observed",
            scenario,
            presenter,
            randomUUID(),
          ),
        ).toMatchObject({ ok: true, code: "CLAIMED" });
        await mutation.mutate(presenter);
        expect(
          await callRpc(
            service.client,
            "get_active_screen_share_observed",
            scenario,
            reader,
          ),
        ).toEqual({ ok: true, code: "ACTIVE_READ", active: null });
        const [lease] = await fixtures.sql<{ released_at: string | null }>(
          `select released_at
             from public.screen_share_leases
            where space_id = $1`,
          [scenario.spaceId],
        );
        expect(lease?.released_at).not.toBeNull();
      } finally {
        await service.client.end();
      }
    }

    const scenario = await createScenario("fence-space-revision");
    const presenter = await createScenarioOccupant(
      scenario,
      "fence-space-presenter",
    );
    const reader = await createScenarioOccupant(scenario, "fence-space-reader");
    const service = await openServiceClient();
    try {
      expect(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          presenter,
          randomUUID(),
        ),
      ).toMatchObject({ ok: true, code: "CLAIMED" });
      await fixtures.sql(
        `update public.spaces
            set access_control = '{"isPublic":false,"allowedUsers":[]}'::jsonb
          where id = $1`,
        [scenario.spaceId],
      );
      expect(
        await callRpc(
          service.client,
          "get_active_screen_share_observed",
          scenario,
          reader,
        ),
      ).toEqual({ ok: false, code: "SESSION_INVALID" });
      const [lease] = await fixtures.sql<{ released_at: string | null }>(
        `select released_at from public.screen_share_leases where space_id = $1`,
        [scenario.spaceId],
      );
      expect(lease?.released_at).toBeNull();
    } finally {
      await service.client.end();
    }
  });

  it("revalidates active reads after concurrent membership, revocation, departure, and ACL commits", async () => {
    for (const race of [
      "membership",
      "revocation",
      "departure",
      "acl",
    ] as const) {
      const scenario = await createScenario(`active-race-${race}`);
      const presenter = await createScenarioOccupant(
        scenario,
        `active-race-presenter-${race}`,
      );
      const reader = await createScenarioOccupant(
        scenario,
        `active-race-reader-${race}`,
      );
      const admin =
        race === "membership"
          ? await createScenarioOccupant(scenario, "active-race-admin", "admin")
          : null;
      const shareId = randomUUID();
      const service = await openServiceClient();
      const blocker = await openServiceClient();
      try {
        expect(
          await callRpc(
            service.client,
            "claim_screen_share_observed",
            scenario,
            presenter,
            shareId,
          ),
        ).toMatchObject({ ok: true, code: "CLAIMED" });

        await blocker.client.query("begin");
        if (race === "membership") {
          await blocker.client.query("set local role service_role");
          const removal = await blocker.client.query<{
            result: { code: string };
          }>(
            `select public.remove_company_member_and_presence($1, $2, $3) as result`,
            [
              admin?.user.appUserId,
              presenter.user.appUserId,
              scenario.companyId,
            ],
          );
          expect(removal.rows[0]?.result.code).toBe("COMPANY_MEMBER_REMOVED");
          await blocker.client.query("reset role");
        } else if (race === "departure") {
          await blocker.client.query(
            `update public.users
                set current_space_id = null,
                    location_version = location_version + 1
              where id = $1`,
            [presenter.user.appUserId],
          );
        } else {
          await blocker.client.query(
            `update public.users set display_name = display_name where id = $1`,
            [presenter.user.appUserId],
          );
        }

        const active = await startScenarioRpc(
          "get_active_screen_share_observed",
          scenario,
          reader,
        );
        try {
          await waitForObservedUserLock(active.pid, blocker.pid);
          if (race === "revocation") {
            await fixtures.sql(
              `insert into public.revoked_presence_auth_sessions
                 (auth_session_id, user_id, revoked_at)
               values ($1, $2, pg_catalog.clock_timestamp())`,
              [presenter.authSessionId, presenter.user.appUserId],
            );
          } else if (race === "acl") {
            const [updatedSpace] = await fixtures.sql<{
              presence_access_revision: string;
            }>(
              `update public.spaces
                  set access_control = '{"isPublic":false,"allowedUsers":[]}'::jsonb
                where id = $1
                returning presence_access_revision`,
              [scenario.spaceId],
            );
            if (!updatedSpace)
              throw new Error("ACL race did not update the space");
            await fixtures.sql(
              `update public.user_presence_sessions
                  set space_access_revision = $1
                where id = $2`,
              [updatedSpace.presence_access_revision, reader.presenceSessionId],
            );
          }
          await blocker.client.query("commit");

          expect(await active.result).toEqual({
            ok: true,
            code: "ACTIVE_READ",
            active: null,
          });
        } finally {
          await active.client.end();
        }

        const [lease] = await fixtures.sql<{ released_at: string | null }>(
          `select released_at
             from public.screen_share_leases
            where space_id = $1`,
          [scenario.spaceId],
        );
        expect(lease?.released_at).not.toBeNull();
      } finally {
        await blocker.client.query("rollback").catch(() => undefined);
        await Promise.all([service.client.end(), blocker.client.end()]);
      }
    }
  }, 30_000);

  it("makes exact release idempotent, rejects stale shares, and never revives expired ownership", async () => {
    const scenario = await createScenario("lifecycle");
    const presenter = await createScenarioOccupant(
      scenario,
      "lifecycle-presenter",
    );
    const successor = await createScenarioOccupant(
      scenario,
      "lifecycle-successor",
    );
    const service = await openServiceClient();
    const shareId = randomUUID();
    try {
      expect(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          presenter,
          shareId,
        ),
      ).toMatchObject({ ok: true, code: "CLAIMED" });
      expect(
        await callRpc(
          service.client,
          "renew_screen_share_observed",
          scenario,
          presenter,
          randomUUID(),
        ),
      ).toEqual({ ok: false, code: "LEASE_STALE" });
      expect(
        await callRpc(
          service.client,
          "release_screen_share_observed",
          scenario,
          presenter,
          randomUUID(),
        ),
      ).toEqual({ ok: false, code: "LEASE_NOT_OWNER" });

      const release = callRpc(
        service.client,
        "release_screen_share_observed",
        scenario,
        presenter,
        shareId,
      );
      const competing = await openServiceClient();
      try {
        const renewal = callRpc(
          competing.client,
          "renew_screen_share_observed",
          scenario,
          presenter,
          shareId,
        );
        const results = await Promise.all([release, renewal]);
        expect(results.map(({ code }) => code).sort()).toEqual([
          "LEASE_STALE",
          "RELEASED",
        ]);
      } finally {
        await competing.client.end();
      }
      expect(
        await callRpc(
          service.client,
          "release_screen_share_observed",
          scenario,
          presenter,
          shareId,
        ),
      ).toEqual({ ok: true, code: "RELEASED", alreadyReleased: true });

      const expiredShareId = randomUUID();
      expect(
        await callRpc(
          service.client,
          "claim_screen_share_observed",
          scenario,
          presenter,
          expiredShareId,
        ),
      ).toMatchObject({ ok: true, code: "CLAIMED" });

      await fixtures.sql("grant presence_maintenance_owner to postgres");
      const expiryBlocker = await openServiceClient();
      const successorClient = await openServiceClient();
      try {
        await expiryBlocker.client.query("set role presence_maintenance_owner");
        await expiryBlocker.client.query("begin");
        await expiryBlocker.client.query(
          `update public.screen_share_leases
              set expires_at = pg_catalog.clock_timestamp(),
                  heartbeat_at = least(
                    heartbeat_at,
                    pg_catalog.clock_timestamp() - interval '1 microsecond'
                  )
            where space_id = $1`,
          [scenario.spaceId],
        );
        const successorShareId = randomUUID();
        const successorClaim = callRpc(
          successorClient.client,
          "claim_screen_share_observed",
          scenario,
          successor,
          successorShareId,
        );
        await waitForBlock(successorClient.pid, expiryBlocker.pid);
        await expiryBlocker.client.query("commit");
        expect(await successorClaim).toMatchObject({
          ok: true,
          code: "CLAIMED",
          shareId: successorShareId,
        });
      } finally {
        await expiryBlocker.client.query("rollback").catch(() => undefined);
        await Promise.all([
          expiryBlocker.client.end(),
          successorClient.client.end(),
        ]);
        await fixtures.sql("revoke presence_maintenance_owner from postgres");
      }
      expect(
        await callRpc(
          service.client,
          "renew_screen_share_observed",
          scenario,
          presenter,
          expiredShareId,
        ),
      ).toEqual({ ok: false, code: "LEASE_STALE" });
    } finally {
      await service.client.end();
    }
  });

  it("reads the exact lease schema, indexes, RLS, RPC owners, paths, and grants from pg_catalog", async () => {
    const [table] = await fixtures.sql<{
      owner: string;
      rls: boolean;
      force_rls: boolean;
      authenticated_privileges: boolean;
      anon_privileges: boolean;
      service_privileges: boolean;
    }>(
      `select pg_catalog.pg_get_userbyid(c.relowner) as owner,
              c.relrowsecurity as rls,
              c.relforcerowsecurity as force_rls,
              pg_catalog.has_table_privilege(
                'authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'
              ) as authenticated_privileges,
              pg_catalog.has_table_privilege(
                'anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE'
              ) as anon_privileges,
              pg_catalog.has_table_privilege(
                'service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE'
              ) as service_privileges
         from pg_catalog.pg_class as c
        where c.oid = 'public.screen_share_leases'::pg_catalog.regclass`,
    );
    expect(table).toEqual({
      owner: "presence_maintenance_owner",
      rls: true,
      force_rls: true,
      authenticated_privileges: false,
      anon_privileges: false,
      service_privileges: false,
    });

    const constraints = await fixtures.sql<{ name: string; type: string }>(
      `select con.conname as name, con.contype as type
         from pg_catalog.pg_constraint as con
        where con.conrelid = 'public.screen_share_leases'::pg_catalog.regclass
        order by con.conname`,
    );
    expect(constraints).toEqual([
      { name: "screen_share_leases_company_id_fkey", type: "f" },
      { name: "screen_share_leases_company_share_key", type: "u" },
      { name: "screen_share_leases_expiry_order", type: "c" },
      { name: "screen_share_leases_heartbeat_order", type: "c" },
      { name: "screen_share_leases_pkey", type: "p" },
      { name: "screen_share_leases_presence_session_id_fkey", type: "f" },
      { name: "screen_share_leases_presenter_user_id_fkey", type: "f" },
      { name: "screen_share_leases_release_order", type: "c" },
      { name: "screen_share_leases_space_id_fkey", type: "f" },
    ]);

    const indexes = await fixtures.sql<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef
         from pg_catalog.pg_indexes
        where schemaname = 'public'
          and tablename = 'screen_share_leases'
        order by indexname`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual([
      "idx_screen_share_leases_active_expiry",
      "idx_screen_share_leases_company_id",
      "idx_screen_share_leases_presence_session_id",
      "idx_screen_share_leases_presenter_user_id",
      "screen_share_leases_company_share_key",
      "screen_share_leases_pkey",
    ]);
    expect(
      indexes.find(
        ({ indexname }) =>
          indexname === "idx_screen_share_leases_active_expiry",
      )?.indexdef,
    ).toContain("WHERE (released_at IS NULL)");

    const functions = await fixtures.sql<{
      schema_name: string;
      function_name: string;
      owner: string;
      security_definer: boolean;
      config: string[];
      service_execute: boolean;
      authenticated_execute: boolean;
      anon_execute: boolean;
    }>(
      `select n.nspname as schema_name,
              p.proname as function_name,
              pg_catalog.pg_get_userbyid(p.proowner) as owner,
              p.prosecdef as security_definer,
              p.proconfig as config,
              pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
                as service_execute,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                as authenticated_execute,
              pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
                as anon_execute
         from pg_catalog.pg_proc as p
         join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
        where (n.nspname, p.proname) in (
          ('private', 'screen_share_context_observed'),
          ('private', 'screen_share_canonical_presenter_name_observed'),
          ('private', 'screen_share_claim_presenter_name_observed'),
          ('private', 'is_media_topic_authorized'),
          ('public', 'claim_screen_share_observed'),
          ('public', 'renew_screen_share_observed'),
          ('public', 'release_screen_share_observed'),
          ('public', 'get_active_screen_share_observed')
        )
        order by n.nspname, p.proname`,
    );
    expect(functions).toHaveLength(8);
    for (const fn of functions) {
      expect(fn).toMatchObject({
        owner: "presence_maintenance_owner",
        security_definer: true,
        config: ["search_path=pg_catalog"],
        authenticated_execute: fn.function_name === "is_media_topic_authorized",
        anon_execute: false,
      });
      expect(fn.service_execute).toBe(fn.schema_name === "public");
    }
  });
});
