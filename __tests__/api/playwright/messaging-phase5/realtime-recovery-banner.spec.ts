import { randomUUID } from 'node:crypto';

import type { Page, Route } from '@playwright/test';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5-faults';
import { login } from '../fixtures/messaging';
import { backToConversationList, openDrawer, readListUnreadCount, waitForRealtimeReady } from '../helpers/drawer-helpers';
import {
  STEP_TIMEOUT_MS,
  createViaApi,
  openConversation,
  readArrivals,
  sendFromComposer,
  storedWithTexts,
  trackOutboxCalls,
  watchArrivals,
} from '../helpers/messaging-outbox-e2e';
import type {
  FaultKick,
  MessagingRealtimeStream,
  RealtimeFaultController,
  RealtimeFaultKind,
  RetryRecord,
} from '../helpers/realtime-stream-faults';

/**
 * Phase 5 T13 — Realtime stream health, recovery, and the drawer's connection
 * banner (FR-014, FR-015; AC-014, the messages and list clauses of AC-015,
 * the banner clause of AC-037; FR-002's Realtime-recovery trigger).
 *
 * Real accounts A, B (and C for the account switch), the real app, local
 * Supabase and its Realtime. Faults are network shaping (SPEC §15, PLAN D4):
 * the browser's offline mode; the T25 per-stream fault harness on A's real
 * socket (error, timeout, terminal closure of ONE stream; Presence and the
 * other streams untouched); a whole Realtime connection drop by the same
 * harness (every socket closed, reconnects refused, then let through); create
 * and fence requests failed in transit. AC-014's 3 s "Realtime drop" is both
 * required streams failing on the live socket for 3 s: after a whole socket
 * drop the socket itself comes back only on the SDK's own reconnect schedule
 * (1, 2, 5, 10 s), which the application does not drive, so a 3 s socket drop
 * may stay unhealthy for 8 s (the longer socket drop is tested separately). Recovery is never accepted on
 * SUBSCRIBED alone: after restore the stream must be joined with its changes
 * stream confirmed by the server (waitForReady) and deliver a fresh event
 * from B.
 *
 * Also replaces the deleted mock-based unit test
 * __tests__/message-subscription.test.tsx (its retry and identity cases): one
 * application retry per failed channel, each on a new topic, with growing
 * capped delays; a single joined channel per stream after recovery (retired
 * channels left, their late CLOSED ignored: health and banner stay healthy);
 * no channel of the previous account after an account switch.
 */

const BANNER_TEXT = {
  offline: 'Sem conexão — mensagens serão enviadas quando voltar',
  reconnecting: 'Reconectando…',
} as const;
const RECONNECTING_AFTER_MS = 5_000;
const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 5_000;
/** A pending join's own timer (10 s) plus the longest application backoff, with margin. */
const RECOVERY_TIMEOUT_MS = 30_000;
const KINDS: readonly RealtimeFaultKind[] = ['error', 'timeout', 'close'];

const banner = (page: Page) => page.getByTestId('messaging-connection-banner');

interface BannerEntry {
  at: number;
  state: string;
  text: string;
}

/** Records, in the page, every change of the banner's state and text with the page's time. */
async function watchBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: Array<{ at: number; state: string; text: string }> = [];
    let last = '';
    const read = () => {
      const element = document.querySelector('[data-testid="messaging-connection-banner"]');
      const state = element?.getAttribute('data-state') ?? 'absent';
      const text = element?.textContent ?? '';
      const key = `${state}|${text}`;
      if (key === last) return;
      last = key;
      log.push({ at: Date.now(), state, text });
    };
    (window as unknown as { __t13Banner?: typeof log }).__t13Banner = log;
    read();
    new MutationObserver(read).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
  });
}

const readBanner = (page: Page): Promise<BannerEntry[]> =>
  page.evaluate(() => (window as unknown as { __t13Banner: BannerEntry[] }).__t13Banner);

async function expectBannerHealthy(page: Page, timeout = STEP_TIMEOUT_MS): Promise<void> {
  await expect(banner(page)).toHaveAttribute('data-state', 'healthy', { timeout });
  await expect(banner(page)).toHaveText('');
}

