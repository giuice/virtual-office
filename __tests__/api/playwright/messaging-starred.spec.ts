import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import { feedViewport, openDrawer, selectConversation, waitForRealtimeReady } from './helpers/drawer-helpers';

/**
 * Phase 4 T10 — personal stars and the starred filter in the production feed
 * (FR-020, FR-021, BR-009; AC-023, AC-024, AC-037).
 *
 * The seeded history conversation holds HISTORY_COUNT messages; the feed loads
 * 20 at a time, so History 1–25 are older than its first page.
 */

const HISTORY_COUNT = 45;
const RECV_TIMEOUT_MS = 15_000;

/** Starred through the API before the UI part (exercises starred pagination: 22 stars > 20 per page). */
const API_STARRED = [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
/** Starred through the feed: one in its first page, one only reachable after "Load more messages". */
const FIRST_PAGE_STAR = 40;
const OLDER_PAGE_STAR = 10;
/** Unstarred from the starred view. */
const UNSTARRED_IN_VIEW = 3;

const byNewestFirst = (a: number, b: number) => b - a;

const starToggle = (page: Page) => page.getByTestId('starred-filter-toggle');
const starredResults = (page: Page) => page.locator('[data-testid^="starred-result-"]');
const starredIndicator = (page: Page, messageId: string) => page.getByTestId(`message-starred-${messageId}`);

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await page.waitForLoadState('networkidle');
  await openDrawer(page);
  await waitForRealtimeReady(page);
  await selectConversation(page, { id: conversationId });
}

function waitForStarResponse(page: Page, messageId: string, method: 'POST' | 'DELETE'): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.url().includes(`/api/messages/${messageId}/star`) && response.request().method() === method,
    { timeout: RECV_TIMEOUT_MS },
  );
}

async function readStarredOrder(page: Page): Promise<string[]> {
  return starredResults(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-starred-result-id') ?? ''),
  );
}

