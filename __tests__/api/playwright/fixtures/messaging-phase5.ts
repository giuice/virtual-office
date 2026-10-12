import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { LOCAL_MESSAGING_FLAG } from '../helpers/local-supabase-mode';
import {
  cleanupMessagingServerState,
  countMessagingServerState,
  exhaustBudget,
  isConversationMember,
  isMembershipRevoked,
  readBudgetCount,
  resetBudgets,
  withLocalMessagingDb,
  type ExhaustedBudget,
  type MessagingBudgetAction,
  type MessagingServerStateCounts,
} from '../helpers/messaging-local-db';
import { openServerLog, type ServerLog } from '../helpers/server-log';
import { closePlacementToasts, guardLocalSupabaseTraffic, login, removeSeededMember } from './messaging';

/**
 * Phase 5 T24 — E2E fixtures for the Phase 5 runner
 * (playwright.messaging-phase5.config.ts; local Supabase, real Chrome/Edge).
 *
 *   phase5World   users A–E in one company; a DM (A–B), a group (A–E) and a room
 *                 conversation (A–E, in reusable room "Test Space Fixed 1");
 *                 removed with all their server state after the test.
 *   openDevice    openDevice('A') → a signed-in device: a fresh browser context
 *                 with its own sign-in (its own Supabase session). Call it again
 *                 for the same user to get a second device; device.newTab()
 *                 opens another tab of the same device (same session/storage).
 *   membership    remove(conversationId, 'E') — administrative removal through
 *                 the seed route (service-role DELETE → revocation, T28);
 *                 restore(conversationId, 'E') — re-add through
 *                 restore_conversation_membership, the only authorized rejoin.
 *   budgets       exhaust('A') — A's insertion quota ('message:create') charged
 *                 by the real check_rate_limit and held exhausted (also
 *                 'message:create-request' / 'message:fence'); reset('A').
 *   serverLog     raw local server log lines (helpers/server-log.ts).
 *
 * Cleanup (after each test, and in global setup for interrupted runs): the
 * world's conversations (cascading members, messages, mentions, attempt/fence
 * rows, revocations), then every budget counter and attempt/fence row of A–E
 * and their revocations/mentions in test-only conversations; the teardown
 * fails the test if any of that is left. Browser state is discarded with each
 * device's context (helpers/messaging-browser-state.ts).
 */

export const PHASE5_USER_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;
export type Phase5UserKey = (typeof PHASE5_USER_KEYS)[number];

/** Env prefix of each account (PLAYWRIGHT_<X>_EMAIL/_PASSWORD/_DISPLAY_NAME). */
const ACCOUNT_ENV_PREFIX: Record<Phase5UserKey, string> = {
  A: 'PLAYWRIGHT_PRIMARY',
  B: 'PLAYWRIGHT_SECONDARY',
  C: 'PLAYWRIGHT_TERTIARY',
  D: 'PLAYWRIGHT_FOURTH',
  E: 'PLAYWRIGHT_FIFTH',
};

export interface Phase5User {
  key: Phase5UserKey;
  /** users.id (application id). */
  userId: string;
  /** users.supabase_uid (auth.uid()). */
  supabaseUid: string;
  email: string;
  password: string;
  displayName: string;
}

export interface Phase5World {
  runId: string;
  companyId: string;
  users: Record<Phase5UserKey, Phase5User>;
  conversations: {
    /** Direct conversation of A and B. */
    directId: string;
    /** Group conversation of A–E. */
    groupId: string;
    /** Room conversation of A–E. */
    roomId: string;
  };
  /** The room (space) of `conversations.roomId`. */
  roomSpaceId: string;
  seededMessageIds: string[];
}

export interface Phase5Device {
  user: Phase5User;
  /** Unique per test, e.g. "A#1", "A#2" (second device of A). */
  label: string;
  context: BrowserContext;
  /** The device's first tab, signed in and on the post-login page. */
  page: Page;
  /** Another tab of this device (same session and browser storage). */
  newTab(): Promise<Page>;
}

export type OpenDevice = (user: Phase5UserKey) => Promise<Phase5Device>;

export interface MembershipControl {
  /** Administrative removal (service-role DELETE → revocation). Returns rows removed. */
  remove(conversationId: string, user: Phase5UserKey): Promise<number>;
  /** Re-add via restore_conversation_membership; verifies the row is back and the revocation lifted. */
  restore(conversationId: string, user: Phase5UserKey): Promise<void>;
  isMember(conversationId: string, user: Phase5UserKey): Promise<boolean>;
  isRevoked(conversationId: string, user: Phase5UserKey): Promise<boolean>;
}

