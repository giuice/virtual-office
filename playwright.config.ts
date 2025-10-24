import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Derive __dirname in ESM context and load .env.local for Playwright tests
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './__tests__/api/playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
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
      testMatch: ['**/epic-4A-*.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Run local development server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000, // 2 minutes
  },
});
