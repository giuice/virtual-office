import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PATCH as readRoute } from '@/app/api/conversations/read/route';
import { SupabaseConversationRepository } from '@/repositories/implementations/supabase';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_ANON_KEY, MESSAGING_API_URL } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

// Phase 4 T24 (AC-035): mark_conversation_read takes the target user id as a
// parameter, so only the service-role server path may execute it. Anyone with
// the public anon key (or any signed-in user) used to be able to mark another
// user's conversation read and write receipts on their behalf.
describe('mark_conversation_read is service-role only (local Supabase)', () => {
  let world: MessagingDbWorld;
  let secondarySession: SessionCookie[] = [];

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 3 });
    secondarySession = await signInSessionCookies(world.secondary.email);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await world?.cleanup();
  });

  async function insertUnreadMessages(conversationId: string, sender: MessagingDbUser, count: number) {
    // Membership rows start with last_read_at = their creation time, so these
    // are stamped just after now() to count as unread.
    await world.query(
      `insert into public.messages (conversation_id, sender_id, content, type, status, timestamp)
       select $1, $2, 'T24 ' || n, 'text', 'sent', now() + n * interval '1 millisecond'
       from generate_series(1, $3::int) as n`,
      [conversationId, sender.appUserId, count],
    );
  }

  async function readState(user: MessagingDbUser, conversationId: string) {
    const [row] = await world.query<{ last_read_at: Date | null; receipts: string }>(
      `select cm.last_read_at,
              (select count(*)::text from public.message_read_receipts r
                where r.user_id = cm.user_id and r.conversation_id = cm.conversation_id) as receipts
       from public.conversation_members cm
       where cm.user_id = $1 and cm.conversation_id = $2`,
      [user.appUserId, conversationId],
    );
    return { lastReadAt: row?.last_read_at?.getTime() ?? null, receipts: row?.receipts ?? null };
  }

  async function unreadCount(user: MessagingDbUser, conversationId: string): Promise<number> {
    const page = await new SupabaseConversationRepository(user.client).findByUser(user.appUserId, {
      limit: 50,
    });
    const conversation = page.items.find((item) => item.id === conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not visible to ${user.email}`);
    return conversation.unreadCount;
  }

  it('denies the anon key and signed-in users; the server route still marks the conversation read', async () => {
    const { primary, secondary, directConversationId: conversationId } = world;
    await insertUnreadMessages(conversationId, primary, 4);
    expect(await unreadCount(secondary, conversationId)).toBe(4);
    const before = await readState(secondary, conversationId);

    // Attack: public anon key, no session, targeting another user's conversation.
    const anon = createClient(MESSAGING_API_URL, MESSAGING_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const asAnon = await anon.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: secondary.appUserId,
    });
    expect(asAnon.error?.code).toBe('42501');

    // A signed-in member calling it for themselves is denied too: the caller
    // is a legitimate member, so 42501 can only be the EXECUTE denial.
    const asMember = await secondary.client.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
      p_user_id: secondary.appUserId,
    });
    expect(asMember.error?.code).toBe('42501');

    expect(await readState(secondary, conversationId)).toEqual(before);
    expect(await unreadCount(secondary, conversationId)).toBe(4);

    // Published client: PATCH { conversationId, userId } -> legacy mark-all via
    // the service-role repository path.
    const request = new NextRequest('http://localhost/api/conversations/read', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId, userId: secondary.appUserId }),
    });
    const response = await asSession(secondarySession, () => readRoute(request));
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 200,
      body: { success: true },
    });
    expect(await unreadCount(secondary, conversationId)).toBe(0);
    const after = await readState(secondary, conversationId);
    expect(after.lastReadAt !== null && before.lastReadAt !== null && after.lastReadAt > before.lastReadAt).toBe(true);
  });
});
