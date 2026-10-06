import { type Page, type Locator, type WebSocketRoute, expect } from '@playwright/test';

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
async function closeDrawer(page: Page): Promise<void> {
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

  // Wait for the server-confirmed message: the optimistic copy carries a
  // temporary id (message-temp-*) that is replaced once the send resolves.
  const messageInFeed = page.locator(
    '[data-testid^="message-"]:not([data-testid^="message-temp-"])',
    { hasText: messageText }
  );
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
  const tabButton = page.locator(`[data-testid="conversation-tab-${tab}"]`).or(
    page.getByRole('tab', { name: new RegExp(tab, 'i') })
  );

  await tabButton.click();
  await expect(tabButton).toHaveAttribute('data-state', 'active');
}

/**
 * Toggles the "Pinned Only" filter in the conversation list.
 */
export async function togglePinnedFilter(page: Page): Promise<void> {
  const filterButton = page.getByRole('button', { name: /pinned/i }).or(
    page.locator('[data-testid="filter-pinned-toggle"]')
  );

  const previousState = await filterButton.getAttribute('aria-pressed');

  await filterButton.click();

  if (previousState) {
    const expectedState = previousState === 'true' ? 'false' : 'true';
    await expect(filterButton).toHaveAttribute('aria-pressed', expectedState);
  } else {
    await expect(filterButton).toHaveAttribute('aria-pressed', /true|false/);
  }
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

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/conversations/archive') &&
        response.request().method() === 'PATCH' &&
        response.ok()
    ),
    archiveOption.click(),
  ]);

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

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/conversations/archive') &&
        response.request().method() === 'PATCH' &&
        response.ok()
    ),
    unarchiveOption.click(),
  ]);

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

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/conversations/preferences') &&
        response.request().method() === 'PATCH' &&
        response.ok()
    ),
    pinOption.click(),
  ]);

  // Wait for pin state to update
  await expect(conversationItem.locator('[data-testid="pin-indicator"]')).toBeVisible({ timeout: 5_000 });
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

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/conversations/preferences') &&
        response.request().method() === 'PATCH' &&
        response.ok()
    ),
    unpinOption.click(),
  ]);

  // Wait for pin state to update
  await expect(conversationItem.locator('[data-testid="pin-indicator"]')).toBeHidden({ timeout: 5_000 });
}

/**
 * Moves the current user into a space from the floor plan.
 *
 * Since the floor-plan redesign a card click only opens the space detail
 * panel; moving goes through the card's "Enter" action, and the card's
 * `data-selected` follows the user's actual current space. The floor-plan
 * search narrows the grid to the target card first because the fixed drawer
 * can cover cards on the right of the grid. Resolves once the server accepted
 * the move and the card shows the user inside it, selected.
 */
export async function navigateToSpace(page: Page, spaceId: string): Promise<void> {
  const card = page.locator(`[data-testid="space-${spaceId}"]`);
  await expect(card).toBeVisible({ timeout: 10_000 });

  if ((await card.getAttribute('data-user-in-space')) !== 'true') {
    const spaceName = (await card.locator('h3').textContent())?.trim();
    expect(spaceName, `space ${spaceId} has no visible name`).toBeTruthy();

    const search = page.getByRole('textbox', { name: 'Search spaces or people' });
    await search.fill(spaceName ?? '');
    await expect(page.locator('[data-testid^="space-"][data-space-id]')).toHaveCount(1);

    const locationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/presence/location',
      { timeout: 15_000 }
    );
    await card.getByRole('button', { name: 'Enter', exact: true }).click();
    const response = await locationResponse;
    expect(response.ok(), `move to space ${spaceId} failed (${response.status()})`).toBe(true);

    await search.fill('');
  }

  await expect(card).toHaveAttribute('data-user-in-space', 'true', { timeout: 15_000 });
  await expect(card).toHaveAttribute('data-selected', 'true');
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
  await page.waitForFunction(() => {
    const root = document.documentElement;
    return root?.getAttribute('data-messaging-realtime-ready') === 'true';
  }, undefined, { timeout: 15_000 });
}

