import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';
import {
  LOCAL_MESSAGING_BASE_URL,
  LOCAL_MESSAGING_PORT,
  assertLocalSupabaseOnly,
  buildLocalSupabaseEnv,
} from './__tests__/api/playwright/helpers/local-supabase-mode';

// Local Supabase test mode (127.0.0.1:54321). The base config has already
// loaded `.env.local` (hosted target); the overrides below replace every
// Supabase-related value in this process and in the dev server it starts.
// `.env.local` itself is untouched, so `npm run dev` keeps its default target.
Object.assign(process.env, buildLocalSupabaseEnv());
assertLocalSupabaseOnly(process.env);

const localEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string'
  )
);

export default defineConfig({
  ...baseConfig,
  // Runs after the dev server starts: removes seeded data left by an earlier
  // interrupted run so the first seed is not blocked by it.
  globalSetup: './__tests__/api/playwright/helpers/messaging-local-global-setup.ts',
  // Restores next-env.d.ts, which next dev rewrites to this mode's distDir.
  globalTeardown: './scripts/playwright-messaging-local-teardown.mjs',
  reporter: [
    ['list'],
    // Keep the tracked playwright-report/ untouched by local-mode runs.
    ['html', { open: 'never', outputFolder: 'playwright-report-messaging-local' }],
  ],
  // Two-user messaging specs share one seeded company per test; keep serial.
  workers: 1,
  use: {
    ...baseConfig.use,
    baseURL: LOCAL_MESSAGING_BASE_URL,
    // No retries in this mode, so the base 'on-first-retry' settings would
    // never record anything. Keep traces/video of every failed attempt so an
    // intermittent failure can be diagnosed from its first occurrence.
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --turbopack --port ${LOCAL_MESSAGING_PORT}`,
    url: LOCAL_MESSAGING_BASE_URL,
    // Never attach to an existing server: one on this port could have been
    // started against the hosted database.
    reuseExistingServer: false,
    env: localEnvironment,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 180_000,
  },
});
