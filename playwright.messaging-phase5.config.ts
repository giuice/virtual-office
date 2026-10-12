import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices, type Project } from '@playwright/test';

import baseConfig from './playwright.config';
import localConfig from './playwright.messaging-local.config';
import { LOCAL_MESSAGING_BASE_URL, LOCAL_MESSAGING_PORT } from './__tests__/api/playwright/helpers/local-supabase-mode';
import { SERVER_LOG_FILE_ENV } from './__tests__/api/playwright/helpers/server-log';

// Phase 5 E2E runner (T24; SPEC BR-015/AC-036). Same local-Supabase mode, env
// overrides, and hosted-URL refusal as playwright.messaging-local.config.ts
// (imported above, which applies them to this process), plus:
//   * real Google Chrome and Microsoft Edge (installed stable channels), never
//     the bundled Chromium; the browser's own user agent is kept;
//   * Phase 5 specs (`messaging-phase5/**`) and the Phase 4 messaging regression
//     specs (the `messaging-drawer` list) in both browsers;
//   * zero retries; every failure keeps its trace and video;
//   * the dev server's raw stdout/stderr copied to a file tests read
//     (helpers/server-log.ts);
//   * a global setup that refuses a non-atomic local Presence mode and removes
//     state left by interrupted runs.
// Specs must not override `channel` at file level; specs that need full
// Chromium in the bundled-browser runner keep the project's channel here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env[SERVER_LOG_FILE_ENV] = path.resolve(__dirname, '.playwright-server-logs', 'messaging-phase5-server.log');

// The server's colour output is made deterministic by the log tee itself
// (FORCE_COLOR=1, NO_COLOR removed for the server process): Playwright merges
// the runner's own process.env into the webServer env, so a NO_COLOR set in
// the launching shell would otherwise reach Next.
const runnerEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);

const phase4RegressionSpecs = baseConfig.projects?.find((project) => project.name === 'messaging-drawer')?.testMatch;
if (!phase4RegressionSpecs) {
  throw new Error('The messaging-drawer project (Phase 4 regression list) is missing from playwright.config.ts.');
}
const phase5Specs = ['**/messaging-phase5/**/*.spec.ts'];

/** The installed browser, with its real user agent (the device presets pin an older Chrome UA). */
function realBrowser(device: 'Desktop Chrome' | 'Desktop Edge', channel: 'chrome' | 'msedge'): Project['use'] {
  const { userAgent: _presetUserAgent, ...preset } = devices[device];
  void _presetUserAgent;
  return { ...preset, channel };
}

const chrome = realBrowser('Desktop Chrome', 'chrome');
const edge = realBrowser('Desktop Edge', 'msedge');

/** Multi-user Phase 5 scenarios sign in up to five accounts. */
const PHASE5_TEST_TIMEOUT_MS = 180_000;

export default defineConfig({
  ...localConfig,
  globalSetup: './__tests__/api/playwright/helpers/messaging-phase5-global-setup.ts',
  retries: 0,
  outputDir: './test-results/messaging-phase5',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-messaging-local' }],
  ],
  projects: [
    { name: 'phase5-chrome', testMatch: phase5Specs, timeout: PHASE5_TEST_TIMEOUT_MS, use: chrome },
    { name: 'phase5-edge', testMatch: phase5Specs, timeout: PHASE5_TEST_TIMEOUT_MS, use: edge },
    { name: 'regression-chrome', testMatch: phase4RegressionSpecs, use: chrome },
    { name: 'regression-edge', testMatch: phase4RegressionSpecs, use: edge },
  ],
  webServer: {
    command: `node scripts/playwright-server-log-tee.mjs node node_modules/next/dist/bin/next dev --turbopack --port ${LOCAL_MESSAGING_PORT}`,
    url: LOCAL_MESSAGING_BASE_URL,
    // Never attach to an existing server (it could target the hosted database,
    // and its output could not be captured).
    reuseExistingServer: false,
    env: runnerEnvironment,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180_000,
  },
});
