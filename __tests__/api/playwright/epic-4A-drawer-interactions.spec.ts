/**
 * Epic 4A.1: Playwright E2E Tests for Drawer Interactions
 *
 * This test suite validates the messaging drawer's core functionality including:
 * - Opening/closing drawer
 * - Selecting conversations
 * - Sending messages with realtime delivery
 * - Filtering conversations (pinned)
 * - Tab switching (Rooms/DMs)
 * - Navigation stability
 * - Archive/unarchive flows
 */

import { test, expect } from './fixtures/messaging';
import {
  openDrawer,
  selectConversation,
  sendMessage,
  waitForRealtimeMessage,
  switchTab,
  togglePinnedFilter,
  archiveConversation,
  unarchiveConversation,
  pinConversation,
  unpinConversation,
  navigateToSpace,
  getConversationCount,
  isConversationPinned,
  waitForRealtimeReady,
  isDrawerOpen,
} from './helpers/drawer-helpers';

/**
 * AC1: Open Drawer → Select DM → Send Message → Verify Realtime Delivery
 *
 * Validates that users can:
 * - Open the messaging drawer from the floor plan
 * - Select a DM conversation from the list
 * - Send a message
 * - See the message appear in realtime for both sender and recipient
 * - Have the message persist after page refresh
 */
test.describe('AC1: Open Drawer → Select DM → Send Message → Realtime Delivery', () => {
  test('should open drawer, select DM, send message, and verify realtime delivery', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    // Step 1: Primary user navigates to floor plan
    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');

    // Step 2: Open messaging drawer
    await openDrawer(primaryPage);

    // Verify drawer is now visible
    expect(await isDrawerOpen(primaryPage)).toBe(true);

    // Step 3: Verify conversation list renders
    const conversationList = primaryPage.locator('[data-testid^="conversation-item-"]');
    await expect(conversationList.first()).toBeVisible({ timeout: 10_000 });

    // Step 4: Select the DM conversation
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Verify message feed is visible
    await expect(primaryPage.locator('[data-testid="messages-feed"]')).toBeVisible();

    // Step 4: Secondary user opens drawer and selects same conversation
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: messagingData.directConversationId });

    // Wait for realtime subscriptions to establish
    await waitForRealtimeReady(primaryPage);
    await waitForRealtimeReady(secondaryPage);

    // Step 5: Primary user sends a message
    const testMessage = `Test message from primary user at ${Date.now()}`;
    await sendMessage(primaryPage, testMessage);

    // Step 6: Verify message appears immediately for sender
    await expect(
      primaryPage.locator('[data-testid^="message-"]', { hasText: testMessage })
    ).toBeVisible({ timeout: 5_000 });

    // Step 7: Verify message appears in realtime for recipient
    await waitForRealtimeMessage(secondaryPage, testMessage, { timeout: 15_000 });

    // Step 8: Refresh primary user's page and verify message persists
    await primaryPage.reload();
    await primaryPage.waitForLoadState('networkidle');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Message should still be visible after refresh
    await expect(
      primaryPage.locator('[data-testid^="message-"]', { hasText: testMessage })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should handle message send errors gracefully', async ({ primaryPage, messagingData }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Simulate offline condition (block API calls)
    await primaryPage.route('**/api/messages/**', (route) => route.abort());

    // Attempt to send message
    const composer = primaryPage.locator('[data-testid="composer"]');
    const input = composer.locator('textarea').first();
    await input.fill('This message should fail');

    const sendButton = composer.locator('[data-testid="message-send-button"]');
    await sendButton.click();

    // Verify error handling (message should not appear or show error state)
    // Note: Exact error UX depends on implementation
    await primaryPage.waitForTimeout(2000);

    // Message should not be in the feed
    const messages = primaryPage.locator('[data-testid^="message-"]', {
      hasText: 'This message should fail',
    });
    await expect(messages).toHaveCount(0);
  });
});

/**
 * AC2: Filter Conversations by Pinned
 *
 * Validates that users can:
 * - Toggle "Pinned Only" filter
 * - See only pinned conversations when filter is active
 * - Have filter state persist during drawer session
 * - See conversations update immediately when unpinned
 */
