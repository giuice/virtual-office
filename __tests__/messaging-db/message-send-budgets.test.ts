import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as createRoute } from '@/app/api/messages/create/route';
import { POST as fenceRoute } from '@/app/api/messages/fence/route';
import { POST as reactRoute } from '@/app/api/messages/react/route';
import { POST as uploadRoute } from '@/app/api/messages/upload/route';
import { ATTACHMENTS_BUCKET } from '@/lib/messaging/attachment-policy';

import { createMessagingWorld, type MessagingDbUser, type MessagingDbWorld } from './fixtures';
import { asSession, signInSessionCookies, useLocalSupabaseEnv, type SessionCookie } from './route-session';
import { MESSAGING_ANON_KEY, MESSAGING_API_URL, MESSAGING_DB_URL, MESSAGING_SERVICE_ROLE_KEY } from './setup';

vi.mock('next/headers', async () => (await import('./route-session')).nextHeadersMock);

interface RouteBody {
  message?: { id: string; attachments?: { id: string }[] } | null;
  outcome?: 'stored' | 'not_stored';
  attachment?: { id: string };
  code?: string;
  error?: string;
}

interface RouteResult {
  status: number;
  body: RouteBody;
}

type RouteHandler = (request: NextRequest) => Promise<Response>;

type BudgetAction = 'message:create' | 'message:create-request' | 'message:fence';

// Budgets of src/lib/auth/rate-limit.ts (all 60-second fixed windows).
const INSERTION_QUOTA = 30;
const REQUEST_BUDGET = 60;
const FENCE_BUDGET = 90;
const WINDOW_SECONDS = 60;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8]);

// SQL that makes the limiter fail for real, and restores it.
const REVOKE_LIMITER = 'revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from service_role';
const RESTORE_LIMITER = 'grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role';
const BREAK_INSERTION_COUNTER = `alter table private.rate_limit_counters
  add constraint t3_test_insertion_counter_unavailable check (action <> 'message:create') not valid`;
const RESTORE_INSERTION_COUNTER =
  'alter table private.rate_limit_counters drop constraint if exists t3_test_insertion_counter_unavailable';
const CREATE_ATTEMPT_FN =
  'public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)';
const FENCE_ATTEMPT_FN = 'public.fence_message_attempt(uuid, uuid, uuid, bigint)';
// Infrastructure (grant) failures, and their restoration.
const GRANT_FAILURES = {
  createFunction: [`revoke execute on function ${CREATE_ATTEMPT_FN} from service_role`, `grant execute on function ${CREATE_ATTEMPT_FN} to service_role`],
  fenceFunction: [`revoke execute on function ${FENCE_ATTEMPT_FN} from service_role`, `grant execute on function ${FENCE_ATTEMPT_FN} to service_role`],
  messageRows: [
    'revoke select on table public.messages from service_role',
    'grant select on table public.messages to service_role',
  ],
  attemptTable: [
    'revoke update on table private.message_send_attempts from service_role',
    'grant update on table private.message_send_attempts to service_role',
  ],
} as const;

