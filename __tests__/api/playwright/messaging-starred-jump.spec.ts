import { randomUUID } from 'node:crypto';

import type { Locator, Page, Request, Route } from '@playwright/test';

import { test, expect, removeSeededMember } from './fixtures/messaging';
import { feedViewport, openDrawer, selectConversation, waitForRealtimeReady } from './helpers/drawer-helpers';

/**
 * Phase 4 T11 — selecting a starred result opens it in the feed (FR-022;
 * AC-025, AC-026, AC-037).
 *
 * The seeded history conversation holds HISTORY_COUNT messages (primary owns
 * the odd ones); the feed loads 20 per page, newest first, so History 3 is
 * only in the third page.
 */

const HISTORY_COUNT = 45;
const RECV_TIMEOUT_MS = 15_000;
const DRAWER_WIDTH_PX = 384;
const OLD_STAR = 3;
const FIRST_PAGE_STAR = 35;
/** The reply below targets History 2; it nests under it once History 2 is loaded. */
const REPLY_PARENT = 2;
/** Watched for B's reaction (always in the first page). */
const REACTION_TARGET = HISTORY_COUNT;
const REACTION = '👍';
const NOTICE_TEXT = 'Não foi possível mostrar esta mensagem.';

const starToggle = (page: Page) => page.getByTestId('starred-filter-toggle');
const openInFeedButton = (page: Page, messageId: string) => page.getByTestId(`starred-open-${messageId}`);
const jumpLoading = (page: Page) => page.getByTestId('feed-jump-loading');
const jumpNotice = (page: Page) => page.getByTestId('feed-jump-notice');
/** A message's wrapper in the feed (starred results carry no thread depth). */
const feedWrapper = (page: Page, messageId: string) =>
  page.getByTestId('messages-feed').locator(`[data-message-id="${messageId}"][data-thread-depth]`);

/** Seeded content starts with "History NNN of …". */
const historyLabel = (n: number) => `History ${String(n).padStart(3, '0')} of ${HISTORY_COUNT}`;

const isOlderPageRequest = (request: Request): boolean => {
  const url = new URL(request.url());
  return url.pathname === '/api/messages/get' && url.searchParams.has('cursorBefore');
};

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await page.waitForLoadState('networkidle');
  await openDrawer(page);
  await waitForRealtimeReady(page);
  // The drawer restores its last view (conversation or list) after a reload.
  const feed = page.getByTestId('messages-feed');
  const listItem = page.getByTestId(`conversation-item-${conversationId}`);
  await expect(feed.or(listItem)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
  if (!(await feed.isVisible())) {
    await selectConversation(page, { id: conversationId });
  }
}

async function showStarred(page: Page): Promise<void> {
  const toggle = starToggle(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('starred-messages-view')).toBeVisible({ timeout: RECV_TIMEOUT_MS });
}

/** The message wrapper is entirely inside the feed's scroll viewport. */
async function expectFullyInFeedViewport(page: Page, wrapper: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const viewportBox = await feedViewport(page).boundingBox();
      const box = await wrapper.boundingBox();
      if (!viewportBox || !box) return false;
      return box.y >= viewportBox.y - 1 && box.y + box.height <= viewportBox.y + viewportBox.height + 1;
    }, { timeout: RECV_TIMEOUT_MS })
    .toBe(true);
}

/** Reached, centered, focused, and visibly highlighted (ring + background). */
async function expectJumpedTo(page: Page, messageId: string): Promise<void> {
  const wrapper = feedWrapper(page, messageId);
  await expect(wrapper).toHaveAttribute('data-jump-highlighted', 'true', { timeout: RECV_TIMEOUT_MS });
  await expect(wrapper).toBeFocused();
  await expect(wrapper).toBeInViewport();
  await expectFullyInFeedViewport(page, wrapper);
  const style = await wrapper.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { boxShadow: computed.boxShadow, background: computed.backgroundColor };
  });
  expect(style.boxShadow).not.toBe('none');
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  await expect(jumpLoading(page)).toHaveCount(0);
  await expect(jumpNotice(page)).toHaveCount(0);
  await expect(page.getByTestId('starred-messages-view')).toHaveCount(0);
  await expect(starToggle(page)).toHaveAttribute('aria-pressed', 'false');
}