/** Opens a message's "Mais ações" menu by keyboard and activates the star entry with Enter. */
async function toggleStarByKeyboard(page: Page, message: Locator, entryName: string): Promise<void> {
  const messageId = ((await message.getAttribute('data-testid')) ?? '').replace('message-', '');
  // Focusing inside the message reveals its action bar, as hovering does.
  await page.getByTestId(`reply-button-${messageId}`).focus();
  const more = message.getByRole('button', { name: 'Mais ações' });
  await more.focus();
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter');
  const entry = page.getByRole('menuitem', { name: entryName });
  await expect(entry).toBeVisible();
  // The first entry (pin) gets focus when the menu opens; the star entry is next.
  await page.keyboard.press('ArrowDown');
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Opens a message's menu with the pointer and picks the star entry. */
async function toggleStarByPointer(page: Page, message: Locator, entryName: string): Promise<void> {
  await message.hover();
  await message.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: entryName }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

test.describe('Personal stars and the starred filter', () => {
  test.use({ messagingSeedOptions: { historyMessageCount: HISTORY_COUNT } });

  test('A stars messages (one older than the first page), filters to them newest first with pagination and back; B sees no star; A\'s other session sees it after refresh', async ({
    browser,
    primaryPage,
    secondaryPage,
    primaryStorageState,
    messagingData,
  }) => {
    test.setTimeout(150_000);
    const conversationId = messagingData.historyConversationId ?? '';
    expect(conversationId, 'seed did not create the history conversation').toBeTruthy();
    // History messages are seeded last, oldest first.
    const historyIds = messagingData.messageIds.slice(-HISTORY_COUNT);
    expect(historyIds).toHaveLength(HISTORY_COUNT);
    const historyId = (n: number) => historyIds[n - 1];

    for (const n of API_STARRED) {
      const response = await primaryPage.request.post(`/api/messages/${historyId(n)}/star`);
      expect(response.status(), `API star of History ${n}`).toBe(201);
    }

    // A's second session is open before the UI stars; it only learns of them after a refresh.
    const secondContext = await browser.newContext({ storageState: primaryStorageState });
    const secondSession = await secondContext.newPage();
    await openConversation(secondSession, conversationId);
    await expect(secondSession.getByTestId(`message-${historyId(FIRST_PAGE_STAR)}`)).toBeVisible({
      timeout: RECV_TIMEOUT_MS,
    });
    await expect(starredIndicator(secondSession, historyId(FIRST_PAGE_STAR))).toHaveCount(0);

    // --- A stars a message in the first page, by keyboard.
    await openConversation(primaryPage, conversationId);
    const feed = primaryPage.getByTestId('messages-feed');
    await expect(feed.getByTestId(`message-${historyId(HISTORY_COUNT)}`)).toBeInViewport({ timeout: RECV_TIMEOUT_MS });

    const firstPageMessage = feed.getByTestId(`message-${historyId(FIRST_PAGE_STAR)}`);
    await firstPageMessage.scrollIntoViewIfNeeded();
    const firstStarSaved = waitForStarResponse(primaryPage, historyId(FIRST_PAGE_STAR), 'POST');
    await toggleStarByKeyboard(primaryPage, firstPageMessage, 'Favoritar');
    await expect(starredIndicator(primaryPage, historyId(FIRST_PAGE_STAR))).toBeVisible();
    await expect(starredIndicator(primaryPage, historyId(FIRST_PAGE_STAR))).toHaveAccessibleName('Favoritada');
    expect((await firstStarSaved).status()).toBe(201);

    // --- A loads an older page and stars a message that was not in the first page.
    await expect(feed.getByTestId(`message-${historyId(OLDER_PAGE_STAR)}`)).toHaveCount(0);
    await feedViewport(primaryPage).evaluate((viewport) => {
      viewport.scrollTop = 0;
    });
    await feed.getByRole('button', { name: 'Load more messages' }).click();
    const olderMessage = feed.getByTestId(`message-${historyId(OLDER_PAGE_STAR)}`);
    await expect(olderMessage).toBeAttached({ timeout: RECV_TIMEOUT_MS });
    await olderMessage.scrollIntoViewIfNeeded();
    const olderStarSaved = waitForStarResponse(primaryPage, historyId(OLDER_PAGE_STAR), 'POST');
    await toggleStarByPointer(primaryPage, olderMessage, 'Favoritar');
    await expect(starredIndicator(primaryPage, historyId(OLDER_PAGE_STAR))).toBeVisible();
    expect((await olderStarSaved).status()).toBe(201);

    // --- The header control fits the narrow drawer and switches to the starred view by keyboard.
    const toggle = starToggle(primaryPage);
    await expect(toggle).toHaveAccessibleName('Favoritas');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const drawerBox = await primaryPage.getByTestId('messaging-drawer').boundingBox();
    const toggleBox = await toggle.boundingBox();
    expect(drawerBox && toggleBox).toBeTruthy();
    if (drawerBox && toggleBox) {
      expect(toggleBox.x).toBeGreaterThanOrEqual(drawerBox.x);
      expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width);
    }

    await toggle.focus();
    await primaryPage.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(primaryPage.getByTestId('starred-messages-view')).toBeVisible({ timeout: RECV_TIMEOUT_MS });

    const allStarred = [...API_STARRED, FIRST_PAGE_STAR, OLDER_PAGE_STAR].sort(byNewestFirst);
    const expectedOrder = allStarred.map(historyId);
    // First starred page: 20 results, newest message first, including messages
    // older than the feed's first page; nothing unstarred shows.
    await expect(starredResults(primaryPage)).toHaveCount(20);
    expect(await readStarredOrder(primaryPage)).toEqual(expectedOrder.slice(0, 20));
    await expect(feed.getByTestId(`message-${historyId(HISTORY_COUNT)}`)).toHaveCount(0);
    await expect(feed.getByRole('button', { name: 'Load more messages' })).toHaveCount(0);

    // Next starred page.
    await feed.getByRole('button', { name: 'Carregar mais favoritas' }).click();
    await expect(starredResults(primaryPage)).toHaveCount(allStarred.length, { timeout: RECV_TIMEOUT_MS });
    expect(await readStarredOrder(primaryPage)).toEqual(expectedOrder);
    await expect(feed.getByRole('button', { name: 'Carregar mais favoritas' })).toHaveCount(0);

    // --- Unstarring in the starred view removes the result, by keyboard.
    const unstarSaved = waitForStarResponse(primaryPage, historyId(UNSTARRED_IN_VIEW), 'DELETE');
    const unstarTarget = primaryPage.getByTestId(`message-${historyId(UNSTARRED_IN_VIEW)}`);
    await unstarTarget.scrollIntoViewIfNeeded();
    await toggleStarByKeyboard(primaryPage, unstarTarget, 'Remover dos favoritos');
    expect((await unstarSaved).status()).toBe(200);
    const remaining = allStarred.filter((n) => n !== UNSTARRED_IN_VIEW);
    await expect(starredResults(primaryPage)).toHaveCount(remaining.length);
    expect(await readStarredOrder(primaryPage)).toEqual(remaining.map(historyId));

    // --- Back to the normal feed, at the newest message, with the stars still shown.
    await toggle.focus();
    await primaryPage.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(primaryPage.getByTestId('starred-messages-view')).toHaveCount(0);
    await expect(feed.getByTestId(`message-${historyId(HISTORY_COUNT)}`)).toBeInViewport({ timeout: RECV_TIMEOUT_MS });
    await expect(starredIndicator(primaryPage, historyId(FIRST_PAGE_STAR))).toBeVisible();

    // --- B sees none of A's stars: not in the feed, not in the payload, not in B's filter.
    await openConversation(secondaryPage, conversationId);
    const secondaryFeed = secondaryPage.getByTestId('messages-feed');
    await expect(secondaryFeed.getByTestId(`message-${historyId(FIRST_PAGE_STAR)}`)).toBeVisible({
      timeout: RECV_TIMEOUT_MS,
    });
    await expect(secondaryFeed.locator('[data-testid^="message-starred-"]')).toHaveCount(0);
    const secondaryPayload = await secondaryPage.request.get(
      `/api/messages/get?conversationId=${conversationId}&limit=50`,
    );
    expect(secondaryPayload.ok()).toBe(true);
    const secondaryMessages = ((await secondaryPayload.json()) as {
      messages: Array<{ id: string; stars?: unknown[] }>;
    }).messages;
    expect(secondaryMessages.length).toBeGreaterThanOrEqual(remaining.length);
    for (const message of secondaryMessages) {
      expect(message.stars ?? [], `B sees no star on ${message.id}`).toEqual([]);
    }
    await starToggle(secondaryPage).click();
    await expect(secondaryPage.getByTestId('starred-messages-empty')).toHaveText(
      'Nenhuma mensagem favoritada nesta conversa',
      { timeout: RECV_TIMEOUT_MS },
    );
    await expect(starredResults(secondaryPage)).toHaveCount(0);

    // --- A's other session shows the stars after a refresh.
    await secondSession.reload();
    await secondSession.waitForLoadState('networkidle');
    await openDrawer(secondSession);
    // The drawer restores its last view (conversation or list) after a reload.
    const secondFeed = secondSession.getByTestId('messages-feed');
    const listItem = secondSession.getByTestId(`conversation-item-${conversationId}`);
    await expect(secondFeed.or(listItem)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    if (!(await secondFeed.isVisible())) {
      await selectConversation(secondSession, { id: conversationId });
    }
    await expect(starredIndicator(secondSession, historyId(FIRST_PAGE_STAR))).toBeVisible({
      timeout: RECV_TIMEOUT_MS,
    });
    await starToggle(secondSession).click();
    await expect(starredResults(secondSession)).toHaveCount(20, { timeout: RECV_TIMEOUT_MS });
    expect(await readStarredOrder(secondSession)).toEqual(remaining.slice(0, 20).map(historyId));
    await expect(secondSession.getByTestId(`starred-result-${historyId(OLDER_PAGE_STAR)}`)).toBeVisible();

    await secondContext.close();
  });
});
