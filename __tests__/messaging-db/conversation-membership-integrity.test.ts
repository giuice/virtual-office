import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH as archiveRoute } from '@/app/api/conversations/archive/route';
import { POST as joinRoute } from '@/app/api/conversations/join/route';
import { GET as membersRoute } from '@/app/api/conversations/members/route';
import { PATCH as preferencesRoute } from '@/app/api/conversations/preferences/route';
import { PATCH as readRoute } from '@/app/api/conversations/read/route';
import { POST as resolveRoute } from '@/app/api/conversations/resolve/route';
import { POST as createRoute } from '@/app/api/messages/create/route';
import { POST as fenceRoute } from '@/app/api/messages/fence/route';

import { ConversationResolverService } from '@/lib/services/ConversationResolverService';
import { SupabaseSpaceRepository, SupabaseUserRepository } from '@/repositories/implementations/supabase';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_ANON_KEY, MESSAGING_API_URL, MESSAGING_DB_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface RouteBody {
  code?: string;
  error?: string;
  conversation?: { id: string; participants: string[]; type: string; roomId?: string };
  members?: { userId: string }[];
  preferences?: { isArchived?: boolean; isStarred?: boolean };
  success?: boolean;
  recorded?: number;
}

interface RouteResult {
  status: number;
  body: RouteBody;
}

type RouteHandler = (request: NextRequest) => Promise<Response>;

interface MembershipState {
  members: { conversation_id: string; user_id: string }[];
  conversations: { id: string; type: string; room_id: string | null; visibility: string; participants: string[] }[];
  revocations: { conversation_id: string; user_id: string }[];
}

