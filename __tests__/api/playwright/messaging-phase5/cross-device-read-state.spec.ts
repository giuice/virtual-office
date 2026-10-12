import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5';
import { markReadAsSeededMember } from '../fixtures/messaging';
import { backToConversationList, openDrawer, readListUnreadCount, scrollFeedToTopStepwise, setTabHidden } from '../helpers/drawer-helpers';
import { withLocalMessagingDb } from '../helpers/messaging-local-db';
import {
  STEP_TIMEOUT_MS,
  createViaApi,
  openConversation,
  readArrivals,
  sendFromComposer,
  storedWithTexts,
  watchArrivals,
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T16 — live cross-device unread, read state and own messages while
 * connectivity and Realtime are healthy (FR-021, FR-022; AC-021, AC-022).
 *
 * Real accounts A, B, C, the real app, local Supabase and its Realtime; A is
 * signed in on two devices (two browser contexts, two Supabase sessions —
 * T24 `openDevice`). Nothing is faulted: every update must arrive through the
 * live streams within 5 s, without a reload, a focus change, a reconnect or
 * polling. Per-device state (stream health, polling) is per tab, so every
 * check names the page it reads.
 *
 * A's partial read on device 1 is the request its feed sends for the
 * messages it saw (PATCH /api/conversations/read with their ids, under
 * device 1's session); the rest is read by opening the conversation on
 * device 1. C's read in the receipt test goes through the seed route (same
 * read RPC as the route).
 */

const LIVE_WITHIN_MS = 5_000;
/** Long enough for a read the open feed was going to report to go out (batch 300 ms + spacing 1 s). */
const QUIET_WINDOW_MS = 3_000;

const readBy = (page: Page, messageId: string) => page.getByTestId(`read-by-${messageId}`);
const readersList = (page: Page, messageId: string) => page.getByTestId(`readers-list-${messageId}`);
const readerItems = (page: Page, messageId: string) => readersList(page, messageId).locator('[data-testid^="reader-item-"]');

interface PageWatch {
  /** Requests that only a degraded tab makes (T14 polling marks them `source=poll`). */
  polls: string[];
  /** Realtime sockets opened after the watch started (a reconnect opens a new one). */
  sockets: string[];
  /** PATCH /api/conversations/read requests, with their body. */
  reads: Array<{ at: number; body: string }>;
}

/** Watches one page for polling, new Realtime sockets and read requests, and marks it to detect a reload. */
async function watchPage(page: Page): Promise<PageWatch> {
  const watch: PageWatch = { polls: [], sockets: [], reads: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.searchParams.get('source') === 'poll') watch.polls.push(url.pathname);
    if (url.pathname === '/api/conversations/read' && request.method() === 'PATCH') {
      watch.reads.push({ at: Date.now(), body: request.postData() ?? '' });
    }
  });
  page.on('websocket', (socket) => {
    if (socket.url().includes('/realtime/')) watch.sockets.push(new URL(socket.url()).pathname);
  });
  await page.evaluate(() => {
    (window as unknown as { __t16NoReload?: boolean }).__t16NoReload = true;
  });
  return watch;
}

/** Healthy-path guarantees for one page: no reload, no reconnect, no polling. */
async function expectHealthyPath(page: Page, watch: PageWatch, label: string): Promise<void> {
  expect(
    await page.evaluate(() => (window as unknown as { __t16NoReload?: boolean }).__t16NoReload === true),
    `${label}: no reload`,
  ).toBe(true);
  expect(watch.sockets, `${label}: no new Realtime socket (no reconnect)`).toEqual([]);
  expect(watch.polls, `${label}: no polling while healthy`).toEqual([]);
}

/**
 * Records, in the page, every change of the conversation row's unread badge
 * (0 when the row shows none) with the page's time — the same machine clock
 * as the test.
 */
