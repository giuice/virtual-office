import type { Page } from '@playwright/test';

import { test, expect, markReadAsSeededMember } from './fixtures/messaging';
import {
  openDrawer,
  selectConversation,
  sendMessage,
  waitForRealtimeMessage,
  waitForRealtimeReady,
} from './helpers/drawer-helpers';

const RECV_TIMEOUT_MS = 15_000;

/**
 * 45 history messages page as 20 (026-045) + 20 (006-025) + 5 (001-005), so
 * one "Load more" leaves the button in place. The seeder alternates senders
 * starting with the primary, so the primary owns odd-numbered messages and the
 * secondary has unread messages to mark read (the receipt trigger).
 */
const HISTORY_COUNT = 45;

/** How long the feed must hold still after each change before it counts as stable. */
const STABILITY_WINDOW_MS = 1_200;

/** Sub-pixel layout rounding allowance when comparing positions. */
const OFFSET_TOLERANCE_PX = 2;

interface FirstVisibleMessage {
  id: string;
  /** Distance in px from the feed viewport's top edge to the message's top edge. */
  offset: number;
}

const historyText = (index: number) =>
  `History ${String(index).padStart(3, '0')} of ${HISTORY_COUNT}`;

function feedViewport(page: Page) {
  return page.locator('[data-testid="messages-feed"] [data-radix-scroll-area-viewport]');
}

/**
 * Samples the feed's first fully-top-visible message on every animation frame
 * for `durationMs` and returns each distinct reading. A stable feed yields one
 * reading; a feed that jumps (or animates) towards the bottom yields several.
 */
async function sampleFirstVisibleMessage(page: Page, durationMs: number): Promise<FirstVisibleMessage[]> {
  return feedViewport(page).evaluate(async (viewport, duration) => {
    const messagePattern = /^message-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
    const read = () => {
      const viewTop = viewport.getBoundingClientRect().top;
      const viewBottom = viewTop + viewport.clientHeight;
      for (const node of Array.from(viewport.querySelectorAll<HTMLElement>('[data-testid^="message-"]'))) {
        const match = messagePattern.exec(node.dataset.testid ?? '');
        if (!match) continue;
        const top = node.getBoundingClientRect().top;
        if (top >= viewTop - 0.5 && top < viewBottom) {
          return { id: match[1], offset: Math.round(top - viewTop) };
        }
      }
      return null;
    };
    const readings: Array<{ id: string; offset: number } | null> = [read()];
    const deadline = performance.now() + duration;
    while (performance.now() < deadline) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const next = read();
      const last = readings[readings.length - 1];
      if (next?.id !== last?.id || Math.abs((next?.offset ?? 0) - (last?.offset ?? 0)) > 2) {
        readings.push(next);
      }
    }
    if (readings.some((reading) => reading === null)) {
      throw new Error('No message is visible in the feed viewport');
    }
    return readings as Array<{ id: string; offset: number }>;
  }, durationMs);
}

async function readFirstVisibleMessage(page: Page): Promise<FirstVisibleMessage> {
  const [reading] = await sampleFirstVisibleMessage(page, 0);
  return reading;
}

/** Asserts the first visible message and its position hold for the whole stability window. */
async function expectFeedHeldAt(page: Page, expected: FirstVisibleMessage): Promise<void> {
  const readings = await sampleFirstVisibleMessage(page, STABILITY_WINDOW_MS);
  for (const reading of readings) {
    expect(reading.id, 'first visible message changed').toBe(expected.id);
    expect(Math.abs(reading.offset - expected.offset), 'first visible message moved').toBeLessThanOrEqual(
      OFFSET_TOLERANCE_PX,
    );
  }
}

/**
 * Records whether the feed card ever left the DOM (the skeleton replaces it)
 * from now until `readFeedWasReplaced` is called, and tags the first visible
 * message node so a remount (a new node for the same message) is detectable.
 */
async function watchFeedContinuity(page: Page, messageId: string): Promise<void> {
  await page.evaluate((id) => {
    const state = window as unknown as { __feedReplaced?: boolean; __feedObserver?: MutationObserver };
    state.__feedObserver?.disconnect();
    state.__feedReplaced = false;
    state.__feedObserver = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="messages-feed"]')) {
        state.__feedReplaced = true;
      }
    });
    state.__feedObserver.observe(document.body, { childList: true, subtree: true });
    document.querySelector(`[data-testid="message-${id}"]`)?.setAttribute('data-continuity-marker', 'kept');
  }, messageId);
}