/** A's own unread count of the conversation as the server computes it. */
async function serverUnread(page: Page, conversationId: string): Promise<number> {
  const response = await page.request.get('/api/conversations/get?includeArchived=true');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { conversations?: Array<{ id: string; unreadCount?: number }> };
  return body.conversations?.find((conversation) => conversation.id === conversationId)?.unreadCount ?? 0;
}

/** Records A's conversation-list fetches (the list's catch-up and invalidations). */
function recordListFetches(page: Page): () => number[] {
  const fetchedAt: number[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/conversations/get') {
      fetchedAt.push(Date.now());
    }
  });
  return () => [...fetchedAt];
}

/** min(cap, round(base · 1.5^(n − 1))) for the n-th failure of an unhealthy period (FR-015 capped exponential backoff). */
const expectedDelay = (attempt: number) => Math.min(RETRY_MAX_MS, Math.round(RETRY_BASE_MS * 1.5 ** (attempt - 1)));

/**
 * The application's retries of one unhealthy period: one per failed channel,
 * delays growing exponentially (×1.5) from 250 ms and never above the 5 s cap, each
 * on a new topic (the distinct topics joined since the fault are one per
 * retry that ran).
 */
function expectCappedBackoff(
  harness: RealtimeFaultController,
  stream: MessagingRealtimeStream,
  since: number,
  until: number,
): RetryRecord[] {
  const retries = harness.retries(stream, { since }).filter((record) => record.seq < until);
  expect(retries.length, `${stream}: the application retried`).toBeGreaterThan(0);
  // Consecutive failures of one unhealthy period (an earlier failure within
  // 30 s of stability would start the count above 1), each delay per formula.
  const first = retries[0].attempt;
  expect(
    retries.map((record) => [record.attempt, record.delay]),
    `${stream}: increasing, capped delays`,
  ).toEqual(retries.map((_record, index) => [first + index, expectedDelay(first + index)]));
  const joinedTopics = new Set(
    harness
      .frames({ stream, since, direction: 'out', events: ['phx_join'] })
      .filter((frame) => frame.seq < until)
      .map((frame) => frame.topic),
  );
  // Every retry joins one new topic; the last one scheduled may be overtaken
  // by the SDK's own rejoin of the current channel (then it never runs).
  expect(joinedTopics.size, `${stream}: one new topic per retry`).toBeLessThanOrEqual(retries.length);
  expect(joinedTopics.size, `${stream}: one new topic per retry`).toBeGreaterThanOrEqual(retries.length - 1);
  return retries;
}

interface Outage {
  fault: FaultKick;
  faultAt: number;
  restoredAt: number;
  reconnectingAt: number;
  restoreMark: number;
  recoveredAt: number;
  retries: RetryRecord[];
}

/**
 * One stream of A fails (`kind`) while the others stay up: "Reconectando…"
 * appears once it has been unhealthy for more than 5 s, `during` runs, the
 * fault lasts at least `holdMs`; then Realtime is available again and the
 * stream must rejoin by itself (no user action), after which the banner hides
 * and stays hidden.
 */
