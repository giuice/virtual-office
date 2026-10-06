import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PATCH as readRoute } from '@/app/api/conversations/read/route';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';

import { MESSAGE_PAGE_SIZE, createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

// Phase 4 T5 (FR-004, FR-006, BR-001/002/005/013): per-message receipts via the
// real PATCH /api/conversations/read handler with real local sessions, and the
// viewer's unread counter read through the user-scoped repository path
// (get_unread_counts under the member's JWT).
describe('per-message read receipts and unread counts (local Supabase)', () => {
  let world: MessagingDbWorld;
  const sessions = new Map<string, SessionCookie[]>();

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: MESSAGE_PAGE_SIZE + 5 });
    for (const user of [world.primary, world.secondary, world.outsider]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  async function patchRead(user: MessagingDbUser | null, body: unknown) {
    const request = new NextRequest('http://localhost/api/conversations/read', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const cookies = user ? (sessions.get(user.appUserId) ?? []) : [];
    const response = await asSession(cookies, () => readRoute(request));
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function unreadCount(user: MessagingDbUser, conversationId: string): Promise<number> {
    const page = await new SupabaseConversationRepository(user.client).findByUser(user.appUserId, {
      limit: 50,
    });
    const conversation = page.items.find((item) => item.id === conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not visible to ${user.email}`);
    return conversation.unreadCount;
  }

  async function receiptMessageIds(user: MessagingDbUser, conversationId: string): Promise<string[]> {
    const rows = await world.query<{ message_id: string }>(
      `select r.message_id from public.message_read_receipts r
       join public.messages m on m.id = r.message_id
       where r.user_id = $1 and m.conversation_id = $2
       order by r.message_id`,
      [user.appUserId, conversationId],
    );
    return rows.map((row) => row.message_id);
  }

  async function lastReadAt(user: MessagingDbUser, conversationId: string): Promise<Date | null> {
    const rows = await world.query<{ last_read_at: Date | null }>(
      `select last_read_at from public.conversation_members where user_id = $1 and conversation_id = $2`,
      [user.appUserId, conversationId],
    );
    return rows[0]?.last_read_at ?? null;
  }

  async function insertMessages(
    conversationId: string,
    sender: MessagingDbUser,
    count: number,
    minutesAgo = 0,
  ): Promise<string[]> {
    // Membership rows start with last_read_at = their creation time, so
    // "new" messages (minutesAgo = 0) are stamped just after now().
    const rows = await world.query<{ id: string }>(
      `with inserted as (
         insert into public.messages (conversation_id, sender_id, content, type, status, timestamp)
         select $1, $2, 'T5 ' || n, 'text', 'sent',
                now() - make_interval(mins => $4::int) + n * interval '1 millisecond'
         from generate_series(1, $3::int) as n
         returning id, timestamp
       )
       select id from inserted order by timestamp`,
      [conversationId, sender.appUserId, count, minutesAgo],
    );
    return rows.map((row) => row.id);
  }

  it('records receipts only for the submitted visible ids; 20 unread with 5 seen leaves 15', async () => {
    const { secondary, primary, directConversationId: conversationId } = world;
    const ids = await insertMessages(conversationId, primary, 20);
    expect(await unreadCount(secondary, conversationId)).toBe(20);
    const cursorBefore = await lastReadAt(secondary, conversationId);

    const lastFive = ids.slice(-5);
    const firstCall = await patchRead(secondary, { conversationId, messageIds: lastFive });
    expect(firstCall).toEqual({ status: 200, body: { success: true, recorded: 5 } });
    expect(await receiptMessageIds(secondary, conversationId)).toEqual([...lastFive].sort());
    expect(await unreadCount(secondary, conversationId)).toBe(15);
    // The per-message path never advances the legacy cursor.
    expect(await lastReadAt(secondary, conversationId)).toEqual(cursorBefore);

    // Scrolling the rest into view (with repeats) is idempotent and reaches 0.
    const secondCall = await patchRead(secondary, { conversationId, messageIds: ids });
    expect(secondCall).toEqual({ status: 200, body: { success: true, recorded: 15 } });
    expect(await receiptMessageIds(secondary, conversationId)).toEqual([...ids].sort());
    expect(await unreadCount(secondary, conversationId)).toBe(0);
  });

  it("never records a receipt for the caller's own messages", async () => {
    const { primary, groupConversationId: conversationId, historyMessageIds } = world;
    const ownIds = new Set(
      (
        await world.query<{ id: string }>(
          `select id from public.messages where conversation_id = $1 and sender_id = $2`,
          [conversationId, primary.appUserId],
        )
      ).map((row) => row.id),
    );
    expect(ownIds.size).toBeGreaterThan(0);
    const othersIds = historyMessageIds.filter((id) => !ownIds.has(id));

    const result = await patchRead(primary, { conversationId, messageIds: historyMessageIds });
    expect(result).toEqual({ status: 200, body: { success: true, recorded: othersIds.length } });

    const recorded = await receiptMessageIds(primary, conversationId);
    expect(recorded).toEqual([...othersIds].sort());
    expect(recorded.some((id) => ownIds.has(id))).toBe(false);

    // Submitting only own messages records nothing.
    const ownOnly = await patchRead(primary, { conversationId, messageIds: [...ownIds] });
    expect(ownOnly).toEqual({ status: 200, body: { success: true, recorded: 0 } });
  });

  it('ignores ids that belong to another conversation', async () => {
    const { secondary, roomConversationId, groupConversationId, historyMessageIds } = world;
    const result = await patchRead(secondary, {
      conversationId: roomConversationId,
      messageIds: historyMessageIds.slice(0, 10),
    });
    expect(result).toEqual({ status: 200, body: { success: true, recorded: 0 } });
    expect(await receiptMessageIds(secondary, roomConversationId)).toEqual([]);
    expect(await receiptMessageIds(secondary, groupConversationId)).toEqual([]);
  });

  it('rejects a non-member and never writes receipts for them', async () => {
    const { outsider, directConversationId: conversationId } = world;
    const [someMessage] = await world.query<{ id: string }>(
      `select id from public.messages where conversation_id = $1 limit 1`,
      [conversationId],
    );

    const result = await patchRead(outsider, { conversationId, messageIds: [someMessage.id] });
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('NOT_PARTICIPANT');

    // Defense in depth: the RPC itself refuses a non-member even for service_role.
    const service = createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpcAsService = await service.rpc('mark_messages_read', {
      p_conversation_id: conversationId,
      p_user_id: outsider.appUserId,
      p_message_ids: [someMessage.id],
    });
    expect(rpcAsService.error?.code).toBe('42501');

    // The RPC is not exposed to signed-in users (it takes a user id parameter).
    // The caller below IS a member, so 42501 here can only be the EXECUTE
    // denial, not the function's own non-member check.
    const rpcAsMember = await world.secondary.client.rpc('mark_messages_read', {
      p_conversation_id: conversationId,
      p_user_id: world.secondary.appUserId,
      p_message_ids: [someMessage.id],
    });
    expect(rpcAsMember.error?.code).toBe('42501');

    const rows = await world.query<{ n: string }>(
      `select count(*)::text as n from public.message_read_receipts where user_id = $1`,
      [outsider.appUserId],
    );
    expect(rows[0].n).toBe('0');
  });

  it('validates the input bound and requires a session', async () => {
    const { secondary, directConversationId: conversationId } = world;
    const tooMany = Array.from({ length: 101 }, () => globalThis.crypto.randomUUID());
    expect((await patchRead(secondary, { conversationId, messageIds: tooMany })).status).toBe(400);
    expect((await patchRead(secondary, { conversationId, messageIds: [] })).status).toBe(400);
    expect((await patchRead(secondary, { conversationId, messageIds: ['not-a-uuid'] })).status).toBe(400);
    expect((await patchRead(null, { conversationId, messageIds: [tooMany[0]] })).status).toBe(401);
    expect((await patchRead(secondary, null)).status).toBe(400);
  });

  it('keeps the published mark-all path working and pre-receipt history read', async () => {
    const { primary, secondary, roomConversationId: conversationId } = world;
    // History read before per-message receipts existed: older than the
    // member's last_read_at, with no receipts.
    const history = await insertMessages(conversationId, primary, 3, 5);
    await world.query(
      `update public.conversation_members set last_read_at = now() - interval '1 minute'
       where user_id = $1 and conversation_id = $2`,
      [secondary.appUserId, conversationId],
    );
    expect(await unreadCount(secondary, conversationId)).toBe(0);

    const fresh = await insertMessages(conversationId, primary, 2);
    expect(await unreadCount(secondary, conversationId)).toBe(2);
    await patchRead(secondary, { conversationId, messageIds: [fresh[1]] });
    expect(await unreadCount(secondary, conversationId)).toBe(1);

    // Published client body: { conversationId, userId } -> legacy mark-all.
    const before = await lastReadAt(secondary, conversationId);
    const legacy = await patchRead(secondary, { conversationId, userId: secondary.appUserId });
    expect(legacy).toEqual({ status: 200, body: { success: true } });
    expect(await unreadCount(secondary, conversationId)).toBe(0);
    const after = await lastReadAt(secondary, conversationId);
    expect(after && before && after.getTime() > before.getTime()).toBe(true);
    expect(await receiptMessageIds(secondary, conversationId)).toEqual([...history, ...fresh].sort());
  });
});
