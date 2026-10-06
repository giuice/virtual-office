import { test, expect } from './fixtures/messaging';
import {
  backToConversationList,
  openDrawer,
  parseBadgeCount,
  readListUnreadCount,
  readVisibleBadgeText,
  scrollFeedToTopStepwise,
  selectConversation,
  sendMessage,
  waitForRealtimeMessage,
  waitForRealtimeReady,
} from './helpers/drawer-helpers';

const RECV_TIMEOUT_MS = 15_000;

/**
 * The seed opens the DM with one message from the primary ("Seeded hello …")
 * that the secondary has not read, so the secondary starts at exactly 1 unread.
 * Each badge test asserts that baseline before sending, then the exact total.
 */
const SEEDED_UNREAD_FOR_SECONDARY = 1;

async function readUnreadCount(
  page: import('@playwright/test').Page,
  conversationId: string,
): Promise<number> {
  const conversationBadge = page.locator(`[data-testid="conversation-unread-badge-${conversationId}"]`);
  const triggerBadge = page.locator('[data-testid="messaging-drawer-trigger-badge"]');

  // Each badge is read in one non-waiting call: a live update can unmount it
  // between separate reads (TRACK T31).
  const conversationValue = await readVisibleBadgeText(conversationBadge);
  if (conversationValue !== undefined) return parseBadgeCount(conversationValue);

  return parseBadgeCount(await readVisibleBadgeText(triggerBadge));
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
    // The recipient's badge updates live only once its Realtime is joined.
    await waitForRealtimeReady(secondaryPage);

    await expectConversationUnreadCount(secondaryPage, directConversationId, SEEDED_UNREAD_FOR_SECONDARY);

    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);

    await sendMessagesRapidly(primaryPage, messages.slice(0, 3));

    await expectConversationUnreadCount(secondaryPage, directConversationId, SEEDED_UNREAD_FOR_SECONDARY + 3);
  });

  test('BADGE CLEARS and read-indicator flips live once the messages are seen', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    // Two signed-in accounts, a send burst and a scroll through the feed.
    test.setTimeout(60_000);
    const directConversationId = messagingData.directConversationId;
    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    // The recipient's badge updates live only once its Realtime is joined.
    await waitForRealtimeReady(secondaryPage);

    await expectConversationUnreadCount(secondaryPage, directConversationId, SEEDED_UNREAD_FOR_SECONDARY);

    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);

    const readTarget = `phase2.2-read-${Date.now()}`;
    const messageId = await sendMessage(primaryPage, readTarget);

    await expectConversationUnreadCount(secondaryPage, directConversationId, SEEDED_UNREAD_FOR_SECONDARY + 1);

    // Opening the conversation lands at the bottom: the newest message is on
    // screen, so it is read and the sender's indicator flips live.
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: directConversationId });
    await expect(secondaryPage.locator(`[data-testid="message-${messageId}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
    await expect(
      primaryPage.locator(`[data-testid="message-status-${messageId}"] svg`)
    ).toHaveClass(/text-green-500/, { timeout: RECV_TIMEOUT_MS });

    // Phase 4: only seen messages count as read. Scrolling the older seeded
    // message into view clears the rest; the list row then shows no badge.
    await scrollFeedToTopStepwise(secondaryPage);
    await backToConversationList(secondaryPage, directConversationId);
    await expect
      .poll(() => readListUnreadCount(secondaryPage, directConversationId), { timeout: RECV_TIMEOUT_MS })
      .toBe(0);
  });

  test('BURST CONVERGES to exact badge count and all messages appear once', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    // Two signed-in accounts, a send burst and a scroll through the feed.
    test.setTimeout(60_000);
    const directConversationId = messagingData.directConversationId;
    const messages = makeUniqueMessages('phase2.2-burst');
    const burstMessages = messages.slice(0, 5);

    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    // The recipient's badge updates live only once its Realtime is joined.
    await waitForRealtimeReady(secondaryPage);

    await expectConversationUnreadCount(secondaryPage, directConversationId, SEEDED_UNREAD_FOR_SECONDARY);

    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);

    await sendMessagesRapidly(primaryPage, burstMessages);

    await expectConversationUnreadCount(
      secondaryPage,
      directConversationId,
      SEEDED_UNREAD_FOR_SECONDARY + burstMessages.length,
    );

    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: directConversationId });

    for (const messageText of burstMessages) {
      const messageLocator = secondaryPage.locator('[data-testid^="message-"]', { hasText: messageText });
      await expect(messageLocator).toHaveCount(1, { timeout: RECV_TIMEOUT_MS });
      await expect(messageLocator.first()).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    }

    // Phase 4: the badge reaches 0 once every message has been on screen.
    await scrollFeedToTopStepwise(secondaryPage);
    await backToConversationList(secondaryPage, directConversationId);
    await expect
      .poll(() => readListUnreadCount(secondaryPage, directConversationId), { timeout: RECV_TIMEOUT_MS })
      .toBe(0);
  });

  test('LATE JOIN catches the badge up on messages sent before the recipient Realtime joined', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    // Two signed-in accounts and three confirmed sends: about 20s locally.
    test.setTimeout(60_000);
    const directConversationId = messagingData.directConversationId;
    const messages = makeUniqueMessages('t26-late-join').slice(0, 3);

    // Hold the recipient's Realtime connection: everything it would stream
    // until it is released is never delivered as an event.
    let releaseRealtime: () => void = () => {};
    const realtimeReleased = new Promise<void>((resolve) => {
      releaseRealtime = resolve;
    });
    await secondaryPage.routeWebSocket(/\/realtime\/v1\/websocket/, async (socket) => {
      await realtimeReleased;
      socket.connectToServer();
    });

    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    await expectConversationUnreadCount(secondaryPage, directConversationId, SEEDED_UNREAD_FOR_SECONDARY);

    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: directConversationId });
    await waitForRealtimeReady(primaryPage);
    for (const content of messages) {
      await sendMessage(primaryPage, content);
    }

    // Every message is committed before the recipient's Realtime joins.
    releaseRealtime();
    await waitForRealtimeReady(secondaryPage);
    await expectConversationUnreadCount(
      secondaryPage,
      directConversationId,
      SEEDED_UNREAD_FOR_SECONDARY + messages.length,
    );
  });
});
