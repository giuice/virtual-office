import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './__tests__',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Reporter to use */
  reporter: 'html',
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    /* Record video for E2E tests */
    video: 'on-first-retry',
    /* Timeout for actions and assertions */
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  /* Configure projects for different environments */
  projects: [
    {
      name: 'API Testing',
      testDir: './__tests__/api/playwright',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'E2E Testing',
      testDir: './__tests__/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Run local development server before starting the tests */
  webServer: {
    command: 'NEXT_PUBLIC_DISABLE_DEVTOOLS=true npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000, // 2 minutes
  },
});
