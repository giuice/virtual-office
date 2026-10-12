import { randomUUID } from 'node:crypto';

import type { Page, Route } from '@playwright/test';

import { test, expect } from '../fixtures/messaging-phase5-faults';
import { markReadAsSeededMember } from '../fixtures/messaging';
import { backToConversationList, openDrawer, readListUnreadCount, setTabHidden } from '../helpers/drawer-helpers';
import { withLocalMessagingDb } from '../helpers/messaging-local-db';
import {
  STEP_TIMEOUT_MS,
  createViaApi,
  openConversation,
  readArrivals,
  watchArrivals,
} from '../helpers/messaging-outbox-e2e';
import type { MessagingRealtimeStream, RealtimeFaultController } from '../helpers/realtime-stream-faults';

/**
 * Phase 5 T14 — polling fallback during Realtime outages (FR-016, BR-012;
 * AC-016; the reaction, receipt, attachment and history-page clauses of
 * AC-048).
 *
 * Real accounts A, B (C's reads go through the seed route, which calls the
 * same read RPC as PATCH /api/conversations/read), the real app, local
 * Supabase and its Realtime. Faults are network shaping only (SPEC §15, PLAN
 * D4): the T25/T13 harness drops A's whole Realtime connection (HTTP keeps
 * working) or makes one stream fail on the live socket; the tab is hidden the
 * way a browser reports it (visibilityState + visibilitychange); one poll
 * response is held in transit. Polls are counted by URL in A's browser: the
 * fallback marks its feed and list requests `source=poll`; an open reader
 * list refetches its own URL.
 */

const POLL_AFTER_UNHEALTHY_MS = 30_000;
const POLL_INTERVAL_MS = 15_000;
/** Block B fix F6: a polling round's requests are abandoned this long after it starts. */
const POLL_ROUND_DEADLINE_MS = 10_000;
/** Request and render time allowed on top of a polling deadline. */
const REQUEST_SLACK_MS = 2_500;
/** A pending join's own timer (10 s) plus the longest application backoff, with margin. */
const RECOVERY_TIMEOUT_MS = 30_000;
const REACTION = '👍';

interface PollRequest {
  kind: 'feed' | 'list' | 'readers';
  at: number;
  /** feed: the round's first request (newest page, no cursor). */
  roundStart: boolean;
  url: string;
}

/** Records A's polling requests (and every reader-list fetch) as the browser issues them. */
function recordPolls(page: Page): PollRequest[] {
  const requests: PollRequest[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    const url = new URL(request.url());
    const isPoll = url.searchParams.get('source') === 'poll';
    const at = Date.now();
    if (url.pathname === '/api/messages/get' && isPoll) {
      requests.push({ kind: 'feed', at, roundStart: !url.searchParams.has('cursorBefore'), url: url.href });
    } else if (url.pathname === '/api/conversations/get' && isPoll) {
      requests.push({ kind: 'list', at, roundStart: true, url: url.href });
    } else if (/^\/api\/messages\/[^/]+\/readers$/.test(url.pathname)) {
      requests.push({ kind: 'readers', at, roundStart: true, url: url.href });
    }
  });
  return requests;
}

const pollsOf = (requests: readonly PollRequest[], kind: PollRequest['kind'], since = 0) =>
  requests.filter((request) => request.kind === kind && request.roundStart && request.at >= since);

/** Gaps between consecutive round starts. */
const gaps = (requests: readonly PollRequest[]) => requests.slice(1).map((request, index) => request.at - requests[index].at);

/** The earliest failure status of the required streams since `mark` (when A's tab became unhealthy). */
async function unhealthyFrom(harness: RealtimeFaultController, streams: readonly MessagingRealtimeStream[], mark: number): Promise<number> {
  await harness.settle();
  const firsts = streams
    .map((stream) => harness.statuses(stream, { since: mark }).find((record) => record.status !== 'SUBSCRIBED')?.at)
    .filter((at): at is number => typeof at === 'number');
  expect(firsts.length, 'a required stream reported its failure').toBeGreaterThan(0);
  return Math.min(...firsts);
}

