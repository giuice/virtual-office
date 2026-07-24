import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser, type AuthedUser } from "./auth-clients";
import { PresenceFixtures } from "./fixtures";

const NS = `screen-share-realtime-${randomUUID()}`;

interface MediaFixture {
  readonly companyId: string;
  readonly spaceId: string;
  readonly wrongSpaceId: string;
  readonly otherCompanyId: string;
  readonly otherSpaceId: string;
  readonly authSessionId: string;
  readonly presenceSessionId: string;
  readonly user: AuthedUser;
}

function sessionIdFromAccessToken(token: string): string {
  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) throw new Error("Local Auth token was malformed");
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as { session_id?: string };
  if (!payload.session_id) {
    throw new Error("Local Auth session did not include session_id");
  }
  return payload.session_id;
}

function mediaTopic(companyId: string, spaceId: string): string {
  return `company:${companyId}:space:${spaceId}:media`;
}

describe("presence-db private screen-share Realtime authorization", () => {
  let fixtures: PresenceFixtures;
  let media: MediaFixture;
  let savepointSequence = 0;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect(NS);
    const [company] = await fixtures.sql<{ id: string }>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [`Media policy company::${NS}`],
    );
    const [otherCompany] = await fixtures.sql<{ id: string }>(
      `insert into public.companies (name, settings)
       values ($1, '{}'::jsonb)
       returning id`,
      [`Media policy other company::${NS}`],
    );
    if (!company || !otherCompany) {
      throw new Error("Failed to create media policy companies");
    }

    const spaces = await fixtures.sql<{
      id: string;
      company_id: string;
      presence_access_revision: string;
    }>(
      `insert into public.spaces
         (company_id, name, type, status, capacity, access_control)
       values
         ($1, $3, 'workspace'::public.space_type, 'active'::public.space_status,
          8, '{"isPublic":true}'::jsonb),
         ($1, $4, 'workspace'::public.space_type, 'active'::public.space_status,
          8, '{"isPublic":true}'::jsonb),
         ($2, $5, 'workspace'::public.space_type, 'active'::public.space_status,
          8, '{"isPublic":true}'::jsonb)
       returning id, company_id, presence_access_revision`,
      [
        company.id,
        otherCompany.id,
        `Media policy room::${NS}`,
        `Media policy wrong room::${NS}`,
        `Media policy other room::${NS}`,
      ],
    );
    const companySpaces = spaces.filter(
      ({ company_id }) => company_id === company.id,
    );
    const otherSpace = spaces.find(
      ({ company_id }) => company_id === otherCompany.id,
    );
    const space = companySpaces[0];
    const wrongSpace = companySpaces[1];
    if (!space || !wrongSpace || !otherSpace) {
      throw new Error("Failed to create media policy spaces");
    }

    const user = await createAuthedUser(fixtures, NS, {
      key: `media-policy-${randomUUID()}`,
      companyId: company.id,
    });
    expect(user.appUserId).not.toBe(user.supabaseUid);
    const { data, error } = await user.client.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Missing local Auth session for media policy user");
    }
    const authSessionId = sessionIdFromAccessToken(data.session.access_token);
    const [placed] = await fixtures.sql<{
      location_version: number;
      presence_access_revision: string;
    }>(
      `update public.users
          set current_space_id = $1
        where id = $2
        returning location_version, presence_access_revision`,
      [space.id, user.appUserId],
    );
    if (!placed) throw new Error("Failed to place media policy user");
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
        company.id,
        space.id,
        placed.location_version,
        placed.presence_access_revision,
        space.presence_access_revision,
      ],
    );
    if (!session)
      throw new Error("Failed to create media policy Presence lease");

    media = {
      companyId: company.id,
      spaceId: space.id,
      wrongSpaceId: wrongSpace.id,
      otherCompanyId: otherCompany.id,
      otherSpaceId: otherSpace.id,
      authSessionId,
      presenceSessionId: session.id,
      user,
    };
  });

  afterAll(async () => {
    if (!fixtures) return;
    await fixtures.sql(`delete from public.users where id = $1`, [
      media.user.appUserId,
    ]);
    await fixtures.cleanup();
    await fixtures.end();
  });

  async function setAuthenticated(
    topic: string,
    claims: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await fixtures.sql("reset role");
    await fixtures.sql(
      `select pg_catalog.set_config('request.jwt.claims', $1, true),
              pg_catalog.set_config('realtime.topic', $2, true)`,
      [JSON.stringify({ role: "authenticated", ...claims }), topic],
    );
    await fixtures.sql("set local role authenticated");
  }

  async function expectInsertDenied(
    topic: string,
    extension: string,
  ): Promise<void> {
    savepointSequence += 1;
    const savepoint = `media_policy_denied_${savepointSequence}`;
    await fixtures.sql(`savepoint ${savepoint}`);
    await expect(
      fixtures.sql(
        `insert into realtime.messages (topic, extension)
         values ($1, $2)`,
        [topic, extension],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await fixtures.sql(`rollback to savepoint ${savepoint}`);
  }

  async function seedMessages(): Promise<
    Array<{ id: string; topic: string; extension: string }>
  > {
    const ownTopic = mediaTopic(media.companyId, media.spaceId);
    const wrongSpaceTopic = mediaTopic(media.companyId, media.wrongSpaceId);
    const otherCompanyTopic = mediaTopic(
      media.otherCompanyId,
      media.otherSpaceId,
    );
    return fixtures.sql(
      `insert into realtime.messages (topic, extension)
       values
         ($1, 'broadcast'), ($1, 'presence'), ($1, 'postgres_changes'),
         ($2, 'broadcast'), ($2, 'presence'),
         ($3, 'broadcast'), ($3, 'presence')
       returning id, topic, extension`,
      [ownTopic, wrongSpaceTopic, otherCompanyTopic],
    );
  }

  it("allows exactly broadcast/presence read and write on the occupant's own private media topic", async () => {
    await fixtures.sql("begin");
    try {
      const inserted = await seedMessages();
      const ownTopic = mediaTopic(media.companyId, media.spaceId);
      await setAuthenticated(ownTopic, {
        sub: media.user.supabaseUid,
        session_id: media.authSessionId,
      });

      const visible = await fixtures.sql<{ extension: string }>(
        `select extension
           from realtime.messages
          where topic = $1
            and id = any($2::uuid[])
          order by extension`,
        [ownTopic, inserted.map(({ id }) => id)],
      );
      expect(visible.map(({ extension }) => extension)).toEqual([
        "broadcast",
        "presence",
      ]);

      expect(
        await fixtures.sql<{ extension: string }>(
          `insert into realtime.messages (topic, extension)
           values ($1, 'broadcast'), ($1, 'presence')
           returning extension`,
          [ownTopic],
        ),
      ).toEqual([{ extension: "broadcast" }, { extension: "presence" }]);
      await expectInsertDenied(ownTopic, "postgres_changes");
    } finally {
      await fixtures.sql("rollback");
    }
  });

  it("denies cross-company, same-company wrong-space, malformed-topic, and wrong-extension operations", async () => {
    await fixtures.sql("begin");
    try {
      const inserted = await seedMessages();
      const cases = [
        mediaTopic(media.companyId, media.wrongSpaceId),
        mediaTopic(media.otherCompanyId, media.otherSpaceId),
        `company:${media.companyId}:space:not-a-uuid:media`,
        `company:${media.companyId}:space:${media.spaceId}`,
        `company:${media.companyId}:space:${media.spaceId}:media:extra`,
        "",
      ];
      for (const topic of cases) {
        await setAuthenticated(topic, {
          sub: media.user.supabaseUid,
          session_id: media.authSessionId,
        });
        expect(
          await fixtures.sql(
            `select id
               from realtime.messages
              where id = any($1::uuid[])`,
            [inserted.map(({ id }) => id)],
          ),
        ).toEqual([]);
        await expectInsertDenied(topic, "broadcast");
        await expectInsertDenied(topic, "presence");
      }
    } finally {
      await fixtures.sql("rollback");
    }
  });

  it("denies missing, malformed, revoked, unmapped, and non-occupant identities", async () => {
    await fixtures.sql("begin");
    try {
      const inserted = await seedMessages();
      const ownTopic = mediaTopic(media.companyId, media.spaceId);
      const deniedClaims = [
        { sub: media.user.supabaseUid },
        { sub: media.user.supabaseUid, session_id: "not-a-uuid" },
        { sub: randomUUID(), session_id: media.authSessionId },
        { sub: media.user.appUserId, session_id: media.authSessionId },
      ];
      for (const claims of deniedClaims) {
        await setAuthenticated(ownTopic, claims);
        expect(
          await fixtures.sql(
            `select id
               from realtime.messages
              where id = any($1::uuid[])`,
            [inserted.map(({ id }) => id)],
          ),
        ).toEqual([]);
        await expectInsertDenied(ownTopic, "broadcast");
        await expectInsertDenied(ownTopic, "presence");
      }

      await fixtures.sql("reset role");
      await fixtures.sql(
        `insert into public.revoked_presence_auth_sessions
           (auth_session_id, user_id, revoked_at)
         values ($1, $2, pg_catalog.clock_timestamp())`,
        [media.authSessionId, media.user.appUserId],
      );
      await setAuthenticated(ownTopic, {
        sub: media.user.supabaseUid,
        session_id: media.authSessionId,
      });
      expect(
        await fixtures.sql(
          `select id
             from realtime.messages
            where id = any($1::uuid[])`,
          [inserted.map(({ id }) => id)],
        ),
      ).toEqual([]);
      await expectInsertDenied(ownTopic, "broadcast");
      await expectInsertDenied(ownTopic, "presence");

      await fixtures.sql("reset role");
      await fixtures.sql(
        `delete from public.revoked_presence_auth_sessions
          where auth_session_id = $1
            and user_id = $2`,
        [media.authSessionId, media.user.appUserId],
      );
      await fixtures.sql(
        `update public.users
            set current_space_id = null,
                location_version = location_version + 1
          where id = $1`,
        [media.user.appUserId],
      );
      await setAuthenticated(ownTopic, {
        sub: media.user.supabaseUid,
        session_id: media.authSessionId,
      });
      expect(
        await fixtures.sql(
          `select id
             from realtime.messages
            where id = any($1::uuid[])`,
          [inserted.map(({ id }) => id)],
        ),
      ).toEqual([]);
      await expectInsertDenied(ownTopic, "broadcast");
      await expectInsertDenied(ownTopic, "presence");
    } finally {
      await fixtures.sql("rollback");
    }
  });

  it("reads back the exact four media policies, helper boundary, and migration history", async () => {
    const policies = await fixtures.sql<{
      policyname: string;
      cmd: string;
      roles: string[];
      qual: string | null;
      with_check: string | null;
    }>(
      `select policyname, cmd, roles::text[] as roles, qual, with_check
         from pg_catalog.pg_policies
        where schemaname = 'realtime'
          and tablename = 'messages'
          and policyname like 'phase8_media_%'
        order by policyname`,
    );
    expect(
      policies.map(({ policyname, cmd, roles }) => ({
        policyname,
        cmd,
        roles,
      })),
    ).toEqual([
      {
        policyname: "phase8_media_broadcast_receive",
        cmd: "SELECT",
        roles: ["authenticated"],
      },
      {
        policyname: "phase8_media_broadcast_send",
        cmd: "INSERT",
        roles: ["authenticated"],
      },
      {
        policyname: "phase8_media_presence_receive",
        cmd: "SELECT",
        roles: ["authenticated"],
      },
      {
        policyname: "phase8_media_presence_track",
        cmd: "INSERT",
        roles: ["authenticated"],
      },
    ]);
    const expectedExtensions = new Map([
      ["phase8_media_broadcast_receive", "broadcast"],
      ["phase8_media_broadcast_send", "broadcast"],
      ["phase8_media_presence_receive", "presence"],
      ["phase8_media_presence_track", "presence"],
    ]);
    for (const policy of policies) {
      const expression = `${policy.qual ?? ""} ${policy.with_check ?? ""}`;
      expect(expression).toContain(
        `extension = '${expectedExtensions.get(policy.policyname)}'`,
      );
      expect(expression).toMatch(
        /private\.is_media_topic_authorized\(\(\s*select\s+realtime\.topic\(\)\s+as\s+topic\s*\)\)/i,
      );
    }

    const [helper] = await fixtures.sql<{
      owner: string;
      security_definer: boolean;
      config: string[];
      authenticated_execute: boolean;
      service_execute: boolean;
      anon_execute: boolean;
    }>(
      `select pg_catalog.pg_get_userbyid(p.proowner) as owner,
              p.prosecdef as security_definer,
              p.proconfig as config,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                as authenticated_execute,
              pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
                as service_execute,
              pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
                as anon_execute
         from pg_catalog.pg_proc as p
        where p.oid = pg_catalog.to_regprocedure(
          'private.is_media_topic_authorized(text)'
        )`,
    );
    expect(helper).toEqual({
      owner: "presence_maintenance_owner",
      security_definer: true,
      config: ["search_path=pg_catalog"],
      authenticated_execute: true,
      service_execute: false,
      anon_execute: false,
    });

    const migrations = await fixtures.sql<{ version: string; copies: string }>(
      `select version, pg_catalog.count(*)::text as copies
         from supabase_migrations.schema_migrations
        where version in ('20260723104902', '20260723224547')
        group by version
        order by version`,
    );
    expect(migrations).toEqual([
      { version: "20260723104902", copies: "1" },
      { version: "20260723224547", copies: "1" },
    ]);
  });

  it("does not grant authenticated callers direct lease-table enumeration or mutation", async () => {
    await fixtures.sql("begin");
    try {
      await setAuthenticated(mediaTopic(media.companyId, media.spaceId), {
        sub: media.user.supabaseUid,
        session_id: media.authSessionId,
      });
      await expect(
        fixtures.sql(`select * from public.screen_share_leases`),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await fixtures.sql("rollback");
    }
  });

  // Realtime Authorization checks are evaluated by the service and cached for
  // a live private channel. This suite proves the database decision only;
  // client scope/token changes must refresh auth and reconnect (covered in 03-03).
});
