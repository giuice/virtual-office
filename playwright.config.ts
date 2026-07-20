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
const playwrightBaseUrl = authMetricsEnabled
  ? `http://localhost:${authMetricsPort}`
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
  ],
  // Run local development server before starting the tests
  webServer: {
    command: authMetricsEnabled
      ? 'node scripts/playwright-auth-metrics-server.mjs'
      : 'npm run dev',
    url: playwrightBaseUrl,
    // A reused process has no stdout channel that the test can consume. Metrics
    // mode therefore owns a fresh server and a sanitized auth-only artifact.
    reuseExistingServer: authMetricsEnabled ? false : !process.env.CI,
    // On POSIX, Playwright otherwise SIGKILLs its wrapper process group. The
    // metrics wrapper needs SIGTERM so it can stop its detached npm/Next group
    // and drain both streams before exiting. Playwright ignores this on Windows,
    // where its tree kill and the wrapper's scoped taskkill fallback apply.
    gracefulShutdown: authMetricsEnabled
      ? { signal: 'SIGTERM', timeout: 20_000 }
      : undefined,
    env: authMetricsEnabled
      ? {
          ...playwrightEnvironment,
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
      : playwrightEnvironment,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000, // 2 minutes
  },
});
