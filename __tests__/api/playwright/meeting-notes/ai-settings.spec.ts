import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/meeting-notes';

/**
 * AC-017, UI part (FR-024, BR-009): an admin saves provider, model, reasoning
 * level, API key, and daily limit 50 in the company page's Settings → AI
 * section; the key is shown only as its last four characters, the input is
 * write-only, the metadata survives a reload, and a member sees no AI settings
 * section (the members-only page has no Settings tab). Route, database, Vault,
 * Realtime, and log evidence is in the DB integration suite
 * (__tests__/meeting-notes-db/meeting-note-ai-settings.test.ts).
 * Only canary keys are used; the company's AI settings are reset before and
 * after so the shared seed company never keeps a key. Block B review B-1: the
 * canary never stays in TanStack's query or mutation caches, after a
 * successful save or a save that failed in transit.
 */

async function openAiSettings(page: Page): Promise<void> {
  await page.goto('/company?tab=settings');
  const settingsTab = page.getByRole('tab', { name: 'Company Settings' });
  await expect(settingsTab).toBeVisible({ timeout: 30_000 });
  if ((await settingsTab.getAttribute('data-state')) !== 'active') await settingsTab.click();
  await expect(page.getByTestId('ai-settings-section')).toBeVisible({ timeout: 30_000 });
}

/**
 * Whether `text` occurs anywhere in the page's TanStack caches (queries and
 * mutations: data, variables, onMutate results, errors). Uses the E2E-only
 * boolean probe installed by QueryProvider when NEXT_PUBLIC_E2E is 'true'
 * (src/lib/test-utils/e2e-query-cache-probe.ts); fails if it is missing.
 */
async function cachesHold(page: Page, text: string): Promise<boolean> {
  return page.evaluate(
    ([probeName, needle]) => {
      const probe = (window as unknown as Record<string, unknown>)[probeName];
      if (typeof probe !== 'function') throw new Error('E2E query-cache probe missing (NEXT_PUBLIC_E2E)');
      return (probe as (value: string) => boolean)(needle);
    },
    ['__voE2eQueryCacheContains', text] as const,
  );
}

async function choose(page: Page, triggerTestId: string, option: string): Promise<void> {
  await page.getByTestId(triggerTestId).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByTestId(triggerTestId)).toContainText(option);
}

