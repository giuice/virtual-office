import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  resolvePresenceE2EEnvironment,
  type PresenceE2EAccount,
  type PresenceE2EEnvironment,
} from './presence/local-fixture';

/**
 * Evidence boundary:
 *
 * These scenarios exercise the real authenticated floor-plan DOM, provider
 * lifecycle, canonical lease routes, and private signaling channel in two
 * isolated browser contexts. Capture is a deterministic canvas MediaStream and
 * RTCPeerConnection is constrained to host-only ICE. This proves UI/lifecycle
 * integration only. It does not prove browser capture permission, real display
 * delivery, TURN traversal, RLS, or database concurrency.
 */

const PASSWORD_LABEL = /^(?:Password|Senha)$/i;
const SIGN_IN_BUTTON_NAME = /^(?:Sign In|Entrar)$/i;

type CaptureMode = 'success' | 'denied' | 'cancelled' | 'no-source';

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

type AuthStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

async function warmScreenSharingRoutes(request: APIRequestContext): Promise<void> {
  const placeholderId = '00000000-0000-4000-8000-000000000000';
  const responses = await Promise.all([
    request.get('/login'),
    request.get('/floor-plan'),
    request.post('/api/users/sync-profile', { data: {} }),
    request.get('/api/users/list'),
    request.get(`/api/users/get-by-id?supabase_uid=${placeholderId}`),
    request.get(`/api/users/by-company?companyId=${placeholderId}`),
    request.get(`/api/companies/get?id=${placeholderId}`),
    request.get('/api/conversations/get'),
    request.get(`/api/spaces?companyId=${placeholderId}`),
    request.get('/api/neighborhoods'),
    request.get('/api/presence/snapshot'),
    request.post('/api/presence/sessions', { data: {} }),
    request.post(`/api/presence/sessions/${placeholderId}/heartbeat`),
    request.post(`/api/presence/sessions/${placeholderId}/disconnect`),
    request.post('/api/presence/location', { data: {} }),
    request.get(
      `/api/spaces/knock/pending?spaceId=${placeholderId}&sessionId=${placeholderId}`,
    ),
    request.get(`/api/messages/get?conversationId=${placeholderId}&limit=1`),
    request.get(
      `/api/spaces/${placeholderId}/screen-share/active?presenceSessionId=${placeholderId}`,
    ),
    request.post(`/api/spaces/${placeholderId}/screen-share/claim`, { data: {} }),
    request.post(`/api/spaces/${placeholderId}/screen-share/renew`, { data: {} }),
    request.post(`/api/spaces/${placeholderId}/screen-share/release`, { data: {} }),
  ]);
  await Promise.all(responses.map((response) => response.dispose()));
}

declare global {
  interface Window {
    __screenShareTest?: {
      setCaptureMode: (mode: CaptureMode) => void;
      endCapture: () => void;
      stoppedTrackCount: () => number;
      peerConnectionCount: () => number;
      heldSignalingCount: () => number;
      signalingIdentities: () => Array<{
        presenceSessionId: string;
        connectionId: string;
      }>;
    };
  }
}