export interface BudgetControl {
  /** Exhausts the user's budget (default: insertion quota 'message:create'). */
  exhaust(
    user: Phase5UserKey,
    action?: MessagingBudgetAction,
    options?: { windows?: number; minRemainingMs?: number },
  ): Promise<ExhaustedBudget>;
  /** Deletes the users' counters (default: every budget of A–E). */
  reset(users?: readonly Phase5UserKey[], actions?: readonly MessagingBudgetAction[]): Promise<number>;
  /** The user's counter in the current window. */
  count(user: Phase5UserKey, action: MessagingBudgetAction): Promise<number>;
}

const PLAYWRIGHT_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? '';
const seedHeaders = () => ({ 'x-test-secret': PLAYWRIGHT_SECRET });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} must be set (Phase 5 runner sets it in local mode).`);
  }
  return value;
}

interface SeedResponseUser {
  id: string;
  email: string;
  supabaseUid: string;
}

interface SeedResponse {
  runId: string;
  company: { id: string };
  users: SeedResponseUser[];
  spaces: Array<{ id: string }>;
  conversations: { directId: string; roomIds: string[]; groupId?: string };
  messages: Array<{ id: string }>;
}

export async function seedPhase5World(request: APIRequestContext): Promise<Phase5World> {
  const response = await request.post('/api/test/messaging/seed', {
    headers: seedHeaders(),
    data: { includePhase5World: true, roomCount: 1, includePinnedRoom: false },
  });
  if (!response.ok()) {
    throw new Error(`Failed to seed the Phase 5 world: ${response.status()} ${await response.text()}`);
  }
  const { data } = (await response.json()) as { data: SeedResponse };
  const byEmail = new Map(data.users.map((user) => [user.email.trim().toLowerCase(), user]));
  const users = Object.fromEntries(
    PHASE5_USER_KEYS.map((key) => {
      const prefix = ACCOUNT_ENV_PREFIX[key];
      const email = requireEnv(`${prefix}_EMAIL`);
      const seeded = byEmail.get(email.trim().toLowerCase());
      if (!seeded) {
        throw new Error(`The Phase 5 seed did not return user ${key}`);
      }
      const user: Phase5User = {
        key,
        userId: seeded.id,
        supabaseUid: seeded.supabaseUid,
        email,
        password: requireEnv(`${prefix}_PASSWORD`),
        displayName: requireEnv(`${prefix}_DISPLAY_NAME`),
      };
      return [key, user];
    }),
  ) as Record<Phase5UserKey, Phase5User>;
  const [roomId] = data.conversations.roomIds;
  const [roomSpaceId] = data.spaces.map((space) => space.id);
  if (!roomId || !roomSpaceId || !data.conversations.groupId) {
    throw new Error('The Phase 5 seed did not return a room and a group conversation');
  }
  return {
    runId: data.runId,
    companyId: data.company.id,
    users,
    conversations: { directId: data.conversations.directId, groupId: data.conversations.groupId, roomId },
    roomSpaceId,
    seededMessageIds: data.messages.map((message) => message.id),
  };
}

function worldUserIds(world: Phase5World): string[] {
  return PHASE5_USER_KEYS.map((key) => world.users[key].userId);
}

function worldConversationIds(world: Phase5World): string[] {
  return [world.conversations.directId, world.conversations.groupId, world.conversations.roomId];
}

/**
 * Removes the world: its conversations through the seed route (cascading
 * members, messages, mentions, attempt rows, revocations), then the users'
 * remaining Phase 5 server state. Idempotent. Returns what is left afterwards
 * (all zero when clean) plus the world conversations that still exist.
 */
export async function cleanupPhase5World(
  request: APIRequestContext,
  world: Phase5World,
): Promise<{ left: MessagingServerStateCounts; conversationsLeft: number }> {
  const response = await request.delete('/api/test/messaging/seed', {
    headers: seedHeaders(),
    data: {
      companyId: world.companyId,
      userIds: worldUserIds(world),
      conversationIds: worldConversationIds(world),
      messageIds: world.seededMessageIds,
      spaceIds: [world.roomSpaceId],
    },
  });
  if (!response.ok()) {
    throw new Error(`Failed to clean up the Phase 5 world: ${response.status()} ${await response.text()}`);
  }
  return withLocalMessagingDb(async (db) => {
    await cleanupMessagingServerState(db, worldUserIds(world));
    const left = await countMessagingServerState(db, worldUserIds(world));
    const { rows } = await db.query<{ count: number }>(
      'select count(*)::int as count from public.conversations where id = any($1::uuid[])',
      [worldConversationIds(world)],
    );
    return { left, conversationsLeft: rows[0].count };
  });
}

async function signInDevice(browser: Browser, user: Phase5User, label: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const verifyTraffic = guardLocalSupabaseTraffic(page, label);
  await closePlacementToasts(page);
  await login(page, user.email, user.password);
  return { context, page, verifyTraffic };
}

type Phase5Fixtures = {
  phase5World: Phase5World;
  openDevice: OpenDevice;
  membership: MembershipControl;
  budgets: BudgetControl;
  serverLog: ServerLog;
};

export const test = base.extend<Phase5Fixtures>({
  phase5World: async ({ request }, use) => {
    if (process.env[LOCAL_MESSAGING_FLAG] !== '1') {
      throw new Error('Phase 5 fixtures run only in local Supabase mode (playwright.messaging-phase5.config.ts).');
    }
    if (!PLAYWRIGHT_SECRET) {
      throw new Error('PLAYWRIGHT_TEST_SECRET must be set');
    }
    const world = await seedPhase5World(request);
    try {
      await use(world);
    } finally {
      const { left, conversationsLeft } = await cleanupPhase5World(request, world);
      expect(
        { ...left, conversationsLeft },
        'Phase 5 server state left after cleanup',
      ).toEqual({ budgetCounters: 0, attemptRows: 0, revocations: 0, mentions: 0, conversationsLeft: 0 });
    }
  },

  openDevice: async ({ browser, phase5World }, use) => {
    const devices: Array<{ context: BrowserContext; verifyTraffic: () => void }> = [];
    const perUser = new Map<Phase5UserKey, number>();
    const openDevice: OpenDevice = async (key) => {
      const user = phase5World.users[key];
      const index = (perUser.get(key) ?? 0) + 1;
      perUser.set(key, index);
      const label = `${key}#${index}`;
      const { context, page, verifyTraffic } = await signInDevice(browser, user, label);
      devices.push({ context, verifyTraffic });
      let tabs = 1;
      return {
        user,
        label,
        context,
        page,
        newTab: async () => {
          tabs += 1;
          const tab = await context.newPage();
          const verifyTab = guardLocalSupabaseTraffic(tab, `${label} tab ${tabs}`);
          devices.push({ context, verifyTraffic: verifyTab });
          await closePlacementToasts(tab);
          return tab;
        },
      };
    };
    try {
      await use(openDevice);
    } finally {
      const contexts = new Set(devices.map((device) => device.context));
      for (const context of contexts) {
        await context.close();
      }
      for (const device of devices) {
        device.verifyTraffic();
      }
    }
  },

  membership: async ({ request, phase5World }, use) => {
    const userId = (key: Phase5UserKey) => phase5World.users[key].userId;
    await use({
      remove: (conversationId, key) => removeSeededMember(request, { conversationId, userId: userId(key) }),
      restore: async (conversationId, key) => {
        const response = await request.patch('/api/test/messaging/seed', {
          headers: seedHeaders(),
          data: { action: 'restore-member', conversationId, userId: userId(key) },
        });
        if (!response.ok()) {
          throw new Error(`Failed to restore member ${key}: ${response.status()} ${await response.text()}`);
        }
        const restored = await withLocalMessagingDb(async (db) => ({
          member: await isConversationMember(db, conversationId, userId(key)),
          revoked: await isMembershipRevoked(db, conversationId, userId(key)),
        }));
        if (!restored.member || restored.revoked) {
          throw new Error(`restore_conversation_membership did not re-add ${key}: ${JSON.stringify(restored)}`);
        }
      },
      isMember: (conversationId, key) =>
        withLocalMessagingDb((db) => isConversationMember(db, conversationId, userId(key))),
      isRevoked: (conversationId, key) =>
        withLocalMessagingDb((db) => isMembershipRevoked(db, conversationId, userId(key))),
    });
  },

  budgets: async ({ phase5World }, use) => {
    const userId = (key: Phase5UserKey) => phase5World.users[key].userId;
    await use({
      exhaust: (key, action = 'message:create', options) =>
        withLocalMessagingDb((db) => exhaustBudget(db, userId(key), action, options)),
      reset: (keys = PHASE5_USER_KEYS, actions) =>
        withLocalMessagingDb((db) => resetBudgets(db, keys.map(userId), actions)),
      count: (key, action) => withLocalMessagingDb((db) => readBudgetCount(db, userId(key), action)),
    });
  },

  serverLog: async ({}, use) => {
    await use(openServerLog());
  },
});

export { expect };
