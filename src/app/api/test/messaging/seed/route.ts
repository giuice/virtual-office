import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import {
  MessagingSeedCleanupInput,
  MessagingSeedOptions,
  MessagingSeedResult,
  MessagingTestSeeder,
  SeedUserDefinition,
} from '@/lib/test-utils/messaging-test-seeder';

const PLAYWRIGHT_SECRET = process.env.PLAYWRIGHT_TEST_SECRET;

const markReadSchema = z.object({
  conversationId: z.guid(),
  userId: z.guid(),
  messageIds: z.array(z.guid()).min(1).max(100),
});

/** Simulates losing access: the app has no member-removal path (Phase 4 AC-026). */
const removeMemberSchema = z.object({
  action: z.literal('remove-member'),
  conversationId: z.guid(),
  userId: z.guid(),
});

/** Pre-run sweep of seeded data left by interrupted runs (local Supabase only). */
const sweepLeftoversSchema = z.object({ action: z.literal('sweep-leftovers') }).strict();

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * True only for the local messaging test mode: its flag is set and this
 * server's Supabase URL is loopback (never a hosted project).
 */
function isLocalSupabaseMode(): boolean {
  if (process.env.VO_MESSAGING_LOCAL_SUPABASE !== '1') {
    return false;
  }
  try {
    return LOOPBACK_HOSTS.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname);
  } catch {
    return false;
  }
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';

/** Never served by a production build or by a Vercel production/preview deployment. */
const isBlockedEnvironment =
  NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.VERCEL_ENV === 'preview';

const notFound = () => NextResponse.json({ error: 'Not Found' }, { status: 404 });

/** Constant-time comparison: both sides are hashed to equal-length digests first. */
function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function requireSecret(request: NextRequest): NextResponse | null {
  if (!PLAYWRIGHT_SECRET) {
    return NextResponse.json(
      { error: 'PLAYWRIGHT_TEST_SECRET is not configured' },
      { status: 500 },
    );
  }

  const providedSecret = request.headers.get('x-test-secret') ?? '';

  if (!secretsMatch(providedSecret, PLAYWRIGHT_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Lower-cased emails of the Playwright test accounts
 * (PLAYWRIGHT_PRIMARY/SECONDARY/TERTIARY_EMAIL). The route only provisions,
 * resets, or acts as these accounts.
 */
function seededAccountEmails(): Set<string> {
  return new Set(
    [
      process.env.PLAYWRIGHT_PRIMARY_EMAIL,
      process.env.PLAYWRIGHT_SECONDARY_EMAIL,
      process.env.PLAYWRIGHT_TERTIARY_EMAIL,
    ]
      .filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
      .map((email) => email.trim().toLowerCase()),
  );
}

function requiredEnv(key: string, fallbackError?: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(fallbackError ?? `Missing required environment variable ${key}`);
  }
  return value;
}

function resolveDefaultUsers(): [SeedUserDefinition, SeedUserDefinition] {
  return [
    {
      email: requiredEnv('PLAYWRIGHT_PRIMARY_EMAIL'),
      password: requiredEnv('PLAYWRIGHT_PRIMARY_PASSWORD'),
      displayName: process.env.PLAYWRIGHT_PRIMARY_DISPLAY_NAME ?? 'Playwright Primary',
      role: 'admin',
      status: 'online',
    },
    {
      email: requiredEnv('PLAYWRIGHT_SECONDARY_EMAIL'),
      password: requiredEnv('PLAYWRIGHT_SECONDARY_PASSWORD'),
      displayName: process.env.PLAYWRIGHT_SECONDARY_DISPLAY_NAME ?? 'Playwright Secondary',
      role: 'member',
      status: 'online',
    },
  ];
}

/**
 * Opt-in third group member. It never signs in (reads are recorded through
 * PATCH below), so only its email is required; the password is per-run.
 */
function resolveThirdUser(): SeedUserDefinition {
  return {
    email: requiredEnv('PLAYWRIGHT_TERTIARY_EMAIL'),
    password: process.env.PLAYWRIGHT_TERTIARY_PASSWORD || randomBytes(24).toString('hex'),
    displayName: process.env.PLAYWRIGHT_TERTIARY_DISPLAY_NAME ?? 'Playwright Tertiary',
    role: 'member',
    status: 'offline',
  };
}

function normalizeSeedUsers(users?: SeedUserDefinition[]): [SeedUserDefinition, SeedUserDefinition] {
  if (!users || users.length === 0) {
    return resolveDefaultUsers();
  }

  if (users.length < 2) {
    throw new Error('At least two users are required for messaging drawer scenarios');
  }

  return [users[0], users[1]];
}

function buildCleanupInput(payload: unknown): MessagingSeedCleanupInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Cleanup payload must be an object');
  }

  const objectPayload = payload as Partial<MessagingSeedResult> & {
    companyId?: string;
    userIds?: string[];
    conversationIds?: string[];
    messageIds?: string[];
    spaceIds?: string[];
  };

  const companyId = objectPayload.company?.id ?? objectPayload.companyId;

  if (!companyId) {
    throw new Error('Cleanup payload requires companyId');
  }

  const userIds = new Set<string>([
    ...(objectPayload.users?.map((user) => user.id) ?? []),
    ...(objectPayload.userIds ?? []),
  ]);

  const conversationIds = new Set<string>([
    ...(objectPayload.conversations?.directId
      ? [objectPayload.conversations.directId]
      : []),
    ...(objectPayload.conversations?.roomIds ?? []),
    ...(objectPayload.conversations?.groupId ? [objectPayload.conversations.groupId] : []),
    ...(objectPayload.conversationIds ?? []),
  ]);

  const messageIds = new Set<string>([
    ...(objectPayload.messages?.map((message) => message.id) ?? []),
    ...(objectPayload.messageIds ?? []),
  ]);

  const spaceIds = new Set<string>([
    ...(objectPayload.spaces?.map((space) => space.id) ?? []),
    ...(objectPayload.spaceIds ?? []),
  ]);

  return {
    companyId,
    userIds: Array.from(userIds),
    conversationIds: Array.from(conversationIds),
    messageIds: Array.from(messageIds),
    spaceIds: Array.from(spaceIds),
  };
}

