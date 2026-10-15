import { expect, test } from '../fixtures/meeting-notes';

/**
 * AC-018, admin part (FR-025): the settings link target an admin is given
 * when AI is not configured (`/company?tab=settings#ai-settings`, built by
 * AI_SETTINGS_PATH in src/lib/meeting-notes/ui-paths.ts) opens the AI section
 * of the company page. The note view's disabled AI controls and the link
 * itself are T13's specs.
 */
test.describe('meeting notes — admin AI settings link (AC-018)', () => {
  test('the AI settings link opens the AI section for an admin', async ({ primaryPage, notesWorld }) => {
    await notesWorld.resetAiSettingsUnsafe();
    const admin = primaryPage;
    await admin.goto('/company?tab=settings#ai-settings');
    const settingsTab = admin.getByRole('tab', { name: 'Company Settings' });
    await expect(settingsTab).toBeVisible({ timeout: 30_000 });
    await expect(settingsTab).toHaveAttribute('data-state', 'active');
    const section = admin.locator('#ai-settings');
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section).toHaveAttribute('data-testid', 'ai-settings-section');
    await expect(section.getByText('AI', { exact: true })).toBeVisible();
    await expect(section.getByTestId('ai-settings-status')).toHaveText('AI is not configured yet.');
    await expect(section.getByLabel('Provider')).toBeVisible();
    await expect(section.getByLabel('API key')).toBeVisible();
  });
});
