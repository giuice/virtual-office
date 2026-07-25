import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Derive __dirname in ESM context and load .env.local for Playwright tests
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const authMetricsEnabled = process.env.VO_AUTH_METRICS === '1';
const authMetricsPort = process.env.VO_AUTH_METRICS_PORT ?? '3100';
if (!/^\d{1,5}$/.test(authMetricsPort) || Number(authMetricsPort) < 1 || Number(authMetricsPort) > 65_535) {
  throw new Error('VO_AUTH_METRICS_PORT must be a valid TCP port.');
}
const screenSharingBaseUrl = process.env.VO_SCREEN_SHARING_BASE_URL;
if (screenSharingBaseUrl) {
  const parsed = new URL(screenSharingBaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || !parsed.port) {
    throw new Error('VO_SCREEN_SHARING_BASE_URL must be an explicit loopback URL with a port.');
  }
}
const playwrightBaseUrl = authMetricsEnabled
  ? `http://localhost:${authMetricsPort}`
  : screenSharingBaseUrl
    ? screenSharingBaseUrl
  : 'http://localhost:3000';
const playwrightEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string'
  )
);

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  globalTeardown: authMetricsEnabled
    ? './scripts/playwright-auth-metrics-teardown.mjs'
    : undefined,
  testDir: './__tests__/api/playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: playwrightBaseUrl,
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/messages-api.spec.ts', '**/auth-flow.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'messaging-drawer',
      testMatch: ['**/epic-4A-*.spec.ts', '**/messaging-read-model.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Presence remediation E2E. Later phases add multi-tab lease, capacity,
      // knock, and private-access specs here; Phase 8 enforces zero skips.
      name: 'presence',
      testMatch: ['**/presence/**/*.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Deterministic DOM/lifecycle evidence only: the spec injects a canvas
      // display stream and host-only peer connections. Real permissions,
      // P2P/TURN delivery, RLS, and database concurrency remain separate gates.
      name: 'screen-sharing',
      testMatch: ['**/screen-sharing.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
      },
    },
  ],
  // Run local development server before starting the tests
  webServer: {
    command: authMetricsEnabled
      ? 'node scripts/playwright-auth-metrics-server.mjs'
      : screenSharingBaseUrl
        ? `node node_modules/next/dist/bin/next dev --webpack --port ${new URL(screenSharingBaseUrl).port}`
        : 'npm run dev',
    url: playwrightBaseUrl,
    // A reused process has no stdout channel that the test can consume. Metrics
    // mode therefore owns a fresh server and a sanitized auth-only artifact.
    reuseExistingServer: authMetricsEnabled || screenSharingBaseUrl ? false : !process.env.CI,
    // On POSIX, Playwright otherwise SIGKILLs its wrapper process group. The
    // metrics wrapper needs SIGTERM so it can stop its detached npm/Next group
    // and drain both streams before exiting. Playwright ignores this on Windows,
    // where its tree kill and the wrapper's scoped taskkill fallback apply.
    gracefulShutdown: authMetricsEnabled
      ? { signal: 'SIGTERM', timeout: 20_000 }
      : undefined,
    env: authMetricsEnabled || screenSharingBaseUrl
      ? {
          ...playwrightEnvironment,
          ...(authMetricsEnabled
            ? {
                VO_AUTH_METRICS: '1',
                VO_AUTH_METRICS_PORT: authMetricsPort,
                VO_AUTH_METRICS_FILE: path.resolve(__dirname, 'test-results/auth-metrics.ndjson'),
                VO_AUTH_METRICS_SHUTDOWN_FILE: path.resolve(
                  __dirname,
                  'test-results/auth-metrics.shutdown'
                ),
                VO_AUTH_METRICS_SHUTDOWN_ACK_FILE: path.resolve(
                  __dirname,
                  'test-results/auth-metrics.shutdown.ack'
                ),
                VO_NEXT_DIST_DIR: '.next-auth-metrics-webpack',
                VO_NEXT_TSCONFIG: 'tsconfig.auth-metrics.json',
              }
            : {
                VO_NEXT_DIST_DIR: '.next-screen-sharing',
                VO_NEXT_TSCONFIG: 'tsconfig.auth-metrics.json',
              }),
        }
      : playwrightEnvironment,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000, // 2 minutes
  },
});