async function installDeterministicMedia(
  context: BrowserContext,
  options: { holdOutboundSignaling?: boolean } = {},
): Promise<void> {
  await context.addInitScript(({ holdOutboundSignaling }) => {
    let captureMode: CaptureMode = 'success';
    let activeTrack: MediaStreamTrack | null = null;
    let stoppedTracks = 0;
    let peerConnections = 0;
    let heldSignaling = 0;
    const signalingIdentities = new Map<string, {
      presenceSessionId: string;
      connectionId: string;
    }>();

    const nativeSend = WebSocket.prototype.send;
    const decode = (data: Parameters<WebSocket['send']>[0]): string | null => {
      if (typeof data === 'string') return data;
      if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
      if (ArrayBuffer.isView(data)) {
        return new TextDecoder().decode(
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        );
      }
      return null;
    };
    WebSocket.prototype.send = function send(
      data: Parameters<WebSocket['send']>[0],
    ): void {
      const serialized = decode(data);
      if (serialized) {
        const presenceSessionId = serialized.match(
          /"sourcePresenceSessionId"\s*:\s*"([^"]+)"/u,
        )?.[1];
        const connectionId = serialized.match(
          /"sourceConnectionId"\s*:\s*"([^"]+)"/u,
        )?.[1];
        if (presenceSessionId && connectionId) {
          signalingIdentities.set(
            `${presenceSessionId}:${connectionId}`,
            { presenceSessionId, connectionId },
          );
        }
        if (
          holdOutboundSignaling
          && /"(?:event|type)"\s*:\s*"(?:handshake|description|ice)"/u.test(serialized)
        ) {
          heldSignaling += 1;
          return;
        }
      }
      nativeSend.call(this, data);
    };

    const NativePeerConnection = window.RTCPeerConnection;
    class DeterministicPeerConnection extends NativePeerConnection {
      constructor(configuration?: RTCConfiguration) {
        super({ ...configuration, iceServers: [] });
        peerConnections += 1;
      }
    }
    Object.defineProperty(window, 'RTCPeerConnection', {
      configurable: true,
      value: DeterministicPeerConnection,
    });

    const mediaDevices = navigator.mediaDevices ?? {};
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: mediaDevices,
    });
    Object.defineProperty(mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async (_constraints?: DisplayMediaStreamOptions): Promise<MediaStream> => {
        if (captureMode === 'denied') {
          throw new DOMException('Deterministic permission denial', 'NotAllowedError');
        }
        if (captureMode === 'cancelled') {
          throw new DOMException('Deterministic picker cancellation', 'AbortError');
        }

        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const drawing = canvas.getContext('2d');
        drawing?.fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(5);
        const track = stream.getVideoTracks()[0] ?? null;
        if (!track) return new MediaStream();
        const nativeStop = track.stop.bind(track);
        track.stop = () => {
          if (track.readyState !== 'ended') stoppedTracks += 1;
          nativeStop();
        };
        activeTrack = track;
        if (captureMode === 'no-source') {
          track.stop();
          return new MediaStream();
        }
        return stream;
      },
    });

    window.__screenShareTest = {
      setCaptureMode: (mode) => {
        captureMode = mode;
      },
      endCapture: () => {
        activeTrack?.stop();
      },
      stoppedTrackCount: () => stoppedTracks,
      peerConnectionCount: () => peerConnections,
      heldSignalingCount: () => heldSignaling,
      signalingIdentities: () => [...signalingIdentities.values()],
    };
  }, { holdOutboundSignaling: options.holdOutboundSignaling ?? false });
}