test.describe('meeting notes — company AI settings (AC-017 UI)', () => {
  test('an admin saves the AI settings; the key is write-only and shown as its last four characters; a member sees no AI section', async ({
    primaryPage,
    secondaryPage,
    notesWorld,
  }) => {
    await notesWorld.resetAiSettingsUnsafe();
    const canaryKey = `mn-e2e-canary-${notesWorld.runTag}-Q7w3`;
    try {
      const admin = primaryPage;
      await openAiSettings(admin);
      const section = admin.getByTestId('ai-settings-section');
      await expect(section.getByTestId('ai-settings-status')).toHaveText('AI is not configured yet.');
      await expect(admin.getByTestId('ai-daily-limit-input')).toHaveValue('20');

      await choose(admin, 'ai-provider-select', 'OpenAI');
      await choose(admin, 'ai-model-select', 'GPT-6.1 Sol');
      await choose(admin, 'ai-reasoning-select', 'High');
      const keyInput = admin.getByTestId('ai-key-input');
      await expect(keyInput).toHaveAttribute('type', 'password');
      await keyInput.fill(canaryKey);
      await admin.getByTestId('ai-daily-limit-input').fill('50');

      const saved = admin.waitForResponse(
        (response) => response.url().endsWith('/api/companies/ai-settings') && response.request().method() === 'PUT'
      );
      await admin.getByTestId('ai-save-button').click();
      const response = await saved;
      expect(response.status()).toBe(200);
      expect(await response.text()).not.toContain(canaryKey);

      // Write-only: the input is cleared; only the last four characters show.
      await expect(keyInput).toHaveValue('');
      await expect(admin.getByTestId('ai-key-last-four')).toHaveText(`Key ending in ····${canaryKey.slice(-4)}`);
      await expect(section.getByTestId('ai-settings-status')).toContainText('OpenAI');
      await expect(section.getByTestId('ai-settings-status')).toContainText('GPT-6.1 Sol');
      await expect(admin.getByTestId('ai-updated-by')).toBeVisible();
      await expect(keyInput).toHaveAttribute('placeholder', 'Leave blank to keep the current key');

      // B-1: after the save settled, the key is nowhere in TanStack state
      // (mutation variables, results, query data) — while the probe does see
      // the masked metadata, so it is reading the live caches.
      expect(await cachesHold(admin, canaryKey.slice(-4))).toBe(true);
      expect(await cachesHold(admin, canaryKey)).toBe(false);

      // A save whose request fails in transit keeps the key out of the caches
      // too (it stays only in the password input, for the retry).
      const failedKey = `mn-e2e-canary-failed-${notesWorld.runTag}-Z9x2`;
      await admin.route('**/api/companies/ai-settings', (route) =>
        route.request().method() === 'PUT' ? route.abort('failed') : route.continue(),
      );
      await keyInput.fill(failedKey);
      await admin.getByTestId('ai-save-button').click();
      await expect(admin.getByTestId('ai-settings-error')).toBeVisible({ timeout: 15_000 });
      await expect(admin.getByTestId('ai-save-button')).toBeEnabled();
      expect(await cachesHold(admin, failedKey)).toBe(false);
      await admin.unroute('**/api/companies/ai-settings');
      await keyInput.fill('');

      // A reload keeps the metadata; the key never reaches the page.
      await admin.reload();
      await openAiSettings(admin);
      await expect(admin.getByTestId('ai-settings-status')).toContainText('GPT-6.1 Sol');
      await expect(admin.getByTestId('ai-reasoning-select')).toContainText('High');
      await expect(admin.getByTestId('ai-daily-limit-input')).toHaveValue('50');
      await expect(admin.getByTestId('ai-key-last-four')).toHaveText(`Key ending in ····${canaryKey.slice(-4)}`);
      await expect(admin.getByTestId('ai-key-input')).toHaveValue('');
      expect(await admin.content()).not.toContain(canaryKey);
      const adminRead = await admin.request.get('/api/companies/ai-settings');
      expect(adminRead.status()).toBe(200);
      expect(await adminRead.text()).not.toContain(canaryKey);

      // Limit outside 1–200 is refused in the form and nothing is sent.
      await admin.getByTestId('ai-daily-limit-input').fill('201');
      await admin.getByTestId('ai-save-button').click();
      await expect(admin.getByTestId('ai-settings-error')).toContainText('from 1 to 200');

      // The member: no Settings tab, no AI section; the route gives metadata only and refuses saves.
      const member = secondaryPage;
      await member.goto('/company?tab=settings');
      await expect(member.getByRole('tab', { name: 'Team Members' })).toBeVisible({ timeout: 30_000 });
      await expect(member.getByRole('tab', { name: 'Company Settings' })).toHaveCount(0);
      await expect(member.getByTestId('ai-settings-section')).toHaveCount(0);
      const memberRead = await member.request.get('/api/companies/ai-settings');
      expect(memberRead.status()).toBe(200);
      const memberBody = await memberRead.text();
      expect(memberBody).not.toContain(canaryKey);
      expect(JSON.parse(memberBody)).toMatchObject({
        canManage: false,
        settings: { configured: true, provider: 'openai', dailyLimit: 50, keyLastFour: canaryKey.slice(-4) },
      });
      const memberSave = await member.request.put('/api/companies/ai-settings', {
        data: {
          expectedRevision: 1,
          provider: 'openai',
          model: 'gpt-6.1-sol',
          reasoningLevel: 'low',
          dailyLimit: 10,
          apiKey: null,
        },
      });
      expect(memberSave.status()).toBe(403);
    } finally {
      await notesWorld.resetAiSettingsUnsafe();
    }
  });
});
