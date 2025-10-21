import { expect, test } from '@playwright/test';

// These flows exercise the deterministic messaging drawer harness exposed at /test/messaging-drawer.
// The harness seeds pinned direct messages, room conversations, and search data via React context overrides,
// eliminating the need for database fixtures or Supabase authentication during Playwright runs.

test.describe('Messaging drawer Playwright harness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/messaging-drawer');
    await expect(page.getByTestId('messaging-drawer')).toBeVisible();
  });

  test('renders grouped conversations with pinned ordering', async ({ page }) => {
    await expect(page.getByText('Pinned', { exact: true })).toBeVisible();
    await expect(page.getByTestId('conversation-item-conv-pinned-direct')).toBeVisible();
    await expect(page.getByTestId('conversation-section-direct')).toBeVisible();
    await expect(page.getByTestId('conversation-section-rooms')).toBeVisible();
    await expect(page.getByTestId('conversation-section-direct').getByText('Direct Messages', { exact: true })).toBeVisible();
    await expect(page.getByTestId('conversation-section-rooms').getByText('Rooms', { exact: true })).toBeVisible();

  });

  test('keeps drawer open while switching between rooms', async ({ page }) => {
    await page.getByTestId('conversation-item-conv-pinned-direct').click();
    await expect(page.getByTestId('messaging-drawer-title')).toHaveText('Taylor Silva');

    await page.getByTestId('floor-nav-team-sync').click();
    await expect(page.getByTestId('messaging-drawer-title')).toHaveText('Team Sync Room');
    await expect(page.getByTestId('messaging-drawer')).toBeVisible();

    await page.getByTestId('floor-nav-product-hub').click();
    await expect(page.getByTestId('messaging-drawer-title')).toHaveText('Product Planning Room');

    await page.getByTestId('reset-conversation-state').click();
    await expect(page.getByTestId('messaging-drawer-title')).toHaveText('Messages');
  });

  test('supports pinned filtering and conversation search without closing the drawer', async ({ page }) => {
    await page.getByTestId('toggle-pinned-filter').click();
    await expect(page.getByTestId('conversation-item-conv-room-product')).toHaveCount(0);

    await page.getByTitle('New message').click();
    const searchInput = page.getByPlaceholder('Search users or rooms...');
    await searchInput.fill('Taylor');
    await page.getByRole('button', { name: /Taylor Silva/ }).click();

    await expect(page.getByTestId('messaging-drawer-title')).toHaveText('Taylor Silva');
    await expect(page.getByTestId('messaging-drawer')).toBeVisible();
  });
});
