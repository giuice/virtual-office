import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as createRoute } from '@/app/api/messages/create/route';
import { POST as fenceRoute } from '@/app/api/messages/fence/route';
import { POST as uploadRoute } from '@/app/api/messages/upload/route';
import { ATTACHMENTS_BUCKET } from '@/lib/messaging/attachment-policy';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_API_URL, MESSAGING_DB_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface RouteMessage {
  id: string;
  senderId: string;
  conversationId: string;
  content: string;
  status: string;
  replyToId?: string;
  clientMessageId?: string;
  attachments?: { id: string }[];
}

interface RouteBody {
  message?: RouteMessage | null;
  clientMessageId?: string;
  attemptGeneration?: number;
  outcome?: 'stored' | 'not_stored';
  attachment?: { id: string };
  code?: string;
  error?: string;
}

interface RouteResult {
  status: number;
  body: RouteBody;
}

interface AttemptRow extends Record<string, unknown> {
  fence_generation: string | null;
  message_id: string | null;
  committed_at: Date | null;
  composition: Record<string, unknown> | null;
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

// Phase 5 T2 (FR-006, FR-011, FR-024, FR-034, BR-004, BR-005; AC-044, AC-045,
// AC-046): attempt and sender fencing of keyed creates. Real
// POST /api/messages/create and POST /api/messages/fence handlers, real local
// sessions, real row locks and transactions on the local database.
describe('message attempt fencing (local Supabase)', () => {
  let world: MessagingDbWorld;
  let admin: SupabaseClient;
  const sessions = new Map<string, SessionCookie[]>();

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 0 });
    admin = createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const user of [world.primary, world.secondary, world.outsider]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  beforeEach(async () => {
    // Creates, fences and uploads are rate limited per user; each test starts
    // a fresh window.
    await world.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [
      [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId],
    ]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
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

  function jsonRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function readJson(response: Response): Promise<RouteResult> {
    return { status: response.status, body: (await response.json()) as RouteBody };
  }

  async function call(route: RouteHandler, user: MessagingDbUser | null, request: NextRequest): Promise<RouteResult> {
    return asSession(cookiesOf(user), async () => readJson(await route(request)));
  }

  function postCreate(user: MessagingDbUser | null, body: Record<string, unknown>) {
    return call(createRoute, user, jsonRequest('/api/messages/create', body));
  }

  function postFence(user: MessagingDbUser | null, body: Record<string, unknown>) {
    return call(fenceRoute, user, jsonRequest('/api/messages/fence', body));
  }

  /**
   * A create whose request body has not arrived yet: the route waits on
   * request.json() — after authentication and the request-budget charge
   * (Phase 5 T3), before the conversation check or any message work — until
   * `release` sends the body (a request still in the network).
   */
  function heldCreate(user: MessagingDbUser) {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
    });
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1];
    const pending = call(createRoute, user, new NextRequest('http://localhost/api/messages/create', init));
    return {
      pending,
      release(body: Record<string, unknown>) {
        controller?.enqueue(new TextEncoder().encode(JSON.stringify(body)));
        controller?.close();
      },
    };
  }

  async function keyRows(sender: MessagingDbUser, conversationId: string, clientMessageId: string) {
    return world.query<{ id: string; content: string }>(
      `select id, content from public.messages
       where sender_id = $1 and conversation_id = $2 and client_message_id = $3`,
      [sender.appUserId, conversationId, clientMessageId],
    );
  }

  async function attemptRows(conversationId: string, clientMessageId: string) {
    return world.query<AttemptRow & { sender_id: string }>(
      `select sender_id, fence_generation::text as fence_generation, message_id, committed_at, composition
       from private.message_send_attempts
       where conversation_id = $1 and client_message_id = $2`,
      [conversationId, clientMessageId],
    );
  }

  async function insertReplyTarget(conversationId: string, sender: MessagingDbUser): Promise<string> {
    const rows = await world.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, content, type, status)
       values ($1, $2, $3, 'text', 'sent') returning id`,
      [conversationId, sender.appUserId, `T2 reply target ${randomUUID()}`],
    );
    return rows[0].id;
  }

  /**
   * Holds FOR UPDATE on a message row from a separate connection: a create
   * replying to it blocks inside its INSERT (the reply_to_id foreign-key
   * check needs FOR KEY SHARE on that row) until `release`.
   */
  async function lockMessageRow(messageId: string) {
    const holder = new Client({ connectionString: MESSAGING_DB_URL });
    await holder.connect();
    await holder.query('begin');
    await holder.query('select id from public.messages where id = $1 for update', [messageId]);
    const pid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
    let released = false;
    return {
      pid,
      async release() {
        if (released) return;
        released = true;
        await holder.query('rollback').catch(() => undefined);
        await holder.end();
      },
    };
  }

  async function waitForBlockedCreate(holderPid: number): Promise<void> {
    await expect
      .poll(
        async () =>
          (
            await world.query<{ waiting: string }>(
              `select count(*)::text as waiting from pg_catalog.pg_stat_activity
               where pid <> $1 and pid <> pg_backend_pid() and wait_event_type = 'Lock'
                 and query ilike '%create_message_attempt%'`,
              [holderPid],
            )
          )[0].waiting,
        { timeout: 5_000, interval: 50 },
      )
      .toBe('1');
  }

  function attempt(user: MessagingDbUser, clientMessageId: string, attemptGeneration: number) {
    return { clientMessageId, attemptGeneration, expectedSenderId: user.appUserId };
  }

  describe('AC-045 attempt fencing', () => {
    it('(a) a create blocked inside its INSERT loses to a fence and never commits', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 blocked ${key}`;
      const target = await insertReplyTarget(conversationId, primary);
      const lock = await lockMessageRow(target);
      try {
        const attempt1 = postCreate(primary, { conversationId, content, replyToId: target, ...attempt(primary, key, 1) });
        await waitForBlockedCreate(lock.pid);

        const fence = await postFence(primary, { conversationId, ...attempt(primary, key, 2) });
        expect(fence.status).toBe(200);
        expect(fence.body).toMatchObject({ outcome: 'not_stored', clientMessageId: key, attemptGeneration: 2 });
        expect(fence.body.message).toBeUndefined();

        await lock.release();
        const result = await attempt1;
        expect(result.status).toBe(409);
        expect(result.body.code).toBe('ATTEMPT_SUPERSEDED');
        expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
      } finally {
        await lock.release();
      }

      // The newer attempt then delivers exactly once.
      const attempt2 = await postCreate(primary, { conversationId, content, replyToId: target, ...attempt(primary, key, 2) });
      expect(attempt2.status).toBe(201);
      expect(attempt2.body.clientMessageId).toBe(key);
      expect(attempt2.body.message?.clientMessageId).toBe(key);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
    });

    it('(b) an older request still in the network when a fence runs is rejected as stale', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 held ${key}`;

      const held = heldCreate(primary);
      const fence = await postFence(primary, { conversationId, ...attempt(primary, key, 2) });
      expect(fence.body).toMatchObject({ outcome: 'not_stored' });

      held.release({ conversationId, content, ...attempt(primary, key, 1) });
      const result = await held.pending;
      expect(result.status).toBe(409);
      expect(result.body.code).toBe('ATTEMPT_SUPERSEDED');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);

      const attempt2 = await postCreate(primary, { conversationId, content, ...attempt(primary, key, 2) });
      expect(attempt2.status).toBe(201);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
    });

    it('(c) a stale fence after a newer attempt was dispatched is rejected and the newer attempt commits', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 stale fence ${key}`;

      // Tab 1's fence for its unknown attempt 1.
      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 1) })).body.outcome).toBe('not_stored');

      // Tab 2 takes over: attempt 2 reaches the server and is held inside its INSERT.
      const target = await insertReplyTarget(conversationId, primary);
      const lock = await lockMessageRow(target);
      let attempt2: Promise<RouteResult> | undefined;
      try {
        attempt2 = postCreate(primary, { conversationId, content, replyToId: target, ...attempt(primary, key, 2) });
        await waitForBlockedCreate(lock.pid);

        const staleFence = await postFence(primary, { conversationId, ...attempt(primary, key, 1) });
        expect(staleFence.status).toBe(409);
        expect(staleFence.body.code).toBe('ATTEMPT_SUPERSEDED');
      } finally {
        await lock.release();
      }

      const committed = await attempt2;
      expect(committed?.status).toBe(201);
      const rows = await keyRows(primary, conversationId, key);
      expect(rows).toHaveLength(1);

      // A stale create (or its replay) is refused too; nothing more is stored.
      const staleCreate = await postCreate(primary, { conversationId, content, replyToId: target, ...attempt(primary, key, 1) });
      expect(staleCreate.status).toBe(409);
      expect(staleCreate.body.code).toBe('ATTEMPT_SUPERSEDED');
      // The current generation replays the stored message.
      const replay = await postCreate(primary, { conversationId, content, replyToId: target, ...attempt(primary, key, 2) });
      expect(replay.status).toBe(200);
      expect(replay.body.message?.id).toBe(rows[0].id);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
    });

    it('a fence returns the stored message, keyed by clientMessageId, and never creates one', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 lookup ${key}`;

      const created = await postCreate(primary, { conversationId, content, ...attempt(primary, key, 1) });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ clientMessageId: key, attemptGeneration: 1 });

      const fence = await postFence(primary, { conversationId, ...attempt(primary, key, 2) });
      expect(fence.status).toBe(200);
      expect(fence.body).toMatchObject({ outcome: 'stored', clientMessageId: key, attemptGeneration: 2 });
      expect(fence.body.message).toMatchObject({
        id: created.body.message?.id,
        content,
        senderId: primary.appUserId,
        clientMessageId: key,
      });

      // Fencing an unknown key stores nothing.
      const unknownKey = randomUUID();
      const notStored = await postFence(primary, { conversationId, ...attempt(primary, unknownKey, 3) });
      expect(notStored.body.outcome).toBe('not_stored');
      expect(await keyRows(primary, conversationId, unknownKey)).toHaveLength(0);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
    });

    it('a fence never resolves a deleted message as not stored (no resend of a deleted message)', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const created = await postCreate(primary, { conversationId, content: `T2 deleted ${key}`, ...attempt(primary, key, 1) });
      expect(created.status).toBe(201);
      await world.query('delete from public.messages where id = $1', [created.body.message?.id]);

      const fence = await postFence(primary, { conversationId, ...attempt(primary, key, 2) });
      expect(fence.status).toBe(200);
      expect(fence.body).toMatchObject({ outcome: 'stored', message: null });

      // An outbox retry under a newer generation does not recreate it either.
      const retry = await postCreate(primary, { conversationId, content: `T2 deleted ${key}`, ...attempt(primary, key, 3) });
      expect(retry.status).toBe(410);
      expect(retry.body.code).toBe('MESSAGE_DELETED');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);

      // The database refuses it at commit time as well (deletion racing an
      // attempt that registered before it): nothing is stored.
      await expect(
        world.query(
          `select public.create_message_attempt($1, $2, $3, 'text', null, $4, 4, null, '{}'::uuid[], null, null)`,
          [conversationId, primary.appUserId, `T2 deleted ${key}`, key],
        ),
      ).rejects.toThrow('MESSAGE_DELETED');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    });

    it('keeps the Phase 4 behavior for a generation-less create after its message was deleted', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 D4 deleted ${key}`;
      const first = await postCreate(primary, { conversationId, content, clientMessageId: key });
      expect(first.status).toBe(201);
      await world.query('delete from public.messages where id = $1', [first.body.message?.id]);
      const again = await postCreate(primary, { conversationId, content, clientMessageId: key });
      expect(again.status).toBe(201);
      expect(again.body.message?.id).not.toBe(first.body.message?.id);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
    });

    it('concurrent fences and creates of one key never both win', async () => {
      const { primary, groupConversationId: conversationId } = world;
      for (let round = 0; round < 8; round += 1) {
        const key = randomUUID();
        const content = `T2 race ${round} ${key}`;
        const [create, fence] = await asSession(cookiesOf(primary), () =>
          Promise.all([
            createRoute(jsonRequest('/api/messages/create', { conversationId, content, ...attempt(primary, key, 1) })).then(readJson),
            fenceRoute(jsonRequest('/api/messages/fence', { conversationId, ...attempt(primary, key, 2) })).then(readJson),
          ]),
        );
        const rows = await keyRows(primary, conversationId, key);
        expect(fence.status).toBe(200);
        if (fence.body.outcome === 'stored') {
          expect(create.status).toBe(201);
          expect(rows).toHaveLength(1);
        } else {
          expect(fence.body.outcome).toBe('not_stored');
          expect(create.status).toBe(409);
          expect(create.body.code).toBe('ATTEMPT_SUPERSEDED');
          expect(rows).toHaveLength(0);
        }
      }
    });

    it('concurrent creates of one attempt store exactly one message', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const body = { conversationId, content: `T2 same attempt ${key}`, ...attempt(primary, key, 1) };
      const results = await asSession(cookiesOf(primary), () =>
        Promise.all(Array.from({ length: 5 }, async () => readJson(await createRoute(jsonRequest('/api/messages/create', body))))),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 200, 200, 200, 201]);
      expect(new Set(results.map((result) => result.body.message?.id)).size).toBe(1);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
    });
  });

  describe('D4: keyed creates without a generation (Phase 4 client)', () => {
    it('a held generation-less request loses to a fence and stores nothing', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 D4 held ${key}`;

      const held = heldCreate(primary);
      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 1) })).body.outcome).toBe('not_stored');
      held.release({ conversationId, content, clientMessageId: key });
      const result = await held.pending;
      expect(result.status).toBe(409);
      expect(result.body.code).toBe('ATTEMPT_SUPERSEDED');

      // Its Phase 4 retries keep losing while the fence state exists.
      const retry = await postCreate(primary, { conversationId, content, clientMessageId: key });
      expect(retry.status).toBe(409);
      expect(retry.body.code).toBe('ATTEMPT_SUPERSEDED');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    });

    it('a generation-less create blocked inside its INSERT loses to a fence and stores nothing', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const target = await insertReplyTarget(conversationId, primary);
      const lock = await lockMessageRow(target);
      try {
        const pending = postCreate(primary, {
          conversationId,
          content: `T2 D4 blocked ${key}`,
          replyToId: target,
          clientMessageId: key,
        });
        await waitForBlockedCreate(lock.pid);
        expect((await postFence(primary, { conversationId, ...attempt(primary, key, 1) })).body.outcome).toBe('not_stored');
        await lock.release();
        const result = await pending;
        expect(result.status).toBe(409);
        expect(result.body.code).toBe('ATTEMPT_SUPERSEDED');
      } finally {
        await lock.release();
      }
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    });

    it('keeps the Phase 4 contract: create, replay 200, 409, no fence state, replays unaffected by a later fence', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 D4 text ${key}`;

      const first = await postCreate(primary, { conversationId, content, clientMessageId: key });
      expect(first.status).toBe(201);
      const retry = await postCreate(primary, { conversationId, content, clientMessageId: key });
      expect(retry.status).toBe(200);
      expect(retry.body.message?.id).toBe(first.body.message?.id);
      expect(retry.body.clientMessageId).toBe(key);
      expect(retry.body.attemptGeneration).toBeUndefined();
      expect((await postCreate(primary, { conversationId, content: `${content} edited`, clientMessageId: key })).status).toBe(409);

      // The generation-less create recorded its composition but no fence state.
      const [row] = await attemptRows(conversationId, key);
      expect(row).toMatchObject({ sender_id: primary.appUserId, fence_generation: null, message_id: first.body.message?.id });
      expect(row.composition).toEqual({ content, type: 'text', replyToId: null, attachmentIds: [], mentionIds: [] });

      // A fence on the stored key resolves it; Phase 4 replays still answer 200 / 409.
      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 1) })).body.outcome).toBe('stored');
      expect((await postCreate(primary, { conversationId, content, clientMessageId: key })).status).toBe(200);
      const changed = await postCreate(primary, { conversationId, content: `${content} again`, clientMessageId: key });
      expect(changed.status).toBe(409);
      expect(changed.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
    });

    it('keeps the Phase 4 keyed attachment and voice-note contract (create, replay 200, 409)', async () => {
      const { primary, groupConversationId: conversationId } = world;

      const uploadForm = async (file: File, extra: Record<string, string> = {}) => {
        const form = new FormData();
        form.append('file', file);
        form.append('conversationId', conversationId);
        for (const [name, value] of Object.entries(extra)) form.append(name, value);
        const result = await call(uploadRoute, primary, new NextRequest('http://localhost/api/messages/upload', { method: 'POST', body: form }));
        expect(result.status, JSON.stringify(result.body)).toBe(201);
        return result.body.attachment?.id as string;
      };

      const imageId = await uploadForm(new File([PNG_BYTES], 'photo.png', { type: 'image/png' }));
      const imageKey = randomUUID();
      const image = await postCreate(primary, { conversationId, content: '', clientMessageId: imageKey, attachmentIds: [imageId] });
      expect(image.status, JSON.stringify(image.body)).toBe(201);
      expect(image.body.message?.attachments?.map((item) => item.id)).toEqual([imageId]);
      const imageReplay = await postCreate(primary, { conversationId, content: '', clientMessageId: imageKey, attachmentIds: [imageId] });
      expect(imageReplay.status).toBe(200);
      expect(imageReplay.body.message?.id).toBe(image.body.message?.id);
      expect((await postCreate(primary, { conversationId, content: 'other', clientMessageId: imageKey, attachmentIds: [imageId] })).status).toBe(409);

      const voiceId = await uploadForm(new File([webmBytes()], 'voice-note.webm', { type: 'audio/webm;codecs=opus' }), {
        kind: 'voice',
        duration: '3',
        waveform: JSON.stringify([0.1, 0.5, 0.9]),
      });
      const voiceKey = randomUUID();
      const voice = await postCreate(primary, { conversationId, content: '', clientMessageId: voiceKey, attachmentIds: [voiceId] });
      expect(voice.status, JSON.stringify(voice.body)).toBe(201);
      const voiceReplay = await postCreate(primary, { conversationId, content: '', clientMessageId: voiceKey, attachmentIds: [voiceId] });
      expect(voiceReplay.status).toBe(200);
      expect(voiceReplay.body.message?.id).toBe(voice.body.message?.id);
      const textUnderVoiceKey = await postCreate(primary, { conversationId, content: 'text', clientMessageId: voiceKey });
      expect(textUnderVoiceKey.status).toBe(409);
      expect(textUnderVoiceKey.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');

      for (const key of [imageKey, voiceKey]) {
        expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
        const [row] = await attemptRows(conversationId, key);
        expect(row.fence_generation).toBeNull();
      }
    });

    it('a generation-carrying keyed attachment create obeys the same fence', async () => {
      const { primary, groupConversationId: conversationId } = world;
      const form = new FormData();
      form.append('file', new File([PNG_BYTES], 'fenced.png', { type: 'image/png' }));
      form.append('conversationId', conversationId);
      const uploaded = await call(uploadRoute, primary, new NextRequest('http://localhost/api/messages/upload', { method: 'POST', body: form }));
      expect(uploaded.status).toBe(201);
      const uploadId = uploaded.body.attachment?.id as string;
      const key = randomUUID();

      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 3) })).body.outcome).toBe('not_stored');
      const stale = await postCreate(primary, { conversationId, content: '', attachmentIds: [uploadId], ...attempt(primary, key, 2) });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('ATTEMPT_SUPERSEDED');
      // Nothing was linked: the upload is still pending and can be sent by the current attempt.
      expect(await world.query('select 1 from public.message_attachment_uploads where id = $1', [uploadId])).toHaveLength(1);

      const current = await postCreate(primary, { conversationId, content: '', attachmentIds: [uploadId], ...attempt(primary, key, 3) });
      expect(current.status).toBe(201);
      expect(current.body.message?.attachments?.map((item) => item.id)).toEqual([uploadId]);
      expect(current.body.clientMessageId).toBe(key);
      const [row] = await attemptRows(conversationId, key);
      expect(row.composition).toEqual({ content: '', type: null, replyToId: null, attachmentIds: [uploadId], mentionIds: [] });
    });
  });

  describe('AC-044 sender fencing and fence authorization', () => {
    it('rejects a create or fence carrying another user as expected sender, storing and fencing nothing', async () => {
      const { primary, secondary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 mismatch ${key}`;

      // C (secondary, a member) is signed in; the request claims A (primary).
      const create = await postCreate(secondary, { conversationId, content, ...attempt(primary, key, 1) });
      expect(create.status).toBe(403);
      expect(create.body.code).toBe('SENDER_MISMATCH');
      const createWithoutGeneration = await postCreate(secondary, {
        conversationId,
        content,
        clientMessageId: key,
        expectedSenderId: primary.appUserId,
      });
      expect(createWithoutGeneration.status).toBe(403);
      expect(createWithoutGeneration.body.code).toBe('SENDER_MISMATCH');

      const fence = await postFence(secondary, { conversationId, ...attempt(primary, key, 1) });
      expect(fence.status).toBe(403);
      expect(fence.body.code).toBe('SENDER_MISMATCH');

      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
      expect(await keyRows(secondary, conversationId, key)).toHaveLength(0);
      expect(await attemptRows(conversationId, key)).toHaveLength(0);
    });

    it('rejects anonymous fence and create requests', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const fence = await postFence(null, { conversationId, ...attempt(primary, key, 1) });
      expect(fence.status).toBe(401);
      const create = await postCreate(null, { conversationId, content: 'anon', ...attempt(primary, key, 1) });
      expect(create.status).toBe(401);
      expect(await attemptRows(conversationId, key)).toHaveLength(0);
    });

    it("never returns or affects another user's message when fencing its key", async () => {
      const { primary, secondary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 foreign key ${key}`;
      const stored = await postCreate(primary, { conversationId, content, ...attempt(primary, key, 1) });
      expect(stored.status).toBe(201);

      // C fences A's key as itself: it only ever addresses C's own (empty) key.
      const foreign = await postFence(secondary, { conversationId, ...attempt(secondary, key, 5) });
      expect(foreign.status).toBe(200);
      expect(foreign.body.outcome).toBe('not_stored');
      expect(foreign.body.message).toBeUndefined();
      expect(JSON.stringify(foreign.body)).not.toContain(stored.body.message?.id as string);
      expect(JSON.stringify(foreign.body)).not.toContain(content);

      // A's attempts are unaffected: generation 1 still replays, a fence finds A's message.
      const replay = await postCreate(primary, { conversationId, content, ...attempt(primary, key, 1) });
      expect(replay.status).toBe(200);
      expect(replay.body.message?.id).toBe(stored.body.message?.id);
      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 2) })).body.message?.id).toBe(
        stored.body.message?.id,
      );

      // C fencing a key A has not used yet does not block A's first attempt.
      const pendingKey = randomUUID();
      expect((await postFence(secondary, { conversationId, ...attempt(secondary, pendingKey, 9) })).body.outcome).toBe('not_stored');
      expect((await postCreate(primary, { conversationId, content: `${content} 2`, ...attempt(primary, pendingKey, 1) })).status).toBe(201);
      expect(await keyRows(secondary, conversationId, key)).toHaveLength(0);
      expect(await keyRows(secondary, conversationId, pendingKey)).toHaveLength(0);
    });

    it('rejects fences by non-participants and for missing conversations', async () => {
      const { outsider, directConversationId } = world;
      const key = randomUUID();
      const outsiderFence = await postFence(outsider, { conversationId: directConversationId, ...attempt(outsider, key, 1) });
      expect(outsiderFence.status).toBe(403);
      expect(outsiderFence.body.code).toBe('NOT_PARTICIPANT');
      const missing = await postFence(outsider, { conversationId: randomUUID(), ...attempt(outsider, key, 1) });
      expect(missing.status).toBe(403);
      expect(missing.body.code).toBe('NOT_PARTICIPANT');
      expect(await attemptRows(directConversationId, key)).toHaveLength(0);
    });

    it('validates fence request fields', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const base = { conversationId, ...attempt(primary, key, 1) };
      const cases: [Record<string, unknown>, string][] = [
        [{ ...base, conversationId: 'nope' }, 'BAD_REQUEST'],
        [{ ...base, clientMessageId: 'nope' }, 'INVALID_CLIENT_MESSAGE_ID'],
        [{ ...base, attemptGeneration: undefined }, 'INVALID_ATTEMPT_GENERATION'],
        [{ ...base, attemptGeneration: 0 }, 'INVALID_ATTEMPT_GENERATION'],
        [{ ...base, attemptGeneration: 1.5 }, 'INVALID_ATTEMPT_GENERATION'],
        [{ ...base, attemptGeneration: '1' }, 'INVALID_ATTEMPT_GENERATION'],
        [{ ...base, expectedSenderId: undefined }, 'INVALID_EXPECTED_SENDER'],
        [{ ...base, expectedSenderId: 'nope' }, 'INVALID_EXPECTED_SENDER'],
      ];
      for (const [body, code] of cases) {
        const result = await postFence(primary, body);
        expect(result.status, JSON.stringify(body)).toBe(400);
        expect(result.body.code).toBe(code);
      }
      expect(await attemptRows(conversationId, key)).toHaveLength(0);
    });
  });

  describe('AC-046 create outcome codes (BR-005)', () => {
    it('answers definitive 4xx codes, never 5xx, for client errors', async () => {
      const { primary, outsider, directConversationId, groupConversationId } = world;
      const key = randomUUID();
      const base = { conversationId: directConversationId, content: `T2 codes ${key}`, ...attempt(primary, key, 1) };
      const otherConversationMessage = await insertReplyTarget(groupConversationId, primary);

      const expectations: [MessagingDbUser, Record<string, unknown>, number, string][] = [
        [outsider, { ...base, expectedSenderId: outsider.appUserId }, 403, 'NOT_PARTICIPANT'],
        [primary, { ...base, conversationId: randomUUID() }, 403, 'NOT_PARTICIPANT'],
        [primary, { ...base, conversationId: 'not-a-uuid' }, 400, 'BAD_REQUEST'],
        [primary, { ...base, replyToId: otherConversationMessage }, 400, 'INVALID_REPLY_TARGET'],
        [primary, { ...base, replyToId: randomUUID() }, 400, 'INVALID_REPLY_TARGET'],
        [primary, { ...base, replyToId: 'not-a-uuid' }, 400, 'INVALID_REPLY_TARGET'],
        [primary, { ...base, content: 'x'.repeat(8193) }, 413, 'CONTENT_TOO_LARGE'],
        [primary, { ...base, attemptGeneration: 0 }, 400, 'INVALID_ATTEMPT_GENERATION'],
        [primary, { ...base, attemptGeneration: 2 ** 53 }, 400, 'INVALID_ATTEMPT_GENERATION'],
        [primary, { ...base, clientMessageId: undefined }, 400, 'INVALID_ATTEMPT_GENERATION'],
        [primary, { ...base, expectedSenderId: undefined }, 400, 'INVALID_EXPECTED_SENDER'],
      ];
      for (const [user, body, status, code] of expectations) {
        const result = await postCreate(user, body);
        expect(result.status, JSON.stringify({ body, result: result.body })).toBe(status);
        expect(result.body.code).toBe(code);
      }
      expect(await keyRows(primary, directConversationId, key)).toHaveLength(0);
      // Requests refused by the database after their attempt registered
      // (keyed reply targets are validated after the replay check) leave at
      // most the attempt's own generation, never a committed message.
      for (const row of await attemptRows(directConversationId, key)) {
        expect(row).toMatchObject({ sender_id: primary.appUserId, fence_generation: '1', message_id: null, committed_at: null });
      }

      // A different composition under a stored key → 409 CLIENT_MESSAGE_ID_REUSED.
      expect((await postCreate(primary, base)).status).toBe(201);
      const reused = await postCreate(primary, { ...base, content: `${base.content} edited` });
      expect(reused.status).toBe(409);
      expect(reused.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');
      expect(await keyRows(primary, directConversationId, key)).toHaveLength(1);
    });

    it('forces status sent, accepts a same-conversation reply, and compares replays to the original composition', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const target = await insertReplyTarget(conversationId, primary);
      const content = `T2 reply ${key}`;
      const created = await postCreate(primary, {
        conversationId,
        content: `  ${content}  `,
        replyToId: target,
        status: 'read',
        ...attempt(primary, key, 1),
      });
      expect(created.status).toBe(201);
      expect(created.body.message).toMatchObject({ content, replyToId: target, status: 'sent', clientMessageId: key });

      // The reply target is deleted afterwards (the stored reply_to_id becomes
      // null): an unchanged replay still matches the ORIGINAL composition and
      // is not re-validated; dropping the reply target is a different one.
      await world.query('delete from public.messages where id = $1', [target]);
      const unchanged = await postCreate(primary, { conversationId, content, replyToId: target, ...attempt(primary, key, 1) });
      expect(unchanged.status).toBe(200);
      expect(unchanged.body.message?.id).toBe(created.body.message?.id);
      const withoutReply = await postCreate(primary, { conversationId, content, ...attempt(primary, key, 1) });
      expect(withoutReply.status).toBe(409);
      expect(withoutReply.body.code).toBe('CLIENT_MESSAGE_ID_REUSED');
      // A new key replying to the deleted target is refused by the database.
      const newKey = randomUUID();
      const refused = await postCreate(primary, { conversationId, content, replyToId: target, ...attempt(primary, newKey, 1) });
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('INVALID_REPLY_TARGET');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(1);
      expect(await keyRows(primary, conversationId, newKey)).toHaveLength(0);
    });
  });

  describe('keyed writes outside the fenced contract (review T2 r1 #1)', () => {
    function rawMessage(sender: MessagingDbUser, conversationId: string, content: string, clientMessageId: string | null) {
      return {
        conversation_id: conversationId,
        sender_id: sender.appUserId,
        content,
        type: 'text',
        status: 'sent',
        client_message_id: clientMessageId,
      };
    }

    it('denies direct inserts by clients, keyed or not (Phase 5 T3: no path around the send budgets)', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const keyed = await primary.client.from('messages').insert(rawMessage(primary, conversationId, `T2 raw keyed ${key}`, key));
      expect(keyed.error).not.toBeNull();
      expect(keyed.error?.code).toBe('42501');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
      expect(await attemptRows(conversationId, key)).toHaveLength(0);

      const content = `T2 raw unkeyed ${key}`;
      const unkeyed = await primary.client.from('messages').insert(rawMessage(primary, conversationId, content, null));
      expect(unkeyed.error?.code).toBe('42501');
      expect(
        await world.query('select 1 from public.messages where conversation_id = $1 and content = $2', [conversationId, content]),
      ).toHaveLength(0);
    });

    it('denies setting, changing or clearing a message key by UPDATE, for clients and the service role', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const created = await postCreate(primary, { conversationId, content: `T2 immutable ${key}`, ...attempt(primary, key, 1) });
      expect(created.status).toBe(201);
      const keyedId = created.body.message?.id as string;
      const unkeyed = await postCreate(primary, { conversationId, content: `T2 immutable unkeyed ${key}` });
      const unkeyedId = unkeyed.body.message?.id as string;

      for (const [id, value] of [
        [keyedId, randomUUID()],
        [keyedId, null],
        [unkeyedId, randomUUID()],
      ] as const) {
        const byClient = await primary.client.from('messages').update({ client_message_id: value }).eq('id', id);
        expect(byClient.error?.code, `client ${id} -> ${value}`).toBe('42501');
        const byService = await admin.from('messages').update({ client_message_id: value }).eq('id', id);
        expect(byService.error?.code, `service ${id} -> ${value}`).toBe('42501');
      }
      const keys = await world.query<{ id: string; client_message_id: string | null }>(
        'select id, client_message_id from public.messages where id = any($1::uuid[])',
        [[keyedId, unkeyedId]],
      );
      expect(Object.fromEntries(keys.map((row) => [row.id, row.client_message_id]))).toEqual({
        [keyedId]: key,
        [unkeyedId]: null,
      });

      // A keyed message cannot move to another conversation either.
      const moveByClient = await primary.client
        .from('messages')
        .update({ conversation_id: world.groupConversationId })
        .eq('id', keyedId);
      expect(moveByClient.error?.code).toBe('42501');
      const moveByService = await admin.from('messages').update({ conversation_id: world.groupConversationId }).eq('id', keyedId);
      expect(moveByService.error?.code).toBe('42501');

      // Ordinary edits of a keyed message still work and keep the key.
      const edit = await primary.client.from('messages').update({ content: `T2 immutable ${key} edited` }).eq('id', keyedId);
      expect(edit.error).toBeNull();
      expect(await keyRows(primary, conversationId, key)).toEqual([{ id: keyedId, content: `T2 immutable ${key} edited` }]);
    });

    it('refuses a raw service-role keyed insert once the key is fenced, and tracks one made before', async () => {
      const { primary, directConversationId: conversationId } = world;
      const fencedKey = randomUUID();
      expect((await postFence(primary, { conversationId, ...attempt(primary, fencedKey, 2) })).body.outcome).toBe('not_stored');
      const late = await admin.from('messages').insert(rawMessage(primary, conversationId, `T2 raw late ${fencedKey}`, fencedKey));
      expect(late.error?.message).toBe('ATTEMPT_SUPERSEDED');
      expect(await keyRows(primary, conversationId, fencedKey)).toHaveLength(0);

      // An older server's raw keyed insert without fence state still works
      // (Phase 4 contract) and leaves a delivery record...
      const key = randomUUID();
      const raw = await admin
        .from('messages')
        .insert(rawMessage(primary, conversationId, `T2 raw ok ${key}`, key))
        .select('id')
        .single();
      expect(raw.error).toBeNull();
      const [row] = await attemptRows(conversationId, key);
      expect(row).toMatchObject({ fence_generation: null, message_id: raw.data?.id, composition: null });
      expect(row.committed_at).not.toBeNull();

      // ...so after the sender deletes it, it is never resent.
      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 1) })).body.message?.id).toBe(raw.data?.id);
      await world.query('delete from public.messages where id = $1', [raw.data?.id]);
      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 2) })).body).toMatchObject({
        outcome: 'stored',
        message: null,
      });
      const retry = await postCreate(primary, { conversationId, content: `T2 raw ok ${key}`, ...attempt(primary, key, 3) });
      expect(retry.status).toBe(410);
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    });
  });

  describe('delivery records of untracked (pre-T2) keyed messages (review T2 r1 #2)', () => {
    // A keyed message stored before this migration has no delivery record
    // until the backfill or a fence/replay records it; removing the row
    // reproduces that state for a message created by the route.
    async function untrackedKeyedMessage(conversationId: string, key: string, content: string): Promise<string> {
      const created = await postCreate(world.primary, { conversationId, content, clientMessageId: key });
      expect(created.status).toBe(201);
      await world.query('delete from private.message_send_attempts where conversation_id = $1 and client_message_id = $2', [
        conversationId,
        key,
      ]);
      return created.body.message?.id as string;
    }

    it('a fence records the delivery, so a later deletion is never resent', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 legacy fence ${key}`;
      const messageId = await untrackedKeyedMessage(conversationId, key, content);

      const fence = await postFence(primary, { conversationId, ...attempt(primary, key, 1) });
      expect(fence.body).toMatchObject({ outcome: 'stored' });
      expect(fence.body.message?.id).toBe(messageId);
      const [row] = await attemptRows(conversationId, key);
      expect(row).toMatchObject({ message_id: messageId, fence_generation: '1' });
      expect(row.committed_at).not.toBeNull();

      await world.query('delete from public.messages where id = $1', [messageId]);
      expect((await postFence(primary, { conversationId, ...attempt(primary, key, 2) })).body).toMatchObject({
        outcome: 'stored',
        message: null,
      });
      const retry = await postCreate(primary, { conversationId, content, ...attempt(primary, key, 3) });
      expect(retry.status).toBe(410);
      expect(retry.body.code).toBe('MESSAGE_DELETED');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    });

    it('a replay records the delivery, so a later deletion is never resent', async () => {
      const { primary, directConversationId: conversationId } = world;
      const key = randomUUID();
      const content = `T2 legacy replay ${key}`;
      const messageId = await untrackedKeyedMessage(conversationId, key, content);

      const replay = await postCreate(primary, { conversationId, content, clientMessageId: key });
      expect(replay.status).toBe(200);
      expect(replay.body.message?.id).toBe(messageId);
      const [row] = await attemptRows(conversationId, key);
      expect(row).toMatchObject({ message_id: messageId, fence_generation: null, composition: null });
      expect(row.committed_at).not.toBeNull();

      await world.query('delete from public.messages where id = $1', [messageId]);
      const retry = await postCreate(primary, { conversationId, content, ...attempt(primary, key, 1) });
      expect(retry.status).toBe(410);
      expect(retry.body.code).toBe('MESSAGE_DELETED');
      expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    });
  });

  describe('compatibility', () => {
    it('keeps unkeyed creates (published client) unchanged and outside attempt state', async () => {
      const { primary, directConversationId: conversationId } = world;
      const content = `T2 unkeyed ${randomUUID()}`;
      const first = await postCreate(primary, { conversationId, content });
      const second = await postCreate(primary, { conversationId, content });
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(first.body.clientMessageId).toBeUndefined();
      expect(first.body.message?.clientMessageId).toBeUndefined();
      const rows = await world.query<{ id: string }>(
        `select m.id from public.messages m
         where m.conversation_id = $1 and m.content = $2 and m.client_message_id is null`,
        [conversationId, content],
      );
      expect(rows).toHaveLength(2);
      const attempts = await world.query(
        `select 1 from private.message_send_attempts where message_id = any($1::uuid[])`,
        [rows.map((row) => row.id)],
      );
      expect(attempts).toHaveLength(0);
    });

    // Replaces the deleted unit test __tests__/api/messages-create-route.test.ts
    // (Phase 5 T4, AGENTS.md test policy): the published client's UNKEYED create
    // contract on the real route and local database.
    it('keeps the unkeyed create contract: authorization, forced status, size cap, reply targets, activity', async () => {
      const { primary, outsider, directConversationId: conversationId, groupConversationId } = world;
      const tag = randomUUID();
      const stored = async (content: string) =>
        world.query<{ status: string; sender_id: string; reply_to_id: string | null }>(
          'select status::text as status, sender_id, reply_to_id from public.messages where conversation_id = $1 and content = $2',
          [conversationId, content],
        );

      // Authorization failures from the gate propagate; nothing is created.
      const outsiderContent = `T4 legacy outsider ${tag}`;
      const denied = await postCreate(outsider, { conversationId, content: outsiderContent });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('NOT_PARTICIPANT');
      expect((await postCreate(null, { conversationId, content: outsiderContent })).status).toBe(401);
      expect(await stored(outsiderContent)).toHaveLength(0);

      // Client-supplied status is ignored: stored and answered as sent, by the caller.
      const statusContent = `T4 legacy status ${tag}`;
      const forced = await postCreate(primary, { conversationId, content: statusContent, status: 'read' });
      expect(forced.status).toBe(201);
      expect(forced.body.message).toMatchObject({ status: 'sent', senderId: primary.appUserId });
      expect(await stored(statusContent)).toEqual([{ status: 'sent', sender_id: primary.appUserId, reply_to_id: null }]);

      // Content above the size cap → 413; nothing stored.
      const tooLarge = await postCreate(primary, { conversationId, content: `${tag}${'x'.repeat(8193)}` });
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body.code).toBe('CONTENT_TOO_LARGE');
      expect(await world.query('select 1 from public.messages where content like $1', [`${tag}x%`])).toHaveLength(0);

      // Reply targets from another conversation, or that do not exist → 400; nothing stored.
      const foreignTarget = await insertReplyTarget(groupConversationId, primary);
      for (const replyToId of [foreignTarget, randomUUID()]) {
        const content = `T4 legacy bad reply ${replyToId}`;
        const refused = await postCreate(primary, { conversationId, content, replyToId });
        expect(refused.status).toBe(400);
        expect(refused.body.code).toBe('INVALID_REPLY_TARGET');
        expect(await stored(content)).toHaveLength(0);
      }

      // A same-conversation reply is created and bumps the conversation's activity.
      const target = await insertReplyTarget(conversationId, primary);
      const [{ before }] = await world.query<{ before: Date | null }>(
        'select last_activity as before from public.conversations where id = $1',
        [conversationId],
      );
      const replyContent = `T4 legacy reply ${tag}`;
      const reply = await postCreate(primary, { conversationId, content: replyContent, replyToId: target });
      expect(reply.status).toBe(201);
      expect(reply.body.message).toMatchObject({ replyToId: target, status: 'sent' });
      expect(await stored(replyContent)).toEqual([{ status: 'sent', sender_id: primary.appUserId, reply_to_id: target }]);
      const [{ after }] = await world.query<{ after: Date | null }>(
        'select last_activity as after from public.conversations where id = $1',
        [conversationId],
      );
      expect(after?.getTime() ?? 0).toBeGreaterThan(before?.getTime() ?? 0);
    });

    it('keeps attempt state unreadable and unwritable for clients', async () => {
      const { primary, directConversationId: conversationId } = world;
      const fence = await primary.client.rpc('fence_message_attempt', {
        p_sender_id: primary.appUserId,
        p_conversation_id: conversationId,
        p_client_message_id: randomUUID(),
        p_attempt_generation: 1,
      });
      expect(fence.error).not.toBeNull();
      const create = await primary.client.rpc('create_message_attempt', {
        p_conversation_id: conversationId,
        p_sender_id: primary.appUserId,
        p_content: 'direct rpc',
        p_type: 'text',
        p_reply_to_id: null,
        p_client_message_id: randomUUID(),
        p_attempt_generation: 1,
        p_composition: null,
        p_upload_ids: [],
        p_insert_quota_limit: null,
        p_insert_quota_window_seconds: null,
      });
      expect(create.error).not.toBeNull();
      const privileges = await world.query<{ role: string; privilege: boolean }>(
        `select r.role, has_table_privilege(r.role, 'private.message_send_attempts', 'select,insert,update,delete') as privilege
         from unnest(array['anon', 'authenticated']) as r(role)`,
      );
      expect(privileges.every((row) => row.privilege === false)).toBe(true);
      const executable = await world.query<{ role: string; fn: string; allowed: boolean }>(
        `select r.role, f.fn, has_function_privilege(r.role, f.fn, 'execute') as allowed
         from unnest(array['anon', 'authenticated']) as r(role)
         cross join unnest(array[
           'public.fence_message_attempt(uuid, uuid, uuid, bigint)',
           'public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)',
           'public.create_message_with_attachments(uuid, uuid, text, text, uuid, uuid, uuid[])',
           'private.message_attempt_replay(uuid, uuid, uuid, bigint, uuid)',
           'private.fence_raw_keyed_message_insert()',
           'private.reject_client_message_id_change()'
         ]) as f(fn)`,
      );
      expect(executable.filter((row) => row.allowed)).toEqual([]);
    });
  });
});
