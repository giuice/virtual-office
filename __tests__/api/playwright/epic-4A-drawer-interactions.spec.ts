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
  watchMessagingChangesStream,
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
    // The recipient's delivery below must be a Realtime event, so the send
    // waits for the server to confirm the recipient's change stream.
    const secondaryChangesStreaming = watchMessagingChangesStream(secondaryPage);

    // Step 1: Primary user navigates to floor plan. The floor plan keeps the
    // network busy (presence polling, screen-share signalling), so wait for
    // the messaging client itself: hydrated and joined to its channel.
    await primaryPage.goto('/floor-plan');
    await waitForRealtimeReady(primaryPage);

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
    await waitForRealtimeReady(secondaryPage);
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: messagingData.directConversationId });

    // Wait for realtime subscriptions to establish
    await waitForRealtimeReady(primaryPage);
    await waitForRealtimeReady(secondaryPage);
    await secondaryChangesStreaming();

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
    await waitForRealtimeReady(primaryPage);
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Message should still be visible after refresh
    await expect(
      primaryPage.locator('[data-testid^="message-"]', { hasText: testMessage })
    ).toBeVisible({ timeout: 10_000 });
  });

  /**
   * FR-024 / AC-029: a failed send keeps the text and reply target in the
   * composer with an error and a retry action; the retry delivers exactly one
   * message to the other account and leaves no optimistic copy behind.
   */
  test('should keep a failed send in the composer and deliver exactly one message on retry', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    const conversationId = messagingData.directConversationId;
    // Feed message items only (temp- optimistic copies included), not their
    // nested message-status-* children.
    const feedMessages = (page: typeof primaryPage, text: string) =>
      page.locator('[data-testid^="message-"][data-thread-depth]', { hasText: text });

    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: conversationId });
    await secondaryPage.goto('/floor-plan');
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: conversationId });
    await waitForRealtimeReady(primaryPage);
    await waitForRealtimeReady(secondaryPage);

    // Reply target: a persisted message in the DM.
    const parentText = `Reply target ${Date.now()}`;
    const parentId = await sendMessage(primaryPage, parentText);
    await waitForRealtimeMessage(secondaryPage, parentText);

    const composer = primaryPage.locator('[data-testid="composer"]');
    const input = composer.locator('textarea').first();
    const replyPreview = composer.locator('[data-testid="reply-composer-preview"]');
    const sendError = composer.locator('[data-testid="composer-send-error"]');
    const retryButton = sendError.getByRole('button', { name: 'Tentar de novo' });

    await primaryPage.locator(`[data-testid="reply-button-${parentId}"]`).click();
    await expect(replyPreview).toContainText(parentText);

    // Every create request that reaches the app server, by outcome.
    const createRequests: Array<{ replyToId?: string; content?: string }> = [];
    let createMode: 'fail' | 'hold' = 'fail';
    let releaseHeldCreate: () => void = () => {};
    const heldCreateReleased = new Promise<void>((resolve) => {
      releaseHeldCreate = resolve;
    });
    await primaryPage.route('**/api/messages/create', async (route) => {
      if (createMode === 'fail') {
        await route.abort('failed');
        return;
      }
      createRequests.push(route.request().postDataJSON());
      // Hold the retry in flight so a second trigger races it.
      await heldCreateReleased;
      await route.continue();
    });

    const failedText = `Failed then retried ${Date.now()}`;
    await input.fill(failedText);
    await composer.locator('[data-testid="message-send-button"]').click();

    // Failure state: error + retry, text and reply target intact, no message.
    await expect(sendError).toBeVisible();
    await expect(sendError).toHaveAttribute('role', 'alert');
    await expect(retryButton).toBeEnabled();
    await expect(input).toHaveValue(failedText);
    await expect(replyPreview).toContainText(parentText);
    await expect(feedMessages(primaryPage, failedText)).toHaveCount(0);

    // Retry, then re-trigger the send while the retry is still in flight.
    createMode = 'hold';
    const createResponse = primaryPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/messages/create' &&
        response.request().method() === 'POST'
    );
    await retryButton.click();
    await expect.poll(() => createRequests.length).toBe(1);
    await expect(sendError).toBeHidden();
    await expect(composer.locator('[data-testid="message-send-button"]')).toBeDisabled();
    await input.press('Enter');
    releaseHeldCreate();

    const response = await createResponse;
    expect(response.status()).toBe(201);
    const { message: created } = (await response.json()) as { message: { id: string; replyToId?: string } };
    expect(created.replyToId).toBe(parentId);
    expect(createRequests).toEqual([
      expect.objectContaining({ content: failedText, replyToId: parentId }),
    ]);

    // Sender: composer reset, exactly one persisted copy, no temp leftover.
    await expect(input).toHaveValue('');
    await expect(replyPreview).toBeHidden();
    await expect(sendError).toBeHidden();
    await expect(primaryPage.locator(`[data-testid="reply-count-${parentId}"]`)).toHaveText(/1 reply/);
    await primaryPage.locator(`[data-testid="reply-count-${parentId}"]`).click();
    await expect(feedMessages(primaryPage, failedText)).toHaveCount(1);
    await expect(primaryPage.locator(`[data-testid="message-${created.id}"]`)).toBeVisible();

    // Recipient: exactly one delivery, threaded under the reply target.
    const recipientReplyCount = secondaryPage.locator(`[data-testid="reply-count-${parentId}"]`);
    await expect(recipientReplyCount).toHaveText(/1 reply/, { timeout: 15_000 });
    await recipientReplyCount.click();
    const recipientThread = secondaryPage.locator(`[data-testid="thread-panel-${parentId}"]`);
    await expect(feedMessages(secondaryPage, failedText)).toHaveCount(1);
    await expect(recipientThread.locator(`[data-testid="message-${created.id}"]`)).toBeVisible();
    expect(createRequests).toHaveLength(1);
  });

  /**
   * FR-024 / AC-029 (T23): the create reaches the server and commits, but its
   * response never reaches the browser. "Tentar de novo" resends the same
   * composition key, the server answers with the stored message, and both
   * accounts keep exactly one copy. A new composition gets a new key.
   */
  test('should keep exactly one message when a committed send loses its response and is retried', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    const conversationId = messagingData.directConversationId;
    const feedMessages = (page: typeof primaryPage, text: string) =>
      page.locator('[data-testid^="message-"][data-thread-depth]', { hasText: text });
    const serverCopies = async (text: string): Promise<string[]> => {
      const response = await secondaryPage.request.get(
        `/api/messages/get?conversationId=${conversationId}&limit=50`
      );
      expect(response.status()).toBe(200);
      const { messages } = (await response.json()) as { messages: Array<{ id: string; content: string }> };
      return messages.filter((message) => message.content === text).map((message) => message.id);
    };

    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: conversationId });
    await secondaryPage.goto('/floor-plan');
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: conversationId });
    await waitForRealtimeReady(primaryPage);
    await waitForRealtimeReady(secondaryPage);

    // Every create the app server answered, with what the browser was told.
    const creates: Array<{
      clientMessageId?: string;
      content?: string;
      status: number;
      messageId?: string;
      deliveredToBrowser: boolean;
    }> = [];
    let dropNextResponse = true;
    await primaryPage.route('**/api/messages/create', async (route) => {
      const body = route.request().postDataJSON() as { clientMessageId?: string; content?: string };
      const response = await route.fetch();
      const json = (await response.json()) as { message?: { id: string } };
      const drop = dropNextResponse;
      dropNextResponse = false;
      creates.push({
        clientMessageId: body.clientMessageId,
        content: body.content,
        status: response.status(),
        messageId: json.message?.id,
        deliveredToBrowser: !drop,
      });
      if (drop) {
        // Committed on the server; the browser sees a network failure.
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response });
    });

    const composer = primaryPage.locator('[data-testid="composer"]');
    const input = composer.locator('textarea').first();
    const sendButton = composer.locator('[data-testid="message-send-button"]');
    const sendError = composer.locator('[data-testid="composer-send-error"]');
    const retryButton = sendError.getByRole('button', { name: 'Tentar de novo' });

    const text = `Committed but response lost ${Date.now()}`;
    await input.fill(text);
    await sendButton.click();

    // The sender sees a failure although the server stored the message.
    await expect(sendError).toBeVisible();
    await expect(input).toHaveValue(text);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ content: text, status: 201, deliveredToBrowser: false });
    const firstKey = creates[0].clientMessageId;
    expect(firstKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const storedId = creates[0].messageId;
    expect(storedId).toBeTruthy();
    await expect.poll(() => serverCopies(text)).toEqual([storedId]);
    await waitForRealtimeMessage(secondaryPage, text);

    // Retry: same composition key, the server returns the stored message.
    const retryResponse = primaryPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/messages/create' &&
        response.request().method() === 'POST'
    );
    await retryButton.click();
    expect((await retryResponse).status()).toBe(200);
    expect(creates).toHaveLength(2);
    expect(creates[1]).toMatchObject({
      clientMessageId: firstKey,
      content: text,
      status: 200,
      messageId: storedId,
      deliveredToBrowser: true,
    });

    // Sender: composer reset, one persisted copy, no optimistic leftover.
    await expect(input).toHaveValue('');
    await expect(sendError).toBeHidden();
    await expect(primaryPage.locator(`[data-testid="message-${storedId}"]`)).toBeVisible();
    await expect(feedMessages(primaryPage, text)).toHaveCount(1);
    await expect(primaryPage.locator('[data-testid^="message-temp-"]')).toHaveCount(0);

    // Recipient: exactly one copy live, on the server, and after a reload.
    await expect(feedMessages(secondaryPage, text)).toHaveCount(1);
    await expect(secondaryPage.locator(`[data-testid="message-${storedId}"]`)).toBeVisible();
    expect(await serverCopies(text)).toEqual([storedId]);
    await secondaryPage.reload();
    await openDrawer(secondaryPage);
    await selectConversation(secondaryPage, { id: conversationId });
    await expect(secondaryPage.locator(`[data-testid="message-${storedId}"]`)).toBeVisible({ timeout: 10_000 });
    await expect(feedMessages(secondaryPage, text)).toHaveCount(1);

    // Sending the same text again is a new composition: new key, new message.
    await input.fill(text);
    await sendButton.click();
    await expect.poll(() => creates.length).toBe(3);
    expect(creates[2]).toMatchObject({ content: text, status: 201, deliveredToBrowser: true });
    expect(creates[2].clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(creates[2].clientMessageId).not.toBe(firstKey);
    const secondId = creates[2].messageId;
    await expect(input).toHaveValue('');
    await expect(feedMessages(primaryPage, text)).toHaveCount(2);
    await expect(primaryPage.locator(`[data-testid="message-${secondId}"]`)).toBeVisible();
    expect((await serverCopies(text)).sort()).toEqual([storedId, secondId].sort());
  });

  /**
   * TRACK T30: a list refresh ("Refreshing conversations…", e.g. the T26
   * catch-up refetch right after the drawer opens) must not move the rows, and
   * a click anywhere on a row, including its padding, opens the conversation.
   * The refetch is held open so the refreshing state is deterministic; the
   * click lands where the row was while the list was refreshing, near its
   * bottom edge (as a user's pointer aimed during the refresh would).
   */
  test('should open a conversation clicked while the list refreshes', async ({
    primaryPage,
    messagingData,
  }) => {
    await primaryPage.goto('/floor-plan');
    await waitForRealtimeReady(primaryPage);
    await openDrawer(primaryPage);

    const dmRow = primaryPage.locator(`[data-testid="conversation-item-${messagingData.directConversationId}"]`);
    const refreshIndicator = primaryPage.getByTestId('conversation-refresh-indicator');
    await expect(dmRow).toBeVisible({ timeout: 10_000 });

    let holdListRequests = true;
    let releaseListRequests!: () => void;
    const listRequestsReleased = new Promise<void>((resolve) => {
      releaseListRequests = resolve;
    });
    await primaryPage.route('**/api/conversations/get**', async (route) => {
      if (holdListRequests) await listRequestsReleased;
      await route.continue();
    });

    // Unpinning the pinned room (listed below the pinned DM) refetches the list.
    await unpinConversation(primaryPage, messagingData.roomConversationIds[0]);
    await expect(refreshIndicator).toBeVisible();
    const rowWhileRefreshing = await dmRow.boundingBox();
    if (!rowWhileRefreshing) throw new Error('DM row has no layout box while the list refreshes');

    holdListRequests = false;
    releaseListRequests();
    await expect(refreshIndicator).toBeHidden({ timeout: 10_000 });
    expect(await dmRow.boundingBox()).toEqual(rowWhileRefreshing);

    const { x, y, width, height } = rowWhileRefreshing;
    await primaryPage.mouse.click(x + width / 2, y + height - 3);
    await expect(primaryPage.getByTestId('messages-feed')).toBeVisible({ timeout: 10_000 });
    // The seeded messages belong to the DM, so the clicked conversation opened.
    await expect(primaryPage.getByTestId(`message-${messagingData.messageIds[0]}`)).toBeVisible();
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
  // These tests pin roomConversationIds[0] themselves, so it must start unpinned.
  test.use({ messagingSeedOptions: { includePinnedRoom: false } });

  test('should filter conversations by pinned status', async ({ primaryPage, messagingData }) => {
    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    // Pin one of the room conversations via API or UI
    const roomConversationId = messagingData.roomConversationIds[0];
    await pinConversation(primaryPage, roomConversationId);

    await expect.poll(() => isConversationPinned(primaryPage, roomConversationId)).toBe(true);

    // Get initial conversation count
    const initialCount = await getConversationCount(primaryPage);
    expect(initialCount).toBeGreaterThan(1);

    // Toggle "Pinned Only" filter
    await togglePinnedFilter(primaryPage);
    await expect(primaryPage.locator('[data-testid="filter-pinned-toggle"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => getConversationCount(primaryPage)).toBeLessThan(initialCount);

    // Verify the pinned conversation is still visible
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${roomConversationId}"]`)
    ).toBeVisible();

    // Unpin the conversation
    await unpinConversation(primaryPage, roomConversationId);

    // Verify conversation disappears from filtered view immediately
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${roomConversationId}"]`)
    ).toBeHidden({ timeout: 5_000 });

    // Disable filter
    await togglePinnedFilter(primaryPage);
    await expect(primaryPage.locator('[data-testid="filter-pinned-toggle"]')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => getConversationCount(primaryPage)).toBe(initialCount);
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
    await expect(primaryPage.locator('[data-testid="filter-pinned-toggle"]')).toHaveAttribute('aria-pressed', 'true');

    // Select a conversation and navigate away
    await selectConversation(primaryPage, { id: messagingData.directConversationId });

    // Go back to list view
    const backButton = primaryPage.getByRole('button', { name: /back/i });
    await backButton.click();

    // Filter should still be active
    await expect(primaryPage.locator('[data-testid="filter-pinned-toggle"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => getConversationCount(primaryPage)).toBeLessThan(3); // Assuming more than 2 total conversations
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
  // The filter test pins roomConversationIds[0] itself, so it must start unpinned.
  test.use({ messagingSeedOptions: { includePinnedRoom: false } });

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
    await expect(roomsTab).toHaveAttribute('data-state', 'active');

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
    await expect(dmsTab).toHaveAttribute('data-state', 'active');

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
    await expect(primaryPage.locator('[data-testid="filter-pinned-toggle"]')).toHaveAttribute('aria-pressed', 'true');

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
 * - Drawer remains open while the user moves between spaces
 * - The drawer follows the user into the entered space's room chat
 * - Multiple rapid moves are handled gracefully
 *
 * A "navigation" is a real move through the floor plan's Enter action
 * (navigateToSpace): the server accepts the location change and the target
 * card shows the user inside it. Since the floor-plan redesign, clicking a
 * card only opens its detail panel, and a successful Enter opens that space's
 * room conversation in the drawer (useModernFloorPlanKnock.handleEnterSpace →
 * onOpenChat), so the drawer is expected to switch to the room chat rather
 * than keep the previously selected DM.
 */
const roomConversationName = (data: { runId: string }, spaceIndex: number) =>
  `Test Room Conversation ${spaceIndex + 1} ${data.runId}`;

/** The space the user occupies once the floor plan has placed them. */
async function occupiedSpaceId(page: import('@playwright/test').Page): Promise<string> {
  const occupied = page.locator('[data-testid^="space-"][data-user-in-space="true"]');
  await expect(occupied).toHaveCount(1, { timeout: 15_000 });
  const spaceId = await occupied.getAttribute('data-space-id');
  expect(spaceId).toBeTruthy();
  return spaceId ?? '';
}

/**
 * Put the user back in the space they occupied before the test moved them,
 * when that space is not a seeded room. Seeded rooms are the fixed
 * `Test Space Fixed N` rooms reused by every run and the fixture cleanup no
 * longer deletes spaces (TRACK T28), so ending in one leaks nothing; a user
 * who started in one stays in the last room the test entered.
 */
async function returnToSpace(
  page: import('@playwright/test').Page,
  spaceId: string,
  seededSpaceIds: string[]
): Promise<void> {
  if (!seededSpaceIds.includes(spaceId)) {
    await navigateToSpace(page, spaceId);
  }
}

test.describe('AC4: Navigate Space → Drawer Stability', () => {
  test('should keep drawer open and stable during space navigation', async ({
    primaryPage,
    messagingData,
  }) => {
    expect(messagingData.spaceIds.length).toBeGreaterThanOrEqual(2);

    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);

    // Select a conversation
    await selectConversation(primaryPage, { id: messagingData.directConversationId });
    const feed = primaryPage.locator('[data-testid="messages-feed"]');
    await expect(feed).toContainText(`test_dm_${messagingData.runId}`);

    // Visit both seeded spaces, starting with one the user is not already in,
    // so both visits are real location changes.
    const startSpaceId = await occupiedSpaceId(primaryPage);
    const visitOrder = startSpaceId === messagingData.spaceIds[0] ? [1, 0] : [0, 1];

    for (const spaceIndex of visitOrder) {
      await navigateToSpace(primaryPage, messagingData.spaceIds[spaceIndex]);

      // Drawer stays open and now shows the entered space's room chat
      expect(await isDrawerOpen(primaryPage)).toBe(true);
      await expect(feed).toContainText(roomConversationName(messagingData, spaceIndex));
      await expect(primaryPage.locator('[data-testid="composer"]')).toBeVisible();
    }

    await returnToSpace(primaryPage, startSpaceId, messagingData.spaceIds);
  });

  test('should handle rapid space navigation without drawer issues', async ({
    primaryPage,
    messagingData,
  }) => {
    expect(messagingData.spaceIds.length).toBeGreaterThanOrEqual(2);
    const [firstSpaceId, secondSpaceId] = messagingData.spaceIds;

    await primaryPage.goto('/floor-plan');
    await openDrawer(primaryPage);
    await selectConversation(primaryPage, { id: messagingData.directConversationId });
    const startSpaceId = await occupiedSpaceId(primaryPage);

    // Perform consecutive moves without pausing between them
    for (let i = 0; i < 3; i++) {
      await navigateToSpace(primaryPage, firstSpaceId);
      await navigateToSpace(primaryPage, secondSpaceId);
    }

    // Drawer remains open and settled on the last entered space's room chat
    expect(await isDrawerOpen(primaryPage)).toBe(true);
    await expect(primaryPage.locator('[data-testid="messages-feed"]')).toContainText(
      roomConversationName(messagingData, 1)
    );
    await expect(primaryPage.locator('[data-testid="composer"]')).toBeVisible();

    await returnToSpace(primaryPage, startSpaceId, messagingData.spaceIds);
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

    // The archive persisted: after a reload (fresh list fetch) it is still
    // out of the main list...
    await primaryPage.reload();
    await openDrawer(primaryPage);
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${messagingData.directConversationId}"]`)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
    ).toBeHidden();

    // ...and reachable in the archived view
    const archivedToggle = primaryPage.locator('[data-testid="show-archived-button"]');
    await archivedToggle.click();
    await expect(archivedToggle).toHaveAttribute('aria-pressed', 'true');

    // Verify archived conversation appears in archived list
    await expect(
      primaryPage
        .locator('[data-testid="archived-section"]')
        .locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
    ).toBeVisible({ timeout: 5_000 });

    // Unarchive the conversation (it leaves the archived list)
    await unarchiveConversation(primaryPage, conversationToArchive);

    // Back to the main list
    await archivedToggle.click();
    await expect(archivedToggle).toHaveAttribute('aria-pressed', 'false');

    // Verify conversation returns to main list
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
    ).toBeVisible({ timeout: 5_000 });

    // The unarchive persisted: it is still in the main list after a reload
    await primaryPage.reload();
    await openDrawer(primaryPage);
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      primaryPage.locator(`[data-testid="conversation-item-${conversationToArchive}"]`)
    ).toHaveAttribute('data-archived', 'false');
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
