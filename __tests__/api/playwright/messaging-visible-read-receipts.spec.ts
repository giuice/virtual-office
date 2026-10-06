import type { Page, Request } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import {
  backToConversationList,
  feedViewport,
  openDrawer,
  readListUnreadCount,
  scrollFeedToTopStepwise,
  selectConversation,
  setTabHidden,
  waitForRealtimeReady,
} from './helpers/drawer-helpers';

const RECV_TIMEOUT_MS = 15_000;

/**
 * Long enough for the drawer to have reported anything it was going to report
 * (batch delay 300 ms, request spacing 1 s) plus the round trip.
 */
const QUIET_WINDOW_MS = 2_500;

/** How many of the newest messages the reader sees in the visible-subset scenario. */
const VISIBLE_COUNT = 5;
const UNREAD_COUNT = 20;

interface ReceiptRequest {
  conversationId: string;
  messageIds: string[] | null;
}

/** Records every PATCH /api/conversations/read the page sends from now on. */
function recordReceiptRequests(page: Page): ReceiptRequest[] {
  const requests: ReceiptRequest[] = [];
  page.on('request', (request: Request) => {
    if (request.method() !== 'PATCH' || !request.url().includes('/api/conversations/read')) return;
    const body = request.postDataJSON() as { conversationId?: string; messageIds?: string[] } | null;
    requests.push({
      conversationId: body?.conversationId ?? '',
      messageIds: Array.isArray(body?.messageIds) ? body.messageIds : null,
    });
  });
  return requests;
}

function submittedIds(requests: ReceiptRequest[], from = 0): string[] {
  return requests.slice(from).flatMap((request) => request.messageIds ?? []);
}

/** Server-side unread count of the conversation for the page's user. */
async function apiUnreadCount(page: Page, conversationId: string): Promise<number> {
  const response = await page.request.get('/api/conversations/get?includeArchived=true&limit=100');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { conversations: Array<{ id: string; unreadCount: number }> };
  const conversation = body.conversations.find((candidate) => candidate.id === conversationId);
  expect(conversation, `conversation ${conversationId} missing for this user`).toBeTruthy();
  return conversation?.unreadCount ?? -1;
}

/**
 * Ids (of `candidates`) the server reports as read. In a direct conversation a
 * message's read status comes only from the other participant's receipt, so
 * for the primary's messages this is exactly the secondary's receipts.
 */
async function apiReadIds(page: Page, conversationId: string, candidates: string[]): Promise<string[]> {
  const response = await page.request.get(
    `/api/messages/get?conversationId=${conversationId}&limit=50`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { messages: Array<{ id: string; status: string }> };
  const read = new Set(body.messages.filter((message) => message.status === 'read').map((message) => message.id));
  return candidates.filter((id) => read.has(id));
}

/** Sends messages as the page's user through the same API the composer uses, in order. */
async function sendViaApi(page: Page, conversationId: string, contents: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const content of contents) {
    const response = await page.request.post('/api/messages/create', { data: { conversationId, content } });
    expect(response.status(), `send "${content}"`).toBe(201);
    const body = (await response.json()) as { message: { id: string } };
    ids.push(body.message.id);
  }
  return ids;
}

/** Ids of the primary's messages shown with the read indicator in the primary's feed. */
async function primaryReadIndicatorIds(page: Page, candidates: string[]): Promise<string[]> {
  return page.evaluate((ids) =>
    ids.filter((id) =>
      document
        .querySelector(`[data-testid="message-status-${id}"] svg`)
        ?.classList.contains('text-green-500')
    ),
  candidates);
}

/**
 * Resizes the drawer so its feed shows exactly the newest `count` messages in
 * full while the one above them is at most 20% on screen, and pins the feed to
 * the bottom. Message heights come from the rendered feed, so the layout holds
 * whatever the message styling is.
 */
async function showExactlyNewest(page: Page, newestIds: string[], previousId: string): Promise<void> {
  const viewport = feedViewport(page);
  const plan = await viewport.evaluate((element, { firstShownId, hiddenId }) => {
    const item = (id: string) => {
      const node = element.querySelector<HTMLElement>(`[data-testid="message-${id}"]`);
      if (!node) throw new Error(`message ${id} is not rendered`);
      return node;
    };
    const viewTop = element.getBoundingClientRect().top;
    const contentTop = (node: HTMLElement) => node.getBoundingClientRect().top - viewTop + element.scrollTop;
    const targetHeight =
      element.scrollHeight - contentTop(item(firstShownId)) + 0.2 * item(hiddenId).getBoundingClientRect().height;
    return { delta: targetHeight - element.clientHeight };
  }, { firstShownId: newestIds[0], hiddenId: previousId });

  const drawer = page.locator('[data-testid="messaging-drawer"]');
  const drawerHeight = (await drawer.boundingBox())?.height ?? 0;
  const newDrawerHeight = Math.ceil(drawerHeight + plan.delta);
  await page.setViewportSize({ width: 1280, height: newDrawerHeight + 120 });
  await page.addStyleTag({
    content: `[data-testid="messaging-drawer"] { height: ${newDrawerHeight}px !important; }`,
  });
  await viewport.evaluate(async (element) => {
    element.scrollTop = element.scrollHeight;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

  // Guard the scenario itself: the newest messages are fully on screen and the
  // one above them is below the half-visible threshold.
  const ratios = await viewport.evaluate((element, ids) => {
    const view = element.getBoundingClientRect();
    return ids.map((id) => {
      const node = element.querySelector<HTMLElement>(`[data-testid="message-${id}"]`);
      if (!node) throw new Error(`message ${id} is not rendered`);
      const rect = node.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top));
      return visible / rect.height;
    });
  }, [previousId, ...newestIds]);
  expect(ratios[0], 'the message above the newest ones must be mostly off screen').toBeLessThan(0.5);
  for (const ratio of ratios.slice(1)) {
    expect(ratio, 'each of the newest messages must be fully on screen').toBeGreaterThan(0.99);
  }
}

