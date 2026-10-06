import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PATCH as readRoute } from '@/app/api/conversations/read/route';
import { POST as starRoute } from '@/app/api/messages/[messageId]/star/route';
import { GET as starredRoute } from '@/app/api/messages/starred/route';
import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';

import { MESSAGE_PAGE_SIZE, createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface StarredMessageJson {
  id: string;
  conversationId: string;
  senderId: string;
  readCount?: number;
  stars?: { messageId: string; userId: string; conversationId: string }[];
}

interface StarredPageJson {
  messages: StarredMessageJson[];
  nextCursorBefore?: string;
  hasMoreOlder: boolean;
}

// Phase 4 T9 (FR-021, BR-009, AC-024, AC-035): the caller's starred messages
// of one conversation through the real GET /api/messages/starred handler with
// real local sessions — newest MESSAGE first, keyset-paginated, own stars only,
// members only.
describe('starred messages of a conversation (local Supabase)', () => {
  let world: MessagingDbWorld;
  let third: MessagingDbUser;
  const sessions = new Map<string, SessionCookie[]>();

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: MESSAGE_PAGE_SIZE + 5, withGroupThirdMember: true });
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

  async function getStarred(user: MessagingDbUser | null, query: Record<string, string>) {
    const request = new NextRequest(`http://localhost/api/messages/starred?${new URLSearchParams(query)}`);
    const response = await asSession(cookiesFor(user), () => starredRoute(request));
    return { status: response.status, body: (await response.json()) as StarredPageJson & { code?: string } };
  }

  /** Follows nextCursorBefore until the last page; returns every page. */
  async function getAllPages(user: MessagingDbUser, conversationId: string, limit: number) {
    const pages: StarredPageJson[] = [];
    let cursorBefore: string | undefined;
    do {
      const query: Record<string, string> = { conversationId, limit: String(limit) };
      if (cursorBefore) query.cursorBefore = cursorBefore;
      const { status, body } = await getStarred(user, query);
      expect(status).toBe(200);
      pages.push(body);
      cursorBefore = body.nextCursorBefore;
      expect(pages.length).toBeLessThan(20);
    } while (cursorBefore);
    return pages;
  }

  async function star(user: MessagingDbUser, messageId: string) {
    const request = new NextRequest(`http://localhost/api/messages/${messageId}/star`, { method: 'POST' });
    const response = await asSession(cookiesFor(user), () =>
      starRoute(request, { params: Promise.resolve({ messageId }) }),
    );
    expect(response.status).toBe(201);
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

  it('lists only the caller\'s stars in that conversation, newest message first, across pages', async () => {
    const { primary, secondary, groupConversationId: conversationId, historyMessageIds: history } = world;
    // History is oldest first; odd indexes were sent by primary, even by secondary.
    // Star in an order unrelated to message date, ending with the OLDEST
    // message, so star-time order would put it first.
    for (const index of [24, 3, 17, 10, 21, 5, 0]) {
      await star(primary, history[index]);
    }
    await star(secondary, history[22]);
    await star(secondary, history[4]);
    await star(third, history[24]);
    // A star in another conversation never leaks into this one.
    const [directMessage] = await world.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, content, type, status)
       values ($1, $2, 'T9 direct', 'text', 'sent') returning id`,
      [world.directConversationId, secondary.appUserId],
    );
    await star(primary, directMessage.id);
    // Receipts: secondary read primary's history[21] (readCount is sender-only).
    await markRead(secondary, conversationId, [history[21], history[10]]);

    // history[0] is older than the first feed page the drawer loads.
    const feedPage = await new SupabaseMessageRepository(primary.client).findByConversation(conversationId, {
      limit: MESSAGE_PAGE_SIZE,
    });
    expect(feedPage.items.map((message) => message.id)).not.toContain(history[0]);

    const pages = await getAllPages(primary, conversationId, 3);
    expect(pages.map((page) => page.messages.length)).toEqual([3, 3, 1]);
    expect(pages.map((page) => page.hasMoreOlder)).toEqual([true, true, false]);
    expect(pages[2].nextCursorBefore).toBeUndefined();

    const listed = pages.flatMap((page) => page.messages);
    expect(listed.map((message) => message.id)).toEqual([24, 21, 17, 10, 5, 3, 0].map((index) => history[index]));
    for (const message of listed) {
      expect(message.conversationId).toBe(conversationId);
      // Star state for the caller only (third's star on history[24] is hidden).
      expect(message.stars).toEqual([
        expect.objectContaining({ messageId: message.id, userId: primary.appUserId, conversationId }),
      ]);
    }
    const byId = new Map(listed.map((message) => [message.id, message]));
    expect(byId.get(history[21])?.readCount).toBe(1);
    expect(byId.get(history[10])).not.toHaveProperty('readCount');

    // Default page size returns everything in one page; secondary sees only theirs.
    const single = await getStarred(primary, { conversationId });
    expect(single.status).toBe(200);
    expect(single.body.messages.map((message) => message.id)).toEqual(listed.map((message) => message.id));
    expect(single.body.hasMoreOlder).toBe(false);

    const secondaryPage = await getStarred(secondary, { conversationId });
    expect(secondaryPage.body.messages.map((message) => message.id)).toEqual([history[22], history[4]]);
    expect(secondaryPage.body.messages.every((message) => message.stars?.length === 1 &&
      message.stars[0].userId === secondary.appUserId)).toBe(true);

    const direct = await getStarred(primary, { conversationId: world.directConversationId });
    expect(direct.body.messages.map((message) => message.id)).toEqual([directMessage.id]);
  });

  it('paginates messages with identical timestamps without gaps or duplicates', async () => {
    const { primary, roomConversationId: conversationId } = world;
    const rows = await world.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, content, type, status, timestamp)
       select $1, $2, 'T9 tie ' || n, 'text', 'sent', '2026-01-01T10:00:00.123456+00'::timestamptz
       from generate_series(1, 5) as n
       returning id`,
      [conversationId, primary.appUserId],
    );
    for (const { id } of rows) {
      await star(primary, id);
    }

    const pages = await getAllPages(primary, conversationId, 2);
    expect(pages.map((page) => page.messages.length)).toEqual([2, 2, 1]);
    const ids = pages.flatMap((page) => page.messages.map((message) => message.id));
    // Ties break by id, descending.
    expect(ids).toEqual(rows.map((row) => row.id).sort().reverse());
  });

  it('denies non-members, removed members, and anonymous callers; rejects invalid input', async () => {
    const { primary, outsider, groupConversationId: conversationId, historyMessageIds: history } = world;
    await star(third, history[12]);
    expect((await getStarred(third, { conversationId })).status).toBe(200);

    const nonMember = await getStarred(outsider, { conversationId });
    expect(nonMember.status).toBe(403);
    expect(nonMember.body).toMatchObject({ code: 'NOT_PARTICIPANT' });
    expect(nonMember.body).not.toHaveProperty('messages');

    // A member removed from the conversation (membership authority is
    // conversation_members; there is no product removal path yet) keeps their
    // star rows but can no longer list them.
    await world.query(`delete from public.conversation_members where conversation_id = $1 and user_id = $2`, [
      conversationId,
      third.appUserId,
    ]);
    const [stars] = await world.query<{ n: string }>(
      `select count(*)::text as n from public.starred_messages where conversation_id = $1 and user_id = $2`,
      [conversationId, third.appUserId],
    );
    expect(Number(stars.n)).toBeGreaterThan(0);
    const removed = await getStarred(third, { conversationId });
    expect(removed.status).toBe(403);
    expect(removed.body).not.toHaveProperty('messages');

    expect((await getStarred(null, { conversationId })).status).toBe(401);
    expect((await getStarred(primary, { conversationId: 'not-a-uuid' })).status).toBe(400);
    expect((await getStarred(primary, {})).status).toBe(400);
    expect((await getStarred(primary, { conversationId, limit: '0' })).status).toBe(400);
    expect((await getStarred(primary, { conversationId, limit: '51' })).status).toBe(400);
    expect((await getStarred(primary, { conversationId, cursorBefore: 'garbage' })).status).toBe(400);
    expect(
      (await getStarred(primary, {
        conversationId,
        cursorBefore: `2026-01-01T00:00:00Z",id.gt."0|${globalThis.crypto.randomUUID()}`,
      })).status,
    ).toBe(400);
    expect((await getStarred(primary, { conversationId: globalThis.crypto.randomUUID() })).status).toBe(404);
  });
});
