import { Client } from 'pg';

import { parseLoopbackDatabaseUrl } from './local-db-url';
import { MESSAGING_TEST_ACCOUNT_EMAIL_KEYS } from './local-supabase-mode';

/**
 * Phase 5 T24 — direct LOCAL database access for the E2E fixtures: server
 * state that no API role can reach (the `private` schema is not exposed), so
 * tests can exhaust/reset budgets and clean up after interrupted runs.
 *
 * Only ever connects to a loopback Postgres (the Supabase CLI stack, demo
 * credentials). It never writes product data through a side door for a test
 * scenario: memberships change only through the seed route (service-role
 * DELETE = revocation; restore_conversation_membership = re-add), and budgets
 * are charged by the real `public.check_rate_limit`. Direct writes here are
 * limited to (a) raising an already-charged counter row to "exhausted" and
 * (b) deleting test-account state during cleanup.
 */
export const MESSAGING_LOCAL_DB_URL =
  process.env.MESSAGING_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export async function withLocalMessagingDb<T>(work: (db: Client) => Promise<T>): Promise<T> {
  // Explicit fields from the strict loopback parser — never the URL itself, so
  // pg cannot resolve a different host than the one validated.
  // TLS off and fixed session settings, so PGSSLMODE/PGOPTIONS-style
  // environment variables cannot change how the local session behaves. The
  // options string must be non-empty: pg treats '' as unset and falls back to
  // PGOPTIONS, which could make the session read-only or time out cleanup.
  const db = new Client({
    ...parseLoopbackDatabaseUrl(MESSAGING_LOCAL_DB_URL),
    ssl: false,
    application_name: 'vo-messaging-e2e-fixtures',
    options: '-c default_transaction_read_only=off -c statement_timeout=0',
  });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

/** Lower-cased emails of the configured messaging test accounts (A–E). */
export function configuredTestAccountEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return MESSAGING_TEST_ACCOUNT_EMAIL_KEYS.map((key) => env[key]?.trim().toLowerCase() ?? '').filter(
    (email) => email.length > 0,
  );
}