async function streamOutage(
  a: Phase5Device,
  harness: RealtimeFaultController,
  stream: MessagingRealtimeStream,
  kind: RealtimeFaultKind,
  holdMs: number,
  during: () => Promise<void>,
): Promise<Outage> {
  const faultAt = Date.now();
  const fault = await harness.fail(stream, kind);
  expect(fault.kicked, `the joined ${stream} channel was hit`).toBeGreaterThan(0);
  await harness.waitForStatus(stream, kind === 'close' ? 'CLOSED' : 'CHANNEL_ERROR', { since: fault.mark, timeout: 10_000 });
  await during();
  await expect(banner(a.page)).toHaveText(BANNER_TEXT.reconnecting, { timeout: RECONNECTING_AFTER_MS + 5_000 });
  const log = await readBanner(a.page);
  const reconnecting = log.find((entry) => entry.state === 'reconnecting' && entry.at >= faultAt);
  expect(reconnecting, 'reconnecting recorded').toBeDefined();
  const reconnectingAt = (reconnecting as BannerEntry).at;
  expect(reconnectingAt - faultAt, '"Reconectando…" only after more than 5 s unhealthy').toBeGreaterThanOrEqual(RECONNECTING_AFTER_MS);
  // Upper bound from the app's first failure status (a server-side closure can
  // take seconds to reach the page after the fault is armed).
  await harness.settle();
  const firstFailureAt = harness.statuses(stream, { since: fault.mark })[0].at;
  expect(reconnectingAt - firstFailureAt, '"Reconectando…" shortly after 5 s unhealthy').toBeLessThanOrEqual(
    RECONNECTING_AFTER_MS + 1_500,
  );
  expect(log.filter((entry) => entry.at >= faultAt && entry.at < reconnectingAt).map((entry) => entry.state)).not.toContain(
    'offline',
  );
  const left = faultAt + holdMs - Date.now();
  if (left > 0) await a.page.waitForTimeout(left);
  // While faulted the stream never recovered.
  await harness.settle();
  expect(harness.statuses(stream, { since: fault.mark }).map((record) => record.status)).not.toContain('SUBSCRIBED');

  const restoredAt = Date.now();
  const restoreMark = harness.restore(stream);
  await harness.waitForReady(stream, { timeout: RECOVERY_TIMEOUT_MS });
  const recoveredAt = Date.now();
  await expectBannerHealthy(a.page, 5_000);
  await harness.settle();
  const retries = expectCappedBackoff(harness, stream, fault.mark, harness.mark());
  // Retired channels were left: one joined channel of the stream.
  expect(harness.joinedTopics(stream), `${stream}: a single joined channel`).toHaveLength(1);
  return { fault, faultAt, restoredAt, reconnectingAt, restoreMark, recoveredAt, retries };
}

