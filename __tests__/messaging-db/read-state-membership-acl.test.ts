import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { MESSAGING_ANON_KEY, MESSAGING_API_URL, MESSAGING_DB_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

// Phase 5 T1 (FR-029/AC-030, FR-030/AC-031): mark_conversation_read refuses a
// user who is not a member of the conversation for every role that can execute
// it (it used to upsert a membership row and write receipts for anyone), and
// get_unread_counts is no longer executable by the anon key while members keep
// correct counts.
describe('read-state membership guard and unread-count ACL (local Supabase)', () => {
  let world: MessagingDbWorld;
  let serviceRole: SupabaseClient;
  let anon: SupabaseClient;

  beforeAll(async () => {
    world = await createMessagingWorld({ historyMessageCount: 3, withGroupThirdMember: true });
    serviceRole = createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anon = createClient(MESSAGING_API_URL, MESSAGING_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    await world?.cleanup();
  });

  async function insertUnreadMessages(conversationId: string, sender: MessagingDbUser, count: number) {
    // Stamped just after now() so they are newer than the members' last_read_at.
    await world.query(
      `insert into public.messages (conversation_id, sender_id, content, type, status, timestamp)
       select $1, $2, 'P5T1 ' || n, 'text', 'sent', now() + n * interval '1 millisecond'
       from generate_series(1, $3::int) as n`,
      [conversationId, sender.appUserId, count],
    );
  }

  async function readState(user: MessagingDbUser, conversationId: string) {
    const [row] = await world.query<{ members: string; last_read_at: Date | null; receipts: string }>(
      `select (select count(*)::text from public.conversation_members cm
                where cm.user_id = $1 and cm.conversation_id = $2) as members,
              (select cm.last_read_at from public.conversation_members cm
                where cm.user_id = $1 and cm.conversation_id = $2) as last_read_at,
              (select count(*)::text from public.message_read_receipts r
                where r.user_id = $1 and r.conversation_id = $2) as receipts`,
      [user.appUserId, conversationId],
    );
    return {
      members: Number(row.members),
      lastReadAt: row.last_read_at?.getTime() ?? null,
      receipts: Number(row.receipts),
    };
  }

  async function unreadCount(user: MessagingDbUser, conversationId: string): Promise<number> {
    const page = await new SupabaseConversationRepository(user.client).findByUser(user.appUserId, {
      limit: 50,
    });
    const conversation = page.items.find((item) => item.id === conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not visible to ${user.email}`);
    return conversation.unreadCount;
  }

  /** API-reachable roles (and PUBLIC) that may EXECUTE the function. */
  async function executeGrantees(signature: string): Promise<string[]> {
    const rows = await world.query<{ rolname: string }>(
      `select r.rolname
       from pg_catalog.pg_roles r
       where r.rolname in ('anon', 'authenticated', 'authenticator', 'service_role')
         and pg_catalog.has_function_privilege(r.oid, $1::regprocedure, 'execute')
       union all
       select 'PUBLIC'
       from pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
       where p.oid = $1::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
       order by 1`,
      [signature],
    );
    return rows.map((row) => row.rolname);
  }

  interface ExecutingRole {
    readonly rolname: string;
    readonly canLogin: boolean;
    /** The test connection's role, or a role it may SET ROLE to. */
    readonly reachableFromTestConnection: boolean;
  }

  /** Every database role with effective EXECUTE (no allowlist; superusers included). */
  async function everyExecutingRole(signature: string): Promise<ExecutingRole[]> {
    const rows = await world.query<{ rolname: string; rolcanlogin: boolean; reachable: boolean }>(
      `select r.rolname, r.rolcanlogin,
              pg_catalog.pg_has_role(current_user, r.oid, 'MEMBER') as reachable
       from pg_catalog.pg_roles r
       where pg_catalog.has_function_privilege(r.oid, $1::regprocedure, 'execute')
       order by r.rolname`,
      [signature],
    );
    return rows.map((row) => ({
      rolname: row.rolname,
      canLogin: row.rolcanlogin,
      reachableFromTestConnection: row.reachable,
    }));
  }

  /**
   * Calls the function as `role` on its own autocommit connection (no wrapping
   * transaction, so a successful write would persist and be caught by the
   * state assertions). Uses SET ROLE when the test connection may assume the
   * role, otherwise a direct LOCAL login with the local stack's password.
   * Returns the SQLSTATE (null on success), or 'UNREACHABLE' when the role
   * cannot be exercised from here.
   */
  async function callAsRole(role: ExecutingRole, sql: string, params: unknown[]): Promise<string | null> {
    let connectionString = MESSAGING_DB_URL;
    if (!role.reachableFromTestConnection) {
      if (!role.canLogin) return 'UNREACHABLE';
      const url = new URL(MESSAGING_DB_URL);
      url.username = role.rolname;
      connectionString = url.toString();
    }
    const client = new Client({ connectionString });
    try {
      try {
        await client.connect();
      } catch {
        return 'UNREACHABLE';
      }
      const { rows } = await client.query<{ current_user: string }>('select current_user');
      if (rows[0].current_user !== role.rolname) {
        await client.query(`set role ${client.escapeIdentifier(role.rolname)}`);
      }
      const { rows: asRole } = await client.query<{ current_user: string }>('select current_user');
      expect(asRole[0].current_user).toBe(role.rolname);
      try {
        await client.query(sql, params);
        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? 'UNKNOWN';
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  it('AC-030: refuses a non-member through every role that can execute it; members are unaffected', async () => {
    const { primary, secondary, outsider, directConversationId: conversationId } = world;
    await insertUnreadMessages(conversationId, primary, 3);

    // Of the API roles (and PUBLIC), only service_role may execute it.
    expect(await executeGrantees('public.mark_conversation_read(uuid,uuid)')).toEqual(['service_role']);

    const before = await readState(outsider, conversationId);
    expect(before).toEqual({ members: 0, lastReadAt: null, receipts: 0 });

    // service_role (the server route's client), targeting a non-member.
    const asServiceRole = await serviceRole.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: outsider.appUserId,
    });
    expect(asServiceRole.error?.code).toBe('42501');
    expect(await readState(outsider, conversationId)).toEqual(before);

    // Every role with effective EXECUTE, discovered from the catalog with no
    // allowlist (locally: postgres as owner, service_role, supabase_admin as
    // superuser), is refused and writes nothing. A role that cannot be
    // exercised from the test connection fails the test instead of being skipped.
    const executors = await everyExecutingRole('public.mark_conversation_read(uuid,uuid)');
    expect(executors.map((role) => role.rolname)).toEqual(
      expect.arrayContaining(['postgres', 'service_role']),
    );
    const outcomes: Record<string, string | null> = {};
    for (const role of executors) {
      outcomes[role.rolname] = await callAsRole(
        role,
        'select public.mark_conversation_read($1::uuid, $2::uuid)',
        [conversationId, outsider.appUserId],
      );
      expect(await readState(outsider, conversationId)).toEqual(before);
    }
    expect(outcomes).toEqual(Object.fromEntries(executors.map((role) => [role.rolname, '42501'])));

    // Client roles stay denied by the ACL (AC-035 regression).
    const asAnon = await anon.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: outsider.appUserId,
    });
    expect(asAnon.error?.code).toBe('42501');
    const asOutsider = await outsider.client.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: outsider.appUserId,
    });
    expect(asOutsider.error?.code).toBe('42501');
    expect(await readState(outsider, conversationId)).toEqual(before);

    // Null arguments are refused by the guard, never treated as "everyone".
    const nullUser = await serviceRole.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: null,
    });
    expect(nullUser.error?.code).toBe('22004');
    const nullConversation = await serviceRole.rpc('mark_conversation_read', {
      p_conversation_id: null,
      p_user_id: secondary.appUserId,
    });
    expect(nullConversation.error?.code).toBe('22004');

    // A same-company user who is a member of another conversation (the group)
    // is still refused for this one.
    const third = world.groupThirdMember;
    if (!third) throw new Error('fixture must include the group-only third member');
    const thirdBefore = await readState(third, conversationId);
    expect(thirdBefore).toEqual({ members: 0, lastReadAt: null, receipts: 0 });
    const asOtherConversationMember = await serviceRole.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: third.appUserId,
    });
    expect(asOtherConversationMember.error?.code).toBe('42501');
    expect(await readState(third, conversationId)).toEqual(thirdBefore);

    // A member is still marked read through the service-role path.
    expect(await unreadCount(secondary, conversationId)).toBe(3);
    const memberBefore = await readState(secondary, conversationId);
    const asMember = await serviceRole.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: secondary.appUserId,
    });
    expect(asMember.error).toBeNull();
    const memberAfter = await readState(secondary, conversationId);
    expect(memberAfter.members).toBe(1);
    expect(memberAfter.receipts).toBe(memberBefore.receipts + 3);
    expect((memberAfter.lastReadAt ?? 0) > (memberBefore.lastReadAt ?? 0)).toBe(true);
    expect(await unreadCount(secondary, conversationId)).toBe(0);
  });

  it('AC-031: get_unread_counts denies anon; authenticated members keep correct counts', async () => {
    const { primary, secondary, outsider, groupConversationId: conversationId } = world;

    expect(await executeGrantees('public.get_unread_counts(uuid[])')).toEqual([
      'authenticated',
      'service_role',
    ]);

    const asAnon = await anon.rpc('get_unread_counts', { p_conversation_ids: [conversationId] });
    expect(asAnon.error?.code).toBe('42501');
    expect(asAnon.data).toBeNull();

    await world.query(
      `update public.conversation_members set last_read_at = now()
       where conversation_id = $1 and user_id = any($2::uuid[])`,
      [conversationId, [primary.appUserId, secondary.appUserId]],
    );
    await insertUnreadMessages(conversationId, primary, 2);

    const asMember = await secondary.client.rpc('get_unread_counts', { p_conversation_ids: [conversationId] });
    expect(asMember.error).toBeNull();
    expect(asMember.data).toEqual([{ conversation_id: conversationId, unread_count: 2 }]);
    // The sender's own messages never count as unread for them.
    const asSender = await primary.client.rpc('get_unread_counts', { p_conversation_ids: [conversationId] });
    expect(asSender.data).toEqual([{ conversation_id: conversationId, unread_count: 0 }]);
    // A signed-in non-member learns nothing about the conversation.
    const asOutsider = await outsider.client.rpc('get_unread_counts', { p_conversation_ids: [conversationId] });
    expect(asOutsider.error).toBeNull();
    expect(asOutsider.data).toEqual([]);
    // The drawer's repository path (user-scoped client) reports the same count.
    expect(await unreadCount(secondary, conversationId)).toBe(2);
  });
});
