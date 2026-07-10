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
    const tag = `%::${this.ns}`;
    await this.client.query(
      `delete from public.knock_requests
         where requester_id in (select id from public.users where email like $1)`,
      [tag],
    );
    await this.client.query(
      `delete from public.space_presence_log
         where user_id in (select id from public.users where email like $1)`,
      [tag],
    );
    await this.client.query(`delete from public.users where email like $1`, [tag]);
    await this.client.query(`delete from public.spaces where name like $1`, [tag]);
    await this.client.query(`delete from public.companies where name like $1`, [tag]);
  }

  async end(): Promise<void> {
    await this.client.end();
  }
}
