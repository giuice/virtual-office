import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices, type Project } from '@playwright/test';

import localConfig from './playwright.messaging-local.config';
import {
  MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV,
  meetingNotesFakeAiBaseUrl,
} from './__tests__/meeting-notes-ai-fake/config';
import { MEETING_NOTES_E2E_BASE_URL_ENV } from './__tests__/api/playwright/helpers/meeting-notes-global-setup';
import { SERVER_LOG_FILE_ENV } from './__tests__/api/playwright/helpers/server-log';

// Phase 6 meeting-notes E2E runner (T5 onward; final run in T14). Same
// local-Supabase mode, env overrides, and hosted-URL refusal as
// playwright.messaging-local.config.ts (imported above, which applies them to
// this process), plus:
//   * its own port, so it never attaches to the messaging runner's server;
//   * real Google Chrome only (installed stable channel, its own user agent);
//     no Edge or Firefox (owner decision 2026-10-10);
//   * zero retries, one worker; every failure keeps its trace and video;
//   * the dev server's raw stdout/stderr copied to a file (helpers/server-log.ts);
//   * a global setup that refuses a non-atomic local Presence mode and removes
//     state left by interrupted runs.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEETING_NOTES_E2E_PORT = 3230;
const MEETING_NOTES_E2E_BASE_URL = `http://localhost:${MEETING_NOTES_E2E_PORT}`;

// App URLs the server derives links from must name this runner's port.
process.env.NEXT_PUBLIC_SITE_URL = MEETING_NOTES_E2E_BASE_URL;
process.env.NEXT_PUBLIC_APP_URL = MEETING_NOTES_E2E_BASE_URL;
process.env[MEETING_NOTES_E2E_BASE_URL_ENV] = MEETING_NOTES_E2E_BASE_URL;
// E2E build of the app: no React Query Devtools, and the boolean cache probe
// of src/lib/test-utils/e2e-query-cache-probe.ts (AC-017 canary check).
process.env.NEXT_PUBLIC_E2E = 'true';
// The only replaced dependency: the external AI provider (fixed loopback URL).
process.env[MEETING_NOTES_AI_BASE_URL_OVERRIDE_ENV] = meetingNotesFakeAiBaseUrl();
process.env[SERVER_LOG_FILE_ENV] = path.resolve(__dirname, '.playwright-server-logs', 'meeting-notes-server.log');
// AI processing tickets (T9/T13) are signed with a per-run, TEST-ONLY secret
// generated here, never the developer's own value from .env.local: the dev
// server started below only has to verify tickets it issued itself.
process.env.MEETING_NOTES_TICKET_SECRET = randomBytes(48).toString('base64url');
process.env.MEETING_NOTES_TICKET_SECRET_PREVIOUS = '';

const runnerEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);

/** The installed Chrome, with its real user agent (the device preset pins an older one). */
function realChrome(): Project['use'] {
  const { userAgent: _presetUserAgent, ...preset } = devices['Desktop Chrome'];
  void _presetUserAgent;
  return { ...preset, channel: 'chrome' };
}

/** Two accounts sign in and several notes are created through the API per test. */
const MEETING_NOTES_TEST_TIMEOUT_MS = 180_000;

export default defineConfig({
  ...localConfig,
  testDir: './__tests__/api/playwright/meeting-notes',
  globalSetup: [
    './__tests__/meeting-notes-ai-fake/playwright-global-setup.ts',
    './__tests__/api/playwright/helpers/meeting-notes-global-setup.ts',
  ],
  retries: 0,
  workers: 1,
  outputDir: './test-results/meeting-notes',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-meeting-notes' }],
  ],
  use: {
    ...localConfig.use,
    baseURL: MEETING_NOTES_E2E_BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'meeting-notes-chrome',
      testMatch: ['**/*.spec.ts'],
      timeout: MEETING_NOTES_TEST_TIMEOUT_MS,
      use: realChrome(),
    },
  ],
  webServer: {
    command: `node scripts/playwright-server-log-tee.mjs node node_modules/next/dist/bin/next dev --turbopack --port ${MEETING_NOTES_E2E_PORT}`,
    url: MEETING_NOTES_E2E_BASE_URL,
    // Never attach to an existing server (it could target the hosted database,
    // and its output could not be captured).
    reuseExistingServer: false,
    env: runnerEnvironment,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180_000,
  },
});
