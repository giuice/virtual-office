import {
  expect,
  test,
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

declare global {
  interface Window {
    __screenShareTest?: {
      setCaptureMode: (mode: CaptureMode) => void;
      endCapture: () => void;
      stoppedTrackCount: () => number;
      peerConnectionCount: () => number;
    };
  }
}

async function installDeterministicMedia(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    let captureMode: CaptureMode = 'success';
    let activeTrack: MediaStreamTrack | null = null;
    let stoppedTracks = 0;
    let peerConnections = 0;

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
      value: async (constraints?: DisplayMediaStreamOptions): Promise<MediaStream> => {
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
    };
  });
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
): Promise<{ presenter: LoggedInBrowser; viewer: LoggedInBrowser; space: RuntimeSpace }> {
  const presenter = await openLoggedInBrowser(browser, environment.admin);
  const viewer = await openLoggedInBrowser(browser, environment.member);
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
  await page.getByRole('button', { name: 'Share screen' }).first().click();
  await expect(page.getByTestId('floor-plan-presentation-stage')).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('deterministic two-context screen-sharing lifecycle', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  let environment: PresenceE2EEnvironment;

  test.beforeAll(async () => {
    environment = await resolvePresenceE2EEnvironment();
  });

  test('@smoke shares, collapses, expands, and stops without changing audio', async ({ browser }) => {
    const { presenter, viewer } = await openPairInOneSpace(browser, environment);
    try {
      const presenterAudioBefore = await audioSnapshot(presenter.page);
      const viewerAudioBefore = await audioSnapshot(viewer.page);

      await shareFrom(presenter.page);
      const presenterStage = presenter.page.getByTestId('floor-plan-presentation-stage');
      const viewerStage = viewer.page.getByTestId('floor-plan-presentation-stage');
      await expect(viewerStage).toBeVisible({ timeout: 30_000 });
      await expect(presenterStage.getByText('LIVE', { exact: true })).toBeVisible();
      await expect(presenterStage.getByTestId('presentation-video-region')).toHaveCSS(
        'aspect-ratio',
        '16 / 9',
      );
      await expect.poll(() => presenter.page.evaluate(
        () => window.__screenShareTest?.peerConnectionCount() ?? 0,
      )).toBeGreaterThan(0);

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

      await presenterStage.getByRole('button', { name: 'Stop sharing' }).click();
      await expect(presenterStage).toHaveCount(0);
      await expect(viewerStage).toHaveCount(0, { timeout: 30_000 });
      await expect(presenter.page.getByRole('button', { name: 'Share screen' }).first())
        .toBeFocused();

      expect(await audioSnapshot(presenter.page)).toEqual(presenterAudioBefore);
      expect(await audioSnapshot(viewer.page)).toEqual(viewerAudioBefore);
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