async function expectFeedContinuous(page: Page, messageId: string): Promise<void> {
  const replaced = await page.evaluate(() => {
    const state = window as unknown as { __feedReplaced?: boolean; __feedObserver?: MutationObserver };
    state.__feedObserver?.disconnect();
    return state.__feedReplaced ?? false;
  });
  expect(replaced, 'the feed was swapped for the loading skeleton').toBe(false);
  await expect(
    page.locator(`[data-testid="message-${messageId}"]`),
    'the visible message was remounted',
  ).toHaveAttribute('data-continuity-marker', 'kept');
}

test.describe('Messaging feed stability during refetch and history loading', () => {
  test.use({ messagingSeedOptions: { historyMessageCount: HISTORY_COUNT } });

  test('older pages and receipt refetches keep the reader in place; new messages follow the bottom rules', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    // Two signed-in accounts plus four stability windows: about 22s locally.
    test.setTimeout(60_000);
    const historyConversationId = messagingData.historyConversationId;
    expect(historyConversationId, 'seed did not create the history conversation').toBeTruthy();
    const conversationId = historyConversationId ?? '';

    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: conversationId });
    await waitForRealtimeReady(primaryPage);

    const primaryFeed = primaryPage.locator('[data-testid="messages-feed"]');
    await expect(primaryFeed.locator('[data-testid^="message-"]', { hasText: historyText(HISTORY_COUNT) }))
      .toBeInViewport({ timeout: RECV_TIMEOUT_MS });
    await expect(primaryFeed.locator('[data-testid^="message-"]', { hasText: historyText(26) })).toBeAttached();
    await expect(primaryFeed.locator('[data-testid^="message-"]', { hasText: historyText(25) })).toHaveCount(0);
    await primaryPage.waitForLoadState('networkidle');

    // --- Older page: the reader scrolls to the top and loads more history.
    await feedViewport(primaryPage).evaluate((viewport) => {
      viewport.scrollTop = 0;
    });
    const loadMore = primaryFeed.getByRole('button', { name: 'Load more messages' });
    await expect(loadMore).toBeInViewport();
    const beforeOlderPage = await readFirstVisibleMessage(primaryPage);
    await watchFeedContinuity(primaryPage, beforeOlderPage.id);

    await loadMore.click();
    await expect(primaryFeed.locator('[data-testid^="message-"]', { hasText: historyText(6) })).toBeAttached({
      timeout: RECV_TIMEOUT_MS,
    });
    await expectFeedHeldAt(primaryPage, beforeOlderPage);
    await expectFeedContinuous(primaryPage, beforeOlderPage.id);
    await expect(loadMore, 'Load more stays available while older pages remain').toBeVisible();
    await expect(loadMore).toBeEnabled();

    // --- Receipt-triggered refetch: the secondary opens the conversation and
    // sees messages, which records receipts; the receipt INSERTs invalidate the
    // primary's messages query.
    // The reader scrolls to one of their own messages in the middle of the
    // history (odd-numbered messages are the primary's), so its read indicator
    // is on screen while the feed is far from the bottom.
    const ownStatus = primaryFeed
      .locator('[data-testid^="message-"]', { hasText: historyText(27) })
      .locator('[data-testid^="message-status-"]');
    await ownStatus.scrollIntoViewIfNeeded();
    await expect(ownStatus).toBeInViewport({ ratio: 1 });
    const ownStatusIcon = ownStatus.locator('svg');
    await expect(ownStatusIcon).not.toHaveClass(/text-green-500/);
    const beforeReceipt = await readFirstVisibleMessage(primaryPage);
    await watchFeedContinuity(primaryPage, beforeReceipt.id);

    const receiptRefetch = primaryPage.waitForResponse(
      (response) =>
        response.url().includes('/api/messages/get') &&
        response.url().includes(conversationId) &&
        response.ok(),
      { timeout: RECV_TIMEOUT_MS * 2 },
    );
    await secondaryPage.goto('/floor-plan');
    await secondaryPage.waitForLoadState('networkidle');
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: conversationId });
    await waitForRealtimeReady(secondaryPage);
    // Phase 4: only messages the secondary actually sees are read, so it
    // scrolls the primary's History 27 into view.
    const secondaryTarget = secondaryPage
      .locator('[data-testid="messages-feed"] [data-testid^="message-"]', { hasText: historyText(27) });
    await secondaryTarget.scrollIntoViewIfNeeded();
    await expect(secondaryTarget).toBeInViewport({ ratio: 0.5 });
    await receiptRefetch;
    await expect(ownStatusIcon, 'the receipt refetch reached the primary feed').toHaveClass(/text-green-500/, {
      timeout: RECV_TIMEOUT_MS,
    });
    await expectFeedHeldAt(primaryPage, beforeReceipt);
    await expectFeedContinuous(primaryPage, beforeReceipt.id);

    // --- A new message from someone else while the reader is scrolled up does
    // not move the reader.
    const incomingWhileReading = `t3-incoming-scrolled-${Date.now()}`;
    await sendMessage(secondaryPage, incomingWhileReading);
    await waitForRealtimeMessage(primaryPage, incomingWhileReading, { timeout: RECV_TIMEOUT_MS });
    await expectFeedHeldAt(primaryPage, beforeReceipt);
    await expect(primaryFeed.locator('[data-testid^="message-"]', { hasText: incomingWhileReading }))
      .not.toBeInViewport();

    // --- The reader's own send scrolls to the bottom.
    const ownMessage = `t3-own-send-${Date.now()}`;
    await sendMessage(primaryPage, ownMessage);
    await expect(primaryFeed.locator('[data-testid^="message-"]', { hasText: ownMessage })).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });

    // --- At the bottom, a new message from someone else is followed.
    const incomingAtBottom = `t3-incoming-bottom-${Date.now()}`;
    await sendMessage(secondaryPage, incomingAtBottom);
    await expect(primaryFeed.locator('[data-testid^="message-"]', { hasText: incomingAtBottom })).toBeInViewport({
      timeout: RECV_TIMEOUT_MS,
    });
  });

  test('a scroll made just before a refetch is applied is kept; the feed does not jump back', async ({
    primaryPage,
    messagingData,
  }) => {
    test.setTimeout(60_000);
    const conversationId = messagingData.historyConversationId ?? '';
    expect(conversationId, 'seed did not create the history conversation').toBeTruthy();

    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: conversationId });
    await waitForRealtimeReady(primaryPage);

    const feed = primaryPage.locator('[data-testid="messages-feed"]');
    await expect(feed.locator('[data-testid^="message-"]', { hasText: historyText(HISTORY_COUNT) }))
      .toBeInViewport({ timeout: RECV_TIMEOUT_MS });

    // The reader is mid-history (far from the bottom) with one of their own
    // messages, still unread by the secondary, on screen.
    const ownStatus = feed
      .locator('[data-testid^="message-"]', { hasText: historyText(35) })
      .locator('[data-testid^="message-status-"]');
    await ownStatus.scrollIntoViewIfNeeded();
    await expect(ownStatus).toBeInViewport({ ratio: 1 });
    const ownStatusIcon = ownStatus.locator('svg');
    await expect(ownStatusIcon).not.toHaveClass(/text-green-500/);
    const ownMessageId = ((await ownStatus.getAttribute('data-testid')) ?? '').replace('message-status-', '');
    // Reads the reader reported for what they see, and the refetches those
    // receipts cause, settle first, so the next feed refetch is the one below.
    await primaryPage.waitForLoadState('networkidle');
    await primaryPage.waitForTimeout(STABILITY_WINDOW_MS * 2);

    // A scroll's `scroll` event is only dispatched at the next rendering step.
    // When the next feed refetch has been received, the reader scrolls up in an
    // animation frame — after that frame's scroll events — and the refetched
    // rows are handed to the app right away, so the feed applies them before
    // the scroll event for the reader's scroll has fired.
    const READER_SCROLL_PX = 120;
    await feedViewport(primaryPage).evaluate(
      (viewport, { conversation, scrollBy }) => {
        const state = window as unknown as {
          __feedRace?: { done: boolean; scrollTopBefore?: number; scrollTopAfter?: number };
        };
        state.__feedRace = { done: false };
        const originalFetch = window.fetch;
        window.fetch = async (input, init) => {
          const response = await originalFetch(input, init);
          const url = new URL(
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
            window.location.href,
          );
          const isFeedRefetch =
            url.pathname === '/api/messages/get' &&
            url.searchParams.get('conversationId') === conversation &&
            !url.searchParams.has('cursorBefore');
          if (!isFeedRefetch || state.__feedRace?.done !== false) return response;
          window.fetch = originalFetch;
          const body = await response.text();
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              const race = { done: true, scrollTopBefore: viewport.scrollTop, scrollTopAfter: 0 };
              viewport.scrollTop -= scrollBy;
              race.scrollTopAfter = viewport.scrollTop;
              state.__feedRace = race;
              resolve();
            });
          });
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        };
      },
      { conversation: conversationId, scrollBy: READER_SCROLL_PX },
    );

    // The secondary reads the reader's message: the receipt refetches the feed.
    const recorded = await markReadAsSeededMember(primaryPage.request, {
      conversationId,
      userId: messagingData.secondary.userId,
      messageIds: [ownMessageId],
    });
    expect(recorded).toBe(1);

    const readRace = () =>
      primaryPage.evaluate(() => {
        const state = window as unknown as {
          __feedRace?: { done: boolean; scrollTopBefore?: number; scrollTopAfter?: number };
        };
        return state.__feedRace ?? { done: false };
      });
    await expect.poll(async () => (await readRace()).done, { timeout: RECV_TIMEOUT_MS * 2 }).toBe(true);
    const race = await readRace();
    expect(
      Math.abs((race.scrollTopBefore ?? 0) - (race.scrollTopAfter ?? 0) - READER_SCROLL_PX),
      'the reader scroll moved the feed',
    ).toBeLessThanOrEqual(OFFSET_TOLERANCE_PX);
    await expect(ownStatusIcon, 'the refetch reached the feed').toHaveClass(/text-green-500/, {
      timeout: RECV_TIMEOUT_MS,
    });

    // The reader stays where they scrolled to for a whole stability window.
    const scrollTops = await feedViewport(primaryPage).evaluate(async (viewport, duration) => {
      const readings = [viewport.scrollTop];
      const deadline = performance.now() + duration;
      while (performance.now() < deadline) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        readings.push(viewport.scrollTop);
      }
      return readings;
    }, STABILITY_WINDOW_MS);
    for (const scrollTop of scrollTops) {
      expect(
        Math.abs(scrollTop - (race.scrollTopAfter ?? 0)),
        'the feed jumped back to where it was before the reader scrolled',
      ).toBeLessThanOrEqual(OFFSET_TOLERANCE_PX);
    }
  });
});

