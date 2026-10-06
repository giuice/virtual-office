import {
  test as base,
  expect,
  type Page,
  type Request,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
} from '@playwright/test';

import { LOCAL_MESSAGING_FLAG, isHostedSupabaseUrl } from '../helpers/local-supabase-mode';

type MessagingTestData = {
  runId: string;
  companyId: string;
  directConversationId: string;
  roomConversationIds: string[];
  /** Present when seeded with includeGroupConversation or historyMessageCount. */
  groupConversationId?: string;
  /** Group conversation holding historyMessageCount messages, when requested. */
  historyConversationId?: string;
  messageIds: string[];
  spaceIds: string[];
  primary: {
    email: string;
    password: string;
    userId: string;
  };
  secondary: {
    email: string;
    password: string;
    userId: string;
  };
  /** Present when seeded with includeThirdMember: a group member that never signs in. */
  tertiary?: {
    userId: string;
  };
};

const PLAYWRIGHT_SECRET = process.env.PLAYWRIGHT_TEST_SECRET;

if (!PLAYWRIGHT_SECRET) {
  console.warn('[messaging fixtures] PLAYWRIGHT_TEST_SECRET is not configured. Messaging drawer tests will fail.');
}

/** Opt-in extras for the seed route; the default seed is unchanged. */
export interface MessagingSeedOptions {
  /** Defaults to true in the seeder: the primary has roomConversationIds[0] pinned. */
  includePinnedRoom?: boolean;
  includeGroupConversation?: boolean;
  historyMessageCount?: number;
  /** Adds a third member (never signs in) to the group conversation; implies a group. */
  includeThirdMember?: boolean;
}

async function seedMessagingData(
  request: APIRequestContext,
  seedOptions: MessagingSeedOptions,
): Promise<MessagingTestData> {
  const response = await request.post('/api/test/messaging/seed', {
    headers: {
      'x-test-secret': PLAYWRIGHT_SECRET ?? '',
    },
    data: seedOptions,
  });

  if (!response.ok()) {
    throw new Error(`Failed to seed messaging data: ${response.status()} ${response.statusText()}`);
  }

  const body = await response.json();

  if (!body?.success || !body?.data) {
    throw new Error('Seed response missing data');
  }

  const data = body.data as any;

  return {
    runId: data.runId,
    companyId: data.company.id,
    directConversationId: data.conversations.directId,
    roomConversationIds: data.conversations.roomIds,
    groupConversationId: data.conversations.groupId,
    historyConversationId: data.conversations.historyId,
    messageIds: data.messages.map((message: any) => message.id),
    spaceIds: data.spaces.map((space: any) => space.id),
    primary: {
      email: data.users[0].email,
      password: process.env.PLAYWRIGHT_PRIMARY_PASSWORD ?? '',
      userId: data.users[0].id,
    },
    secondary: {
      email: data.users[1].email,
      password: process.env.PLAYWRIGHT_SECONDARY_PASSWORD ?? '',
      userId: data.users[1].id,
    },
    ...(data.users[2] ? { tertiary: { userId: data.users[2].id } } : {}),
  };
}

/**
 * Records `userId`'s reads of `messageIds` through the seed route, which calls
 * the same RPC as PATCH /api/conversations/read. For members that never sign
 * in (the opt-in third member). Returns the number of new receipts.
 */
