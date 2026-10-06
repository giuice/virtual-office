import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseMessageRepository } from '@/repositories/implementations/supabase';

import { MESSAGE_PAGE_SIZE, createMessagingWorld, type MessagingDbWorld } from './fixtures';

const HISTORY_COUNT = MESSAGE_PAGE_SIZE + 5;

// Real read path used by GET /api/messages/get: SupabaseMessageRepository on a
// user-scoped client, against local PostgREST + RLS (no mocks).
describe('messaging history under RLS (local Supabase)', () => {
  let world: MessagingDbWorld;

  beforeAll(async () => {
    world = await createMessagingWorld({ historyMessageCount: HISTORY_COUNT });
  });

  afterAll(async () => {
    await world?.cleanup();
  });

  it('shows both members their direct, group, and room conversations', async () => {
    for (const member of [world.primary, world.secondary]) {
      const { data, error } = await member.client
        .from('conversations')
        .select('id, type')
        .in('id', [world.directConversationId, world.groupConversationId, world.roomConversationId]);

      expect(error).toBeNull();
      expect(new Set(data?.map((row) => row.type))).toEqual(new Set(['direct', 'group', 'room']));
    }
  });

  it('pages a member through history older than one page', async () => {
    const repository = new SupabaseMessageRepository(world.secondary.client);

    const firstPage = await repository.findByConversation(world.groupConversationId, {
      limit: MESSAGE_PAGE_SIZE,
    });
    expect(firstPage.items.map((message) => message.id)).toEqual(
      world.historyMessageIds.slice(-MESSAGE_PAGE_SIZE),
    );
    expect(firstPage.hasMore).toBe(true);
    expect(typeof firstPage.nextCursor).toBe('string');

    const olderPage = await repository.findByConversation(world.groupConversationId, {
      limit: MESSAGE_PAGE_SIZE,
      cursorBefore: firstPage.nextCursor as string,
    });
    expect(olderPage.items.map((message) => message.id)).toEqual(
      world.historyMessageIds.slice(0, HISTORY_COUNT - MESSAGE_PAGE_SIZE),
    );
    expect(olderPage.hasMore).toBe(false);
  });

  it('hides the conversations and their messages from a non-member', async () => {
    const { data: conversations, error } = await world.outsider.client
      .from('conversations')
      .select('id')
      .in('id', [world.directConversationId, world.groupConversationId, world.roomConversationId]);
    expect(error).toBeNull();
    expect(conversations).toEqual([]);

    const page = await new SupabaseMessageRepository(world.outsider.client).findByConversation(
      world.groupConversationId,
      { limit: MESSAGE_PAGE_SIZE },
    );
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});
