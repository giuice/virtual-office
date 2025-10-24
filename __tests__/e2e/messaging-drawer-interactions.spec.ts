// __tests__/e2e/messaging-drawer-interactions.spec.ts
// E2E tests for Messaging Drawer Interactions

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { waitForDrawerState, assertRealtimeMessageDelivery } from './utils/realtime-helpers';

test.describe('Messaging Drawer Interactions', () => {
  test.beforeAll(async () => {
    // Seed test data if needed
    // Run: npx tsx __tests__/e2e/fixtures/seed-test-data.ts
    // Assuming data is seeded before running tests
  });

  test('US1: Sender opens drawer, selects DM, sends message', async ({ browser }) => {
    // Create two browser contexts for sender and recipient
    const senderContext = await browser.newContext();
    const recipientContext = await browser.newContext();

    const senderPage = await senderContext.newPage();
    const recipientPage = await recipientContext.newPage();

    try {
      // Sender login
      await senderPage.goto('/');
      await senderPage.fill('#email', TEST_USERS.sender.email);
      await senderPage.fill('#password', TEST_USERS.sender.password);
      await senderPage.click('button[type="submit"]');
      await senderPage.waitForURL('**/floor-plan');

      // Open messaging drawer
      await senderPage.click('[data-drawer-trigger]');
      await waitForDrawerState(senderPage, true);

      // Select DM conversation with recipient
      await senderPage.click('[data-conversation-type="dm"]');

      // Send message
      const testMessage = 'Hello from E2E test!';
      await senderPage.fill('[data-message-input]', testMessage);
      await senderPage.click('[data-send-button]');

      // Verify message appears locally
      await expect(senderPage.locator('[data-message-content]').last()).toContainText(testMessage);

    } finally {
      await senderContext.close();
      await recipientContext.close();
    }
  });

  test('US1: Recipient receives message in realtime', async ({ browser }) => {
    // Create two browser contexts
    const senderContext = await browser.newContext();
    const recipientContext = await browser.newContext();

    const senderPage = await senderContext.newPage();
    const recipientPage = await recipientContext.newPage();

    try {
      // Both login
      await senderPage.goto('/');
      await senderPage.fill('#email', TEST_USERS.sender.email);
      await senderPage.fill('#password', TEST_USERS.sender.password);
      await senderPage.click('button[type="submit"]');
      await senderPage.waitForURL('**/floor-plan');

      await recipientPage.goto('/');
      await recipientPage.fill('#email', TEST_USERS.recipient.email);
      await recipientPage.fill('#password', TEST_USERS.recipient.password);
      await recipientPage.click('button[type="submit"]');
      await recipientPage.waitForURL('**/floor-plan');

      // Recipient opens drawer
      await recipientPage.click('[data-drawer-trigger]');
      await waitForDrawerState(recipientPage, true);

      // Sender sends message
      await senderPage.click('[data-drawer-trigger]');
      await waitForDrawerState(senderPage, true);
      await senderPage.click('[data-conversation-type="dm"]');

      const testMessage = 'Realtime test message!';
      await senderPage.fill('[data-message-input]', testMessage);
      await senderPage.click('[data-send-button]');

      // Recipient selects the DM conversation to view messages
      await recipientPage.click('[data-conversation-type="dm"]');

      // Assert realtime delivery to recipient
      await assertRealtimeMessageDelivery(recipientPage, testMessage);

    } finally {
      await senderContext.close();
      await recipientContext.close();
    }
  });

  test('US2: Enable pinned filter and verify only pinned conversations shown', async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('#email', TEST_USERS.sender.email);
    await page.fill('#password', TEST_USERS.sender.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/floor-plan');

    // Open drawer
    await page.click('[data-drawer-trigger]');
    await waitForDrawerState(page, true);

    // Enable pinned filter
    await page.click('[data-filter-pinned]');

    // Verify only pinned conversations shown
    const conversations = page.locator('[data-conversation-item]');
    await expect(conversations).toHaveCount(1); // Assuming one pinned in seed
    await expect(conversations.first()).toHaveAttribute('data-pinned', 'true');
  });

  test('US2: Unpinning and verifying empty list', async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('#email', TEST_USERS.sender.email);
    await page.fill('#password', TEST_USERS.sender.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/floor-plan');

    // Open drawer
    await page.click('[data-drawer-trigger]');
    await waitForDrawerState(page, true);

    // Unpin the conversation
    await page.click('[data-conversation-pin]');

    // Enable pinned filter
    await page.click('[data-filter-pinned]');

    // Verify empty list
    const conversations = page.locator('[data-conversation-item]');
    await expect(conversations).toHaveCount(0);
  });

  test('US3: Switching tabs and restoring last selection', async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('#email', TEST_USERS.sender.email);
    await page.fill('#password', TEST_USERS.sender.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/floor-plan');

    // Open drawer
    await page.click('[data-drawer-trigger]');
    await waitForDrawerState(page, true);

    // Select DM tab
    await page.click('[data-tab="dm"]');

    // Select a conversation
    await page.click('[data-conversation-item]:first-child');
    const selectedId = await page.getAttribute('[data-conversation-item]:first-child', 'data-id');

    // Switch to room tab
    await page.click('[data-tab="room"]');

    // Switch back to DM tab
    await page.click('[data-tab="dm"]');

    // Verify last selection restored
    const currentSelected = await page.getAttribute('[data-conversation-selected]', 'data-id');
    expect(currentSelected).toBe(selectedId);
  });

  test('US3: Navigating floor plan with drawer persistence', async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('#email', TEST_USERS.sender.email);
    await page.fill('#password', TEST_USERS.sender.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/floor-plan');

    // Open drawer
    await page.click('[data-drawer-trigger]');
    await waitForDrawerState(page, true);

    // Select a conversation
    await page.click('[data-conversation-item]:first-child');

    // Navigate to a different space
    await page.click('[data-space-element]');
    await page.waitForURL('**/space/**');

    // Verify drawer still open
    await waitForDrawerState(page, true);

    // Verify conversation still selected
    await expect(page.locator('[data-conversation-selected]')).toBeVisible();
  });

  test('US4: Archiving conversation and verifying hidden from active list', async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('#email', TEST_USERS.sender.email);
    await page.fill('#password', TEST_USERS.sender.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/floor-plan');

    // Open drawer
    await page.click('[data-drawer-trigger]');
    await waitForDrawerState(page, true);

    // Archive a conversation
    await page.click('[data-conversation-archive]');

    // Verify hidden from active list
    const archivedConv = page.locator('[data-conversation-item][data-archived="true"]');
    await expect(archivedConv).not.toBeVisible();

    // Or check count decreased
    const activeConvs = page.locator('[data-conversation-item]:not([data-archived])');
    // Assuming was 2, now 1
    await expect(activeConvs).toHaveCount(1);
  });

  test('US4: Unarchiving and restoring visibility', async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('#email', TEST_USERS.sender.email);
    await page.fill('#password', TEST_USERS.sender.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/floor-plan');

    // Open drawer
    await page.click('[data-drawer-trigger]');
    await waitForDrawerState(page, true);

    // Go to archived view or unarchive
    await page.click('[data-show-archived]');

    // Unarchive the conversation
    await page.click('[data-conversation-unarchive]');

        // Verify restored to active list
    const activeConvs = page.locator('[data-conversation-item]:not([data-archived])');
    await expect(activeConvs).toHaveCount(2); // Assuming back to 2
  });
});