export async function markReadAsSeededMember(
  request: APIRequestContext,
  input: { conversationId: string; userId: string; messageIds: string[] },
): Promise<number> {
  const response = await request.patch('/api/test/messaging/seed', {
    headers: {
      'x-test-secret': PLAYWRIGHT_SECRET ?? '',
    },
    data: input,
  });
  if (!response.ok()) {
    throw new Error(`Failed to mark messages read: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { recorded: number };
  return body.recorded;
}

/**
 * Removes a seeded member from a seeded conversation through the seed route
 * (the app has no member-removal path), to test a member who lost access.
 * Their star rows are kept. Returns the number of membership rows removed.
 */
export async function removeSeededMember(
  request: APIRequestContext,
  input: { conversationId: string; userId: string },
): Promise<number> {
  const response = await request.patch('/api/test/messaging/seed', {
    headers: {
      'x-test-secret': PLAYWRIGHT_SECRET ?? '',
    },
    data: { action: 'remove-member', ...input },
  });
  if (!response.ok()) {
    throw new Error(`Failed to remove member: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { removed: number };
  return body.removed;
}

async function cleanupMessagingData(request: APIRequestContext, data: MessagingTestData) {
  await request.delete('/api/test/messaging/seed', {
    headers: {
      'x-test-secret': PLAYWRIGHT_SECRET ?? '',
    },
    data: {
      companyId: data.companyId,
      userIds: [data.primary.userId, data.secondary.userId],
      conversationIds: [
        data.directConversationId,
        ...data.roomConversationIds,
        ...(data.groupConversationId ? [data.groupConversationId] : []),
      ],
      messageIds: data.messageIds,
      spaceIds: data.spaceIds,
    },
  });
}

const SIGNED_IN_URL = /dashboard|floor-plan/;
const SIGN_IN_TIMEOUT_MS = 30_000;

const isPasswordSignInRequest = (request: Request) =>
  request.method() === 'POST' &&
  new URL(request.url()).pathname === '/auth/v1/token' &&
  new URL(request.url()).searchParams.get('grant_type') === 'password';

/**
 * Signs in through the login page. The browser calls Supabase Auth directly;
 * in local mode that request crosses the host → Docker port forward. When it
 * fails in transit (it never reaches the Auth gateway, which logs nothing for
 * it) the page shows "Unable to reach the authentication service". Only in
 * that case, and only once, the form is submitted again; the resubmission is
 * recorded on the test. Every other outcome (wrong credentials, a rate limit,
 * a second transport failure, no redirect) fails with what the page showed.
 */
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  // The login page is localized (pt-BR today); match either language.
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^(password|senha)$/i).fill(password);
  const signInButton = page.getByRole('button', { name: /^(sign in|entrar)$/i });
  // The form's error message (Next's empty route announcer is also an alert).
  const formAlert = page.getByRole('alert').filter({ hasText: /\S/ });

  const submit = async (): Promise<string> => {
    const transportFailure = page
      .waitForEvent('requestfailed', { predicate: isPasswordSignInRequest, timeout: SIGN_IN_TIMEOUT_MS })
      .then((request) => request.failure()?.errorText ?? 'unknown network error');
    const signedIn = page
      .waitForURL(SIGNED_IN_URL, { timeout: SIGN_IN_TIMEOUT_MS })
      .then(() => 'signed-in' as const);
    // Whichever settles second is no longer awaited.
    transportFailure.catch(() => {});
    signedIn.catch(() => {});
    await signInButton.click();
    return Promise.race([signedIn, transportFailure]);
  };

  const describeFailure = async (reason: string) => {
    const pageAlert = (await formAlert.allInnerTexts().catch(() => [])).join(' | ');
    return `Sign-in as ${email} failed: ${reason}. Login page alert: ${pageAlert || 'none'}`;
  };

  let outcome: string;
  try {
    outcome = await submit();
  } catch (error) {
    throw new Error(await describeFailure(String(error)), { cause: error });
  }
  if (outcome === 'signed-in') return;

  // The form re-enables after the error; resubmit the same credentials.
  await expect(formAlert).toBeVisible();
  test.info().annotations.push({
    type: 'auth-transport-retry',
    description: `${email}: sign-in request failed in transit (${outcome}; page: "${await formAlert.innerText()}"); submitted once more`,
  });
  try {
    outcome = await submit();
  } catch (error) {
    throw new Error(await describeFailure(String(error)), { cause: error });
  }
  if (outcome !== 'signed-in') {
    throw new Error(await describeFailure(`sign-in request failed in transit twice (${outcome})`));
  }
}

async function createStorageState(browser: Browser, email: string, password: string): Promise<AuthStorageState> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const verifyTraffic = guardLocalSupabaseTraffic(page, `login ${email}`);
  await login(page, email, password);
  const state = await context.storageState();
  await context.close();
  verifyTraffic();
  return state;
}

type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const isLocalSupabaseMode = process.env[LOCAL_MESSAGING_FLAG] === '1';