async function expectInsideDrawer(page: Page, target: Locator): Promise<void> {
  const drawerBox = await page.getByTestId('messaging-drawer').boundingBox();
  const box = await target.boundingBox();
  expect(drawerBox && box).toBeTruthy();
  if (drawerBox && box) {
    expect(drawerBox.width).toBeLessThanOrEqual(DRAWER_WIDTH_PX);
    expect(box.x).toBeGreaterThanOrEqual(drawerBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(drawerBox.x + drawerBox.width);
  }
}

test.describe('Opening a starred message in the feed', () => {
  test.use({ messagingSeedOptions: { historyMessageCount: HISTORY_COUNT } });

  test('an old starred message is loaded page by page with a loading indicator, centered, focused, and highlighted, even when a Realtime refetch cancels a page load', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(150_000);
    const conversationId = messagingData.historyConversationId ?? '';
    expect(conversationId, 'seed did not create the history conversation').toBeTruthy();
    const historyIds = messagingData.messageIds.slice(-HISTORY_COUNT);
    expect(historyIds).toHaveLength(HISTORY_COUNT);
    const historyId = (n: number) => historyIds[n - 1];

    // A replies to History 2 (the reply is the newest message) and stars it,
    // History 35 (first page) and History 3 (third page).
    const created = await primaryPage.request.post('/api/messages/create', {
      data: { conversationId, content: `Reply to History ${REPLY_PARENT} for the starred jump`, replyToId: historyId(REPLY_PARENT) },
    });
    expect(created.status()).toBe(201);
    const replyId = ((await created.json()) as { message: { id: string } }).message.id;
    for (const id of [historyId(OLD_STAR), historyId(FIRST_PAGE_STAR), replyId]) {
      const starred = await primaryPage.request.post(`/api/messages/${id}/star`);
      expect(starred.status(), `API star of ${id}`).toBe(201);
    }

    const olderPageCursors: string[] = [];
    primaryPage.on('request', (request) => {
      if (isOlderPageRequest(request)) {
        olderPageCursors.push(new URL(request.url()).searchParams.get('cursorBefore') ?? '');
      }
    });

    await openConversation(primaryPage, conversationId);
    const feed = primaryPage.getByTestId('messages-feed');
    await expect(feed.getByTestId(`message-${historyId(REACTION_TARGET)}`)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(feed.getByTestId(`message-${historyId(OLD_STAR)}`)).toHaveCount(0);

    // B's reaction reaches A live: Realtime events are flowing for A.
    const reactionChip = feed.getByTestId(`message-${historyId(REACTION_TARGET)}`).getByTestId(`reaction-chip-${REACTION}`);
    const added = await secondaryPage.request.post('/api/messages/react', {
      data: { messageId: historyId(REACTION_TARGET), emoji: REACTION },
    });
    expect(added.ok()).toBe(true);
    await expect(reactionChip).toBeVisible({ timeout: RECV_TIMEOUT_MS });

    // --- Keyboard: open History 3 (third page) from the starred view. The
    // first older-page response is held so a refetch can cancel it.
    await showStarred(primaryPage);
    const openOld = openInFeedButton(primaryPage, historyId(OLD_STAR));
    // AC-037: the visible text starts the accessible name, which also says
    // which message the button opens, so the list's buttons are distinct.
    await expect(openOld).toHaveText('Ver na conversa');
    await expect(openOld).toHaveAccessibleName(new RegExp(`^Ver na conversa: ${historyLabel(OLD_STAR)}\\b`));
    await expect(openInFeedButton(primaryPage, historyId(FIRST_PAGE_STAR))).toHaveAccessibleName(
      new RegExp(`^Ver na conversa: ${historyLabel(FIRST_PAGE_STAR)}\\b`)
    );
    await expectInsideDrawer(primaryPage, openOld);

    let releaseHeld: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    let heldOnce = false;
    let markHeld: () => void = () => {};
    const heldStarted = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    await primaryPage.route(
      (url) => url.pathname === '/api/messages/get' && url.searchParams.has('cursorBefore'),
      async (route: Route) => {
        if (!heldOnce) {
          heldOnce = true;
          markHeld();
          await held;
        }
        await route.continue().catch(() => {});
      },
    );

    await openOld.focus();
    await primaryPage.keyboard.press('Enter');
    await expect(primaryPage.getByTestId('starred-messages-view')).toHaveCount(0);
    await heldStarted;
    await expect(jumpLoading(primaryPage)).toBeVisible();
    await expect(jumpLoading(primaryPage)).toHaveRole('status');
    await expect(jumpLoading(primaryPage)).toHaveText('Carregando mensagens anteriores…');
    await expect(jumpLoading(primaryPage)).toBeInViewport();

    // B removes the reaction: A's Realtime DELETE handler runs a cancelling
    // refetch while the older page is still in flight; the chip disappears
    // only once that refetch has completed.
    const removed = await secondaryPage.request.post('/api/messages/react', {
      data: { messageId: historyId(REACTION_TARGET), emoji: REACTION },
    });
    expect(removed.ok()).toBe(true);
    await expect(reactionChip).toHaveCount(0, { timeout: RECV_TIMEOUT_MS });
    // The search does not wait for the abandoned request: it requests that
    // page again and continues (it may already be done at this point).
    releaseHeld();

    await expectJumpedTo(primaryPage, historyId(OLD_STAR));
    await expect(feed.getByTestId(`message-${historyId(OLD_STAR)}`)).toBeVisible();
    // The cancelled page was requested again, then the next older page:
    // three requests, the first cursor twice.
    expect(olderPageCursors.length).toBeGreaterThanOrEqual(3);
    expect(olderPageCursors[1]).toBe(olderPageCursors[0]);
    expect(new Set(olderPageCursors).size).toBe(2);
    await primaryPage.unrouteAll({ behavior: 'ignoreErrors' });

    // The reached position holds through a later feed refetch (receipts).
    await expect(feedWrapper(primaryPage, historyId(OLD_STAR))).toBeInViewport();

    // --- Mouse: a click on the result itself opens History 35 (first page).
    await showStarred(primaryPage);
    await primaryPage
      .getByTestId(`starred-result-${historyId(FIRST_PAGE_STAR)}`)
      .getByText(historyLabel(FIRST_PAGE_STAR))
      .click();
    await expectJumpedTo(primaryPage, historyId(FIRST_PAGE_STAR));

    // --- Keyboard (Space): the reply is now inside History 2's collapsed
    // thread; opening it expands the thread.
    await expect(feedWrapper(primaryPage, replyId)).toHaveCount(0);
    await showStarred(primaryPage);
    await openInFeedButton(primaryPage, replyId).focus();
    await primaryPage.keyboard.press('Space');
    await expectJumpedTo(primaryPage, replyId);
    await expect(primaryPage.getByTestId(`thread-panel-${historyId(REPLY_PARENT)}`)).toBeVisible();
    await expect(feedWrapper(primaryPage, replyId)).toHaveAttribute('data-thread-depth', '1');

    await expect(feed.getByText('Failed to load messages. Please try again.')).toHaveCount(0);
  });

  test('a starred message that is gone or no longer accessible ends in a notice; the feed stays and nothing keeps loading', async ({
    primaryPage,
    messagingData,
    request,
  }) => {
    test.setTimeout(150_000);
    const conversationId = messagingData.historyConversationId ?? '';
    expect(conversationId, 'seed did not create the history conversation').toBeTruthy();
    const historyIds = messagingData.messageIds.slice(-HISTORY_COUNT);
    expect(historyIds).toHaveLength(HISTORY_COUNT);
    const historyId = (n: number) => historyIds[n - 1];

    // History 21 (A's own message) is listed as starred, but it no longer
    // exists when A opens it: the app has no delete path, so the starred
    // response swaps in an id the server does not know.
    const GONE = 21;
    const goneId = randomUUID();
    for (const n of [OLD_STAR, GONE]) {
      const starred = await primaryPage.request.post(`/api/messages/${historyId(n)}/star`);
      expect(starred.status(), `API star of History ${n}`).toBe(201);
    }
    const starredRoute = (url: URL) => url.pathname === '/api/messages/starred';
    await primaryPage.route(starredRoute, async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { messages: Array<{ id: string }> };
      for (const message of body.messages) {
        if (message.id === historyId(GONE)) message.id = goneId;
      }
      await route.fulfill({ response, json: body });
    });

    const olderPageResponses: Array<{ cursor: string; status: number }> = [];
    primaryPage.on('response', (response) => {
      const olderRequest = response.request();
      if (isOlderPageRequest(olderRequest)) {
        olderPageResponses.push({
          cursor: new URL(olderRequest.url()).searchParams.get('cursorBefore') ?? '',
          status: response.status(),
        });
      }
    });
    // Background refetches (e.g. after read receipts) may repeat loaded pages;
    // the search itself must stop at the oldest one.
    const distinctCursors = () => new Set(olderPageResponses.map((entry) => entry.cursor)).size;

    await openConversation(primaryPage, conversationId);
    const feed = primaryPage.getByTestId('messages-feed');
    await expect(feed.getByTestId(`message-${historyId(HISTORY_COUNT)}`)).toBeVisible({ timeout: RECV_TIMEOUT_MS });

    // --- Gone: the whole history is loaded (two older pages), then the notice.
    await showStarred(primaryPage);
    await primaryPage.getByTestId(`starred-result-${goneId}`).getByText(historyLabel(GONE)).click();
    const notice = jumpNotice(primaryPage);
    await expect(notice).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(notice).toHaveRole('alert');
    await expect(notice).toContainText(NOTICE_TEXT);
    await expect(notice).toBeFocused();
    await expectInsideDrawer(primaryPage, notice);
    await expect(jumpLoading(primaryPage)).toHaveCount(0);
    expect(distinctCursors()).toBe(2);
    expect(olderPageResponses.every((entry) => entry.status === 200)).toBe(true);
    await expect(feed.getByTestId(`message-${historyId(1)}`)).toBeAttached();
    await expect(primaryPage.locator('[data-jump-highlighted]')).toHaveCount(0);
    // Nothing keeps loading.
    await primaryPage.waitForTimeout(2_000);
    await expect(jumpLoading(primaryPage)).toHaveCount(0);
    await expect(notice).toBeVisible();
    expect(distinctCursors()).toBe(2);
    await primaryPage.getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(notice).toHaveCount(0);
    await primaryPage.unroute(starredRoute);

    // --- Lost access: a fresh session holds only the first page; A is
    // removed from the conversation after the starred list is shown.
    olderPageResponses.length = 0;
    await openConversation(primaryPage, conversationId);
    await expect(feed.getByTestId(`message-${historyId(HISTORY_COUNT)}`)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(feed.getByTestId(`message-${historyId(OLD_STAR)}`)).toHaveCount(0);
    await showStarred(primaryPage);
    await expect(openInFeedButton(primaryPage, historyId(OLD_STAR))).toBeVisible();

    const removedRows = await removeSeededMember(request, {
      conversationId,
      userId: messagingData.primary.userId,
    });
    expect(removedRows).toBe(1);

    await openInFeedButton(primaryPage, historyId(OLD_STAR)).focus();
    await primaryPage.keyboard.press('Enter');
    await expect(notice).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(notice).toContainText(NOTICE_TEXT);
    await expect(notice).toBeFocused();
    await expect(jumpLoading(primaryPage)).toHaveCount(0);
    // The older page was refused (403); one request plus the client's single retry at most.
    expect(olderPageResponses.length).toBeGreaterThanOrEqual(1);
    expect(olderPageResponses.length).toBeLessThanOrEqual(2);
    expect(olderPageResponses.every((entry) => entry.status === 403)).toBe(true);

    // The feed stays as it was: no error screen, the loaded messages remain.
    await expect(feed).toBeVisible();
    await expect(feed.getByTestId(`message-${historyId(HISTORY_COUNT)}`)).toBeAttached();
    await expect(feed.getByText('Failed to load messages. Please try again.')).toHaveCount(0);
    await expect(primaryPage.getByTestId('composer')).toBeVisible();
    const requestsAfterNotice = olderPageResponses.length;
    await primaryPage.waitForTimeout(2_500);
    await expect(jumpLoading(primaryPage)).toHaveCount(0);
    await expect(notice).toBeVisible();
    expect(olderPageResponses.length).toBe(requestsAfterNotice);
  });
});