/** Topic prefix of the drawer's message channel (useMessageSubscription). */
const MESSAGING_CHANNEL_TOPIC_PREFIX = 'realtime:messaging-db-changes:';

/** Reads a Realtime text frame (protocol 2.0.0 array or 1.0.0 object). */
function readRealtimeFrame(raw: string): { topic: unknown; event: unknown; payload: unknown } | null {
  try {
    const frame: unknown = JSON.parse(raw);
    if (Array.isArray(frame)) {
      return { topic: frame[2], event: frame[3], payload: frame[4] };
    }
    if (frame && typeof frame === 'object') {
      const { topic, event, payload } = frame as Record<string, unknown>;
      return { topic, event, payload };
    }
  } catch {
    // Not JSON: not a frame this watcher reads.
  }
  return null;
}

/**
 * Watches the page's messaging channel for the server's confirmation that its
 * postgres_changes stream is live. `data-messaging-realtime-ready` is set at
 * SUBSCRIBED, which comes before that confirmation (TRACK T26); a change
 * committed in between reaches the page only through the catch-up refetch,
 * not as a Realtime event. Start watching before the page navigates; each new
 * Realtime connection (e.g. after a reload) starts unconfirmed again.
 * Returns a function that waits for the confirmation.
 */
export function watchMessagingChangesStream(page: Page): (options?: { timeout?: number }) => Promise<void> {
  let streaming = false;
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    streaming = false;
    socket.on('framereceived', ({ payload }) => {
      if (isMessagingStreamReadyFrame(payload)) {
        streaming = true;
      }
    });
  });
  return async ({ timeout = 15_000 } = {}) => {
    await expect
      .poll(() => streaming, { timeout, message: 'messaging postgres_changes stream confirmed by the server' })
      .toBe(true);
  };
}

/** The server's `system` frame confirming the messaging channel's postgres_changes stream. */
function isMessagingStreamReadyFrame(payload: string | Buffer): boolean {
  if (typeof payload !== 'string' || !payload.includes('postgres_changes')) return false;
  const frame = readRealtimeFrame(payload);
  const body = frame?.payload as { extension?: unknown; status?: unknown } | undefined;
  return (
    frame?.event === 'system'
    && typeof frame.topic === 'string'
    && frame.topic.startsWith(MESSAGING_CHANNEL_TOPIC_PREFIX)
    && body?.extension === 'postgres_changes'
    && body.status === 'ok'
  );
}

export interface RealtimeConnectionControl {
  /**
   * Drops the page's Realtime connection: closes every open socket (the
   * server side too) and closes each reconnect attempt as soon as it is made,
   * until `restore()`. Resolves once the page has noticed (messaging channel
   * no longer SUBSCRIBED).
   */
  drop(): Promise<void>;
  /** Lets the next reconnect attempt through to the server. */
  restore(): void;
  /** Server confirmations of the messaging postgres_changes stream received so far. */
  streamConfirmations(): number;
  /** Waits for a confirmation after the first `after` ones (i.e. the next (re)join). */
  waitForStreamConfirmation(after: number, options?: { timeout?: number }): Promise<void>;
  /** Reconnect attempts closed while dropped. */
  refusedAttempts(): number;
}

/**
 * Puts the page's Realtime WebSocket under the test's control (install before
 * the page navigates). Chromium offline emulation (`context.setOffline`) does
 * not close an open WebSocket — the connection keeps streaming — so a real
 * Realtime drop is produced here instead. The app's own reconnect (supabase
 * socket backoff and the messaging channel retry) is untouched: it only sees
 * its socket close and its reconnect attempts fail until `restore()`.
 * Routed sockets do not emit page `websocket` events, so stream
 * confirmations are counted here rather than by watchMessagingChangesStream.
 */
