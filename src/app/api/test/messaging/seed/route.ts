import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import {
  MessagingSeedCleanupInput,
  MessagingSeedOptions,
  MessagingSeedResult,
  MessagingTestSeeder,
  SeedUserDefinition,
} from '@/lib/test-utils/messaging-test-seeder';

const PLAYWRIGHT_SECRET = process.env.PLAYWRIGHT_TEST_SECRET;

const NODE_ENV = process.env.NODE_ENV ?? 'development';

const isProduction = NODE_ENV === 'production';

function requireSecret(request: NextRequest): NextResponse | null {
  if (!PLAYWRIGHT_SECRET) {
    return NextResponse.json(
      { error: 'PLAYWRIGHT_TEST_SECRET is not configured' },
      { status: 500 },
    );
  }

  const providedSecret = request.headers.get('x-test-secret');

  if (providedSecret !== PLAYWRIGHT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
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
  if (isProduction) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const secretError = requireSecret(request);
  if (secretError) {
    return secretError;
  }

  let payload: Partial<MessagingSeedOptions & { users?: SeedUserDefinition[] }> = {};

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
  try {
    users = normalizeSeedUsers(payload.users);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient('service_role');
    const seeder = new MessagingTestSeeder(supabase);

    const seedResult = await seeder.seed({
      runId: payload.runId,
      users,
      roomCount: payload.roomCount,
      includePinnedRoom: payload.includePinnedRoom,
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
  if (isProduction) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
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
