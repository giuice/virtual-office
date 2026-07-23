import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PresenceFixtures } from "./fixtures";

describe("presence-db Phase 6 private company Realtime", () => {
  let fixtures: PresenceFixtures;

  beforeAll(async () => {
    fixtures = await PresenceFixtures.connect("phase6-realtime-catalog");
  });

  afterAll(async () => {
    if (fixtures) await fixtures.end();
  });

  it("retains users and spaces exactly once and excludes knock requests", async () => {
    const rows = await fixtures.sql<{ tablename: string }>(
      `select tablename
       from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename in ('users', 'spaces', 'knock_requests')
       order by tablename`,
    );

    expect(rows.map((row) => row.tablename)).toEqual(["spaces", "users"]);
  });

  it("installs only the exact private-channel policies expected by the remediation", async () => {
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
       order by policyname`,
    );

    expect(
      policies.map(({ policyname, cmd }) => ({ policyname, cmd })),
    ).toEqual([
      { policyname: "phase4_knock_broadcast_receive", cmd: "SELECT" },
      {
        policyname: "phase6_company_presence_channel_broadcast_receive",
        cmd: "SELECT",
      },
      { policyname: "phase6_company_presence_receive", cmd: "SELECT" },
      { policyname: "phase6_company_presence_track", cmd: "INSERT" },
      { policyname: "phase8_media_broadcast_receive", cmd: "SELECT" },
      { policyname: "phase8_media_broadcast_send", cmd: "INSERT" },
      { policyname: "phase8_media_presence_receive", cmd: "SELECT" },
      { policyname: "phase8_media_presence_track", cmd: "INSERT" },
    ]);
    for (const policy of policies.filter(({ policyname }) =>
      policyname.startsWith("phase6_"),
    )) {
      expect(policy.roles).toEqual(["authenticated"]);
      const expression = `${policy.qual ?? ""} ${policy.with_check ?? ""}`;
      expect(expression).toContain(
        policy.policyname ===
          "phase6_company_presence_channel_broadcast_receive"
          ? "extension = 'broadcast'"
          : "extension = 'presence'",
      );
      expect(expression).toContain("company:");
      expect(expression).toContain(":presence");
      expect(expression).toContain("current_presence_company_id");
      expect(expression).toContain("is_presence_auth_session_unfenced");
    }

    const mediaPolicyExtensions = new Map([
      ["phase8_media_broadcast_receive", "broadcast"],
      ["phase8_media_broadcast_send", "broadcast"],
      ["phase8_media_presence_receive", "presence"],
      ["phase8_media_presence_track", "presence"],
    ]);
    for (const policy of policies.filter(({ policyname }) =>
      policyname.startsWith("phase8_"),
    )) {
      const expectedExtension = mediaPolicyExtensions.get(policy.policyname);
      expect(expectedExtension).toBeDefined();
      expect(policy.roles).toEqual(["authenticated"]);
      const expression = `${policy.qual ?? ""} ${policy.with_check ?? ""}`;
      expect(expression).toContain(`extension = '${expectedExtension}'`);
      expect(expression).toMatch(
        /private\.is_media_topic_authorized\(\(\s*select\s+realtime\.topic\(\)\s+as\s+topic\s*\)\)/i,
      );
    }
  });

  it("allows only the fenced own-company operations required for private Presence", async () => {
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const supabaseUid = randomUUID();
    const authSessionId = randomUUID();
    const topic = `company:${companyId}:presence`;
    const otherTopic = `company:${otherCompanyId}:presence`;

    await fixtures.sql("begin");
    try {
      await fixtures.sql(
        `insert into public.companies (id, name, settings)
         values ($1, $3, '{}'::jsonb), ($2, $4, '{}'::jsonb)`,
        [
          companyId,
          otherCompanyId,
          `Phase 6 Realtime company::${companyId}`,
          `Phase 6 Realtime company::${otherCompanyId}`,
        ],
      );
      const [user] = await fixtures.sql<{ id: string }>(
        `insert into public.users
           (supabase_uid, email, display_name, company_id, role)
         values ($1, $2, 'Phase 6 Realtime user', $3, 'member'::public.user_role)
         returning id`,
        [supabaseUid, `phase6-realtime-${supabaseUid}@example.test`, companyId],
      );
      if (!user) throw new Error("Failed to create Phase 6 Realtime user");
      const inserted = await fixtures.sql<{ id: string }>(
        `insert into realtime.messages (topic, extension)
         values
           ($1, 'broadcast'), ($1, 'presence'),
           ($2, 'broadcast'), ($2, 'presence')
         returning id`,
        [topic, otherTopic],
      );

      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
        [
          JSON.stringify({
            role: "authenticated",
            sub: supabaseUid,
            session_id: authSessionId,
          }),
        ],
      );
      await fixtures.sql(
        `select pg_catalog.set_config('realtime.topic', $1, true)`,
        [topic],
      );
      await fixtures.sql("set local role authenticated");

      const visible = await fixtures.sql<{ extension: string }>(
        `select extension
         from realtime.messages
         where topic = $1
           and id = any($2::uuid[])
         order by extension`,
        [topic, inserted.map(({ id }) => id)],
      );

      expect(visible.map(({ extension }) => extension)).toEqual([
        "broadcast",
        "presence",
      ]);

      const tracked = await fixtures.sql<{ extension: string }>(
        `insert into realtime.messages (topic, extension)
         values ($1, 'presence')
         returning extension`,
        [topic],
      );
      expect(tracked).toEqual([{ extension: "presence" }]);

      await fixtures.sql("savepoint broadcast_insert_denied");
      await expect(
        fixtures.sql(
          `insert into realtime.messages (topic, extension)
         values ($1, 'broadcast')`,
          [topic],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await fixtures.sql("rollback to savepoint broadcast_insert_denied");

      await fixtures.sql(
        `select pg_catalog.set_config('realtime.topic', $1, true)`,
        [otherTopic],
      );
      const crossCompany = await fixtures.sql<{ extension: string }>(
        `select extension
         from realtime.messages
         where id = any($1::uuid[])`,
        [inserted.map(({ id }) => id)],
      );
      expect(crossCompany).toEqual([]);

      await fixtures.sql(
        `select pg_catalog.set_config('realtime.topic', $1, true)`,
        [topic],
      );
      for (const sessionId of [undefined, "not-a-uuid"]) {
        await fixtures.sql(
          `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
          [
            JSON.stringify({
              role: "authenticated",
              sub: supabaseUid,
              ...(sessionId ? { session_id: sessionId } : {}),
            }),
          ],
        );
        expect(
          await fixtures.sql(
            `select extension
           from realtime.messages
           where id = any($1::uuid[])`,
            [inserted.map(({ id }) => id)],
          ),
        ).toEqual([]);
      }

      await fixtures.sql("reset role");
      await fixtures.sql(
        `insert into public.revoked_presence_auth_sessions
           (auth_session_id, user_id, revoked_at)
         values ($1, $2, pg_catalog.clock_timestamp())`,
        [authSessionId, user.id],
      );
      await fixtures.sql(
        `select pg_catalog.set_config('request.jwt.claims', $1, true)`,
        [
          JSON.stringify({
            role: "authenticated",
            sub: supabaseUid,
            session_id: authSessionId,
          }),
        ],
      );
      await fixtures.sql("set local role authenticated");
      expect(
        await fixtures.sql(
          `select extension
         from realtime.messages
         where id = any($1::uuid[])`,
          [inserted.map(({ id }) => id)],
        ),
      ).toEqual([]);
    } finally {
      await fixtures.sql("rollback");
    }
  });
});