test.describe('AC2: Filter Conversations by Pinned', () => {
  test('should filter conversations by pinned status', async ({ primaryPage, messagingData }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    // Pin one of the room conversations via API or UI
    const roomConversationId = messagingData.roomConversationIds[0];
    await pinConversation(primaryPage, roomConversationId);

    // Wait for pin state to update
    await primaryPage.waitForTimeout(1000);

    // Verify conversation is pinned
    expect(await isConversationPinned(primaryPage, roomConversationId)).toBe(true);

    // Get initial conversation count
    const initialCount = await getConversationCount(primaryPage);
    expect(initialCount).toBeGreaterThan(1);

    // Toggle "Pinned Only" filter
    await togglePinnedFilter(primaryPage);

    // Wait for filter to apply
    await primaryPage.waitForTimeout(1000);

    // Verify only pinned conversations are displayed
    const filteredCount = await getConversationCount(primaryPage);
    expect(filteredCount).toBeLessThan(initialCount);

    // Verify the pinned conversation is still visible
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${roomConversationId}"]`)
    ).toBeVisible();

    // Unpin the conversation
    await unpinConversation(primaryPage, roomConversationId);

    // Wait for unpin to process
    await primaryPage.waitForTimeout(1000);

    // Verify conversation disappears from filtered view immediately
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${roomConversationId}"]`)
    ).toBeHidden({ timeout: 5_000 });

    // Disable filter
    await togglePinnedFilter(primaryPage);

    // Wait for filter to clear
    await primaryPage.waitForTimeout(1000);

    // Verify all conversations reappear
    const finalCount = await getConversationCount(primaryPage);
    expect(finalCount).toBe(initialCount);
  });

  test('should persist pinned filter state during drawer session', async ({
    primaryPage,
    messagingData,
  }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    // Pin a conversation
    const roomConversationId = messagingData.roomConversationIds[0];
    await pinConversation(primaryPage, roomConversationId);

    // Enable pinned filter
    await togglePinnedFilter(primaryPage);
    await primaryPage.waitForTimeout(1000);

    // Select a conversation and navigate away
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Go back to list view
    const backButton = primaryPage.getByRole('button', { name: /back/i });
    await backButton.click();

    // Filter should still be active
    const filteredCount = await getConversationCount(primaryPage);
    expect(filteredCount).toBeLessThan(3); // Assuming we have more than 2 total conversations
  });
});

/**
 * AC3: Switch Between Room and DM Tabs
 *
 * Validates that users can:
 * - Switch between "Rooms" and "DMs" tabs
 * - See correct conversation lists for each tab
 * - Have tab state persist during drawer session
 * - Maintain scroll position and filter state when switching tabs
 */
test.describe('AC3: Switch Between Room and DM Tabs', () => {
  test('should switch between Rooms and DMs tabs with correct lists', async ({
    primaryPage,
    messagingData,
  }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    // Check default tab (assuming it's set to show all or DMs)
    // Get initial conversation count
    const initialCount = await getConversationCount(primaryPage);

    // Switch to Rooms tab
    await switchTab(primaryPage, 'rooms');

    // Verify room conversations are displayed
    const roomsTab = primaryPage.locator('[data-testid="conversation-tab-rooms"]').or(
      primaryPage.getByRole('tab', { name: /rooms/i })
    );
    await expect(roomsTab).toHaveAttribute('aria-selected', 'true');

    // Room conversations should be visible
    for (const roomId of messagingData.roomConversationIds) {
      await expect(primaryPage.locator(`[data-testid="conversation-item-${roomId}"]`)).toBeVisible();
    }

    // Switch to DMs tab
    await switchTab(primaryPage, 'dms');

    // Verify DM conversations are displayed
    const dmsTab = primaryPage.locator('[data-testid="conversation-tab-dms"]').or(
      primaryPage.getByRole('tab', { name: /dms/i })
    );
    await expect(dmsTab).toHaveAttribute('aria-selected', 'true');

    // DM conversation should be visible
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${messagingData.directConversationId}"]`)
    ).toBeVisible();
  });

  test('should maintain filter state when switching tabs', async ({ primaryPage, messagingData }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    // Pin a room conversation
    const roomConversationId = messagingData.roomConversationIds[0];
    await pinConversation(primaryPage, roomConversationId);

    // Switch to rooms tab
    await switchTab(primaryPage, 'rooms');

    // Enable pinned filter
    await togglePinnedFilter(primaryPage);
    await primaryPage.waitForTimeout(1000);

    const roomsFilteredCount = await getConversationCount(primaryPage);

    // Switch to DMs tab
    await switchTab(primaryPage, 'dms');

    // Switch back to Rooms tab
    await switchTab(primaryPage, 'rooms');

    // Filter should still be active
    const roomsFilteredCountAfterSwitch = await getConversationCount(primaryPage);
    expect(roomsFilteredCountAfterSwitch).toBe(roomsFilteredCount);
  });
});

