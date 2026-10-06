// Local messaging world for DB integration tests: two members of one company
// sharing a direct, a group, and a room conversation, a group history longer
// than one drawer page, and an outsider in another company. Every row is
// tracked by id and removed in `cleanup`.
import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';

import {
  MESSAGING_ANON_KEY,
  MESSAGING_API_URL,
  MESSAGING_DB_URL,
  MESSAGING_SERVICE_ROLE_KEY,
} from './setup';

/** Drawer history page size (useMessages / GET /api/messages/get default). */
export const MESSAGE_PAGE_SIZE = 20;

export interface MessagingDbUser {
  readonly appUserId: string;
  readonly supabaseUid: string;
  readonly email: string;
  /** Anon-key client signed in as this user: every query runs under RLS. */
  readonly client: SupabaseClient;
}

export interface MessagingDbWorld {
  readonly companyId: string;
  readonly primary: MessagingDbUser;
  readonly secondary: MessagingDbUser;
  readonly outsider: MessagingDbUser;
  /** Same-company member of the GROUP conversation only (opt-in). */
  readonly groupThirdMember: MessagingDbUser | null;
  readonly directConversationId: string;
  readonly groupConversationId: string;
  readonly roomConversationId: string;
  /** Message ids of the group history, oldest first. */
  readonly historyMessageIds: readonly string[];
  /**
   * Trusted raw SQL on the local database (fixture setup and assertions only;
   * product behavior is exercised through routes and user-scoped clients).
   */
  query<Row extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Row[]>;
  cleanup(): Promise<void>;
}

/** Local-only fixture password shared by every fixture account. */
export const MESSAGING_DB_PASSWORD = 'local-messaging-db-password';
const PASSWORD = MESSAGING_DB_PASSWORD;

function serviceClient(): SupabaseClient {
  return createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createMessagingWorld(options: {
  historyMessageCount: number;
  withGroupThirdMember?: boolean;
}): Promise<MessagingDbWorld> {
  const ns = randomUUID().slice(0, 8);
  const admin = serviceClient();
  const db = new Client({ connectionString: MESSAGING_DB_URL });
  await db.connect();
  // Trusted fixture path: classify raw SQL as service_role for the presence
  // audit triggers on public.users (same convention as presence-db fixtures).
  await db.query(
    `select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false)`,
  );

  const authUserIds: string[] = [];
  const companyIds: string[] = [];
  const appUserIds: string[] = [];
  const conversationIds: string[] = [];
  const spaceIds: string[] = [];

  const cleanup = async (): Promise<void> => {
    const errors: string[] = [];
    const run = async (label: string, sql: string, ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await db.query(sql, [ids]);
      } catch (error) {
        errors.push(`${label}: ${(error as Error).message}`);
      }
    };
    await run('conversations', 'delete from public.conversations where id = any($1::uuid[])', conversationIds);
    await run(
      'rate limit counters',
      'delete from private.rate_limit_counters where user_id = any($1::uuid[])',
      appUserIds,
    );
    await run('spaces', 'delete from public.spaces where id = any($1::uuid[])', spaceIds);
    await run('users', 'delete from public.users where id = any($1::uuid[])', appUserIds);
    await run('companies', 'delete from public.companies where id = any($1::uuid[])', companyIds);
    for (const id of authUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) errors.push(`auth ${id}: ${error.message}`);
    }
    await db.end();
    if (errors.length > 0) {
      throw new Error(`Messaging DB fixture cleanup failed: ${errors.join('; ')}`);
    }
  };

  try {
    const insertCompany = async (name: string): Promise<string> => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.companies (name, admin_ids, settings) values ($1, '{}', '{}') returning id`,
        [name],
      );
      companyIds.push(rows[0].id);
      return rows[0].id;
    };

    const createUser = async (
      key: string,
      companyId: string,
      role: 'admin' | 'member',
    ): Promise<MessagingDbUser> => {
      const email = `msgdb-${key}-${ns}@local.test`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`Failed to create auth user ${email}: ${error?.message ?? 'no user'}`);
      }
      authUserIds.push(data.user.id);

      // company_id is set at INSERT: the database rejects later direct
      // service-role membership updates (product path is the company RPCs).
      const { rows } = await db.query<{ id: string }>(
        `insert into public.users (supabase_uid, email, display_name, company_id, role)
         values ($1, $2, $3, $4, $5::public.user_role) returning id`,
        [data.user.id, email, `Msg DB ${key}`, companyId, role],
      );
      appUserIds.push(rows[0].id);

      const client = createClient(MESSAGING_API_URL, MESSAGING_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (signInError) {
        throw new Error(`Failed to sign in ${email}: ${signInError.message}`);
      }
      return { appUserId: rows[0].id, supabaseUid: data.user.id, email, client };
    };

    const companyId = await insertCompany(`Msg DB Company ${ns}`);
    const otherCompanyId = await insertCompany(`Msg DB Other Company ${ns}`);
    const primary = await createUser('primary', companyId, 'admin');
    const secondary = await createUser('secondary', companyId, 'member');
    const outsider = await createUser('outsider', otherCompanyId, 'member');
    const groupThirdMember = options.withGroupThirdMember
      ? await createUser('third', companyId, 'member')
      : null;

    const { rows: spaceRows } = await db.query<{ id: string }>(
      `insert into public.spaces (company_id, name, type, status, created_by)
       values ($1, $2, 'workspace', 'active', $3) returning id`,
      [companyId, `Msg DB Room ${ns}`, primary.appUserId],
    );
    spaceIds.push(spaceRows[0].id);

    // conversation_members rows come from trigger_sync_conversation_members.
    const insertConversation = async (
      type: 'direct' | 'group' | 'room',
      visibility: 'direct' | 'private' | 'public',
      roomId: string | null,
    ): Promise<string> => {
      const participants = [primary.appUserId, secondary.appUserId];
      if (type === 'group' && groupThirdMember) participants.push(groupThirdMember.appUserId);
      const { rows } = await db.query<{ id: string }>(
        `insert into public.conversations (type, visibility, participants, name, room_id)
         values ($1::public.conversation_type, $2::public.conversation_visibility_type,
                 $3::uuid[], $4, $5)
         returning id`,
        [type, visibility, participants, `msgdb ${type} ${ns}`, roomId],
      );
      conversationIds.push(rows[0].id);
      return rows[0].id;
    };

    const directConversationId = await insertConversation('direct', 'direct', null);
    const groupConversationId = await insertConversation('group', 'private', null);
    const roomConversationId = await insertConversation('room', 'public', spaceRows[0].id);

    // Strictly increasing timestamps, oldest first, alternating senders.
    await db.query(
      `insert into public.messages (conversation_id, sender_id, content, type, status, timestamp)
       select $1,
              case when n % 2 = 0 then $2::uuid else $3::uuid end,
              'History ' || lpad(n::text, 3, '0'),
              'text', 'sent',
              now() - make_interval(mins => $4::int - n)
       from generate_series(1, $4::int) as n`,
      [groupConversationId, primary.appUserId, secondary.appUserId, options.historyMessageCount],
    );
    const { rows: historyRows } = await db.query<{ id: string }>(
      `select id from public.messages where conversation_id = $1 order by timestamp, id`,
      [groupConversationId],
    );

    return {
      companyId,
      primary,
      secondary,
      outsider,
      groupThirdMember,
      directConversationId,
      groupConversationId,
      roomConversationId,
      historyMessageIds: historyRows.map((row) => row.id),
      query: async <Row extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        (await db.query<Row>(sql, params)).rows,
      cleanup,
    };
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}