interface Holder {
  pid: number;
  run(sql: string, params?: unknown[]): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// Phase 5 T28 (owner decision D9; PLAN v4 T28): a conversation_members row is
// created or restored only by a server path that authorizes that user for that
// conversation, with the authorization still holding when the row is written.
// PostgREST as anon / outsider / member, the real conversation routes (join,
// resolve, preferences, archive, read, members) and the real create/fence
// routes, real sessions, RLS, grants, triggers and row locks on the local
// database. Held-request races use real row locks held by a second connection
// and pg_blocking_pids. Also replaces the deleted unit tests
// __tests__/api/conversations-join-route.test.ts and
// __tests__/conversation-resolver.test.ts (mapping in TRACK T28).
describe('conversation membership integrity (local Supabase)', () => {
  let world: MessagingDbWorld;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let third: MessagingDbUser;
  let otherCompanyId: string;
  const sessions = new Map<string, SessionCookie[]>();
  const extraConversationIds: string[] = [];
  const extraSpaceIds: string[] = [];
  const parityUserIds: string[] = [];

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 0, withGroupThirdMember: true });
    third = world.groupThirdMember as MessagingDbUser;
    admin = createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anon = createClient(MESSAGING_API_URL, MESSAGING_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const user of [world.primary, world.secondary, world.outsider, third]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
    const rows = await world.query<{ company_id: string }>('select company_id::text from public.users where id = $1', [
      world.outsider.appUserId,
    ]);
    otherCompanyId = rows[0].company_id;
  });

  beforeEach(async () => {
    // Creates and fences are rate limited per user; each test starts fresh.
    await world.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [worldUserIds()]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
      // Conversations created by this file (directly or through the routes).
      await world
        .query(
          `delete from public.conversations
            where id = any($1::uuid[]) or room_id = any($2::uuid[])
               or (participants && $3::uuid[] and id <> all($4::uuid[]))`,
          [
            extraConversationIds,
            extraSpaceIds,
            worldUserIds(),
            [world.directConversationId, world.groupConversationId, world.roomConversationId],
          ],
        )
        .catch(() => undefined);
      await world.query('delete from public.spaces where id = any($1::uuid[])', [extraSpaceIds]).catch(() => undefined);
      await world.query('delete from public.users where id = any($1::uuid[])', [parityUserIds]).catch(() => undefined);
      await world.cleanup();
    }
  });

  function worldUserIds(): string[] {
    return [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId, third.appUserId];
  }

  function cookiesOf(user: MessagingDbUser | null): SessionCookie[] {
    return user ? (sessions.get(user.appUserId) ?? []) : [];
  }

  function jsonRequest(path: string, method: 'POST' | 'PATCH', body: unknown): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function call(route: RouteHandler, user: MessagingDbUser | null, request: NextRequest): Promise<RouteResult> {
    return asSession(cookiesOf(user), async () => {
      const response = await route(request);
      return { status: response.status, body: (await response.json()) as RouteBody };
    });
  }

  const join = (user: MessagingDbUser | null, conversationId: unknown) =>
    call(joinRoute, user, jsonRequest('/api/conversations/join', 'POST', { conversationId }));
  const resolveDirect = (user: MessagingDbUser, userId: string) =>
    call(resolveRoute, user, jsonRequest('/api/conversations/resolve', 'POST', { type: 'direct', userId }));
  const resolveRoom = (user: MessagingDbUser, roomId: string) =>
    call(resolveRoute, user, jsonRequest('/api/conversations/resolve', 'POST', { type: 'room', roomId }));
  const patchPreferences = (user: MessagingDbUser, conversationId: string) =>
    call(preferencesRoute, user, jsonRequest('/api/conversations/preferences', 'PATCH', { conversationId, isStarred: true }));
  const patchArchive = (user: MessagingDbUser, conversationId: string) =>
    call(archiveRoute, user, jsonRequest('/api/conversations/archive', 'PATCH', { conversationId, isArchived: true }));
  const patchRead = (user: MessagingDbUser, conversationId: string, messageIds?: string[]) =>
    call(readRoute, user, jsonRequest('/api/conversations/read', 'PATCH', messageIds ? { conversationId, messageIds } : { conversationId }));
  const getRoster = (user: MessagingDbUser, conversationId: string) =>
    call(membersRoute, user, new NextRequest(`http://localhost/api/conversations/members?conversationId=${conversationId}`));

  async function state(): Promise<MembershipState> {
    const ids = worldUserIds();
    const members = await world.query<{ conversation_id: string; user_id: string }>(
      `select conversation_id::text, user_id::text from public.conversation_members
        where user_id = any($1::uuid[]) order by 1, 2`,
      [ids],
    );
    const conversations = await world.query<MembershipState['conversations'][number]>(
      `select id::text, type::text, room_id::text, visibility::text, participants::text[] as participants
         from public.conversations where participants && $1::uuid[] or id = any($2::uuid[]) order by id`,
      [ids, extraConversationIds],
    );
    // (Read only when the table exists, so this file can also be run against
    // the pre-T28 database to show what it catches.)
    const [{ exists }] = await world.query<{ exists: boolean }>(
      `select to_regclass('private.conversation_member_revocations') is not null as exists`,
    );
    const revocations = exists
      ? await world.query<{ conversation_id: string; user_id: string }>(
          `select conversation_id::text, user_id::text from private.conversation_member_revocations
            where user_id = any($1::uuid[]) order by 1, 2`,
          [ids],
        )
      : [];
    return { members, conversations, revocations };
  }

  async function isMember(conversationId: string, user: MessagingDbUser): Promise<boolean> {
    const rows = await world.query('select 1 from public.conversation_members where conversation_id = $1 and user_id = $2', [
      conversationId,
      user.appUserId,
    ]);
    return rows.length === 1;
  }

  async function isRevoked(conversationId: string, user: MessagingDbUser): Promise<boolean> {
    const rows = await world.query(
      'select 1 from private.conversation_member_revocations where conversation_id = $1 and user_id = $2',
      [conversationId, user.appUserId],
    );
    return rows.length === 1;
  }

  /** The removal a server/admin performs (seed route remove-member): service-role DELETE. */
  async function removeMember(conversationId: string, user: MessagingDbUser): Promise<void> {
    const { data, error } = await admin
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', user.appUserId)
      .select('user_id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  }

  /** The explicitly authorized rejoin (server/admin path). */
  async function restoreMember(conversationId: string, user: MessagingDbUser) {
    return admin.rpc('restore_conversation_membership', {
      p_conversation_id: conversationId,
      p_user_id: user.appUserId,
    });
  }

  async function insertSpace(accessControl: unknown, companyId = world.companyId): Promise<string> {
    const rows = await world.query<{ id: string }>(
      `insert into public.spaces (company_id, name, type, status, created_by, access_control)
       values ($1, $2, 'workspace', 'active', $3, $4::jsonb) returning id::text`,
      [companyId, `T28 Room ${randomUUID().slice(0, 8)}`, world.primary.appUserId, accessControl === null ? null : JSON.stringify(accessControl)],
    );
    extraSpaceIds.push(rows[0].id);
    return rows[0].id;
  }

  /** Trusted fixture insert (postgres): a conversation and its members via the sync trigger. */
  async function insertConversation(
    type: 'direct' | 'group' | 'room',
    participants: string[],
    roomId: string | null = null,
  ): Promise<string> {
    const visibility = type === 'direct' ? 'direct' : type === 'group' ? 'private' : 'public';
    const rows = await world.query<{ id: string }>(
      `insert into public.conversations (type, visibility, participants, name, room_id)
       values ($1::public.conversation_type, $2::public.conversation_visibility_type, $3::uuid[], $4, $5)
       returning id::text`,
      [type, visibility, participants, `T28 ${type} ${randomUUID().slice(0, 8)}`, roomId],
    );
    extraConversationIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertRawMessage(conversationId: string, sender: MessagingDbUser): Promise<string> {
    const rows = await world.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, content, type, status)
       values ($1, $2, $3, 'text', 'sent') returning id::text`,
      [conversationId, sender.appUserId, `T28 message ${randomUUID()}`],
    );
    return rows[0].id;
  }

  /** The user's denied access through the real routes and its own RLS. */
  async function expectNoAccess(user: MessagingDbUser, conversationId: string): Promise<void> {
    const create = await call(
      createRoute,
      user,
      jsonRequest('/api/messages/create', 'POST', { conversationId, content: `T28 denied ${randomUUID()}` }),
    );
    expect(create.status, JSON.stringify(create.body)).toBe(403);
    expect(create.body.code).toBe('NOT_PARTICIPANT');
    const fence = await call(
      fenceRoute,
      user,
      jsonRequest('/api/messages/fence', 'POST', {
        conversationId,
        clientMessageId: randomUUID(),
        attemptGeneration: 1,
        expectedSenderId: user.appUserId,
      }),
    );
    expect(fence.status, JSON.stringify(fence.body)).toBe(403);
    expect(fence.body.code).toBe('NOT_PARTICIPANT');
    const roster = await getRoster(user, conversationId);
    expect(roster.status, JSON.stringify(roster.body)).toBe(403);
    const messages = await user.client.from('messages').select('id').eq('conversation_id', conversationId);
    expect(messages.error).toBeNull();
    expect(messages.data).toEqual([]);
    const messageIds = await world.query<{ id: string }>('select id::text from public.messages where conversation_id = $1', [
      conversationId,
    ]);
    if (messageIds.length > 0) {
      const mentions = await user.client.rpc('list_message_mentions', { p_message_ids: messageIds.map((row) => row.id) });
      expect(mentions.error).toBeNull();
      expect(Object.keys((mentions.data as Record<string, unknown>) ?? {})).toEqual([]);
    }
  }

  async function expectAccess(user: MessagingDbUser, conversationId: string): Promise<void> {
    const roster = await getRoster(user, conversationId);
    expect(roster.status, JSON.stringify(roster.body)).toBe(200);
    expect(roster.body.members?.map((member) => member.userId)).toContain(user.appUserId);
  }

  async function openHolder(): Promise<Holder> {
    const client = new Client({ connectionString: MESSAGING_DB_URL });
    await client.connect();
    await client.query('begin');
    const pid = (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
    let done = false;
    const finish = async (sql: string) => {
      if (done) return;
      done = true;
      await client.query(sql).catch(() => undefined);
      await client.end();
    };
    return {
      pid,
      run: async (sql, params = []) => {
        await client.query(sql, params);
      },
      commit: () => finish('commit'),
      rollback: () => finish('rollback'),
    };
  }

  /** Sends a (lazy) supabase-js request now and returns its settled result. */
  function dispatch<T>(request: PromiseLike<T>): Promise<T> {
    return (async () => await request)();
  }

  /** Waits until exactly one backend is blocked by the holder (pg_blocking_pids). */
  async function waitForBlockedBy(holderPid: number): Promise<void> {
    await expect
      .poll(
        async () => {
          const rows = await world.query<{ pid: number }>(
            `select pid from pg_catalog.pg_stat_activity where $1::int = any (pg_catalog.pg_blocking_pids(pid))`,
            [holderPid],
          );
          return rows.length;
        },
        { timeout: 10_000, interval: 50 },
      )
      .toBe(1);
  }

  const RESTRICT_TO_PRIMARY = () => ({ isPublic: false, allowedUsers: [world.primary.appUserId], allowedRoles: [] });

  describe('Data API client writes (D9)', () => {
    it('anon, an outsider and a member cannot create a membership row by INSERT or UPSERT', async () => {
      const { primary, outsider, roomConversationId, directConversationId } = world;
      const secondaryOnly = await insertConversation('group', [world.secondary.appUserId]);
      const before = await state();

      const attempts: Array<[SupabaseClient, Record<string, unknown>]> = [
        [anon, { conversation_id: roomConversationId, user_id: outsider.appUserId }],
        [outsider.client, { conversation_id: roomConversationId, user_id: outsider.appUserId }],
        [outsider.client, { conversation_id: directConversationId, user_id: outsider.appUserId }],
        [primary.client, { conversation_id: directConversationId, user_id: outsider.appUserId }],
        [primary.client, { conversation_id: secondaryOnly, user_id: primary.appUserId }],
      ];
      for (const [client, row] of attempts) {
        const inserted = await client.from('conversation_members').insert(row);
        expect(inserted.error, JSON.stringify(row)).not.toBeNull();
        const upserted = await client
          .from('conversation_members')
          .upsert({ ...row, is_archived: true }, { onConflict: 'conversation_id,user_id' });
        expect(upserted.error, JSON.stringify(row)).not.toBeNull();
        const ignored = await client
          .from('conversation_members')
          .upsert(row, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
        expect(ignored.error, JSON.stringify(row)).not.toBeNull();
      }

      expect(await state()).toEqual(before);
      await expectNoAccess(outsider, roomConversationId);
      await expectNoAccess(outsider, directConversationId);
      await expectNoAccess(primary, secondaryOnly);
    });

    it('a member cannot move its membership to another conversation or user', async () => {
      const { primary, outsider, directConversationId } = world;
      const secondaryOnly = await insertConversation('group', [world.secondary.appUserId]);
      const [own] = await world.query<{ id: string }>(
        'select id::text from public.conversation_members where conversation_id = $1 and user_id = $2',
        [directConversationId, primary.appUserId],
      );
      const before = await state();

      const moves: Record<string, unknown>[] = [
        { conversation_id: secondaryOnly },
        { user_id: outsider.appUserId },
        { id: randomUUID() },
      ];
      for (const change of moves) {
        const updated = await primary.client
          .from('conversation_members')
          .update(change)
          .eq('id', own.id)
          .select('id');
        expect(updated.error, JSON.stringify(change)).not.toBeNull();
      }
      // An upsert addressed by the row id that would rewrite its conversation.
      const byId = await primary.client
        .from('conversation_members')
        .upsert({ id: own.id, conversation_id: secondaryOnly, user_id: primary.appUserId }, { onConflict: 'id' });
      expect(byId.error).not.toBeNull();
      // Service role cannot move a membership either (identity is immutable).
      const serviceMove = await admin.from('conversation_members').update({ conversation_id: secondaryOnly }).eq('id', own.id);
      expect(serviceMove.error?.message).toBe('MEMBERSHIP_IDENTITY_IMMUTABLE');

      expect(await state()).toEqual(before);
      await expectNoAccess(primary, secondaryOnly);
      await expectNoAccess(outsider, directConversationId);
    });

    it('a member cannot add anyone through conversations.participants, room_id, type or visibility; anon cannot write', async () => {
      const { primary, outsider, groupConversationId, roomConversationId, directConversationId } = world;
      const restrictedSpace = await insertSpace(RESTRICT_TO_PRIMARY());
      const before = await state();

      const changes: Array<[string, Record<string, unknown>]> = [
        [groupConversationId, { participants: [primary.appUserId, world.secondary.appUserId, third.appUserId, outsider.appUserId] }],
        [roomConversationId, { participants: [primary.appUserId, world.secondary.appUserId, third.appUserId] }],
        [roomConversationId, { room_id: restrictedSpace }],
        [groupConversationId, { type: 'room', room_id: restrictedSpace }],
        [directConversationId, { type: 'group' }],
        [groupConversationId, { visibility: 'public' }],
        [directConversationId, { participants_fingerprint: 'x' }],
      ];
      for (const [conversationId, change] of changes) {
        const updated = await primary.client.from('conversations').update(change).eq('id', conversationId).select('id');
        expect(updated.error, JSON.stringify(change)).not.toBeNull();
        const anonymous = await anon.from('conversations').update(change).eq('id', conversationId).select('id');
        expect(anonymous.error, JSON.stringify(change)).not.toBeNull();
      }
      // Retargeting followed by the resolver/join: nothing changed, so nothing is granted.
      expect((await join(outsider, roomConversationId)).body.code).toBe('ROOM_ACCESS_DENIED');
      expect((await join(outsider, groupConversationId)).body.code).toBe('JOIN_FORBIDDEN');
      expect((await join(third, groupConversationId)).status).toBe(200); // already a member: no write
      expect((await resolveRoom(outsider, restrictedSpace)).status).toBe(403);
      expect((await resolveRoom(third, restrictedSpace)).status).toBe(403);
      expect(await state()).toEqual(before);
      await expectNoAccess(third, roomConversationId);
      await expectNoAccess(outsider, groupConversationId);
      await expectNoAccess(outsider, roomConversationId);

      // The columns clients may still change are unaffected.
      const touch = await primary.client
        .from('conversations')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', groupConversationId)
        .select('id');
      expect(touch.error).toBeNull();
      expect(touch.data).toHaveLength(1);
    });

    it('a conversation INSERT names only authorized participants, rooms and visibility', async () => {
      const { primary, secondary, outsider } = world;
      const publicSpace = await insertSpace(null);
      const restrictedSpace = await insertSpace({ isPublic: false, allowedUsers: [secondary.appUserId], allowedRoles: [] });
      const foreignSpace = await insertSpace(null, otherCompanyId);
      const before = await state();
      const attemptedIds: string[] = [];

      const hostile: Array<[SupabaseClient, Record<string, unknown>]> = [
        [primary.client, { type: 'direct', visibility: 'direct', participants: [primary.appUserId, outsider.appUserId] }],
        [primary.client, { type: 'direct', visibility: 'direct', participants: [secondary.appUserId, third.appUserId] }],
        [primary.client, { type: 'direct', visibility: 'direct', participants: [primary.appUserId, secondary.appUserId, third.appUserId] }],
        [primary.client, { type: 'direct', visibility: 'direct', participants: [primary.appUserId, primary.appUserId] }],
        [primary.client, { type: 'direct', visibility: 'direct', participants: [primary.appUserId, randomUUID()] }],
        [primary.client, { type: 'direct', visibility: 'public', participants: [primary.appUserId, third.appUserId] }],
        [primary.client, { type: 'direct', visibility: 'direct', participants: [primary.appUserId, third.appUserId], room_id: publicSpace }],
        [primary.client, { type: 'group', visibility: 'private', participants: [primary.appUserId, outsider.appUserId] }],
        [primary.client, { type: 'group', visibility: 'private', participants: [primary.appUserId, secondary.appUserId] }],
        [primary.client, { type: 'room', visibility: 'public', participants: [primary.appUserId, outsider.appUserId], room_id: publicSpace }],
        [primary.client, { type: 'room', visibility: 'public', participants: [primary.appUserId, secondary.appUserId], room_id: publicSpace }],
        [primary.client, { type: 'room', visibility: 'private', participants: [primary.appUserId], room_id: publicSpace }],
        [primary.client, { type: 'room', visibility: 'private', participants: [primary.appUserId], room_id: restrictedSpace }],
        [primary.client, { type: 'room', visibility: 'public', participants: [primary.appUserId], room_id: foreignSpace }],
        [primary.client, { type: 'room', visibility: 'public', participants: [primary.appUserId], room_id: null }],
        [outsider.client, { type: 'room', visibility: 'public', participants: [outsider.appUserId], room_id: publicSpace }],
        [anon, { type: 'room', visibility: 'public', participants: [primary.appUserId], room_id: publicSpace }],
      ];
      for (const [client, row] of hostile) {
        const id = randomUUID();
        attemptedIds.push(id);
        const inserted = await client.from('conversations').insert({ id, name: 'T28 hostile', ...row });
        expect(inserted.error, JSON.stringify(row)).not.toBeNull();
      }

      const created = await world.query('select id from public.conversations where id = any($1::uuid[])', [attemptedIds]);
      expect(created).toEqual([]);
      expect(await state()).toEqual(before);
    });

    it('a client DELETE of a membership is refused — its own, another user’s, and anon', async () => {
      const { primary, secondary, directConversationId, groupConversationId } = world;
      const before = await state();

      const own = await primary.client
        .from('conversation_members')
        .delete()
        .eq('conversation_id', directConversationId)
        .eq('user_id', primary.appUserId)
        .select('id');
      expect(own.error?.code).toBe('42501');
      const other = await primary.client
        .from('conversation_members')
        .delete()
        .eq('conversation_id', groupConversationId)
        .eq('user_id', secondary.appUserId)
        .select('id');
      expect(other.error?.code).toBe('42501');
      const anonymous = await anon.from('conversation_members').delete().eq('conversation_id', directConversationId).select('id');
      expect(anonymous.error?.code).toBe('42501');

      expect(await state()).toEqual(before);
      await expectAccess(primary, directConversationId);
      await expectAccess(secondary, groupConversationId);
    });
  });

  async function roomSpaceOf(conversationId: string): Promise<string> {
    const rows = await world.query<{ room_id: string }>('select room_id::text from public.conversations where id = $1', [
      conversationId,
    ]);
    return rows[0].room_id;
  }

  describe('removal and authorized rejoin', () => {
    it('a removed member stays removed under unrelated writes and its own join; only the authorized rejoin restores it', async () => {
      const { primary, secondary, roomConversationId: roomId } = world;
      const message = await insertRawMessage(roomId, primary);
      await removeMember(roomId, secondary);
      expect(await isRevoked(roomId, secondary)).toBe(true);
      await expectNoAccess(secondary, roomId);

      // Unrelated writes: another user's legitimate join (current route and
      // the old builds' service-role participants update), the members'
      // preference/archive/read writes.
      const newcomerSpace = await insertSpace(null);
      const legacyRoom = await insertConversation('room', [primary.appUserId, secondary.appUserId], newcomerSpace);
      await removeMember(legacyRoom, secondary);
      const legacyJoin = await admin
        .from('conversations')
        .update({ participants: [primary.appUserId, secondary.appUserId, third.appUserId] })
        .eq('id', legacyRoom)
        .select('id');
      expect(legacyJoin.error).toBeNull();
      expect(await isMember(legacyRoom, third)).toBe(true);
      expect(await isMember(legacyRoom, secondary)).toBe(false);

      const joined = await join(third, roomId);
      expect(joined.status, JSON.stringify(joined.body)).toBe(200);
      expect(await isMember(roomId, third)).toBe(true);
      expect((await patchPreferences(primary, roomId)).status).toBe(200);
      expect((await patchArchive(primary, roomId)).status).toBe(200);
      expect((await patchRead(third, roomId)).status).toBe(200);
      expect((await patchRead(third, roomId, [message])).status).toBe(200);
      expect(await isMember(roomId, secondary)).toBe(false);
      await expectNoAccess(secondary, roomId);

      // The removed member's own join and room resolution are refused.
      const ownJoin = await join(secondary, roomId);
      expect(ownJoin.status).toBe(403);
      expect(ownJoin.body.code).toBe('MEMBERSHIP_REVOKED');
      const ownResolve = await resolveRoom(secondary, await roomSpaceOf(roomId));
      expect(ownResolve.status).toBe(403);
      // A legacy service-role participants rewrite cannot restore it either.
      const rewrite = await admin
        .from('conversations')
        .update({ participants: [primary.appUserId, third.appUserId] })
        .eq('id', roomId)
        .select('id');
      expect(rewrite.error).toBeNull();
      const reAdd = await admin
        .from('conversations')
        .update({ participants: [primary.appUserId, third.appUserId, secondary.appUserId] })
        .eq('id', roomId)
        .select('id');
      expect(reAdd.error?.message).toBe('MEMBERSHIP_REVOKED');
      expect(await isMember(roomId, secondary)).toBe(false);
      await expectNoAccess(secondary, roomId);

      // The explicitly authorized rejoin restores the membership and access.
      const restored = await restoreMember(roomId, secondary);
      expect(restored.error).toBeNull();
      expect(restored.data).toBe(true);
      expect(await isRevoked(roomId, secondary)).toBe(false);
      await expectAccess(secondary, roomId);
      const created = await call(
        createRoute,
        secondary,
        jsonRequest('/api/messages/create', 'POST', { conversationId: roomId, content: `T28 back ${randomUUID()}` }),
      );
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect((await restoreMember(roomId, secondary)).data).toBe(false);

      // A direct/group conversation restores only an original participant.
      const outsiderRestore = await restoreMember(world.directConversationId, world.outsider);
      expect(outsiderRestore.error?.message).toBe('MEMBERSHIP_GRANT_FORBIDDEN');
    });

    it('a conversation deletion (cascade) records no revocation', async () => {
      const room = await insertConversation('room', [world.primary.appUserId], await insertSpace(null));
      await world.query('delete from public.conversations where id = $1', [room]);
      const rows = await world.query('select 1 from private.conversation_member_revocations where conversation_id = $1', [room]);
      expect(rows).toEqual([]);
    });
  });

  describe('writes held after authorization (membership removed and committed meanwhile)', () => {
    const cases: Array<[string, (user: MessagingDbUser, conversationId: string, messageId: string) => Promise<RouteResult>]> = [
      ['preferences', (user, conversationId) => patchPreferences(user, conversationId)],
      ['archive', (user, conversationId) => patchArchive(user, conversationId)],
      ['read (mark all)', (user, conversationId) => patchRead(user, conversationId)],
      ['read (per message)', (user, conversationId, messageId) => patchRead(user, conversationId, [messageId])],
    ];

    for (const [label, send] of cases) {
      it(`${label}: answered NOT_PARTICIPANT, no replacement row, access still denied`, async () => {
        const { primary, secondary, directConversationId: conversationId } = world;
        const messageId = await insertRawMessage(conversationId, secondary);
        const holder = await openHolder();
        try {
          await holder.run(
            `select 1 from public.conversation_members where conversation_id = $1 and user_id = $2 for update`,
            [conversationId, primary.appUserId],
          );
          const pending = send(primary, conversationId, messageId);
          await waitForBlockedBy(holder.pid);
          await holder.run('delete from public.conversation_members where conversation_id = $1 and user_id = $2', [
            conversationId,
            primary.appUserId,
          ]);
          await holder.commit();
          const result = await pending;
          expect(result.status, JSON.stringify(result.body)).toBe(403);
          expect(result.body.code).toBe('NOT_PARTICIPANT');
        } finally {
          await holder.rollback();
        }
        expect(await isMember(conversationId, primary)).toBe(false);
        const receipts = await world.query('select 1 from public.message_read_receipts where message_id = $1 and user_id = $2', [
          messageId,
          primary.appUserId,
        ]);
        expect(receipts).toEqual([]);
        await expectNoAccess(primary, conversationId);
        expect((await restoreMember(conversationId, primary)).data).toBe(true);
      });
    }

    const legacyUpserts: Array<[string, () => SupabaseClient]> = [
      ['Phase 4 build service-role preference UPSERT', () => admin],
      ['hosted build user-scoped preference UPSERT', () => world.primary.client],
    ];
    for (const [label, client] of legacyUpserts) {
      it(`${label}: no replacement row when the membership is removed meanwhile`, async () => {
        const { primary, directConversationId: conversationId } = world;
        const holder = await openHolder();
        let upsertError: { message?: string } | null = null;
        try {
          await holder.run('delete from public.conversation_members where conversation_id = $1 and user_id = $2', [
            conversationId,
            primary.appUserId,
          ]);
          // supabase-js builders are lazy: dispatch now.
          const pending = dispatch(
            client()
              .from('conversation_members')
              .upsert(
                { conversation_id: conversationId, user_id: primary.appUserId, is_archived: true, updated_at: new Date().toISOString() },
                { onConflict: 'conversation_id,user_id' },
              )
              .select('*')
              .single(),
          );
          await waitForBlockedBy(holder.pid);
          await holder.commit();
          upsertError = (await pending).error;
        } finally {
          await holder.rollback();
        }
        expect(upsertError).not.toBeNull();
        expect(await isMember(conversationId, primary)).toBe(false);
        await expectNoAccess(primary, conversationId);
        expect((await restoreMember(conversationId, primary)).data).toBe(true);
      });
    }
  });

  describe('grants held after their access check lose to a revocation that commits first', () => {
    async function revokeRoomAccessHeld(spaceId: string): Promise<Holder> {
      const holder = await openHolder();
      await holder.run('update public.spaces set access_control = $1::jsonb where id = $2', [
        JSON.stringify(RESTRICT_TO_PRIMARY()),
        spaceId,
      ]);
      return holder;
    }

    it('join route (current build): room permission revoked while the join waits', async () => {
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [world.primary.appUserId], spaceId);
      const before = await state();
      const holder = await revokeRoomAccessHeld(spaceId);
      try {
        const pending = join(third, roomId);
        await waitForBlockedBy(holder.pid);
        await holder.commit();
        const result = await pending;
        expect(result.status, JSON.stringify(result.body)).toBe(403);
        expect(result.body.code).toBe('ROOM_ACCESS_DENIED');
      } finally {
        await holder.rollback();
      }
      expect(await state()).toEqual(before);
      await expectNoAccess(third, roomId);
    });

    it('room resolver (current build): its room check passed, then the permission is revoked before the membership write', async () => {
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [world.primary.appUserId], spaceId);
      const holder = await revokeRoomAccessHeld(spaceId);
      try {
        const pending = resolveRoom(third, spaceId);
        await waitForBlockedBy(holder.pid);
        await holder.commit();
        const result = await pending;
        expect(result.status, JSON.stringify(result.body)).toBe(403);
      } finally {
        await holder.rollback();
      }
      expect(await isMember(roomId, third)).toBe(false);
      await expectNoAccess(third, roomId);
    });

    it('join route: a member whose removal is in flight is answered as a member; the removal stands (no grant)', async () => {
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [world.primary.appUserId, world.secondary.appUserId], spaceId);
      const holder = await openHolder();
      try {
        await holder.run('delete from public.conversation_members where conversation_id = $1 and user_id = $2', [
          roomId,
          world.secondary.appUserId,
        ]);
        const result = await join(world.secondary, roomId);
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        await holder.commit();
      } finally {
        await holder.rollback();
      }
      expect(await isMember(roomId, world.secondary)).toBe(false);
      expect(await isRevoked(roomId, world.secondary)).toBe(true);
      expect((await join(world.secondary, roomId)).body.code).toBe('MEMBERSHIP_REVOKED');
      await expectNoAccess(world.secondary, roomId);
    });

    it('legacy participants rewrite waiting on the room lock cannot undo a removal committed meanwhile (review r1 #1)', async () => {
      const { primary, secondary } = world;
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [primary.appUserId, secondary.appUserId], spaceId);
      // Concurrent legacy read-modify-write joins can leave a member that is
      // missing from participants.
      await world.query('update public.conversations set participants = $1::uuid[] where id = $2', [[primary.appUserId], roomId]);
      expect(await isMember(roomId, secondary)).toBe(true);

      const holder = await openHolder();
      let rewriteError: { message?: string } | null = null;
      try {
        // Any transaction holding the room row (here a rename) delays the grant.
        await holder.run('update public.spaces set name = name where id = $1', [spaceId]);
        const pending = dispatch(
          admin
            .from('conversations')
            .update({ participants: [primary.appUserId, secondary.appUserId] })
            .eq('id', roomId)
            .select('id'),
        );
        await waitForBlockedBy(holder.pid);
        // The administrative removal commits while the grant waits.
        await removeMember(roomId, secondary);
        expect(await isRevoked(roomId, secondary)).toBe(true);
        await holder.commit();
        rewriteError = (await pending).error;
      } finally {
        await holder.rollback();
      }
      expect(rewriteError?.message).toBe('MEMBERSHIP_REVOKED');
      expect(await isMember(roomId, secondary)).toBe(false);
      expect(await isRevoked(roomId, secondary)).toBe(true);
      await expectNoAccess(secondary, roomId);
    });

    it('a database-administrator INSERT cannot override a revocation; only the authorized rejoin lifts it', async () => {
      const room = await insertConversation('room', [world.primary.appUserId, third.appUserId], await insertSpace(null));
      await removeMember(room, third);
      await expect(
        world.query('insert into public.conversation_members (conversation_id, user_id) values ($1, $2)', [room, third.appUserId]),
      ).rejects.toThrow('MEMBERSHIP_REVOKED');
      expect(await isRevoked(room, third)).toBe(true);
      expect((await restoreMember(room, third)).data).toBe(true);
      expect(await isMember(room, third)).toBe(true);
    });

    it('join route and a space DELETE do not deadlock: the join waits and answers 404 (review r1 #5)', async () => {
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [world.primary.appUserId], spaceId);
      const deleter = await openHolder();
      let deleteError: unknown = null;
      try {
        // The deleting transaction holds the space first, as a DELETE does …
        await deleter.run('select 1 from public.spaces where id = $1 for update', [spaceId]);
        const pending = join(third, roomId);
        await waitForBlockedBy(deleter.pid);
        // … then deletes it (ON DELETE SET NULL locks the room conversation).
        await deleter.run('delete from public.spaces where id = $1', [spaceId]).catch((error: unknown) => {
          deleteError = error;
        });
        await deleter.commit();
        const result = await pending;
        expect(result.status, JSON.stringify(result.body)).toBe(404);
        expect(result.body.code).toBe('ROOM_NOT_FOUND');
      } finally {
        await deleter.rollback();
      }
      expect(deleteError).toBeNull();
      const [row] = await world.query<{ room_id: string | null }>('select room_id::text from public.conversations where id = $1', [roomId]);
      expect(row.room_id).toBeNull();
      expect(await isMember(roomId, third)).toBe(false);
    });

    it('restore of a room conversation whose space was deleted keeps the revocation (review r1 #4)', async () => {
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [world.primary.appUserId, third.appUserId], spaceId);
      await removeMember(roomId, third);
      await world.query('delete from public.spaces where id = $1', [spaceId]);
      const restored = await restoreMember(roomId, third);
      expect(restored.error?.message).toBe('ROOM_NOT_FOUND');
      expect(await isMember(roomId, third)).toBe(false);
      expect(await isRevoked(roomId, third)).toBe(true);
    });

    it('room creation (user-scoped write of every build): permission revoked while the INSERT waits', async () => {
      const spaceId = await insertSpace(null);
      const holder = await openHolder();
      try {
        await holder.run('update public.spaces set access_control = $1::jsonb where id = $2', [
          JSON.stringify({ isPublic: false, allowedUsers: [world.secondary.appUserId], allowedRoles: [] }),
          spaceId,
        ]);
        const pending = resolveRoom(world.primary, spaceId);
        await waitForBlockedBy(holder.pid);
        await holder.commit();
        const result = await pending;
        expect(result.status, JSON.stringify(result.body)).toBe(403);
      } finally {
        await holder.rollback();
      }
      const conversations = await world.query('select 1 from public.conversations where room_id = $1', [spaceId]);
      expect(conversations).toEqual([]);
    });

    it('direct creation (user-scoped write): the target leaves the company while the INSERT waits', async () => {
      const { secondary } = world;
      const before = await state();
      const holder = await openHolder();
      try {
        // Trusted fixture classification for the presence audit triggers on users.
        await holder.run(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        await holder.run('update public.users set company_id = $1 where id = $2', [otherCompanyId, third.appUserId]);
        const pending = resolveDirect(secondary, third.appUserId);
        await waitForBlockedBy(holder.pid);
        await holder.commit();
        const result = await pending;
        expect(result.status, JSON.stringify(result.body)).toBe(403);
      } finally {
        await holder.rollback();
        await world.query('update public.users set company_id = $1 where id = $2', [world.companyId, third.appUserId]);
      }
      expect(await state()).toEqual(before);
    });

    it('old builds’ service-role participants update: permission revoked while the sync waits', async () => {
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [world.primary.appUserId], spaceId);
      const holder = await revokeRoomAccessHeld(spaceId);
      let updateError: { message?: string } | null = null;
      try {
        const pending = dispatch(
          admin
            .from('conversations')
            .update({ participants: [world.primary.appUserId, third.appUserId] })
            .eq('id', roomId)
            .select('id'),
        );
        await waitForBlockedBy(holder.pid);
        await holder.commit();
        updateError = (await pending).error;
      } finally {
        await holder.rollback();
      }
      expect(updateError?.message).toBe('ROOM_ACCESS_DENIED');
      expect(await isMember(roomId, third)).toBe(false);
      const [row] = await world.query<{ participants: string[] }>('select participants::text[] from public.conversations where id = $1', [roomId]);
      expect(row.participants).toEqual([world.primary.appUserId]);
    });

    it('authorized rejoin: permission revoked while the restore waits', async () => {
      const spaceId = await insertSpace(null);
      const roomId = await insertConversation('room', [world.primary.appUserId, third.appUserId], spaceId);
      await removeMember(roomId, third);
      const holder = await revokeRoomAccessHeld(spaceId);
      let restoreError: { message?: string } | null = null;
      try {
        const pending = dispatch(restoreMember(roomId, third));
        await waitForBlockedBy(holder.pid);
        await holder.commit();
        restoreError = (await pending).error;
      } finally {
        await holder.rollback();
      }
      expect(restoreError?.message).toBe('ROOM_ACCESS_DENIED');
      expect(await isMember(roomId, third)).toBe(false);
      expect(await isRevoked(roomId, third)).toBe(true);
      await expectNoAccess(third, roomId);
    });
  });

  describe('legitimate flows and old-build contracts', () => {
    it('direct and room creation, joining, preferences, archive and read keep working', async () => {
      const { primary, secondary } = world;

      // Direct: created once for concurrent resolves (unique-conflict retry), then
      // found from either side. (The in-process cookie jar is global, so the
      // concurrent pair runs as one user.)
      const [first, second] = await Promise.all([resolveDirect(primary, third.appUserId), resolveDirect(primary, third.appUserId)]);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      const directId = first.body.conversation?.id as string;
      expect(second.body.conversation?.id).toBe(directId);
      extraConversationIds.push(directId);
      expect(await isMember(directId, primary)).toBe(true);
      expect(await isMember(directId, third)).toBe(true);
      expect((await resolveDirect(third, primary.appUserId)).body.conversation?.id).toBe(directId);
      const existing = await resolveDirect(primary, secondary.appUserId);
      expect(existing.body.conversation?.id).toBe(world.directConversationId);
      const directs = await world.query(
        `select 1 from public.conversations where type = 'direct' and participants @> $1::uuid[]`,
        [[primary.appUserId, third.appUserId]],
      );
      expect(directs).toHaveLength(1);

      // Room: created by the first resolver, joined by the next, joined via the route.
      const spaceId = await insertSpace({ isPublic: false, allowedUsers: [], allowedRoles: [] });
      const created = await resolveRoom(primary, spaceId);
      expect(created.status, JSON.stringify(created.body)).toBe(200);
      const roomId = created.body.conversation?.id as string;
      extraConversationIds.push(roomId);
      const [row] = await world.query<{ visibility: string }>('select visibility::text from public.conversations where id = $1', [roomId]);
      expect(row.visibility).toBe('private');
      const added = await resolveRoom(third, spaceId);
      expect(added.status).toBe(200);
      expect(added.body.conversation?.id).toBe(roomId);
      expect(added.body.conversation?.participants).toContain(third.appUserId);
      const joined = await join(secondary, roomId);
      expect(joined.status).toBe(200);
      expect(joined.body.conversation?.participants).toContain(secondary.appUserId);
      expect((await join(secondary, roomId)).status).toBe(200);
      for (const user of [primary, secondary, third]) {
        await expectAccess(user, roomId);
      }

      // Preferences, archive and read of a member.
      const message = await insertRawMessage(roomId, primary);
      const preferences = await patchPreferences(secondary, roomId);
      expect(preferences.status).toBe(200);
      expect(preferences.body.preferences?.isStarred).toBe(true);
      const archived = await patchArchive(secondary, roomId);
      expect(archived.status).toBe(200);
      expect(archived.body.preferences?.isArchived).toBe(true);
      expect((await patchRead(secondary, roomId, [message])).body.recorded).toBe(1);
      expect((await patchRead(secondary, roomId)).status).toBe(200);

      // Old builds: user-scoped (hosted) and service-role (Phase 4) UPSERT of an existing membership.
      const hosted = await secondary.client
        .from('conversation_members')
        .upsert(
          { conversation_id: roomId, user_id: secondary.appUserId, is_pinned: true, pinned_order: 3, updated_at: new Date().toISOString() },
          { onConflict: 'conversation_id,user_id' },
        )
        .select('*')
        .single();
      expect(hosted.error).toBeNull();
      expect(hosted.data?.is_pinned).toBe(true);
      const phase4 = await admin
        .from('conversation_members')
        .upsert(
          { conversation_id: roomId, user_id: secondary.appUserId, is_archived: false, updated_at: new Date().toISOString() },
          { onConflict: 'conversation_id,user_id' },
        )
        .select('*')
        .single();
      expect(phase4.error).toBeNull();
      expect(phase4.data?.is_archived).toBe(false);
      expect(phase4.data?.is_pinned).toBe(true);
      // ... but never for a user without a membership.
      const forged = await admin
        .from('conversation_members')
        .upsert({ conversation_id: roomId, user_id: world.outsider.appUserId, is_archived: true }, { onConflict: 'conversation_id,user_id' });
      expect(forged.error?.message).toBe('NOT_PARTICIPANT');
      expect(await isMember(roomId, world.outsider)).toBe(false);

      // Old builds' join: service-role participants update for an authorized user.
      const legacySpace = await insertSpace(null);
      const legacyRoom = await insertConversation('room', [primary.appUserId], legacySpace);
      const legacyJoin = await admin
        .from('conversations')
        .update({ participants: [primary.appUserId, secondary.appUserId] })
        .eq('id', legacyRoom)
        .select('id');
      expect(legacyJoin.error).toBeNull();
      expect(await isMember(legacyRoom, secondary)).toBe(true);
      // ... never for a direct or group conversation.
      const legacyDirect = await admin
        .from('conversations')
        .update({ participants: [primary.appUserId, secondary.appUserId, third.appUserId] })
        .eq('id', world.directConversationId)
        .select('id');
      expect(legacyDirect.error?.message).toBe('MEMBERSHIP_GRANT_FORBIDDEN');
    });
  });

  describe('migration opening locks never wait on application transactions (review r2 #1)', () => {
    // The LOCK statements exactly as the T28 migration file states them.
    const OPENING_LOCKS = readFileSync('supabase/migrations/20261007184118_conversation_membership_integrity.sql', 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^lock table .* nowait;$/.test(line));

    /** Runs the opening locks as the migration does; returns the SQLSTATE of a refusal, or null. */
    async function applyOpeningLocks(): Promise<string | null> {
      // The statements executed are exactly the migration's two NOWAIT locks.
      expect(OPENING_LOCKS).toEqual([
        'lock table public.users in exclusive mode nowait;',
        'lock table public.conversations, public.conversation_members in access exclusive mode nowait;',
      ]);
      const client = new Client({ connectionString: MESSAGING_DB_URL });
      await client.connect();
      try {
        await client.query('begin');
        await client.query(`set local lock_timeout = '5s'`);
        for (const statement of OPENING_LOCKS) await client.query(statement);
        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? 'unknown';
      } finally {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }
    }

    /**
     * The documented operator procedure after 55P03: re-run the migration until
     * its locks are taken. Bounded (at most 10 attempts, 200 ms apart): besides
     * application transactions, an autovacuum worker (VACUUM ANALYZE holds
     * ShareUpdateExclusiveLock on these tables) also makes a NOWAIT attempt
     * fail. Every refusal must be 55P03.
     */
    async function expectOpeningLocksOnRerun(): Promise<void> {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const code = await applyOpeningLocks();
        if (code === null) return;
        expect(code).toBe('55P03');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error('the opening locks were still refused after 10 attempts');
    }

    it('a held mark_conversation_read transaction: the migration fails fast (55P03), the read commits, a re-run locks', async () => {
      const { primary, secondary, directConversationId: conversationId } = world;
      await insertRawMessage(conversationId, secondary);
      const reader = await openHolder();
      try {
        // The read path's first step holds conversation_members only; its
        // receipt inserts lock conversations (FK) afterwards — the order that
        // deadlocked with a waiting migration.
        await reader.run('update public.conversation_members set last_read_at = now() where conversation_id = $1 and user_id = $2', [
          conversationId,
          primary.appUserId,
        ]);
        const started = Date.now();
        expect(await applyOpeningLocks()).toBe('55P03');
        expect(Date.now() - started).toBeLessThan(1000); // never waited behind the reader
        // The application transaction is not a deadlock victim: it continues and commits.
        await reader.run('select public.mark_conversation_read($1, $2)', [conversationId, primary.appUserId]);
        await reader.commit();
      } finally {
        await reader.rollback();
      }
      await expectOpeningLocksOnRerun();
    });

    it('a users row lock (company-member removal takes FOR UPDATE before its UPDATE): the migration fails fast, the holder commits', async () => {
      const { roomConversationId: roomId, secondary } = world;
      // A participant without a membership row: the backfill would reference this user.
      await removeMember(roomId, secondary);
      const remover = await openHolder();
      try {
        await remover.run(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        await remover.run('select id from public.users where id = $1 for update', [secondary.appUserId]);
        expect(await applyOpeningLocks()).toBe('55P03');
        // The application transaction goes on to write the row and commits.
        await remover.run('update public.users set last_active = now() where id = $1', [secondary.appUserId]);
        await remover.commit();
      } finally {
        await remover.rollback();
      }
      await expectOpeningLocksOnRerun();
      expect((await restoreMember(roomId, secondary)).data).toBe(true);
    });

    it('Presence holding a user while a join waits for it: the migration fails fast, the join and Presence both commit, a re-run locks', async () => {
      const roomId = await insertConversation('room', [world.primary.appUserId], await insertSpace(null));
      const presence = await openHolder();
      const joiner = await openHolder();
      let joined: unknown = null;
      try {
        await presence.run(`select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        await presence.run('update public.users set last_active = now() where id = $1', [third.appUserId]);
        const pendingJoin = joiner.run('select public.join_room_conversation($1, $2)', [roomId, third.appUserId]);
        await waitForBlockedBy(presence.pid);
        expect(await applyOpeningLocks()).toBe('55P03');
        await presence.commit();
        await pendingJoin;
        await joiner.commit();
        joined = true;
      } finally {
        await presence.rollback();
        await joiner.rollback();
      }
      expect(joined).toBe(true);
      expect(await isMember(roomId, third)).toBe(true);
      await expectOpeningLocksOnRerun();
    });
  });

  describe('hosted build (e27dd10) conversation creation request shape', () => {
    // e27dd10 creates with .insert(row).select('*').single() (INSERT … RETURNING,
    // Prefer: return=representation). RETURNING is checked against the SELECT
    // policies before the AFTER trigger creates the membership, so the request
    // is refused with 42501 on the pre-T28 database already (inherited; run this
    // file against the rolled-back database to compare). T28 must not change it.
    it('is refused as before T28 and creates nothing (inherited limitation)', async () => {
      const spaceId = await insertSpace(null);
      const before = await state();
      const rows = [
        { type: 'direct', visibility: 'direct', participants: [world.secondary.appUserId, third.appUserId], room_id: null },
        { type: 'room', visibility: 'public', participants: [world.secondary.appUserId], room_id: spaceId },
      ];
      for (const row of rows) {
        const result = await world.secondary.client
          .from('conversations')
          .insert({ ...row, name: 'T28 e27dd10', is_archived: false, last_activity: new Date().toISOString(), participants_fingerprint: null })
          .select('*')
          .single();
        expect(result.status, row.type).toBe(403);
        expect(result.error?.code, row.type).toBe('42501');
        expect(result.error?.message, row.type).toBe('new row violates row-level security policy for table "conversations"');
      }
      expect(await state()).toEqual(before);
    });
  });

  // Replaces __tests__/api/conversations-join-route.test.ts (deleted, Phase 5 T28).
  describe('POST /api/conversations/join contract', () => {
    it('401 anonymous, 400 without conversationId, 404 unknown conversation', async () => {
      expect((await join(null, world.roomConversationId)).status).toBe(401);
      const missing = await join(world.primary, undefined);
      expect(missing.status).toBe(400);
      const unknown = await join(world.primary, randomUUID());
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('403 JOIN_FORBIDDEN for direct and group conversations; 403 ROOM_ACCESS_DENIED outside the room’s rules', async () => {
      const before = await state();
      expect((await join(world.outsider, world.directConversationId)).body.code).toBe('JOIN_FORBIDDEN');
      expect((await join(world.outsider, world.groupConversationId)).body.code).toBe('JOIN_FORBIDDEN');
      const otherCompanyRoom = await join(world.outsider, world.roomConversationId);
      expect(otherCompanyRoom.status).toBe(403);
      expect(otherCompanyRoom.body.code).toBe('ROOM_ACCESS_DENIED');
      const restricted = await insertConversation('room', [world.primary.appUserId], await insertSpace(RESTRICT_TO_PRIMARY()));
      const restrictedJoin = await join(third, restricted);
      expect(restrictedJoin.status).toBe(403);
      expect(restrictedJoin.body.code).toBe('ROOM_ACCESS_DENIED');
      const roleRestricted = await insertConversation(
        'room',
        [world.primary.appUserId],
        await insertSpace({ isPublic: true, allowedUsers: [], allowedRoles: ['admin'] }),
      );
      expect((await join(third, roleRestricted)).body.code).toBe('ROOM_ACCESS_DENIED');
      const after = await state();
      expect(after.members).toEqual(
        [...before.members, { conversation_id: restricted, user_id: world.primary.appUserId }, { conversation_id: roleRestricted, user_id: world.primary.appUserId }].sort(
          (a, b) => `${a.conversation_id}${a.user_id}`.localeCompare(`${b.conversation_id}${b.user_id}`),
        ),
      );
    });

    it('200 without any write for a current member (also of a direct conversation)', async () => {
      const before = await state();
      const result = await join(world.primary, world.directConversationId);
      expect(result.status).toBe(200);
      expect(result.body.conversation?.id).toBe(world.directConversationId);
      expect(await state()).toEqual(before);
    });
  });

  // Replaces __tests__/conversation-resolver.test.ts (deleted, Phase 5 T28).
  describe('POST /api/conversations/resolve contract', () => {
    it('400 for a DM with yourself, 404 for an unknown target or room, 403 outside the room’s allowed users', async () => {
      const before = await state();
      expect((await resolveDirect(world.primary, world.primary.appUserId)).status).toBe(400);
      expect((await resolveDirect(world.primary, randomUUID())).status).toBe(404);
      expect((await resolveRoom(world.primary, randomUUID())).status).toBe(404);
      expect((await resolveDirect(world.primary, world.outsider.appUserId)).status).toBe(403);
      const restrictedSpace = await insertSpace({ isPublic: false, allowedUsers: [world.secondary.appUserId], allowedRoles: [] });
      expect((await resolveRoom(world.primary, restrictedSpace)).status).toBe(403);
      expect(await state()).toEqual(before);
    });

    it('a removed direct-conversation member reopening the DM gets 403 and no membership', async () => {
      const dm = await insertConversation('direct', [world.secondary.appUserId, third.appUserId]);
      await removeMember(dm, third);
      const before = await state();
      const result = await resolveDirect(third, world.secondary.appUserId);
      expect(result.status, JSON.stringify(result.body)).toBe(403);
      expect(await state()).toEqual(before);
      await expectNoAccess(third, dm);
    });
  });

  describe('room access rule parity with ConversationResolverService.assertRoomAccess', () => {
    it('private.room_access_denial agrees with assertRoomAccess on database round-tripped rows; stricter only for malformed ACLs', async () => {
      // A company-less member, besides the fixture users (admin and members of
      // two companies).
      const [{ id: noCompanyId }] = await world.query<{ id: string }>(
        `insert into public.users (supabase_uid, email, display_name, company_id, role)
         values ($1, $2, 'T28 no company', null, 'member') returning id::text`,
        [randomUUID(), `t28-no-company-${randomUUID().slice(0, 8)}@local.test`],
      );
      parityUserIds.push(noCompanyId);
      const userIds = [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId, noCompanyId];
      const acls: string[] = [
        'null', 'false', '0', '""', '0.0', '-0', '1e-400', '1e400', '{}', '"x"', '1', 'true', '[]',
        '{"isPublic":true}', '{"isPublic":false}', '{"isPublic":"yes"}', '{"isPublic":""}', '{"isPublic":0}',
        '{"isPublic":1}', '{"isPublic":1e-400}', '{"isPublic":1e400}', '{"isPublic":-0.0}', '{"isPublic":null}', '{"isPublic":{}}',
        `{"allowedUsers":["${world.secondary.appUserId}"]}`, `{"isPublic":false,"allowedUsers":["${noCompanyId}"]}`,
        '{"allowedRoles":["admin"]}', '{"allowedRoles":["member"],"isPublic":false}',
        '{"isPublic":true,"allowedUsers":null,"allowedRoles":null}', '{"allowedUsers":[]}',
        `{"allowedUsers":"${world.primary.appUserId}"}`, '{"allowedRoles":"admin"}',
        '5e-324', '1e-323', '1.7976931348623157e308', '2.4703282292062327e-324', '1.7976931348623159e308',
        '{"isPublic":5e-324}', '{"isPublic":2.4703282292062327e-324}', '{"isPublic":1.7976931348623159e308}',
      ];
      const malformed = new Set([
        '1e-400', '1e400', '{"isPublic":1e-400}', '{"isPublic":1e400}',
        `{"allowedUsers":"${world.primary.appUserId}"}`, '{"allowedRoles":"admin"}',
        // Double-range boundaries: SQL may refuse what JSON.parse rounds.
        '2.4703282292062327e-324', '1.7976931348623159e308',
        '{"isPublic":2.4703282292062327e-324}', '{"isPublic":1.7976931348623159e308}',
      ]);
      const users = new SupabaseUserRepository(admin);
      const spaces = new SupabaseSpaceRepository(admin);
      let compared = 0;
      for (const acl of acls) {
        // spaces.company_id is NOT NULL.
        for (const companyId of [world.companyId, otherCompanyId]) {
          const [{ id: spaceId }] = await world.query<{ id: string }>(
            `insert into public.spaces (company_id, name, type, status, created_by, access_control)
             values ($1, 'T28 parity', 'workspace', 'active', $2, ${acl === 'null' ? 'null' : '$3::jsonb'}) returning id::text`,
            acl === 'null' ? [companyId, world.primary.appUserId] : [companyId, world.primary.appUserId, acl],
          );
          extraSpaceIds.push(spaceId);
          const space = await spaces.findById(spaceId);
          for (const userId of userIds) {
            const user = await users.findById(userId);
            if (!space || !user) throw new Error('fixture rows not readable');
            let tsAllowed = true;
            try {
              ConversationResolverService.assertRoomAccess(user, space);
            } catch {
              tsAllowed = false;
            }
            const [{ denial }] = await world.query<{ denial: string | null }>(
              `select private.room_access_denial(
                 (select u from public.users u where u.id = $1),
                 (select s from public.spaces s where s.id = $2)) as denial`,
              [userId, spaceId],
            );
            const label = `acl=${acl} space company=${companyId === world.companyId ? 'A' : 'B'} user=${userId === noCompanyId ? 'no company' : userId}`;
            if (malformed.has(acl) && denial === 'ROOM_ACL_INVALID') {
              // Documented stricter case: refused regardless of the TypeScript outcome.
            } else {
              expect(denial === null, `${label}: sql=${denial} ts=${tsAllowed}`).toBe(tsAllowed);
            }
            compared += 1;
          }
        }
      }
      expect(compared).toBe(acls.length * 2 * userIds.length);
    });

    it('no client can delete a conversation', async () => {
      const deleted = await world.primary.client.from('conversations').delete().eq('id', world.directConversationId).select('id');
      expect(deleted.error?.code).toBe('42501');
      const rows = await world.query('select 1 from public.conversations where id = $1', [world.directConversationId]);
      expect(rows).toHaveLength(1);
    });
  });
});
