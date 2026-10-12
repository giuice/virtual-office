import { randomUUID } from 'node:crypto';

import type { Page, Request, Route } from '@playwright/test';

import { test, expect } from '../fixtures/messaging-phase5';
import { waitForRealtimeReady } from '../helpers/drawer-helpers';
import {
  STEP_TIMEOUT_MS,
  composer,
  composerInput,
  createViaApi,
  deleteOwnMessageFromAnotherSession,
  expectDeliveredInFeed,
  expectPendingLabel,
  goOffline,
  openConversation,
  queueOffline,
  readArrivals,
  readOutbox,
  sendFromComposer,
  storedWithTexts,
  watchArrivals,
  type ArrivalState,
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T8 — durable outbox with ordered automatic delivery (FR-001,
 * FR-002, FR-003, FR-010, FR-033, BR-002, BR-003; AC-001, AC-002, AC-004,
 * AC-011, AC-039; D1, D2, D5).
 *
 * Everything is real: the app, its IndexedDB outbox, the create route and the
 * local database. Offline is the browser context's network emulation
 * (`context.setOffline`: navigator.onLine false, every request fails); held
 * creates are delayed pass-through to the real server (route.fetch). The
 * outbox is read from the page's own IndexedDB (inspection only). Storage
 * failures (AC-039) are browser conditions installed before the app loads:
 * `indexedDB.open` throwing SecurityError (storage blocked for the site), and
 * outbox write transactions that fail to commit (as on QuotaExceededError).
 * Chromium's CDP quota override does not affect IndexedDB in Playwright's
 * off-the-record contexts (probed in Chrome and Edge), so the write failure is
 * produced in the page instead.
 *
 * Exactly once is checked three ways: one stored row per text (any key) in
 * the database, at most one bubble per text in B's feed at any moment
 * (MutationObserver), and one stored bubble (no pending copy) in A's feed.
 */

/** D1: with ≤ 10 pending and quota available, all delivered within 10 s of reconnecting. */
const D1_DEADLINE_MS = 10_000;
const D5_TEXT = 'Este navegador não permite guardar mensagens; libere o armazenamento do site';

interface CreateAttempt {
  body: Record<string, unknown>;
  startSeq: number;
  endSeq?: number;
  startedAt: number;
  endedAt?: number;
  status?: number;
  failure?: string;
}

/** Every create request of the page, with the order in which requests started and ended. */
function trackCreates(page: Page): CreateAttempt[] {
  const attempts: CreateAttempt[] = [];
  const byRequest = new Map<Request, CreateAttempt>();
  let seq = 0;
  const isCreate = (request: Request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/messages/create';
  page.on('request', (request) => {
    if (!isCreate(request)) return;
    seq += 1;
    const attempt: CreateAttempt = {
      body: (request.postDataJSON() ?? {}) as Record<string, unknown>,
      startSeq: seq,
      startedAt: Date.now(),
    };
    attempts.push(attempt);
    byRequest.set(request, attempt);
  });
  page.on('requestfinished', (request) => {
    const attempt = byRequest.get(request);
    if (!attempt) return;
    seq += 1;
    attempt.endSeq = seq;
    attempt.endedAt = Date.now();
    void request.response().then((response) => {
      attempt.status = response?.status();
    });
  });
  page.on('requestfailed', (request) => {
    const attempt = byRequest.get(request);
    if (!attempt) return;
    seq += 1;
    attempt.endSeq = seq;
    attempt.endedAt = Date.now();
    attempt.failure = request.failure()?.errorText ?? 'failed';
  });
  return attempts;
}

/**
 * D1 diagnostics (ms after reconnecting): when each text first showed on the
 * recipient's page (null = not yet), each create's start, duration and gap
 * before it, and the server's own duration of each create (dev-server log).
 */
async function d1Timing(
  recipient: Page,
  texts: readonly string[],
  creates: readonly CreateAttempt[],
  reconnectedAt: number,
  serverLines: readonly string[],
): Promise<Record<string, unknown>> {
  const arrivals = await recipient
    .evaluate(() => (window as unknown as { __t8Arrivals?: ArrivalState }).__t8Arrivals ?? null)
    .catch(() => null);
  const serverCreates = serverLines
    .map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''))
    .map((line) => /POST \/api\/messages\/create (\d{3}) in (\d+)ms(?: \(.*application-code: (\d+)ms\))?/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ status: Number(match[1]), totalMs: Number(match[2]), appMs: match[3] ? Number(match[3]) : null }));
  return {
    arrivalsMs: texts.map((text) => (arrivals?.first[text] === undefined ? null : arrivals.first[text] - reconnectedAt)),
    createStartMs: creates.map((attempt) => attempt.startedAt - reconnectedAt),
    createMs: creates.map((attempt) => (attempt.endedAt === undefined ? null : attempt.endedAt - attempt.startedAt)),
    gapMs: creates.slice(1).map((attempt, index) => {
      const previousEnd = creates[index].endedAt;
      return previousEnd === undefined ? null : attempt.startedAt - previousEnd;
    }),
    failures: creates.map((attempt) => attempt.failure ?? null),
    serverCreates,
  };
}