async function watchUnreadBadge(page: Page, conversationId: string): Promise<void> {
  await page.evaluate((id) => {
    const log: Array<{ at: number; count: number | null }> = [];
    let last: number | null | undefined;
    const read = () => {
      const row = document.querySelector(`[data-testid="conversation-item-${id}"]`);
      const badge = row?.querySelector(`[data-testid="conversation-unread-badge-${id}"]`);
      const count = row ? Number.parseInt((badge?.textContent ?? '0').trim(), 10) || 0 : null;
      if (count === last) return;
      last = count;
      log.push({ at: Date.now(), count });
    };
    (window as unknown as { __t16Badge?: typeof log }).__t16Badge = log;
    read();
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, conversationId);
}

/** When the page's badge first showed `count` at or after `since`; fails after the live deadline plus slack. */
async function badgeReachedAt(page: Page, count: number, since: number, message: string): Promise<number> {
  let at = -1;
  await expect
    .poll(
      async () => {
        const log = await page.evaluate(
          () => (window as unknown as { __t16Badge: Array<{ at: number; count: number | null }> }).__t16Badge,
        );
        const current = log[log.length - 1];
        if (current?.count !== count) return false;
        at = Math.max(since, current.at);
        return true;
      },
      { timeout: LIVE_WITHIN_MS + 5_000, message },
    )
    .toBe(true);
  return at;
}

/** A's own unread count of the conversation as the server computes it. */
async function serverUnread(page: Page, conversationId: string): Promise<number> {
  const response = await page.request.get('/api/conversations/get?includeArchived=true');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { conversations?: Array<{ id: string; unreadCount?: number }> };
  return body.conversations?.find((conversation) => conversation.id === conversationId)?.unreadCount ?? 0;
}

/** The stored readers of a message (non-sender receipts), most recent first. */
async function storedReaders(messageId: string): Promise<Array<{ userId: string; readAt: number }>> {
  return withLocalMessagingDb(async (db) => {
    const result = await db.query<{ user_id: string; read_at: Date }>(
      `select r.user_id::text as user_id, r.read_at
         from public.message_read_receipts r
         join public.messages m on m.id = r.message_id
        where r.message_id = $1 and r.user_id <> m.sender_id
        order by r.read_at desc, r.user_id`,
      [messageId],
    );
    return result.rows.map((row) => ({ userId: row.user_id, readAt: row.read_at.getTime() }));
  });
}

/** The reader rows an open reader list shows: user id and read time (ms). */
async function shownReaders(page: Page, messageId: string): Promise<Array<{ userId: string; readAt: number }>> {
  return readerItems(page, messageId).evaluateAll((rows) =>
    rows.map((row) => ({
      userId: (row.getAttribute('data-testid') ?? '').replace('reader-item-', ''),
      readAt: Date.parse(row.querySelector('[data-testid="reader-read-at"]')?.getAttribute('datetime') ?? ''),
    })),
  );
}

/** Readers equal (same users, same order, read times equal to the millisecond the browser keeps). */
function sameReaders(
  shown: ReadonlyArray<{ userId: string; readAt: number }>,
  stored: ReadonlyArray<{ userId: string; readAt: number }>,
): boolean {
  return (
    shown.length === stored.length &&
    shown.every((reader, index) => reader.userId === stored[index].userId && Math.abs(reader.readAt - stored[index].readAt) < 1)
  );
}

/** Opens the drawer on the conversation list and waits for the conversation's row. */
async function openList(device: Phase5Device, conversationId: string): Promise<void> {
  if (!device.page.url().includes('/floor-plan')) await device.page.goto('/floor-plan');
  await openDrawer(device.page);
  await expect(device.page.locator(`[data-testid="conversation-item-${conversationId}"]`)).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
}

test.describe('Phase 5 T16 — live cross-device read state and own messages', () => {
  test('AC-021: a partial, then full read on device 1 reaches A\'s other devices (unread badge, open feed) within 5 s', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const b = await openDevice('B');
    const a1 = await openDevice('A');
    const a2 = await openDevice('A');

    // Nothing unread for A in X before the six (seeded history marked read).
    const reset = await a1.page.request.patch('/api/conversations/read', { data: { conversationId: directId } });
    expect(reset.status(), await reset.text()).toBe(200);

    const tag = randomUUID().slice(0, 8);
    const ids: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      ids.push(await createViaApi(b.page, { conversationId: directId, content: `t16 unread ${index} ${tag}`, clientMessageId: randomUUID() }));
    }
    expect(await serverUnread(a1.page, directId)).toBe(6);

    // Device 1 and device 2 show the list; device 2 also keeps X open in a
    // hidden tab (open feed, nothing seen there).
    await openList(a1, directId);
    // Device 2's timeline (diagnostics for the annotations): receipt
    // INSERT frames on its Realtime socket and its list requests. The page is
    // reloaded once here, before any watch, so its socket is observed.
    const a2Timeline = { receiptFrames: [] as number[], listGets: [] as Array<{ start: number; end?: number }> };
    a2.page.on('websocket', (socket) => {
      if (!socket.url().includes('/realtime/')) return;
      socket.on('framereceived', (frame) => {
        const payload = typeof frame.payload === 'string' ? frame.payload : '';
        if (payload.includes('"message_read_receipts"') && payload.includes('"INSERT"')) a2Timeline.receiptFrames.push(Date.now());
      });
    });
    a2.page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/conversations/get') {
        a2Timeline.listGets.push({ start: Date.now() });
      }
    });
    a2.page.on('response', (response) => {
      if (response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/conversations/get') {
        const open = a2Timeline.listGets.find((entry) => entry.end === undefined);
        if (open) open.end = Date.now();
      }
    });
    const timelineSince = (since: number) => JSON.stringify({
      receiptFramesMs: a2Timeline.receiptFrames.filter((at) => at >= since).map((at) => at - since),
      listGetsMs: a2Timeline.listGets.filter((entry) => entry.start >= since).map((entry) => [entry.start - since, entry.end === undefined ? null : entry.end - since]),
    });
    if (!a2.page.url().includes('/floor-plan')) await a2.page.goto('/floor-plan');
    await a2.page.reload();
    await openList(a2, directId);
    // A third device keeps X open in a hidden tab (an open feed where nothing
    // is seen). Not a tab of device 2: a list-view tab adopts the active
    // conversation another tab of the same browser stored (pre-existing
    // drawer restore, T20), which would take device 2's list away.
    const a3 = await openDevice('A');
    const a3Feed = a3.page;
    if (!a3Feed.url().includes('/floor-plan')) await a3Feed.goto('/floor-plan');
    await setTabHidden(a3Feed, true);
    await openConversation(a3Feed, directId);
    await expect(a3Feed.getByTestId(`message-${ids[5]}`)).toBeAttached({ timeout: STEP_TIMEOUT_MS });

    await expect.poll(() => readListUnreadCount(a1.page, directId), { timeout: STEP_TIMEOUT_MS }).toBe(6);
    await expect.poll(() => readListUnreadCount(a2.page, directId), { timeout: STEP_TIMEOUT_MS }).toBe(6);
    // Let the initial joins and catch-up refetches settle before watching.
    await a2.page.waitForTimeout(1_000);
    const a1Watch = await watchPage(a1.page);
    const a3FeedWatch = await watchPage(a3Feed);
    const watches = new Map<Page, PageWatch>([
      [a1.page, a1Watch],
      [a2.page, await watchPage(a2.page)],
      [a3Feed, a3FeedWatch],
    ]);
    await watchUnreadBadge(a2.page, directId);

    // ---- Device 1 reads only the first three.
    // Measured from the moment the read request leaves device 1.
    const partialAt = Date.now();
    const partial = await a1.page.request.patch('/api/conversations/read', {
      data: { conversationId: directId, messageIds: ids.slice(0, 3) },
    });
    expect(partial.status(), await partial.text()).toBe(200);
    expect(((await partial.json()) as { recorded: number }).recorded).toBe(3);
    const threeAt = await badgeReachedAt(a2.page, 3, partialAt, 'device 2 shows 3 unread for X');
    const partialDelay = threeAt - partialAt;
    test.info().annotations.push({ type: 't16-partial-read-ms', description: `${partialDelay} ${timelineSince(partialAt)}` });
    expect(partialDelay, 'device 2 shows 3 unread within 5 s').toBeLessThanOrEqual(LIVE_WITHIN_MS);
    expect(await serverUnread(a2.page, directId)).toBe(3);

    // ---- Device 1 opens X and scrolls through it: the remaining three are
    // seen and read (in one or more batches).
    await openConversation(a1.page, directId);
    await expect(a1.page.getByTestId(`message-${ids[5]}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await scrollFeedToTopStepwise(a1.page);
    await expect.poll(() => serverUnread(a1.page, directId), { timeout: STEP_TIMEOUT_MS }).toBe(0);
    // The read requests have answered (the last one recorded the last receipt).
    await expect.poll(() => a1Watch.reads.length, { timeout: STEP_TIMEOUT_MS }).toBeGreaterThan(0);
    const fullAt = Math.max(...a1Watch.reads.map((read) => read.at));
    const zeroAt = await badgeReachedAt(a2.page, 0, fullAt, 'device 2 shows 0 unread for X');
    const fullDelay = zeroAt - fullAt;
    test.info().annotations.push({ type: 't16-full-read-ms', description: `${fullDelay} ${timelineSince(fullAt)}` });
    expect(fullDelay, 'device 2 shows 0 unread within 5 s').toBeLessThanOrEqual(LIVE_WITHIN_MS);
    // Device 1 reported only the three it had not read (the first three, and
    // the seeded history, were read already).
    const restIds = a1Watch.reads.flatMap((read) => ((JSON.parse(read.body) as { messageIds?: string[] }).messageIds ?? []));
    expect([...new Set(restIds)].sort(), 'device 1 read the rest').toEqual(ids.slice(3).sort());

    // ---- The open feed on A's third device holds the read state: shown
    // again (5 s after the read), it reports nothing — in a direct
    // conversation a message the viewer has read needs no receipt.
    await a3Feed.waitForTimeout(LIVE_WITHIN_MS - Math.min(LIVE_WITHIN_MS, Date.now() - fullAt));
    await setTabHidden(a3Feed, false);
    await a3Feed.waitForTimeout(QUIET_WINDOW_MS);
    expect(a3FeedWatch.reads, 'the other device\'s open feed already knows all six are read').toEqual([]);
    expect(await readListUnreadCount(a2.page, directId)).toBe(0);

    for (const [page, watch] of watches) await expectHealthyPath(page, watch, page === a1.page ? 'A#1' : page === a2.page ? 'A#2' : 'A#3 feed');
  });

  test('AC-021: receipts of A\'s messages ("Lida por N" and the open reader list) match the stored receipts on both of A\'s devices within 5 s', async ({
    phase5World,
    openDevice,
  }) => {
    const { groupId } = phase5World.conversations;
    const { B, C } = phase5World.users;
    const b = await openDevice('B');
    const a1 = await openDevice('A');
    const a2 = await openDevice('A');
    await openConversation(a1.page, groupId);
    await openConversation(a2.page, groupId);

    const tag = randomUUID().slice(0, 8);
    const first = await createViaApi(a1.page, { conversationId: groupId, content: `t16 receipt 1 ${tag}`, clientMessageId: randomUUID() });
    const second = await createViaApi(a1.page, { conversationId: groupId, content: `t16 receipt 2 ${tag}`, clientMessageId: randomUUID() });
    for (const device of [a1, a2]) {
      await expect(device.page.getByTestId(`message-${second}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await expect(readBy(device.page, first)).toHaveCount(0);
    }
    await a2.page.waitForTimeout(1_000);
    const watches = new Map<Page, PageWatch>([
      [a1.page, await watchPage(a1.page)],
      [a2.page, await watchPage(a2.page)],
    ]);

    // ---- B reads both (B's own session, the real route).
    const bRead = await b.page.request.patch('/api/conversations/read', {
      data: { conversationId: groupId, messageIds: [first, second] },
    });
    expect(bRead.status(), await bRead.text()).toBe(200);
    const bReadAt = Date.now();
    for (const device of [a1, a2]) {
      await expect(readBy(device.page, first)).toHaveText('Lida por 1', { timeout: LIVE_WITHIN_MS });
      await expect(readBy(device.page, second)).toHaveText('Lida por 1', { timeout: LIVE_WITHIN_MS });
    }
    const bDelay = Date.now() - bReadAt;
    test.info().annotations.push({ type: 't16-receipt-summary-ms', description: String(bDelay) });
    expect(bDelay, '"Lida por 1" on both devices within 5 s').toBeLessThanOrEqual(LIVE_WITHIN_MS);

    // Both devices open the reader list of the first message: it is B's stored receipt.
    for (const device of [a1, a2]) {
      await readBy(device.page, first).click();
      await expect(readersList(device.page, first)).toBeVisible();
      await expect(readerItems(device.page, first)).toHaveCount(1, { timeout: STEP_TIMEOUT_MS });
    }
    let stored = await storedReaders(first);
    expect(stored.map((reader) => reader.userId)).toEqual([B.userId]);
    for (const device of [a1, a2]) {
      expect(sameReaders(await shownReaders(device.page, first), stored), `${device.label} reader list = stored receipts`).toBe(true);
    }

    // ---- C reads the first one while both lists are open.
    expect(await markReadAsSeededMember(a1.page.request, { conversationId: groupId, userId: C.userId, messageIds: [first] })).toBe(1);
    const cReadAt = Date.now();
    stored = await storedReaders(first);
    expect(stored.map((reader) => reader.userId)).toEqual([C.userId, B.userId]);
    for (const device of [a1, a2]) {
      await expect
        .poll(async () => sameReaders(await shownReaders(device.page, first), stored), {
          timeout: LIVE_WITHIN_MS,
          message: `${device.label} open reader list = stored receipts (C, then B)`,
        })
        .toBe(true);
      await expect(readBy(device.page, first)).toHaveText('Lida por 2', { timeout: LIVE_WITHIN_MS });
      await expect(readersList(device.page, first)).toContainText('Lida por 2');
    }
    const cDelay = Date.now() - cReadAt;
    test.info().annotations.push({ type: 't16-receipt-details-ms', description: String(cDelay) });
    expect(cDelay, 'open reader lists and summaries on both devices within 5 s').toBeLessThanOrEqual(LIVE_WITHIN_MS);
    // The second message keeps its own stored count.
    expect((await storedReaders(second)).length).toBe(1);
    for (const device of [a1, a2]) await expect(readBy(device.page, second)).toHaveText('Lida por 1');

    for (const [page, watch] of watches) await expectHealthyPath(page, watch, page === a1.page ? 'A#1' : 'A#2');
  });

  test('AC-022: a message A sends on device 1 appears once on device 2 within 5 s, without reload', async ({
    phase5World,
    openDevice,
  }) => {
    const { groupId } = phase5World.conversations;
    const a1 = await openDevice('A');
    const a2 = await openDevice('A');
    await openConversation(a1.page, groupId);
    await openConversation(a2.page, groupId);
    // Device 2 also has the list in a second tab: A's own message is never unread there.
    const a2List = await a2.newTab();
    await a2List.goto('/floor-plan');
    await openDrawer(a2List);
    await expect(a2List.locator(`[data-testid="conversation-item-${groupId}"]`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const unreadBefore = await readListUnreadCount(a2List, groupId);

    const tag = randomUUID().slice(0, 8);
    const texts = [`t16 own 1 ${tag}`, `t16 own 2 ${tag}`];
    for (const page of [a1.page, a2.page]) await watchArrivals(page, texts);
    await a2.page.waitForTimeout(1_000);
    const watches = new Map<Page, PageWatch>([
      [a1.page, await watchPage(a1.page)],
      [a2.page, await watchPage(a2.page)],
      [a2List, await watchPage(a2List)],
    ]);

    // Server confirmation time of each create of device 1 (separates the
    // create's own latency from the cross-device delivery).
    const created: Array<{ at: number; text: string }> = [];
    a1.page.on('response', (response) => {
      if (!response.url().includes('/api/messages/create') || response.request().method() !== 'POST') return;
      const body = response.request().postData() ?? '';
      const text = texts.find((candidate) => body.includes(candidate));
      if (text && response.status() === 201) created.push({ at: Date.now(), text });
    });
    const sentAt: number[] = [];
    for (const text of texts) {
      sentAt.push(Date.now());
      await sendFromComposer(a1.page, text);
      await expect(a2.page.getByTestId('messages-feed')).toContainText(text, { timeout: LIVE_WITHIN_MS + 5_000 });
    }
    await a2.page.waitForTimeout(QUIET_WINDOW_MS);

    const stored = await storedWithTexts(groupId, texts);
    expect(stored.map((row) => row.content), 'each stored once').toEqual(texts);
    const a2Arrivals = await readArrivals(a2.page);
    const a1Arrivals = await readArrivals(a1.page);
    texts.forEach((text, index) => {
      const delay = a2Arrivals.first[text] - sentAt[index];
      const confirmedAt = created.find((entry) => entry.text === text)?.at;
      test.info().annotations.push({
        type: `t16-own-message-${index + 1}-ms`,
        description: `send→device 2 ${delay}; send→201 ${confirmedAt === undefined ? 'n/a' : confirmedAt - sentAt[index]}`,
      });
      expect(delay, `"${text}" on device 2 within 5 s`).toBeLessThanOrEqual(LIVE_WITHIN_MS);
      expect(a2Arrivals.max[text], `"${text}" shown once on device 2`).toBe(1);
      expect(a1Arrivals.max[text], `"${text}" shown once on device 1`).toBe(1);
    });
    for (const row of stored) {
      await expect(a2.page.getByTestId(`message-${row.id}`)).toHaveCount(1);
    }
    // No pending copy on device 2 (pending copies are per device).
    await expect(a2.page.locator('[data-testid^="message-temp-"]')).toHaveCount(0);
    expect(await readListUnreadCount(a2List, groupId), 'own messages are not unread on device 2').toBe(unreadBefore);

    for (const [page, watch] of watches) await expectHealthyPath(page, watch, page === a1.page ? 'A#1' : page === a2.page ? 'A#2' : 'A#2 list tab');
    await backToConversationList(a2.page, groupId);
  });

  test('FR-021 (block B fix F7): C reads while the reader list\'s first fetch is in flight — that fetch\'s older answer does not stand; the open list shows the stored receipts within 5 s', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const { groupId } = phase5World.conversations;
    const { B, C } = phase5World.users;
    const a = await openDevice('A');
    await openConversation(a.page, groupId);
    const messageId = await createViaApi(a.page, {
      conversationId: groupId,
      content: `f7 reader list ${randomUUID().slice(0, 8)}`,
      clientMessageId: randomUUID(),
    });
    await expect(a.page.getByTestId(`message-${messageId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    expect(await markReadAsSeededMember(a.page.request, { conversationId: groupId, userId: B.userId, messageIds: [messageId] })).toBe(1);
    await expect(readBy(a.page, messageId)).toHaveText('Lida por 1', { timeout: LIVE_WITHIN_MS });

    // The reader list's first fetch reads the server at once (B only); its answer is held in the browser.
    const readersPath = `/api/messages/${messageId}/readers`;
    let held: { fulfill: () => Promise<void> } | null = null;
    let readerFetches = 0;
    await a.page.route(
      (url) => url.pathname === readersPath,
      async (route) => {
        readerFetches += 1;
        if (held) {
          await route.fallback();
          return;
        }
        const response = await route.fetch();
        const body = await response.text();
        held = { fulfill: () => route.fulfill({ response, body }) };
      },
    );
    await readBy(a.page, messageId).click();
    await expect.poll(() => held !== null, { timeout: STEP_TIMEOUT_MS }).toBe(true);

    // C reads while that fetch is in flight; the receipt reaches A's open feed live.
    expect(await markReadAsSeededMember(a.page.request, { conversationId: groupId, userId: C.userId, messageIds: [messageId] })).toBe(1);
    const stored = await storedReaders(messageId);
    expect(stored.map((reader) => reader.userId)).toEqual([C.userId, B.userId]);
    await expect(readBy(a.page, messageId)).toHaveText('Lida por 2', { timeout: LIVE_WITHIN_MS });

    // The older answer (B only) lands; the open list still catches up to C, then B.
    const releasedAt = Date.now();
    await (held as unknown as { fulfill: () => Promise<void> }).fulfill();
    await expect
      .poll(async () => sameReaders(await shownReaders(a.page, messageId), stored), {
        timeout: LIVE_WITHIN_MS,
        message: 'open reader list = stored receipts (C, then B)',
      })
      .toBe(true);
    testInfo.annotations.push({
      type: 'f7-reader-list-catch-up-ms',
      description: JSON.stringify({ afterReleaseMs: Date.now() - releasedAt, readerFetches }),
    });
    expect(readerFetches, 'the list refetched after its first fetch settled').toBeGreaterThanOrEqual(2);
  });
});
