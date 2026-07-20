import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type Request as PlaywrightRequest,
} from '@playwright/test';
import {
  resolvePresenceE2EEnvironment,
  type PresenceE2EAccount,
  type PresenceE2EEnvironment,
} from './local-fixture';

const PASSWORD_LABEL = /^(?:Password|Senha)$/i;
const SIGN_IN_BUTTON_NAME = /^(?:Sign In|Entrar)$/i;

interface RuntimeUser {
  id: string;
  companyId: string | null;
  email: string;
  displayName: string;
}

interface RuntimeSpace {
  id: string;
  companyId: string;
  name: string;
  status: string;
  capacity: number;
  accessControl?: { isPublic?: boolean };
}

interface LoggedInBrowser {
  context: BrowserContext;
  page: Page;
  user: RuntimeUser;
  spaces: RuntimeSpace[];
}

async function warmPresenceScenarioRoutes(request: APIRequestContext): Promise<void> {
  const placeholderId = '00000000-0000-4000-8000-000000000000';
  const responses = await Promise.all([
    request.post('/api/users/sync-profile', { data: {} }),
    request.get(`/api/users/get-by-id?supabase_uid=${placeholderId}`),
    request.get(`/api/companies/get?id=${placeholderId}`),
    request.get('/api/conversations/get'),
    request.get(`/api/users/by-company?companyId=${placeholderId}`),
    request.get('/api/users/list'),
    request.get('/api/presence/snapshot'),
    request.post('/api/presence/sessions', { data: {} }),
    request.post('/api/presence/location', { data: {} }),
    request.post(`/api/presence/sessions/${placeholderId}/heartbeat`),
    request.post(`/api/presence/sessions/${placeholderId}/disconnect`),
    request.get(`/api/spaces?companyId=${placeholderId}`),
    request.get(`/api/spaces/${placeholderId}/details`),
    request.get('/api/neighborhoods'),
    request.post('/api/spaces/knock/request', { data: {} }),
    request.post('/api/spaces/knock/respond', { data: {} }),
    request.get(`/api/spaces/knock/pending?spaceId=${placeholderId}&sessionId=${placeholderId}`),
    request.get(`/api/spaces/knock/status/${placeholderId}?sessionId=${placeholderId}`),
    request.get(`/api/messages/get?conversationId=${placeholderId}&limit=1`),
  ]);
  await Promise.all(responses.map((response) => response.dispose()));
}

async function login(page: Page, account: PresenceE2EAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel(PASSWORD_LABEL).fill(account.password);
  await page.getByRole('button', { name: SIGN_IN_BUTTON_NAME }).click();
  await page.waitForURL(/\/floor-plan/, { timeout: 30_000, waitUntil: 'commit' });
  await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => page.evaluate(async () => {
    const response = await fetch('/api/presence/snapshot');
    if (!response.ok) return false;
    const snapshot = await response.json() as {
      viewerUserId: string;
      users: Array<{ id: string; isConnected: boolean }>;
    };
    const viewerRows = snapshot.users.filter((user) => user.id === snapshot.viewerUserId);
    return viewerRows.length === 1 && viewerRows[0]?.isConnected === true;
  }), {
    message: `${account.email} must have one authoritative connected snapshot row`,
    timeout: 30_000,
  }).toBe(true);
}

async function readRuntimeModel(
  page: Page,
  account: PresenceE2EAccount
): Promise<{ user: RuntimeUser; spaces: RuntimeSpace[] }> {
  const usersPayload = await page.evaluate(async () => {
    const response = await fetch('/api/users/list');
    if (!response.ok) throw new Error(`users/list failed with ${response.status}`);
    return response.json() as Promise<{ users: RuntimeUser[] }>;
  });
  const user = usersPayload.users.find(
    (candidate) => candidate.email.toLowerCase() === account.email.toLowerCase()
  );
  if (!user?.companyId) throw new Error(`No company-bound app user for ${account.email}`);

  const spacesPayload = await page.evaluate(async (companyId) => {
    const response = await fetch(`/api/spaces?companyId=${encodeURIComponent(companyId)}`);
    if (!response.ok) throw new Error(`spaces failed with ${response.status}`);
    return response.json() as Promise<{ spaces: RuntimeSpace[] }>;
  }, user.companyId);
  return { user, spaces: spacesPayload.spaces };
}