export async function POST(request: NextRequest) {
  if (isBlockedEnvironment) {
    return notFound();
  }

  const secretError = requireSecret(request);
  if (secretError) {
    return secretError;
  }

  let payload: Partial<
    MessagingSeedOptions & { users?: SeedUserDefinition[]; includeThirdMember?: boolean }
  > = {};

  // Accept empty body (defaults) and only error on malformed non-empty JSON
  try {
    const raw = await request.text();
    payload = raw && raw.trim().length > 0 ? JSON.parse(raw) : {};
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload', details: (error as Error).message },
      { status: 400 },
    );
  }

  let users: [SeedUserDefinition, SeedUserDefinition];
  let thirdUser: SeedUserDefinition | undefined;
  try {
    users = normalizeSeedUsers(payload.users);
    thirdUser = payload.includeThirdMember ? resolveThirdUser() : undefined;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }

  // The seeder creates auth users or resets their passwords by email, so it
  // may only touch the configured Playwright accounts.
  const allowedEmails = seededAccountEmails();
  const seedUsers = thirdUser ? [...users, thirdUser] : users;
  if (seedUsers.some((user) => !allowedEmails.has(user.email.trim().toLowerCase()))) {
    return NextResponse.json(
      { error: 'Seed users must be the configured PLAYWRIGHT_*_EMAIL accounts' },
      { status: 403 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient('service_role');
    const seeder = new MessagingTestSeeder(supabase);

    const seedResult = await seeder.seed({
      allowedEmails,
      runId: payload.runId,
      users,
      roomCount: payload.roomCount,
      includePinnedRoom: payload.includePinnedRoom,
      includeGroupConversation: payload.includeGroupConversation,
      historyMessageCount: payload.historyMessageCount,
      thirdUser,
    });

    return NextResponse.json(
      { success: true, data: seedResult },
      { status: 200 },
    );
  } catch (error) {
    console.error('[Messaging Seed Route] Failed to seed test data', error);
    return NextResponse.json(
      { error: 'Failed to seed messaging test data', details: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (isBlockedEnvironment) {
    return notFound();
  }

  const secretError = requireSecret(request);
  if (secretError) {
    return secretError;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload', details: (error as Error).message },
      { status: 400 },
    );
  }

  const isSweep =
    !!payload && typeof payload === 'object' && (payload as { action?: unknown }).action === 'sweep-leftovers';
  if (isSweep) {
    return sweepSeededLeftovers(payload);
  }

  let cleanupInput: MessagingSeedCleanupInput;

  try {
    cleanupInput = buildCleanupInput(payload);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient('service_role');
    const seeder = new MessagingTestSeeder(supabase);
    await seeder.cleanup(cleanupInput);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[Messaging Seed Route] Failed to cleanup test data', error);
    return NextResponse.json(
      { error: 'Failed to clean up messaging test data', details: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * PATCH: record a seeded member's reads of the given messages through the same
 * RPC as PATCH /api/conversations/read — for members that never sign in (the
 * opt-in third member). Body: { conversationId, userId, messageIds }.
 * With { action: 'remove-member', conversationId, userId } it instead removes
 * that member from the conversation (deletes the conversation_members row;
 * star rows are kept), to test a member who lost access.
 * 403 unless userId is a PLAYWRIGHT_*_EMAIL account and every member of the
 * conversation is one too.
 */
export async function PATCH(request: NextRequest) {
  if (isBlockedEnvironment) {
    return notFound();
  }

  const secretError = requireSecret(request);
  if (secretError) {
    return secretError;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid JSON payload', details: (error as Error).message },
      { status: 400 },
    );
  }

  const isRemoveMember =
    !!payload && typeof payload === 'object' && (payload as { action?: unknown }).action === 'remove-member';
  if (isRemoveMember) {
    return removeSeededMember(payload);
  }

  const parsed = markReadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'conversationId, userId (UUIDs), and messageIds (1-100 UUIDs) are required' },
      { status: 400 },
    );
  }
  const conversationId = parsed.data.conversationId.toLowerCase();
  const userId = parsed.data.userId.toLowerCase();
  const messageIds = parsed.data.messageIds.map((id) => id.toLowerCase());

  try {
    const supabase = await createSupabaseServerClient('service_role');
    const seeder = new MessagingTestSeeder(supabase);
    // Only a Playwright account, in a conversation whose members are all
    // Playwright accounts (the shape of every seeded conversation).
    const isSeeded = await seeder.isSeededConversationMember(conversationId, userId, seededAccountEmails());
    if (!isSeeded) {
      return NextResponse.json(
        { error: 'Only seeded Playwright accounts in seeded conversations can be marked read' },
        { status: 403 },
      );
    }
    const recorded = await seeder.markMessagesRead(conversationId, userId, messageIds);
    return NextResponse.json({ success: true, recorded }, { status: 200 });
  } catch (error) {
    console.error('[Messaging Seed Route] Failed to mark messages read', error);
    return NextResponse.json(
      { error: 'Failed to mark messages read', details: (error as Error).message },
      { status: 500 },
    );
  }
}

/**
 * DELETE { action: 'sweep-leftovers' }: removes conversations that earlier
 * interrupted or partially failed runs left behind — seeded names only, and
 * only when every participant and member is a PLAYWRIGHT_*_EMAIL account.
 * Local messaging test mode only (404 otherwise).
 */
async function sweepSeededLeftovers(payload: unknown): Promise<NextResponse> {
  if (!isLocalSupabaseMode()) {
    return notFound();
  }
  if (!sweepLeftoversSchema.safeParse(payload).success) {
    return NextResponse.json(
      { error: "Only { action: 'sweep-leftovers' } is accepted" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient('service_role');
    const seeder = new MessagingTestSeeder(supabase);
    const removed = await seeder.sweepSeededLeftovers(seededAccountEmails());
    return NextResponse.json(
      { success: true, removedConversations: removed.length },
      { status: 200 },
    );
  } catch (error) {
    console.error('[Messaging Seed Route] Failed to sweep leftover test data', error);
    return NextResponse.json(
      { error: 'Failed to sweep leftover messaging test data', details: (error as Error).message },
      { status: 500 },
    );
  }
}

async function removeSeededMember(payload: unknown): Promise<NextResponse> {
  const parsed = removeMemberSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "action 'remove-member', conversationId and userId (UUIDs) are required" },
      { status: 400 },
    );
  }
  const conversationId = parsed.data.conversationId.toLowerCase();
  const userId = parsed.data.userId.toLowerCase();

  try {
    const supabase = await createSupabaseServerClient('service_role');
    const seeder = new MessagingTestSeeder(supabase);
    const isSeeded = await seeder.isSeededConversationMember(conversationId, userId, seededAccountEmails());
    if (!isSeeded) {
      return NextResponse.json(
        { error: 'Only seeded Playwright accounts in seeded conversations can be removed' },
        { status: 403 },
      );
    }
    const removed = await seeder.removeConversationMember(conversationId, userId);
    return NextResponse.json({ success: true, removed }, { status: 200 });
  } catch (error) {
    console.error('[Messaging Seed Route] Failed to remove conversation member', error);
    return NextResponse.json(
      { error: 'Failed to remove conversation member', details: (error as Error).message },
      { status: 500 },
    );
  }
}