/** users.id of the configured messaging test accounts that exist locally. */
export async function findTestAccountUserIds(db: Client, emails = configuredTestAccountEmails()): Promise<string[]> {
  if (emails.length === 0) return [];
  const { rows } = await db.query<{ id: string }>(
    'select id::text from public.users where lower(email) = any($1::text[]) order by id',
    [emails],
  );
  return rows.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Budgets (private.rate_limit_counters, charged by public.check_rate_limit)
// ---------------------------------------------------------------------------

/** The send budgets of SPEC FR-008 / TRACK T3 (src/lib/auth/rate-limit.ts). */
export type MessagingBudgetAction = 'message:create' | 'message:create-request' | 'message:fence';

/**
 * Window length of every messaging budget (rate-limit.ts: 60 s each). Used
 * only to place the window rows; the probe proves a real create is refused.
 */
export const BUDGET_WINDOW_SECONDS = 60;

/** Far above any configured limit: an exhausted window stays exhausted however the limit is tuned. */
const EXHAUSTED_COUNT = 1_000_000;

export interface ExhaustedBudget {
  action: MessagingBudgetAction;
  /** Start of the first exhausted window (database clock). */
  windowStart: Date;
  /** End of the last exhausted window (database clock). */
  exhaustedUntil: Date;
}

/**
 * Exhausts `userId`'s `action` budget: charges it once through the real
 * `public.check_rate_limit` (for 'message:create' that is the insertion-quota
 * helper, the same counter create_message_attempt charges), then raises that
 * window's counter far above any limit. With `windows` > 1 the following
 * windows are pre-charged too, so exhaustion outlasts a window rollover.
 * When less than `minRemainingMs` of the current window is left, it first
 * waits for the next window so the caller gets at least that long.
 */
export async function exhaustBudget(
  db: Client,
  userId: string,
  action: MessagingBudgetAction,
  options: { windows?: number; minRemainingMs?: number } = {},
): Promise<ExhaustedBudget> {
  const windows = Math.min(Math.max(1, Math.floor(options.windows ?? 1)), 10);
  const minRemainingMs = options.minRemainingMs ?? 20_000;
  const windowMs = BUDGET_WINDOW_SECONDS * 1000;

  const { rows: clock } = await db.query<{ now_ms: string }>(
    'select floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text as now_ms',
  );
  const nowMs = Number(clock[0].now_ms);
  const remainingMs = windowMs - (nowMs % windowMs);
  if (remainingMs < minRemainingMs) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs + 250));
  }

  const { rows: charged } = await db.query<{ allowed: boolean }>(
    'select public.check_rate_limit($1::uuid, $2::text, 1, $3::integer) as allowed',
    [userId, action, BUDGET_WINDOW_SECONDS],
  );
  if (typeof charged[0]?.allowed !== 'boolean') {
    throw new Error(`check_rate_limit returned no result for ${action}`);
  }
  const { rows: current } = await db.query<{ window_start: Date }>(
    `select window_start from private.rate_limit_counters
      where user_id = $1::uuid and action = $2::text and window_start <= clock_timestamp()
      order by window_start desc limit 1`,
    [userId, action],
  );
  if (current.length === 0) {
    throw new Error(`check_rate_limit charged no ${action} counter for the user`);
  }
  const windowStart = current[0].window_start;
  await db.query(
    `insert into private.rate_limit_counters (user_id, action, window_start, count)
     select $1::uuid, $2::text, $3::timestamptz + make_interval(secs => $4::int * step), $5::int
       from generate_series(0, $6::int - 1) as step
     on conflict (user_id, action, window_start) do update set count = excluded.count`,
    [userId, action, windowStart, BUDGET_WINDOW_SECONDS, EXHAUSTED_COUNT, windows],
  );
  return {
    action,
    windowStart,
    exhaustedUntil: new Date(windowStart.getTime() + windows * windowMs),
  };
}

/** Deletes the users' budget counters (every action unless `actions` is given). Returns the rows removed. */
export async function resetBudgets(
  db: Client,
  userIds: readonly string[],
  actions?: readonly string[],
): Promise<number> {
  if (userIds.length === 0) return 0;
  const result = actions
    ? await db.query(
        'delete from private.rate_limit_counters where user_id = any($1::uuid[]) and action = any($2::text[])',
        [userIds, actions],
      )
    : await db.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [userIds]);
  return result.rowCount ?? 0;
}

