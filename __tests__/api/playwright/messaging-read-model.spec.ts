import { test, expect } from './fixtures/messaging';
import {
  openDrawer,
  selectConversation,
  sendMessage,
  waitForRealtimeMessage,
  waitForRealtimeReady,
} from './helpers/drawer-helpers';

const RECV_TIMEOUT_MS = 15_000;

async function readUnreadCount(
  page: import('@playwright/test').Page,
  conversationId: string,
): Promise<number> {
  const conversationBadge = page.locator(`[data-testid="conversation-unread-badge-${conversationId}"]`);
  const triggerBadge = page.locator('[data-testid="messaging-drawer-trigger-badge"]');

  if (await conversationBadge.count()) {
    const visible = await conversationBadge.first().isVisible().catch(() => false);
    if (visible) {
      const value = (await conversationBadge.first().textContent())?.trim() ?? '0';
      return Number.parseInt(value.replace('+', ''), 10) || 0;
    }
  }

  if (await triggerBadge.count()) {
    const visible = await triggerBadge.first().isVisible().catch(() => false);
    if (visible) {
      const value = (await triggerBadge.first().textContent())?.trim() ?? '0';
      return Number.parseInt(value.replace('+', ''), 10) || 0;
    }
  }

  return 0;
}

async function expectConversationUnreadCount(
  page: import('@playwright/test').Page,
  conversationId: string,
  expected: number,
): Promise<void> {
  await expect
    .poll(() => readUnreadCount(page, conversationId), { timeout: RECV_TIMEOUT_MS })
    .toBe(expected);
}

function makeUniqueMessages(prefix: string): string[] {
  const base = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  return [0, 1, 2, 3, 4].map((index) => `${prefix}-${base}-${index + 1}`);
}

async function sendMessagesRapidly(page: import('@playwright/test').Page, messages: string[]): Promise<void> {
  const composer = page.locator('[data-testid="composer"]').or(page.locator('[data-testid="message-composer"]'));
  const input = composer.locator('textarea, input[type="text"]').first();
  const sendButton = composer
    .getByRole('button', { name: /send/i })
    .or(composer.locator('[data-testid="message-send-button"]'));

  for (const content of messages) {
    await input.fill(content);
    await sendButton.click();
  }
}

test.describe('Messaging read-model phase 2.x verification', () => {
  test.describe.configure({ mode: 'serial' });

  test('LIVE DELIVERY BOTH WAYS should flow both directions without reload', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    const directConversationId = messagingData.directConversationId;
    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');

    await openDrawer(primaryPage);
    await openDrawer(secondaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await selectConversation(secondaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);
    await waitForRealtimeReady(secondaryPage);

    const primaryMessage = `phase2.1-primary-${Date.now()}`;
    await sendMessage(primaryPage, primaryMessage);
    await waitForRealtimeMessage(secondaryPage, primaryMessage, { timeout: RECV_TIMEOUT_MS });

    const secondaryMessage = `phase2.1-secondary-${Date.now()}`;
    await sendMessage(secondaryPage, secondaryMessage);
    await waitForRealtimeMessage(primaryPage, secondaryMessage, { timeout: RECV_TIMEOUT_MS });
  });

  test('EXACT BADGE should show exact total while recipient is away', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    const directConversationId = messagingData.directConversationId;
    const messages = makeUniqueMessages('phase2.2-away');

    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');

    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);

    await sendMessagesRapidly(primaryPage, messages.slice(0, 3));

    await expectConversationUnreadCount(secondaryPage, directConversationId, 3);
  });

  test('BADGE CLEARS and read-indicator flips live when opening conversation', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    const directConversationId = messagingData.directConversationId;
    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');

    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);

    const readTarget = `phase2.2-read-${Date.now()}`;
    const messageId = await sendMessage(primaryPage, readTarget);

    await expectConversationUnreadCount(secondaryPage, directConversationId, 1);

    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: directConversationId });
    await expectConversationUnreadCount(secondaryPage, directConversationId, 0);

    await expect(
      primaryPage.locator(`[data-testid="message-status-${messageId}"] svg`)
    ).toHaveClass(/text-green-500/, { timeout: RECV_TIMEOUT_MS });
  });

  test('BURST CONVERGES to exact badge count and all messages appear once', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    const directConversationId = messagingData.directConversationId;
    const messages = makeUniqueMessages('phase2.2-burst');
    const burstMessages = messages.slice(0, 5);

    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');

    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);

    await sendMessagesRapidly(primaryPage, burstMessages);

    await expectConversationUnreadCount(secondaryPage, directConversationId, 5);

    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: directConversationId });
    await expectConversationUnreadCount(secondaryPage, directConversationId, 0);

    for (const messageText of burstMessages) {
      const messageLocator = secondaryPage.locator('[data-testid^="message-"]', { hasText: messageText });
      await expect(messageLocator).toHaveCount(1, { timeout: RECV_TIMEOUT_MS });
      await expect(messageLocator.first()).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    }
  });
});