test.describe('Messaging feed consistency while a refetch is in flight', () => {
  test('a reply saved while an older feed refetch is in flight stays in the sender feed', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    // Two signed-in accounts and one stability window: about 25s locally.
    test.setTimeout(60_000);
    const conversationId = messagingData.directConversationId;

    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: conversationId });
    await secondaryPage.goto('/floor-plan');
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: conversationId });
    await waitForRealtimeReady(primaryPage);
    await waitForRealtimeReady(secondaryPage);

    const parentText = `t26-parent-${Date.now()}`;
    const parentId = await sendMessage(primaryPage, parentText);
    await waitForRealtimeMessage(secondaryPage, parentText, { timeout: RECV_TIMEOUT_MS });
    // The secondary has seen the parent and the receipt refetch has landed.
    await expect(primaryPage.locator(`[data-testid="message-status-${parentId}"] svg`)).toHaveClass(
      /text-green-500/,
      { timeout: RECV_TIMEOUT_MS },
    );

    // The next feed fetch reads the server's rows when it is intercepted and
    // delivers them only when released: a refetch that is still in flight.
    const isFeedFetch = (url: URL) =>
      url.pathname === '/api/messages/get' && url.searchParams.get('conversationId') === conversationId;
    let releaseHeldFetch: () => void = () => {};
    const heldFetchReleased = new Promise<void>((resolve) => {
      releaseHeldFetch = resolve;
    });
    let markFetchHeld: () => void = () => {};
    const fetchHeld = new Promise<void>((resolve) => {
      markFetchHeld = resolve;
    });
    let holdNextFetch = true;
    await primaryPage.route(isFeedFetch, async (route) => {
      if (!holdNextFetch) {
        await route.continue();
        return;
      }
      holdNextFetch = false;
      const response = await route.fetch();
      markFetchHeld();
      await heldFetchReleased;
      await route.fulfill({ response });
    });

    // The secondary sees a new message; its receipt makes the primary refetch.
    await sendMessage(primaryPage, `t26-trigger-${Date.now()}`);
    await fetchHeld;

    // Reply while that refetch, read before the reply existed, is in flight.
    const composer = primaryPage.locator('[data-testid="composer"]');
    await primaryPage.locator(`[data-testid="reply-button-${parentId}"]`).click();
    await composer.locator('textarea').first().fill(`t26-reply-${Date.now()}`);
    const created = primaryPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/messages/create' && response.request().method() === 'POST',
    );
    await composer.locator('[data-testid="message-send-button"]').click();
    expect((await created).status()).toBe(201);
    const replyCount = primaryPage.locator(`[data-testid="reply-count-${parentId}"]`);
    await expect(replyCount).toHaveText(/1 reply/, { timeout: RECV_TIMEOUT_MS });

    // Record whether the reply indicator ever leaves the DOM from now on.
    await primaryPage.evaluate((id) => {
      const state = window as unknown as { __replyLost?: boolean; __replyObserver?: MutationObserver };
      state.__replyLost = false;
      state.__replyObserver = new MutationObserver(() => {
        if (!document.querySelector(`[data-testid="reply-count-${id}"]`)) {
          state.__replyLost = true;
        }
      });
      state.__replyObserver.observe(document.body, { childList: true, subtree: true });
    }, parentId);

    const staleFetchDelivered = primaryPage.waitForResponse((response) => isFeedFetch(new URL(response.url())));
    releaseHeldFetch();
    await staleFetchDelivered;
    // The stale rows are applied right after delivery; watch a full window.
    await primaryPage.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), STABILITY_WINDOW_MS);

    const replyLost = await primaryPage.evaluate(() => {
      const state = window as unknown as { __replyLost?: boolean; __replyObserver?: MutationObserver };
      state.__replyObserver?.disconnect();
      return state.__replyLost ?? false;
    });
    expect(replyLost, 'the stale refetch dropped the saved reply from the feed').toBe(false);
    await expect(replyCount).toHaveText(/1 reply/);
  });
});