/** A's own unread count of the conversation as the server computes it. */
async function serverUnread(page: Page, conversationId: string): Promise<number> {
  const response = await page.request.get('/api/conversations/get?includeArchived=true');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { conversations?: Array<{ id: string; unreadCount?: number }> };
  return body.conversations?.find((conversation) => conversation.id === conversationId)?.unreadCount ?? 0;
}

/** Every stored message id of the conversation, oldest first. */
async function storedIds(conversationId: string): Promise<string[]> {
  return withLocalMessagingDb(async (db) => {
    const result = await db.query<{ id: string }>(
      'select id::text as id from public.messages where conversation_id = $1 order by "timestamp", id',
      [conversationId],
    );
    return result.rows.map((row) => row.id);
  });
}

async function sendFile(page: Page, conversationId: string, name: string): Promise<string> {
  const upload = await page.request.post('/api/messages/upload', {
    multipart: {
      file: { name, mimeType: 'text/plain', buffer: Buffer.from(`conteúdo de ${name}`) },
      conversationId,
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const { attachment } = (await upload.json()) as { attachment: { id: string } };
  return createViaApi(page, { conversationId, attachmentIds: [attachment.id] });
}

const readBy = (page: Page, messageId: string) => page.getByTestId(`read-by-${messageId}`);

interface StateCheck {
  selector: string;
  /** Text the single matching element must contain. */
  text?: string;
}

/**
 * Records, in the page, every moment one of `checks` does not hold (its
 * selector must match exactly one element, containing `text` when given) — a
 * newer state lost even briefly, a page of history gone, or a duplicated bubble.
 */
async function watchFeedState(page: Page, checks: readonly StateCheck[]): Promise<void> {
  await page.evaluate((tracked: StateCheck[]) => {
    const violations: Array<{ at: number; selector: string; count: number; text: string | null }> = [];
    const evaluate = () => {
      for (const check of tracked) {
        const elements = document.querySelectorAll(check.selector);
        const text = elements[0]?.textContent ?? null;
        if (elements.length !== 1 || (check.text !== undefined && !(text ?? '').includes(check.text))) {
          violations.push({ at: Date.now(), selector: check.selector, count: elements.length, text });
        }
      }
    };
    (window as unknown as { __t14Violations?: typeof violations }).__t14Violations = violations;
    evaluate();
    new MutationObserver(evaluate).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  }, [...checks]);
}

const readFeedViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __t14Violations: unknown[] }).__t14Violations);

