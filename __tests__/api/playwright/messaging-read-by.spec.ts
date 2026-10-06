import type { Locator, Page } from '@playwright/test';

import { test, expect, markReadAsSeededMember } from './fixtures/messaging';
import {
  openDrawer,
  selectConversation,
  sendMessage,
  waitForRealtimeReady,
} from './helpers/drawer-helpers';

/**
 * Phase 4 T8 — senders see "Lida por N" with a live reader list (FR-001,
 * FR-002, FR-003, FR-005; AC-001, AC-002, AC-003, AC-006, AC-037).
 */

const RECV_TIMEOUT_MS = 15_000;

/** Long enough for any read the drawer was going to report to land (batch 300 ms + round trip). */
const QUIET_WINDOW_MS = 2_500;

const SECONDARY_NAME = process.env.PLAYWRIGHT_SECONDARY_DISPLAY_NAME ?? 'Playwright Secondary';
const TERTIARY_NAME = process.env.PLAYWRIGHT_TERTIARY_DISPLAY_NAME ?? 'Playwright Tertiary';

const readBy = (page: Page, messageId: string) => page.locator(`[data-testid="read-by-${messageId}"]`);
const readersList = (page: Page, messageId: string) => page.locator(`[data-testid="readers-list-${messageId}"]`);
const readerItems = (list: Locator) => list.locator('[data-testid^="reader-item-"]');

/** Marks the page so a later check can prove no reload/navigation happened. */
async function markNoReload(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __t8NoReload?: boolean }).__t8NoReload = true;
  });
}

async function expectNoReload(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => (window as unknown as { __t8NoReload?: boolean }).__t8NoReload === true),
    'the update must arrive without a reload',
  ).toBe(true);
}

/** Opens the drawer on a conversation in the page's own feed and waits for Realtime. */
async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await page.waitForLoadState('networkidle');
  await openDrawer(page);
  await waitForRealtimeReady(page);
  await selectConversation(page, { id: conversationId });
}

/** Before any read: the sent/delivered status stays and no "Lida por 0" exists. */
async function expectUnreadStatus(page: Page, messageId: string): Promise<void> {
  await expect(page.locator(`[data-testid="message-status-${messageId}"] svg`)).toBeVisible();
  await expect(readBy(page, messageId)).toHaveCount(0);
  await expect(page.locator('[data-testid="messages-feed"]')).not.toContainText('Lida por 0');
}