export async function controlRealtimeConnection(page: Page): Promise<RealtimeConnectionControl> {
  let connected = true;
  let confirmations = 0;
  let refused = 0;
  const openRoutes = new Set<WebSocketRoute>();

  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (route) => {
    if (!connected) {
      refused += 1;
      void route.close({ code: 4000, reason: 'test: Realtime connection dropped' });
      return;
    }
    const server = route.connectToServer();
    openRoutes.add(route);
    server.onMessage((message) => {
      if (isMessagingStreamReadyFrame(message)) confirmations += 1;
      route.send(message);
    });
  });

  return {
    async drop() {
      connected = false;
      const routes = [...openRoutes];
      openRoutes.clear();
      await Promise.all(
        routes.map((route) => route.close({ code: 4000, reason: 'test: Realtime connection dropped' })),
      );
      await page.waitForFunction(
        () => document.documentElement.getAttribute('data-messaging-realtime-ready') !== 'true',
        undefined,
        { timeout: 15_000 },
      );
    },
    restore() {
      connected = true;
    },
    streamConfirmations: () => confirmations,
    async waitForStreamConfirmation(after, { timeout = 30_000 } = {}) {
      await expect
        .poll(() => confirmations, {
          timeout,
          message: 'messaging postgres_changes stream confirmed again by the server',
        })
        .toBeGreaterThan(after);
    },
    refusedAttempts: () => refused,
  };
}

/** The drawer feed's scrolling element (Radix ScrollArea viewport). */
export function feedViewport(page: Page): Locator {
  return page.locator('[data-testid="messages-feed"] [data-radix-scroll-area-viewport]');
}

/**
 * Leaves the conversation view for the conversation list (drawer stays open)
 * and waits until the given conversation's row is rendered, so a missing
 * unread badge really means zero.
 */
export async function backToConversationList(page: Page, conversationId: string): Promise<void> {
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(page.locator(`[data-testid="conversation-item-${conversationId}"]`)).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Unread count shown on a conversation's row in the drawer list. The row must
 * be visible; no badge on a visible row means zero unread.
 *
 * The badge is read in a single call that never waits: the list can re-render
 * between two separate reads (a refetch clearing the count unmounts the
 * badge), and a waiting read such as `textContent()` after `count()` would
 * then wait for an element that never comes back (TRACK T31).
 */
export async function readListUnreadCount(page: Page, conversationId: string): Promise<number> {
  const row = page.locator(`[data-testid="conversation-item-${conversationId}"]`);
  if (!(await row.isVisible())) {
    throw new Error(`conversation row ${conversationId} is not visible`);
  }
  const [value] = await row
    .locator(`[data-testid="conversation-unread-badge-${conversationId}"]`)
    .allTextContents();
  return parseBadgeCount(value);
}

/**
 * Reads the first visible element of `badge` in a single non-waiting call
 * (see readListUnreadCount); undefined when none is visible.
 */
export async function readVisibleBadgeText(badge: Locator): Promise<string | undefined> {
  const [value] = await badge.filter({ visible: true }).allTextContents();
  return value;
}

/** Unread badge text ("3", "99+") as a number; a missing badge is zero. */
export function parseBadgeCount(value: string | undefined): number {
  if (value === undefined) return 0;
  return Number.parseInt(value.trim().replace('+', ''), 10) || 0;
}

/**
 * Scrolls the drawer feed from its current position to the very top in steps
 * of a quarter viewport, letting each step render, so every message passes
 * fully through the viewport like it does when a reader scrolls up.
 */
export async function scrollFeedToTopStepwise(page: Page): Promise<void> {
  await feedViewport(page).evaluate(async (viewport) => {
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const step = Math.max(1, Math.floor(viewport.clientHeight / 4));
    while (viewport.scrollTop > 0) {
      viewport.scrollTop = Math.max(0, viewport.scrollTop - step);
      await nextFrame();
      await nextFrame();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  });
}

/**
 * Emulates the tab becoming hidden or visible again. The app decides "the tab
 * is visible" from document.visibilityState and reacts to visibilitychange,
 * exactly the signals a browser gives when the tab is backgrounded or the
 * window minimized; headless Chromium never hides a page on its own.
 */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    if (isHidden) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    } else {
      // Drop the overrides; the prototype getters report the real state.
      delete (document as { visibilityState?: unknown }).visibilityState;
      delete (document as { hidden?: unknown }).hidden;
    }
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  expect(await page.evaluate(() => document.visibilityState)).toBe(hidden ? 'hidden' : 'visible');
}