test.describe('Read receipts follow what the recipient actually sees', () => {
  test.describe.configure({ mode: 'serial' });

  test('20 unread with only the newest 5 visible records exactly 5 receipts; scrolling through records the rest', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const conversationId = messagingData.directConversationId;
    const receiptRequests = recordReceiptRequests(secondaryPage);

    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');

    // Baseline: the seed leaves the secondary 1 unread message in the DM.
    // Seeing it (it is the only message, so it is on screen) clears it.
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(1);
    await openDrawer(secondaryPage);
    await waitForRealtimeReady(secondaryPage);
    await selectConversation(secondaryPage, { id: conversationId });
    await expect.poll(() => apiUnreadCount(secondaryPage, conversationId), { timeout: RECV_TIMEOUT_MS }).toBe(0);
    await backToConversationList(secondaryPage, conversationId);
    await expect.poll(() => readListUnreadCount(secondaryPage, conversationId), { timeout: RECV_TIMEOUT_MS }).toBe(0);

    // 20 messages arrive while the secondary's drawer shows the list: the list
    // counts them and nothing is marked read.
    const requestsBeforeArrival = receiptRequests.length;
    const runTag = `${Date.now()}`;
    const sentIds = await sendViaApi(
      primaryPage,
      conversationId,
      Array.from({ length: UNREAD_COUNT }, (_, index) => `t6-unread-${runTag}-${String(index + 1).padStart(2, '0')}`),
    );
    await expect
      .poll(() => readListUnreadCount(secondaryPage, conversationId), { timeout: RECV_TIMEOUT_MS })
      .toBe(UNREAD_COUNT);
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);
    expect(submittedIds(receiptRequests, requestsBeforeArrival), 'list view must not mark messages read').toEqual([]);
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(UNREAD_COUNT);

    // The primary watches its own feed for the read indicators.
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: conversationId });
    await waitForRealtimeReady(primaryPage);
    await expect(primaryPage.locator(`[data-testid="message-${sentIds[UNREAD_COUNT - 1]}"]`)).toBeVisible({
      timeout: RECV_TIMEOUT_MS,
    });
    expect(await primaryReadIndicatorIds(primaryPage, sentIds)).toEqual([]);

    // Open the conversation while the tab is hidden: the newest messages are
    // on screen but nothing is reported.
    await setTabHidden(secondaryPage, true);
    await selectConversation(secondaryPage, { id: conversationId });
    await expect(secondaryPage.locator(`[data-testid="message-${sentIds[UNREAD_COUNT - 1]}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
    const newestIds = sentIds.slice(-VISIBLE_COUNT);
    await showExactlyNewest(secondaryPage, newestIds, sentIds[UNREAD_COUNT - VISIBLE_COUNT - 1]);
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);
    expect(submittedIds(receiptRequests, requestsBeforeArrival), 'a hidden tab must not mark messages read').toEqual([]);
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(UNREAD_COUNT);

    // The tab becomes visible: exactly the 5 messages on screen are reported.
    await setTabHidden(secondaryPage, false);
    await expect
      .poll(() => submittedIds(receiptRequests, requestsBeforeArrival).length, { timeout: RECV_TIMEOUT_MS })
      .toBeGreaterThanOrEqual(VISIBLE_COUNT);
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);
    expect(submittedIds(receiptRequests, requestsBeforeArrival).sort()).toEqual([...newestIds].sort());
    await expect
      .poll(() => apiReadIds(secondaryPage, conversationId, sentIds), { timeout: RECV_TIMEOUT_MS })
      .toEqual(newestIds);
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(UNREAD_COUNT - VISIBLE_COUNT);
    await expect
      .poll(() => primaryReadIndicatorIds(primaryPage, sentIds), { timeout: RECV_TIMEOUT_MS })
      .toEqual(newestIds);

    await backToConversationList(secondaryPage, conversationId);
    await expect
      .poll(() => readListUnreadCount(secondaryPage, conversationId), { timeout: RECV_TIMEOUT_MS })
      .toBe(UNREAD_COUNT - VISIBLE_COUNT);

    // Scrolling every message into view reports the rest, each id once.
    const requestsBeforeScroll = receiptRequests.length;
    await selectConversation(secondaryPage, { id: conversationId });
    await expect(secondaryPage.locator(`[data-testid="message-${sentIds[UNREAD_COUNT - 1]}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
    await scrollFeedToTopStepwise(secondaryPage);
    await expect
      .poll(() => apiReadIds(secondaryPage, conversationId, sentIds), { timeout: RECV_TIMEOUT_MS })
      .toEqual(sentIds);
    await backToConversationList(secondaryPage, conversationId);
    await expect.poll(() => readListUnreadCount(secondaryPage, conversationId), { timeout: RECV_TIMEOUT_MS }).toBe(0);
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(0);
    await expect
      .poll(() => primaryReadIndicatorIds(primaryPage, sentIds), { timeout: RECV_TIMEOUT_MS })
      .toEqual(sentIds);

    const scrollIds = submittedIds(receiptRequests, requestsBeforeScroll);
    expect(new Set(scrollIds).size, 'no id is reported twice').toBe(scrollIds.length);
    expect(scrollIds.filter((id) => newestIds.includes(id)), 'already reported ids are not re-sent').toEqual([]);
    expect(scrollIds.sort()).toEqual(sentIds.slice(0, UNREAD_COUNT - VISIBLE_COUNT).sort());

    // Every request used the per-message contract; the legacy mark-all is gone.
    for (const request of receiptRequests) {
      expect(request.conversationId).toBe(conversationId);
      expect(request.messageIds, 'the drawer must not call the legacy mark-all').not.toBeNull();
      expect(request.messageIds?.length ?? 0).toBeGreaterThan(0);
      expect(request.messageIds?.length ?? 0).toBeLessThanOrEqual(100);
    }
  });

  test('nothing is marked while the drawer is minimized or the tab is hidden', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(90_000);
    const conversationId = messagingData.directConversationId;
    const receiptRequests = recordReceiptRequests(secondaryPage);

    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(1);
    await openDrawer(secondaryPage);
    await waitForRealtimeReady(secondaryPage);
    await selectConversation(secondaryPage, { id: conversationId });
    await expect.poll(() => apiUnreadCount(secondaryPage, conversationId), { timeout: RECV_TIMEOUT_MS }).toBe(0);
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);
    const runTag = `${Date.now()}`;

    // Minimized: a new message is not marked read.
    let requestsBefore = receiptRequests.length;
    await secondaryPage.getByTitle('Minimize').click();
    await expect(secondaryPage.locator('[data-testid="messages-feed"]')).toHaveCount(0);
    const [minimizedId] = await sendViaApi(primaryPage, conversationId, [`t6-minimized-${runTag}`]);
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);
    expect(submittedIds(receiptRequests, requestsBefore), 'a minimized drawer must not mark messages read').toEqual([]);
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(1);

    // Restored: the feed opens at the bottom, so the new message is seen.
    await secondaryPage.locator('[data-testid="messaging-drawer-minimized"]').click();
    await expect(secondaryPage.locator(`[data-testid="message-${minimizedId}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
    await expect
      .poll(() => apiReadIds(secondaryPage, conversationId, [minimizedId]), { timeout: RECV_TIMEOUT_MS })
      .toEqual([minimizedId]);
    await expect.poll(() => apiUnreadCount(secondaryPage, conversationId), { timeout: RECV_TIMEOUT_MS }).toBe(0);
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);

    // Hidden tab: new messages scroll into view at the bottom, unreported.
    requestsBefore = receiptRequests.length;
    await setTabHidden(secondaryPage, true);
    const hiddenIds = await sendViaApi(primaryPage, conversationId, [
      `t6-hidden-${runTag}-1`,
      `t6-hidden-${runTag}-2`,
    ]);
    await expect(secondaryPage.locator(`[data-testid="message-${hiddenIds[1]}"]`)).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);
    expect(submittedIds(receiptRequests, requestsBefore), 'a hidden tab must not mark messages read').toEqual([]);
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(2);
    expect(await apiReadIds(secondaryPage, conversationId, hiddenIds)).toEqual([]);

    // Visible again: what is on screen now is reported, and only that.
    await setTabHidden(secondaryPage, false);
    await expect
      .poll(() => submittedIds(receiptRequests, requestsBefore), { timeout: RECV_TIMEOUT_MS })
      .toContain(hiddenIds[1]);
    await secondaryPage.waitForTimeout(QUIET_WINDOW_MS);
    const reported = submittedIds(receiptRequests, requestsBefore);
    expect(reported.every((id) => hiddenIds.includes(id))).toBe(true);
    await expect
      .poll(() => apiReadIds(secondaryPage, conversationId, hiddenIds), { timeout: RECV_TIMEOUT_MS })
      .toEqual(hiddenIds.filter((id) => reported.includes(id)));
    expect(await apiUnreadCount(secondaryPage, conversationId)).toBe(hiddenIds.length - reported.length);
  });
});
