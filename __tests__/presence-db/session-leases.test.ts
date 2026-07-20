// Phase 2 exit-gate coverage for per-tab presence session leases.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceFixtures } from "./fixtures";
import {
  createAnonClient,
  createAuthedUser,
  createServiceClient,
  type AuthedUser,
} from "./auth-clients";

const NS = `session-leases-${randomUUID()}`;
const COMPANY_NAME = `phase2-company::${NS}`;
const SPACE_NAME = `phase2-space::${NS}`;

type CompanyRow = {
  readonly id: string;
};

type SpaceRow = {
  readonly id: string;
};

type UserRow = {
  readonly id: string;
  readonly supabase_uid: string;
};

type SessionRow = {
  readonly id: string;
  readonly registration_id: string;
  readonly user_id: string;
  readonly auth_session_id: string;
  readonly company_id: string;
  readonly space_id: string | null;
  readonly placement_version: number | null;
  readonly user_access_revision: string | null;
  readonly space_access_revision: string | null;
  readonly connected_at: Date;
  readonly last_seen_at: Date;
  readonly expires_at: Date;
  readonly retired_at: Date | null;
  readonly retirement_reason: string | null;
  readonly lease_seconds: string;
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

type HeartbeatSuccess = {
  readonly ok: true;
  readonly expiresAt: string;
};

type DisconnectSuccess = {
  readonly ok: true;
  readonly retiredAt: string;
  readonly alreadyDisconnected: boolean;
};

type RpcFailure = {
  readonly ok: false;
  readonly code:
    | "SESSION_RETIRED"
    | "AUTH_SESSION_REVOKED"
    | "REGISTRATION_CONFLICT"
    | "USER_NOT_FOUND"
    | "NO_COMPANY";
};

type RegisterResult = RegisterSuccess | RpcFailure;
type HeartbeatResult = HeartbeatSuccess | RpcFailure;
type DisconnectResult = DisconnectSuccess | RpcFailure;
type ObservedRegisterResult = RegisterResult & { readonly activeSessionCount: number };
type ObservedHeartbeatResult = HeartbeatResult & { readonly activeSessionCount: number };
type ObservedDisconnectResult = DisconnectResult & { readonly activeSessionCount: number };

type RevisionState = {
  readonly location_version: number;
  readonly user_access_revision: string;
  readonly space_access_revision: string;
};

type SnapshotRow = {
  readonly snapshot: string;
};

type CountRow = {
  readonly count: string;
};

describe("presence-db session leases", () => {
  let fixtures: PresenceFixtures;
  let serviceClient: ReturnType<typeof createServiceClient>;
  let companyId: string;
  let spaceId: string;
  let primaryUser: UserRow;
  let secondaryUser: UserRow;
  let noCompanyUser: UserRow;
  let authBackedUser: AuthedUser;
  let liveAuthSessionId: string;

  async function setRuntimeMode(
    mode: 'legacy' | 'atomic',
    cutoverId: string | null,
  ): Promise<void> {
    await fixtures.sql('grant presence_maintenance_owner to postgres');
    await fixtures.sql('set role presence_maintenance_owner');
    try {
      await fixtures.sql(
        `update private.presence_runtime_control
         set mode = $1,
             cutover_id = $2,
             changed_at = pg_catalog.clock_timestamp(),
             changed_by = 'session-lease-test'
         where singleton_id`,
        [mode, cutoverId],
      );
    } finally {
      await fixtures.sql('reset role').catch(() => undefined);
      await fixtures.sql('revoke presence_maintenance_owner from postgres');
    }
  }

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    serviceClient = createServiceClient();

    const [company] = await fixtures.sql<CompanyRow>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [COMPANY_NAME],
    );
    if (!company) {
      throw new Error("Failed to create the Phase 2 test company");
    }
    companyId = company.id;

    const [space] = await fixtures.sql<SpaceRow>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values ($1, $2, 'workspace'::public.space_type, 'active'::public.space_status, 10, '{"isPublic": true}'::jsonb)
       returning id`,
      [companyId, SPACE_NAME],
    );
    if (!space) {
      throw new Error("Failed to create the Phase 2 test space");
    }
    spaceId = space.id;

    primaryUser = await createPlainUser("primary", companyId);
    secondaryUser = await createPlainUser("secondary", companyId);
    noCompanyUser = await createPlainUser("no-company", null);

    authBackedUser = await createAuthedUser(fixtures, NS, {
      key: "lease-member",
      companyId,
      displayName: "Phase 2 Lease Member",
      role: "member",
    });
    liveAuthSessionId = await getClientAuthSessionId(authBackedUser);
  });

  afterAll(async () => {
    if (fixtures) {
      if (authBackedUser) {
        await fixtures.sql(
          `delete from public.user_presence_sessions where user_id = $1`,
          [authBackedUser.appUserId],
        );
        await fixtures.sql(
          `delete from public.revoked_presence_auth_sessions where user_id = $1`,
          [authBackedUser.appUserId],
        );
      }
      await fixtures.cleanup();
      await fixtures.end();
    }
  });

  async function createPlainUser(
    key: string,
    userCompanyId: string | null,
  ): Promise<UserRow> {
    const supabaseUid = randomUUID();
    const [user] = await fixtures.sql<UserRow>(
      `insert into public.users
         (supabase_uid, email, display_name, company_id, role)
       values ($1, $2, $3, $4, 'member'::public.user_role)
       returning id, supabase_uid`,
      [
        supabaseUid,
        `phase2-${key}::${NS}@example.test`,
        `Phase 2 ${key}`,
        userCompanyId,
      ],
    );
    if (!user) {
      throw new Error(`Failed to create plain user ${key}`);
    }
    return user;
  }

  async function getClientAuthSessionId(user: AuthedUser): Promise<string> {
    const { data, error } = await user.client.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error(`Failed to read signed-in session: ${error?.message}`);
    }
    const [, payload] = data.session.access_token.split(".");
    if (!payload) {
      throw new Error("Signed-in access token has no payload");
    }
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { readonly session_id?: unknown };
    if (typeof claims.session_id !== "string") {
      throw new Error("Signed-in access token has no session_id claim");
    }
    return claims.session_id;
  }

  async function registerSession(
    userId: string,
    authSessionId: string,
    registrationId: string,
  ): Promise<RegisterResult> {
    const { data, error } = await serviceClient.rpc(
      "register_presence_session",
      {
        p_user_id: userId,
        p_auth_session_id: authSessionId,
        p_registration_id: registrationId,
        p_expected_company_id: companyId,
      },
    );
    if (error) {
      throw new Error(`register_presence_session failed: ${error.message}`);
    }
    return data as RegisterResult;
  }

  async function heartbeatSession(
    userId: string,
    authSessionId: string,
    sessionId: string,
  ): Promise<HeartbeatResult> {
    const { data, error } = await serviceClient.rpc(
      "heartbeat_presence_session",
      {
        p_user_id: userId,
        p_auth_session_id: authSessionId,
        p_session_id: sessionId,
      },
    );
    if (error) {
      throw new Error(`heartbeat_presence_session failed: ${error.message}`);
    }
    return data as HeartbeatResult;
  }

  async function disconnectSession(
    userId: string,
    authSessionId: string,
    sessionId: string,
  ): Promise<DisconnectResult> {
    const { data, error } = await serviceClient.rpc(
      "disconnect_presence_session",
      {
        p_user_id: userId,
        p_auth_session_id: authSessionId,
        p_session_id: sessionId,
      },
    );
    if (error) {
      throw new Error(`disconnect_presence_session failed: ${error.message}`);
    }
    return data as DisconnectResult;
  }

  async function sessionRow(sessionId: string): Promise<SessionRow> {
    const [row] = await fixtures.sql<SessionRow>(
      `select
         s.*,
         extract(epoch from (s.expires_at - s.last_seen_at))::text as lease_seconds
       from public.user_presence_sessions as s
       where s.id = $1`,
      [sessionId],
    );
    if (!row) {
      throw new Error(`Missing session row ${sessionId}`);
    }
    return row;
  }

  async function snapshotSession(sessionId: string): Promise<string> {
    const [row] = await fixtures.sql<SnapshotRow>(
      `select pg_catalog.to_jsonb(s.*)::text as snapshot
       from public.user_presence_sessions as s
       where s.id = $1`,
      [sessionId],
    );
    if (!row) {
      throw new Error(`Missing session snapshot ${sessionId}`);
    }
    return row.snapshot;
  }

  async function revisionState(
    userId: string,
    targetSpaceId: string,
  ): Promise<RevisionState> {
    const [row] = await fixtures.sql<RevisionState>(
      `select
         u.location_version,
         u.presence_access_revision as user_access_revision,
         sp.presence_access_revision as space_access_revision
       from public.users as u
       join public.spaces as sp on sp.id = $2
       where u.id = $1`,
      [userId, targetSpaceId],
    );
    if (!row) {
      throw new Error("Failed to read placement revision state");
    }
    return row;
  }

  async function seedSession(opts: {
    readonly userId: string;
    readonly authSessionId?: string;
    readonly registrationId?: string;
    readonly targetSpaceId?: string | null;
    readonly placementVersion?: number | null;
    readonly userAccessRevision?: string | null;
    readonly spaceAccessRevision?: string | null;
    readonly expiresAtSql?: string;
    readonly retiredAtSql?: string | null;
    readonly retirementReason?: string | null;
    readonly company?: string;
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
         pg_catalog.clock_timestamp() - interval '26 hours',
         pg_catalog.clock_timestamp() - interval '26 hours',
         ${opts.expiresAtSql ?? "pg_catalog.clock_timestamp() + interval '90 seconds'"},
         ${opts.retiredAtSql ?? "null"},
         $9
       )
       returning id`,
      [
        opts.registrationId ?? randomUUID(),
        opts.userId,
        opts.authSessionId ?? randomUUID(),
        opts.company ?? companyId,
        opts.targetSpaceId ?? null,
        opts.placementVersion ?? null,
        opts.userAccessRevision ?? null,
        opts.spaceAccessRevision ?? null,
        opts.retirementReason ?? null,
      ],
    );
    if (!row) {
      throw new Error("Failed to seed user_presence_sessions row");
    }
    return row.id;
  }

  async function expectPrivateUnfenced(
    claims: Record<string, string>,
  ): Promise<boolean> {
    await fixtures.sql("begin");
    try {
      await fixtures.sql("set local role authenticated");
      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify(claims)],
      );
      const [row] = await fixtures.sql<{ readonly ok: boolean }>(
        `select private.is_presence_auth_session_unfenced() as ok`,
      );
      if (!row) {
        throw new Error(
          "private.is_presence_auth_session_unfenced returned no row",
        );
      }
      return row.ok;
    } finally {
      await fixtures.sql("rollback");
    }
  }

  it("reports the exact active unfenced session count after each observed mutation", async () => {
    const user = await createPlainUser(`observed-${randomUUID()}`, companyId);
    const firstAuthSessionId = randomUUID();
    const secondAuthSessionId = randomUUID();

    const firstRegistration = await serviceClient.rpc(
      "register_presence_session_observed",
      {
        p_user_id: user.id,
        p_auth_session_id: firstAuthSessionId,
        p_registration_id: randomUUID(),
        p_expected_company_id: companyId,
      },
    );
    expect(firstRegistration.error).toBeNull();
    const first = firstRegistration.data as ObservedRegisterResult;
    expect(first).toMatchObject({ ok: true, activeSessionCount: 1 });

    const secondRegistration = await serviceClient.rpc(
      "register_presence_session_observed",
      {
        p_user_id: user.id,
        p_auth_session_id: secondAuthSessionId,
        p_registration_id: randomUUID(),
        p_expected_company_id: companyId,
      },
    );
    expect(secondRegistration.error).toBeNull();
    const second = secondRegistration.data as ObservedRegisterResult;
    expect(second).toMatchObject({ ok: true, activeSessionCount: 2 });

    const heartbeat = await serviceClient.rpc(
      "heartbeat_presence_session_observed",
      {
        p_user_id: user.id,
        p_auth_session_id: firstAuthSessionId,
        p_session_id: first.ok ? first.sessionId : randomUUID(),
      },
    );
    expect(heartbeat.error).toBeNull();
    expect(heartbeat.data as ObservedHeartbeatResult).toMatchObject({
      ok: true,
      activeSessionCount: 2,
    });

    const disconnected = await serviceClient.rpc(
      "disconnect_presence_session_observed",
      {
        p_user_id: user.id,
        p_auth_session_id: firstAuthSessionId,
        p_session_id: first.ok ? first.sessionId : randomUUID(),
      },
    );
    expect(disconnected.error).toBeNull();
    expect(disconnected.data as ObservedDisconnectResult).toMatchObject({
      ok: true,
      activeSessionCount: 1,
      alreadyDisconnected: false,
    });

    const replay = await serviceClient.rpc(
      "disconnect_presence_session_observed",
      {
        p_user_id: user.id,
        p_auth_session_id: firstAuthSessionId,
        p_session_id: first.ok ? first.sessionId : randomUUID(),
      },
    );
    expect(replay.error).toBeNull();
    expect(replay.data as ObservedDisconnectResult).toMatchObject({
      ok: true,
      activeSessionCount: 1,
      alreadyDisconnected: true,
    });

    await fixtures.sql(
      `insert into public.revoked_presence_auth_sessions
         (auth_session_id, user_id, revoked_at)
       values ($1, $2, pg_catalog.clock_timestamp())`,
      [secondAuthSessionId, user.id],
    );
    const fencedHeartbeat = await serviceClient.rpc(
      "heartbeat_presence_session_observed",
      {
        p_user_id: user.id,
        p_auth_session_id: secondAuthSessionId,
        p_session_id: second.ok ? second.sessionId : randomUUID(),
      },
    );
    expect(fencedHeartbeat.error).toBeNull();
    expect(fencedHeartbeat.data as ObservedHeartbeatResult).toMatchObject({
      ok: false,
      code: "AUTH_SESSION_REVOKED",
      activeSessionCount: 0,
    });
  });

  it("a: browser roles cannot access lease tables or public RPCs directly", async () => {
    const anonClient = createAnonClient();
    const clients = [anonClient, authBackedUser.client];

    for (const client of clients) {
      for (const table of [
        "user_presence_sessions",
        "revoked_presence_auth_sessions",
      ] as const) {
        const { error: selectError } = await client
          .from(table)
          .select("*")
          .limit(1);
        expect(selectError, `${table} SELECT should be denied`).not.toBeNull();

        if (table === "user_presence_sessions") {
          const { error: insertError } = await client
            .from("user_presence_sessions")
            .insert({
              registration_id: randomUUID(),
              user_id: primaryUser.id,
              auth_session_id: randomUUID(),
              company_id: companyId,
              expires_at: new Date().toISOString(),
            });
          expect(
            insertError,
            `${table} INSERT should be denied`,
          ).not.toBeNull();

          const { error: updateError } = await client
            .from("user_presence_sessions")
            .update({ expires_at: new Date().toISOString() })
            .eq("user_id", primaryUser.id);
          expect(
            updateError,
            `${table} UPDATE should be denied`,
          ).not.toBeNull();

          const { error: deleteError } = await client
            .from("user_presence_sessions")
            .delete()
            .eq("user_id", primaryUser.id);
          expect(
            deleteError,
            `${table} DELETE should be denied`,
          ).not.toBeNull();
        } else {
          const { error: insertError } = await client
            .from("revoked_presence_auth_sessions")
            .insert({
              auth_session_id: randomUUID(),
              user_id: primaryUser.id,
              revoked_at: new Date().toISOString(),
            });
          expect(
            insertError,
            `${table} INSERT should be denied`,
          ).not.toBeNull();

          const { error: updateError } = await client
            .from("revoked_presence_auth_sessions")
            .update({ purge_after: new Date().toISOString() })
            .eq("user_id", primaryUser.id);
          expect(
            updateError,
            `${table} UPDATE should be denied`,
          ).not.toBeNull();

          const { error: deleteError } = await client
            .from("revoked_presence_auth_sessions")
            .delete()
            .eq("user_id", primaryUser.id);
          expect(
            deleteError,
            `${table} DELETE should be denied`,
          ).not.toBeNull();
        }
      }
    }

    for (const fn of [
      [
        "register_presence_session",
        {
          p_user_id: primaryUser.id,
          p_auth_session_id: randomUUID(),
          p_registration_id: randomUUID(),
          p_expected_company_id: companyId,
        },
      ],
      [
        "heartbeat_presence_session",
        {
          p_user_id: primaryUser.id,
          p_auth_session_id: randomUUID(),
          p_session_id: randomUUID(),
        },
      ],
      [
        "disconnect_presence_session",
        {
          p_user_id: primaryUser.id,
          p_auth_session_id: randomUUID(),
          p_session_id: randomUUID(),
        },
      ],
      ["retire_expired_presence_sessions", undefined],
      ["reconcile_stale_presence_placements", undefined],
      ["purge_presence_history", undefined],
    ] as const) {
      const { error } =
        fn[1] === undefined
          ? await authBackedUser.client.rpc(fn[0])
          : await authBackedUser.client.rpc(fn[0], fn[1]);
      expect(error, `${fn[0]} should be denied`).not.toBeNull();
    }

    await expect(
      fixtures.sql(
        `begin;
         set local role anon;
         select private.is_presence_auth_session_unfenced();
         rollback;`,
      ),
    ).rejects.toThrow();
    await fixtures.sql("rollback").catch(() => undefined);
  });

  it("b: register enforces server-owned identity, idempotency, conflicts, and fences", async () => {
    const authSessionId = randomUUID();
    const registrationId = randomUUID();
    const created = await registerSession(
      primaryUser.id,
      authSessionId,
      registrationId,
    );
    expect(created).toMatchObject({
      ok: true,
      registrationId,
      sessionSpaceId: null,
      refreshed: false,
    });
    expect((created as RegisterSuccess).sessionId).toEqual(expect.any(String));

    const row = await sessionRow((created as RegisterSuccess).sessionId);
    expect(row.id).toBe((created as RegisterSuccess).sessionId);
    expect(row.company_id).toBe(companyId);
    expect(row.space_id).toBeNull();
    expect(row.placement_version).toBeNull();
    expect(row.user_access_revision).toBeNull();
    expect(row.space_access_revision).toBeNull();
    expect(Number(row.lease_seconds)).toBeGreaterThan(89);
    expect(Number(row.lease_seconds)).toBeLessThan(91);

    const state = await revisionState(primaryUser.id, spaceId);
    await fixtures.sql(
      `update public.user_presence_sessions
       set space_id = $1,
           placement_version = $2,
           user_access_revision = $3,
           space_access_revision = $4
       where id = $5`,
      [
        spaceId,
        state.location_version,
        state.user_access_revision,
        state.space_access_revision,
        row.id,
      ],
    );

    const refreshed = await registerSession(
      primaryUser.id,
      authSessionId,
      registrationId,
    );
    expect(refreshed).toMatchObject({
      ok: true,
      sessionId: row.id,
      registrationId,
      sessionSpaceId: spaceId,
      refreshed: true,
    });
    const refreshedRow = await sessionRow(row.id);
    expect(refreshedRow.space_id).toBe(spaceId);
    expect(refreshedRow.placement_version).toBe(state.location_version);

    const conflictRegistration = randomUUID();
    await seedSession({
      userId: primaryUser.id,
      authSessionId: randomUUID(),
      registrationId: conflictRegistration,
    });
    await expect(
      registerSession(primaryUser.id, randomUUID(), conflictRegistration),
    ).resolves.toEqual({ ok: false, code: "REGISTRATION_CONFLICT" });

    const fencedAuthSession = randomUUID();
    await fixtures.sql(
      `insert into public.revoked_presence_auth_sessions
         (auth_session_id, user_id, revoked_at)
       values ($1, $2, pg_catalog.clock_timestamp())`,
      [fencedAuthSession, primaryUser.id],
    );
    await expect(
      registerSession(primaryUser.id, fencedAuthSession, randomUUID()),
    ).resolves.toEqual({ ok: false, code: "AUTH_SESSION_REVOKED" });

    await expect(
      registerSession(randomUUID(), randomUUID(), randomUUID()),
    ).resolves.toEqual({ ok: false, code: "USER_NOT_FOUND" });
    await expect(
      registerSession(noCompanyUser.id, randomUUID(), randomUUID()),
    ).resolves.toEqual({ ok: false, code: "NO_COMPANY" });

    const retiredRegistration = randomUUID();
    const retired = await registerSession(
      primaryUser.id,
      randomUUID(),
      retiredRegistration,
    );
    const retiredSessionId = (retired as RegisterSuccess).sessionId;
    await fixtures.sql(
      `update public.user_presence_sessions
       set retired_at = pg_catalog.clock_timestamp(),
           retirement_reason = 'expired'
       where id = $1`,
      [retiredSessionId],
    );
    const before = await snapshotSession(retiredSessionId);
    await expect(
      registerSession(primaryUser.id, randomUUID(), retiredRegistration),
    ).resolves.toEqual({ ok: false, code: "SESSION_RETIRED" });
    await expect(snapshotSession(retiredSessionId)).resolves.toBe(before);
  });

  it("c: heartbeat extends only active matching sessions", async () => {
    const authSessionId = randomUUID();
    const registered = (await registerSession(
      primaryUser.id,
      authSessionId,
      randomUUID(),
    )) as RegisterSuccess;
    const before = await sessionRow(registered.sessionId);
    const heartbeat = await heartbeatSession(
      primaryUser.id,
      authSessionId,
      registered.sessionId,
    );
    expect(heartbeat.ok).toBe(true);
    const after = await sessionRow(registered.sessionId);
    expect(after.expires_at.getTime()).toBeGreaterThan(
      before.expires_at.getTime(),
    );
    expect(Number(after.lease_seconds)).toBeGreaterThan(89);

    const fencedAuthSession = randomUUID();
    const fencedSessionId = await seedSession({
      userId: primaryUser.id,
      authSessionId: fencedAuthSession,
    });
    await fixtures.sql(
      `insert into public.revoked_presence_auth_sessions
         (auth_session_id, user_id, revoked_at)
       values ($1, $2, pg_catalog.clock_timestamp())`,
      [fencedAuthSession, primaryUser.id],
    );
    await expect(
      heartbeatSession(primaryUser.id, fencedAuthSession, fencedSessionId),
    ).resolves.toEqual({ ok: false, code: "AUTH_SESSION_REVOKED" });

    await fixtures.sql(
      `update public.user_presence_sessions
       set expires_at = pg_catalog.clock_timestamp()
       where id = $1`,
      [registered.sessionId],
    );
    const boundarySnapshot = await snapshotSession(registered.sessionId);
    await expect(
      heartbeatSession(primaryUser.id, authSessionId, registered.sessionId),
    ).resolves.toEqual({ ok: false, code: "SESSION_RETIRED" });
    await expect(snapshotSession(registered.sessionId)).resolves.toBe(
      boundarySnapshot,
    );

    const crossUserId = await seedSession({
      userId: primaryUser.id,
      authSessionId: randomUUID(),
    });
    const crossSnapshot = await snapshotSession(crossUserId);
    await expect(
      heartbeatSession(secondaryUser.id, randomUUID(), crossUserId),
    ).resolves.toEqual({ ok: false, code: "SESSION_RETIRED" });
    await expect(snapshotSession(crossUserId)).resolves.toBe(crossSnapshot);

    const retiredId = await seedSession({
      userId: primaryUser.id,
      authSessionId: randomUUID(),
      retiredAtSql: "pg_catalog.clock_timestamp()",
      retirementReason: "expired",
    });
    await expect(
      heartbeatSession(primaryUser.id, randomUUID(), retiredId),
    ).resolves.toEqual({ ok: false, code: "SESSION_RETIRED" });
    const retiredRow = await sessionRow(retiredId);
    expect(retiredRow.retired_at).not.toBeNull();
    expect(retiredRow.retirement_reason).toBe("expired");
  });

  it("d: disconnect is idempotent only for explicit active disconnects", async () => {
    const authSessionId = randomUUID();
    const registered = (await registerSession(
      primaryUser.id,
      authSessionId,
      randomUUID(),
    )) as RegisterSuccess;
    const state = await revisionState(primaryUser.id, spaceId);
    await fixtures.sql(
      `update public.user_presence_sessions
       set space_id = $1,
           placement_version = $2,
           user_access_revision = $3,
           space_access_revision = $4
       where id = $5`,
      [
        spaceId,
        state.location_version,
        state.user_access_revision,
        state.space_access_revision,
        registered.sessionId,
      ],
    );

    const disconnected = await disconnectSession(
      primaryUser.id,
      authSessionId,
      registered.sessionId,
    );
    expect(disconnected).toMatchObject({
      ok: true,
      alreadyDisconnected: false,
    });
    const disconnectedRow = await sessionRow(registered.sessionId);
    expect(disconnectedRow.retirement_reason).toBe("explicit-disconnect");
    expect(disconnectedRow.retired_at?.getTime()).toBe(
      disconnectedRow.expires_at.getTime(),
    );
    expect(disconnectedRow.space_id).toBe(spaceId);
    expect(disconnectedRow.placement_version).toBe(state.location_version);

    const repeated = await disconnectSession(
      primaryUser.id,
      authSessionId,
      registered.sessionId,
    );
    expect(repeated).toMatchObject({
      ok: true,
      alreadyDisconnected: true,
      retiredAt: (disconnected as DisconnectSuccess).retiredAt,
    });
    expect((await sessionRow(registered.sessionId)).retired_at?.getTime()).toBe(
      disconnectedRow.retired_at?.getTime(),
    );

    const expiredId = await seedSession({
      userId: primaryUser.id,
      authSessionId,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '1 second'",
    });
    const expiredSnapshot = await snapshotSession(expiredId);
    await expect(
      disconnectSession(primaryUser.id, authSessionId, expiredId),
    ).resolves.toEqual({ ok: false, code: "SESSION_RETIRED" });
    await expect(snapshotSession(expiredId)).resolves.toBe(expiredSnapshot);
  });

  it("e: two tabs remain independent when one disconnects", async () => {
    const authSessionId = randomUUID();
    const one = (await registerSession(
      primaryUser.id,
      authSessionId,
      randomUUID(),
    )) as RegisterSuccess;
    const two = (await registerSession(
      primaryUser.id,
      authSessionId,
      randomUUID(),
    )) as RegisterSuccess;

    await expect(
      disconnectSession(primaryUser.id, authSessionId, one.sessionId),
    ).resolves.toMatchObject({ ok: true, alreadyDisconnected: false });

    const [active] = await fixtures.sql<CountRow>(
      `select count(*)::text
       from public.user_presence_sessions
       where user_id = $1
         and auth_session_id = $2
         and retired_at is null
         and expires_at > pg_catalog.clock_timestamp()`,
      [primaryUser.id, authSessionId],
    );
    expect(active?.count).toBe("1");
    expect((await sessionRow(two.sessionId)).retired_at).toBeNull();
  });

  it("f: retire_expired_presence_sessions stamps exact bounded expiry evidence", async () => {
    const activeId = await seedSession({
      userId: primaryUser.id,
      expiresAtSql: "pg_catalog.clock_timestamp() + interval '1 hour'",
    });
    const expiredId = await seedSession({
      userId: primaryUser.id,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '5 minutes'",
    });

    const [activeBefore] = await fixtures.sql<CountRow>(
      `select count(*)::text
       from public.user_presence_sessions
       where id = $1
         and retired_at is null
         and expires_at > pg_catalog.clock_timestamp()`,
      [expiredId],
    );
    expect(activeBefore?.count).toBe("0");

    const [result] = await fixtures.sql<{ readonly retired: number }>(
      `select public.retire_expired_presence_sessions() as retired`,
    );
    expect(result?.retired).toBeGreaterThanOrEqual(1);

    const [expired] = await fixtures.sql<{ readonly exact: boolean }>(
      `select retired_at = expires_at as exact
       from public.user_presence_sessions
       where id = $1`,
      [expiredId],
    );
    expect(expired?.exact).toBe(true);
    expect((await sessionRow(activeId)).retired_at).toBeNull();
  });

  it("g: reconcile clears stale placements and preserves active or recent evidence", async () => {
    const staleUser = await createPlainUser("reconcile-stale", companyId);
    const recoveredUser = await createPlainUser(
      "reconcile-recovered",
      companyId,
    );
    const recentEvidenceUser = await createPlainUser(
      "reconcile-recent",
      companyId,
    );

    for (const userId of [
      staleUser.id,
      recoveredUser.id,
      recentEvidenceUser.id,
    ]) {
      await fixtures.sql(
        `update public.users
         set current_space_id = $1, status = 'online'::public.user_status
         where id = $2`,
        [spaceId, userId],
      );
      await fixtures.sql(
        `insert into public.space_presence_log
           (space_id, user_id, entered_at, session_type, context)
         values ($1, $2, pg_catalog.clock_timestamp() - interval '10 minutes', 'workspace'::public.session_type_enum, 'phase2')`,
        [spaceId, userId],
      );
    }

    const staleState = await revisionState(staleUser.id, spaceId);
    await seedSession({
      userId: staleUser.id,
      targetSpaceId: spaceId,
      placementVersion: staleState.location_version + 100,
      userAccessRevision: staleState.user_access_revision,
      spaceAccessRevision: staleState.space_access_revision,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '10 minutes'",
      retiredAtSql: "pg_catalog.clock_timestamp() - interval '10 minutes'",
      retirementReason: "expired",
    });

    const recoveredState = await revisionState(recoveredUser.id, spaceId);
    await seedSession({
      userId: recoveredUser.id,
      targetSpaceId: spaceId,
      placementVersion: recoveredState.location_version,
      userAccessRevision: recoveredState.user_access_revision,
      spaceAccessRevision: recoveredState.space_access_revision,
      expiresAtSql: "pg_catalog.clock_timestamp() + interval '90 seconds'",
    });

    const recentState = await revisionState(recentEvidenceUser.id, spaceId);
    await seedSession({
      userId: recentEvidenceUser.id,
      targetSpaceId: spaceId,
      placementVersion: recentState.location_version,
      userAccessRevision: recentState.user_access_revision,
      spaceAccessRevision: recentState.space_access_revision,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '4 minutes'",
      retiredAtSql: "pg_catalog.clock_timestamp() - interval '4 minutes'",
      retirementReason: "explicit-disconnect",
    });

    await setRuntimeMode('atomic', randomUUID());
    let result: { readonly cleared: number } | undefined;
    try {
      [result] = await fixtures.sql<{ readonly cleared: number }>(
        `select public.reconcile_stale_presence_placements() as cleared`,
      );
    } finally {
      await setRuntimeMode('legacy', null);
    }
    expect(result?.cleared).toBeGreaterThanOrEqual(1);

    const [staleAfter] = await fixtures.sql<{
      readonly current_space_id: string | null;
      readonly location_version: number;
      readonly session_space_id: string | null;
      readonly placement_version: number | null;
      readonly open_logs: string;
    }>(
      `select
         u.current_space_id,
         u.location_version,
         max(s.space_id::text) as session_space_id,
         max(s.placement_version) as placement_version,
         count(l.id) filter (where l.exited_at is null)::text as open_logs
       from public.users as u
       left join public.user_presence_sessions as s on s.user_id = u.id
       left join public.space_presence_log as l on l.user_id = u.id
       where u.id = $1
       group by u.id`,
      [staleUser.id],
    );
    expect(staleAfter?.current_space_id).toBeNull();
    expect(staleAfter?.location_version).toBe(staleState.location_version + 1);
    expect(staleAfter?.session_space_id).toBeNull();
    expect(staleAfter?.placement_version).toBeNull();
    expect(staleAfter?.open_logs).toBe("0");

    for (const userId of [recoveredUser.id, recentEvidenceUser.id]) {
      const [row] = await fixtures.sql<{
        readonly current_space_id: string | null;
      }>(`select current_space_id from public.users where id = $1`, [userId]);
      expect(row?.current_space_id).toBe(spaceId);
    }
  });

  it("h: purge_presence_history deletes only eligible sessions and confirmed absent fences", async () => {
    const oldRetiredId = await seedSession({
      userId: primaryUser.id,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '25 hours'",
      retiredAtSql: "pg_catalog.clock_timestamp() - interval '25 hours'",
      retirementReason: "expired",
    });
    const recentRetiredId = await seedSession({
      userId: primaryUser.id,
      expiresAtSql: "pg_catalog.clock_timestamp() - interval '1 hour'",
      retiredAtSql: "pg_catalog.clock_timestamp() - interval '1 hour'",
      retirementReason: "expired",
    });
    const absentFence = randomUUID();
    const deleteFence = randomUUID();
    await fixtures.sql(
      `insert into public.revoked_presence_auth_sessions
         (auth_session_id, user_id, revoked_at)
       values
         ($1, $2, pg_catalog.clock_timestamp()),
         ($3, $2, pg_catalog.clock_timestamp()),
         ($4, $5, pg_catalog.clock_timestamp())`,
      [
        absentFence,
        primaryUser.id,
        deleteFence,
        liveAuthSessionId,
        authBackedUser.appUserId,
      ],
    );

    const [first] = await fixtures.sql<{
      readonly result: {
        readonly retiredSessionsDeleted: number;
        readonly fencesConfirmed: number;
        readonly fencesDeleted: number;
      };
    }>(`select public.purge_presence_history() as result`);
    expect(first?.result.retiredSessionsDeleted).toBeGreaterThanOrEqual(1);
    expect(first?.result.fencesConfirmed).toBeGreaterThanOrEqual(2);
    expect(first?.result.fencesDeleted).toBe(0);

    const [deletedOld] = await fixtures.sql<CountRow>(
      `select count(*)::text from public.user_presence_sessions where id = $1`,
      [oldRetiredId],
    );
    const [retainedRecent] = await fixtures.sql<CountRow>(
      `select count(*)::text from public.user_presence_sessions where id = $1`,
      [recentRetiredId],
    );
    expect(deletedOld?.count).toBe("0");
    expect(retainedRecent?.count).toBe("1");

    const [absent] = await fixtures.sql<{
      readonly auth_session_absence_confirmed_at: Date | null;
      readonly purge_delay_seconds: string;
    }>(
      `select
         auth_session_absence_confirmed_at,
         extract(epoch from (purge_after - auth_session_absence_confirmed_at))::text as purge_delay_seconds
       from public.revoked_presence_auth_sessions
       where auth_session_id = $1`,
      [absentFence],
    );
    expect(absent?.auth_session_absence_confirmed_at).not.toBeNull();
    expect(Number(absent?.purge_delay_seconds)).toBe(1800 + 7 * 24 * 60 * 60);

    const [live] = await fixtures.sql<{
      readonly auth_session_absence_confirmed_at: Date | null;
    }>(
      `select auth_session_absence_confirmed_at
       from public.revoked_presence_auth_sessions
       where auth_session_id = $1`,
      [liveAuthSessionId],
    );
    expect(live?.auth_session_absence_confirmed_at).toBeNull();

    const [beforeDelete] = await fixtures.sql<CountRow>(
      `select count(*)::text
       from public.revoked_presence_auth_sessions
       where auth_session_id = $1`,
      [absentFence],
    );
    expect(beforeDelete?.count).toBe("1");

    await fixtures.sql(
      `update public.revoked_presence_auth_sessions
       set auth_session_absence_confirmed_at = pg_catalog.clock_timestamp() - interval '8 days',
           purge_after = pg_catalog.clock_timestamp() - interval '1 second'
       where auth_session_id = $1`,
      [deleteFence],
    );
    const [second] = await fixtures.sql<{
      readonly result: { readonly fencesDeleted: number };
    }>(`select public.purge_presence_history() as result`);
    expect(second?.result.fencesDeleted).toBeGreaterThanOrEqual(1);
    const [deletedFence] = await fixtures.sql<CountRow>(
      `select count(*)::text
       from public.revoked_presence_auth_sessions
       where auth_session_id = $1`,
      [deleteFence],
    );
    expect(deletedFence?.count).toBe("0");
  });

  it("i: private.is_presence_auth_session_unfenced reads only verified JWT claims", async () => {
    const unfencedSession = randomUUID();
    await expect(
      expectPrivateUnfenced({
        sub: primaryUser.supabase_uid,
        session_id: unfencedSession,
      }),
    ).resolves.toBe(true);

    const fencedSession = randomUUID();
    await fixtures.sql(
      `insert into public.revoked_presence_auth_sessions
         (auth_session_id, user_id, revoked_at)
       values ($1, $2, pg_catalog.clock_timestamp())`,
      [fencedSession, primaryUser.id],
    );
    await expect(
      expectPrivateUnfenced({
        sub: primaryUser.supabase_uid,
        session_id: fencedSession,
      }),
    ).resolves.toBe(false);
    await expect(
      expectPrivateUnfenced({ sub: primaryUser.supabase_uid }),
    ).resolves.toBe(false);
    await expect(
      expectPrivateUnfenced({
        sub: primaryUser.supabase_uid,
        session_id: "not-a-uuid",
      }),
    ).resolves.toBe(false);
    await expect(
      expectPrivateUnfenced({
        sub: randomUUID(),
        session_id: randomUUID(),
      }),
    ).resolves.toBe(false);
  });

  it("j: catalog ownership, grants, and cron rows match the Phase 2 contract", async () => {
    const [role] = await fixtures.sql<{
      readonly rolcanlogin: boolean;
      readonly rolinherit: boolean;
      readonly rolbypassrls: boolean;
      readonly rolsuper: boolean;
      readonly rolcreaterole: boolean;
      readonly rolcreatedb: boolean;
      readonly rolreplication: boolean;
      readonly memberships: string;
    }>(
      `select
         r.rolcanlogin,
         r.rolinherit,
         r.rolbypassrls,
         r.rolsuper,
         r.rolcreaterole,
         r.rolcreatedb,
         r.rolreplication,
         count(m.roleid)::text as memberships
       from pg_catalog.pg_roles as r
       left join pg_catalog.pg_auth_members as m on m.member = r.oid
       where r.rolname = 'presence_maintenance_owner'
       group by r.rolcanlogin, r.rolinherit, r.rolbypassrls, r.rolsuper,
         r.rolcreaterole, r.rolcreatedb, r.rolreplication`,
    );
    expect(role).toMatchObject({
      rolcanlogin: false,
      rolinherit: false,
      rolbypassrls: false,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      memberships: "0",
    });

    // Handoff: never grant presence_maintenance_owner to any API/login role. The
    // migration grants it to postgres transiently (for ALTER ... OWNER) and must
    // revoke it before committing.
    const forbiddenMembers = await fixtures.sql<{ rolname: string }>(
      `select member.rolname
       from pg_catalog.pg_auth_members as m
       join pg_catalog.pg_roles as owner_role on owner_role.oid = m.roleid
       join pg_catalog.pg_roles as member on member.oid = m.member
       where owner_role.rolname = 'presence_maintenance_owner'`,
    );
    expect(forbiddenMembers).toEqual([]);

    const functions = await fixtures.sql<{
      readonly schema_name: string;
      readonly function_name: string;
      readonly args: string;
      readonly owner_name: string;
      readonly prosecdef: boolean;
      readonly search_path_fixed: boolean;
      readonly grants: string[];
    }>(
      `select
         n.nspname as schema_name,
         p.proname as function_name,
         pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
         owner.rolname as owner_name,
         p.prosecdef,
         p.proconfig @> array['search_path=pg_catalog'] as search_path_fixed,
         coalesce(
           array_agg(
             case
               when acl.grantee = 0 then 'PUBLIC'
               else grantee.rolname
             end || ':' || acl.privilege_type
             order by
               case
                 when acl.grantee = 0 then 'PUBLIC'
                 else grantee.rolname
               end
           ) filter (where acl.grantee is not null and acl.grantee <> p.proowner),
           '{}'::text[]
         ) as grants
       from pg_catalog.pg_proc as p
       join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
       join pg_catalog.pg_roles as owner on owner.oid = p.proowner
       left join lateral pg_catalog.aclexplode(p.proacl) as acl on true
       left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
       where (n.nspname, p.proname) in (
         ('public', 'register_presence_session'),
         ('public', 'heartbeat_presence_session'),
         ('public', 'disconnect_presence_session'),
         ('private', 'is_presence_auth_session_unfenced'),
         ('public', 'retire_expired_presence_sessions'),
         ('public', 'reconcile_stale_presence_placements'),
         ('public', 'purge_presence_history')
       )
       group by n.nspname, p.proname, p.oid, owner.rolname
       order by n.nspname, p.proname`,
    );
    expect(functions).toHaveLength(7);

    const expectedGrants = new Map<string, readonly string[]>([
      ["public.register_presence_session", ["service_role:EXECUTE"]],
      ["public.heartbeat_presence_session", ["service_role:EXECUTE"]],
      ["public.disconnect_presence_session", ["service_role:EXECUTE"]],
      [
        "private.is_presence_auth_session_unfenced",
        ["authenticated:EXECUTE", "service_role:EXECUTE"],
      ],
      ["public.retire_expired_presence_sessions", ["postgres:EXECUTE"]],
      ["public.reconcile_stale_presence_placements", ["postgres:EXECUTE"]],
      ["public.purge_presence_history", ["postgres:EXECUTE"]],
    ]);

    for (const fn of functions) {
      const key = `${fn.schema_name}.${fn.function_name}`;
      expect(fn.owner_name, key).toBe("presence_maintenance_owner");
      expect(fn.prosecdef, key).toBe(true);
      expect(fn.search_path_fixed, key).toBe(true);
      expect(fn.grants.sort(), key).toEqual(
        [...(expectedGrants.get(key) ?? [])].sort(),
      );
    }

    const cronRows = await fixtures.sql<{
      readonly jobname: string;
      readonly schedule: string;
      readonly command: string;
      readonly username: string;
    }>(
      `select jobname, schedule, command, username
       from cron.job
       where jobname in (
         'presence-retire-sessions-v1',
         'presence-purge-history-v1',
         'presence-reconcile-placement-v1'
       )
       order by jobname`,
    );
    expect(cronRows).toEqual([
      {
        jobname: "presence-purge-history-v1",
        schedule: "30 3 * * *",
        command: "select public.purge_presence_history();",
        username: "postgres",
      },
      {
        jobname: "presence-retire-sessions-v1",
        schedule: "* * * * *",
        command: "select public.retire_expired_presence_sessions();",
        username: "postgres",
      },
    ]);
  });
});