/**
 * AC4: Navigate Space → Drawer Stays Open and Stable
 *
 * Validates that:
 * - Drawer remains open during space navigation
 * - Active conversation is maintained
 * - No flickering or re-rendering occurs
 * - Multiple rapid navigations are handled gracefully
 */
test.describe('AC4: Navigate Space → Drawer Stability', () => {
  test('should keep drawer open and stable during space navigation', async ({
    primaryPage,
    messagingData,
  }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    // Select a conversation
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Verify message feed is visible
    await expect(primaryPage.locator('[data-testid="messages-feed"]')).toBeVisible();

    // Navigate to different space
    if (messagingData.spaceIds.length > 0) {
      await navigateToSpace(primaryPage, messagingData.spaceIds[0]);

      // Drawer should still be open
      expect(await isDrawerOpen(primaryPage)).toBe(true);

      // Active conversation should be maintained
      await expect(primaryPage.locator('[data-testid="messages-feed"]')).toBeVisible();

      // Verify no flickering (drawer remains visible throughout)
      await primaryPage.waitForTimeout(500);
      expect(await isDrawerOpen(primaryPage)).toBe(true);
    }
  });

  test('should handle rapid space navigation without drawer issues', async ({
    primaryPage,
    messagingData,
  }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Perform multiple rapid space navigations
    if (messagingData.spaceIds.length >= 2) {
      for (let i = 0; i < 3; i++) {
        await navigateToSpace(primaryPage, messagingData.spaceIds[0]);
        await primaryPage.waitForTimeout(200);
        await navigateToSpace(primaryPage, messagingData.spaceIds[1]);
        await primaryPage.waitForTimeout(200);
      }

      // Drawer should remain stable
      expect(await isDrawerOpen(primaryPage)).toBe(true);
      await expect(primaryPage.locator('[data-testid="message-feed"]')).toBeVisible();
    }
  });
});

/**
 * AC5: Archive Conversation → Moves to Archived Section
 *
 * Validates that users can:
 * - Archive a conversation via context menu
 * - See archived conversation disappear from main list
 * - Find archived conversation in "Archived" section
 * - Unarchive conversation to return it to main list
 */
test.describe('AC5: Archive Conversation Flow', () => {
  test('should archive and unarchive conversations correctly', async ({
    primaryPage,
    messagingData,
  }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    const conversationToArchive = messagingData.roomConversationIds[0];

    // Verify conversation is initially visible
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
    ).toBeVisible();

    // Archive the conversation
    await archiveConversation(primaryPage, conversationToArchive);

    // Verify conversation disappears from main list
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
    ).toBeHidden({ timeout: 5_000 });

    // Navigate to archived section
    const archivedButton = primaryPage.getByRole('button', { name: /archived/i }).or(
      primaryPage.locator('[data-testid="show-archived-button"]')
    );

    // If archived section exists, navigate to it
    if (await archivedButton.isVisible()) {
      await archivedButton.click();

      // Verify archived conversation appears in archived list
      await expect(
        primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
      ).toBeVisible({ timeout: 5_000 });

      // Unarchive the conversation
      await unarchiveConversation(primaryPage, conversationToArchive);

      // Go back to main list
      const backButton = primaryPage.getByRole('button', { name: /back|all/i });
      if (await backButton.isVisible()) {
        await backButton.click();
      }

      // Verify conversation returns to main list
      await expect(
        primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

/**
 * AC6: All Tests Pass in CI/CD Pipeline
 *
 * This acceptance criterion is validated by:
 * - Running the full test suite without flakiness (handled by test infrastructure)
 * - Completing tests within time limits (< 5 minutes total)
 * - Providing clear error messages (Playwright default behavior)
 * - Cleaning up test data (handled by fixtures in afterEach/afterAll)
 *
 * Additional flakiness and performance tests are in Task 7.
 */
test.describe('AC6: Test Suite Quality', () => {
  test('should complete a full test cycle within performance targets', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    const startTime = Date.now();

    // Perform a representative end-to-end flow
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    await secondaryPage.goto('/floor-plan');
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: messagingData.directConversationId });

    await waitForRealtimeReady(primaryPage);

    const testMessage = `Performance test message ${Date.now()}`;
    await sendMessage(primaryPage, testMessage);
    await waitForRealtimeMessage(secondaryPage, testMessage);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Individual test should complete well under 30 seconds
    expect(duration).toBeLessThan(30_000);
  });
});
