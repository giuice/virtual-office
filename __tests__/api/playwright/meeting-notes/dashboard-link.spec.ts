import { expect, test } from '../fixtures/meeting-notes';

/** AC-015 (FR-004): the dashboard "AI Meeting Notes" card opens the Meetings page. */
test.describe('meeting notes — dashboard link (AC-015)', () => {
  test('the AI Meeting Notes card opens the Meetings page', async ({ secondaryPage }) => {
    const page = secondaryPage;
    await page.goto('/dashboard');
    const card = page.getByRole('link', { name: 'Open AI Meeting Notes' });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();

    await expect(page).toHaveURL(/\/meetings$/);
    await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
    await expect(page.getByLabel('Search notes', { exact: true })).toBeVisible();
  });
});