test.describe('Phase 5 T14 — polling fallback during Realtime outages', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-016: Realtime blocked, HTTP working — polls start after 30 s every 15 s; B\'s messages once; partial reads by C reach the receipt summaries and the open reader list; list unread counts follow the server', async ({
    phase5World,
    openDevice,
    realtimeFaults,
    request,
  }, testInfo) => {
    const { groupId, directId } = phase5World.conversations;
    const { B, C } = phase5World.users;
    const b = await openDevice('B');
    const a = await openDevice('A');
    // A's own earlier messages; B has read the first before the outage.
    const own: string[] = [];
    for (let index = 1; index <= 3; index += 1) {
      own.push(await createViaApi(a.page, { conversationId: groupId, content: `t14 A earlier ${index} ${randomUUID()}` }));
    }
    const [m1, m2, m3] = own;
    expect(await markReadAsSeededMember(request, { conversationId: groupId, userId: B.userId, messageIds: [m1] })).toBe(1);

    const harness = await realtimeFaults.attach(a);
    const polls = recordPolls(a.page);
    await openConversation(a.page, groupId);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    await expect(readBy(a.page, m1)).toHaveText('Lida por 1', { timeout: STEP_TIMEOUT_MS });
    // The reader list of m1 stays open through the outage.
    await readBy(a.page, m1).click();
    const readers = a.page.getByTestId(`readers-list-${m1}`);
    await expect(readers.getByTestId(`reader-item-${B.userId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const texts = [`t14 at outage start ${randomUUID()}`, `t14 after polling started ${randomUUID()}`];
    await watchArrivals(a.page, texts);
    const directUnreadBefore = await serverUnread(a.page, directId);

    // ---- Realtime is blocked (every socket closed, reconnects refused); HTTP works.
    const dropAt = Date.now();
    const dropMark = await harness.dropConnection();
    await harness.waitForStatus('messages', 'CHANNEL_ERROR', { since: dropMark, timeout: 10_000 });
    const unhealthyAt = await unhealthyFrom(harness, ['messages', 'list'], dropMark);
    const xId = await createViaApi(b.page, { conversationId: groupId, content: texts[0] });
    // Seen within 45 s of the outage start (first poll after 30 s unhealthy).
    await expect(a.page.getByTestId(`message-${xId}`)).toBeVisible({ timeout: 45_000 - (Date.now() - dropAt) });
    const xShownAfterMs = Date.now() - dropAt;
    expect(xShownAfterMs, 'B\'s outage-start message within 45 s').toBeLessThanOrEqual(45_000);
    const firstRound = pollsOf(polls, 'feed')[0];
    expect(firstRound, 'a feed poll ran').toBeDefined();
    expect(polls.filter((poll) => poll.kind !== 'readers' && poll.at < unhealthyAt + POLL_AFTER_UNHEALTHY_MS - 1_000), 'no poll before 30 s unhealthy').toEqual([]);
    expect(firstRound.at - unhealthyAt, 'first poll shortly after 30 s unhealthy').toBeLessThanOrEqual(POLL_AFTER_UNHEALTHY_MS + 3_000);
    expect(pollsOf(polls, 'list').length, 'the list is polled with the feed').toBeGreaterThan(0);

    // ---- While polling: C reads part of A's earlier messages (m1, m2, not m3); B sends again.
    const readAt = Date.now();
    expect(await markReadAsSeededMember(request, { conversationId: groupId, userId: C.userId, messageIds: [m1, m2] })).toBe(2);
    const yId = await createViaApi(b.page, { conversationId: groupId, content: texts[1] });
    const ySentAt = Date.now();
    await createViaApi(b.page, { conversationId: directId, content: `t14 dm during outage ${randomUUID()}` });
    const pollDeadline = POLL_INTERVAL_MS + REQUEST_SLACK_MS;
    await expect(a.page.getByTestId(`message-${yId}`)).toBeVisible({ timeout: pollDeadline });
    const yShownAfterMs = Date.now() - ySentAt;
    await expect(readBy(a.page, m1)).toHaveText('Lida por 2', { timeout: pollDeadline - (Date.now() - readAt) });
    await expect(readBy(a.page, m2)).toHaveText('Lida por 1', { timeout: 1_000 });
    await expect(readBy(a.page, m3)).toHaveCount(0);
    await expect(readers.getByTestId(`reader-item-${C.userId}`)).toBeVisible({
      timeout: Math.max(1_000, pollDeadline - (Date.now() - readAt)),
    });
    await expect(readers.getByTestId(`reader-item-${B.userId}`)).toBeVisible();
    const receiptsAfterMs = Date.now() - readAt;
    expect(receiptsAfterMs, 'partial reads within 15 s plus request time').toBeLessThanOrEqual(pollDeadline);
    expect(yShownAfterMs, 'a message sent while polling within 15 s plus request time').toBeLessThanOrEqual(pollDeadline);
    expect(polls.filter((poll) => poll.kind === 'readers' && poll.at > readAt).length, 'the open reader list is polled').toBeGreaterThan(0);

    // ---- Cadence: one round every 15 s while unhealthy and visible.
    await expect.poll(() => pollsOf(polls, 'feed').length, { timeout: 2 * POLL_INTERVAL_MS + REQUEST_SLACK_MS }).toBeGreaterThanOrEqual(3);
    const feedGaps = gaps(pollsOf(polls, 'feed'));
    for (const gap of feedGaps) {
      expect(gap, 'rounds 15 s apart').toBeGreaterThanOrEqual(POLL_INTERVAL_MS - 500);
      expect(gap, 'rounds 15 s apart').toBeLessThanOrEqual(POLL_INTERVAL_MS + 1_500);
    }

    // ---- The list's unread counts follow the server (B's direct message during the outage).
    await a.page.keyboard.press('Escape');
    await backToConversationList(a.page, directId);
    const directUnread = await serverUnread(a.page, directId);
    expect(directUnread).toBe(directUnreadBefore + 1);
    await expect.poll(() => readListUnreadCount(a.page, directId), { timeout: pollDeadline }).toBe(directUnread);

    const arrivals = await readArrivals(a.page);
    for (const text of texts) expect(arrivals.max[text], `${text} shown once`).toBe(1);
    // Realtime stayed down throughout: everything above came from polling.
    expect(harness.joinedTopics('messages')).toEqual([]);
    expect(harness.refusedConnections()).toBeGreaterThan(0);
    testInfo.annotations.push({
      type: 't14-ac016',
      description: JSON.stringify({
        firstPollAfterUnhealthyMs: firstRound.at - unhealthyAt,
        outageStartMessageShownMs: xShownAfterMs,
        whilePollingMessageShownMs: yShownAfterMs,
        partialReadsShownMs: receiptsAfterMs,
        feedGapsMs: feedGaps,
      }),
    });
  });

  test('AC-016: only the conversation-list stream unhealthy > 30 s — the list is polled every 15 s; none while the tab is hidden; on becoming visible at once', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const b = await openDevice('B');
    const a = await openDevice('A');
    const harness = await realtimeFaults.attach(a, { reload: false });
    const polls = recordPolls(a.page);
    await a.page.goto('/floor-plan');
    await openDrawer(a.page);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    await expect(a.page.getByTestId(`conversation-item-${directId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    // Two unread messages from B, counted live while both streams are up.
    const before = await serverUnread(a.page, directId);
    for (let index = 1; index <= 2; index += 1) {
      await createViaApi(b.page, { conversationId: directId, content: `t14 list-only ${index} ${randomUUID()}` });
    }
    await expect.poll(() => readListUnreadCount(a.page, directId), { timeout: STEP_TIMEOUT_MS }).toBe(before + 2);

    // ---- Only the list stream goes dark (terminal closure; its rejoins are withheld).
    const fault = await harness.fail('list', 'close');
    await harness.waitForStatus('list', 'CLOSED', { since: fault.mark, timeout: 10_000 });
    const unhealthyAt = await unhealthyFrom(harness, ['list'], fault.mark);
    expect(harness.status('messages'), 'the messages stream stays up').toBe('SUBSCRIBED');
    // A reads the conversation elsewhere (same session, through the API): only
    // the list can show it, and the list stream is dark.
    const read = await a.page.request.patch('/api/conversations/read', { data: { conversationId: directId } });
    expect(read.status(), await read.text()).toBe(200);
    expect(await serverUnread(a.page, directId)).toBe(0);
    // Not before 30 s unhealthy. The badge itself is not asserted stale here: A's
    // read receipts reach the live messages stream, whose handler may refresh the
    // list through a non-poll GET (seen in the T14 orchestrator run).
    await a.page.waitForTimeout(Math.max(0, unhealthyAt + POLL_AFTER_UNHEALTHY_MS - 2_000 - Date.now()));
    expect(pollsOf(polls, 'list')).toEqual([]);

    await expect.poll(() => pollsOf(polls, 'list').length, { timeout: 5_000 + REQUEST_SLACK_MS }).toBeGreaterThan(0);
    const firstPoll = pollsOf(polls, 'list')[0];
    expect(firstPoll.at - unhealthyAt, 'polled once unhealthy for 30 s').toBeGreaterThanOrEqual(POLL_AFTER_UNHEALTHY_MS - 1_000);
    expect(firstPoll.at - unhealthyAt).toBeLessThanOrEqual(POLL_AFTER_UNHEALTHY_MS + 3_000);
    await expect.poll(() => readListUnreadCount(a.page, directId), { timeout: REQUEST_SLACK_MS }).toBe(0);
    // No conversation open: no feed poll.
    expect(pollsOf(polls, 'feed')).toEqual([]);

    // ---- Cadence, then hidden: no polling at all; visible again: a poll at once.
    await expect.poll(() => pollsOf(polls, 'list').length, { timeout: POLL_INTERVAL_MS + REQUEST_SLACK_MS }).toBe(2);
    const [first, second] = pollsOf(polls, 'list');
    expect(second.at - first.at, 'rounds 15 s apart').toBeGreaterThanOrEqual(POLL_INTERVAL_MS - 500);
    expect(second.at - first.at).toBeLessThanOrEqual(POLL_INTERVAL_MS + 1_500);
    await setTabHidden(a.page, true);
    const hiddenAt = Date.now();
    await a.page.waitForTimeout(POLL_INTERVAL_MS + 6_000);
    expect(polls.filter((poll) => poll.at >= hiddenAt), 'no polling while hidden').toEqual([]);
    expect(harness.status('list'), 'still unhealthy').not.toBe('SUBSCRIBED');
    const visibleAt = Date.now();
    await setTabHidden(a.page, false);
    await expect.poll(() => pollsOf(polls, 'list', visibleAt).length, { timeout: REQUEST_SLACK_MS }).toBeGreaterThan(0);
    const onVisibleMs = pollsOf(polls, 'list', visibleAt)[0].at - visibleAt;
    expect(onVisibleMs, 'fetched immediately on becoming visible').toBeLessThanOrEqual(1_500);
    testInfo.annotations.push({
      type: 't14-list-only',
      description: JSON.stringify({ firstPollAfterUnhealthyMs: firstPoll.at - unhealthyAt, gapMs: second.at - first.at, onVisibleMs }),
    });
  });

  test('FR-016 (block B fix F6): a poll request that never answers ends at its round deadline — the next round still runs on schedule', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const harness = await realtimeFaults.attach(a, { reload: false });
    const polls = recordPolls(a.page);
    const isListPoll = (url: URL) => url.pathname === '/api/conversations/get' && url.searchParams.get('source') === 'poll';
    const abandonedAt: number[] = [];
    a.page.on('requestfailed', (request) => {
      if (isListPoll(new URL(request.url()))) abandonedAt.push(Date.now());
    });
    // The first round's list request stalls: it never gets an answer.
    let listPolls = 0;
    await a.page.route(isListPoll, async (route: Route) => {
      listPolls += 1;
      if (listPolls === 1) return;
      await route.fallback();
    });
    await a.page.goto('/floor-plan');
    await openDrawer(a.page);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    await expect(a.page.getByTestId(`conversation-item-${directId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });

    // Only the list stream goes dark (no conversation open: each round is one list request).
    const fault = await harness.fail('list', 'close');
    await harness.waitForStatus('list', 'CLOSED', { since: fault.mark, timeout: 10_000 });
    const unhealthyAt = await unhealthyFrom(harness, ['list'], fault.mark);
    await expect
      .poll(() => pollsOf(polls, 'list').length, { timeout: POLL_AFTER_UNHEALTHY_MS + 5_000 + REQUEST_SLACK_MS })
      .toBeGreaterThan(0);
    const first = pollsOf(polls, 'list')[0];
    expect(first.at - unhealthyAt).toBeGreaterThanOrEqual(POLL_AFTER_UNHEALTHY_MS - 1_000);

    // The stalled round does not hold the next one: it runs 15 s later and is answered.
    await expect.poll(() => pollsOf(polls, 'list').length, { timeout: POLL_INTERVAL_MS + REQUEST_SLACK_MS }).toBe(2);
    const second = pollsOf(polls, 'list')[1];
    expect(second.at - first.at, 'next round on schedule').toBeGreaterThanOrEqual(POLL_INTERVAL_MS - 500);
    expect(second.at - first.at, 'next round on schedule').toBeLessThanOrEqual(POLL_INTERVAL_MS + 1_500);
    expect(listPolls, 'the second round reached the network').toBe(2);
    testInfo.annotations.push({
      type: 'f6-stalled-poll',
      description: JSON.stringify({
        gapMs: second.at - first.at,
        abandonedAfterMs: abandonedAt.length ? abandonedAt[0] - first.at : null,
      }),
    });
  });

  test('AC-016/AC-048: recovery during an in-flight poll — its stale response keeps the newer reaction, receipt and attachment message, the loaded older page and one bubble per message; no poll for 60 s after recovery', async ({
    phase5World,
    openDevice,
    realtimeFaults,
    request,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { groupId } = phase5World.conversations;
    const { C } = phase5World.users;
    const b = await openDevice('B');
    const a = await openDevice('A');

    // History longer than one page (20): A and B alternate.
    const existing = (await storedIds(groupId)).length;
    expect(existing, 'seeded group history fits in two pages with the test messages').toBeLessThanOrEqual(10);
    for (let index = existing; index < 27; index += 1) {
      await createViaApi(index % 2 === 0 ? a.page : b.page, { conversationId: groupId, content: `t14 history ${index} ${randomUUID()}` });
    }
    const ownIds = [
      await createViaApi(a.page, { conversationId: groupId, content: `t14 reaction target ${randomUUID()}` }),
      await createViaApi(a.page, { conversationId: groupId, content: `t14 receipt target ${randomUUID()}` }),
    ];
    const [reactionTarget, receiptTarget] = ownIds;
    const history = await storedIds(groupId);
    expect(history.length).toBeGreaterThan(20);
    expect(history.length).toBeLessThanOrEqual(40);
    const oldestId = history[0];

    const harness = await realtimeFaults.attach(a);
    const polls = recordPolls(a.page);
    await openConversation(a.page, groupId);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    await expect(a.page.getByTestId(`message-${receiptTarget}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    // The older page is loaded.
    await expect(a.page.getByTestId(`message-${oldestId}`)).toHaveCount(0);
    await a.page.getByRole('button', { name: 'Load more messages' }).click();
    await expect(a.page.getByTestId(`message-${oldestId}`)).toHaveCount(1, { timeout: STEP_TIMEOUT_MS });
    for (const id of history) await expect(a.page.getByTestId(`message-${id}`)).toHaveCount(1);

    // The second feed poll is held in transit; its server read happens on demand.
    let feedPolls = 0;
    let markHeld: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    let readNow: () => void = () => undefined;
    const readGate = new Promise<void>((resolve) => {
      readNow = resolve;
    });
    let release: () => void = () => undefined;
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldBody: { messages: Array<{ id: string; readCount?: number; reactions?: Array<{ emoji: string }> }> } | null = null;
    let heldFinished = false;
    await a.page.route(
      (url) => url.pathname === '/api/messages/get' && url.searchParams.get('source') === 'poll',
      async (route: Route) => {
        feedPolls += 1;
        if (feedPolls !== 2) {
          await route.continue();
          return;
        }
        markHeld();
        await readGate;
        const response = await route.fetch();
        const body = await response.text();
        heldBody = JSON.parse(body);
        await releaseGate;
        await route.fulfill({ response, body });
        heldFinished = true;
      },
    );

    // ---- Both required streams fail on the live socket; polling starts after 30 s.
    const messagesFault = await harness.fail('messages', 'error');
    const listFault = await harness.fail('list', 'error');
    await harness.waitForStatus('messages', 'CHANNEL_ERROR', { since: messagesFault.mark, timeout: 10_000 });
    await harness.waitForStatus('list', 'CHANNEL_ERROR', { since: listFault.mark, timeout: 10_000 });
    await expect.poll(() => feedPolls, { timeout: POLL_AFTER_UNHEALTHY_MS + 5_000 }).toBe(1);
    await held;
    const heldAt = Date.now();

    // ---- Realtime recovers while that poll is in flight.
    const restoreMark = harness.restore();
    await harness.waitForReady('messages', { timeout: RECOVERY_TIMEOUT_MS });
    await harness.waitForReady('list', { timeout: RECOVERY_TIMEOUT_MS });
    await harness.settle();
    // Healthy again: the later of the two streams' SUBSCRIBED after restore.
    const recoveredAt = Math.max(
      ...(['messages', 'list'] as const).map(
        (stream) =>
          (harness.statuses(stream, { since: restoreMark }).find((record) => record.status === 'SUBSCRIBED') as { at: number }).at,
      ),
    );
    // A message both deliver: live over the recovered stream, and in the held poll.
    const bothText = `t14 delivered by both ${randomUUID()}`;
    await watchArrivals(a.page, [bothText]);
    const bothMark = harness.mark();
    const bothId = await createViaApi(b.page, { conversationId: groupId, content: bothText });
    await expect(a.page.getByTestId(`message-${bothId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    expect(
      harness
        .frames({ stream: 'messages', since: bothMark, direction: 'in', action: 'pass', events: ['postgres_changes'] })
        .some((frame) => frame.detail.table === 'messages' && frame.detail.recordId === bothId),
      'delivered live over the recovered stream',
    ).toBe(true);
    readNow();
    await expect.poll(() => heldBody !== null, { timeout: STEP_TIMEOUT_MS }).toBe(true);

    // ---- Newer state over Realtime after the held poll read the server.
    const reaction = await b.page.request.post('/api/messages/react', { data: { messageId: reactionTarget, emoji: REACTION } });
    expect(reaction.status(), await reaction.text()).toBeLessThan(300);
    expect(await markReadAsSeededMember(request, { conversationId: groupId, userId: C.userId, messageIds: [receiptTarget] })).toBe(1);
    const fileId = await sendFile(b.page, groupId, `t14-${randomUUID()}.txt`);
    const reactionChip = `[data-testid="message-${reactionTarget}"] [data-testid="reaction-chip-${REACTION}"]`;
    await expect(a.page.locator(reactionChip)).toHaveCount(1, { timeout: STEP_TIMEOUT_MS });
    await expect(readBy(a.page, receiptTarget)).toHaveText('Lida por 1', { timeout: STEP_TIMEOUT_MS });
    await expect(a.page.locator(`[data-testid="message-${fileId}"][data-attachment-count="1"]`)).toHaveCount(1, {
      timeout: STEP_TIMEOUT_MS,
    });

    // The held response is stale: it has the message both delivered, none of the newer state.
    const stale = heldBody as unknown as { messages: Array<{ id: string; readCount?: number; reactions?: Array<{ emoji: string }> }> };
    const staleById = new Map(stale.messages.map((message) => [message.id, message]));
    expect(staleById.has(bothId), 'the held poll carries the message Realtime delivered').toBe(true);
    expect(staleById.has(fileId), 'the held poll predates the attachment message').toBe(false);
    expect(staleById.get(receiptTarget)?.readCount ?? 0, 'the held poll predates C\'s read').toBe(0);
    expect(staleById.get(reactionTarget)?.reactions ?? [], 'the held poll predates B\'s reaction').toEqual([]);
    expect(staleById.has(oldestId), 'the held poll covered the loaded older page').toBe(true);

    // ---- Release it: the newer state, the older page and one bubble per message stay.
    await watchFeedState(a.page, [
      { selector: reactionChip },
      { selector: `[data-testid="read-by-${receiptTarget}"]`, text: 'Lida por 1' },
      { selector: `[data-testid="message-${fileId}"][data-attachment-count="1"]` },
      { selector: `[data-testid="message-${bothId}"]` },
      { selector: `[data-testid="message-${oldestId}"]` },
    ]);
    // Block B fix F6: a round's requests are abandoned at its 10 s deadline;
    // this stale response must land before it.
    const heldToReleaseMs = Date.now() - heldAt;
    expect(heldToReleaseMs, 'the held poll is released before its round deadline').toBeLessThan(POLL_ROUND_DEADLINE_MS - 500);
    release();
    await expect.poll(() => heldFinished, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    await a.page.waitForTimeout(2_000);
    expect(await readFeedViolations(a.page), 'newer state, older page and single bubbles kept').toEqual([]);
    const all = await storedIds(groupId);
    for (const id of all) await expect(a.page.getByTestId(`message-${id}`), `${id} once`).toHaveCount(1);
    expect((await readArrivals(a.page)).max[bothText]).toBe(1);

    // ---- No new polling request starts during the 60 s after recovery.
    await a.page.waitForTimeout(Math.max(0, recoveredAt + 60_000 - Date.now()));
    expect(
      polls.filter((poll) => poll.kind !== 'readers' && poll.at > recoveredAt),
      'no polling request after recovery',
    ).toEqual([]);
    expect(feedPolls, 'only the two rounds before recovery').toBe(2);
    expect(harness.status('messages')).toBe('SUBSCRIBED');
    expect(harness.status('list')).toBe('SUBSCRIBED');
    testInfo.annotations.push({
      type: 't14-stale-poll',
      description: JSON.stringify({ heldToRecoveredMs: recoveredAt - heldAt, heldToReleaseMs, rounds: feedPolls }),
    });
  });
});
