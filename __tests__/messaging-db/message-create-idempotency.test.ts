import { randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as createRoute } from '@/app/api/messages/create/route';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_DB_URL } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface CreatedMessageBody {
  message?: { id: string; senderId: string; conversationId: string; content: string; replyToId?: string };
  error?: { code?: string } | string;
}

// Phase 4 T23 (FR-024, AC-029): a create that repeats the composition key of a
// message already stored for the same sender and conversation returns that
// message instead of inserting another. Real POST /api/messages/create handler,
// real local sessions, real unique index on the local database.
describe('message create idempotency key (local Supabase)', () => {
  let world: MessagingDbWorld;
  const sessions = new Map<string, SessionCookie[]>();

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 0 });
    for (const user of [world.primary, world.secondary, world.outsider]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  function createRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/messages/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function readResponse(response: Response) {
    return { status: response.status, body: (await response.json()) as CreatedMessageBody };
  }

  async function postCreate(user: MessagingDbUser, body: unknown) {
    const cookies = sessions.get(user.appUserId) ?? [];
    return asSession(cookies, async () => readResponse(await createRoute(createRequest(body))));
  }

  async function rowsWithContent(conversationId: string, content: string) {
    return world.query<{ id: string; sender_id: string; client_message_id: string | null }>(
      `select id, sender_id, client_message_id from public.messages
       where conversation_id = $1 and content = $2 order by timestamp, id`,
      [conversationId, content],
    );
  }

  it('stores the key and returns the existing message when the same key is sent again', async () => {
    const { primary, directConversationId: conversationId } = world;
    const clientMessageId = randomUUID();
    const content = `T23 same key ${clientMessageId}`;

    const first = await postCreate(primary, { conversationId, content, clientMessageId });
    expect(first.status).toBe(201);
    const second = await postCreate(primary, { conversationId, content, clientMessageId });
    expect(second.status).toBe(200);
    expect(second.body.message?.id).toBe(first.body.message?.id);
    expect(second.body.message).toMatchObject({ senderId: primary.appUserId, conversationId, content });

    expect(await rowsWithContent(conversationId, content)).toEqual([
      { id: first.body.message?.id, sender_id: primary.appUserId, client_message_id: clientMessageId },
    ]);
  });

  it('keeps the legacy behavior for creates without a key (published app)', async () => {
    const { primary, directConversationId: conversationId } = world;
    const content = `T23 no key ${randomUUID()}`;

    const first = await postCreate(primary, { conversationId, content });
    const second = await postCreate(primary, { conversationId, content });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.message?.id).not.toBe(first.body.message?.id);

    const rows = await rowsWithContent(conversationId, content);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.client_message_id === null)).toBe(true);
  });

  it("never matches another sender's key or the same key in another conversation", async () => {
    const { primary, secondary, outsider, directConversationId, groupConversationId } = world;
    const clientMessageId = randomUUID();
    const content = `T23 shared key ${clientMessageId}`;

    const primaryCreate = await postCreate(primary, {
      conversationId: directConversationId,
      content,
      clientMessageId,
    });
    expect(primaryCreate.status).toBe(201);

    // Same key, same conversation, other member: a new message of their own.
    const secondaryCreate = await postCreate(secondary, {
      conversationId: directConversationId,
      content,
      clientMessageId,
    });
    expect(secondaryCreate.status).toBe(201);
    expect(secondaryCreate.body.message?.id).not.toBe(primaryCreate.body.message?.id);
    expect(secondaryCreate.body.message?.senderId).toBe(secondary.appUserId);

    // Same key, same sender, another conversation: a new message.
    const otherConversation = await postCreate(primary, {
      conversationId: groupConversationId,
      content,
      clientMessageId,
    });
    expect(otherConversation.status).toBe(201);
    expect(otherConversation.body.message?.id).not.toBe(primaryCreate.body.message?.id);

    // A non-member replaying the key gets no access to the stored message.
    const outsiderReplay = await postCreate(outsider, {
      conversationId: directConversationId,
      content,
      clientMessageId,
    });
    expect(outsiderReplay.status).toBe(403);
    expect(outsiderReplay.body.message).toBeUndefined();

    const directRows = await rowsWithContent(directConversationId, content);
    expect(directRows.map((row) => row.sender_id).sort()).toEqual(
      [primary.appUserId, secondary.appUserId].sort(),
    );
    expect(await rowsWithContent(groupConversationId, content)).toHaveLength(1);
  });

  it('creates exactly one row when the same key is sent concurrently', async () => {
    const { primary, directConversationId: conversationId } = world;
    const clientMessageId = randomUUID();
    const content = `T23 concurrent ${clientMessageId}`;
    const body = { conversationId, content, clientMessageId };

    // One session for every in-flight call (the cookie jar is process-wide).
    const results = await asSession(sessions.get(primary.appUserId) ?? [], () =>
      Promise.all(
        Array.from({ length: 6 }, async () => readResponse(await createRoute(createRequest(body)))),
      ),
    );

    expect(results.map((result) => result.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    const ids = new Set(results.map((result) => result.body.message?.id));
    expect(ids.size).toBe(1);
    const rows = await rowsWithContent(conversationId, content);
    expect(rows).toHaveLength(1);
    expect(ids.has(rows[0].id)).toBe(true);
  });

  it('returns the winning row when its insert commits while the create is waiting on the key', async () => {
    const { primary, directConversationId: conversationId } = world;
    const clientMessageId = randomUUID();
    const content = `T23 race ${clientMessageId}`;

    // A concurrent writer inserts the same key and keeps its transaction open:
    // the route's lookup cannot see it, so its INSERT blocks on the unique index
    // and must turn the unique violation into a read of the committed row.
    const holder = new Client({ connectionString: MESSAGING_DB_URL });
    await holder.connect();
    try {
      await holder.query('begin');
      const { rows: held } = await holder.query<{ id: string }>(
        `insert into public.messages (conversation_id, sender_id, content, type, status, client_message_id)
         values ($1, $2, $3, 'text', 'sent', $4) returning id`,
        [conversationId, primary.appUserId, content, clientMessageId],
      );
      const holderPid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;

      const pending = postCreate(primary, { conversationId, content, clientMessageId });

      await expect
        .poll(
          async () =>
            (
              await world.query<{ waiting: string }>(
                `select count(*)::text as waiting from pg_catalog.pg_stat_activity
                 where pid <> $1 and wait_event_type = 'Lock'
                   and query ilike '%insert into "public"."messages"%'`,
                [holderPid],
              )
            )[0].waiting,
          { timeout: 15_000, interval: 100 },
        )
        .toBe('1');

      await holder.query('commit');
      const result = await pending;
      expect(result.status).toBe(200);
      expect(result.body.message?.id).toBe(held[0].id);
      expect(await rowsWithContent(conversationId, content)).toHaveLength(1);
    } finally {
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    }
  });

  it('rejects a key reused for a different composition and invalid keys', async () => {
    const { primary, directConversationId: conversationId } = world;
    const clientMessageId = randomUUID();
    const content = `T23 conflict ${clientMessageId}`;

    expect((await postCreate(primary, { conversationId, content, clientMessageId })).status).toBe(201);
    const changed = await postCreate(primary, {
      conversationId,
      content: `${content} edited`,
      clientMessageId,
    });
    expect(changed.status).toBe(409);
    expect(changed.body.message).toBeUndefined();
    expect(await rowsWithContent(conversationId, `${content} edited`)).toHaveLength(0);

    for (const invalid of ['not-a-uuid', 42, '']) {
      const result = await postCreate(primary, { conversationId, content: `${content} ${String(invalid)}`, clientMessageId: invalid });
      expect(result.status).toBe(400);
    }
    expect(await rowsWithContent(conversationId, content)).toHaveLength(1);
  });
});
