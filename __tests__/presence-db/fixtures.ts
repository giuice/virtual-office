import { Client } from 'pg';
import { LOCAL_DB_URL } from './setup';

/**
 * Deterministic fixture harness for presence DB tests.
 *
 * Every row a test creates is tagged with a per-test namespace so teardown is
 * exact — no "delete from users" that could nuke unrelated fixtures. Later
 * phases add builders (companies, spaces, sessions, knock rows) on top of this.
 */
export class PresenceFixtures {
  readonly client: Client;
  readonly ns: string;

  private constructor(client: Client, ns: string) {
    this.client = client;
    this.ns = ns;
  }

  static async connect(namespace: string): Promise<PresenceFixtures> {
    const client = new Client({ connectionString: LOCAL_DB_URL });
    await client.connect();
    // The harness connection represents trusted fixture/setup work. Phase 6's
    // catch-all users UPDATE audit deliberately rejects an unclassified JWT
    // role, so keep raw fixture SQL classified as the service path. Tests that
    // exercise authenticated or malformed claims override this setting inside
    // their own transaction and automatically return to service_role.
    await client.query(
      `select pg_catalog.set_config(
         'request.jwt.claims',
         '{"role":"service_role"}',
         false
       )`,
    );
    return new PresenceFixtures(client, namespace);
  }

  /** Run raw SQL as the postgres superuser (fixture setup / assertions). */
  async sql<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const res = await this.client.query(text, params);
    return res.rows as T[];
  }

  /**
   * Delete everything created under this namespace. Order respects FKs.
   * Namespaced by email/name suffix `::<ns>` used by the builders in later phases.
   */
  async cleanup(): Promise<void> {
    // `%` on both sides: emails embed the tag mid-string (phase2-x::<ns>@example.test).
    const tag = `%::${this.ns}%`;
    await this.client.query(
      `delete from public.invitations
         where email like $1
            or company_id in (select id from public.companies where name like $1)`,
      [tag],
    );
    // knock_requests.space_id is ON DELETE RESTRICT (Phase 1) and auth-backed
    // test users carry valid emails that don't match the `::<ns>` tag, so knock
    // rows are also removed by namespaced space before users/spaces go.
    await this.client.query(
      `delete from public.knock_requests
         where requester_id in (select id from public.users where email like $1)
            or space_id in (select id from public.spaces where name like $1)`,
      [tag],
    );
    await this.client.query(
      `delete from public.space_presence_log
         where user_id in (select id from public.users where email like $1)`,
      [tag],
    );
    await this.client.query(
      `delete from public.user_presence_sessions
         where user_id in (select id from public.users where email like $1)`,
      [tag],
    );
    await this.client.query(
      `delete from public.revoked_presence_auth_sessions
         where user_id in (select id from public.users where email like $1)`,
      [tag],
    );
    await this.client.query(`delete from public.users where email like $1`, [tag]);
    // Phase 3 RESTRICT FKs: unhook any remaining reference to tagged spaces
    // (users/log/session rows from other namespaces) before deleting them.
    // Gate note: runs in mode 'legacy' (tests restore it), so markerless
    // postgres writes pass the movement gate.
    await this.client.query(
      `update public.users set current_space_id = null
         where current_space_id in (select id from public.spaces where name like $1)`,
      [tag],
    );
    await this.client.query(
      `delete from public.space_presence_log
         where space_id in (select id from public.spaces where name like $1)`,
      [tag],
    );
    await this.client.query(
      `update public.user_presence_sessions set space_id = null
         where space_id in (select id from public.spaces where name like $1)`,
      [tag],
    );
    await this.client.query(`delete from public.spaces where name like $1`, [tag]);
    await this.client.query(`delete from public.companies where name like $1`, [tag]);
  }

  async end(): Promise<void> {
    await this.client.end();
  }
}

/** Restore the permanent Phase 10 invariant after tests that exercise cutover without it. */
export async function ensurePresenceOpenLogUniqueIndex(
  fixtures: PresenceFixtures,
): Promise<void> {
  await fixtures.sql(
    `create unique index if not exists ux_space_presence_log_one_open_per_user
     on public.space_presence_log (user_id)
     where exited_at is null`,
  );
}