async function readViewerCurrentSpaceId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const response = await fetch('/api/presence/snapshot');
    if (!response.ok) throw new Error(`snapshot failed with ${response.status}`);
    const snapshot = await response.json() as {
      viewerUserId: string;
      users: Array<{ id: string; currentSpaceId: string | null }>;
    };
    return snapshot.users.find((user) => user.id === snapshot.viewerUserId)?.currentSpaceId ?? null;
  });
}

async function openLoggedInBrowser(
  browser: Browser,
  account: PresenceE2EAccount
): Promise<LoggedInBrowser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  const model = await readRuntimeModel(page, account);
  return { context, page, ...model };
}

function spaceCard(page: Page, spaceId: string) {
  return page.locator(`[data-testid="space-${spaceId}"]`);
}

async function moveThroughUi(page: Page, spaceId: string): Promise<void> {
  const card = spaceCard(page, spaceId);
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === 'POST' && new URL(response.url()).pathname === '/api/presence/location';
  }, { timeout: 30_000 });
  await card.click();
  const response = await responsePromise;
  const responseBody = await response.text();
  expect(response.ok(), `location transition failed (${response.status()}): ${responseBody}`).toBe(true);
  await expect(card).toHaveAttribute('data-user-in-space', 'true', { timeout: 30_000 });
}

async function expectSpaceAvatarExactlyOnce(page: Page, displayName: string): Promise<void> {
  await expect(
    page.locator('[data-testid^="space-"]').getByLabel(`${displayName}'s avatar`, { exact: true })
  ).toHaveCount(1, { timeout: 30_000 });
}

async function openSpaceActions(page: Page, space: RuntimeSpace): Promise<void> {
  await spaceCard(page, space.id).getByRole('button', { name: `Actions for ${space.name}` }).click();
}

function waitForPendingKnockDelivery(
  page: Page,
  spaceId: string,
  requesterId: string
) {
  return page.waitForResponse(async (response) => {
    const url = new URL(response.url());
    if (
      url.pathname !== '/api/spaces/knock/pending' ||
      url.searchParams.get('spaceId') !== spaceId ||
      !response.ok()
    ) {
      return false;
    }
    const body = await response.json() as {
      requests?: Array<{ requester?: { id?: string } }>;
    };
    return body.requests?.some((request) => request.requester?.id === requesterId) === true;
  }, { timeout: 30_000 });
}

async function waitForInitialSnapshotReconciliation(page: Page): Promise<void> {
  const pendingSnapshotRequests = new Set<PlaywrightRequest>();
  let lastSnapshotActivityAt = Date.now();
  const isSnapshotRequest = (request: PlaywrightRequest): boolean =>
    new URL(request.url()).pathname === '/api/presence/snapshot';
  const handleRequest = (request: PlaywrightRequest): void => {
    if (!isSnapshotRequest(request)) return;
    pendingSnapshotRequests.add(request);
    lastSnapshotActivityAt = Date.now();
  };
  const handleRequestSettled = (request: PlaywrightRequest): void => {
    if (!pendingSnapshotRequests.delete(request)) return;
    lastSnapshotActivityAt = Date.now();
  };

  page.on('request', handleRequest);
  page.on('requestfinished', handleRequestSettled);
  page.on('requestfailed', handleRequestSettled);
  try {
    await expect(page.locator('[data-presence-realtime-status]')).toHaveAttribute(
      'data-presence-realtime-status',
      'subscribed',
      { timeout: 30_000 },
    );
    await expect.poll(() => {
      const now = Date.now();
      return pendingSnapshotRequests.size === 0 &&
        now - lastSnapshotActivityAt >= 2_500;
    }, {
      message: 'initial immediate and delayed snapshot reconciliation must settle',
      timeout: 10_000,
      intervals: [100, 250, 500],
    }).toBe(true);
  } finally {
    page.off('request', handleRequest);
    page.off('requestfinished', handleRequestSettled);
    page.off('requestfailed', handleRequestSettled);
  }
}

