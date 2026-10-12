import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as createRoute } from '@/app/api/messages/create/route';
import { GET as feedRoute } from '@/app/api/messages/get/route';
import { POST as uploadRoute } from '@/app/api/messages/upload/route';
import { ATTACHMENTS_BUCKET } from '@/lib/messaging/attachment-policy';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_ANON_KEY, MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface RouteMessage {
  id: string;
  senderId: string;
  content: string;
  clientMessageId?: string;
  attachments?: { id: string }[];
  mentionedUserIds?: string[];
}

interface RouteBody {
  message?: RouteMessage | null;
  messages?: RouteMessage[];
  members?: { userId: string; displayName: string | null; avatarUrl: string | null }[];
  attachment?: { id: string };
  clientMessageId?: string;
  code?: string;
  error?: string;
}

interface RouteResult {
  status: number;
  body: RouteBody;
}

type RouteHandler = (request: NextRequest) => Promise<Response>;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WEBM_HEADER = [
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3,
  0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02,
];

function webmBytes(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4096);
  bytes.set(WEBM_HEADER);
  for (let index = WEBM_HEADER.length; index < bytes.length; index += 1) bytes[index] = index % 251;
  return bytes;
}

const sorted = (ids: readonly string[]) => [...ids].sort();

// Phase 5 T4 (FR-023, FR-024, BR-010; AC-024 server clauses, AC-046 replay
// clause): @mentions stored atomically with the first creation of a message on
// the text and attachment/voice create paths, compared on replay as part of the
// original composition, readable by conversation members only and writable by
// no client; and the current-member roster. Real POST /api/messages/create,
// GET /api/messages/get and GET /api/conversations/members handlers, real
// local sessions, RLS, grants and transactions on the local database.
describe('message mentions and conversation roster (local Supabase)', () => {
  let world: MessagingDbWorld;
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let third: MessagingDbUser;
  const sessions = new Map<string, SessionCookie[]>();

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
  });

  beforeEach(async () => {
    // Creates and uploads are rate limited per user; each test starts a fresh window.
    await world.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [
      [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId, third.appUserId],
    ]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
      await world.query('drop trigger if exists t4_test_fail_mention_insert on public.message_mentions').catch(() => undefined);
      await world.query('drop function if exists public.t4_test_fail_mention_insert()').catch(() => undefined);
      const conversations = [world.directConversationId, world.groupConversationId, world.roomConversationId];
      const objects = await world.query<{ name: string }>(
        `select name from storage.objects
         where bucket_id = $1 and split_part(name, '/', 2) = any($2::text[])`,
        [ATTACHMENTS_BUCKET, conversations],
      );
      if (objects.length > 0) {
        await admin.storage.from(ATTACHMENTS_BUCKET).remove(objects.map((object) => object.name));
      }
      await world.cleanup();
    }
  });

  function cookiesOf(user: MessagingDbUser | null): SessionCookie[] {
    return user ? (sessions.get(user.appUserId) ?? []) : [];
  }

  async function call(route: RouteHandler, user: MessagingDbUser | null, request: NextRequest): Promise<RouteResult> {
    return asSession(cookiesOf(user), async () => {
      const response = await route(request);
      return { status: response.status, body: (await response.json()) as RouteBody };
    });
  }

  function postCreate(user: MessagingDbUser | null, body: Record<string, unknown>) {
    return call(
      createRoute,
      user,
      new NextRequest('http://localhost/api/messages/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  function getFeed(user: MessagingDbUser | null, conversationId: string) {
    return call(feedRoute, user, new NextRequest(`http://localhost/api/messages/get?conversationId=${conversationId}&limit=100`));
  }

  async function getRoster(user: MessagingDbUser | null, conversationId: string) {
    // Imported lazily: the route is new in T4 (the other tests still run when it is absent).
    const { GET } = await import('@/app/api/conversations/members/route');
    return call(GET, user, new NextRequest(`http://localhost/api/conversations/members?conversationId=${conversationId}`));
  }

  async function upload(user: MessagingDbUser, conversationId: string, voice = false): Promise<string> {
    const form = new FormData();
    if (voice) {
      form.append('file', new File([webmBytes()], 'voice-note.webm', { type: 'audio/webm;codecs=opus' }));
      form.append('kind', 'voice');
      form.append('duration', '3');
      form.append('waveform', JSON.stringify([0.1, 0.5, 0.9]));
    } else {
      form.append('file', new File([PNG_BYTES], 'photo.png', { type: 'image/png' }));
    }
    form.append('conversationId', conversationId);
    const result = await call(uploadRoute, user, new NextRequest('http://localhost/api/messages/upload', { method: 'POST', body: form }));
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body.attachment?.id as string;
  }

  function attempt(user: MessagingDbUser, clientMessageId: string, attemptGeneration: number) {
    return { clientMessageId, attemptGeneration, expectedSenderId: user.appUserId };
  }

  async function storedMentions(messageId: string): Promise<string[]> {
    const rows = await world.query<{ mentioned_user_id: string }>(
      'select mentioned_user_id from public.message_mentions where message_id = $1 order by mentioned_user_id',
      [messageId],
    );
    return rows.map((row) => row.mentioned_user_id);
  }

  async function keyRows(sender: MessagingDbUser, conversationId: string, key: string) {
    return world.query<{ id: string }>(
      'select id from public.messages where sender_id = $1 and conversation_id = $2 and client_message_id = $3',
      [sender.appUserId, conversationId, key],
    );
  }

  async function storedComposition(conversationId: string, key: string) {
    const rows = await world.query<{ composition: Record<string, unknown> | null; committed_at: Date | null; fence_generation: string | null }>(
      `select composition, committed_at, fence_generation::text as fence_generation
       from private.message_send_attempts where conversation_id = $1 and client_message_id = $2`,
      [conversationId, key],
    );
    return rows[0];
  }

  async function removeMember(conversationId: string, user: MessagingDbUser) {
    await world.query('delete from public.conversation_members where conversation_id = $1 and user_id = $2', [
      conversationId,
      user.appUserId,
    ]);
  }

  async function restoreMember(conversationId: string, user: MessagingDbUser) {
    // Phase 5 T28: a removal is a revocation; only the authorized rejoin lifts it.
    await world.query('select public.restore_conversation_membership($1, $2)', [conversationId, user.appUserId]);
  }

  describe('AC-024 mentions stored with the first creation', () => {
    it('stores only current members other than the sender; non-member, outsider, unknown and self ids store nothing', async () => {
      const { primary, secondary, outsider, groupConversationId, directConversationId } = world;
      const key = randomUUID();
      const unknown = randomUUID();
      const requested = [secondary.appUserId, third.appUserId, outsider.appUserId, primary.appUserId, unknown];

      const created = await postCreate(primary, {
        conversationId: groupConversationId,
        content: `T4 mention ${key}`,
        mentionIds: requested,
        ...attempt(primary, key, 1),
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const expected = sorted([secondary.appUserId, third.appUserId]);
      expect(created.body.message?.mentionedUserIds).toEqual(expected);
      expect(await storedMentions(created.body.message?.id as string)).toEqual(expected);
      // The original request is what replays are compared against.
      expect((await storedComposition(groupConversationId, key)).composition).toMatchObject({
        mentionIds: sorted(requested.map((id) => id.toLowerCase())),
      });

      // Only non-member and self ids: nothing stored (direct: primary + secondary; third is not a member).
      const onlyInvalidKey = randomUUID();
      const invalid = await postCreate(primary, {
        conversationId: directConversationId,
        content: `T4 no valid mention ${onlyInvalidKey}`,
        mentionIds: [outsider.appUserId, primary.appUserId, third.appUserId],
        ...attempt(primary, onlyInvalidKey, 1),
      });
      expect(invalid.status, JSON.stringify(invalid.body)).toBe(201);
      expect(invalid.body.message?.mentionedUserIds).toEqual([]);
      expect(await storedMentions(invalid.body.message?.id as string)).toEqual([]);
    });

    it('stores no mention for "@name" text typed without a selection', async () => {
      const { primary, groupConversationId } = world;
      const key = randomUUID();
      const created = await postCreate(primary, {
        conversationId: groupConversationId,
        content: '@Msg DB secondary e @Msg DB third, vejam isto',
        ...attempt(primary, key, 1),
      });
      expect(created.status).toBe(201);
      expect(created.body.message?.mentionedUserIds).toEqual([]);
      expect(await storedMentions(created.body.message?.id as string)).toEqual([]);
    });

    it('stores the mentions of attachment and voice-note messages in the same create', async () => {
      const { primary, secondary, groupConversationId } = world;
      for (const voice of [false, true]) {
        const uploadId = await upload(primary, groupConversationId, voice);
        const key = randomUUID();
        const created = await postCreate(primary, {
          conversationId: groupConversationId,
          content: '',
          attachmentIds: [uploadId],
          mentionIds: [secondary.appUserId],
          ...attempt(primary, key, 1),
        });
        expect(created.status, JSON.stringify(created.body)).toBe(201);
        expect(created.body.message?.attachments?.map((item) => item.id)).toEqual([uploadId]);
        expect(created.body.message?.mentionedUserIds).toEqual([secondary.appUserId]);
        expect(await storedMentions(created.body.message?.id as string)).toEqual([secondary.appUserId]);
      }
    });

    it('answers 409 CLIENT_MESSAGE_ID_REUSED to a replay that changes only the requested mentions, changing nothing', async () => {
      const { primary, secondary, groupConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T4 replay ${key}`;
      const created = await postCreate(primary, { conversationId, content, mentionIds: [secondary.appUserId], ...attempt(primary, key, 1) });
      expect(created.status).toBe(201);
      const messageId = created.body.message?.id as string;
      const compositionBefore = (await storedComposition(conversationId, key)).composition;

      for (const mentionIds of [[secondary.appUserId, third.appUserId], [third.appUserId], [], undefined]) {
        const changed = await postCreate(primary, { conversationId, content, mentionIds, ...attempt(primary, key, 2) });
        expect(changed.status, JSON.stringify(mentionIds)).toBe(409);
        expect(changed.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');
      }
      // Generation-less (Phase 4 shape) replays are compared the same way.
      expect((await postCreate(primary, { conversationId, content, clientMessageId: key })).status).toBe(409);

      // Same set, different order and repeats: unchanged composition → 200.
      const same = await postCreate(primary, {
        conversationId,
        content,
        mentionIds: [secondary.appUserId.toUpperCase(), secondary.appUserId],
        ...attempt(primary, key, 3),
      });
      expect(same.status, JSON.stringify(same.body)).toBe(200);
      expect(same.body.message?.id).toBe(messageId);
      expect(same.body.message?.mentionedUserIds).toEqual([secondary.appUserId]);

      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
      expect(await storedMentions(messageId)).toEqual([secondary.appUserId]);
      expect((await storedComposition(conversationId, key)).composition).toEqual(compositionBefore);

      // Attachment path: a replay adding a mention is a different composition.
      const uploadId = await upload(primary, conversationId);
      const attachmentKey = randomUUID();
      const attachmentCreate = await postCreate(primary, { conversationId, content: '', attachmentIds: [uploadId], ...attempt(primary, attachmentKey, 1) });
      expect(attachmentCreate.status).toBe(201);
      const attachmentReplay = await postCreate(primary, {
        conversationId,
        content: '',
        attachmentIds: [uploadId],
        mentionIds: [secondary.appUserId],
        ...attempt(primary, attachmentKey, 2),
      });
      expect(attachmentReplay.status).toBe(409);
      expect(attachmentReplay.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');
      expect(await storedMentions(attachmentCreate.body.message?.id as string)).toEqual([]);
    });

    it('stores neither the message, its attachment links nor any mention when mention storage fails (text and attachment paths)', async () => {
      const { primary, secondary, groupConversationId: conversationId } = world;
      // A real database fault, scoped to mentions of `secondary` in this file's world.
      await world.query(`
        create or replace function public.t4_test_fail_mention_insert() returns trigger
        language plpgsql set search_path = '' as $$
        begin
          raise exception 'T4_TEST_FORCED_MENTION_FAILURE';
        end
        $$`);
      await world.query(
        `create trigger t4_test_fail_mention_insert before insert on public.message_mentions
         for each row when (new.mentioned_user_id = '${secondary.appUserId}'::uuid)
         execute function public.t4_test_fail_mention_insert()`,
      );
      const textKey = randomUUID();
      const attachmentKey = randomUUID();
      let uploadId = '';
      try {
        const text = await postCreate(primary, {
          conversationId,
          content: `T4 forced failure ${textKey}`,
          mentionIds: [secondary.appUserId, third.appUserId],
          ...attempt(primary, textKey, 1),
        });
        expect(text.status).toBe(500);
        expect(await keyRows(primary, conversationId, textKey)).toHaveLength(0);
        expect((await storedComposition(conversationId, textKey))?.committed_at ?? null).toBeNull();

        uploadId = await upload(primary, conversationId);
        const withFile = await postCreate(primary, {
          conversationId,
          content: '',
          attachmentIds: [uploadId],
          mentionIds: [secondary.appUserId],
          ...attempt(primary, attachmentKey, 1),
        });
        expect(withFile.status).toBe(500);
        expect(await keyRows(primary, conversationId, attachmentKey)).toHaveLength(0);
        expect(await world.query('select 1 from public.message_attachments where id = $1', [uploadId])).toHaveLength(0);
        expect(await world.query('select 1 from public.message_attachment_uploads where id = $1', [uploadId])).toHaveLength(1);

        // No mention row of any message in this conversation, and no insertion charged.
        expect(
          await world.query(
            `select 1 from public.message_mentions mm join public.messages m on m.id = mm.message_id
             where m.client_message_id = any($1::uuid[])`,
            [[textKey, attachmentKey]],
          ),
        ).toHaveLength(0);
        expect(
          await world.query(`select 1 from private.rate_limit_counters where user_id = $1 and action = 'message:create'`, [
            primary.appUserId,
          ]),
        ).toHaveLength(0);
      } finally {
        await world.query('drop trigger if exists t4_test_fail_mention_insert on public.message_mentions');
        await world.query('drop function if exists public.t4_test_fail_mention_insert()');
      }

      // Once storage works, the same attempts create everything exactly once.
      const textRetry = await postCreate(primary, {
        conversationId,
        content: `T4 forced failure ${textKey}`,
        mentionIds: [secondary.appUserId, third.appUserId],
        ...attempt(primary, textKey, 1),
      });
      expect(textRetry.status, JSON.stringify(textRetry.body)).toBe(201);
      expect(await storedMentions(textRetry.body.message?.id as string)).toEqual(sorted([secondary.appUserId, third.appUserId]));
      const fileRetry = await postCreate(primary, {
        conversationId,
        content: '',
        attachmentIds: [uploadId],
        mentionIds: [secondary.appUserId],
        ...attempt(primary, attachmentKey, 1),
      });
      expect(fileRetry.status, JSON.stringify(fileRetry.body)).toBe(201);
      expect(fileRetry.body.message?.attachments?.map((item) => item.id)).toEqual([uploadId]);
      expect(await storedMentions(fileRetry.body.message?.id as string)).toEqual([secondary.appUserId]);
    });
  });

  describe('AC-024 mention records are readable by members only and writable by no client', () => {
    async function mentionedMessage(): Promise<string> {
      const key = randomUUID();
      const created = await postCreate(world.primary, {
        conversationId: world.groupConversationId,
        content: `T4 read ${key}`,
        mentionIds: [world.secondary.appUserId],
        ...attempt(world.primary, key, 1),
      });
      expect(created.status).toBe(201);
      return created.body.message?.id as string;
    }

    it('lets members read mention records and denies anon and non-members', async () => {
      const messageId = await mentionedMessage();
      for (const member of [world.primary, world.secondary, third]) {
        const { data, error } = await member.client.from('message_mentions').select('mentioned_user_id').eq('message_id', messageId);
        expect(error).toBeNull();
        expect(data).toEqual([{ mentioned_user_id: world.secondary.appUserId }]);
      }
      const outsider = await world.outsider.client.from('message_mentions').select('mentioned_user_id').eq('message_id', messageId);
      expect(outsider.error).toBeNull();
      expect(outsider.data).toEqual([]);
      const anonymous = await anon.from('message_mentions').select('mentioned_user_id').eq('message_id', messageId);
      expect(anonymous.error?.code).toBe('42501');
      expect(anonymous.data).toBeNull();
    });

    it('denies direct inserts, updates and deletes by every client role', async () => {
      const messageId = await mentionedMessage();
      const { primary, secondary } = world;
      const insert = await primary.client.from('message_mentions').insert({ message_id: messageId, mentioned_user_id: third.appUserId });
      expect(insert.error?.code).toBe('42501');
      const update = await primary.client
        .from('message_mentions')
        .update({ mentioned_user_id: third.appUserId })
        .eq('message_id', messageId);
      expect(update.error?.code).toBe('42501');
      const remove = await secondary.client.from('message_mentions').delete().eq('message_id', messageId);
      expect(remove.error?.code).toBe('42501');
      const anonInsert = await anon.from('message_mentions').insert({ message_id: messageId, mentioned_user_id: third.appUserId });
      expect(anonInsert.error?.code).toBe('42501');
      expect(await storedMentions(messageId)).toEqual([secondary.appUserId]);

      const privileges = await world.query<{ role: string; privilege: string; allowed: boolean }>(
        `select r.role, p.privilege, has_table_privilege(r.role, 'public.message_mentions', p.privilege) as allowed
         from unnest(array['anon', 'authenticated']) as r(role)
         cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(privilege)`,
      );
      expect(privileges.filter((row) => row.allowed)).toEqual([]);
      expect(
        (await world.query<{ allowed: boolean }>(`select has_table_privilege('anon', 'public.message_mentions', 'SELECT') as allowed`))[0].allowed,
      ).toBe(false);
    });

    it("removes a message's mentions when its sender deletes it", async () => {
      const messageId = await mentionedMessage();
      const removed = await world.primary.client.from('messages').delete().eq('id', messageId);
      expect(removed.error).toBeNull();
      expect(await storedMentions(messageId)).toEqual([]);
    });

    it('returns the mention ids with the messages a member fetches', async () => {
      const messageId = await mentionedMessage();
      for (const viewer of [world.secondary, third]) {
        const feed = await getFeed(viewer, world.groupConversationId);
        expect(feed.status).toBe(200);
        const fetched = feed.body.messages?.find((message) => message.id === messageId);
        expect(fetched?.mentionedUserIds).toEqual([world.secondary.appUserId]);
        expect(feed.body.messages?.every((message) => Array.isArray(message.mentionedUserIds))).toBe(true);
      }
      expect((await getFeed(world.outsider, world.groupConversationId)).status).toBe(403);
    });
  });

  describe('AC-046 unchanged replay after a mentioned recipient left', () => {
    it('returns the stored message without re-validating or changing mentions', async () => {
      const { primary, secondary, groupConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T4 left ${key}`;
      const mentionIds = [secondary.appUserId, third.appUserId];
      const created = await postCreate(primary, { conversationId, content, mentionIds, ...attempt(primary, key, 1) });
      expect(created.status).toBe(201);
      const messageId = created.body.message?.id as string;

      await removeMember(conversationId, third);
      try {
        const replay = await postCreate(primary, { conversationId, content, mentionIds, ...attempt(primary, key, 2) });
        expect(replay.status, JSON.stringify(replay.body)).toBe(200);
        expect(replay.body.message?.id).toBe(messageId);
        const phase4Replay = await postCreate(primary, { conversationId, content, mentionIds, clientMessageId: key });
        expect(phase4Replay.status).toBe(200);
        expect(phase4Replay.body.message?.id).toBe(messageId);
        // Dropping the removed recipient is a different composition.
        const changed = await postCreate(primary, { conversationId, content, mentionIds: [secondary.appUserId], ...attempt(primary, key, 3) });
        expect(changed.status).toBe(409);

        expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
        expect(await storedMentions(messageId)).toEqual(sorted(mentionIds));
        // The removed member can no longer read the conversation's mention records.
        const removedRead = await third.client.from('message_mentions').select('mentioned_user_id').eq('message_id', messageId);
        expect(removedRead.data).toEqual([]);
      } finally {
        await restoreMember(conversationId, third);
      }
    });
  });

  describe('current-member roster (FR-023)', () => {
    it('returns current members to members only and excludes a removed member', async () => {
      const { primary, secondary, outsider, groupConversationId: conversationId } = world;
      const roster = await getRoster(primary, conversationId);
      expect(roster.status, JSON.stringify(roster.body)).toBe(200);
      expect(sorted(roster.body.members?.map((member) => member.userId) ?? [])).toEqual(
        sorted([primary.appUserId, secondary.appUserId, third.appUserId]),
      );
      expect(roster.body.members?.find((member) => member.userId === secondary.appUserId)?.displayName).toBe('Msg DB secondary');

      await removeMember(conversationId, third);
      try {
        const after = await getRoster(secondary, conversationId);
        expect(after.status).toBe(200);
        expect(sorted(after.body.members?.map((member) => member.userId) ?? [])).toEqual(sorted([primary.appUserId, secondary.appUserId]));

        for (const nonMember of [third, outsider]) {
          const denied = await getRoster(nonMember, conversationId);
          expect(denied.status).toBe(403);
          expect(denied.body.code).toBe('NOT_PARTICIPANT');
          expect(denied.body.members).toBeUndefined();
        }
        expect((await getRoster(null, conversationId)).status).toBe(401);
        expect((await getRoster(primary, randomUUID())).status).toBe(403);
        expect((await getRoster(primary, 'not-a-uuid')).status).toBe(400);

        // The database enforces the same rule for direct calls.
        const direct = await primary.client.rpc('list_conversation_members', { p_conversation_id: conversationId });
        expect(direct.error).toBeNull();
        expect(sorted((direct.data as { user_id: string }[]).map((row) => row.user_id))).toEqual(
          sorted([primary.appUserId, secondary.appUserId]),
        );
        for (const client of [third.client, outsider.client]) {
          const refused = await client.rpc('list_conversation_members', { p_conversation_id: conversationId });
          expect(refused.error?.code).toBe('42501');
          expect(refused.error?.message).toBe('NOT_PARTICIPANT');
        }
        const anonymous = await anon.rpc('list_conversation_members', { p_conversation_id: conversationId });
        expect(anonymous.error?.code).toBe('42501');
        expect(anonymous.data).toBeNull();
      } finally {
        await restoreMember(conversationId, third);
      }

      const executable = await world.query<{ role: string; allowed: boolean }>(
        `select r.role, has_function_privilege(r.role, 'public.list_conversation_members(uuid)', 'execute') as allowed
         from unnest(array['anon', 'authenticated']) as r(role) order by r.role`,
      );
      expect(executable).toEqual([
        { role: 'anon', allowed: false },
        { role: 'authenticated', allowed: true },
      ]);
    });
  });

  describe('reads above the PostgREST max-rows limit (review T4 r1)', () => {
    // supabase/config.toml max_rows = 1000: a row-returning Data API read stops
    // there silently. Bulk fixtures are seeded with trusted SQL (the create
    // path is covered above; its rate limits forbid 100 route creates here).
    const MAX_ROWS = 1000;
    const seededConversations: string[] = [];
    const seededUsers: string[] = [];

    afterAll(async () => {
      if (!world) return;
      await world.query('delete from public.conversations where id = any($1::uuid[])', [seededConversations]);
      await world.query('delete from public.users where id = any($1::uuid[])', [seededUsers]);
    });

    async function seedUsers(label: string, count: number): Promise<string[]> {
      const rows = await world.query<{ id: string }>(
        `insert into public.users (supabase_uid, email, display_name, company_id, role)
         select gen_random_uuid()::text, 't4-' || $1 || '-' || n || '-' || gen_random_uuid() || '@local.test',
                'T4 ' || $1 || ' ' || lpad(n::text, 4, '0'), $2, 'member'::public.user_role
         from generate_series(1, $3::int) as n
         returning id`,
        [label, world.companyId, count],
      );
      const ids = rows.map((row) => row.id);
      seededUsers.push(...ids);
      return ids;
    }

    async function seedGroup(participants: string[]): Promise<string> {
      const rows = await world.query<{ id: string }>(
        `insert into public.conversations (type, visibility, participants, name)
         values ('group', 'private', $1::uuid[], $2) returning id`,
        [participants, `T4 bulk ${randomUUID()}`],
      );
      seededConversations.push(rows[0].id);
      return rows[0].id;
    }

    it('returns every mention of a 100-message feed page holding more than 1000 mention rows', async () => {
      const { primary, secondary } = world;
      const mentioned = sorted(await seedUsers('mentioned', 11));
      const conversationId = await seedGroup([primary.appUserId, secondary.appUserId, ...mentioned]);
      const messages = await world.query<{ id: string }>(
        `insert into public.messages (conversation_id, sender_id, content, type, status, timestamp)
         select $1, $2, 'T4 bulk ' || n, 'text', 'sent', now() - make_interval(secs => 200 - n)
         from generate_series(1, 100) as n returning id`,
        [conversationId, primary.appUserId],
      );
      await world.query(
        `insert into public.message_mentions (message_id, mentioned_user_id)
         select m, u from unnest($1::uuid[]) as m cross join unnest($2::uuid[]) as u`,
        [messages.map((row) => row.id), mentioned],
      );
      expect(messages.length * mentioned.length).toBeGreaterThan(MAX_ROWS);

      // The hazard: one row-returning read of these mentions is cut at max-rows.
      const capped = await secondary.client
        .from('message_mentions')
        .select('message_id')
        .in('message_id', messages.map((row) => row.id));
      expect(capped.error).toBeNull();
      expect(capped.data).toHaveLength(MAX_ROWS);

      // The feed answers every mention of every message on the page.
      const feed = await getFeed(secondary, conversationId);
      expect(feed.status).toBe(200);
      expect(feed.body.messages).toHaveLength(100);
      for (const message of feed.body.messages ?? []) {
        expect(message.mentionedUserIds).toEqual(mentioned);
      }
    });

    it('lists every current member of a conversation with more than 1000 members', async () => {
      const { primary, secondary } = world;
      const extra = await seedUsers('member', MAX_ROWS + 1);
      const conversationId = await seedGroup([primary.appUserId, ...extra]);
      const expected = sorted([primary.appUserId, ...extra]);

      // The hazard: a row-returning read of these members is cut at max-rows.
      const capped = await admin.from('conversation_members').select('user_id').eq('conversation_id', conversationId);
      expect(capped.data).toHaveLength(MAX_ROWS);

      const roster = await getRoster(primary, conversationId);
      expect(roster.status).toBe(200);
      expect(sorted(roster.body.members?.map((member) => member.userId) ?? [])).toEqual(expected);
      // Ordered by display name (the seeded names sort by number), then user id.
      const names = roster.body.members?.map((member) => member.displayName ?? '') ?? [];
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));

      const direct = await primary.client.rpc('list_conversation_members', { p_conversation_id: conversationId });
      expect(direct.error).toBeNull();
      expect((direct.data as unknown[]).length).toBe(expected.length);
      expect((await getRoster(secondary, conversationId)).status).toBe(403);
    });

    it('bounds the bulk mention read to 1000 message ids and keeps it members-only', async () => {
      const { primary, outsider, groupConversationId } = world;
      const key = randomUUID();
      const created = await postCreate(primary, {
        conversationId: groupConversationId,
        content: `T4 bulk read ${key}`,
        mentionIds: [world.secondary.appUserId],
        ...attempt(primary, key, 1),
      });
      expect(created.status).toBe(201);
      const messageId = created.body.message?.id as string;

      const member = await primary.client.rpc('list_message_mentions', { p_message_ids: [messageId] });
      expect(member.error).toBeNull();
      expect(member.data).toEqual({ [messageId]: [world.secondary.appUserId] });
      const nonMember = await outsider.client.rpc('list_message_mentions', { p_message_ids: [messageId] });
      expect(nonMember.error).toBeNull();
      expect(nonMember.data).toEqual({});
      const anonymous = await anon.rpc('list_message_mentions', { p_message_ids: [messageId] });
      expect(anonymous.error?.code).toBe('42501');

      const tooMany = await primary.client.rpc('list_message_mentions', {
        p_message_ids: Array.from({ length: 1001 }, () => randomUUID()),
      });
      expect(tooMany.error?.code).toBe('22023');
      expect(tooMany.error?.message).toBe('MESSAGE_IDS_INVALID');

      const executable = await world.query<{ role: string; allowed: boolean }>(
        `select r.role, has_function_privilege(r.role, 'public.list_message_mentions(uuid[])', 'execute') as allowed
         from unnest(array['anon', 'authenticated', 'service_role']) as r(role) order by r.role`,
      );
      expect(executable).toEqual([
        { role: 'anon', allowed: false },
        { role: 'authenticated', allowed: true },
        { role: 'service_role', allowed: true },
      ]);
    });
  });

  describe('compatibility (Phase 4 and published clients)', () => {
    it('keeps Phase 4 keyed creates without mentions: create, replay 200, 409; pre-T4 compositions mean "no mention"', async () => {
      const { primary, secondary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T4 phase4 ${key}`;
      const first = await postCreate(primary, { conversationId, content, clientMessageId: key });
      expect(first.status).toBe(201);
      expect(first.body.message?.mentionedUserIds).toEqual([]);
      expect((await storedComposition(conversationId, key)).composition).toEqual({
        content,
        type: 'text',
        replyToId: null,
        attachmentIds: [],
        mentionIds: [],
      });
      expect((await postCreate(primary, { conversationId, content, clientMessageId: key })).status).toBe(200);
      expect((await postCreate(primary, { conversationId, content: `${content}!`, clientMessageId: key })).status).toBe(409);

      // A composition stored before T4 has no mentionIds: same as none requested.
      await world.query(
        `update private.message_send_attempts set composition = composition - 'mentionIds'
         where conversation_id = $1 and client_message_id = $2`,
        [conversationId, key],
      );
      expect((await postCreate(primary, { conversationId, content, clientMessageId: key })).status).toBe(200);
      expect((await postCreate(primary, { conversationId, content, mentionIds: [], ...attempt(primary, key, 1) })).status).toBe(200);
      const withMention = await postCreate(primary, { conversationId, content, mentionIds: [secondary.appUserId], clientMessageId: key });
      expect(withMention.status).toBe(409);
      expect(withMention.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');

      // A keyed message with no recorded composition (pre-T2): only a mention-less replay matches.
      await world.query(
        `update private.message_send_attempts set composition = null where conversation_id = $1 and client_message_id = $2`,
        [conversationId, key],
      );
      expect((await postCreate(primary, { conversationId, content, clientMessageId: key })).status).toBe(200);
      expect((await postCreate(primary, { conversationId, content, mentionIds: [secondary.appUserId], clientMessageId: key })).status).toBe(409);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
      expect(await storedMentions(first.body.message?.id as string)).toEqual([]);
    });

    it('keeps unkeyed creates unchanged and refuses mentions without a client key', async () => {
      const { primary, secondary, directConversationId: conversationId } = world;
      const content = `T4 unkeyed ${randomUUID()}`;
      const created = await postCreate(primary, { conversationId, content });
      expect(created.status).toBe(201);
      expect(created.body.clientMessageId).toBeUndefined();
      // Legacy response shape: no mention field on unkeyed messages.
      expect(created.body.message?.mentionedUserIds).toBeUndefined();
      expect(await storedMentions(created.body.message?.id as string)).toEqual([]);

      const refused = await postCreate(primary, { conversationId, content: `${content} @`, mentionIds: [secondary.appUserId] });
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('INVALID_MENTION_IDS');
      expect(await world.query('select 1 from public.messages where conversation_id = $1 and content = $2', [conversationId, `${content} @`])).toHaveLength(0);
    });

    it('validates mentionIds (array of at most 50 UUIDs) before storing anything', async () => {
      const { primary, groupConversationId: conversationId } = world;
      const tooMany = Array.from({ length: 51 }, () => randomUUID());
      for (const mentionIds of ['x', [1], ['not-a-uuid'], tooMany, { id: world.secondary.appUserId }]) {
        const key = randomUUID();
        const result = await postCreate(primary, { conversationId, content: `T4 invalid ${key}`, mentionIds, ...attempt(primary, key, 1) });
        expect(result.status, JSON.stringify(mentionIds).slice(0, 40)).toBe(400);
        expect(result.body.code).toBe('INVALID_MENTION_IDS');
        expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
      }
      const fifty = Array.from({ length: 50 }, () => randomUUID());
      const key = randomUUID();
      const accepted = await postCreate(primary, { conversationId, content: `T4 fifty ${key}`, mentionIds: fifty, ...attempt(primary, key, 1) });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
      expect(accepted.body.message?.mentionedUserIds).toEqual([]);
    });

    it('keeps the Phase 4 wrapper result exactly {message_id, created} and writes no mention through it', async () => {
      const { primary, groupConversationId: conversationId } = world;
      const uploadId = await upload(primary, conversationId);
      const key = randomUUID();
      const args = {
        p_conversation_id: conversationId,
        p_sender_id: primary.appUserId,
        p_content: '',
        p_type: 'image',
        p_reply_to_id: null,
        p_client_message_id: key,
        p_upload_ids: [uploadId],
      };
      const first = await admin.rpc('create_message_with_attachments', args);
      expect(first.error).toBeNull();
      expect(Object.keys(first.data as object).sort()).toEqual(['created', 'message_id']);
      expect((first.data as { created: boolean }).created).toBe(true);
      const replay = await admin.rpc('create_message_with_attachments', args);
      expect(replay.data).toEqual({ message_id: (first.data as { message_id: string }).message_id, created: false });
      expect(await storedMentions((first.data as { message_id: string }).message_id)).toEqual([]);
    });

    it('refuses malformed mention ids in a composition at the database', async () => {
      const { primary, groupConversationId: conversationId } = world;
      const key = randomUUID();
      await expect(
        world.query(
          `select public.create_message_attempt($1, $2, 'db check', 'text', null, $3, null,
             jsonb_build_object('content', 'db check', 'type', 'text', 'replyToId', null, 'attachmentIds', '[]'::jsonb,
                                'mentionIds', jsonb_build_array('nope')),
             '{}'::uuid[], null, null)`,
          [conversationId, primary.appUserId, key],
        ),
      ).rejects.toMatchObject({ code: '22023', message: 'MENTION_IDS_INVALID' });
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    });
  });
});
