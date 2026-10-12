import { randomUUID } from 'node:crypto';

import type { Page, Route } from '@playwright/test';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5-faults';
import { waitForRealtimeReady } from '../helpers/drawer-helpers';
import {
  STEP_TIMEOUT_MS,
  createViaApi,
  expectDeliveredInFeed,
  goOffline,
  openConversation,
  queueOffline,
  readArrivals,
  readOutbox,
  sendFromComposer,
  storedWithTexts,
  trackOutboxCalls as trackCalls,
  watchArrivals,
  type OutboxApiCall as ApiCall,
  type OutboxRow,
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T27 — unknown-outcome recovery through the fence (FR-005, FR-006,
 * FR-009, BR-005, BR-007; AC-003, AC-038, AC-040, AC-042, AC-046 5xx clause).
 *
 * Everything is real: the app, its IndexedDB outbox, POST /api/messages/create
 * and POST /api/messages/fence, and the local database. Faults are network
 * shaping only (SPEC §15): a request aborted before it reaches the server
 * (network error), a response dropped or replaced by a gateway 502 after the
 * real server answered (route.fetch), a request held and then the tab closed,
 * and fence requests failed in transit for a while (the item stays unknown).
 * Expiry uses the page's test-controlled clock (Date only; timers keep
 * running). Removal from the room is the fixture's administrative
 * revocation; re-adding uses restore_conversation_membership.
 *
 * When the server stored the message, A must not learn it from its feed or
 * Realtime before the fence (that would confirm the item without one): the
 * item is queued offline, the tab is closed, and a new tab that never loads
 * that feed recovers it — or, where A's feed must stay visible, A's messages
 * Realtime stream is withheld (T25 fault harness).
 */

const DAY_MS = 24 * 60 * 60 * 1_000;

/** [kind, generation, status | 'network-error', fence outcome] of the calls that got an answer or failed. */
const summary = (calls: readonly ApiCall[]) =>
  calls.map((call) => [call.kind, call.generation, call.failure ? 'network-error' : (call.status ?? null), call.outcome ?? null]);
const answered = (calls: readonly ApiCall[]) => calls.filter((call) => !call.failure);

/**
 * A queues `text` offline with the conversation open, then closes the tab
 * without leaving that conversation restorable: a later tab never loads its
 * feed, so only a create or fence response can resolve the item.
 */
async function queueThenCloseTab(a: Phase5Device, conversationId: string, text: string): Promise<OutboxRow> {
  await openConversation(a.page, conversationId);
  await goOffline(a.page);
  const [item] = await queueOffline(a, conversationId, [text]);
  await a.page.evaluate(() => window.localStorage.removeItem('messaging_active_conversation_id'));
  await a.page.close();
  return item;
}

