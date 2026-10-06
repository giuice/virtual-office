import type { RealtimeChannel } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PATCH as readRoute } from '@/app/api/conversations/read/route';
import { GET as readersRoute } from '@/app/api/messages/[messageId]/readers/route';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';
import { MessageStatus } from '@/types/messaging';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

// Phase 4 T7 (FR-003, BR-003, AC-003, AC-032, AC-035): reader identities and
// read times are available only to the message's sender, through the real
// GET /api/messages/[messageId]/readers handler with real local sessions, and
// receipt RLS (table SELECT, client INSERT, Realtime delivery) agrees.
describe('message readers are visible only to the sender (local Supabase)', () => {
  let world: MessagingDbWorld;
  let third: MessagingDbUser;
  const sessions = new Map<string, SessionCookie[]>();

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 4, withGroupThirdMember: true });
    if (!world.groupThirdMember) throw new Error('fixture did not create the third group member');
    third = world.groupThirdMember;
    for (const user of [world.primary, world.secondary, world.outsider, third]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  function cookiesFor(user: MessagingDbUser | null): SessionCookie[] {
    return user ? (sessions.get(user.appUserId) ?? []) : [];
  }

  async function getReaders(user: MessagingDbUser | null, messageId: string) {
    const request = new NextRequest(`http://localhost/api/messages/${messageId}/readers`);
    const response = await asSession(cookiesFor(user), () =>
      readersRoute(request, { params: Promise.resolve({ messageId }) }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function markRead(user: MessagingDbUser, conversationId: string, messageIds: string[]) {
    const request = new NextRequest('http://localhost/api/conversations/read', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId, messageIds }),
    });
    const response = await asSession(cookiesFor(user), () => readRoute(request));
    expect(response.status).toBe(200);
  }

  async function insertMessage(conversationId: string, sender: MessagingDbUser): Promise<string> {
    const [row] = await world.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, content, type, status)
       values ($1, $2, 'T7 message', 'text', 'sent') returning id`,
      [conversationId, sender.appUserId],
    );
    return row.id;
  }

  async function receiptReadAt(messageId: string, user: MessagingDbUser): Promise<string> {
    const [row] = await world.query<{ read_at: Date }>(
      `select read_at from public.message_read_receipts where message_id = $1 and user_id = $2`,
      [messageId, user.appUserId],
    );
    return row.read_at.toISOString();
  }

  async function visibleReceiptUserIds(viewer: MessagingDbUser, messageId: string): Promise<string[]> {
    const { data, error } = await viewer.client
      .from('message_read_receipts')
      .select('user_id')
      .eq('message_id', messageId);
    expect(error).toBeNull();
    return (data ?? []).map((row: { user_id: string }) => row.user_id).sort();
  }

  it('gives the sender the readers, most recent first, with name and avatar, never the sender', async () => {
    const { primary, secondary, groupConversationId: conversationId } = world;
    await world.query(`update public.users set avatar_url = $2 where id = $1`, [
      secondary.appUserId,
      'https://example.test/avatars/secondary.png',
    ]);
    const messageId = await insertMessage(conversationId, primary);

    // Product path: each reader's drawer reports the visible message.
    await markRead(secondary, conversationId, [messageId]);
    await markRead(third, conversationId, [messageId]);
    // The sender's own client never records a receipt for their own message.
    await markRead(primary, conversationId, [messageId]);
    // Even a stray own-message row (pre-BR-002 data) is never exposed as a reader.
    await world.query(
      `insert into public.message_read_receipts (message_id, conversation_id, user_id, read_at)
       values ($1, $2, $3, now() + interval '1 hour')`,
      [messageId, conversationId, primary.appUserId],
    );

    const result = await getReaders(primary, messageId);
    expect(result).toEqual({
      status: 200,
      body: {
        readCount: 2,
        readers: [
          {
            userId: third.appUserId,
            displayName: 'Msg DB third',
            avatarUrl: null,
            readAt: await receiptReadAt(messageId, third),
          },
          {
            userId: secondary.appUserId,
            displayName: 'Msg DB secondary',
            avatarUrl: 'https://example.test/avatars/secondary.png',
            readAt: await receiptReadAt(messageId, secondary),
          },
        ],
      },
    });

    // Unread own message: count 0, empty list.
    const unreadId = await insertMessage(conversationId, primary);
    expect(await getReaders(primary, unreadId)).toEqual({ status: 200, body: { readCount: 0, readers: [] } });
  });

  it('gives a non-sender member, a non-member, and an anonymous caller no reader details', async () => {
    const { primary, secondary, outsider, groupConversationId: conversationId } = world;
    const messageId = await insertMessage(conversationId, primary);
    await markRead(secondary, conversationId, [messageId]);
    await markRead(third, conversationId, [messageId]);

    const member = await getReaders(secondary, messageId);
    expect(member.status).toBe(403);
    expect(member.body).toMatchObject({ code: 'NOT_MESSAGE_SENDER' });
    expect(member.body).not.toHaveProperty('readers');
    expect(member.body).not.toHaveProperty('readCount');

    const nonMember = await getReaders(outsider, messageId);
    expect(nonMember.status).toBe(403);
    expect(nonMember.body).toMatchObject({ code: 'NOT_PARTICIPANT' });
    expect(nonMember.body).not.toHaveProperty('readers');

    expect((await getReaders(null, messageId)).status).toBe(401);
    expect((await getReaders(primary, 'not-a-uuid')).status).toBe(400);
    expect((await getReaders(primary, globalThis.crypto.randomUUID())).status).toBe(404);
  });

  it('limits direct receipt reads to own receipts and receipts on own messages; clients cannot insert', async () => {
    const { primary, secondary, outsider, groupConversationId: conversationId } = world;
    const messageId = await insertMessage(conversationId, primary);
    await markRead(secondary, conversationId, [messageId]);
    await markRead(third, conversationId, [messageId]);

    // Sender (published ✓✓ path) sees every receipt on their own message.
    expect(await visibleReceiptUserIds(primary, messageId)).toEqual(
      [secondary.appUserId, third.appUserId].sort(),
    );
    // A non-sender member sees only their own receipt, never another reader's.
    expect(await visibleReceiptUserIds(secondary, messageId)).toEqual([secondary.appUserId]);
    expect(await visibleReceiptUserIds(outsider, messageId)).toEqual([]);

    // Published enrichment (GET /api/messages/get, user-scoped repository):
    // the sender's own message still derives READ from receipts.
    const page = await new SupabaseMessageRepository(primary.client).findByConversation(conversationId, {
      limit: 50,
    });
    expect(page.items.find((message) => message.id === messageId)?.status).toBe(MessageStatus.READ);

    // Client-side INSERT is closed: own message, a non-member conversation,
    // and a forged conversation_id are all rejected by RLS.
    const ownMessage = await insertMessage(conversationId, secondary);
    const attempts = [
      { client: secondary.client, row: { message_id: ownMessage, conversation_id: conversationId, user_id: secondary.appUserId } },
      { client: outsider.client, row: { message_id: messageId, conversation_id: conversationId, user_id: outsider.appUserId } },
      { client: third.client, row: { message_id: messageId, conversation_id: world.directConversationId, user_id: third.appUserId } },
    ];
    for (const { client, row } of attempts) {
      const { error } = await client.from('message_read_receipts').insert(row);
      expect(error?.code).toBe('42501');
    }
    const [stray] = await world.query<{ n: string }>(
      `select count(*)::text as n from public.message_read_receipts
       where (message_id = $1 and user_id = $2) or (message_id = $3 and user_id = any($4::uuid[]))`,
      [ownMessage, secondary.appUserId, messageId, [outsider.appUserId]],
    );
    expect(stray.n).toBe('0');
    expect(await visibleReceiptUserIds(primary, messageId)).toEqual(
      [secondary.appUserId, third.appUserId].sort(),
    );
  });

  it('delivers receipt INSERT events to the sender but not to other members (Realtime RLS)', async () => {
    const { primary, secondary, groupConversationId: conversationId } = world;
    const messageId = await insertMessage(conversationId, primary);

    const received = new Map<string, string[]>();
    const channels: RealtimeChannel[] = [];
    const subscribe = (viewer: MessagingDbUser, key: string) =>
      new Promise<void>((resolve, reject) => {
        received.set(key, []);
        const channel = viewer.client
          .channel(`t7-readers-${key}-${messageId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'message_read_receipts', filter: `message_id=eq.${messageId}` },
            (payload) => {
              received.get(key)?.push((payload.new as { user_id: string }).user_id);
            },
          )
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') resolve();
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status));
          });
        channels.push(channel);
      });

    const waitFor = async (predicate: () => boolean, timeoutMs: number) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return predicate();
    };

    try {
      await subscribe(primary, 'sender');
      await subscribe(secondary, 'member');
      // postgres_changes bindings become active shortly after SUBSCRIBED.
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await markRead(third, conversationId, [messageId]);
      await markRead(secondary, conversationId, [messageId]);

      const senderGotBoth = await waitFor(() => (received.get('sender')?.length ?? 0) >= 2, 15_000);
      expect(senderGotBoth).toBe(true);
      expect([...(received.get('sender') ?? [])].sort()).toEqual([secondary.appUserId, third.appUserId].sort());

      // The member's own receipt arriving proves their binding was live when
      // the third member's receipt (written earlier) was filtered out.
      await waitFor(() => (received.get('member')?.length ?? 0) >= 1, 10_000);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(received.get('member')).toEqual([secondary.appUserId]);
    } finally {
      for (const channel of channels) {
        await channel.unsubscribe();
      }
    }
  });
});