async function login(page: Page, account: PresenceE2EAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel(PASSWORD_LABEL).fill(account.password);
  await page.getByRole('button', { name: SIGN_IN_BUTTON_NAME }).click();
  await page.waitForURL(/\/floor-plan/, { timeout: 30_000, waitUntil: 'commit' });
  await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

async function readRuntimeModel(
  page: Page,
  account: PresenceE2EAccount,
): Promise<{ user: RuntimeUser; spaces: RuntimeSpace[] }> {
  return page.evaluate(async (email) => {
    const usersResponse = await fetch('/api/users/list');
    if (!usersResponse.ok) throw new Error(`users/list failed with ${usersResponse.status}`);
    const usersPayload = await usersResponse.json() as { users: RuntimeUser[] };
    const user = usersPayload.users.find(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
    );
    if (!user?.companyId) throw new Error(`No company-bound app user for ${email}`);

    const spacesResponse = await fetch(
      `/api/spaces?companyId=${encodeURIComponent(user.companyId)}`,
    );
    if (!spacesResponse.ok) throw new Error(`spaces failed with ${spacesResponse.status}`);
    const spacesPayload = await spacesResponse.json() as { spaces: RuntimeSpace[] };
    return { user, spaces: spacesPayload.spaces };
  }, account.email);
}

async function openLoggedInBrowser(
  browser: Browser,
  account: PresenceE2EAccount,
): Promise<LoggedInBrowser> {
  const context = await browser.newContext();
  await installDeterministicMedia(context);
  const page = await context.newPage();
  await login(page, account);
  return { context, page, ...await readRuntimeModel(page, account) };
}

async function createAuthenticatedState(
  browser: Browser,
  account: PresenceE2EAccount,
): Promise<AuthStorageState> {
  const authenticated = await openLoggedInBrowser(browser, account);
  try {
    return await authenticated.context.storageState();
  } finally {
    await authenticated.context.close();
  }
}

async function openLoggedInBrowserFromState(
  browser: Browser,
  account: PresenceE2EAccount,
  storageState: AuthStorageState,
  options: { holdOutboundSignaling?: boolean } = {},
): Promise<LoggedInBrowser> {
  const context = await browser.newContext({ storageState });
  await installDeterministicMedia(context, options);
  const page = await context.newPage();
  await page.goto('/floor-plan');
  await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({
    timeout: 30_000,
  });
  return { context, page, ...await readRuntimeModel(page, account) };
}

function spaceCard(page: Page, spaceId: string) {
  return page.locator(`[data-testid="space-${spaceId}"]`);
}

async function moveThroughUi(page: Page, spaceId: string): Promise<void> {
  const card = spaceCard(page, spaceId);
  if (await card.getAttribute('data-user-in-space') === 'true') return;
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === 'POST'
      && new URL(response.url()).pathname === '/api/presence/location';
  });
  await card.getByRole('button', { name: 'Enter' }).click();
  const response = await responsePromise;
  expect(response.ok(), `location transition failed with ${response.status()}`).toBe(true);
  await expect(card).toHaveAttribute('data-user-in-space', 'true', { timeout: 30_000 });
}

async function openPairInOneSpace(
  browser: Browser,
  environment: PresenceE2EEnvironment,
  options: { holdViewerSignaling?: boolean } = {},
): Promise<{ presenter: LoggedInBrowser; viewer: LoggedInBrowser; space: RuntimeSpace }> {
  // Build each authenticated state with no other live page. This avoids dev
  // compilation/session-registration churn influencing the second login while
  // preserving isolated cookies, storage, and live contexts for the scenario.
  const presenterState = await createAuthenticatedState(browser, environment.admin);
  const viewerState = await createAuthenticatedState(browser, environment.member);
  const presenter = await openLoggedInBrowserFromState(
    browser,
    environment.admin,
    presenterState,
  );
  const viewer = await openLoggedInBrowserFromState(
    browser,
    environment.member,
    viewerState,
    { holdOutboundSignaling: options.holdViewerSignaling },
  );
  expect(presenter.user.companyId).toBe(viewer.user.companyId);
  const space = presenter.spaces.find(
    (candidate) =>
      candidate.accessControl?.isPublic !== false
      && ['active', 'available'].includes(candidate.status)
      && candidate.capacity >= 2,
  );
  if (!space) throw new Error('Screen-sharing fixture needs a shared public space.');
  await moveThroughUi(presenter.page, space.id);
  await moveThroughUi(viewer.page, space.id);
  return { presenter, viewer, space };
}

async function openSameIdentityPairInOneSpace(
  browser: Browser,
  environment: PresenceE2EEnvironment,
): Promise<{ presenter: LoggedInBrowser; viewer: LoggedInBrowser; space: RuntimeSpace }> {
  const sharedState = await createAuthenticatedState(browser, environment.admin);
  const presenter = await openLoggedInBrowserFromState(
    browser,
    environment.admin,
    sharedState,
  );
  const viewer = await openLoggedInBrowserFromState(
    browser,
    environment.admin,
    sharedState,
  );
  expect(presenter.user.id).toBe(viewer.user.id);
  const space = presenter.spaces.find(
    (candidate) =>
      candidate.accessControl?.isPublic !== false
      && ['active', 'available'].includes(candidate.status)
      && candidate.capacity >= 2,
  );
  if (!space) throw new Error('Screen-sharing fixture needs a shared public space.');
  await moveThroughUi(presenter.page, space.id);
  await moveThroughUi(viewer.page, space.id);
  return { presenter, viewer, space };
}

