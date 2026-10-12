import { randomUUID } from 'node:crypto';

import type { BrowserContext, Cookie, Page, Route } from '@playwright/test';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5';
import {
  NOTIFICATION_QUIET_WINDOW_MS,
  NOTIFICATION_RECV_TIMEOUT_MS,
  clickNotification,
  expectNoNewNotification,
  expectNotificationCount,
  grantNotifications,
  installNotificationRecorder,
  notificationTagOf,
  notificationsOf,
  notificationsToggle,
  startHidden,
} from '../helpers/desktop-notification-recorder';
import { openDrawer, setTabHidden, waitForRealtimeReady, watchMessagingChangesStream } from '../helpers/drawer-helpers';
import { withLocalMessagingDb } from '../helpers/messaging-local-db';
import { STEP_TIMEOUT_MS, createViaApi, openConversation } from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T18 — @mention desktop notifications (FR-025, BR-011; AC-025,
 * AC-026, AC-049 and the notification clause of AC-046).
 *
 * Real accounts, the real app, local Supabase and its Realtime. Notifications
 * are observed as in the Phase 4 spec (helpers/desktop-notification-recorder:
 * the page's Notification constructor recorded, the browser's real
 * permission granted). A sends through the real create route with the
 * composer's contract (clientMessageId + mentionIds). Tabs are hidden by the
 * visibility emulation the Phase 4 specs use (setTabHidden / startHidden).
 * Faults are network shaping only: one tab's Realtime frames for one message
 * held and released, the authorization read (GET /api/messages/get
 * ?source=notification) held before or after the server answered or failed
 * in transit, the list/roster reads a removal causes held, and the
 * browser's auth cookies replaced by C's real ones (a sign-in completed by a
 * server response in another tab, as in T11) — no auth event in this tab.
 */

const isAuthorizationRead = (url: URL) =>
  url.pathname === '/api/messages/get' && url.searchParams.get('source') === 'notification';

const feedMessage = (page: Page, messageId: string) => page.getByTestId(`message-${messageId}`);
const listItem = (page: Page, conversationId: string) => page.getByTestId(`conversation-item-${conversationId}`);

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function conversationName(conversationId: string): Promise<string> {
  return withLocalMessagingDb(async (db) => {
    const { rows } = await db.query<{ name: string | null }>('select name from public.conversations where id = $1', [
      conversationId,
    ]);
    const name = rows[0]?.name?.trim();
    expect(name, `name of conversation ${conversationId}`).toBeTruthy();
    return name as string;
  });
}

async function storedMentions(messageId: string): Promise<string[]> {
  return withLocalMessagingDb(async (db) => {
    const { rows } = await db.query<{ user_id: string }>(
      'select mentioned_user_id::text as user_id from public.message_mentions where message_id = $1 order by 1',
      [messageId],
    );
    return rows.map((row) => row.user_id);
  });
}

/** A sends through the real create route with the composer's keyed contract. */
async function send(
  page: Page,
  conversationId: string,
  content: string,
  mentionIds: string[] = [],
  extra: Record<string, unknown> = {},
): Promise<string> {
  return createViaApi(page, { conversationId, content, clientMessageId: randomUUID(), mentionIds, ...extra });
}

/** Loads the app in the tab (Realtime list and messages streams up) with the drawer open. */
async function loadApp(page: Page): Promise<void> {
  const streamConfirmed = watchMessagingChangesStream(page);
  await page.goto('/floor-plan');
  await waitForRealtimeReady(page);
  await streamConfirmed();
  await openDrawer(page);
}

/** B's browser records notifications and has the permission (before its tabs load). */
async function prepareBrowser(device: Phase5Device): Promise<void> {
  await grantNotifications(device.context, new URL(device.page.url()).origin);
  await device.context.addInitScript(installNotificationRecorder);
}

/** Turns notifications on in the drawer (shared by the browser's tabs). */
async function enableNotifications(page: Page): Promise<void> {
  const toggle = notificationsToggle(page);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Notificações ativadas');
}

