import type { PlaywrightWorkerArgs, PlaywrightWorkerOptions, WorkerFixture } from '@playwright/test';

/**
 * `test.use({ channel: fullBrowserChannel })` for specs that need a full browser
 * rather than the headless shell (real Notification permission, media capture).
 * It keeps the project's own channel — the installed Chrome or Edge in the
 * Phase 5 runner (playwright.messaging-phase5.config.ts) — and falls back to
 * full Chromium only where the project uses the bundled browser (the Phase 4
 * `messaging-drawer` project). A spec therefore never replaces the browser a
 * project asked for.
 */
export const fullBrowserChannel: [
  WorkerFixture<string | undefined, PlaywrightWorkerArgs & PlaywrightWorkerOptions>,
  { scope: 'worker' },
] = [
  async ({ channel }, use) => {
    await use(channel ?? 'chromium');
  },
  { scope: 'worker' },
];