// Phase 5 T3 (FR-008, AC-009, AC-035): message send budgets on the real
// POST /api/messages/create and POST /api/messages/fence handlers, real local
// sessions, the real check_rate_limit counter, and the insertion quota charged
// inside public.create_message_attempt's transaction on the local database.
describe('message send budgets (local Supabase)', () => {
  let world: MessagingDbWorld;
  let admin: SupabaseClient;
  const sessions = new Map<string, SessionCookie[]>();

  async function restoreLimiter(): Promise<void> {
    await world.query(RESTORE_LIMITER);
    await world.query(RESTORE_INSERTION_COUNTER);
    for (const [, restore] of Object.values(GRANT_FAILURES)) {
      await world.query(restore);
    }
  }

  beforeAll(async () => {
    useLocalSupabaseEnv();
    world = await createMessagingWorld({ historyMessageCount: 0 });
    // A previous run killed mid-test must not leave the limiter broken.
    await restoreLimiter();
    admin = createClient(MESSAGING_API_URL, MESSAGING_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const user of [world.primary, world.secondary, world.outsider]) {
      sessions.set(user.appUserId, await signInSessionCookies(user.email));
    }
  });

  beforeEach(async () => {
    await resetCounters();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
      await restoreLimiter();
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

  function worldUserIds(): string[] {
    return [world.primary.appUserId, world.secondary.appUserId, world.outsider.appUserId];
  }

  async function resetCounters(): Promise<void> {
    await world.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [worldUserIds()]);
  }

  /**
   * Fixed windows: wait for the next window when fewer than `seconds` remain
   * in the current one, so a test's charges and fills share one window.
   */
  async function ensureWindowHeadroom(seconds = 25): Promise<void> {
    const [{ remaining }] = await world.query<{ remaining: string }>(
      `select ($1::numeric - (extract(epoch from clock_timestamp())::numeric % $1::numeric))::text as remaining`,
      [WINDOW_SECONDS],
    );
    const left = Number(remaining);
    if (left < seconds) {
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(left * 1000) + 250));
    }
    await resetCounters();
  }

  /** Sets the user's counter for the current window (as if `count` charges were made). */
  async function fill(user: MessagingDbUser, action: BudgetAction, count: number): Promise<void> {
    await world.query(
      `insert into private.rate_limit_counters (user_id, action, window_start, count)
       values ($1, $2, to_timestamp(floor(extract(epoch from now()) / $3) * $3), $4)
       on conflict (user_id, action, window_start) do update set count = excluded.count`,
      [user.appUserId, action, WINDOW_SECONDS, count],
    );
  }

  async function counter(user: MessagingDbUser, action: BudgetAction): Promise<number> {
    const [{ total }] = await world.query<{ total: string }>(
      `select coalesce(sum(count), 0)::text as total from private.rate_limit_counters
       where user_id = $1 and action = $2`,
      [user.appUserId, action],
    );
    return Number(total);
  }

  async function allCounters(): Promise<number> {
    const [{ total }] = await world.query<{ total: string }>(
      `select coalesce(sum(count), 0)::text as total from private.rate_limit_counters where user_id = any($1::uuid[])`,
      [worldUserIds()],
    );
    return Number(total);
  }

  function cookiesOf(user: MessagingDbUser | null): SessionCookie[] {
    return user ? (sessions.get(user.appUserId) ?? []) : [];
  }

  function jsonRequest(path: string, body: unknown): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  async function call(route: RouteHandler, user: MessagingDbUser | null, request: NextRequest): Promise<RouteResult> {
    return asSession(cookiesOf(user), async () => {
      const response = await route(request);
      return { status: response.status, body: (await response.json()) as RouteBody };
    });
  }

  /** `body` as a string is sent verbatim (malformed JSON). */
  function postCreate(user: MessagingDbUser | null, body: Record<string, unknown> | string) {
    return call(createRoute, user, jsonRequest('/api/messages/create', body));
  }

  function postFence(user: MessagingDbUser | null, body: Record<string, unknown> | string) {
    return call(fenceRoute, user, jsonRequest('/api/messages/fence', body));
  }

  function attempt(user: MessagingDbUser, clientMessageId: string, attemptGeneration: number) {
    return { clientMessageId, attemptGeneration, expectedSenderId: user.appUserId };
  }

  async function upload(user: MessagingDbUser, conversationId: string): Promise<string> {
    const form = new FormData();
    form.append('file', new File([PNG_BYTES], `t3-${randomUUID()}.png`, { type: 'image/png' }));
    form.append('conversationId', conversationId);
    const result = await call(uploadRoute, user, new NextRequest('http://localhost/api/messages/upload', { method: 'POST', body: form }));
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body.attachment?.id as string;
  }

  async function keyRows(sender: MessagingDbUser, conversationId: string, clientMessageId: string) {
    return world.query<{ id: string }>(
      `select id from public.messages where sender_id = $1 and conversation_id = $2 and client_message_id = $3`,
      [sender.appUserId, conversationId, clientMessageId],
    );
  }

  async function contentRows(conversationId: string, content: string) {
    return world.query<{ id: string }>('select id from public.messages where conversation_id = $1 and content = $2', [
      conversationId,
      content,
    ]);
  }

  async function attemptRows(sender: MessagingDbUser, conversationId: string, clientMessageId: string) {
    return world.query<{ fence_generation: string | null; committed_at: Date | null }>(
      `select fence_generation::text as fence_generation, committed_at from private.message_send_attempts
       where sender_id = $1 and conversation_id = $2 and client_message_id = $3`,
      [sender.appUserId, conversationId, clientMessageId],
    );
  }

  async function pendingUpload(uploadId: string): Promise<boolean> {
    const rows = await world.query('select 1 from public.message_attachment_uploads where id = $1', [uploadId]);
    return rows.length === 1;
  }

  async function insertRawMessage(user: MessagingDbUser, conversationId: string, content: string): Promise<string> {
    const rows = await world.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, content, type, status)
       values ($1, $2, $3, 'text', 'sent') returning id`,
      [conversationId, user.appUserId, content],
    );
    return rows[0].id;
  }

  /**
   * Holds FOR UPDATE on a message row from a separate connection: an insert
   * replying to it blocks in its reply_to_id foreign-key check (FOR KEY SHARE)
   * until the holder rolls back, or deletes the row and commits.
   */
  async function lockMessageRow(messageId: string) {
    const holder = new Client({ connectionString: MESSAGING_DB_URL });
    await holder.connect();
    await holder.query('begin');
    await holder.query('select id from public.messages where id = $1 for update', [messageId]);
    const pid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
    let released = false;
    const finish = async (sql: string[]) => {
      if (released) return;
      released = true;
      for (const statement of sql) await holder.query(statement).catch(() => undefined);
      await holder.end();
    };
    return {
      pid,
      release: () => finish(['rollback']),
      deleteAndCommit: () => finish([`delete from public.messages where id = '${messageId}'`, 'commit']),
    };
  }

  /**
   * Waits until a backend is blocked by the holder (the holder's pid is in its
   * pg_blocking_pids). With `waiterPid` (captured before dispatch) only that
   * backend counts; otherwise exactly one backend must be blocked by the
   * holder (the holder's lock is private to the test). Returns the waiter pid.
   */
  async function waitForBlockedBy(holderPid: number, waiterPid?: number): Promise<number> {
    let waiter = 0;
    await expect
      .poll(
        async () => {
          const rows = await world.query<{ pid: number }>(
            `select pid from pg_catalog.pg_stat_activity
             where $1::int = any (pg_catalog.pg_blocking_pids(pid))
               and ($2::int is null or pid = $2::int)`,
            [holderPid, waiterPid ?? null],
          );
          waiter = rows.length === 1 ? rows[0].pid : 0;
          return rows.length;
        },
        { timeout: 10_000, interval: 50 },
      )
      .toBe(1);
    return waiter;
  }

  /** Database clock position in fixed windows of `seconds`. */
  async function windowPosition(seconds: number): Promise<{ index: number; offset: number }> {
    const [row] = await world.query<{ index: string; offset: string }>(
      `select floor(extract(epoch from clock_timestamp()) / $1)::text as index,
              (extract(epoch from clock_timestamp())::numeric % $1::numeric)::text as offset`,
      [seconds],
    );
    return { index: Number(row.index), offset: Number(row.offset) };
  }

  /** Waits for the start of a window (later than window `after` when given); returns its index. */
  async function waitForWindowStart(seconds: number, maxOffset: number, after = -1): Promise<number> {
    for (;;) {
      const { index, offset } = await windowPosition(seconds);
      if (index > after && offset >= 0.1 && offset <= maxOffset) return index;
      await new Promise((resolve) => setTimeout(resolve, Math.max(50, Math.ceil((seconds - offset + 0.15) * 1000))));
    }
  }

  async function withGrantFailure<T>(failure: keyof typeof GRANT_FAILURES, fn: () => Promise<T>): Promise<T> {
    const [revoke, restore] = GRANT_FAILURES[failure];
    await world.query(revoke);
    try {
      return await fn();
    } finally {
      await world.query(restore);
    }
  }

  function expectRateLimited(result: RouteResult): void {
    expect(result.status, JSON.stringify(result.body)).toBe(429);
    expect(result.body.code).toBe('rate_limited');
  }

  it('a replay of an already-stored message does not reduce the insertion quota', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    const legacyKey = randomUUID();
    const attemptKey = randomUUID();
    const legacy = { conversationId, content: `T3 replay legacy ${legacyKey}`, clientMessageId: legacyKey };
    const current = { conversationId, content: `T3 replay attempt ${attemptKey}`, ...attempt(primary, attemptKey, 1) };

    expect((await postCreate(primary, legacy)).status).toBe(201);
    expect((await postCreate(primary, current)).status).toBe(201);
    expect(await counter(primary, 'message:create')).toBe(2);

    for (let index = 0; index < 3; index += 1) {
      expect((await postCreate(primary, legacy)).status).toBe(200);
      expect((await postCreate(primary, current)).status).toBe(200);
    }
    expect(await counter(primary, 'message:create')).toBe(2);
    expect(await counter(primary, 'message:create-request')).toBe(8);

    // With the insertion quota exhausted, replays still answer the stored
    // message; new insertions (keyed or not) are refused and store nothing.
    await fill(primary, 'message:create', INSERTION_QUOTA);
    expect((await postCreate(primary, legacy)).status).toBe(200);
    const replay = await postCreate(primary, current);
    expect(replay.status).toBe(200);
    expect(replay.body.message?.id).toBeDefined();

    const freshKey = randomUUID();
    expectRateLimited(await postCreate(primary, { conversationId, content: `T3 refused ${freshKey}`, clientMessageId: freshKey }));
    expect(await keyRows(primary, conversationId, freshKey)).toHaveLength(0);
    expect(await attemptRows(primary, conversationId, freshKey)).toHaveLength(0);
    const unkeyed = `T3 refused unkeyed ${randomUUID()}`;
    expectRateLimited(await postCreate(primary, { conversationId, content: unkeyed }));
    expect(await contentRows(conversationId, unkeyed)).toHaveLength(0);
    expect(await keyRows(primary, conversationId, legacyKey)).toHaveLength(1);
    expect(await keyRows(primary, conversationId, attemptKey)).toHaveLength(1);
  });

  it('every authenticated create request consumes the request budget: malformed, invalid, replays and quota losers', async () => {
    await ensureWindowHeadroom();
    const { primary, secondary, directConversationId: conversationId } = world;
    const key = randomUUID();
    const valid = { conversationId, content: `T3 budget ${key}`, clientMessageId: key };

    const charged: [string, Record<string, unknown> | string, number][] = [
      ['malformed JSON', '{"conversationId":', 400],
      ['array body', '[]', 400],
      ['missing content', { conversationId }, 400],
      ['invalid conversation id', { conversationId: 'nope', content: 'x' }, 400],
      ['content too large', { conversationId, content: 'x'.repeat(8193) }, 413],
      ['invalid key', { conversationId, content: 'x', clientMessageId: 'nope' }, 400],
      ['generation without expected sender', { conversationId, content: 'x', clientMessageId: randomUUID(), attemptGeneration: 1 }, 400],
      ['sender mismatch', { conversationId, content: 'x', ...attempt(secondary, randomUUID(), 1) }, 403],
      ['missing conversation', { conversationId: randomUUID(), content: 'x' }, 403],
      ['new keyed create', valid, 201],
      ['replay', valid, 200],
    ];
    for (const [label, body, status] of charged) {
      expect((await postCreate(primary, body)).status, label).toBe(status);
    }
    await fill(primary, 'message:create', INSERTION_QUOTA);
    const loserKey = randomUUID();
    expectRateLimited(await postCreate(primary, { conversationId, content: `T3 loser ${loserKey}`, clientMessageId: loserKey }));
    expect(await counter(primary, 'message:create-request')).toBe(charged.length + 1);

    // Unauthenticated requests are refused without charging anyone.
    const before = await allCounters();
    expect((await postCreate(null, '{"conversationId":')).status).toBe(401);
    expect((await postCreate(null, valid)).status).toBe(401);
    expect(await allCounters()).toBe(before);

    // Exhausted: every create request is refused before anything else.
    await resetCounters();
    await fill(primary, 'message:create-request', REQUEST_BUDGET);
    expectRateLimited(await postCreate(primary, '{"conversationId":'));
    expectRateLimited(await postCreate(primary, { conversationId }));
    expectRateLimited(await postCreate(primary, valid));
    const blockedKey = randomUUID();
    expectRateLimited(await postCreate(primary, { conversationId, content: `T3 blocked ${blockedKey}`, ...attempt(primary, blockedKey, 1) }));
    expect(await keyRows(primary, conversationId, blockedKey)).toHaveLength(0);
    expect(await attemptRows(primary, conversationId, blockedKey)).toHaveLength(0);
    expect(await counter(primary, 'message:create')).toBe(0);
    expect(await counter(primary, 'message:fence')).toBe(0);

    // Budgets are per user.
    const otherKey = randomUUID();
    expect((await postCreate(secondary, { conversationId, content: `T3 other ${otherKey}`, clientMessageId: otherKey })).status).toBe(201);
  });

  it('request-budget charges survive refused insertions, which never charge the insertion quota', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;

    // A generation-less keyed create rolled back by the commit-time fence check.
    const fencedKey = randomUUID();
    expect((await postFence(primary, { conversationId, ...attempt(primary, fencedKey, 1) })).body.outcome).toBe('not_stored');
    const fenced = await postCreate(primary, { conversationId, content: `T3 fenced ${fencedKey}`, clientMessageId: fencedKey });
    expect(fenced.status).toBe(409);
    expect(fenced.body.code).toBe('ATTEMPT_SUPERSEDED');

    // A keyed attachment create rolled back by the database (upload unknown).
    const missingKey = randomUUID();
    const missing = await postCreate(primary, { conversationId, content: '', clientMessageId: missingKey, attachmentIds: [randomUUID()] });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('ATTACHMENT_NOT_FOUND');

    expect(await counter(primary, 'message:create-request')).toBe(2);
    expect(await counter(primary, 'message:create')).toBe(0);

    // A quota loser: the insertion and its own quota increment roll back; the
    // request-budget charge stays; the uploads stay pending.
    const uploadId = await upload(primary, conversationId);
    await fill(primary, 'message:create', INSERTION_QUOTA);
    const loserKey = randomUUID();
    const loserBody = { conversationId, content: `T3 loser ${loserKey}`, ...attempt(primary, loserKey, 1), attachmentIds: [uploadId] };
    expectRateLimited(await postCreate(primary, loserBody));
    expect(await counter(primary, 'message:create')).toBe(INSERTION_QUOTA);
    expect(await counter(primary, 'message:create-request')).toBe(3);
    expect(await keyRows(primary, conversationId, loserKey)).toHaveLength(0);
    expect(await pendingUpload(uploadId)).toBe(true);
    const loserAttempt = await attemptRows(primary, conversationId, loserKey);
    expect(loserAttempt).toHaveLength(1);
    expect(loserAttempt[0].committed_at).toBeNull();

    // Once quota is available again the same attempt commits with its file.
    await fill(primary, 'message:create', 0);
    const retried = await postCreate(primary, loserBody);
    expect(retried.status, JSON.stringify(retried.body)).toBe(201);
    expect(retried.body.message?.attachments?.map((file) => file.id)).toEqual([uploadId]);
    expect(await counter(primary, 'message:create')).toBe(1);
    expect(await counter(primary, 'message:create-request')).toBe(4);
  });

  it('fence and lookup calls are limited by their own budget, which also covers the fence step of creates', async () => {
    await ensureWindowHeadroom();
    const { primary, secondary, directConversationId: conversationId } = world;

    expect((await postFence(primary, { conversationId, ...attempt(primary, randomUUID(), 1) })).status).toBe(200);
    expect((await postFence(primary, '{"conversationId":')).status).toBe(400);
    expect((await postFence(primary, { conversationId, ...attempt(secondary, randomUUID(), 1) })).status).toBe(403);
    expect(await counter(primary, 'message:fence')).toBe(3);
    expect(await counter(primary, 'message:create-request')).toBe(0);

    const stepKey = randomUUID();
    expect((await postCreate(primary, { conversationId, content: `T3 step ${stepKey}`, ...attempt(primary, stepKey, 1) })).status).toBe(201);
    expect(await counter(primary, 'message:fence')).toBe(4);
    const legacyKey = randomUUID();
    expect((await postCreate(primary, { conversationId, content: `T3 no step ${legacyKey}`, clientMessageId: legacyKey })).status).toBe(201);
    expect(await counter(primary, 'message:fence')).toBe(4);

    await fill(primary, 'message:fence', FENCE_BUDGET);
    expectRateLimited(await postFence(primary, { conversationId, ...attempt(primary, stepKey, 2) }));
    expectRateLimited(await postFence(primary, '{"conversationId":'));
    const blockedKey = randomUUID();
    expectRateLimited(await postCreate(primary, { conversationId, content: `T3 fence blocked ${blockedKey}`, ...attempt(primary, blockedKey, 1) }));
    expect(await keyRows(primary, conversationId, blockedKey)).toHaveLength(0);
    expect(await attemptRows(primary, conversationId, blockedKey)).toHaveLength(0);
    // Creates without a fence step are not limited by the fence budget.
    const stillKey = randomUUID();
    expect((await postCreate(primary, { conversationId, content: `T3 still ${stillKey}`, clientMessageId: stillKey })).status).toBe(201);
    expect((await postCreate(primary, { conversationId, content: `T3 unkeyed ${randomUUID()}` })).status).toBe(201);
    // Another user's fence budget is untouched.
    expect((await postFence(secondary, { conversationId, ...attempt(secondary, randomUUID(), 1) })).status).toBe(200);
  });

  it('concurrent requests for one new key charge the insertion quota once', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    const legacyKey = randomUUID();
    const legacy = { conversationId, content: `T3 race legacy ${legacyKey}`, clientMessageId: legacyKey };
    const legacyResults = await Promise.all(Array.from({ length: 8 }, () => postCreate(primary, legacy)));
    expect(legacyResults.map((result) => result.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
    expect(await keyRows(primary, conversationId, legacyKey)).toHaveLength(1);
    expect(await counter(primary, 'message:create')).toBe(1);

    const attemptKey = randomUUID();
    const current = { conversationId, content: `T3 race attempt ${attemptKey}`, ...attempt(primary, attemptKey, 1) };
    const attemptResults = await Promise.all(Array.from({ length: 8 }, () => postCreate(primary, current)));
    expect(attemptResults.map((result) => result.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
    expect(await keyRows(primary, conversationId, attemptKey)).toHaveLength(1);
    expect(await counter(primary, 'message:create')).toBe(2);
    expect(await counter(primary, 'message:create-request')).toBe(16);
  });

  it('concurrent distinct keys at the quota boundary store no more messages than the quota allows', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    const remaining = 3;
    await fill(primary, 'message:create', INSERTION_QUOTA - remaining);
    const keys = Array.from({ length: 10 }, () => randomUUID());
    const results = await Promise.all(
      keys.map((key, index) =>
        postCreate(
          primary,
          index % 2 === 0
            ? { conversationId, content: `T3 boundary ${key}`, clientMessageId: key }
            : { conversationId, content: `T3 boundary ${key}`, ...attempt(primary, key, 1) },
        ),
      ),
    );
    const statuses = results.map((result) => result.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(remaining);
    expect(statuses.filter((status) => status === 429)).toHaveLength(keys.length - remaining);
    const [{ stored }] = await world.query<{ stored: string }>(
      `select count(*)::text as stored from public.messages
       where sender_id = $1 and conversation_id = $2 and client_message_id = any($3::uuid[])`,
      [primary.appUserId, conversationId, keys],
    );
    expect(Number(stored)).toBe(remaining);
    expect(await counter(primary, 'message:create')).toBe(INSERTION_QUOTA);
  });

  it('a limiter that cannot be checked refuses creates and fences with 429; other actions keep failing open', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    const target = await postCreate(primary, { conversationId, content: `T3 react target ${randomUUID()}` });
    expect(target.status).toBe(201);

    const keyed = randomUUID();
    const unkeyed = `T3 no limiter ${randomUUID()}`;
    await world.query(REVOKE_LIMITER);
    try {
      expectRateLimited(await postCreate(primary, { conversationId, content: `T3 no limiter ${keyed}`, ...attempt(primary, keyed, 1) }));
      expectRateLimited(await postCreate(primary, { conversationId, content: unkeyed }));
      expectRateLimited(await postCreate(primary, '{"conversationId":'));
      expectRateLimited(await postFence(primary, { conversationId, ...attempt(primary, keyed, 2) }));
      // Unchanged fail-open action (message:react).
      const react = await call(reactRoute, primary, jsonRequest('/api/messages/react', { messageId: target.body.message?.id, emoji: '👍' }));
      expect(react.status, JSON.stringify(react.body)).toBe(200);
    } finally {
      await world.query(RESTORE_LIMITER);
    }
    expect(await keyRows(primary, conversationId, keyed)).toHaveLength(0);
    expect(await attemptRows(primary, conversationId, keyed)).toHaveLength(0);
    expect(await contentRows(conversationId, unkeyed)).toHaveLength(0);

    expect((await postCreate(primary, { conversationId, content: `T3 limiter back ${keyed}`, ...attempt(primary, keyed, 1) })).status).toBe(201);
  });

  it('an insertion quota that cannot be charged in the insertion transaction stores nothing (429); replays still answer', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    const storedKey = randomUUID();
    const stored = { conversationId, content: `T3 stored ${storedKey}`, ...attempt(primary, storedKey, 1) };
    expect((await postCreate(primary, stored)).status).toBe(201);
    const uploadId = await upload(primary, conversationId);

    const legacyKey = randomUUID();
    const attemptKey = randomUUID();
    const unkeyed = `T3 counter down ${randomUUID()}`;
    await world.query(BREAK_INSERTION_COUNTER);
    try {
      expectRateLimited(await postCreate(primary, { conversationId, content: `T3 down ${legacyKey}`, clientMessageId: legacyKey }));
      expectRateLimited(
        await postCreate(primary, { conversationId, content: '', ...attempt(primary, attemptKey, 1), attachmentIds: [uploadId] }),
      );
      expectRateLimited(await postCreate(primary, { conversationId, content: unkeyed }));
      expect((await postCreate(primary, stored)).status).toBe(200);

      const direct = await admin.rpc('create_message_attempt', {
        p_conversation_id: conversationId,
        p_sender_id: primary.appUserId,
        p_content: `T3 direct ${randomUUID()}`,
        p_type: 'text',
        p_reply_to_id: null,
        p_client_message_id: randomUUID(),
        p_attempt_generation: null,
        p_composition: null,
        p_upload_ids: [],
        p_insert_quota_limit: INSERTION_QUOTA,
        p_insert_quota_window_seconds: WINDOW_SECONDS,
      });
      expect(direct.error?.message).toBe('RATE_LIMIT_UNAVAILABLE');
    } finally {
      await world.query(RESTORE_INSERTION_COUNTER);
    }
    expect(await keyRows(primary, conversationId, legacyKey)).toHaveLength(0);
    expect(await keyRows(primary, conversationId, attemptKey)).toHaveLength(0);
    expect(await contentRows(conversationId, unkeyed)).toHaveLength(0);
    expect(await pendingUpload(uploadId)).toBe(true);
  });

  it('legacy paths are not charged at the database, and the quota contract is service-role only', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;

    // Phase 4 server signature: its route charged 'message:create' already.
    const uploadId = await upload(primary, conversationId);
    const legacy = await admin.rpc('create_message_with_attachments', {
      p_conversation_id: conversationId,
      p_sender_id: primary.appUserId,
      p_content: '',
      p_type: 'image',
      p_reply_to_id: null,
      p_client_message_id: randomUUID(),
      p_upload_ids: [uploadId],
    });
    expect(legacy.error).toBeNull();
    expect(legacy.data).toMatchObject({ created: true });
    // Phase 4 server's raw keyed insert (messages_keyed_insert_fence).
    const rawKey = randomUUID();
    await world.query(
      `insert into public.messages (conversation_id, sender_id, content, type, status, client_message_id)
       values ($1, $2, $3, 'text', 'sent', $4)`,
      [conversationId, primary.appUserId, `T3 raw ${rawKey}`, rawKey],
    );
    expect(await counter(primary, 'message:create')).toBe(0);

    const invalid = await admin.rpc('create_message_attempt', {
      p_conversation_id: conversationId,
      p_sender_id: primary.appUserId,
      p_content: 'x',
      p_type: 'text',
      p_reply_to_id: null,
      p_client_message_id: randomUUID(),
      p_attempt_generation: null,
      p_composition: null,
      p_upload_ids: [],
      p_insert_quota_limit: INSERTION_QUOTA,
      p_insert_quota_window_seconds: null,
    });
    expect(invalid.error?.message).toBe('INSERT_QUOTA_INVALID');

    const executable = await world.query<{ role: string; fn: string; allowed: boolean }>(
      `select r.role, f.fn, has_function_privilege(r.role, f.fn, 'execute') as allowed
       from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
       cross join unnest(array[
         'public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[], integer, integer)',
         'public.check_rate_limit(uuid, text, integer, integer)'
       ]) as f(fn)`,
    );
    expect(executable.filter((row) => row.allowed).map((row) => row.role)).toEqual(['service_role', 'service_role']);
    const [{ old }] = await world.query<{ old: string | null }>(
      `select to_regprocedure('public.create_message_attempt(uuid, uuid, text, text, uuid, uuid, bigint, jsonb, uuid[])')::text as old`,
    );
    expect(old).toBeNull();
  });

  it('signed-in members cannot insert messages directly, so no write path bypasses the budgets', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    await fill(primary, 'message:create', INSERTION_QUOTA);
    await fill(primary, 'message:create-request', REQUEST_BUDGET);
    const content = `T3 direct insert ${randomUUID()}`;
    const direct = await primary.client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: primary.appUserId,
      content,
      type: 'text',
      status: 'sent',
    });
    expect(direct.error?.code).toBe('42501');
    const anon = createClient(MESSAGING_API_URL, MESSAGING_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonymous = await anon.from('messages').insert({
      conversation_id: conversationId,
      sender_id: primary.appUserId,
      content,
      type: 'text',
      status: 'sent',
    });
    expect(anonymous.error).not.toBeNull();
    expect(await contentRows(conversationId, content)).toHaveLength(0);
    const [{ can_insert: canInsert }] = await world.query<{ can_insert: boolean }>(
      `select bool_or(has_table_privilege(r, 'public.messages', 'insert')) as can_insert
       from unnest(array['anon', 'authenticated']) as r`,
    );
    expect(canInsert).toBe(false);
  });

  it('a delayed insertion that started before a window rollover cannot reopen an exhausted insertion quota', async () => {
    await resetCounters();
    const { primary, directConversationId: conversationId } = world;
    // Product limits are 30 per 60 s; the database function takes the window
    // from its caller, so a short window exercises a real rollover quickly.
    const window = 5;
    const tag = randomUUID();
    const create = `select public.create_message_attempt($1, $2, $3, 'text', $4, null, null, null, '{}'::uuid[], 1, $5) as result`;
    const target = await insertRawMessage(primary, conversationId, `T3 rollover target ${tag}`);

    const firstWindow = await waitForWindowStart(window, 1.5);
    await world.query(create, [conversationId, primary.appUserId, `T3 rollover ${tag} first`, null, window]);

    const lock = await lockMessageRow(target);
    const delayed = new Client({ connectionString: MESSAGING_DB_URL });
    await delayed.connect();
    const delayedPid = (await delayed.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
    try {
      const outcome = delayed
        .query(create, [conversationId, primary.appUserId, `T3 rollover ${tag} delayed`, target, window])
        .then(
          () => 'committed',
          (error: Error) => error.message,
        );
      await waitForBlockedBy(lock.pid, delayedPid);
      const [{ started }] = await world.query<{ started: string }>(
        `select floor(extract(epoch from xact_start) / $1)::text as started from pg_catalog.pg_stat_activity where pid = $2`,
        [window, delayedPid],
      );
      // The delayed insertion's transaction started in the exhausted window.
      expect(Number(started)).toBe(firstWindow);

      const nextWindow = await waitForWindowStart(window, 2, firstWindow);
      expect(nextWindow).toBe(firstWindow + 1);
      // A next-window insertion commits (and cleans the older window up).
      await world.query(create, [conversationId, primary.appUserId, `T3 rollover ${tag} next`, null, window]);

      await lock.release();
      expect(await outcome).toBe('RATE_LIMITED');
      expect((await windowPosition(window)).index).toBe(nextWindow);
    } finally {
      await lock.release();
      await delayed.end();
    }
    const stored = await world.query(`select 1 from public.messages where conversation_id = $1 and content like $2`, [
      conversationId,
      `T3 rollover ${tag} %`,
    ]);
    expect(stored).toHaveLength(2);
    await resetCounters();
  });

  it('a Phase 4 limiter charge delayed across a rollover cannot reopen an exhausted insertion quota', async () => {
    await resetCounters();
    const { primary, directConversationId: conversationId } = world;
    const window = 5;
    const tag = randomUUID();
    const create = `select public.create_message_attempt($1, $2, $3, 'text', null, null, null, null, '{}'::uuid[], 1, $4) as result`;

    const firstWindow = await waitForWindowStart(window, 1.5);
    // The new writer exhausts the first window (limit 1).
    await world.query(create, [conversationId, primary.appUserId, `T3 mixed ${tag} first`, window]);

    // A Phase 4 server's route-level limiter call (public.check_rate_limit,
    // 'message:create') whose transaction started in the exhausted window and
    // runs only after the rollover.
    const legacy = new Client({ connectionString: MESSAGING_DB_URL });
    await legacy.connect();
    try {
      await legacy.query('begin');
      const [{ started }] = (
        await legacy.query<{ started: string }>('select floor(extract(epoch from now()) / $1)::text as started', [window])
      ).rows;
      expect(Number(started)).toBe(firstWindow);

      const nextWindow = await waitForWindowStart(window, 2, firstWindow);
      expect(nextWindow).toBe(firstWindow + 1);
      // The new writer commits in the next window (and cleans the first up).
      await world.query(create, [conversationId, primary.appUserId, `T3 mixed ${tag} next`, window]);

      const [{ allowed }] = (
        await legacy.query<{ allowed: boolean }>(`select public.check_rate_limit($1, 'message:create', 1, $2) as allowed`, [
          primary.appUserId,
          window,
        ])
      ).rows;
      expect(allowed).toBe(false);
      await legacy.query('commit');
      expect((await windowPosition(window)).index).toBe(nextWindow);
    } finally {
      await legacy.query('rollback').catch(() => undefined);
      await legacy.end();
    }
    // The first window was not recreated by the delayed legacy charge.
    const [{ first }] = await world.query<{ first: string }>(
      `select count(*)::text as first from private.rate_limit_counters
       where user_id = $1 and action = 'message:create' and window_start = to_timestamp($2::bigint * $3)`,
      [primary.appUserId, firstWindow, window],
    );
    expect(first).toBe('0');
    // Other actions keep the original limiter behavior.
    const [{ other }] = await world.query<{ other: boolean }>(
      `select public.check_rate_limit($1, 'message:react', 1, 60) as other`,
      [primary.appUserId],
    );
    expect(other).toBe(true);
    await resetCounters();
  });

  // Phase 5 T6 r2: every non-'message:create' action of public.check_rate_limit
  // (route budgets 'message:create-request', 'message:fence',
  // 'messaging:metrics', and the fail-open actions) is serialized per (user,
  // action) with its window read from clock_timestamp() after the lock
  // (migration 20261008012709). Before it, a check whose transaction started
  // in an exhausted window W0 and ran after a W1 check had cleaned W0 up
  // recreated W0 at count 1 and returned true.
  it.each(['message:create-request', 'message:fence', 'messaging:metrics'] as const)(
    'a %s check delayed across a rollover cannot reopen an exhausted bucket or recreate the old one',
    async (action) => {
      await resetCounters();
      const { primary } = world;
      const window = 5;
      const check = 'select public.check_rate_limit($1, $2, 1, $3) as allowed';
      const bucketCount = async (index: number): Promise<number> => {
        const [{ total }] = await world.query<{ total: string }>(
          `select coalesce(sum(count), 0)::text as total from private.rate_limit_counters
           where user_id = $1 and action = $2 and window_start = to_timestamp($3::bigint * $4)`,
          [primary.appUserId, action, index, window],
        );
        return Number(total);
      };

      const firstWindow = await waitForWindowStart(window, 1.5);
      // The first window's budget (limit 1) is used up.
      const [{ allowed: first }] = await world.query<{ allowed: boolean }>(check, [primary.appUserId, action, window]);
      expect(first).toBe(true);

      // A check whose transaction starts in the exhausted first window and
      // reaches the limiter only after the rollover (a slow route request).
      const delayed = new Client({ connectionString: MESSAGING_DB_URL });
      await delayed.connect();
      try {
        await delayed.query('begin');
        const [{ started }] = (
          await delayed.query<{ started: string }>('select floor(extract(epoch from now()) / $1)::text as started', [window])
        ).rows;
        expect(Number(started)).toBe(firstWindow);

        const nextWindow = await waitForWindowStart(window, 2, firstWindow);
        expect(nextWindow).toBe(firstWindow + 1);
        // The next window's budget is used up too (and the first is cleaned up).
        const [{ allowed: next }] = await world.query<{ allowed: boolean }>(check, [primary.appUserId, action, window]);
        expect(next).toBe(true);
        expect(await bucketCount(firstWindow)).toBe(0);

        const [{ allowed }] = (
          await delayed.query<{ allowed: boolean }>(check, [primary.appUserId, action, window])
        ).rows;
        expect(allowed).toBe(false);
        await delayed.query('commit');
        expect((await windowPosition(window)).index).toBe(nextWindow);
        // The delayed check was charged to the current window and did not
        // recreate the first one.
        expect(await bucketCount(firstWindow)).toBe(0);
        expect(await bucketCount(nextWindow)).toBe(2);
      } finally {
        await delayed.query('rollback').catch(() => undefined);
        await delayed.end();
      }
      await resetCounters();
    },
  );

  // Contention: a check dispatched in W0 that waits on the (user, action)
  // advisory lock across the rollover reads its window only after the lock,
  // so it is charged to W1 and cleans W0 up instead of charging W0. Fails
  // without the lock (the check is never blocked by the holder).
  it.each(['message:create-request', 'messaging:metrics'] as const)(
    'a %s check blocked on the limiter lock across a rollover is charged to the new window',
    async (action) => {
      await resetCounters();
      const { primary } = world;
      const window = 5;
      const check = 'select public.check_rate_limit($1, $2, 1, $3) as allowed';
      const bucketCount = async (index: number): Promise<number> => {
        const [{ total }] = await world.query<{ total: string }>(
          `select coalesce(sum(count), 0)::text as total from private.rate_limit_counters
           where user_id = $1 and action = $2 and window_start = to_timestamp($3::bigint * $4)`,
          [primary.appUserId, action, index, window],
        );
        return Number(total);
      };

      const firstWindow = await waitForWindowStart(window, 1.5);
      const [{ allowed: first }] = await world.query<{ allowed: boolean }>(check, [primary.appUserId, action, window]);
      expect(first).toBe(true);

      const holder = new Client({ connectionString: MESSAGING_DB_URL });
      const waiter = new Client({ connectionString: MESSAGING_DB_URL });
      await holder.connect();
      await waiter.connect();
      try {
        await holder.query('begin');
        // The exact key the limiter takes for this (user, action).
        await holder.query(
          `select pg_catalog.pg_advisory_xact_lock(
             pg_catalog.hashtextextended('virtual_office.rate_limit:' || $1::uuid::text || ':' || $2::text, 0))`,
          [primary.appUserId, action],
        );
        const holderPid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
        const waiterPid = (await waiter.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;

        // Dispatched during the exhausted first window; blocked by the holder.
        const pending = waiter.query<{ allowed: boolean }>(check, [primary.appUserId, action, window]);
        pending.catch(() => undefined);
        await waitForBlockedBy(holderPid, waiterPid);
        expect((await windowPosition(window)).index).toBe(firstWindow);

        const nextWindow = await waitForWindowStart(window, 2, firstWindow);
        expect(nextWindow).toBe(firstWindow + 1);
        await holder.query('commit');

        const { rows } = await pending;
        // Charged to the new window (its first charge) and the first window
        // cleaned up — not charged there, not recreated.
        expect(rows[0].allowed).toBe(true);
        expect(await bucketCount(nextWindow)).toBe(1);
        expect(await bucketCount(firstWindow)).toBe(0);
      } finally {
        await holder.query('rollback').catch(() => undefined);
        await holder.end();
        await waiter.end();
      }
      await resetCounters();
    },
  );

  it('an unkeyed create answers from its own transaction: a response that cannot be built stores nothing', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    const content = `T3 unkeyed response ${randomUUID()}`;
    // service_role may read message ids and key columns but not whole rows:
    // the INSERT itself can run, the response row cannot be built.
    await world.query('revoke select on table public.messages from service_role');
    await world.query('grant select (id, sender_id, conversation_id, client_message_id) on table public.messages to service_role');
    try {
      const refused = await postCreate(primary, { conversationId, content });
      expect(refused.status).toBe(500);
      expect(refused.body.code).toBe('INTERNAL_ERROR');
    } finally {
      await world.query('grant select on table public.messages to service_role');
      await world.query('revoke select (id, sender_id, conversation_id, client_message_id) on table public.messages from service_role');
    }
    expect(await contentRows(conversationId, content)).toHaveLength(0);
    expect(await counter(primary, 'message:create')).toBe(0);

    // The retry stores exactly one message and bumps conversation activity.
    const [{ before }] = await world.query<{ before: Date | null }>('select last_activity as before from public.conversations where id = $1', [
      conversationId,
    ]);
    const retried = await postCreate(primary, { conversationId, content });
    expect(retried.status).toBe(201);
    expect(retried.body.message?.id).toBeDefined();
    expect(await contentRows(conversationId, content)).toHaveLength(1);
    expect(await counter(primary, 'message:create')).toBe(1);
    const [{ after }] = await world.query<{ after: Date | null }>('select last_activity as after from public.conversations where id = $1', [
      conversationId,
    ]);
    expect(after).not.toBeNull();
    expect(after?.getTime() ?? 0).toBeGreaterThan(before?.getTime() ?? 0);
  });

  it('unkeyed creates keep the legacy contract and are charged only by a committed insertion', async () => {
    await ensureWindowHeadroom();
    const { primary, directConversationId: conversationId } = world;
    const content = `T3 legacy ${randomUUID()}`;
    const created = await postCreate(primary, { conversationId, content });
    expect(created.status).toBe(201);
    expect(Object.keys(created.body)).toEqual(['message']);
    const legacyKeys = ['attachments', 'content', 'conversationId', 'id', 'isEdited', 'reactions', 'senderId', 'status', 'timestamp', 'type'];
    expect(Object.keys(created.body.message ?? {}).sort()).toEqual(legacyKeys);
    expect(created.body.message).toMatchObject({ content, conversationId, senderId: primary.appUserId, status: 'sent', type: 'text', isEdited: false });

    const reply = await postCreate(primary, { conversationId, content: `T3 legacy reply ${randomUUID()}`, replyToId: created.body.message?.id });
    expect(reply.status).toBe(201);
    expect(Object.keys(reply.body.message ?? {}).sort()).toEqual([...legacyKeys, 'replyToId'].sort());
    const badReply = await postCreate(primary, { conversationId, content: 'x', replyToId: randomUUID() });
    expect(badReply.status).toBe(400);
    expect(badReply.body.code).toBe('INVALID_REPLY_TARGET');
    expect(await counter(primary, 'message:create')).toBe(2);

    // The reply target is deleted after the route validated it: the INSERT
    // fails its foreign key, nothing is stored and the quota is not charged.
    const target = await insertRawMessage(primary, conversationId, `T3 vanishing target ${randomUUID()}`);
    const lock = await lockMessageRow(target);
    const raced = `T3 raced ${randomUUID()}`;
    try {
      const pending = postCreate(primary, { conversationId, content: raced, replyToId: target });
      await waitForBlockedBy(lock.pid);
      await lock.deleteAndCommit();
      const result = await pending;
      expect(result.status).toBe(500);
      expect(result.body.code).toBe('INTERNAL_ERROR');
    } finally {
      await lock.release();
    }
    expect(await contentRows(conversationId, raced)).toHaveLength(0);
    expect(await counter(primary, 'message:create')).toBe(2);
    expect(await counter(primary, 'message:create-request')).toBe(4);
  });

  it('grant failures answer a recoverable 500, never 403; only the explicit membership refusal is NOT_PARTICIPANT', async () => {
    await ensureWindowHeadroom();
    const { primary, outsider, directConversationId: conversationId } = world;
    const key = randomUUID();
    const uploadId = await upload(primary, conversationId);

    const expectServerError = (result: RouteResult) => {
      expect(result.status, JSON.stringify(result.body)).toBe(500);
      expect(result.body.code).toBe('INTERNAL_ERROR');
    };

    await withGrantFailure('createFunction', async () => {
      expectServerError(await postCreate(primary, { conversationId, content: `T3 grant ${key}`, clientMessageId: key }));
      expectServerError(await postCreate(primary, { conversationId, content: `T3 grant unkeyed ${key}` }));
      expectServerError(await postCreate(primary, { conversationId, content: '', clientMessageId: randomUUID(), attachmentIds: [uploadId] }));
    });
    await withGrantFailure('fenceFunction', async () => {
      expectServerError(await postFence(primary, { conversationId, ...attempt(primary, key, 1) }));
      expectServerError(await postCreate(primary, { conversationId, content: `T3 grant ${key}`, ...attempt(primary, key, 1) }));
    });
    await withGrantFailure('attemptTable', async () => {
      expectServerError(await postCreate(primary, { conversationId, content: `T3 grant ${key}`, clientMessageId: key }));
      expectServerError(await postFence(primary, { conversationId, ...attempt(primary, randomUUID(), 1) }));
    });
    expect(await keyRows(primary, conversationId, key)).toHaveLength(0);
    expect(await contentRows(conversationId, `T3 grant unkeyed ${key}`)).toHaveLength(0);
    expect(await pendingUpload(uploadId)).toBe(true);
    expect(await counter(primary, 'message:create')).toBe(0);

    // Restored: the same key commits.
    expect((await postCreate(primary, { conversationId, content: `T3 grant ${key}`, clientMessageId: key })).status).toBe(201);

    // The database's own membership refusal carries an explicit marker.
    const create = await admin.rpc('create_message_attempt', {
      p_conversation_id: conversationId,
      p_sender_id: outsider.appUserId,
      p_content: 'x',
      p_type: 'text',
      p_reply_to_id: null,
      p_client_message_id: randomUUID(),
      p_attempt_generation: null,
      p_composition: null,
      p_upload_ids: [],
      p_insert_quota_limit: INSERTION_QUOTA,
      p_insert_quota_window_seconds: WINDOW_SECONDS,
    });
    expect(create.error).toMatchObject({ code: '42501', message: 'NOT_PARTICIPANT' });
    const fence = await admin.rpc('fence_message_attempt', {
      p_sender_id: outsider.appUserId,
      p_conversation_id: conversationId,
      p_client_message_id: randomUUID(),
      p_attempt_generation: 1,
    });
    expect(fence.error).toMatchObject({ code: '42501', message: 'NOT_PARTICIPANT' });
  });
});