/** Counts the tab's authorization reads that got an answer. */
function countAuthorizationReads(page: Page): { finished: number } {
  const reads = { finished: 0 };
  page.on('requestfinished', (request) => {
    if (isAuthorizationRead(new URL(request.url()))) reads.finished += 1;
  });
  return reads;
}

test.describe('Phase 5 T18 — mention desktop notifications', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-025/AC-026: room, thread-reply, DM and group mentions each notify once as "<A> mencionou você em <conversa>" with the full text; a room message without a mention of B, B\'s own messages and messages with the toggle off do not; clicking opens the room', async ({
    phase5World,
    openDevice,
  }) => {
    const { roomId, groupId, directId } = phase5World.conversations;
    const { A, B, C } = phase5World.users;
    const roomName = await conversationName(roomId);
    const groupName = await conversationName(groupId);
    const b = await openDevice('B');
    const a = await openDevice('A');
    await prepareBrowser(b);
    await loadApp(b.page);
    await enableNotifications(b.page);
    // B's tab is visible and viewing another conversation (the group).
    await openConversation(b.page, groupId);
    const mentionTitle = (place: string) => `${A.displayName} mencionou você em ${place}`;

    // ---- Room messages that do not mention B: none, whether they hold no "@",
    // a typed "@<B>" that is plain text (no mention stored), or a mention of C.
    await send(a.page, roomId, `t18 room plain ${randomUUID()}`);
    const typedOnly = await send(a.page, roomId, `@${B.displayName} t18 typed only ${randomUUID()}`);
    const mentionsC = await send(a.page, roomId, `@${C.displayName} t18 mentions C ${randomUUID()}`, [C.userId]);
    expect(await storedMentions(typedOnly)).toEqual([]);
    expect(await storedMentions(mentionsC)).toEqual([C.userId]);

    // ---- A room mention of B (longer than the Phase 4 preview): one notification, full text.
    const roomText = `@${B.displayName} t18 room mention ${randomUUID()} ${'texto completo da menção '.repeat(8).trim()}`;
    expect(roomText.length).toBeGreaterThan(120);
    const roomMessage = await send(a.page, roomId, roomText, [B.userId]);
    let notifications = await expectNotificationCount(b.page, 1);
    await expectNoNewNotification(b.page, 1, 'only the mention of B, once; the room messages before it announce nothing');
    expect(notifications).toEqual([{ title: mentionTitle(roomName), body: roomText, tag: notificationTagOf(roomId) }]);

    // ---- A thread reply that mentions B.
    const replyText = `@${B.displayName} t18 thread reply ${randomUUID()}`;
    await send(a.page, roomId, replyText, [B.userId], { replyToId: roomMessage });
    notifications = await expectNotificationCount(b.page, 2);
    expect(notifications[1]).toEqual({ title: mentionTitle(roomName), body: replyText, tag: notificationTagOf(roomId) });

    // ---- Clicking the room notification opens the room in the drawer.
    await clickNotification(b.page, notificationTagOf(roomId));
    await expect(feedMessage(b.page, roomMessage)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(b.page.getByRole('button', { name: 'Back to conversations' })).toBeVisible();

    // ---- Hidden tab: a DM mention and a group mention each notify once, as a
    // mention only (never also as the Phase 4 ordinary DM/group notification).
    await setTabHidden(b.page, true);
    const dmText = `@${B.displayName} t18 dm mention ${randomUUID()}`;
    await send(a.page, directId, dmText, [B.userId]);
    notifications = await expectNotificationCount(b.page, 3);
    expect(notifications[2]).toEqual({
      title: mentionTitle('uma conversa direta'),
      body: dmText,
      tag: notificationTagOf(directId),
    });
    const groupText = `@${B.displayName} t18 group mention ${randomUUID()}`;
    await send(a.page, groupId, groupText, [B.userId]);
    notifications = await expectNotificationCount(b.page, 4);
    expect(notifications[3]).toEqual({ title: mentionTitle(groupName), body: groupText, tag: notificationTagOf(groupId) });
    await expectNoNewNotification(b.page, 4, 'a DM/group mention is announced once');

    // ---- B's own messages (one mentioning A, in the room B is viewing hidden): none for B.
    const ownText = `@${A.displayName} t18 own ${randomUUID()}`;
    const ownMessage = await send(b.page, roomId, ownText, [A.userId]);
    await send(b.page, directId, `t18 own dm ${randomUUID()}`);
    await expect(feedMessage(b.page, ownMessage)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expectNoNewNotification(b.page, 4, 'own messages are never announced');

    // ---- Toggle off: a room mention of B reaches B's (hidden) feed, unannounced.
    await setTabHidden(b.page, false);
    const toggle = notificationsToggle(b.page);
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('Ativar notificações');
    await setTabHidden(b.page, true);
    const offMessage = await send(a.page, roomId, `@${B.displayName} t18 toggle off ${randomUUID()}`, [B.userId]);
    await expect(feedMessage(b.page, offMessage)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expectNoNewNotification(b.page, 4, 'notifications turned off are not shown');
  });

  test('AC-026: a hidden tab that receives a room mention first stays silent while B\'s other tab views the room; with both tabs hidden exactly one tab announces it', async ({
    phase5World,
    openDevice,
  }) => {
    const { roomId } = phase5World.conversations;
    const { B } = phase5World.users;
    const b = await openDevice('B');
    const a = await openDevice('A');
    await prepareBrowser(b);
    const raceText = `@${B.displayName} t18 race ${randomUUID()}`;

    // Tab V: the Realtime frames of the message being raced are held until released.
    const viewer = b.page;
    const heldFrames: string[] = [];
    let heldText = raceText;
    let deliverToViewer: (frame: string) => void = () => undefined;
    await viewer.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
      const server = socket.connectToServer();
      deliverToViewer = (frame) => socket.send(frame);
      server.onMessage((frame) => {
        if (typeof frame === 'string' && frame.includes(heldText)) {
          heldFrames.push(frame);
          return;
        }
        socket.send(frame);
      });
    });
    await loadApp(viewer);
    await enableNotifications(viewer);
    await openConversation(viewer, roomId);

    // Tab H: hidden from its first script on.
    const hidden = await b.newTab();
    await hidden.addInitScript(startHidden);
    await loadApp(hidden);
    expect(await hidden.evaluate(() => document.visibilityState)).toBe('hidden');
    await expect(notificationsToggle(hidden)).toHaveAccessibleName('Notificações ativadas');
    const hiddenReads = countAuthorizationReads(hidden);
    const total = async () => [...(await notificationsOf(viewer)), ...(await notificationsOf(hidden))];

    // ---- H receives the mention first and finishes its decision; then V gets it.
    const raceMessage = await send(a.page, roomId, raceText, [B.userId]);
    await expect.poll(() => heldFrames.length, { timeout: NOTIFICATION_RECV_TIMEOUT_MS }).toBeGreaterThan(0);
    await expect
      .poll(() => hiddenReads.finished, { timeout: NOTIFICATION_RECV_TIMEOUT_MS, message: 'H authorized the mention first' })
      .toBe(1);
    await hidden.waitForTimeout(NOTIFICATION_QUIET_WINDOW_MS);
    expect(await total(), 'no tab announces a conversation another visible tab of B views').toEqual([]);
    heldFrames.splice(0).forEach((frame) => deliverToViewer(frame));
    await expect(feedMessage(viewer, raceMessage)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await viewer.waitForTimeout(NOTIFICATION_QUIET_WINDOW_MS);
    expect(await total(), 'still none after V received it').toEqual([]);

    // ---- Both tabs hidden: exactly one notification in the browser. Block C
    // fix F4: H receives the mention first and its authorization read fails
    // in transit; V (its copy held until then) authorizes and announces it.
    await setTabHidden(viewer, true);
    const bothHiddenText = `@${B.displayName} t18 both hidden ${randomUUID()}`;
    heldText = bothHiddenText;
    let hiddenFailedReads = 0;
    await hidden.route(isAuthorizationRead, async (route: Route) => {
      hiddenFailedReads += 1;
      await route.abort('failed');
    });
    await send(a.page, roomId, bothHiddenText, [B.userId]);
    await expect.poll(() => heldFrames.length, { timeout: NOTIFICATION_RECV_TIMEOUT_MS }).toBeGreaterThan(0);
    await expect
      .poll(() => hiddenFailedReads, { timeout: NOTIFICATION_RECV_TIMEOUT_MS, message: "H's authorization read failed" })
      .toBe(1);
    await hidden.waitForTimeout(1_000);
    expect(await total(), 'nothing announced while V has not received it').toEqual([]);
    heldFrames.splice(0).forEach((frame) => deliverToViewer(frame));
    await expect.poll(async () => (await total()).length, { timeout: NOTIFICATION_RECV_TIMEOUT_MS }).toBe(1);
    await viewer.waitForTimeout(NOTIFICATION_QUIET_WINDOW_MS);
    const expected = {
      title: `${phase5World.users.A.displayName} mencionou você em ${await conversationName(roomId)}`,
      body: bothHiddenText,
      tag: notificationTagOf(roomId),
    };
    expect(await total(), 'one notification across both hidden tabs').toEqual([expected]);
    expect(await notificationsOf(viewer), 'announced by V, whose read succeeded').toEqual([expected]);
    expect(hiddenFailedReads, 'H read once').toBe(1);
  });

  test('AC-049/AC-046: a held authorization is dropped when B\'s removal arrives or the browser switches account before display, and refused when the removal precedes it; an unchanged replay after B left announces nothing to B', async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { roomId, groupId, directId } = phase5World.conversations;
    const { B, C } = phase5World.users;
    const c = await openDevice('C');
    const cCookies: Cookie[] = (await c.context.cookies()).filter((cookie) => AUTH_COOKIE.test(cookie.name));
    expect(cCookies.length, "C's real session cookies").toBeGreaterThan(0);
    const b = await openDevice('B');
    const a = await openDevice('A');
    await prepareBrowser(b);
    const membershipDeletes = watchMembershipDeletes(b.page);
    await loadApp(b.page);
    await enableNotifications(b.page);
    await setTabHidden(b.page, true);
    for (const id of [roomId, groupId]) await expect(listItem(b.page, id)).toBeVisible({ timeout: STEP_TIMEOUT_MS });

    // Block C fix F1: B's list and roster reads, held (before the server) while `holdRefetches`.
    let holdRefetches = false;
    let refetchGate = deferred();
    const heldRefetches: number[] = [];
    await b.page.route(
      (url) => url.pathname === '/api/conversations/get' || url.pathname === '/api/conversations/members',
      async (route: Route) => {
        if (holdRefetches) {
          heldRefetches.push(Date.now());
          await refetchGate.promise;
        }
        await route.continue().catch(() => undefined);
      },
    );

    // B's authorization reads: answered at once, or held before/after the server answered.
    type Mode = 'pass' | 'hold-before-server' | 'hold-after-server';
    let mode: Mode = 'pass';
    let gate = deferred();
    const reads: Array<{ mode: Mode; status: number | null }> = [];
    await b.page.route(isAuthorizationRead, async (route: Route) => {
      const read = { mode, status: null as number | null };
      reads.push(read);
      const held = gate.promise;
      if (read.mode === 'hold-before-server') await held;
      const response = await route.fetch();
      read.status = response.status();
      if (read.mode === 'hold-after-server') await held;
      await route.fulfill({ response }).catch(() => undefined);
    });
    const holdRead = async (next: Mode, send: () => Promise<string>): Promise<{ messageId: string; read: { status: number | null } }> => {
      mode = next;
      gate = deferred();
      const before = reads.length;
      const messageId = await send();
      await expect.poll(() => reads.length, { timeout: NOTIFICATION_RECV_TIMEOUT_MS }).toBe(before + 1);
      const read = reads[before];
      if (next === 'hold-after-server') {
        await expect.poll(() => read.status, { timeout: STEP_TIMEOUT_MS, message: 'the server said "member"' }).toBe(200);
      }
      return { messageId, read };
    };
    const mention = (conversationId: string, label: string) => () =>
      send(a.page, conversationId, `@${B.displayName} t18 ${label} ${randomUUID()}`, [B.userId]);

    // ---- Control: held after the server answered and released unchanged → shown.
    await holdRead('hold-after-server', mention(roomId, 'held control'));
    await b.page.waitForTimeout(1_000);
    expect(await notificationsOf(b.page), 'nothing shown while held').toEqual([]);
    gate.resolve();
    await expectNotificationCount(b.page, 1);

    // ---- Held before the check runs, B removed from the group → the check refuses (403).
    const beforeCheck = await holdRead('hold-before-server', mention(groupId, 'removed before check'));
    expect(await membership.remove(groupId, 'B')).toBe(1);
    await expect(listItem(b.page, groupId), "B's app received the removal").toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    gate.resolve();
    await expect.poll(() => beforeCheck.read.status, { timeout: STEP_TIMEOUT_MS }).toBe(403);
    await expectNoNewNotification(b.page, 1, 'a check run after the removal refuses it');

    // ---- AC-046: a keyed room message mentioning B and C (B is notified while a member).
    mode = 'pass';
    const replayBody = {
      conversationId: roomId,
      content: `@${B.displayName} @${C.displayName} t18 replay ${randomUUID()}`,
      clientMessageId: randomUUID(),
      mentionIds: [B.userId, C.userId].sort(),
    };
    const first = await a.page.request.post('/api/messages/create', { data: replayBody });
    expect(first.status()).toBe(201);
    const replayed = ((await first.json()) as { message: { id: string } }).message.id;
    await expectNotificationCount(b.page, 2);

    // ---- The check returned "member", display held; B's removal from the room
    // arrives and the authorization is released before the list/roster
    // refetches it causes have landed (held) → dropped (block C fix F1).
    await holdRead('hold-after-server', mention(roomId, 'removed after check'));
    holdRefetches = true;
    refetchGate = deferred();
    const deletesBefore = membershipDeletes.length;
    expect(await membership.remove(roomId, 'B')).toBe(1);
    await expect
      .poll(() => membershipDeletes.length, { timeout: STEP_TIMEOUT_MS, message: "B's tab received the membership DELETE" })
      .toBeGreaterThan(deletesBefore);
    const deleteReceivedAt = membershipDeletes[deletesBefore];
    await expect
      .poll(() => heldRefetches.filter((at) => at >= deleteReceivedAt).length, {
        timeout: STEP_TIMEOUT_MS,
        message: 'the list refetch the removal caused is held',
      })
      .toBeGreaterThan(0);
    await expect(listItem(b.page, roomId), 'the cached list still shows the room').toHaveCount(1);
    gate.resolve();
    await expectNoNewNotification(b.page, 2, 'a removal received before display drops the notification');
    await expect(listItem(b.page, roomId), 'refetch still held during the decision').toHaveCount(1);
    holdRefetches = false;
    refetchGate.resolve();
    await expect(listItem(b.page, roomId), "B's app shows the removal").toHaveCount(0, { timeout: STEP_TIMEOUT_MS });

    // ---- AC-046: A's unchanged replay after B left returns the stored message and announces nothing to B.
    const replay = await a.page.request.post('/api/messages/create', { data: replayBody });
    expect(replay.status(), await replay.text()).toBe(200);
    expect(((await replay.json()) as { message: { id: string } }).message.id).toBe(replayed);
    expect(await storedMentions(replayed)).toEqual([B.userId, C.userId].sort());
    await expectNoNewNotification(b.page, 2, 'the replay announces nothing to the removed recipient');

    // ---- Final review #1: the read said "member", the claim waits on the
    // browser-wide notification lock. Control: released with B's session → shown once.
    const bCookies: Cookie[] = (await b.context.cookies()).filter((cookie) => AUTH_COOKIE.test(cookie.name));
    mode = 'pass';
    let releaseClaimLock = await holdNotificationClaimLock(b.page);
    let readsBefore = reads.length;
    await mention(directId, 'claim wait control')();
    await expect.poll(() => reads.length, { timeout: NOTIFICATION_RECV_TIMEOUT_MS }).toBe(readsBefore + 1);
    await expect.poll(() => pendingNotificationClaims(b.page), { timeout: STEP_TIMEOUT_MS, message: "B's claim waits on the lock" }).toBe(1);
    expect(await notificationsOf(b.page), 'nothing shown while the claim waits').toHaveLength(2);
    await releaseClaimLock();
    await expectNotificationCount(b.page, 3);

    // ---- Same wait, the browser switches to C's session meanwhile → dropped.
    // B's list/roster refetches are held for the whole switch, so the DM stays
    // listed and only the session check can drop it (r2 #2: a refetch under
    // C's cookies would return C's list and mask a reverted fix).
    releaseClaimLock = await holdNotificationClaimLock(b.page);
    readsBefore = reads.length;
    holdRefetches = true;
    refetchGate = deferred();
    await mention(directId, 'claim wait account switch')();
    await expect.poll(() => reads.length, { timeout: NOTIFICATION_RECV_TIMEOUT_MS }).toBe(readsBefore + 1);
    await expect.poll(() => pendingNotificationClaims(b.page), { timeout: STEP_TIMEOUT_MS, message: "B's claim waits on the lock" }).toBe(1);
    await b.page.route('**/api/presence/**', () => undefined);
    await switchAuthCookies(b.context, cCookies);
    await releaseClaimLock();
    await expectNoNewNotification(b.page, 3, 'an account switch while the claim waits drops the notification');
    await expect(listItem(b.page, directId), 'the DM stayed listed (refetches held)').toHaveCount(1);
    await switchAuthCookies(b.context, bCookies);
    holdRefetches = false;
    refetchGate.resolve();
    await b.page.unroute('**/api/presence/**');

    // ---- The check returned "member" for B, display held; the browser now holds C's session → dropped.
    await holdRead('hold-after-server', mention(directId, 'account switch'));
    // The stale tab's presence heartbeats are held (they would run under C's cookies).
    await b.page.route('**/api/presence/**', () => undefined);
    await switchAuthCookies(b.context, cCookies);
    gate.resolve();
    await expectNoNewNotification(b.page, 3, 'an account switch before display drops the notification');
    expect(reads.map((read) => [read.mode, read.status])).toEqual([
      ['hold-after-server', 200],
      ['hold-before-server', 403],
      ['pass', 200],
      ['hold-after-server', 200],
      ['pass', 200],
      ['pass', 200],
      ['hold-after-server', 200],
    ]);
  });
});