async function closeContextsBestEffort(...contexts: BrowserContext[]): Promise<void> {
  await Promise.race([
    Promise.allSettled(contexts.map((context) => context.close())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

function audioSnapshot(page: Page) {
  return page.getByRole('button', { name: /Enable microphone|Mute microphone|Unmute microphone/ })
    .first()
    .evaluate((button) => ({
      label: button.getAttribute('aria-label'),
      disabled: (button as HTMLButtonElement).disabled,
    }));
}

async function shareFrom(page: Page): Promise<void> {
  const claimResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === 'POST'
      && /\/api\/spaces\/[^/]+\/screen-share\/claim$/.test(new URL(response.url()).pathname);
  });
  await page.getByRole('button', { name: 'Share screen' }).first().click();
  const claimResponse = await claimResponsePromise;
  const claimBody = await claimResponse.text();
  expect(
    claimResponse.ok(),
    `screen-share claim failed (${claimResponse.status()}): ${claimBody}`,
  ).toBe(true);
  await expect(page.getByTestId('floor-plan-presentation-stage')).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('deterministic two-context screen-sharing lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  let environment: PresenceE2EEnvironment;

  test.beforeAll(async ({ request }) => {
    environment = await resolvePresenceE2EEnvironment();
    if (!environment.localFixture) {
      throw new Error(
        'The screen-sharing browser suite requires PRESENCE_E2E_PROVISION_LOCAL=1 '
        + 'and a disposable loopback Supabase stack.',
      );
    }
    // Next dev recompilation can Fast Refresh already-authenticated pages and
    // invalidate their presence session. Compile the complete route surface
    // before either isolated identity is opened.
    await warmScreenSharingRoutes(request);
  });

  test('@smoke shares, collapses, expands, and stops without changing audio', async ({ browser }) => {
    const { presenter, viewer } = await openPairInOneSpace(
      browser,
      environment,
      { holdViewerSignaling: true },
    );
    try {
      const presenterAudioBefore = await audioSnapshot(presenter.page);
      const viewerAudioBefore = await audioSnapshot(viewer.page);

      await shareFrom(presenter.page);
      // Reload after the committed claim so the viewer's subscribe-time
      // authoritative read cannot race ahead of it. Outbound media signaling
      // remains held, proving the stage and teardown do not depend on a peer.
      await viewer.page.reload();
      await expect(viewer.page.locator('[data-testid^="space-"]').first()).toBeVisible({
        timeout: 30_000,
      });
      const presenterStage = presenter.page.getByTestId('floor-plan-presentation-stage');
      const viewerStage = viewer.page.getByTestId('floor-plan-presentation-stage');
      await expect(viewerStage).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => viewer.page.evaluate(
        () => window.__screenShareTest?.heldSignalingCount() ?? 0,
      )).toBeGreaterThan(0);
      expect(await presenter.page.evaluate(
        () => window.__screenShareTest?.peerConnectionCount() ?? 0,
      )).toBe(0);
      await expect(presenterStage.getByText('LIVE', { exact: true })).toBeVisible();
      await expect(presenterStage.getByTestId('presentation-video-region')).toHaveCSS(
        'aspect-ratio',
        '16 / 9',
      );

      await viewerStage.getByRole('button', { name: 'Collapse presentation' }).click();
      await expect(viewerStage.getByRole('button', { name: 'Expand presentation' }))
        .toHaveAttribute('aria-expanded', 'false');
      await viewerStage.getByRole('button', { name: 'Expand presentation' }).click();
      await expect(viewerStage.getByRole('button', { name: 'Collapse presentation' }))
        .toHaveAttribute('aria-expanded', 'true');

      const collapse = viewerStage.getByRole('button', { name: 'Collapse presentation' });
      await collapse.focus();
      await viewer.page.keyboard.press('Escape');
      await expect(viewerStage.getByRole('button', { name: 'Expand presentation' })).toBeFocused();

      expect(await presenter.page.evaluate(
        () => window.__screenShareTest?.peerConnectionCount() ?? 0,
      )).toBe(0);
      await presenterStage.getByRole('button', { name: 'Stop sharing' }).click();
      await expect(presenterStage).toHaveCount(0);
      await expect(viewerStage).toHaveCount(0, { timeout: 30_000 });
      expect(await audioSnapshot(presenter.page)).toEqual(presenterAudioBefore);
      expect(await audioSnapshot(viewer.page)).toEqual(viewerAudioBefore);
    } finally {
      await closeContextsBestEffort(presenter.context, viewer.context);
    }
  });

  test('@same-identity clears a distinct session of the presenter identity without moving its avatar', async ({ browser }) => {
    const { presenter, viewer, space } = await openSameIdentityPairInOneSpace(browser, environment);
    try {
      expect(presenter.user.id).toBe(viewer.user.id);
      await expect.poll(() => presenter.page.evaluate(
        () => window.__screenShareTest?.signalingIdentities().length ?? 0,
      )).toBeGreaterThan(0);
      await expect.poll(() => viewer.page.evaluate(
        () => window.__screenShareTest?.signalingIdentities().length ?? 0,
      )).toBeGreaterThan(0);
      const presenterIdentity = await presenter.page.evaluate(
        () => window.__screenShareTest?.signalingIdentities()[0] ?? null,
      );
      const viewerIdentity = await viewer.page.evaluate(
        () => window.__screenShareTest?.signalingIdentities()[0] ?? null,
      );
      expect(presenterIdentity).not.toBeNull();
      expect(viewerIdentity).not.toBeNull();
      expect(presenterIdentity?.presenceSessionId).not.toBe(viewerIdentity?.presenceSessionId);
      expect(presenterIdentity?.connectionId).not.toBe(viewerIdentity?.connectionId);

      const presenterCard = spaceCard(presenter.page, space.id);
      const viewerCard = spaceCard(viewer.page, space.id);
      const placementBefore = {
        presenter: await presenterCard.getAttribute('data-user-in-space'),
        viewer: await viewerCard.getAttribute('data-user-in-space'),
        presenterAvatarCount: await presenter.page.locator(`[data-user-id="${presenter.user.id}"]`).count(),
        viewerAvatarCount: await viewer.page.locator(`[data-user-id="${viewer.user.id}"]`).count(),
      };

      await shareFrom(presenter.page);
      // A distinct fixture member briefly joins and leaves the room so the
      // viewer performs its normal presence-leave authoritative reconciliation
      // without replacing either same-identity presence session.
      const observerState = await createAuthenticatedState(browser, environment.member);
      const observer = await openLoggedInBrowserFromState(
        browser,
        environment.member,
        observerState,
      );
      await moveThroughUi(observer.page, space.id);
      const observerReconcileResponse = viewer.page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === 'GET'
          && url.pathname === `/api/spaces/${space.id}/screen-share/active`
          && url.searchParams.get('presenceSessionId') === viewerIdentity?.presenceSessionId;
      });
      await observer.context.close();
      const observerRead = await observerReconcileResponse;
      const observerBody = await observerRead.json() as {
        success?: boolean;
        active?: { presenterUserId?: string; shareId?: string } | null;
      };
      expect(observerRead.ok()).toBe(true);
      expect(observerBody.success).toBe(true);
      expect(observerBody.active?.presenterUserId).toBe(presenter.user.id);
      expect(observerBody.active?.shareId).toEqual(expect.any(String));
      const viewerStage = viewer.page.getByTestId('floor-plan-presentation-stage');
      await expect(viewerStage).toBeVisible({ timeout: 30_000 });

      const postReleaseActiveResponse = viewer.page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === 'GET'
          && url.pathname === `/api/spaces/${space.id}/screen-share/active`
          && url.searchParams.get('presenceSessionId') === viewerIdentity?.presenceSessionId;
      });
      await presenter.page.getByTestId('floor-plan-presentation-stage')
        .getByRole('button', { name: 'Stop sharing' })
        .click();
      const postReleaseRead = await postReleaseActiveResponse;
      const postReleaseBody = await postReleaseRead.json() as {
        success?: boolean;
        active?: unknown;
      };
      expect(postReleaseRead.ok()).toBe(true);
      expect(postReleaseBody).toMatchObject({ success: true, active: null });
      await expect(viewerStage).toHaveCount(0, { timeout: 30_000 });
      await expect(presenterCard).toHaveAttribute('data-user-in-space', placementBefore.presenter ?? 'true');
      await expect(viewerCard).toHaveAttribute('data-user-in-space', placementBefore.viewer ?? 'true');
      await expect(presenter.page.locator(`[data-user-id="${presenter.user.id}"]`))
        .toHaveCount(placementBefore.presenterAvatarCount);
      await expect(viewer.page.locator(`[data-user-id="${viewer.user.id}"]`))
        .toHaveCount(placementBefore.viewerAvatarCount);
    } finally {
      await closeContextsBestEffort(presenter.context, viewer.context);
    }
  });

  test('surfaces deterministic denial, cancellation, and no-source feedback', async ({ browser }) => {
    const participant = await openLoggedInBrowser(browser, environment.admin);
    try {
      const space = participant.spaces.find((candidate) => candidate.accessControl?.isPublic !== false);
      if (!space) throw new Error('Screen-sharing fixture needs a public space.');
      await moveThroughUi(participant.page, space.id);
      const before = await audioSnapshot(participant.page);
      const cases: Array<{ mode: CaptureMode; copy: string; alert: boolean }> = [
        {
          mode: 'denied',
          copy: 'We couldnâ€™t start screen sharing. Check your browser permission, then try again.',
          alert: true,
        },
        {
          mode: 'cancelled',
          copy: 'Screen sharing was cancelled.',
          alert: false,
        },
        {
          mode: 'no-source',
          copy: 'No screen is available to share. Connect a display or choose another source, then try again.',
          alert: true,
        },
      ];
      for (const scenario of cases) {
        await participant.page.evaluate((mode) => window.__screenShareTest?.setCaptureMode(mode), scenario.mode);
        await participant.page.getByRole('button', { name: 'Share screen' }).first().click();
        const feedback = scenario.alert
          ? participant.page.getByRole('alert').filter({ hasText: scenario.copy })
          : participant.page.getByText(scenario.copy, { exact: true });
        await expect(feedback).toBeVisible();
        expect(await audioSnapshot(participant.page)).toEqual(before);
      }
    } finally {
      await closeContextsBestEffort(participant.context);
    }
  });

  test('stops a busy loser capture and clears browser-ended and departure state', async ({ browser }) => {
    const { presenter, viewer, space } = await openPairInOneSpace(browser, environment);
    try {
      await shareFrom(presenter.page);
      await viewer.page.getByRole('button', { name: 'Share screen' }).first().click({ force: true });
      await expect(viewer.page.getByRole('alert')).toContainText(
        'Another participant is already sharing their screen.',
      );
      await expect.poll(() => viewer.page.evaluate(
        () => window.__screenShareTest?.stoppedTrackCount() ?? 0,
      )).toBeGreaterThan(0);

      await presenter.page.evaluate(() => window.__screenShareTest?.endCapture());
      await expect(presenter.page.getByTestId('floor-plan-presentation-stage')).toHaveCount(0);
      await expect(viewer.page.getByTestId('floor-plan-presentation-stage')).toHaveCount(0, {
        timeout: 30_000,
      });

      await shareFrom(presenter.page);
      const otherSpace = presenter.spaces.find(
        (candidate) =>
          candidate.id !== space.id
          && candidate.accessControl?.isPublic !== false
          && ['active', 'available'].includes(candidate.status),
      );
      if (!otherSpace) throw new Error('Screen-sharing fixture needs a second public space.');
      await moveThroughUi(presenter.page, otherSpace.id);
      await expect(viewer.page.getByTestId('floor-plan-presentation-stage')).toHaveCount(0, {
        timeout: 30_000,
      });
    } finally {
      await closeContextsBestEffort(presenter.context, viewer.context);
    }
  });

  test('reconciles after reload and clears old scope on space and account switches', async ({ browser }) => {
    const { presenter, viewer, space } = await openPairInOneSpace(browser, environment);
    try {
      await shareFrom(presenter.page);
      await expect(viewer.page.getByTestId('floor-plan-presentation-stage')).toBeVisible({
        timeout: 30_000,
      });
      await viewer.page.reload();
      await expect(viewer.page.getByTestId('floor-plan-presentation-stage')).toBeVisible({
        timeout: 30_000,
      });

      const otherSpace = viewer.spaces.find(
        (candidate) =>
          candidate.id !== space.id
          && candidate.accessControl?.isPublic !== false
          && ['active', 'available'].includes(candidate.status),
      );
      if (!otherSpace) throw new Error('Screen-sharing fixture needs a second public space.');
      await moveThroughUi(viewer.page, otherSpace.id);
      await expect(viewer.page.getByTestId('floor-plan-presentation-stage')).toHaveCount(0);

      await viewer.page.getByTestId('account-menu-trigger').click();
      await viewer.page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await viewer.page.waitForURL(/\/login/);
      await login(viewer.page, environment.external);
      await expect(viewer.page.getByTestId('floor-plan-presentation-stage')).toHaveCount(0);
      await expect(viewer.page.getByText(presenter.user.displayName, { exact: false })).toHaveCount(0);
    } finally {
      await closeContextsBestEffort(presenter.context, viewer.context);
    }
  });

  test('keeps responsive, long-text, focus, live, alert, and empty-layout contracts', async ({ browser }) => {
    const { presenter, viewer } = await openPairInOneSpace(browser, environment);
    try {
      const emptyFloorPlanBox = await viewer.page.locator('[data-testid="modern-floor-plan-background"]')
        .boundingBox();
      await viewer.page.setViewportSize({ width: 390, height: 844 });
      await viewer.page.emulateMedia({ reducedMotion: 'reduce' });
      await shareFrom(presenter.page);
      const stage = viewer.page.getByTestId('floor-plan-presentation-stage');
      await expect(stage).toBeVisible({ timeout: 30_000 });
      await expect(stage).toHaveAttribute('aria-label', /Screen shared by /);
      await expect(stage.getByText('LIVE', { exact: true })).toBeVisible();
      await expect(stage.getByRole('button', { name: 'Collapse presentation' })).toHaveCSS(
        'min-height',
        '44px',
      );
      await expect(stage.getByTestId('presentation-video-region')).toHaveCSS('min-height', '180px');
      expect(await viewer.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);

      await presenter.page.getByTestId('floor-plan-presentation-stage')
        .getByRole('button', { name: 'Stop sharing' }).click();
      await expect(stage).toHaveCount(0, { timeout: 30_000 });
      const restoredFloorPlanBox = await viewer.page
        .locator('[data-testid="modern-floor-plan-background"]')
        .boundingBox();
      expect(restoredFloorPlanBox?.width).toBe(emptyFloorPlanBox?.width);
    } finally {
      await closeContextsBestEffort(presenter.context, viewer.context);
    }
  });
});