/** BR-003: each create of the conversation started only after the previous one ended. */
function expectNoOverlap(attempts: readonly CreateAttempt[]): void {
  for (let index = 1; index < attempts.length; index += 1) {
    const previous = attempts[index - 1];
    expect(previous.endSeq, `create ${index - 1} ended`).toBeDefined();
    expect(attempts[index].startSeq, `create ${index} starts after create ${index - 1} ended`).toBeGreaterThan(
      previous.endSeq as number,
    );
  }
}

/** Holds every create of `page` until `release()`, then passes it to the real server. */
async function holdCreates(page: Page): Promise<{ count(): number; release(): void }> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  await page.route('**/api/messages/create', async (route: Route) => {
    count += 1;
    await released;
    await route.continue();
  });
  return { count: () => count, release };
}

test.describe('Phase 5 T8 — durable outbox', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-001/AC-002: offline sends are queued, then delivered in order, once each, within 10 s', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');

    // A reply target with one earlier reply, so its thread can be expanded.
    const parentText = `t8 parent ${randomUUID()}`;
    const parentId = await createViaApi(a.page, { conversationId: directId, content: parentText });
    await createViaApi(a.page, { conversationId: directId, content: `t8 earlier reply ${randomUUID()}`, replyToId: parentId });

    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await b.page.getByTestId(`reply-count-${parentId}`).click();
    await openConversation(a.page, directId);
    await a.page.getByTestId(`reply-count-${parentId}`).click();
    const creates = trackCreates(a.page);

    const texts = [`t8 offline one ${randomUUID()}`, `t8 offline reply ${randomUUID()}`, `t8 offline three ${randomUUID()}`];
    await watchArrivals(b.page, texts);

    await goOffline(a.page);
    await sendFromComposer(a.page, texts[0]);
    await a.page.getByTestId(`reply-button-${parentId}`).click();
    await expect(composer(a.page).getByTestId('reply-composer-preview')).toContainText(parentText);
    await sendFromComposer(a.page, texts[1]);
    await expect(composer(a.page).getByTestId('reply-composer-preview')).toBeHidden();
    await sendFromComposer(a.page, texts[2]);

    // AC-001: pending with a text label, composer empty, in the outbox, nothing sent.
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(3);
    const queued = await readOutbox(a.page);
    expect(queued.map((item) => item.content)).toEqual(texts);
    expect(queued.map((item) => item.replyToId)).toEqual([null, parentId, null]);
    for (const item of queued) {
      expect(item).toMatchObject({ ownerId: a.user.userId, conversationId: directId, state: 'waiting', attemptGeneration: 0 });
      await expectPendingLabel(a.page, item.clientMessageId, 'pending', 'pendente');
    }
    expect(queued[1].order).toBeGreaterThan(queued[0].order);
    expect(queued[2].order).toBeGreaterThan(queued[1].order);
    await expect(composerInput(a.page)).toHaveValue('');
    // B does not see them; nothing reached the server.
    await a.page.waitForTimeout(1_500);
    expect(creates, 'no create request while offline').toHaveLength(0);
    expect(await storedWithTexts(directId, texts)).toHaveLength(0);
    expect(Object.values((await readArrivals(b.page)).max).every((count) => count === 0)).toBe(true);

    // AC-002: connectivity returns; no click.
    const reconnectedAt = Date.now();
    await a.context.setOffline(false);
    await expect
      .poll(async () => Object.keys((await readArrivals(b.page)).first).length, { timeout: D1_DEADLINE_MS })
      .toBe(3);
    const arrivals = await readArrivals(b.page);
    const lastArrival = Math.max(...texts.map((text) => arrivals.first[text]));
    expect(lastArrival - reconnectedAt, 'B saw all three within 10 s of reconnecting').toBeLessThanOrEqual(D1_DEADLINE_MS);
    expect([...texts].sort((x, y) => arrivals.first[x] - arrivals.first[y]), 'B saw them in send order').toEqual(texts);

    const stored = await storedWithTexts(directId, texts);
    expect(stored.map((row) => row.content), 'one stored row per text, in send order').toEqual(texts);
    expect(stored.map((row) => row.key)).toEqual(queued.map((item) => item.clientMessageId));
    expect(stored.map((row) => row.reply_to_id)).toEqual([null, parentId, null]);
    expect(stored.every((row) => row.sender_id === a.user.userId)).toBe(true);

    await expectDeliveredInFeed(a.page, stored);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    const sent = creates;
    expect(sent.filter((attempt) => attempt.failure !== undefined), 'no failed create').toHaveLength(0);
    expect(sent.map((attempt) => attempt.body.clientMessageId)).toEqual(queued.map((item) => item.clientMessageId));
    for (const attempt of sent) {
      expect(attempt.body).toMatchObject({ attemptGeneration: 1, expectedSenderId: a.user.userId });
      expect(attempt.body).not.toHaveProperty('mentionIds');
    }
    expectNoOverlap(sent);

    // Once each, throughout.
    await b.page.waitForTimeout(1_500);
    const settled = await readArrivals(b.page);
    for (const text of texts) expect(settled.max[text], `B never showed "${text}" twice`).toBe(1);
  });

  test('D1: ten messages queued offline are delivered in order, once each, within 10 s, one create at a time', async ({
    phase5World,
    openDevice,
    serverLog,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t8 warm-up ${randomUUID()}` });

    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);
    const creates = trackCreates(a.page);

    const texts = Array.from({ length: 10 }, (_, index) => `t8 burst ${index + 1} ${randomUUID()}`);
    await watchArrivals(b.page, texts);
    await goOffline(a.page);
    const queued = await queueOffline(a, directId, texts);
    expect(creates, 'no create request while offline').toHaveLength(0);

    const logMark = serverLog.mark();
    const reconnectedAt = Date.now();
    await a.context.setOffline(false);
    try {
      await expect
        .poll(async () => Object.keys((await readArrivals(b.page)).first).length, { timeout: D1_DEADLINE_MS })
        .toBe(10);
      const arrivals = await readArrivals(b.page);
      const lastArrival = Math.max(...texts.map((text) => arrivals.first[text]));
      expect(lastArrival - reconnectedAt, 'B saw all ten within 10 s of reconnecting').toBeLessThanOrEqual(D1_DEADLINE_MS);
      expect([...texts].sort((x, y) => arrivals.first[x] - arrivals.first[y]), 'B saw them in send order').toEqual(texts);

      const stored = await storedWithTexts(directId, texts);
      expect(stored.map((row) => row.content), 'one stored row per text, in send order').toEqual(texts);
      expect(stored.map((row) => row.key)).toEqual(queued.map((item) => item.clientMessageId));

      const sent = creates;
      expect(sent.filter((attempt) => attempt.failure !== undefined), 'no failed create').toHaveLength(0);
      expect(sent.map((attempt) => attempt.body.clientMessageId), 'one create per item, in order').toEqual(
        queued.map((item) => item.clientMessageId),
      );
      expect(sent.every((attempt) => attempt.body.attemptGeneration === 1)).toBe(true);
      expectNoOverlap(sent);
      const lastResponse = Math.max(...sent.map((attempt) => attempt.endedAt ?? Infinity));
      expect(lastResponse - reconnectedAt, 'every create answered within 10 s').toBeLessThanOrEqual(D1_DEADLINE_MS);

      await expectDeliveredInFeed(a.page, stored);
      await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
      await b.page.waitForTimeout(1_500);
      const settled = await readArrivals(b.page);
      for (const text of texts) expect(settled.max[text], `B never showed "${text}" twice`).toBe(1);
    } finally {
      // Diagnostics, also when an assertion above failed (review r3 #3). Best
      // effort (review r4 #2): nothing here may throw and replace the original
      // failure; a part that cannot be read is recorded as an error.
      let serverLines: string[] = [];
      let serverLogError: string | null = null;
      try {
        serverLines = serverLog.linesSince(logMark);
      } catch (error) {
        serverLogError = error instanceof Error ? error.message : String(error);
      }
      try {
        const timing = await d1Timing(b.page, texts, creates, reconnectedAt, serverLines);
        testInfo.annotations.push({ type: 't8-d1-timing', description: JSON.stringify({ ...timing, serverLogError }) });
      } catch (error) {
        testInfo.annotations.push({
          type: 't8-d1-timing-error',
          description: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  test('AC-004: a pending item survives an offline reload and is delivered once when the app loads again', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t8 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);

    const text = `t8 reload ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    await goOffline(a.page);
    const [item] = await queueOffline(a, directId, [text]);

    // Reloading offline shows the browser's own offline error (no offline app shell, D2).
    await expect(a.page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
    await expect(a.page.getByTestId('messaging-drawer-trigger'), 'the app is not loaded').toHaveCount(0);

    // The network returns; the app loads again with the item, still pending, and sends it.
    const creates = trackCreates(a.page);
    const held = await holdCreates(a.page);
    await a.context.setOffline(false);
    await a.page.goto('/floor-plan');
    await expect.poll(() => held.count(), { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await openConversation(a.page, directId);
    await expectPendingLabel(a.page, item.clientMessageId, 'sending', 'enviando');
    expect((await readOutbox(a.page)).map((row) => [row.clientMessageId, row.state, row.attemptGeneration])).toEqual([
      [item.clientMessageId, 'claimed', 1],
    ]);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);
    expect((await readArrivals(b.page)).max[text]).toBe(0);

    held.release();
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored[0].key).toBe(item.clientMessageId);
    await expectDeliveredInFeed(a.page, stored);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    expect(creates.map((attempt) => [attempt.body.clientMessageId, attempt.body.attemptGeneration])).toEqual([
      [item.clientMessageId, 1],
    ]);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(await storedWithTexts(directId, [text])).toHaveLength(1);
  });

  test('AC-004: a pending item survives closing its tab and is delivered once when the app is opened again', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t8 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);

    const text = `t8 tab closed ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    await goOffline(a.page);
    const [item] = await queueOffline(a, directId, [text]);

    // The only tab of A closes with the item pending; the network comes back
    // while no tab of the app is open: nothing is sent.
    await a.page.close();
    await a.context.setOffline(false);
    await b.page.waitForTimeout(3_000);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);
    expect((await readArrivals(b.page)).max[text]).toBe(0);

    // A opens the app again: the item is delivered once, without any click.
    const reopened = await a.newTab();
    const creates = trackCreates(reopened);
    await reopened.goto('/floor-plan');
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored[0].key).toBe(item.clientMessageId);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect.poll(async () => (await readOutbox(reopened)).length).toBe(0);
    await openConversation(reopened, directId);
    await expectDeliveredInFeed(reopened, stored);
    expect(creates.map((attempt) => [attempt.body.clientMessageId, attempt.body.attemptGeneration])).toEqual([
      [item.clientMessageId, 1],
    ]);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(await storedWithTexts(directId, [text])).toHaveLength(1);
  });

  test('AC-039: with IndexedDB unavailable nothing is sent and the text and reply target stay with the D5 message', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const parentText = `t8 d5 parent ${randomUUID()}`;
    const parentId = await createViaApi(a.page, { conversationId: directId, content: parentText });

    // Storage blocked for the site: opening any IndexedDB database throws.
    await a.context.addInitScript(() => {
      IDBFactory.prototype.open = function blockedOpen(): IDBOpenDBRequest {
        throw new DOMException('Access to storage is not allowed for this site', 'SecurityError');
      };
    });
    await a.page.goto('/floor-plan');
    await openConversation(a.page, directId);
    const creates = trackCreates(a.page);

    await a.page.getByTestId(`reply-button-${parentId}`).click();
    const replyPreview = composer(a.page).getByTestId('reply-composer-preview');
    await expect(replyPreview).toContainText(parentText);
    const text = `t8 storage blocked ${randomUUID()}`;
    await sendFromComposer(a.page, text);

    const storageError = composer(a.page).getByTestId('composer-storage-error');
    await expect(storageError).toBeVisible();
    await expect(storageError).toHaveText(D5_TEXT);
    await expect(storageError).toHaveAttribute('role', 'alert');
    await expect(composerInput(a.page)).toHaveValue(text);
    await expect(replyPreview).toContainText(parentText);
    await expect(a.page.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
    await expect(composer(a.page).getByTestId('composer-send-error')).toHaveCount(0);

    // Pressing send again does the same: still nothing dispatched.
    await composer(a.page).getByTestId('message-send-button').click();
    await expect(storageError).toBeVisible();
    await a.page.waitForTimeout(1_500);
    expect(creates, 'zero create requests').toHaveLength(0);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);
    await expect(composerInput(a.page)).toHaveValue(text);
    await expect(replyPreview).toContainText(parentText);
  });

  test('AC-039: when the outbox write fails nothing is sent and the draft stays; once writes work it is sent', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    const parentText = `t8 d5w parent ${randomUUID()}`;
    const parentId = await createViaApi(a.page, { conversationId: directId, content: parentText });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);

    // Writes to the outbox fail to commit (the transaction aborts, as when the
    // site's storage quota is exhausted); opening and reading still work.
    await a.context.addInitScript(() => {
      const scope = window as unknown as { __t8FailOutboxWrites: boolean };
      scope.__t8FailOutboxWrites = true;
      const failWrite = (store: IDBObjectStore) => {
        if (!scope.__t8FailOutboxWrites) return;
        queueMicrotask(() => {
          try {
            store.transaction.abort();
          } catch {
            // Already finished.
          }
        });
      };
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function failingAdd(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
        const request = add.apply(this, args);
        failWrite(this);
        return request;
      };
    });
    await a.page.goto('/floor-plan');
    await openConversation(a.page, directId);
    const creates = trackCreates(a.page);

    await a.page.getByTestId(`reply-button-${parentId}`).click();
    const replyPreview = composer(a.page).getByTestId('reply-composer-preview');
    await expect(replyPreview).toContainText(parentText);
    const text = `t8 write fails ${randomUUID()}`;
    await sendFromComposer(a.page, text);

    const storageError = composer(a.page).getByTestId('composer-storage-error');
    await expect(storageError).toHaveText(D5_TEXT);
    await expect(composerInput(a.page)).toHaveValue(text);
    await expect(replyPreview).toContainText(parentText);
    await expect(a.page.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
    await a.page.waitForTimeout(1_500);
    expect(creates, 'zero create requests').toHaveLength(0);
    expect(await readOutbox(a.page)).toHaveLength(0);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);

    // Writes work again: the same draft is queued and delivered once.
    await a.page.evaluate(() => {
      (window as unknown as { __t8FailOutboxWrites: boolean }).__t8FailOutboxWrites = false;
    });
    await composer(a.page).getByTestId('message-send-button').click();
    await expect(composerInput(a.page)).toHaveValue('');
    await expect(storageError).toBeHidden();
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored[0].reply_to_id).toBe(parentId);
    expect(creates).toHaveLength(1);
    expect(creates[0].body).toMatchObject({ content: text, replyToId: parentId, attemptGeneration: 1 });
    await expect(b.page.getByTestId(`reply-count-${parentId}`)).toHaveText(/1 reply/, { timeout: STEP_TIMEOUT_MS });
  });

  test('AC-011: files are never queued — offline upload fails per file, and a failed create keeps the Phase 4 composer failure', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t8 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);
    const creates = trackCreates(a.page);
    const pendingFile = composer(a.page).getByTestId('pending-file');
    const sendButton = composer(a.page).getByTestId('message-send-button');
    const file = { name: 't8-relatorio.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n%t8 ${randomUUID()}\n%%EOF\n`) };
    const text = `t8 with file ${randomUUID()}`;

    // Offline: the upload fails with the per-file error and retry; Send stays disabled.
    await goOffline(a.page);
    await composerInput(a.page).fill(text);
    await composer(a.page).getByTestId('composer-file-input').setInputFiles(file);
    await expect(pendingFile).toHaveAttribute('data-upload-status', 'failed', { timeout: STEP_TIMEOUT_MS });
    await expect(pendingFile.getByTestId('pending-file-error')).toBeVisible();
    await expect(pendingFile.getByTestId('pending-file-retry')).toBeVisible();
    await expect(sendButton).toBeDisabled();
    expect(await readOutbox(a.page)).toHaveLength(0);

    // Online again: the upload is retried and succeeds; then the network drops and A sends.
    await a.context.setOffline(false);
    await pendingFile.getByTestId('pending-file-retry').click();
    await expect(pendingFile).toHaveAttribute('data-upload-status', 'uploaded', { timeout: STEP_TIMEOUT_MS });
    await goOffline(a.page);
    await sendButton.click();
    const sendError = composer(a.page).getByTestId('composer-send-error');
    await expect(sendError).toBeVisible();
    await expect(sendError).toContainText('Mensagem não enviada.');
    const retry = sendError.getByRole('button', { name: 'Tentar de novo' });
    await expect(retry).toBeVisible();
    await expect(composerInput(a.page)).toHaveValue(text);
    await expect(pendingFile).toHaveAttribute('data-upload-status', 'uploaded');
    await expect(a.page.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
    expect(await readOutbox(a.page), 'nothing enters the outbox').toHaveLength(0);
    expect(creates).toHaveLength(1);
    expect(creates[0].failure).toBeDefined();
    expect(creates[0].body).toMatchObject({ content: text });
    expect(creates[0].body).not.toHaveProperty('attemptGeneration');
    const firstKey = creates[0].body.clientMessageId;

    // Phase 4 retry, same key: one message with its file.
    await a.context.setOffline(false);
    await retry.click();
    await expect(composerInput(a.page)).toHaveValue('', { timeout: STEP_TIMEOUT_MS });
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    expect(creates).toHaveLength(2);
    expect(creates[1].body.clientMessageId).toBe(firstKey);
    expect(creates[1].body.attachmentIds).toHaveLength(1);
    const [stored] = await storedWithTexts(directId, [text]);
    await expect(b.page.getByTestId(`message-${stored.id}`)).toHaveAttribute('data-attachment-count', '1', {
      timeout: STEP_TIMEOUT_MS,
    });
    expect(await readOutbox(a.page)).toHaveLength(0);
  });
  test('review r1 #1: a pending bubble offers no Reply, and later messages of the conversation still drain', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    const storedText = `t8 stored ${randomUUID()}`;
    const storedId = await createViaApi(a.page, { conversationId: directId, content: storedText });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);
    const creates = trackCreates(a.page);

    const texts = [`t8 pending target ${randomUUID()}`, `t8 later ${randomUUID()}`];
    await watchArrivals(b.page, texts);
    await goOffline(a.page);
    const [pending] = await queueOffline(a, directId, [texts[0]]);
    const pendingId = `temp-${pending.clientMessageId}`;

    // A stored message offers both Reply controls; the pending copy offers none.
    await expect(a.page.getByTestId(`reply-button-${storedId}`)).toBeVisible();
    await a.page.getByTestId(`message-${storedId}`).hover();
    await expect(a.page.getByTestId(`message-action-reply-${storedId}`)).toBeVisible();
    await expect(a.page.getByTestId(`reply-button-${pendingId}`)).toHaveCount(0);
    await a.page.getByTestId(`message-${pendingId}`).hover();
    await expect(a.page.getByTestId(`message-actions-${pendingId}`)).toBeVisible();
    await expect(a.page.getByTestId(`message-action-reply-${pendingId}`)).toHaveCount(0);
    await expect(composer(a.page).getByTestId('reply-composer-preview')).toHaveCount(0);

    // A later message of the same conversation; then connectivity returns.
    await sendFromComposer(a.page, texts[1]);
    await expect(composerInput(a.page)).toHaveValue('');
    const reconnectedAt = Date.now();
    await a.context.setOffline(false);
    await expect
      .poll(async () => Object.keys((await readArrivals(b.page)).first).length, { timeout: D1_DEADLINE_MS })
      .toBe(2);
    const arrivals = await readArrivals(b.page);
    expect(Math.max(...texts.map((text) => arrivals.first[text])) - reconnectedAt).toBeLessThanOrEqual(D1_DEADLINE_MS);
    const stored = await storedWithTexts(directId, texts);
    expect(stored.map((row) => row.content), 'both delivered once, in order').toEqual(texts);
    expect(stored.every((row) => row.reply_to_id === null)).toBe(true);
    await expect.poll(() => creates.map((attempt) => attempt.status)).toEqual([201, 201]);
    await expectDeliveredInFeed(a.page, stored);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
  });

  test('review r1 #2: a 2xx without the item\'s stored message keeps the item, which is delivered once on a later generation', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t8 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);
    const text = `t8 unusable ack ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    // Network-level faults on the first four attempts: answers that never
    // reached the server — 201 with an empty object, with an array, with
    // another key's message, and with this item's message in every respect
    // except a malformed reply target (review r3 #2). The fifth attempt is
    // held, then passed to the server; its real 201 reaches the page with
    // extra malformed fields the app must ignore.
    const attempts: Array<Record<string, unknown>> = [];
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await a.page.route('**/api/messages/create', async (route: Route) => {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      attempts.push(body);
      const fulfil201 = (payload: unknown) =>
        route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(payload) });
      if (attempts.length === 1) return fulfil201({ message: {} });
      if (attempts.length === 2) return fulfil201({ message: [] });
      if (attempts.length === 3) {
        return fulfil201({
          clientMessageId: body.clientMessageId,
          message: {
            id: randomUUID(),
            conversationId: directId,
            senderId: a.user.userId,
            content: text,
            clientMessageId: randomUUID(),
            timestamp: new Date().toISOString(),
            reactions: [],
          },
        });
      }
      if (attempts.length === 4) {
        return fulfil201({
          clientMessageId: body.clientMessageId,
          attemptGeneration: body.attemptGeneration,
          message: {
            id: randomUUID(),
            conversationId: directId,
            senderId: a.user.userId,
            content: text,
            clientMessageId: body.clientMessageId,
            replyToId: 42,
            timestamp: new Date().toISOString(),
            type: 'text',
            status: 'sent',
            isEdited: false,
            reactions: [],
            attachments: [],
          },
        });
      }
      await released;
      // The real stored message, plus fields the app never reads from a create
      // response (review r4 #1): they must not reach the feed renderers.
      const response = await route.fetch();
      const json = (await response.json()) as { message?: Record<string, unknown> };
      if (json.message) Object.assign(json.message, { stars: {}, pins: 7, readReceipts: 'x' });
      return route.fulfill({ response, json });
    });

    await sendFromComposer(a.page, text);
    await expect(composerInput(a.page)).toHaveValue('');
    // Retries back off 1, 2, 4 and 8 s.
    await expect.poll(() => attempts.length, { timeout: 2 * STEP_TIMEOUT_MS }).toBe(5);
    const key = String(attempts[0].clientMessageId);
    expect(attempts.map((attempt) => [attempt.clientMessageId, attempt.attemptGeneration])).toEqual([
      [key, 1],
      [key, 2],
      [key, 3],
      [key, 4],
      [key, 5],
    ]);
    // The item survived every unusable answer and is still being sent.
    await expectPendingLabel(a.page, key, 'sending', 'enviando');
    expect((await readOutbox(a.page)).map((row) => [row.clientMessageId, row.state, row.attemptGeneration])).toEqual([
      [key, 'claimed', 5],
    ]);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);

    release();
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored[0].key).toBe(key);
    await expectDeliveredInFeed(a.page, stored);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    await b.page.waitForTimeout(1_500);
    expect(attempts).toHaveLength(5);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(await storedWithTexts(directId, [text])).toHaveLength(1);
  });

  test('review r1 #3: when the outbox read right after a committed write fails, the item still shows as pending and is delivered once', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t8 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);

    // Once armed: the first read-only transaction opened after the outbox
    // write is aborted — the read the app makes right after the commit (a
    // storage read failure right after a successful write).
    await a.context.addInitScript(() => {
      const scope = window as unknown as { __t8ArmReadAbort: boolean; __t8ReadAborts: number; __t8AbortNextRead: boolean };
      scope.__t8ArmReadAbort = false;
      scope.__t8ReadAborts = 0;
      scope.__t8AbortNextRead = false;
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function armedAdd(this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
        const request = add.apply(this, args);
        if (scope.__t8ArmReadAbort) {
          // The app reads again as soon as this write commits (no read-only
          // transaction is opened in between), so the next one is that read.
          scope.__t8ArmReadAbort = false;
          scope.__t8AbortNextRead = true;
        }
        return request;
      };
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function abortingTransaction(
        this: IDBDatabase,
        ...args: Parameters<IDBDatabase['transaction']>
      ) {
        const created = transaction.apply(this, args);
        const mode = args[1] ?? 'readonly';
        if (scope.__t8AbortNextRead && mode === 'readonly') {
          scope.__t8AbortNextRead = false;
          scope.__t8ReadAborts += 1;
          queueMicrotask(() => {
            try {
              created.abort();
            } catch {
              // Already finished.
            }
          });
        }
        return created;
      };
    });
    await a.page.goto('/floor-plan');
    await openConversation(a.page, directId);
    const text = `t8 read fails ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    await goOffline(a.page);
    await a.page.evaluate(() => {
      (window as unknown as { __t8ArmReadAbort: boolean }).__t8ArmReadAbort = true;
    });
    await sendFromComposer(a.page, text);
    await expect(composerInput(a.page)).toHaveValue('');
    await expect
      .poll(() => a.page.evaluate(() => (window as unknown as { __t8ReadAborts: number }).__t8ReadAborts))
      .toBe(1);
    const [item] = await readOutbox(a.page);
    expect(item).toMatchObject({ content: text, state: 'waiting', attemptGeneration: 0 });
    await expectPendingLabel(a.page, item.clientMessageId, 'pending', 'pendente');

    await a.context.setOffline(false);
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: D1_DEADLINE_MS }).toBe(1);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored[0].key).toBe(item.clientMessageId);
    await expectDeliveredInFeed(a.page, stored);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
  });
  test('review r2 #1: a reply chosen in one conversation is dropped when an avatar opens a DM, and DM sends are delivered', async ({
    phase5World,
    openDevice,
  }) => {
    const { groupId, directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    const groupText = `t8 group message ${randomUUID()}`;
    const groupMessageId = await createViaApi(b.page, { conversationId: groupId, content: groupText });
    const dmMarker = `t8 dm marker ${randomUUID()}`;
    await createViaApi(a.page, { conversationId: directId, content: dmMarker });

    await openConversation(a.page, groupId);
    const creates = trackCreates(a.page);
    const replyPreview = composer(a.page).getByTestId('reply-composer-preview');
    await a.page.getByTestId(`reply-button-${groupMessageId}`).click();
    await expect(replyPreview).toContainText(groupText);

    // Straight to the DM from B's avatar in the group feed (same drawer feed).
    await a.page
      .getByTestId(`message-${groupMessageId}`)
      .getByRole('button', { name: /avatar actions/ })
      .click();
    await a.page.getByRole('menuitem', { name: /Send Message/ }).click();
    await expect(a.page.locator('[data-testid="messages-feed"] p', { hasText: dmMarker })).toBeVisible({
      timeout: STEP_TIMEOUT_MS,
    });
    await expect(replyPreview, 'the group reply is not carried into the DM').toHaveCount(0);

    const texts = [`t8 dm after switch ${randomUUID()}`, `t8 dm next ${randomUUID()}`];
    for (const text of texts) {
      await sendFromComposer(a.page, text);
      await expect(composerInput(a.page)).toHaveValue('');
    }
    await expect.poll(async () => (await storedWithTexts(directId, texts)).length, { timeout: D1_DEADLINE_MS }).toBe(2);
    const stored = await storedWithTexts(directId, texts);
    expect(stored.map((row) => row.content), 'both DM messages delivered once, in order').toEqual(texts);
    expect(stored.map((row) => row.reply_to_id)).toEqual([null, null]);
    await expect.poll(() => creates.map((attempt) => attempt.status)).toEqual([201, 201]);
    expect(creates.every((attempt) => attempt.body.replyToId === undefined)).toBe(true);
    await expectDeliveredInFeed(a.page, stored);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    expect(await storedWithTexts(groupId, texts)).toHaveLength(0);
  });

  test('review r2 #2/#3: a body-less 2xx, a correlated ack without the message text and a malformed fence answer confirm nothing; the fence confirms once', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t8 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const text = `t8 malformed ack ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    // A queues the message offline and closes the tab. The next tab never
    // loads this conversation's feed (no restored conversation), so only a
    // create response can confirm the item — not the feed or Realtime.
    await openConversation(a.page, directId);
    await goOffline(a.page);
    const [item] = await queueOffline(a, directId, [text]);
    await a.page.evaluate(() => window.localStorage.removeItem('messaging_active_conversation_id'));
    await a.page.close();

    // Create 1: 204 without a body (never reaches the server) → unknown, so
    // the item is fenced before it is sent again (T27): fence 1 (real) says
    // not stored and create 2 goes out under that generation. Create 2
    // reaches the server, which stores the message; its 201 reaches the page
    // without the message text → unknown. Fence 2: the server's real "stored"
    // answer reaches the page with a malformed reaction (review r4 #1) →
    // still unknown. Fence 3: passed through; it confirms the item.
    const attempts: Array<{ body: Record<string, unknown>; serverStatus?: number }> = [];
    const fences: Array<{ body: Record<string, unknown>; outcome?: string }> = [];
    const reopened = await a.newTab();
    await reopened.route('**/api/messages/create', async (route: Route) => {
      const attempt = { body: (route.request().postDataJSON() ?? {}) as Record<string, unknown> } as {
        body: Record<string, unknown>;
        serverStatus?: number;
      };
      attempts.push(attempt);
      if (attempts.length === 1) {
        await route.fulfill({ status: 204 });
        return;
      }
      const response = await route.fetch();
      attempt.serverStatus = response.status();
      if (attempts.length === 2) {
        const json = (await response.json()) as { message?: Record<string, unknown> };
        if (json.message) delete json.message.content;
        await route.fulfill({ response, json });
        return;
      }
      await route.fulfill({ response });
    });
    await reopened.route('**/api/messages/fence', async (route: Route) => {
      const fence: { body: Record<string, unknown>; outcome?: string } = {
        body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
      };
      fences.push(fence);
      const response = await route.fetch();
      const json = (await response.json()) as { outcome?: string; message?: Record<string, unknown> | null };
      fence.outcome = json.outcome;
      if (fences.length === 2 && json.message) {
        json.message.reactions = [{ emoji: {}, userId: phase5World.users.B.userId, timestamp: new Date().toISOString() }];
      }
      await route.fulfill({ response, json });
    });
    await a.context.setOffline(false);
    await reopened.goto('/floor-plan');

    await expect.poll(async () => (await readOutbox(reopened)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    expect(attempts.map((attempt) => [attempt.body.clientMessageId, attempt.body.attemptGeneration, attempt.serverStatus])).toEqual([
      [item.clientMessageId, 1, undefined],
      [item.clientMessageId, 2, 201],
    ]);
    expect(fences.map((fence) => [fence.body.clientMessageId, fence.body.attemptGeneration, fence.outcome])).toEqual([
      [item.clientMessageId, 2, 'not_stored'],
      [item.clientMessageId, 3, 'stored'],
      [item.clientMessageId, 4, 'stored'],
    ]);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored).toHaveLength(1);
    expect(stored[0].key).toBe(item.clientMessageId);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await openConversation(reopened, directId);
    await expectDeliveredInFeed(reopened, stored);
    await b.page.waitForTimeout(1_500);
    expect(attempts).toHaveLength(2);
    expect(fences).toHaveLength(3);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(await storedWithTexts(directId, [text])).toHaveLength(1);
  });
  test('review r3 #1: a committed reply whose parent is deleted before its fence is confirmed by the fence, and the next item drains', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    const parentText = `t8 parent to delete ${randomUUID()}`;
    const parentId = await createViaApi(a.page, { conversationId: directId, content: parentText });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const replyText = `t8 reply lost response ${randomUUID()}`;
    const laterText = `t8 after the replay ${randomUUID()}`;
    await watchArrivals(b.page, [laterText]);

    // A queues a reply to its own message, then a later message, offline; the
    // next tab never loads this conversation's feed, so only a create
    // response can confirm them (not the feed or Realtime).
    await openConversation(a.page, directId);
    await goOffline(a.page);
    await a.page.getByTestId(`reply-button-${parentId}`).click();
    await expect(composer(a.page).getByTestId('reply-composer-preview')).toContainText(parentText);
    await sendFromComposer(a.page, replyText);
    await expect(composerInput(a.page)).toHaveValue('');
    await sendFromComposer(a.page, laterText);
    await expect(composerInput(a.page)).toHaveValue('');
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(2);
    const [reply, later] = await readOutbox(a.page);
    expect([reply.content, reply.replyToId, later.content, later.replyToId]).toEqual([replyText, parentId, laterText, null]);
    await a.page.evaluate(() => window.localStorage.removeItem('messaging_active_conversation_id'));
    await a.page.close();

    // Attempt 1 reaches the server, which stores the reply; the page gets a
    // network failure instead of the 201. The item is then fenced (T27); the
    // fence waits until A has deleted the reply's parent; then everything
    // passes through.
    const attempts: Array<{ body: Record<string, unknown>; serverStatus?: number }> = [];
    const fences: Array<{ body: Record<string, unknown>; outcome?: string }> = [];
    let parentDeleted!: () => void;
    const parentGone = new Promise<void>((resolve) => {
      parentDeleted = resolve;
    });
    const reopened = await a.newTab();
    await reopened.route('**/api/messages/fence', async (route: Route) => {
      const fence: { body: Record<string, unknown>; outcome?: string } = {
        body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
      };
      fences.push(fence);
      await parentGone;
      const response = await route.fetch();
      fence.outcome = ((await response.json()) as { outcome?: string }).outcome;
      await route.fulfill({ response });
    });
    await reopened.route('**/api/messages/create', async (route: Route) => {
      const attempt: { body: Record<string, unknown>; serverStatus?: number } = {
        body: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
      };
      attempts.push(attempt);
      const response = await route.fetch();
      attempt.serverStatus = response.status();
      if (attempts.length === 1) {
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response });
    });
    await a.context.setOffline(false);
    await reopened.goto('/floor-plan');
    await expect.poll(() => attempts[0]?.serverStatus, { timeout: STEP_TIMEOUT_MS }).toBe(201);
    const [storedReply] = await storedWithTexts(directId, [replyText]);
    expect(storedReply.reply_to_id).toBe(parentId);

    // A deletes its own parent message from another session (Data API under
    // RLS): the stored reply's reply target becomes null.
    expect(await deleteOwnMessageFromAnotherSession(a.user, parentId)).toBe(1);
    await expect
      .poll(async () => (await storedWithTexts(directId, [replyText]))[0]?.reply_to_id ?? null)
      .toBeNull();
    parentDeleted();

    // The fence ("stored", the stored message without a reply target)
    // confirms the reply without a second create, and the later message is sent.
    await expect.poll(async () => (await readOutbox(reopened)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    expect(attempts.map((attempt) => [attempt.body.clientMessageId, attempt.body.attemptGeneration, attempt.serverStatus])).toEqual([
      [reply.clientMessageId, 1, 201],
      [later.clientMessageId, 1, 201],
    ]);
    expect(fences.map((fence) => [fence.body.clientMessageId, fence.body.attemptGeneration, fence.outcome])).toEqual([
      [reply.clientMessageId, 2, 'stored'],
    ]);
    const stored = await storedWithTexts(directId, [replyText, laterText]);
    expect(stored.map((row) => [row.content, row.key, row.reply_to_id])).toEqual([
      [replyText, reply.clientMessageId, null],
      [laterText, later.clientMessageId, null],
    ]);
    await expect(b.page.getByTestId(`message-${stored[1].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await openConversation(reopened, directId);
    await expectDeliveredInFeed(reopened, stored);
    await b.page.waitForTimeout(1_500);
    expect(attempts).toHaveLength(2);
    expect(fences).toHaveLength(1);
    expect((await readArrivals(b.page)).max[laterText]).toBe(1);
  });
});
