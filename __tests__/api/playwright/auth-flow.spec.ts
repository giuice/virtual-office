import { test, expect } from '@playwright/test';

const authEmail = process.env.AUTH_E2E_EMAIL;
const authPassword = process.env.AUTH_E2E_PASSWORD;
const passwordLabel = /^(?:Password|Senha)$/i;
const signInButtonName = /^(?:Sign In|Entrar)$/i;

test.skip(!authEmail || !authPassword, 'Set AUTH_E2E_EMAIL and AUTH_E2E_PASSWORD to run the auth flow E2E test.');

test('user can log in and reach floor plan without console errors', async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const location = msg.location();
      consoleErrors.push(`${msg.text()} @ ${location.url || 'unknown'}`);
    }
  });

  const ignoredFailurePatterns = [
    /\.supabase\.co\/storage\//i,
    /lh3\.googleusercontent\.com/i,
  ];

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const url = request.url();

    if (ignoredFailurePatterns.some((pattern) => pattern.test(url))) {
      return;
    }

    requestFailures.push(`${url} :: ${failure?.errorText ?? 'unknown error'}`);
  });

  await page.goto('/login');

  await page.getByLabel('Email').fill(authEmail!);
  await page.getByLabel(passwordLabel).fill(authPassword!);
  await page.getByRole('button', { name: signInButtonName }).click();

  await page.waitForURL(/\/(?:dashboard|floor-plan)/, { timeout: 30_000 });
  if (new URL(page.url()).pathname !== '/floor-plan') {
    await page.goto('/floor-plan');
  }
  await expect(page.locator('[data-testid^="space-"]').first()).toBeVisible({ timeout: 30_000 });

  expect(consoleErrors, `Console errors detected during auth flow: ${consoleErrors.join('\n')}`)
    .toHaveLength(0);

  expect(requestFailures, `Request failures detected during auth flow: ${requestFailures.join('\n')}`)
    .toHaveLength(0);
});
