import { defineConfig, devices } from '@playwright/test';

import localConfig from './playwright.messaging-local.config';

// Phase 4 T18 (FR-019, AC-022): opt-in best-effort voice-note playback check in
// Chrome, Edge, Firefox and WebKit against local Supabase. Same local mode,
// dev server and safety checks as playwright.messaging-local.config.ts; only
// the projects differ, so the messaging regression suite is unchanged.
// Needs the browsers installed (`npx playwright install firefox webkit`;
// Chrome/Edge projects use the installed stable channels).
const crossBrowserSpec = ['**/messaging-voice-notes-cross-browser.spec.ts'];

export default defineConfig({
  ...localConfig,
  projects: [
    { name: 'voice-chrome', testMatch: crossBrowserSpec, use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'voice-edge', testMatch: crossBrowserSpec, use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'voice-firefox', testMatch: crossBrowserSpec, use: { ...devices['Desktop Firefox'] } },
    { name: 'voice-webkit', testMatch: crossBrowserSpec, use: { ...devices['Desktop Safari'] } },
  ],
});