/** The user's counter for `action` in the window containing the database clock (0 when none). */
export async function readBudgetCount(db: Client, userId: string, action: string): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `select count from private.rate_limit_counters
      where user_id = $1::uuid and action = $2::text
        and window_start <= clock_timestamp()
        and window_start > clock_timestamp() - make_interval(secs => $3::int)`,
    [userId, action, BUDGET_WINDOW_SECONDS],
  );
  return rows[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Membership state (read-only here; changes go through the seed route)
// ---------------------------------------------------------------------------

export async function isConversationMember(db: Client, conversationId: string, userId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'select 1 from public.conversation_members where conversation_id = $1::uuid and user_id = $2::uuid',
    [conversationId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function isMembershipRevoked(db: Client, conversationId: string, userId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'select 1 from private.conversation_member_revocations where conversation_id = $1::uuid and user_id = $2::uuid',
    [conversationId, userId],
  );
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Cleanup of Phase 5 server state
// ---------------------------------------------------------------------------

/** Rows of Phase 5 server state that belong to the test accounts. */
export interface MessagingServerStateCounts {
  /** private.rate_limit_counters of the users (all budgets). */
  budgetCounters: number;
  /** private.message_send_attempts (fence state) sent by the users. */
  attemptRows: number;
  /** private.conversation_member_revocations of the users in test-only conversations. */
  revocations: number;
  /** public.message_mentions on messages of test-only conversations. */
  mentions: number;
}

/**
 * A conversation whose participants and current members are all `$1` test
 * accounts (the shape of every seeded or test-created conversation).
 */
const TEST_ONLY_CONVERSATIONS = `
  select c.id from public.conversations c
   where coalesce(cardinality(c.participants), 0) > 0
     and c.participants <@ $1::uuid[]
     and not exists (
       select 1 from public.conversation_members m
        where m.conversation_id = c.id and not (m.user_id = any($1::uuid[]))
     )`;

export async function countMessagingServerState(
  db: Client,
  userIds: readonly string[],
): Promise<MessagingServerStateCounts> {
  if (userIds.length === 0) {
    return { budgetCounters: 0, attemptRows: 0, revocations: 0, mentions: 0 };
  }
  const { rows } = await db.query<{ budgets: number; attempts: number; revocations: number; mentions: number }>(
    `select
       (select count(*)::int from private.rate_limit_counters where user_id = any($1::uuid[])) as budgets,
       (select count(*)::int from private.message_send_attempts where sender_id = any($1::uuid[])) as attempts,
       (select count(*)::int from private.conversation_member_revocations r
         where r.user_id = any($1::uuid[]) and r.conversation_id in (${TEST_ONLY_CONVERSATIONS})) as revocations,
       (select count(*)::int from public.message_mentions mm
          join public.messages msg on msg.id = mm.message_id
         where msg.conversation_id in (${TEST_ONLY_CONVERSATIONS})) as mentions`,
    [userIds],
  );
  const row = rows[0];
  return {
    budgetCounters: row.budgets,
    attemptRows: row.attempts,
    revocations: row.revocations,
    mentions: row.mentions,
  };
}

/**
 * Deletes the test accounts' Phase 5 server state that survives the removal of
 * their conversations (or that a run interrupted before its cleanup left
 * behind): every budget counter and fence/attempt row of these users, their
 * revocations in test-only conversations, and mentions on messages of
 * test-only conversations. Conversations themselves are removed by the seed
 * route (deleting a conversation cascades to its members, messages, mentions,
 * attempt rows, and revocations). Returns the rows deleted.
 */
export async function cleanupMessagingServerState(
  db: Client,
  userIds: readonly string[],
): Promise<MessagingServerStateCounts> {
  if (userIds.length === 0) {
    return { budgetCounters: 0, attemptRows: 0, revocations: 0, mentions: 0 };
  }
  await db.query('begin');
  try {
    const mentions = await db.query(
      `delete from public.message_mentions mm using public.messages msg
        where msg.id = mm.message_id and msg.conversation_id in (${TEST_ONLY_CONVERSATIONS})`,
      [userIds],
    );
    const revocations = await db.query(
      `delete from private.conversation_member_revocations r
        where r.user_id = any($1::uuid[]) and r.conversation_id in (${TEST_ONLY_CONVERSATIONS})`,
      [userIds],
    );
    const attempts = await db.query('delete from private.message_send_attempts where sender_id = any($1::uuid[])', [
      userIds,
    ]);
    const budgets = await db.query('delete from private.rate_limit_counters where user_id = any($1::uuid[])', [
      userIds,
    ]);
    await db.query('commit');
    return {
      budgetCounters: budgets.rowCount ?? 0,
      attemptRows: attempts.rowCount ?? 0,
      revocations: revocations.rowCount ?? 0,
      mentions: mentions.rowCount ?? 0,
    };
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Presence runtime mode (messaging E2E expects the atomic Presence mode)
// ---------------------------------------------------------------------------

export async function readPresenceRuntimeMode(db: Client): Promise<string | null> {
  const { rows } = await db.query<{ mode: string }>('select mode::text from private.presence_runtime_control limit 1');
  return rows[0]?.mode ?? null;
}