test.describe('Phase 5 T13 — Realtime stream health, recovery, and connection banner', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-014/AC-037: offline shows "Sem conexão…" at once in a polite live region, never "Reconectando…"; back online it hides', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const a = await openDevice('A');
    await openConversation(a.page, phase5World.conversations.directId);
    await waitForRealtimeReady(a.page);
    await expect(banner(a.page)).toHaveAttribute('role', 'status');
    await expect(banner(a.page)).toHaveAttribute('aria-live', 'polite');
    await expectBannerHealthy(a.page);
    await watchBanner(a.page);

    const offlineAt = Date.now();
    await a.context.setOffline(true);
    await expect(banner(a.page)).toHaveText(BANNER_TEXT.offline, { timeout: 2_000 });
    await expect(banner(a.page)).toHaveAttribute('data-state', 'offline');
    const shownAfterMs = ((await readBanner(a.page)).find((entry) => entry.state === 'offline') as BannerEntry).at - offlineAt;
    testInfo.annotations.push({ type: 't13-offline-banner-ms', description: String(shownAfterMs) });
    expect(shownAfterMs, 'shown as soon as the browser reports offline').toBeLessThanOrEqual(1_000);

    // Longer than the reconnecting threshold: still the offline text only.
    await a.page.waitForTimeout(RECONNECTING_AFTER_MS + 1_500);
    await expect(banner(a.page)).toHaveText(BANNER_TEXT.offline);

    await a.context.setOffline(false);
    await expectBannerHealthy(a.page, 5_000);
    const states = (await readBanner(a.page)).map((entry) => entry.state);
    expect(states).not.toContain('reconnecting');
    expect(states).toEqual(['healthy', 'offline', 'healthy']);
  });

  test('AC-014: a 3 s Realtime drop of the messages and list streams shows no banner; both rejoin by themselves', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const b = await openDevice('B');
    const a = await openDevice('A');
    // The page reloads under the harness (its socket is created through it).
    const harness = await realtimeFaults.attach(a);
    await openConversation(a.page, directId);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    await watchBanner(a.page);

    // Both required streams go dark on the live socket (Presence and the socket stay up).
    const droppedAt = Date.now();
    const messagesFault = await harness.fail('messages', 'error');
    const listFault = await harness.fail('list', 'error');
    await harness.waitForStatus('messages', 'CHANNEL_ERROR', { since: messagesFault.mark, timeout: 5_000 });
    await harness.waitForStatus('list', 'CHANNEL_ERROR', { since: listFault.mark, timeout: 5_000 });
    await a.page.waitForTimeout(Math.max(0, droppedAt + 3_000 - Date.now()));
    harness.restore();
    await harness.waitForReady('messages', { timeout: RECOVERY_TIMEOUT_MS });
    await harness.waitForReady('list', { timeout: RECOVERY_TIMEOUT_MS });
    await harness.settle();
    // Unhealthy period of each stream: first failure → SUBSCRIBED again (what the banner follows).
    const unhealthyMs = Object.fromEntries(
      ([['messages', messagesFault], ['list', listFault]] as const).map(([stream, fault]) => {
        const records = harness.statuses(stream, { since: fault.mark });
        const failedAt = records[0].at;
        const subscribedAt = (records.find((record) => record.status === 'SUBSCRIBED') as { at: number }).at;
        return [stream, subscribedAt - failedAt];
      }),
    );
    testInfo.annotations.push({ type: 't13-3s-drop-unhealthy-ms', description: JSON.stringify(unhealthyMs) });
    await a.page.waitForTimeout(1_500);

    expect((await readBanner(a.page)).map((entry) => entry.state), 'no banner for a 3 s drop').toEqual(['healthy']);
    // Recovered for real: B's fresh message reaches A's open feed.
    const messageId = await createViaApi(b.page, { conversationId: directId, content: `t13 after 3 s drop ${randomUUID()}` });
    await expect(a.page.getByTestId(`message-${messageId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await harness.settle();
    for (const [stream, fault] of [['messages', messagesFault], ['list', listFault]] as const) {
      expect(harness.retries(stream, { since: fault.mark }).length, `${stream} retried by itself`).toBeGreaterThan(0);
      expect(harness.joinedTopics(stream)).toHaveLength(1);
    }
    expect(harness.connections().filter((connection) => connection.closedSeq !== null), 'same socket throughout').toEqual([]);
  });

  test('AC-014/AC-015: a whole Realtime connection drop longer than 5 s shows "Reconectando…"; every stream rejoins without user action and the banner hides', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const b = await openDevice('B');
    const a = await openDevice('A');
    const harness = await realtimeFaults.attach(a);
    await openConversation(a.page, directId);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    await watchBanner(a.page);
    const texts = [`t13 during socket drop ${randomUUID()}`];
    await watchArrivals(a.page, texts);

    const droppedAt = Date.now();
    const dropMark = await harness.dropConnection();
    await harness.waitForStatus('messages', 'CHANNEL_ERROR', { since: dropMark, timeout: 5_000 });
    await harness.waitForStatus('list', 'CHANNEL_ERROR', { since: dropMark, timeout: 5_000 });
    await createViaApi(b.page, { conversationId: directId, content: texts[0] });
    await expect(banner(a.page)).toHaveText(BANNER_TEXT.reconnecting, { timeout: RECONNECTING_AFTER_MS + 5_000 });
    const reconnecting = (await readBanner(a.page)).find((entry) => entry.state === 'reconnecting') as BannerEntry;
    expect(reconnecting.at - droppedAt).toBeGreaterThanOrEqual(RECONNECTING_AFTER_MS);
    await a.page.waitForTimeout(Math.max(0, droppedAt + 6_000 - Date.now()));
    expect(harness.refusedConnections(), 'reconnect attempts were refused during the drop').toBeGreaterThan(0);

    harness.restoreConnection();
    await harness.waitForReady('messages', { timeout: RECOVERY_TIMEOUT_MS });
    await harness.waitForReady('list', { timeout: RECOVERY_TIMEOUT_MS });
    await harness.waitForReady('presence', { timeout: RECOVERY_TIMEOUT_MS });
    testInfo.annotations.push({ type: 't13-socket-drop-recovered-ms', description: String(Date.now() - droppedAt) });
    await expectBannerHealthy(a.page, 5_000);
    // B's message sent during the drop shows once (catch-up); a fresh one arrives live.
    const [row] = await storedWithTexts(directId, texts);
    await expect(a.page.getByTestId(`message-${row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const freshMark = harness.mark();
    const messageId = await createViaApi(b.page, { conversationId: directId, content: `t13 after socket drop ${randomUUID()}` });
    await expect(a.page.getByTestId(`message-${messageId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await a.page.waitForTimeout(1_000);
    // Over one channel only: nothing left over from the outage streams to the page.
    expect(
      harness
        .frames({ stream: 'messages', since: freshMark, direction: 'in', events: ['postgres_changes'] })
        .filter((frame) => frame.detail.recordId === messageId)
        .map((frame) => frame.topic),
    ).toEqual(harness.joinedTopics('messages'));
    expect((await readArrivals(a.page)).max[texts[0]]).toBe(1);
    await harness.settle();
    for (const stream of ['messages', 'list'] as const) {
      expect(harness.joinedTopics(stream)).toHaveLength(1);
    }
    expect((await readBanner(a.page)).map((entry) => entry.state)).toEqual(['healthy', 'reconnecting', 'healthy']);
  });

  for (const kind of KINDS) {
    test(`AC-014/AC-015 ${kind}: messages-only, then list-only outage > 5 s shows "Reconectando…", recovers without user action; B's messages once, unread counts correct, capped growing retries`, async ({
      phase5World,
      openDevice,
      realtimeFaults,
    }, testInfo) => {
      const { directId, groupId } = phase5World.conversations;
      const b = await openDevice('B');
      const a = await openDevice('A');
      const harness = await realtimeFaults.attach(a, { reload: false });
      const listFetches = recordListFetches(a.page);
      await a.page.goto('/floor-plan');
      await openDrawer(a.page);
      await harness.waitForReady('messages');
      await harness.waitForReady('list');
      await expect(a.page.getByTestId(`conversation-item-${groupId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      const groupUnread = await serverUnread(a.page, groupId);
      await expect.poll(() => readListUnreadCount(a.page, groupId), { timeout: STEP_TIMEOUT_MS }).toBe(groupUnread);
      await a.page.getByTestId(`conversation-item-${directId}`).click();
      await expect(a.page.getByTestId('messages-feed')).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await watchBanner(a.page);

      // ---- messages stream only ------------------------------------------
      const dmTexts = [`t13 ${kind} dm 1 ${randomUUID()}`, `t13 ${kind} dm 2 ${randomUUID()}`];
      const groupTexts = [`t13 ${kind} group 1 ${randomUUID()}`, `t13 ${kind} group 2 ${randomUUID()}`];
      await watchArrivals(a.page, dmTexts);
      // Error faults are held long enough for the backoff to reach its cap.
      const messagesOutage = await streamOutage(a, harness, 'messages', kind, kind === 'error' ? 14_000 : 7_000, async () => {
        for (const text of dmTexts) await createViaApi(b.page, { conversationId: directId, content: text });
        for (const text of groupTexts) await createViaApi(b.page, { conversationId: groupId, content: text });
      });
      if (kind === 'error') {
        expect(Math.max(...messagesOutage.retries.map((record) => record.delay)), 'the backoff reached its cap').toBe(RETRY_MAX_MS);
      }
      // Nothing of B's reached A over the dark stream; the catch-up shows each once.
      expect(
        harness
          .frames({ stream: 'messages', since: messagesOutage.fault.mark, direction: 'in', action: 'pass', events: ['postgres_changes'] })
          .filter((frame) => frame.seq < messagesOutage.restoreMark),
      ).toEqual([]);
      const dmRows = await storedWithTexts(directId, dmTexts);
      expect(dmRows).toHaveLength(2);
      for (const row of dmRows) await expect(a.page.getByTestId(`message-${row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      // Recovered for real: a fresh message from B arrives over the stream.
      const freshText = `t13 ${kind} dm fresh ${randomUUID()}`;
      const freshMark = harness.mark();
      const freshId = await createViaApi(b.page, { conversationId: directId, content: freshText });
      await expect(a.page.getByTestId(`message-${freshId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await expect
        .poll(() =>
          harness
            .frames({ stream: 'messages', since: freshMark, direction: 'in', action: 'pass', events: ['postgres_changes'] })
            .some((frame) => frame.detail.table === 'messages' && frame.detail.recordId === freshId),
        )
        .toBe(true);
      await a.page.waitForTimeout(1_500);
      const arrivals = await readArrivals(a.page);
      for (const text of dmTexts) expect(arrivals.max[text], `${text} shown once`).toBe(1);
      // The group's unread count (not open) counts B's two messages, as on the server.
      await backToConversationList(a.page, groupId);
      await expect.poll(() => readListUnreadCount(a.page, groupId), { timeout: STEP_TIMEOUT_MS }).toBe(groupUnread + 2);
      expect(await serverUnread(a.page, groupId)).toBe(groupUnread + 2);

      // ---- conversation-list stream only -----------------------------------
      const listTexts = [`t13 ${kind} list 1 ${randomUUID()}`, `t13 ${kind} list 2 ${randomUUID()}`];
      const listOutage = await streamOutage(a, harness, 'list', kind, 7_000, async () => {
        for (const text of listTexts) await createViaApi(b.page, { conversationId: groupId, content: text });
        // The list stream is dark: the group's conversation updates are withheld.
        await expect
          .poll(
            () =>
              harness
                .frames({ stream: 'list', direction: 'in', action: 'drop', events: ['postgres_changes'] })
                .filter((frame) => frame.detail.recordId === groupId).length,
            { timeout: STEP_TIMEOUT_MS },
          )
          .toBeGreaterThan(0);
      });
      // Catch-up: the list is refetched once the rejoined stream is confirmed.
      await expect
        .poll(() => listFetches().filter((at) => at >= listOutage.restoredAt).length, { timeout: STEP_TIMEOUT_MS })
        .toBeGreaterThan(0);
      await expect.poll(() => readListUnreadCount(a.page, groupId), { timeout: STEP_TIMEOUT_MS }).toBe(groupUnread + 4);
      expect(await serverUnread(a.page, groupId)).toBe(groupUnread + 4);
      // Recovered for real: B's fresh group message reaches A over the list stream.
      const listFreshMark = harness.mark();
      const listFreshText = `t13 ${kind} list fresh ${randomUUID()}`;
      await createViaApi(b.page, { conversationId: groupId, content: listFreshText });
      await expect
        .poll(
          () =>
            harness
              .frames({ stream: 'list', since: listFreshMark, direction: 'in', action: 'pass', events: ['postgres_changes'] })
              .some((frame) => frame.detail.table === 'conversations' && frame.detail.recordId === groupId),
          { timeout: STEP_TIMEOUT_MS },
        )
        .toBe(true);
      await expect.poll(() => readListUnreadCount(a.page, groupId), { timeout: STEP_TIMEOUT_MS }).toBe(groupUnread + 5);
      expect(await serverUnread(a.page, groupId)).toBe(groupUnread + 5);
      // The banner stays hidden once healthy (late closures of left channels change nothing).
      await expectBannerHealthy(a.page);
      // Every message B sent in the group shows once.
      const groupAll = [...groupTexts, ...listTexts, listFreshText];
      await a.page.getByTestId(`conversation-item-${groupId}`).click();
      await expect(a.page.getByTestId('messages-feed')).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      for (const row of await storedWithTexts(groupId, groupAll)) {
        await expect(a.page.getByTestId(`message-${row.id}`)).toHaveCount(1, { timeout: STEP_TIMEOUT_MS });
      }

      const states = (await readBanner(a.page)).map((entry) => entry.state);
      expect(states.filter((state) => state === 'reconnecting'), 'one "Reconectando…" per outage').toHaveLength(2);
      expect(states).not.toContain('offline');
      expect(states[states.length - 1]).toBe('healthy');
      testInfo.annotations.push({
        type: 't13-outage',
        description: JSON.stringify(
          [messagesOutage, listOutage].map((outage, index) => ({
            stream: index === 0 ? 'messages' : 'list',
            kind,
            reconnectingAfterMs: outage.reconnectingAt - outage.faultAt,
            recoveredAfterRestoreMs: outage.recoveredAt - outage.restoredAt,
            delays: outage.retries.map((record) => record.delay),
          })),
        ),
      });
    });
  }

  test('FR-002 (T13): the messages stream recovering drains a waiting outbox item at once, before its own backoff', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    // The page reloads under the harness (its socket is created through it).
    const harness = await realtimeFaults.attach(a);
    await openConversation(a.page, directId);
    await harness.waitForReady('messages');
    const calls = trackOutboxCalls(a.page);
    // A's create and fence requests fail in transit (the browser stays online).
    let failInTransit = true;
    await a.context.route(/\/api\/messages\/(create|fence)$/, async (route: Route) => {
      if (failInTransit) await route.abort('failed');
      else await route.continue();
    });

    const fault = await harness.fail('messages', 'error');
    await harness.waitForStatus('messages', 'CHANNEL_ERROR', { since: fault.mark });
    const text = `t13 drain on recovery ${randomUUID()}`;
    await sendFromComposer(a.page, text);
    // The item's own retries back off: 1, 2, 4, 8 s, then 15 s after the fifth failure.
    await expect.poll(() => calls.filter((call) => call.failure).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(5);
    const failed = calls.filter((call) => call.failure);
    const lastFailedAt = failed[failed.length - 1].startedAt;
    const lastGap = lastFailedAt - failed[failed.length - 2].startedAt;
    expect(lastGap, 'the item is backing off').toBeGreaterThanOrEqual(6_000);
    failInTransit = false;

    const restoreMark = harness.restore('messages');
    await harness.waitForReady('messages', { timeout: RECOVERY_TIMEOUT_MS });
    const subscribed = harness.statuses('messages', { since: restoreMark }).find((record) => record.status === 'SUBSCRIBED');
    expect(subscribed).toBeDefined();
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    const firstOk = calls.find((call) => !call.failure && call.startedAt > lastFailedAt);
    expect(firstOk, JSON.stringify(calls)).toBeDefined();
    const afterRecoveryMs = (firstOk as { startedAt: number }).startedAt - (subscribed as { at: number }).at;
    testInfo.annotations.push({ type: 't13-drain-after-recovery-ms', description: String(afterRecoveryMs) });
    expect(afterRecoveryMs, 'drained on the stream recovery').toBeLessThanOrEqual(2_000);
    expect((firstOk as { startedAt: number }).startedAt, 'before the item\'s own next retry').toBeLessThan(
      lastFailedAt + 2 * lastGap - 1_000,
    );
    const [row] = await storedWithTexts(directId, [text]);
    await expect(a.page.getByTestId(`message-${row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(a.page.getByTestId(`message-temp-${row.key}`)).toHaveCount(0);
  });

  test("replaces the unit identity case: when C signs in in another tab, the open tab switches in place and leaves the previous account's messaging channels", async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }) => {
    const { directId } = phase5World.conversations;
    const { A, C } = phase5World.users;
    const b = await openDevice('B');
    const a = await openDevice('A');
    // The page reloads under the harness (its socket is created through it).
    const harness = await realtimeFaults.attach(a);
    await openConversation(a.page, directId);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    const topicsOf = (stream: MessagingRealtimeStream, userId: string) =>
      harness.joinedTopics(stream).filter((topic) => topic.includes(userId));
    expect(topicsOf('messages', A.userId)).toHaveLength(1);
    expect(topicsOf('list', A.userId)).toHaveLength(1);
    const tab1Sockets = harness.connections().filter((connection) => connection.closedSeq === null);
    expect(tab1Sockets).toHaveLength(1);

    // C signs in on the same browser in another tab; tab 1 follows without a reload.
    const switchMark = harness.mark();
    const tab2 = await a.newTab();
    await login(tab2, C.email, C.password);
    await expect.poll(() => topicsOf('messages', A.userId).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    await expect.poll(() => topicsOf('list', A.userId).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    // Tab 1 (same socket throughout) joined C's streams in place; tab 2 has its own.
    await openDrawer(tab2);
    await expect.poll(() => topicsOf('messages', C.userId).length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
    await expect.poll(() => topicsOf('list', C.userId).length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
    const tab1Socket = harness.connections().find((connection) => connection.id === tab1Sockets[0].id);
    expect(tab1Socket?.closedSeq, 'tab 1 kept its socket (no reload)').toBeNull();
    expect(
      harness
        .frames({ since: switchMark, direction: 'out', events: ['phx_leave'] })
        .filter((frame) => frame.connection === tab1Sockets[0].id && frame.topic.includes(A.userId))
        .map((frame) => frame.stream)
        .sort(),
      "tab 1 left A's messages and list channels",
    ).toEqual(['list', 'messages']);
    // B writes to A: nothing of it reaches either tab, now signed in as C.
    const messageId = await createViaApi(b.page, { conversationId: directId, content: `t13 after switch ${randomUUID()}` });
    await a.page.waitForTimeout(3_000);
    expect(
      harness
        .frames({ since: switchMark, direction: 'in', action: 'pass', events: ['postgres_changes'] })
        .filter((frame) => frame.detail.recordId === messageId),
    ).toEqual([]);
  });

  test("block B fix F1: channels mounted while Realtime is down join nothing until it is back — after a switch to C meanwhile, no topic of A is ever joined and nothing of A's reaches the page", async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }) => {
    const { directId } = phase5World.conversations;
    const { A, C } = phase5World.users;
    const b = await openDevice('B');
    const a = await openDevice('A');
    // The page reloads under the harness (its socket is created through it).
    const harness = await realtimeFaults.attach(a);
    await harness.waitForReady('messages');
    await harness.waitForReady('list');
    const topicsOf = (stream: MessagingRealtimeStream, userId: string) =>
      harness.joinedTopics(stream).filter((topic) => topic.includes(userId));

    // Realtime is unavailable (every socket closed, reconnects refused) and the
    // tab reloads: A's messaging channels mount while the socket is down, and
    // the socket fails again (its reconnect attempts are refused).
    await harness.dropConnection();
    await a.page.reload();
    await openDrawer(a.page);
    await expect(a.page.getByTestId(`conversation-item-${directId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const refusedBefore = harness.refusedConnections();
    await expect.poll(() => harness.refusedConnections(), { timeout: 15_000 }).toBeGreaterThanOrEqual(refusedBefore + 2);

    // C signs in in another tab while Realtime is still down; tab 1 switches in place.
    const tab2 = await a.newTab();
    await login(tab2, C.email, C.password);
    await expect(a.page.getByTestId(`conversation-item-${directId}`), "tab 1 now shows C's list").toHaveCount(0, {
      timeout: STEP_TIMEOUT_MS,
    });

    // Realtime is back: only C's streams join.
    const restoreMark = harness.restoreConnection();
    await expect.poll(() => topicsOf('messages', C.userId).length, { timeout: RECOVERY_TIMEOUT_MS }).toBeGreaterThanOrEqual(1);
    await expect.poll(() => topicsOf('list', C.userId).length, { timeout: RECOVERY_TIMEOUT_MS }).toBeGreaterThanOrEqual(1);
    await a.page.waitForTimeout(3_000);
    expect(
      harness
        .frames({ since: restoreMark, direction: 'out', events: ['phx_join'] })
        .filter((frame) => frame.topic.includes(A.userId))
        .map((frame) => frame.topic),
      "no join of A's topics was pushed once the socket was back",
    ).toEqual([]);
    expect(topicsOf('messages', A.userId), "no topic of A joined").toEqual([]);
    expect(topicsOf('list', A.userId), "no topic of A joined").toEqual([]);

    // B writes to A: nothing of it reaches the browser, now signed in as C.
    const messageId = await createViaApi(b.page, { conversationId: directId, content: `t13 F1 after switch ${randomUUID()}` });
    await a.page.waitForTimeout(3_000);
    expect(
      harness
        .frames({ since: restoreMark, direction: 'in', action: 'pass', events: ['postgres_changes'] })
        .filter((frame) => frame.detail.recordId === messageId || frame.topic.includes(A.userId)),
    ).toEqual([]);
  });
});
