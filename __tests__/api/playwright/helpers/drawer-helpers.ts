import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Helper functions for interacting with the messaging drawer in E2E tests.
 * These helpers abstract common drawer interactions and provide stable wait conditions.
 */

/**
 * Opens the messaging drawer by clicking the messaging trigger button.
 * Waits for drawer to be visible before returning.
 */
export async function openDrawer(page: Page): Promise<void> {
  // Check if drawer is already visible (expanded state)
  const drawer = page.locator('[data-testid="messaging-drawer"]');
  const isVisible = await drawer.isVisible().catch(() => false);

  if (isVisible) {
    // Drawer is already open
    return;
  }

  // Look for the messaging trigger button (floating action button)
  const triggerButton = page.locator('[data-testid="messaging-drawer-trigger"]');

  // Wait for trigger to be visible and click it
  await triggerButton.waitFor({ state: 'visible', timeout: 10_000 });
  await triggerButton.click();

  // Wait for drawer to be visible
  await page.waitForSelector('[data-testid="messaging-drawer"]', {
    state: 'visible',
    timeout: 10_000
  });
}

/**
 * Closes the messaging drawer.
 */
export async function closeDrawer(page: Page): Promise<void> {
  const closeButton = page.locator('[data-testid="messaging-drawer-close"]');
  await closeButton.click();

  // Wait for drawer to be hidden
  await page.waitForSelector('[data-testid="messaging-drawer"]', {
    state: 'hidden',
    timeout: 5_000
  });
}

/**
 * Checks if the messaging drawer is currently open and visible.
 */
export async function isDrawerOpen(page: Page): Promise<boolean> {
  const drawer = page.locator('[data-testid="messaging-drawer"]');
  return await drawer.isVisible();
}

/**
 * Selects a conversation from the conversation list by conversation ID or title.
 * Waits for the conversation to become active before returning.
 */
export async function selectConversation(
  page: Page,
  identifier: { id?: string; title?: string }
): Promise<void> {
  let conversationItem: Locator;

  if (identifier.id) {
    conversationItem = page.locator(`[data-testid="conversation-item-${identifier.id}"]`);
  } else if (identifier.title) {
    conversationItem = page.locator(`[data-testid^="conversation-item-"]`, { hasText: identifier.title });
  } else {
    throw new Error('Must provide either id or title to select conversation');
  }

  await conversationItem.click();

  // Wait for conversation view to load
  await page.waitForSelector('[data-testid="messages-feed"]', {
    state: 'visible',
    timeout: 10_000
  });
}

/**
 * Sends a message in the currently active conversation.
 * Waits for message to appear in the feed before returning.
 */
export async function sendMessage(page: Page, messageText: string): Promise<string> {
  const composer = page.locator('[data-testid="composer"]').or(page.locator('[data-testid="message-composer"]'));
  const input = composer.locator('textarea, input[type="text"]').first();

  await input.fill(messageText);

  // Look for send button
  const sendButton = composer.getByRole('button', { name: /send/i }).or(
    composer.locator('[data-testid="message-send-button"]')
  );

  await sendButton.click();

  // Wait for message to appear in feed
  const messageInFeed = page.locator('[data-testid^="message-"]', { hasText: messageText });
  await expect(messageInFeed).toBeVisible({ timeout: 10_000 });

  // Extract message ID from data-testid if available
  const messageId = await messageInFeed.getAttribute('data-testid').then(
    (id) => id?.replace('message-', '') ?? ''
  );

  return messageId;
}

/**
 * Waits for a message to appear via realtime subscription.
 * Useful for testing cross-user realtime delivery.
 */
export async function waitForRealtimeMessage(
  page: Page,
  messageText: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 15_000; // Realtime may take a few seconds

  const messageLocator = page.locator('[data-testid^="message-"]', { hasText: messageText });
  await expect(messageLocator).toBeVisible({ timeout });
}

/**
 * Switches between conversation tabs (Rooms / DMs).
 */
export async function switchTab(page: Page, tab: 'rooms' | 'dms'): Promise<void> {
  const tabButton = page.getByRole('tab', { name: new RegExp(tab, 'i') }).or(
    page.locator(`[data-testid="conversation-tab-${tab}"]`)
  );

  await tabButton.click();

  // Wait for tab content to load
  await page.waitForTimeout(500); // Brief stabilization wait
}

/**
 * Toggles the "Pinned Only" filter in the conversation list.
 */
export async function togglePinnedFilter(page: Page): Promise<void> {
  const filterButton = page.getByRole('button', { name: /pinned/i }).or(
    page.locator('[data-testid="filter-pinned-toggle"]')
  );

  await filterButton.click();

  // Wait for filter to apply
  await page.waitForTimeout(500);
}

/**
 * Archives a conversation via its context menu.
 */