/**
 * Local mode only: record every browser request and fail the test if any of
 * them reached a hosted Supabase domain. The Supabase hosts seen are attached
 * as an annotation so each run carries its own network evidence.
 */
function guardLocalSupabaseTraffic(page: Page, label: string): () => void {
  if (!isLocalSupabaseMode) {
    return () => {};
  }
  const supabaseHosts = new Set<string>();
  const hostedRequests: string[] = [];
  const record = (url: string) => {
    if (isHostedSupabaseUrl(url)) {
      hostedRequests.push(new URL(url).host);
    } else if (/\/(rest|auth|realtime|storage)\/v1\//.test(url)) {
      supabaseHosts.add(new URL(url).host);
    }
  };
  page.on('request', (request) => record(request.url()));
  // Realtime runs over WebSocket, which does not emit 'request' events.
  page.on('websocket', (socket) => record(socket.url()));
  return () => {
    test.info().annotations.push({
      type: 'supabase-hosts',
      description: `${label}: ${[...supabaseHosts].join(', ') || 'none'}`,
    });
    expect(hostedRequests, `${label} sent requests to a hosted Supabase project`).toEqual([]);
  };
}

/**
 * Presence auto-placement shows a toast ("Welcome! You've been placed in …" /
 * "Reconnected to …") after every page load. The toaster sits bottom-right,
 * over the drawer composer, and hovering it pauses its auto-dismiss, so a
 * click aimed at the send button could wait on it indefinitely. Close it
 * whenever it is visible before an action; it is never what a messaging test
 * is exercising.
 */
async function closePlacementToasts(page: Page): Promise<void> {
  const placementToast = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: /Welcome! You've been placed in|Reconnected to/ });
  await page.addLocatorHandler(placementToast, async (toast) => {
    // Dispatched rather than clicked: the toast can appear while a modal
    // Radix menu is open, which disables pointer events outside the menu.
    // A toast that is already leaving has no close button any more; do not
    // block the interrupted action waiting for one (it dismisses itself).
    await toast
      .locator('[data-close-button]')
      .first()
      .dispatchEvent('click', undefined, { timeout: 2_000 })
      .catch(() => {});
  });
}

type MessagingFixtures = {
  /** Override per file with test.use({ messagingSeedOptions: { ... } }). */
  messagingSeedOptions: MessagingSeedOptions;
  primaryPage: Page;
  secondaryPage: Page;
  messagingData: MessagingTestData;
  primaryStorageState: AuthStorageState;
  secondaryStorageState: AuthStorageState;
};

export const test = base.extend<MessagingFixtures>({
  messagingSeedOptions: [{}, { option: true }],
  messagingData: async ({ request, messagingSeedOptions }, use) => {
    if (!PLAYWRIGHT_SECRET) {
      throw new Error('PLAYWRIGHT_TEST_SECRET must be set');
    }

    const data = await seedMessagingData(request, messagingSeedOptions);

    try {
      await use(data);
    } finally {
      await cleanupMessagingData(request, data);
    }
  },
  primaryStorageState: async ({ browser, messagingData }, use) => {
    const state = await createStorageState(browser, messagingData.primary.email, messagingData.primary.password);
    await use(state);
  },
  secondaryStorageState: async ({ browser, messagingData }, use) => {
    const state = await createStorageState(browser, messagingData.secondary.email, messagingData.secondary.password);
    await use(state);
  },
  primaryPage: async ({ browser, primaryStorageState }, use) => {
    const context = await browser.newContext({ storageState: primaryStorageState });
    const page = await context.newPage();
    const verifyTraffic = guardLocalSupabaseTraffic(page, 'primary');
    await closePlacementToasts(page);
    await use(page);
    await context.close();
    verifyTraffic();
  },
  secondaryPage: async ({ browser, secondaryStorageState }, use) => {
    const context = await browser.newContext({ storageState: secondaryStorageState });
    const page = await context.newPage();
    const verifyTraffic = guardLocalSupabaseTraffic(page, 'secondary');
    await closePlacementToasts(page);
    await use(page);
    await context.close();
    verifyTraffic();
  },
});

export { expect };