/** Fails every fence of `page` in transit while `blocked()` (the item stays unknown). */
async function blockFences(page: Page, blocked: () => boolean): Promise<void> {
  await page.route('**/api/messages/fence', async (route: Route) => {
    if (blocked()) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
}

const bubble = (page: Page, key: string) => page.getByTestId(`message-temp-${key}`);
const stateLabel = (page: Page, key: string) => page.getByTestId(`message-delivery-state-temp-${key}`);
const retryButton = (page: Page, key: string) => page.getByTestId(`message-retry-temp-${key}`);
const discardButton = (page: Page, key: string) => page.getByTestId(`message-discard-temp-${key}`);

/** An unknown item shows "enviando" and offers no action (no cancel, retry or delete) before it is fenced. */
async function expectSendingWithoutActions(page: Page, key: string): Promise<void> {
  await expect(stateLabel(page, key)).toHaveText('enviando', { timeout: STEP_TIMEOUT_MS });
  await expect(stateLabel(page, key)).toHaveAttribute('data-delivery-state', 'sending');
  await expect(bubble(page, key).getByRole('button')).toHaveCount(0);
}

test.describe('Phase 5 T27 — unknown outcomes recover through the fence', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-003: a create that fails with a network error after dispatch is fenced (not stored), then sent once', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t27 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);
    const text = `t27 network error ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    const calls = trackCalls(a.page);
    let creates = 0;
    await a.page.route('**/api/messages/create', async (route: Route) => {
      creates += 1;
      // The first create never reaches the server: the browser gets a network error.
      if (creates === 1) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await sendFromComposer(a.page, text);
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    const [stored] = await storedWithTexts(directId, [text]);
    await expect.poll(() => summary(calls)).toEqual([
      ['create', 1, 'network-error', null],
      ['fence', 2, 200, 'not_stored'],
      ['create', 2, 201, null],
    ]);
    expect(calls.every((call) => call.key === stored.key)).toBe(true);

    await expectDeliveredInFeed(a.page, [stored]);
    await expect(b.page.getByTestId(`message-${stored.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(calls).toHaveLength(3);
    expect(await storedWithTexts(directId, [text])).toHaveLength(1);
  });

  for (const variant of [
    { name: 'AC-038: a stored create whose response is dropped', status: 'network-error' as const },
    { name: 'AC-046: a stored create answered by a gateway 502 after it reached the server', status: 502 as const },
  ]) {
    test(`${variant.name} is fenced as stored and delivered without a second create`, async ({ phase5World, openDevice }) => {
      const { directId } = phase5World.conversations;
      const a = await openDevice('A');
      const b = await openDevice('B');
      await createViaApi(a.page, { conversationId: directId, content: `t27 warm-up ${randomUUID()}` });
      await openConversation(b.page, directId);
      await waitForRealtimeReady(b.page);
      const text = `t27 lost answer ${variant.status} ${randomUUID()}`;
      await watchArrivals(b.page, [text]);
      const item = await queueThenCloseTab(a, directId, text);

      const reopened = await a.newTab();
      const calls = trackCalls(reopened);
      const serverStatuses: number[] = [];
      await reopened.route('**/api/messages/create', async (route: Route) => {
        const response = await route.fetch();
        serverStatuses.push(response.status());
        if (serverStatuses.length > 1) {
          await route.fulfill({ response });
        } else if (variant.status === 'network-error') {
          await route.abort('failed');
        } else {
          await route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' });
        }
      });
      await a.context.setOffline(false);
      await reopened.goto('/floor-plan');

      await expect.poll(async () => (await readOutbox(reopened)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
      await expect.poll(() => summary(calls)).toEqual([
        ['create', 1, variant.status, null],
        ['fence', 2, 200, 'stored'],
      ]);
      expect(serverStatuses, 'the server stored it on the only create').toEqual([201]);
      const stored = await storedWithTexts(directId, [text]);
      expect(stored).toHaveLength(1);
      expect(stored[0].key).toBe(item.clientMessageId);
      await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await openConversation(reopened, directId);
      await expectDeliveredInFeed(reopened, stored);
      await b.page.waitForTimeout(1_500);
      expect((await readArrivals(b.page)).max[text]).toBe(1);
      expect(calls).toHaveLength(2);
    });
  }

  test('AC-040: a held create whose tab closes is fenced when the app is opened again, and B sees it once', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t27 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, directId);
    const text = `t27 held then closed ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    // The create is held in the browser and never released.
    let held = 0;
    await a.page.route('**/api/messages/create', async () => {
      held += 1;
      await new Promise<void>(() => undefined);
    });
    await sendFromComposer(a.page, text);
    await expect.poll(() => held).toBe(1);
    const [item] = await readOutbox(a.page);
    expect(item).toMatchObject({ content: text, state: 'claimed', attemptGeneration: 1 });
    await a.page.close();
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);

    const reopened = await a.newTab();
    const calls = trackCalls(reopened);
    await reopened.goto('/floor-plan');
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(() => summary(calls)).toEqual([
      ['fence', 2, 200, 'not_stored'],
      ['create', 2, 201, null],
    ]);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored[0].key).toBe(item.clientMessageId);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect.poll(async () => (await readOutbox(reopened)).length).toBe(0);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(await storedWithTexts(directId, [text])).toHaveLength(1);
  });

  test('AC-042: a stored but unknown item whose 24 h pass is fenced as delivered and never shows "expirada"', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t27 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const text = `t27 stored at 24 h ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    const item = await queueThenCloseTab(a, directId, text);

    const reopened = await a.newTab();
    const calls = trackCalls(reopened);
    let fencesBlocked = true;
    await blockFences(reopened, () => fencesBlocked);
    let creates = 0;
    await reopened.route('**/api/messages/create', async (route: Route) => {
      creates += 1;
      const response = await route.fetch();
      if (creates === 1) {
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response });
    });
    await a.context.setOffline(false);
    await reopened.goto('/floor-plan');
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(() => calls.filter((call) => call.kind === 'fence' && call.failure).length, {
      timeout: STEP_TIMEOUT_MS,
    }).toBeGreaterThanOrEqual(1);

    // 25 h later (the item's window ended), fences get through.
    await reopened.clock.setFixedTime(item.windowStartedAt + DAY_MS + 60 * 60 * 1_000);
    fencesBlocked = false;
    const seenStates = new Set<string>();
    await expect
      .poll(
        async () => {
          const rows = await readOutbox(reopened);
          rows.forEach((row) => seenStates.add(row.state));
          return rows.length;
        },
        { timeout: 2 * STEP_TIMEOUT_MS, intervals: [100] },
      )
      .toBe(0);
    expect([...seenStates], 'never expired or failed').not.toContain('expired');
    expect([...seenStates]).not.toContain('failed');
    // The only answered request after the lost create: one fence, "stored".
    await expect
      .poll(() => summary(answered(calls)).map(([kind, , status, outcome]) => [kind, status, outcome]))
      .toEqual([['fence', 200, 'stored']]);
    expect(calls.filter((call) => call.kind === 'create'), 'one create').toHaveLength(1);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored).toHaveLength(1);
    expect(stored[0].key).toBe(item.clientMessageId);

    await openConversation(reopened, directId);
    await expectDeliveredInFeed(reopened, stored);
    await expect(reopened.locator('[data-delivery-state="expired"]')).toHaveCount(0);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
  });

  test('an unknown item fenced as not stored after its 24 h window is "expirada" without any create; "Apagar" removes only the local item', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    await createViaApi(a.page, { conversationId: directId, content: `t27 warm-up ${randomUUID()}` });
    await openConversation(a.page, directId);
    const text = `t27 not stored at 24 h ${randomUUID()}`;

    const calls = trackCalls(a.page);
    let fencesBlocked = true;
    await blockFences(a.page, () => fencesBlocked);
    // No create ever reaches the server.
    await a.page.route('**/api/messages/create', (route: Route) => route.abort('failed'));
    await sendFromComposer(a.page, text);
    await expect.poll(() => calls.filter((call) => call.kind === 'fence' && call.failure).length, {
      timeout: STEP_TIMEOUT_MS,
    }).toBeGreaterThanOrEqual(1);
    const [item] = await readOutbox(a.page);
    const key = item.clientMessageId;
    await expectSendingWithoutActions(a.page, key);

    await a.page.clock.setFixedTime(item.windowStartedAt + DAY_MS + 60 * 60 * 1_000);
    const createsBefore = calls.filter((call) => call.kind === 'create').length;
    expect(createsBefore).toBe(1);
    fencesBlocked = false;

    await expect(stateLabel(a.page, key)).toHaveText('expirada', { timeout: 2 * STEP_TIMEOUT_MS });
    await expect(stateLabel(a.page, key)).toHaveAttribute('data-delivery-state', 'expired');
    await expect(retryButton(a.page, key)).toHaveText('Tentar de novo');
    await expect(discardButton(a.page, key)).toHaveText('Apagar');
    expect(await readOutbox(a.page)).toEqual([
      expect.objectContaining({ clientMessageId: key, state: 'expired', failureReason: null, content: text }),
    ]);
    await expect.poll(() => summary(answered(calls)).map(([kind, , status, outcome]) => [kind, status, outcome])).toEqual([
      ['fence', 200, 'not_stored'],
    ]);
    // No automatic attempt after the fence.
    await a.page.waitForTimeout(4_000);
    expect(calls.filter((call) => call.kind === 'create'), 'no create after the fence').toHaveLength(createsBefore);
    expect(answered(calls)).toHaveLength(1);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);

    // "Apagar": the item disappears from the feed and the outbox; nothing is sent.
    const callsBefore = calls.length;
    await discardButton(a.page, key).click();
    await expect(bubble(a.page, key)).toHaveCount(0);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    await a.page.waitForTimeout(2_000);
    expect(calls, 'no request for "Apagar"').toHaveLength(callsBefore);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);
  });

  test('access lost while a committed message is unknown: the 403 fence fails it (text kept, no attempts); re-added, "Tentar de novo" delivers it once without a create', async ({
    phase5World,
    openDevice,
    membership,
    realtimeFaults,
  }) => {
    const { roomId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: roomId, content: `t27 warm-up ${randomUUID()}` });
    await openConversation(b.page, roomId);
    await waitForRealtimeReady(b.page);
    const text = `t27 committed then removed ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    // A's feed stays open, but A's messages stream is withheld, so A cannot
    // learn of the stored message except through the fence.
    const aRealtime = await realtimeFaults.attach(a);
    await openConversation(a.page, roomId);
    await aRealtime.waitForReady('messages');
    await aRealtime.fail('messages', 'error');

    const calls = trackCalls(a.page);
    let fencesBlocked = true;
    await blockFences(a.page, () => fencesBlocked);
    const serverStatuses: number[] = [];
    await a.page.route('**/api/messages/create', async (route: Route) => {
      const response = await route.fetch();
      serverStatuses.push(response.status());
      await route.abort('failed');
    });
    await sendFromComposer(a.page, text);
    await expect.poll(() => serverStatuses).toEqual([201]);
    await expect.poll(() => calls.filter((call) => call.kind === 'fence' && call.failure).length, {
      timeout: STEP_TIMEOUT_MS,
    }).toBeGreaterThanOrEqual(1);
    const [item] = await readOutbox(a.page);
    const key = item.clientMessageId;
    // AC-042: stored but unknown — no cancel (or any action) before it is fenced.
    await expectSendingWithoutActions(a.page, key);
    const [stored] = await storedWithTexts(roomId, [text]);
    await expect(b.page.getByTestId(`message-${stored.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });

    // A is removed from the room before any fence gets through.
    expect(await membership.remove(roomId, 'A')).toBe(1);
    fencesBlocked = false;
    await expect(stateLabel(a.page, key)).toHaveText('não enviada', { timeout: 2 * STEP_TIMEOUT_MS });
    await expect(bubble(a.page, key)).toContainText(text);
    await expect(retryButton(a.page, key)).toBeVisible();
    await expect(discardButton(a.page, key)).toBeVisible();
    expect(await readOutbox(a.page)).toEqual([
      expect.objectContaining({ clientMessageId: key, state: 'failed', failureReason: 'not_participant', content: text }),
    ]);
    await expect.poll(() => summary(answered(calls)).map(([kind, , status]) => [kind, status])).toEqual([['fence', 403]]);
    // Failed, not expired, not delivered, not re-created; no automatic attempt.
    const callsAtFailure = calls.length;
    await a.page.waitForTimeout(5_000);
    expect(calls, 'no automatic attempt after the 403').toHaveLength(callsAtFailure);
    expect((await readOutbox(a.page))[0]).toMatchObject({ state: 'failed', failureReason: 'not_participant' });
    expect(await storedWithTexts(roomId, [text])).toHaveLength(1);

    // Re-added: "Tentar de novo" fences first; the stored message resolves the item.
    await membership.restore(roomId, 'A');
    await retryButton(a.page, key).click();
    await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    await expect.poll(() => summary(answered(calls)).map(([kind, , status, outcome]) => [kind, status, outcome])).toEqual([
      ['fence', 403, null],
      ['fence', 200, 'stored'],
    ]);
    expect(calls.filter((call) => call.kind === 'create'), 'the only create was the first one').toHaveLength(1);
    expect(serverStatuses).toEqual([201]);
    await expectDeliveredInFeed(a.page, [stored]);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(await storedWithTexts(roomId, [text])).toHaveLength(1);
  });

  test('access lost while a not-yet-stored message is unknown: the 403 fence fails it; re-added, "Tentar de novo" sends it once', async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { roomId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: roomId, content: `t27 warm-up ${randomUUID()}` });
    await openConversation(b.page, roomId);
    await waitForRealtimeReady(b.page);
    await openConversation(a.page, roomId);
    const text = `t27 not stored then removed ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    const calls = trackCalls(a.page);
    let fencesBlocked = true;
    await blockFences(a.page, () => fencesBlocked);
    let creates = 0;
    await a.page.route('**/api/messages/create', async (route: Route) => {
      creates += 1;
      // The first create never reaches the server.
      if (creates === 1) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await sendFromComposer(a.page, text);
    await expect.poll(() => calls.filter((call) => call.kind === 'fence' && call.failure).length, {
      timeout: STEP_TIMEOUT_MS,
    }).toBeGreaterThanOrEqual(1);
    const [item] = await readOutbox(a.page);
    const key = item.clientMessageId;
    await expectSendingWithoutActions(a.page, key);

    expect(await membership.remove(roomId, 'A')).toBe(1);
    fencesBlocked = false;
    await expect(stateLabel(a.page, key)).toHaveText('não enviada', { timeout: 2 * STEP_TIMEOUT_MS });
    await expect(bubble(a.page, key)).toContainText(text);
    expect(await readOutbox(a.page)).toEqual([
      expect.objectContaining({ clientMessageId: key, state: 'failed', failureReason: 'not_participant', content: text }),
    ]);
    const callsAtFailure = calls.length;
    await a.page.waitForTimeout(5_000);
    expect(calls, 'no automatic attempt after the 403').toHaveLength(callsAtFailure);
    expect(creates, 'no create after the 403').toBe(1);
    expect(await storedWithTexts(roomId, [text])).toHaveLength(0);
    expect((await readArrivals(b.page)).max[text]).toBe(0);

    await membership.restore(roomId, 'A');
    await retryButton(a.page, key).click();
    await expect.poll(async () => (await storedWithTexts(roomId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    await expect.poll(() => summary(answered(calls)).map(([kind, , status, outcome]) => [kind, status, outcome])).toEqual([
      ['fence', 403, null],
      ['fence', 200, 'not_stored'],
      ['create', 201, null],
    ]);
    const [retriedFence, retriedCreate] = answered(calls).slice(1);
    expect(retriedCreate.generation, 'sent under the fenced generation').toBe(retriedFence.generation);
    const stored = await storedWithTexts(roomId, [text]);
    expect(stored[0].key).toBe(key);
    await expectDeliveredInFeed(a.page, stored);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
    expect(await storedWithTexts(roomId, [text])).toHaveLength(1);
  });
});