export async function archiveConversation(page: Page, conversationId: string): Promise<void> {
  const conversationItem = page.locator(`[data-testid="conversation-item-${conversationId}"]`);

  // Open context menu (right-click or kebab menu)
  const moreButton = conversationItem.locator('[data-testid="conversation-menu-trigger"]');

  if (await moreButton.isVisible()) {
    await moreButton.click();
  } else {
    // Fallback to right-click
    await conversationItem.click({ button: 'right' });
  }

  // Click archive option
  const archiveOption = page.getByRole('menuitem', { name: /archive/i }).or(
    page.locator('[data-testid="conversation-action-archive"]')
  );

  await archiveOption.click();

  // Wait for conversation to disappear from list
  await expect(conversationItem).toBeHidden({ timeout: 5_000 });
}

/**
 * Unarchives a conversation from the archived section.
 */
export async function unarchiveConversation(page: Page, conversationId: string): Promise<void> {
  // First navigate to archived section if not already there
  const archivedSection = page.locator('[data-testid="archived-section"]');

  if (!(await archivedSection.isVisible())) {
    const archivedTrigger = page.getByRole('button', { name: /archived/i }).or(
      page.locator('[data-testid="show-archived-button"]')
    );
    await archivedTrigger.click();
  }

  const conversationItem = page.locator(`[data-testid="conversation-item-${conversationId}"]`);

  // Open context menu
  const moreButton = conversationItem.locator('[data-testid="conversation-menu-trigger"]');

  if (await moreButton.isVisible()) {
    await moreButton.click();
  } else {
    await conversationItem.click({ button: 'right' });
  }

  // Click unarchive option
  const unarchiveOption = page.getByRole('menuitem', { name: /unarchive/i }).or(
    page.locator('[data-testid="conversation-action-unarchive"]')
  );

  await unarchiveOption.click();

  // Wait for conversation to disappear from archived list
  await expect(conversationItem).toBeHidden({ timeout: 5_000 });
}

/**
 * Pins a conversation via its context menu.
 */
export async function pinConversation(page: Page, conversationId: string): Promise<void> {
  const conversationItem = page.locator(`[data-testid="conversation-item-${conversationId}"]`);

  const moreButton = conversationItem.locator('[data-testid="conversation-menu-trigger"]');

  if (await moreButton.isVisible()) {
    await moreButton.click();
  } else {
    await conversationItem.click({ button: 'right' });
  }

  const pinOption = page.getByRole('menuitem', { name: /pin/i }).or(
    page.locator('[data-testid="conversation-action-pin"]')
  );

  await pinOption.click();

  // Wait for pin state to update
  await page.waitForTimeout(500);
}

/**
 * Unpins a conversation via its context menu.
 */
export async function unpinConversation(page: Page, conversationId: string): Promise<void> {
  const conversationItem = page.locator(`[data-testid="conversation-item-${conversationId}"]`);

  const moreButton = conversationItem.locator('[data-testid="conversation-menu-trigger"]');

  if (await moreButton.isVisible()) {
    await moreButton.click();
  } else {
    await conversationItem.click({ button: 'right' });
  }

  const unpinOption = page.getByRole('menuitem', { name: /unpin/i }).or(
    page.locator('[data-testid="conversation-action-unpin"]')
  );

  await unpinOption.click();

  // Wait for pin state to update
  await page.waitForTimeout(500);
}

/**
 * Navigates to a space on the floor plan.
 * Useful for testing drawer stability during navigation.
 */
export async function navigateToSpace(page: Page, spaceId: string): Promise<void> {
  const spaceElement = page.locator(`[data-testid="space-${spaceId}"]`).or(
    page.locator(`[data-space-id="${spaceId}"]`)
  );

  await spaceElement.click();

  // Wait for navigation to complete
  await page.waitForTimeout(1000);
}

/**
 * Gets the count of visible conversations in the current list.
 */
export async function getConversationCount(page: Page): Promise<number> {
  const conversations = page.locator('[data-testid^="conversation-item-"]');
  return await conversations.count();
}

/**
 * Checks if a conversation is currently pinned.
 */
export async function isConversationPinned(page: Page, conversationId: string): Promise<boolean> {
  const conversationItem = page.locator(`[data-testid="conversation-item-${conversationId}"]`);
  const pinIndicator = conversationItem.locator('[data-testid="pin-indicator"]');

  return await pinIndicator.isVisible();
}

/**
 * Waits for the drawer's realtime subscription to be established.
 * This helps prevent race conditions in realtime tests.
 */
export async function waitForRealtimeReady(page: Page): Promise<void> {
  // Wait for subscription status indicator or a brief stabilization period
  await page.waitForTimeout(2000); // Supabase Realtime connection establishment
}
