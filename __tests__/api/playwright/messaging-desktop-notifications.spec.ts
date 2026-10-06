import type { BrowserContext, Locator, Page } from '@playwright/test';

import { test, expect } from './fixtures/messaging';
import {
  backToConversationList,
  openDrawer,
  readListUnreadCount,
  selectConversation,
  sendMessage,
  setTabHidden,
  waitForRealtimeReady,
  watchMessagingChangesStream,
} from './helpers/drawer-helpers';
import { recordToneInBrowser, sendVoiceNoteViaApi } from './helpers/voice-note-helpers';

/**
 * Phase 4 T19 — desktop notifications for new DM and group messages (FR-023,
 * BR-010; AC-027, AC-028, AC-037). The page's Notification constructor is
 * wrapped by an init script that records every construction (title, body,
 * tag) and every permission request, while permission and requestPermission
 * keep the browser's real behavior (granted through Playwright, or the
 * browser's own denial when nothing is granted).
 */
test.use({
  // Full Chromium: the default headless shell always reports
  // Notification.permission "denied", even when it was granted.
  channel: 'chromium',
  messagingSeedOptions: { includeGroupConversation: true },
});

const RECV_TIMEOUT_MS = 15_000;
/** Long enough for a notification the page was going to show to be constructed. */
const QUIET_WINDOW_MS = 2_500;
const PRIMARY_NAME = process.env.PLAYWRIGHT_PRIMARY_DISPLAY_NAME ?? 'Playwright Primary';
const WEBM = 'audio/webm;codecs=opus';

interface RecordedNotification {
  title: string;
  body: string;
  tag: string;
}

interface NotificationRecord {
  constructed: RecordedNotification[];
  permissionRequests: number;
}

/** Init script: records Notification constructions and permission requests. */
function installNotificationRecorder(): void {
  const target = window as unknown as {
    __notificationRecord: NotificationRecord;
    __notificationInstances: Notification[];
  };
  target.__notificationRecord = { constructed: [], permissionRequests: 0 };
  target.__notificationInstances = [];
  const RealNotification = window.Notification;
  if (typeof RealNotification !== 'function') return;
  class RecordingNotification extends RealNotification {
    constructor(title: string, options?: NotificationOptions) {
      // Recorded before construction, so an attempt that throws still counts.
      target.__notificationRecord.constructed.push({
        title,
        body: options?.body ?? '',
        tag: options?.tag ?? '',
      });
      super(title, options);
      target.__notificationInstances.push(this);
    }

    static requestPermission(callback?: NotificationPermissionCallback): Promise<NotificationPermission> {
      target.__notificationRecord.permissionRequests += 1;
      return RealNotification.requestPermission(callback);
    }
  }
  Object.defineProperty(window, 'Notification', {
    value: RecordingNotification,
    writable: true,
    configurable: true,
  });
}

/** Page init script: the tab is in the background from its first script on. */
function startHidden(): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
}

/** Page init script: a browser without the Notifications API. */
function removeNotificationApi(): void {
  delete (window as { Notification?: unknown }).Notification;
}

async function notificationRecord(page: Page): Promise<NotificationRecord> {
  return page.evaluate(
    () => (window as unknown as { __notificationRecord: NotificationRecord }).__notificationRecord,
  );
}

async function notificationsOf(page: Page): Promise<RecordedNotification[]> {
  return (await notificationRecord(page)).constructed;
}

/** Waits for the page's notification count to reach `count`, then returns them. */
async function expectNotificationCount(page: Page, count: number): Promise<RecordedNotification[]> {
  await expect.poll(async () => (await notificationsOf(page)).length, { timeout: RECV_TIMEOUT_MS }).toBe(count);
  return notificationsOf(page);
}

/** After a quiet window, the page still has exactly `count` notifications. */
async function expectNoNewNotification(page: Page, count: number, reason: string): Promise<void> {
  await page.waitForTimeout(QUIET_WINDOW_MS);
  expect((await notificationsOf(page)).length, reason).toBe(count);
}

/** Clicks the newest recorded notification with `tag`, as the OS would on a click. */
async function clickNotification(page: Page, tag: string): Promise<void> {
  const clicked = await page.evaluate((wanted) => {
    const instances = (window as unknown as { __notificationInstances: Notification[] }).__notificationInstances;
    const notification = instances.filter((candidate) => candidate.tag === wanted).at(-1);
    if (!notification) return false;
    notification.dispatchEvent(new Event('click'));
    return true;
  }, tag);
  expect(clicked, `a notification tagged ${tag}`).toBe(true);
}