async function closeContextsBestEffort(...contexts: BrowserContext[]): Promise<void> {
  await Promise.race([
    Promise.allSettled(contexts.map((context) => context.close())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

test.describe('Presence multi-identity operability', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  let environment: PresenceE2EEnvironment;

  test.beforeAll(async () => {
    environment = await resolvePresenceE2EEnvironment();
  });

  test('keeps tenant Realtime isolated and completes movement plus Knock in both directions', async ({ browser, request }) => {
    // Next dev may Fast Refresh open pages when a dynamic route compiles for the
    // first time. Compile every route used by this scenario before opening any
    // browser context so that refresh cannot abort an in-flight transition.
    await warmPresenceScenarioRoutes(request);
    const admin = await openLoggedInBrowser(browser, environment.admin);
    const member = await openLoggedInBrowser(browser, environment.member);
    const external = await openLoggedInBrowser(browser, environment.external);

    try {
      expect(admin.user.companyId).toBe(member.user.companyId);
      expect(external.user.companyId).not.toBe(admin.user.companyId);

      const adminSpaceIds = admin.spaces.map((space) => space.id).sort();
      const memberSpaceIds = member.spaces.map((space) => space.id).sort();
      expect(memberSpaceIds).toEqual(adminSpaceIds);
      expect(external.spaces.some((space) => adminSpaceIds.includes(space.id))).toBe(false);

      const publicSpaces = admin.spaces.filter(
        (space) =>
          space.accessControl?.isPublic !== false &&
          ['active', 'available'].includes(space.status) &&
          space.capacity >= 2
      );
      const privateShared = admin.spaces.find(
        (space) => space.accessControl?.isPublic === false
      );
      expect(publicSpaces.length, 'two direct-entry public rooms are required').toBeGreaterThanOrEqual(2);
      expect(privateShared, 'one role-authorized private room is required').toBeTruthy();
      const [publicSpaceA, publicSpaceB] = publicSpaces;
      if (!publicSpaceA || !publicSpaceB || !privateShared) {
        throw new Error('Presence operability fixture is missing its required rooms.');
      }

      let externalSnapshotRequests = 0;
      external.page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/presence/snapshot') {
          externalSnapshotRequests += 1;
        }
      });
      // Realtime performs its own local reconciliation two seconds after SUBSCRIBED.
      // Establish the isolation observation window only after the full delay
      // horizon is observed with no snapshot request still in flight.
      await waitForInitialSnapshotReconciliation(external.page);
      externalSnapshotRequests = 0;
      let adminLocationRequests = 0;
      let memberLocationRequests = 0;
      let externalLocationRequests = 0;
      const countLocationRequest = (increment: () => void) => (request: PlaywrightRequest) => {
        if (
          request.method() === 'POST' &&
          new URL(request.url()).pathname === '/api/presence/location'
        ) {
          increment();
        }
      };
      admin.page.on('request', countLocationRequest(() => { adminLocationRequests += 1; }));
      member.page.on('request', countLocationRequest(() => { memberLocationRequests += 1; }));
      external.page.on('request', countLocationRequest(() => { externalLocationRequests += 1; }));

      const adminInitialSpaceId = await readViewerCurrentSpaceId(admin.page);
      const memberInitialSpaceId = await readViewerCurrentSpaceId(member.page);
      const adminMovementTarget = publicSpaces.find((space) => space.id !== adminInitialSpaceId);
      const memberMovementTarget = publicSpaces.find((space) => space.id !== memberInitialSpaceId);
      expect(adminMovementTarget, 'admin needs a public room different from its initial placement').toBeTruthy();
      expect(memberMovementTarget, 'member needs a public room different from its initial placement').toBeTruthy();
      if (!adminMovementTarget || !memberMovementTarget) {
        throw new Error('Presence operability fixture cannot exercise a real movement.');
      }

      await moveThroughUi(admin.page, adminMovementTarget.id);
      await moveThroughUi(member.page, memberMovementTarget.id);
      await expectSpaceAvatarExactlyOnce(admin.page, admin.user.displayName);
      await expectSpaceAvatarExactlyOnce(admin.page, member.user.displayName);
      await expectSpaceAvatarExactlyOnce(member.page, admin.user.displayName);
      await expectSpaceAvatarExactlyOnce(member.page, member.user.displayName);

      await external.page.waitForTimeout(3_000);
      await expect(external.page.locator('[data-presence-realtime-status]')).toHaveAttribute(
        'data-presence-realtime-status',
        'subscribed',
        { timeout: 10_000 },
      );
      expect(
        externalSnapshotRequests,
        'another company movement must not invalidate the external company snapshot'
      ).toBe(0);
      const externalSnapshot = await external.page.evaluate(async () => {
        const response = await fetch('/api/presence/snapshot');
        if (!response.ok) throw new Error(`snapshot failed with ${response.status}`);
        return response.json() as Promise<{ companyId: string; users: Array<{ id: string }> }>;
      });
      expect(externalSnapshot.companyId).toBe(external.user.companyId);
      expect(externalSnapshot.users.map((user) => user.id)).toEqual([external.user.id]);

      await moveThroughUi(member.page, privateShared.id);
      await expect(
        spaceCard(admin.page, privateShared.id).getByLabel(
          `${member.user.displayName}'s avatar`,
          { exact: true }
        )
      ).toHaveCount(1, { timeout: 30_000 });

      await openSpaceActions(admin.page, privateShared);
      await expect(admin.page.getByRole('menuitem', { name: 'Enter Space' })).toBeVisible();
      await expect(admin.page.getByRole('menuitem', { name: 'Knock Instead' })).toBeVisible();
      const firstDelivery = waitForPendingKnockDelivery(
        member.page,
        privateShared.id,
        admin.user.id
      );
      await admin.page.getByRole('menuitem', { name: 'Knock Instead' }).click();
      await firstDelivery;

      const approveButton = member.page.getByRole('button', {
        name: `Let ${admin.user.displayName} in`,
      });
      await expect(approveButton).toBeVisible({ timeout: 30_000 });
      await approveButton.click({ timeout: 30_000 });
      await expect(spaceCard(admin.page, privateShared.id)).toHaveAttribute(
        'data-user-in-space',
        'true',
        { timeout: 30_000 }
      );
      await expectSpaceAvatarExactlyOnce(admin.page, admin.user.displayName);
      await expectSpaceAvatarExactlyOnce(admin.page, member.user.displayName);

      await moveThroughUi(member.page, publicSpaceB.id);
      await openSpaceActions(member.page, privateShared);
      await expect(member.page.getByRole('menuitem', { name: 'Enter Space' })).toBeVisible();
      await expect(member.page.getByRole('menuitem', { name: 'Knock Instead' })).toBeVisible();
      const secondDelivery = waitForPendingKnockDelivery(
        admin.page,
        privateShared.id,
        member.user.id
      );
      await member.page.getByRole('menuitem', { name: 'Knock Instead' }).click();
      await secondDelivery;

      const denyButton = admin.page.getByRole('button', {
        name: `Deny ${member.user.displayName}`,
      });
      await expect(denyButton).toBeVisible({ timeout: 30_000 });
      await denyButton.click({ timeout: 30_000 });
      await expect(spaceCard(member.page, privateShared.id)).toHaveAttribute(
        'data-user-in-space',
        'false'
      );
      await expect(spaceCard(admin.page, privateShared.id)).toHaveAttribute(
        'data-user-in-space',
        'true'
      );
      expect(adminLocationRequests, 'admin should perform one manual move and one approved entry')
        .toBe(2);
      expect(memberLocationRequests, 'member should perform three explicit moves')
        .toBe(3);
      expect(externalLocationRequests, 'external tenant should never move during the scenario')
        .toBe(0);
    } finally {
      await closeContextsBestEffort(admin.context, member.context, external.context);
    }
  });
});
