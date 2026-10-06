// E2E seed recovery (Phase 4 T27, AC-031): a seed that fails partway leaves
// nothing behind, and the pre-run sweep removes only seeded conversations
// whose members are all test accounts. Runs the real MessagingTestSeeder on a
// service-role client against local Supabase, using this file's namespaced
// fixture accounts as the allowlist (never the shared Playwright accounts).
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MessagingTestSeeder, type SeedUserDefinition } from '@/lib/test-utils/messaging-test-seeder';

import {
  MESSAGING_DB_PASSWORD,
  createMessagingWorld,
  type MessagingDbWorld,
} from './fixtures';
import { MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

/**
 * Service-role client whose `failOnCall`-th message insert fails at the
 * transport, as when the database drops mid-seed. Every other request is real.
 */
function seederWithFailingMessageInsert(failOnCall: number): MessagingTestSeeder {
  let messageInserts = 0;
  const faultyFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.pathname === '/rest/v1/messages') {
      messageInserts += 1;
      if (messageInserts === failOnCall) {
        throw new TypeError('fetch failed (injected mid-seed failure)');
      }
    }
    return fetch(input, init);
  };
  return new MessagingTestSeeder(
    createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: faultyFetch },
    }),
  );
}

function serviceSeeder(): MessagingTestSeeder {
  return new MessagingTestSeeder(
    createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
}

describe('messaging E2E seed recovery (local Supabase)', () => {
  let world: MessagingDbWorld;
  let allowedEmails: Set<string>;
  const extraConversationIds: string[] = [];
  /** Seed runs of this file: their rows are removed even if the rollback regresses. */
  const seedRunIds: string[] = [];

  beforeEach(async () => {
    world = await createMessagingWorld({ historyMessageCount: 0 });
    allowedEmails = new Set([world.primary.email, world.secondary.email]);
  });

  afterEach(async () => {
    if (world) {
      for (const runId of seedRunIds.splice(0)) {
        await world.query(`delete from public.conversations where name like '%' || $1`, [runId]);
        await world.query(`delete from public.messages where content like '%' || $1`, [runId]);
        await world.query(`delete from public.spaces where name like '%' || $1`, [runId]);
      }
      // Reusable rooms the seeder created in this world's company (never entered here).
      await world.query(
        `delete from public.spaces where company_id = $1 and name like 'Test Space Fixed %'`,
        [world.companyId],
      );
      if (extraConversationIds.length > 0) {
        await world.query('delete from public.conversations where id = any($1::uuid[])', [
          extraConversationIds.splice(0),
        ]);
      }
    }
    await world?.cleanup();
  });

  it('removes the rows a seed created when it fails partway, keeping a reused direct conversation', async () => {
    const runId = randomUUID();
    seedRunIds.push(runId);
    const users: [SeedUserDefinition, SeedUserDefinition] = [
      { email: world.primary.email, password: MESSAGING_DB_PASSWORD, displayName: 'Msg DB primary', role: 'admin' },
      { email: world.secondary.email, password: MESSAGING_DB_PASSWORD, displayName: 'Msg DB secondary', role: 'member' },
    ];

    // Spaces, room conversations, and the first direct message exist when the
    // second message insert fails.
    await expect(
      seederWithFailingMessageInsert(2).seed({ allowedEmails, users, runId, roomCount: 2 }),
    ).rejects.toThrow(/injected mid-seed failure/);

    // This company had no reusable rooms, so the failed seed created both;
    // its rollback must remove them as well.
    const leftovers = await world.query<{ conversations: string; spaces: string; messages: string }>(
      `select
         (select count(*) from public.conversations where name like '%' || $1) as conversations,
         (select count(*) from public.spaces
           where company_id = $2 and name like 'Test Space Fixed %') as spaces,
         (select count(*) from public.messages where content like '%' || $1) as messages`,
      [runId, world.companyId],
    );
    expect(leftovers[0]).toEqual({ conversations: '0', spaces: '0', messages: '0' });

    // The pre-existing direct conversation the seed reused is not deleted.
    const direct = await world.query<{ id: string }>(
      'select id from public.conversations where id = $1',
      [world.directConversationId],
    );
    expect(direct).toHaveLength(1);
  });

  it('sweeps only seeded conversations whose participants and members are all test accounts', async () => {
    const insertGroup = async (name: string, participants: string[]): Promise<string> => {
      const rows = await world.query<{ id: string }>(
        `insert into public.conversations (type, visibility, participants, name)
         values ('group', 'private', $1::uuid[], $2) returning id`,
        [participants, name],
      );
      extraConversationIds.push(rows[0].id);
      return rows[0].id;
    };
    const { primary, secondary, outsider } = world;

    const leftover = await insertGroup(`Test Group ${randomUUID()}`, [primary.appUserId, secondary.appUserId]);
    await world.query(
      `insert into public.messages (conversation_id, sender_id, content, type, status)
       values ($1, $2, 'leftover message', 'text', 'sent')`,
      [leftover, primary.appUserId],
    );
    const withOutsiderParticipant = await insertGroup(`Test Group ${randomUUID()}`, [
      primary.appUserId,
      outsider.appUserId,
    ]);
    const withOutsiderMember = await insertGroup(`Test Room Conversation 1 ${randomUUID()}`, [
      primary.appUserId,
      secondary.appUserId,
    ]);
    await world.query(
      'insert into public.conversation_members (conversation_id, user_id) values ($1, $2)',
      [withOutsiderMember, outsider.appUserId],
    );
    const unseededName = await insertGroup(`Team chat ${randomUUID()}`, [primary.appUserId, secondary.appUserId]);

    const removed = await serviceSeeder().sweepSeededLeftovers(allowedEmails);

    expect(removed).toEqual([leftover]);
    const remaining = await world.query<{ id: string }>(
      'select id from public.conversations where id = any($1::uuid[])',
      [[leftover, withOutsiderParticipant, withOutsiderMember, unseededName, world.directConversationId]],
    );
    expect(new Set(remaining.map((row) => row.id))).toEqual(
      new Set([withOutsiderParticipant, withOutsiderMember, unseededName, world.directConversationId]),
    );
    const messages = await world.query<{ count: string }>(
      'select count(*) from public.messages where conversation_id = $1',
      [leftover],
    );
    expect(messages[0].count).toBe('0');
  });

  // T28: rooms a test entered stay referenced by presence history, so seeds
  // reuse the company's rooms instead of creating new ones every run.
  it('reuses the company rooms across seeds and replaces only test-account room conversations', async () => {
    const users: [SeedUserDefinition, SeedUserDefinition] = [
      { email: world.primary.email, password: MESSAGING_DB_PASSWORD, displayName: 'Msg DB primary', role: 'admin' },
      { email: world.secondary.email, password: MESSAGING_DB_PASSWORD, displayName: 'Msg DB secondary', role: 'member' },
    ];
    const seedRun = async () => {
      const runId = randomUUID();
      seedRunIds.push(runId);
      return serviceSeeder().seed({ allowedEmails, users, runId, roomCount: 2 });
    };
    const reusableRooms = async () =>
      world.query<{ id: string; name: string }>(
        `select id, name from public.spaces
          where company_id = $1 and name like 'Test Space %' order by name`,
        [world.companyId],
      );

    const first = await seedRun();
    const second = await seedRun();

    expect(first.spaces.map((space) => space.name)).toEqual(['Test Space Fixed 1', 'Test Space Fixed 2']);
    expect(second.spaces.map((space) => space.id)).toEqual(first.spaces.map((space) => space.id));
    expect(await reusableRooms()).toEqual(
      first.spaces.map((space) => ({ id: space.id, name: space.name })),
    );

    // The first run's room conversations (test accounts only) were replaced.
    const roomConversations = await world.query<{ id: string; room_id: string }>(
      `select id, room_id from public.conversations
        where type = 'room' and room_id = any($1::uuid[])`,
      [first.spaces.map((space) => space.id)],
    );
    expect(new Set(roomConversations.map((row) => row.id))).toEqual(new Set(second.conversations.roomIds));
    expect(second.conversations.roomIds.some((id) => first.conversations.roomIds.includes(id))).toBe(false);

    // A room conversation with a member outside the test accounts fails the
    // next seed and is left untouched, with every other room conversation.
    const sharedRoom = second.conversations.roomIds[0];
    await world.query(
      'insert into public.conversation_members (conversation_id, user_id) values ($1, $2)',
      [sharedRoom, world.outsider.appUserId],
    );
    await expect(seedRun()).rejects.toThrow(/non-test account/);

    const afterRefusal = await world.query<{ id: string }>(
      `select id from public.conversations where type = 'room' and room_id = any($1::uuid[])`,
      [first.spaces.map((space) => space.id)],
    );
    expect(new Set(afterRefusal.map((row) => row.id))).toEqual(new Set(second.conversations.roomIds));
    expect(await reusableRooms()).toHaveLength(2);
  });
});
