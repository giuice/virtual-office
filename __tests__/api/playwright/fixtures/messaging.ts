import {
  test as base,
  expect,
  type Page,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
} from '@playwright/test';

type MessagingTestData = {
  runId: string;
  companyId: string;
  directConversationId: string;
  roomConversationIds: string[];
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
};

const PLAYWRIGHT_SECRET = process.env.PLAYWRIGHT_TEST_SECRET;

if (!PLAYWRIGHT_SECRET) {
  console.warn('[messaging fixtures] PLAYWRIGHT_TEST_SECRET is not configured. Messaging drawer tests will fail.');
}

async function seedMessagingData(request: APIRequestContext): Promise<MessagingTestData> {
  const response = await request.post('/api/test/messaging/seed', {
    headers: {
      'x-test-secret': PLAYWRIGHT_SECRET ?? '',
    },
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
  };
}

async function cleanupMessagingData(request: APIRequestContext, data: MessagingTestData) {
  await request.delete('/api/test/messaging/seed', {
    headers: {
      'x-test-secret': PLAYWRIGHT_SECRET ?? '',
    },
    data: {
      companyId: data.companyId,
      userIds: [data.primary.userId, data.secondary.userId],
      conversationIds: [data.directConversationId, ...data.roomConversationIds],
      messageIds: data.messageIds,
      spaceIds: data.spaceIds,
    },
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(/dashboard|floor-plan/, { timeout: 30_000 });
}

async function createStorageState(browser: Browser, email: string, password: string): Promise<AuthStorageState> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  const state = await context.storageState();
  await context.close();
  return state;
}

type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

type MessagingFixtures = {
  primaryPage: Page;
  secondaryPage: Page;
  messagingData: MessagingTestData;
  primaryStorageState: AuthStorageState;
  secondaryStorageState: AuthStorageState;
};

export const test = base.extend<MessagingFixtures>({
  messagingData: async ({ request }, use) => {
    if (!PLAYWRIGHT_SECRET) {
      throw new Error('PLAYWRIGHT_TEST_SECRET must be set');
    }

    const data = await seedMessagingData(request);

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
    await use(page);
    await context.close();
  },
  secondaryPage: async ({ browser, secondaryStorageState }, use) => {
    const context = await browser.newContext({ storageState: secondaryStorageState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