/**
 * When the page received each conversation_members DELETE on its Realtime
 * sockets (the list stream's removal signal; every subscriber gets every
 * DELETE). Start before the page navigates.
 */
function watchMembershipDeletes(page: Page): number[] {
  const receivedAt: number[] = [];
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string' && payload.includes('conversation_members') && payload.includes('"DELETE"')) {
        receivedAt.push(Date.now());
      }
    });
  });
  return receivedAt;
}

/** Another tab completed a sign-in as C through a server response: the cookies are C's; no tab is told. */
async function switchAuthCookies(context: BrowserContext, cookies: Cookie[]): Promise<void> {
  await context.clearCookies({ name: AUTH_COOKIE });
  await context.addCookies(cookies);
}

/** The app's browser-wide notification claim lock (desktop-notifications.ts). */
const NOTIFICATION_CLAIM_LOCK = 'vo:messaging:notification-claim';

/** Holds the claim lock from the page itself until the returned release runs. */
async function holdNotificationClaimLock(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(
    (name) =>
      new Promise<void>((acquired) => {
        void navigator.locks.request(name, () =>
          new Promise<void>((release) => {
            (window as unknown as { __releaseClaimLock?: () => void }).__releaseClaimLock = release;
            acquired();
          }),
        );
      }),
    NOTIFICATION_CLAIM_LOCK,
  );
  return async () => {
    await page.evaluate(() => (window as unknown as { __releaseClaimLock?: () => void }).__releaseClaimLock?.());
  };
}

/** Claims waiting on the notification lock in this browser. */
async function pendingNotificationClaims(page: Page): Promise<number> {
  return page.evaluate(
    async (name) => ((await navigator.locks.query()).pending ?? []).filter((lock) => lock.name === name).length,
    NOTIFICATION_CLAIM_LOCK,
  );
}