async function sendText(page: Page, conversationId: string, content: string): Promise<string> {
  const response = await page.request.post('/api/messages/create', { data: { conversationId, content } });
  expect(response.status(), `send "${content}"`).toBe(201);
  const body = (await response.json()) as { message: { id: string } };
  return body.message.id;
}

async function sendTextFile(page: Page, conversationId: string, name: string): Promise<string> {
  const upload = await page.request.post('/api/messages/upload', {
    multipart: {
      file: { name, mimeType: 'text/plain', buffer: Buffer.from(`conteúdo de ${name}`) },
      conversationId,
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const { attachment } = (await upload.json()) as { attachment: { id: string } };
  const create = await page.request.post('/api/messages/create', {
    data: { conversationId, attachmentIds: [attachment.id] },
  });
  expect(create.status(), await create.text()).toBe(201);
  return ((await create.json()) as { message: { id: string } }).message.id;
}

const tagOf = (conversationId: string) => `vo-messaging-conversation-${conversationId}`;
const toggleOf = (page: Page) => page.getByTestId('messaging-notifications-toggle');
const feedMessage = (page: Page, text: string) =>
  page.locator('[data-testid="messages-feed"] [data-testid^="message-"]', { hasText: text });

async function loadFloorPlan(page: Page): Promise<void> {
  const streamConfirmed = watchMessagingChangesStream(page);
  await page.goto('/floor-plan');
  await waitForRealtimeReady(page);
  await streamConfirmed();
  await openDrawer(page);
}

/** The control and its notice fit inside the 384 px drawer. */
async function expectInsideDrawer(page: Page, element: Locator): Promise<void> {
  const drawer = await page.getByTestId('messaging-drawer').boundingBox();
  const box = await element.boundingBox();
  expect(drawer && box, 'drawer and element are rendered').toBeTruthy();
  if (!drawer || !box) return;
  expect(drawer.width).toBeLessThanOrEqual(384);
  expect(box.x).toBeGreaterThanOrEqual(drawer.x);
  expect(box.x + box.width).toBeLessThanOrEqual(drawer.x + drawer.width);
}

async function grantNotifications(context: BrowserContext, page: Page): Promise<void> {
  const origin = new URL(test.info().project.use.baseURL ?? page.url()).origin;
  await context.grantPermissions(['notifications'], { origin });
}

test.describe('Desktop notifications for new messages', () => {
  test.describe.configure({ mode: 'serial' });

  test('granted: DM and group messages notify when hidden or not viewed; room, own, and viewed messages do not', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(150_000);
    const dmId = messagingData.directConversationId;
    const groupId = messagingData.groupConversationId ?? '';
    const roomId = messagingData.roomConversationIds[0];
    expect(groupId, 'seeded group conversation').toBeTruthy();
    const runTag = Date.now();
    const context = secondaryPage.context();
    await grantNotifications(context, secondaryPage);
    await context.addInitScript(installNotificationRecorder);

    await loadFloorPlan(secondaryPage);
    expect(await secondaryPage.evaluate(() => Notification.permission)).toBe('granted');
    const toggle = toggleOf(secondaryPage);
    // Permission granted but never enabled in the app: still off, nothing requested on load.
    await expect(toggle).toHaveAccessibleName('Ativar notificações');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expectInsideDrawer(secondaryPage, toggle);
    expect(await notificationRecord(secondaryPage)).toEqual({ constructed: [], permissionRequests: 0 });

    // Not opted in: a hidden-tab DM is delivered (unread 1 → 2) but not announced.
    await setTabHidden(secondaryPage, true);
    await sendText(primaryPage, dmId, `t19-before-optin-${runTag}`);
    await expect.poll(() => readListUnreadCount(secondaryPage, dmId), { timeout: RECV_TIMEOUT_MS }).toBe(2);
    await expectNoNewNotification(secondaryPage, 0, 'granted permission alone must not enable notifications');
    await setTabHidden(secondaryPage, false);

    // Enable by keyboard.
    await toggle.focus();
    await secondaryPage.keyboard.press('Enter');
    await expect(toggle).toHaveAccessibleName('Notificações ativadas');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toBeFocused();

    // Viewing the DM with the tab visible: no notification.
    await selectConversation(secondaryPage, { id: dmId });
    const viewedText = `t19-viewed-${runTag}`;
    await sendText(primaryPage, dmId, viewedText);
    await expect(feedMessage(secondaryPage, viewedText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expectNoNewNotification(secondaryPage, 0, 'the conversation on screen in a visible tab is not announced');

    // Same drawer state, tab hidden: DM and group messages notify.
    await setTabHidden(secondaryPage, true);
    const hiddenDmText = `t19-hidden-dm-${runTag}`;
    await sendText(primaryPage, dmId, hiddenDmText);
    let notifications = await expectNotificationCount(secondaryPage, 1);
    expect(notifications[0]).toEqual({ title: PRIMARY_NAME, body: hiddenDmText, tag: tagOf(dmId) });

    const groupText = `t19-hidden-group-${runTag} com   espaços\nextras`;
    await sendText(primaryPage, groupId, groupText);
    notifications = await expectNotificationCount(secondaryPage, 2);
    expect(notifications[1].title).toMatch(new RegExp(`^${PRIMARY_NAME} em Test Group `));
    expect(notifications[1].body).toBe(`t19-hidden-group-${runTag} com espaços extras`);
    expect(notifications[1].tag).toBe(tagOf(groupId));

    // Own message (sent by B through the same API as the composer): in B's feed, not announced.
    const ownText = `t19-own-${runTag}`;
    await sendText(secondaryPage, dmId, ownText);
    await expect(feedMessage(secondaryPage, ownText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expectNoNewNotification(secondaryPage, 2, 'own messages are never announced');

    // Room message, tab still hidden: delivered (room unread +1), not announced.
    await backToConversationList(secondaryPage, roomId);
    const roomUnreadBefore = await readListUnreadCount(secondaryPage, roomId);
    await sendText(primaryPage, roomId, `t19-room-${runTag}`);
    await expect
      .poll(() => readListUnreadCount(secondaryPage, roomId), { timeout: RECV_TIMEOUT_MS })
      .toBe(roomUnreadBefore + 1);
    await expectNoNewNotification(secondaryPage, 2, 'room messages are never announced');

    // Tab visible, drawer on the list (not on the conversation): notify.
    await setTabHidden(secondaryPage, false);
    const listDmText = `t19-list-dm-${runTag}`;
    await sendText(primaryPage, dmId, listDmText);
    notifications = await expectNotificationCount(secondaryPage, 3);
    expect(notifications[2]).toEqual({ title: PRIMARY_NAME, body: listDmText, tag: tagOf(dmId) });

    // Content without text: a voice note in the group, a file in the DM.
    const tone = await recordToneInBrowser(primaryPage.context(), WEBM, 1);
    if (!tone) throw new Error('Chromium must record WebM/Opus');
    await sendVoiceNoteViaApi(primaryPage, { conversationId: groupId, bytes: tone, mimeType: WEBM, durationSeconds: 1 });
    notifications = await expectNotificationCount(secondaryPage, 4);
    expect(notifications[3].body).toBe('Nota de voz');
    expect(notifications[3].tag).toBe(tagOf(groupId));
    await sendTextFile(primaryPage, dmId, `t19-${runTag}.txt`);
    notifications = await expectNotificationCount(secondaryPage, 5);
    expect(notifications[4]).toEqual({ title: PRIMARY_NAME, body: 'Anexo', tag: tagOf(dmId) });

    // Clicking a DM notification opens the drawer on that conversation.
    await clickNotification(secondaryPage, tagOf(dmId));
    await expect(feedMessage(secondaryPage, listDmText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(secondaryPage.getByRole('button', { name: 'Back to conversations' })).toBeVisible();

    // Turned off in the app: a hidden-tab DM is delivered but not announced; the choice persists.
    await toggle.focus();
    await secondaryPage.keyboard.press('Enter');
    await expect(toggle).toHaveAccessibleName('Ativar notificações');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await setTabHidden(secondaryPage, true);
    const offText = `t19-off-${runTag}`;
    await sendText(primaryPage, dmId, offText);
    await expect(feedMessage(secondaryPage, offText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expectNoNewNotification(secondaryPage, 5, 'notifications turned off in the app are not shown');
    expect((await notificationRecord(secondaryPage)).permissionRequests, 'permission was already granted').toBe(0);
  });

  test('a message is announced once across tabs, and messages that already existed are never announced', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(150_000);
    const dmId = messagingData.directConversationId;
    const groupId = messagingData.groupConversationId ?? '';
    expect(groupId, 'seeded group conversation').toBeTruthy();
    const runTag = Date.now();
    const context = secondaryPage.context();
    await grantNotifications(context, secondaryPage);
    await context.addInitScript(installNotificationRecorder);

    // Tab 1 enables notifications (mouse), then closes.
    await loadFloorPlan(secondaryPage);
    await toggleOf(secondaryPage).click();
    await expect(toggleOf(secondaryPage)).toHaveAccessibleName('Notificações ativadas');
    await secondaryPage.close();

    // Sent while no tab is open: the DM now holds 2 unread messages (seeded + this one).
    const existingText = `t19-existing-${runTag}`;
    await sendText(primaryPage, dmId, existingText);

    // Two background tabs load the list and the DM feed, both holding the existing messages.
    const openBackgroundTab = async (): Promise<Page> => {
      const page = await context.newPage();
      await page.addInitScript(startHidden);
      await loadFloorPlan(page);
      await selectConversation(page, { id: dmId });
      await expect(feedMessage(page, existingText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
      return page;
    };
    const tabA = await openBackgroundTab();
    const tabB = await openBackgroundTab();
    expect(await tabA.evaluate(() => document.visibilityState)).toBe('hidden');
    await tabA.waitForTimeout(QUIET_WINDOW_MS);
    for (const tab of [tabA, tabB]) {
      expect(await notificationRecord(tab), 'existing messages are not announced; nothing is requested on load').toEqual({
        constructed: [],
        permissionRequests: 0,
      });
      await expect(toggleOf(tab)).toHaveAccessibleName('Notificações ativadas');
    }

    const totalNotifications = async () =>
      [...(await notificationsOf(tabA)), ...(await notificationsOf(tabB))];

    // A new DM reaches both tabs live and is announced exactly once.
    const newDmText = `t19-new-dm-${runTag}`;
    await sendText(primaryPage, dmId, newDmText);
    await expect(feedMessage(tabA, newDmText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect(feedMessage(tabB, newDmText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await expect.poll(async () => (await totalNotifications()).length, { timeout: RECV_TIMEOUT_MS }).toBe(1);
    await tabA.waitForTimeout(QUIET_WINDOW_MS);
    expect(await totalNotifications(), 'one notification for the DM across both tabs').toEqual([
      { title: PRIMARY_NAME, body: newDmText, tag: tagOf(dmId) },
    ]);

    // The same for a group message (each tab's drawer is on the DM).
    const groupText = `t19-new-group-${runTag}`;
    await sendText(primaryPage, groupId, groupText);
    await expect.poll(async () => (await totalNotifications()).length, { timeout: RECV_TIMEOUT_MS }).toBe(2);
    await tabA.waitForTimeout(QUIET_WINDOW_MS);
    const all = await totalNotifications();
    expect(all).toHaveLength(2);
    expect(all.filter((notification) => notification.body === groupText)).toHaveLength(1);
    await tabA.close();
    await tabB.close();
  });

  test('a message already in the loaded list is not announced when Realtime delivers it late', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    // Realtime matches a change when it reads it from the WAL, which can lag
    // behind the commit: a message committed before the page's list loaded can
    // still arrive as a live INSERT afterwards (seen in a full run, TRACK T31).
    // Forced here with real frames: the list is held until the message is
    // committed and its INSERT frame is held until the list has loaded.
    test.setTimeout(120_000);
    const dmId = messagingData.directConversationId;
    const runTag = Date.now();
    const context = secondaryPage.context();
    await grantNotifications(context, secondaryPage);
    await context.addInitScript(installNotificationRecorder);
    await loadFloorPlan(secondaryPage);
    await toggleOf(secondaryPage).click();
    await expect(toggleOf(secondaryPage)).toHaveAccessibleName('Notificações ativadas');
    await secondaryPage.close();

    const lateText = `t31-late-${runTag}`;
    const page = await context.newPage();
    await page.addInitScript(startHidden);

    let releaseList: () => void = () => undefined;
    const listReleased = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    await page.route('**/api/conversations/get**', async (route) => {
      await listReleased;
      // Read by the server only now, after the message commit.
      const response = await route.fetch();
      await route.fulfill({ response }).catch(() => {
        // The app superseded this request with a newer list fetch, also held.
      });
    });

    let connections = 0;
    const heldFrames: string[] = [];
    let deliverToPage: (frame: string) => void = () => undefined;
    await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
      connections += 1;
      const server = socket.connectToServer();
      deliverToPage = (frame) => socket.send(frame);
      server.onMessage((frame) => {
        if (typeof frame === 'string' && frame.includes(lateText)) {
          heldFrames.push(frame);
          return;
        }
        socket.send(frame);
      });
    });

    await page.goto('/floor-plan');
    await waitForRealtimeReady(page);
    await sendText(primaryPage, dmId, lateText);
    await expect
      .poll(() => heldFrames.length, { timeout: RECV_TIMEOUT_MS, message: 'the INSERT frame reached the page socket' })
      .toBe(1);

    // The first list the page loads already holds the message (seeded + late).
    releaseList();
    await expect(page.getByTestId('messaging-drawer-trigger-badge')).toHaveText('2', { timeout: RECV_TIMEOUT_MS });
    expect(connections, 'the held frame belongs to the live connection').toBe(1);

    deliverToPage(heldFrames[0]);
    await expectNoNewNotification(page, 0, 'a message that was in the loaded list is not announced');

    // Control: a message sent after the load is announced.
    const newText = `t31-new-${runTag}`;
    await sendText(primaryPage, dmId, newText);
    expect(await expectNotificationCount(page, 1)).toEqual([
      { title: PRIMARY_NAME, body: newText, tag: tagOf(dmId) },
    ]);
    // A list refetch the app starts now must not outlive the page in the route.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
  });

  test('denied or unsupported: nothing is attempted and messaging keeps working', async ({
    primaryPage,
    secondaryPage,
    messagingData,
  }) => {
    test.setTimeout(120_000);
    const dmId = messagingData.directConversationId;
    const runTag = Date.now();
    const context = secondaryPage.context();
    await context.addInitScript(installNotificationRecorder);
    const pageErrors: string[] = [];
    secondaryPage.on('pageerror', (error) => pageErrors.push(error.message));

    // Nothing granted: the browser has not decided, and the app does not ask on load.
    await loadFloorPlan(secondaryPage);
    expect(await secondaryPage.evaluate(() => Notification.permission)).toBe('default');
    const toggle = toggleOf(secondaryPage);
    await expect(toggle).toHaveAccessibleName('Ativar notificações');
    expect(await notificationRecord(secondaryPage)).toEqual({ constructed: [], permissionRequests: 0 });

    // The user asks; the browser refuses.
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Notificações bloqueadas no navegador');
    await expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(await secondaryPage.evaluate(() => Notification.permission)).toBe('denied');
    expect((await notificationRecord(secondaryPage)).permissionRequests).toBe(1);
    const help = secondaryPage.getByTestId('messaging-notifications-blocked-help');
    await expect(help).toBeVisible();
    await expect(help).toHaveAttribute('role', 'alert');
    await expect(help).toContainText('permita notificações para este site nas configurações do navegador');
    await expectInsideDrawer(secondaryPage, help);
    await help.getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(help).toBeHidden();

    // Blocked control, by keyboard: shows the guidance again without asking again.
    await toggle.focus();
    await secondaryPage.keyboard.press('Enter');
    await expect(help).toBeVisible();
    await secondaryPage.keyboard.press('Escape');
    await expect(help).toBeHidden();
    expect((await notificationRecord(secondaryPage)).permissionRequests).toBe(1);

    // Hidden tab, DM from A: delivered (unread 1 → 2), nothing constructed.
    await setTabHidden(secondaryPage, true);
    const deniedText = `t19-denied-${runTag}`;
    await sendText(primaryPage, dmId, deniedText);
    await expect.poll(() => readListUnreadCount(secondaryPage, dmId), { timeout: RECV_TIMEOUT_MS }).toBe(2);
    await expectNoNewNotification(secondaryPage, 0, 'denied permission: no notification is attempted');

    // Messaging works normally: B reads and replies.
    await setTabHidden(secondaryPage, false);
    await selectConversation(secondaryPage, { id: dmId });
    await expect(feedMessage(secondaryPage, deniedText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await sendMessage(secondaryPage, `t19-reply-${runTag}`);
    expect(await notificationsOf(secondaryPage)).toEqual([]);

    // A browser without the Notifications API: the control is unavailable; messages still arrive.
    const unsupported = await context.newPage();
    unsupported.on('pageerror', (error) => pageErrors.push(error.message));
    await unsupported.addInitScript(removeNotificationApi);
    await loadFloorPlan(unsupported);
    expect(await unsupported.evaluate(() => typeof (window as { Notification?: unknown }).Notification)).toBe('undefined');
    const unsupportedToggle = toggleOf(unsupported);
    await expect(unsupportedToggle).toHaveAccessibleName('Notificações indisponíveis neste navegador');
    await expect(unsupportedToggle).toBeDisabled();
    await selectConversation(unsupported, { id: dmId });
    await expect(feedMessage(unsupported, `t19-reply-${runTag}`)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    const unsupportedText = `t19-unsupported-${runTag}`;
    await sendText(primaryPage, dmId, unsupportedText);
    await expect(feedMessage(unsupported, unsupportedText)).toBeVisible({ timeout: RECV_TIMEOUT_MS });
    await unsupported.close();
    expect(pageErrors, 'no page errors').toEqual([]);
  });
});