test.describe('Loading older history when a page fails', () => {
  test.use({ messagingSeedOptions: { historyMessageCount: HISTORY_COUNT } });

  test('a failed "Load more" says so, keeps the loaded feed, and a keyboard retry loads the page (BR-017, AC-037)', async ({
    primaryPage,
    messagingData,
  }) => {
    test.setTimeout(60_000);
    const conversationId = messagingData.historyConversationId ?? '';
    expect(conversationId, 'seed did not create the history conversation').toBeTruthy();

    await primaryPage.goto('/floor-plan');
    await primaryPage.waitForLoadState('networkidle');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: conversationId });

    const feed = primaryPage.locator('[data-testid="messages-feed"]');
    const message = (index: number) => feed.locator('[data-testid^="message-"]', { hasText: historyText(index) });
    await expect(message(HISTORY_COUNT)).toBeAttached({ timeout: RECV_TIMEOUT_MS });
    await expect(message(25)).toHaveCount(0);

    // Every older-page request fails (the query retries once) until unrouted.
    const isOlderPage = (url: URL) => url.pathname === '/api/messages/get' && url.searchParams.has('cursorBefore');
    let failedRequests = 0;
    await primaryPage.route(isOlderPage, async (route) => {
      failedRequests += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
    });

    const loadMore = feed.getByRole('button', { name: 'Load more messages' });
    const loadMoreError = feed.getByTestId('load-more-error');
    await expect(loadMoreError).toHaveCount(0);
    await loadMore.click();

    await expect(loadMoreError).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(loadMoreError).toHaveAttribute('role', 'alert');
    await expect(loadMoreError).toHaveText('Não foi possível carregar mensagens anteriores. Tente de novo.');
    expect(failedRequests).toBeGreaterThanOrEqual(1);
    // The loaded page stays; no error screen replaces the feed.
    await expect(message(HISTORY_COUNT)).toBeAttached();
    await expect(message(26)).toBeAttached();
    await expect(message(25)).toHaveCount(0);
    await expect(loadMore).toBeEnabled();

    // Retry from the keyboard once the server recovers.
    await primaryPage.unroute(isOlderPage);
    await loadMore.focus();
    await primaryPage.keyboard.press('Enter');
    await expect(message(6)).toBeAttached({ timeout: RECV_TIMEOUT_MS });
    await expect(loadMoreError).toHaveCount(0);
  });
});