/** A reader row: canonical avatar, name, and a pt-BR read time (today → HH:mm). */
async function expectReaderRow(list: Locator, userId: string, name: string): Promise<string> {
  const row = list.locator(`[data-testid="reader-item-${userId}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('[data-testid="reader-name"]')).toHaveText(name);
  await expect(row.locator('[data-testid="reader-avatar"]')).toBeVisible();
  const time = row.locator('[data-testid="reader-read-at"]');
  await expect(time).toHaveText(/^\d{2}:\d{2}$/);
  const dateTime = (await time.getAttribute('datetime')) ?? '';
  const readAt = Date.parse(dateTime);
  expect(Number.isNaN(readAt), `datetime "${dateTime}" must be ISO`).toBe(false);
  expect(Math.abs(Date.now() - readAt)).toBeLessThan(5 * 60_000);
  return dateTime;
}

/** The non-sender sees no reader details: no control, no count, and the API refuses. */
async function expectNonSenderView(page: Page, conversationId: string, messageId: string): Promise<void> {
  await expect(page.locator(`[data-testid="message-${messageId}"]`)).toBeVisible();
  await expect(readBy(page, messageId)).toHaveCount(0);
  await expect(page.locator(`[data-testid="message-status-${messageId}"]`)).toHaveCount(0);

  const feed = await page.request.get(`/api/messages/get?conversationId=${conversationId}&limit=50`);
  expect(feed.ok()).toBe(true);
  const body = (await feed.json()) as { messages: Array<{ id: string; readCount?: number }> };
  const message = body.messages.find((candidate) => candidate.id === messageId);
  expect(message, 'the message is in the non-sender feed').toBeTruthy();
  expect(message && 'readCount' in message, 'no reader count for a message the viewer did not send').toBe(false);

  const readers = await page.request.get(`/api/messages/${messageId}/readers`);
  expect(readers.status()).toBe(403);
  expect(((await readers.json()) as { code?: string }).code).toBe('NOT_MESSAGE_SENDER');
}

test.describe('Senders see who read their message', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ messagingSeedOptions: { includeThirdMember: true } });

  test('direct: "Lida por 1" appears live, opens by keyboard, and the recipient sees no reader details', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(90_000);
    const conversationId = messagingData.directConversationId;

    await openConversation(primaryPage, conversationId);
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    await openDrawer(secondaryPage);
    await waitForRealtimeReady(secondaryPage);

    const messageId = await sendMessage(primaryPage, `t8-direct-${Date.now()}`);
    expect(messageId).toBeTruthy();
    await primaryPage.waitForTimeout(QUIET_WINDOW_MS);
    await expectUnreadStatus(primaryPage, messageId);
    await markNoReload(primaryPage);

    // The recipient opens the conversation: the message is on screen and read.
    await selectConversation(secondaryPage, { id: conversationId });
    await expect(secondaryPage.locator(`[data-testid="message-${messageId}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });

    const trigger = readBy(primaryPage, messageId);
    await expect(trigger).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
    await expectNoReload(primaryPage);
    await expect(trigger).toHaveAccessibleName(/Lida por 1/);
    // The status icon stays next to the summary; no denominator.
    await expect(primaryPage.locator(`[data-testid="message-status-${messageId}"] svg`)).toBeVisible();
    await expect(trigger).not.toContainText('/');

    // Keyboard: focus the control and press Enter.
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await primaryPage.keyboard.press('Enter');
    const list = readersList(primaryPage, messageId);
    await expect(list).toBeVisible();
    await expect(list).toHaveAttribute('role', 'dialog');
    await expect(readerItems(list)).toHaveCount(1);
    await expectReaderRow(list, messagingData.secondary.userId, SECONDARY_NAME);
    await expect(list).not.toContainText(/não lid|não leu|de \d/i);

    // Escape closes it and returns focus to the control; the conversation stays open.
    await primaryPage.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(primaryPage.locator('[data-testid="messages-feed"]')).toBeVisible();

    await expectNonSenderView(secondaryPage, conversationId, messageId);
  });

  test('group: the open reader list updates live, most recent first, and excludes the sender', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(90_000);
    const conversationId = messagingData.groupConversationId ?? '';
    const tertiaryId = messagingData.tertiary?.userId ?? '';
    expect(conversationId, 'group conversation seeded').toBeTruthy();
    expect(tertiaryId, 'third member seeded').toBeTruthy();

    await openConversation(primaryPage, conversationId);
    // The drawer is titled with the group's name, as in the list and the feed
    // header, not with one of its members' names.
    await expect(primaryPage.getByTestId('messaging-drawer-title')).toHaveText(/^Test Group /);
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    await openDrawer(secondaryPage);
    await waitForRealtimeReady(secondaryPage);

    const messageId = await sendMessage(primaryPage, `t8-group-${Date.now()}`);
    await primaryPage.waitForTimeout(QUIET_WINDOW_MS);
    await expectUnreadStatus(primaryPage, messageId);
    await markNoReload(primaryPage);

    await selectConversation(secondaryPage, { id: conversationId });
    await expect(secondaryPage.locator(`[data-testid="message-${messageId}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
    const trigger = readBy(primaryPage, messageId);
    await expect(trigger).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });

    // Keyboard: Space opens it too.
    await trigger.focus();
    await primaryPage.keyboard.press('Space');
    const list = readersList(primaryPage, messageId);
    await expect(list).toBeVisible();
    await expect(readerItems(list)).toHaveCount(1);
    const secondaryReadAt = await expectReaderRow(list, messagingData.secondary.userId, SECONDARY_NAME);

    // While the list is open, the third member reads: list and summary update
    // without a reload, the latest reader first.
    const recorded = await markReadAsSeededMember(primaryPage.request, {
      conversationId,
      userId: tertiaryId,
      messageIds: [messageId],
    });
    expect(recorded).toBe(1);

    await expect(readerItems(list)).toHaveCount(2, { timeout: RECV_TIMEOUT_MS });
    await expect(list).toBeVisible();
    await expect(trigger).toHaveText('Lida por 2', { timeout: RECV_TIMEOUT_MS });
    await expect(list).toContainText('Lida por 2');
    await expectNoReload(primaryPage);

    const tertiaryReadAt = await expectReaderRow(list, tertiaryId, TERTIARY_NAME);
    await expect(readerItems(list).nth(0)).toHaveAttribute('data-testid', `reader-item-${tertiaryId}`);
    await expect(readerItems(list).nth(1)).toHaveAttribute(
      'data-testid',
      `reader-item-${messagingData.secondary.userId}`,
    );
    expect(Date.parse(tertiaryReadAt)).toBeGreaterThanOrEqual(Date.parse(secondaryReadAt));
    // The sender is never listed (N counts non-sender readers only).
    await expect(list.locator(`[data-testid="reader-item-${messagingData.primary.userId}"]`)).toHaveCount(0);

    await primaryPage.keyboard.press('Escape');
    await expect(list).toBeHidden();

    await expectNonSenderView(secondaryPage, conversationId, messageId);
  });

  test('room: opens by click within the drawer width, clicks inside stay inside, recipient sees no details', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(90_000);
    const conversationId = messagingData.roomConversationIds[0];

    await openConversation(primaryPage, conversationId);
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    await openDrawer(secondaryPage);
    await waitForRealtimeReady(secondaryPage);

    const messageId = await sendMessage(primaryPage, `t8-room-${Date.now()}`);
    await primaryPage.waitForTimeout(QUIET_WINDOW_MS);
    await expectUnreadStatus(primaryPage, messageId);
    await markNoReload(primaryPage);

    await selectConversation(secondaryPage, { id: conversationId });
    await expect(secondaryPage.locator(`[data-testid="message-${messageId}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
    const trigger = readBy(primaryPage, messageId);
    await expect(trigger).toHaveText('Lida por 1', { timeout: RECV_TIMEOUT_MS });
    await expectNoReload(primaryPage);

    // The control fits inside the (fixed, narrow) drawer.
    const drawerBox = await primaryPage.locator('[data-testid="messaging-drawer"]').boundingBox();
    const triggerBox = await trigger.boundingBox();
    expect(drawerBox && triggerBox).toBeTruthy();
    if (drawerBox && triggerBox) {
      expect(triggerBox.x).toBeGreaterThanOrEqual(drawerBox.x);
      expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width);
    }

    await trigger.click();
    const list = readersList(primaryPage, messageId);
    await expect(list).toBeVisible();
    await expectReaderRow(list, messagingData.secondary.userId, SECONDARY_NAME);

    // The list is no wider than the drawer and stays on screen.
    const listBox = await list.boundingBox();
    const viewport = primaryPage.viewportSize();
    expect(listBox && viewport && drawerBox).toBeTruthy();
    if (listBox && viewport && drawerBox) {
      expect(listBox.width).toBeLessThanOrEqual(drawerBox.width);
      expect(listBox.x).toBeGreaterThanOrEqual(0);
      expect(listBox.x + listBox.width).toBeLessThanOrEqual(viewport.width);
    }

    // Clicking inside the list neither closes it nor reaches the message or drawer.
    await list.locator(`[data-testid="reader-item-${messagingData.secondary.userId}"]`).click();
    await expect(list).toBeVisible();
    await expect(primaryPage.locator('[data-testid="messages-feed"]')).toBeVisible();
    await expect(primaryPage.locator(`[data-testid="message-${messageId}"]`)).toBeVisible();

    // Clicking the control again closes it.
    await trigger.click();
    await expect(list).toBeHidden();

    await expectNonSenderView(secondaryPage, conversationId, messageId);
  });
});
