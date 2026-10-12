import { randomUUID } from 'node:crypto';

import type { Page, Route } from '@playwright/test';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5';
import { openDrawer, waitForRealtimeReady } from '../helpers/drawer-helpers';
import {
  STEP_TIMEOUT_MS,
  composer,
  composerInput,
  createViaApi,
  deleteOwnMessageFromAnotherSession,
  expectDeliveredInFeed,
  goOffline,
  openConversation,
  queueOffline,
  readArrivals,
  readOutbox,
  sendFromComposer,
  storedWithTexts,
  trackOutboxCalls,
  watchArrivals,
  type OutboxApiCall,
  type OutboxRow,
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T9 — definitive failures, rate-limit retry, and expiry (FR-002,
 * FR-007, FR-008, FR-009, BR-005, BR-006; AC-007, AC-008, AC-009 drawer
 * clause, AC-010, AC-043, AC-046 definitive classes).
 *
 * Everything is real: the app and its IndexedDB outbox, POST
 * /api/messages/create and /api/messages/fence, the local database. The
 * rejections are the server's own: room access removed by the fixture's
 * administrative revocation (re-added with restore_conversation_membership),
 * a reply target deleted by its sender from another session (400), content
 * over the route's 8192-character limit (413), a key already stored for
 * another message by A's own earlier client (409), and A's real insertion
 * quota held exhausted by the fixture (429). Network shaping only (SPEC §15):
 * browser offline mode, and one stored create answered by a gateway 502
 * after it reached the server. The 24 h window uses the page's clock
 * (`setSystemTime`: the time jumps ahead and keeps running).
 */

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const MAX_CONTENT_LENGTH = 8_192;

const bubble = (page: Page, key: string) => page.getByTestId(`message-temp-${key}`);
const stateLabel = (page: Page, key: string) => page.getByTestId(`message-delivery-state-temp-${key}`);
const retryButton = (page: Page, key: string) => page.getByTestId(`message-retry-temp-${key}`);
const discardButton = (page: Page, key: string) => page.getByTestId(`message-discard-temp-${key}`);

const creates = (calls: readonly OutboxApiCall[]) => calls.filter((call) => call.kind === 'create');
const callsFor = (calls: readonly OutboxApiCall[], key: string) => calls.filter((call) => call.key === key);
/** [kind, status | 'network-error', fence outcome] of the calls that got an answer or failed. */
const outcomes = (calls: readonly OutboxApiCall[]) =>
  calls.map((call) => [call.kind, call.failure ? 'network-error' : (call.status ?? null), call.outcome ?? null]);

/** A failed or expired item: its text, the label, "Tentar de novo" and "Apagar". */
async function expectUnsent(page: Page, key: string, text: string, label: 'não enviada' | 'expirada'): Promise<void> {
  await expect(stateLabel(page, key)).toHaveText(label, { timeout: 2 * STEP_TIMEOUT_MS });
  await expect(stateLabel(page, key)).toHaveAttribute('data-delivery-state', label === 'expirada' ? 'expired' : 'failed');
  await expect(bubble(page, key)).toContainText(text.slice(0, 200));
  await expect(retryButton(page, key)).toHaveText('Tentar de novo');
  await expect(discardButton(page, key)).toHaveText('Apagar');
}

async function expectWaiting(page: Page, key: string): Promise<void> {
  await expect(stateLabel(page, key)).toHaveText('pendente', { timeout: STEP_TIMEOUT_MS });
  await expect(stateLabel(page, key)).toHaveAttribute('data-delivery-state', 'pending');
}

/** Opens `conversationId` in the drawer even when the drawer restored another conversation. */
async function showConversation(page: Page, conversationId: string): Promise<void> {
  if (!page.url().includes('/floor-plan')) await page.goto('/floor-plan');
  await openDrawer(page);
  const item = page.locator(`[data-testid="conversation-item-${conversationId}"]`);
  const feed = page.getByTestId('messages-feed');
  await expect(item.or(feed).first()).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  if (!(await item.isVisible())) await page.getByRole('button', { name: 'Back to conversations' }).click();
  await item.click();
  await expect(feed).toBeVisible({ timeout: STEP_TIMEOUT_MS });
}

/** Sends `text` from the composer while offline; it is stored as the outbox's `count`-th item. */
async function queueOne(page: Page, text: string, count: number): Promise<OutboxRow> {
  await sendFromComposer(page, text);
  await expect(composerInput(page)).toHaveValue('');
  await expect.poll(async () => (await readOutbox(page)).length).toBe(count);
  const item = (await readOutbox(page)).find((row) => row.content === text);
  expect(item, 'queued').toBeDefined();
  return item as OutboxRow;
}

/** B's feed shows `texts` once each, in this order. */
async function expectArrivedInOrder(b: Phase5Device, texts: readonly string[]): Promise<void> {
  await expect
    .poll(async () => {
      const { first } = await readArrivals(b.page);
      return texts.filter((text) => first[text] !== undefined).length;
    }, { timeout: STEP_TIMEOUT_MS })
    .toBe(texts.length);
  await b.page.waitForTimeout(1_500);
  const arrivals = await readArrivals(b.page);
  const times = texts.map((text) => arrivals.first[text]);
  expect(times.every((time) => typeof time === 'number'), 'every text arrived').toBe(true);
  for (let index = 1; index < times.length; index += 1) {
    expect(times[index], `${texts[index]} after ${texts[index - 1]}`).toBeGreaterThanOrEqual(times[index - 1]);
  }
  for (const text of texts) expect(arrivals.max[text], `${text} shown once`).toBe(1);
}

test.describe('Phase 5 T9 — definitive failures, rate-limit retry, and expiry', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-007/AC-008: access to the room lost before reconnecting fails m1 with its text, m2 waits unsent, the DM item is delivered; re-added, "Tentar de novo" delivers m1 then m2', async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { roomId, directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: roomId, content: `t9 warm-up ${randomUUID()}` });
    await openConversation(b.page, roomId);
    await waitForRealtimeReady(b.page);
    const [m1, m2, m3] = ['m1', 'm2', 'm3'].map((name) => `t9 ${name} ${randomUUID()}`);
    await watchArrivals(b.page, [m1, m2]);

    // Tab 1 shows the room, tab 2 (same browser) the DM with B.
    await openConversation(a.page, roomId);
    const dmTab = await a.newTab();
    await showConversation(dmTab, directId);
    const calls = trackOutboxCalls(a.page);
    trackOutboxCalls(dmTab, calls);

    await goOffline(a.page);
    const [item1, item2] = await queueOffline(a, roomId, [m1, m2]);
    const item3 = await queueOne(dmTab, m3, 3);
    expect(item3.conversationId).toBe(directId);

    // A loses access to the room before connectivity returns.
    expect(await membership.remove(roomId, 'A')).toBe(1);
    await a.context.setOffline(false);

    await expect.poll(async () => (await storedWithTexts(directId, [m3])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expectUnsent(a.page, item1.clientMessageId, m1, 'não enviada');
    await expectWaiting(a.page, item2.clientMessageId);
    const [stored3] = await storedWithTexts(directId, [m3]);
    expect(stored3.key).toBe(item3.clientMessageId);
    await expectDeliveredInFeed(dmTab, [stored3]);

    // No automatic attempt for m1, and none at all for m2.
    await a.page.waitForTimeout(5_000);
    expect(outcomes(callsFor(calls, item1.clientMessageId))).toEqual([['create', 403, null]]);
    expect(callsFor(calls, item1.clientMessageId)[0].code).toBe('NOT_PARTICIPANT');
    expect(callsFor(calls, item2.clientMessageId), 'm2 never sent while m1 is unresolved').toHaveLength(0);
    expect(await readOutbox(a.page)).toEqual([
      expect.objectContaining({ clientMessageId: item1.clientMessageId, state: 'failed', failureReason: 'not_participant', content: m1 }),
      expect.objectContaining({ clientMessageId: item2.clientMessageId, state: 'waiting', attemptGeneration: 0, content: m2 }),
    ]);
    expect(await storedWithTexts(roomId, [m1, m2])).toHaveLength(0);

    // AC-008: re-added, "Tentar de novo" delivers m1 and then m2, once each.
    await membership.restore(roomId, 'A');
    await retryButton(a.page, item1.clientMessageId).click();
    await expect.poll(async () => (await storedWithTexts(roomId, [m1, m2])).length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
    const stored = await storedWithTexts(roomId, [m1, m2]);
    expect(stored.map((row) => [row.content, row.key])).toEqual([
      [m1, item1.clientMessageId],
      [m2, item2.clientMessageId],
    ]);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    const m2Start = callsFor(calls, item2.clientMessageId)[0].startedAt;
    expect(callsFor(calls, item1.clientMessageId).every((call) => call.startedAt <= m2Start), 'm1 before m2').toBe(true);
    await expectDeliveredInFeed(a.page, stored);
    await expectArrivedInOrder(b, [m1, m2]);
    expect(await storedWithTexts(roomId, [m1, m2])).toHaveLength(2);
  });

  test('AC-008: "Apagar" on the failed m1 removes it for good and m2 is attempted next', async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { roomId } = phase5World.conversations;
    const a = await openDevice('A');
    await createViaApi(a.page, { conversationId: roomId, content: `t9 warm-up ${randomUUID()}` });
    await openConversation(a.page, roomId);
    const [m1, m2] = ['m1', 'm2'].map((name) => `t9 discard ${name} ${randomUUID()}`);
    const calls = trackOutboxCalls(a.page);

    await goOffline(a.page);
    const [item1, item2] = await queueOffline(a, roomId, [m1, m2]);
    expect(await membership.remove(roomId, 'A')).toBe(1);
    await a.context.setOffline(false);
    await expectUnsent(a.page, item1.clientMessageId, m1, 'não enviada');
    await expectWaiting(a.page, item2.clientMessageId);
    await a.page.waitForTimeout(3_000);
    expect(callsFor(calls, item2.clientMessageId)).toHaveLength(0);

    // "Apagar": m1 is gone (no request for it); m2 is the next item attempted.
    await discardButton(a.page, item1.clientMessageId).click();
    await expect(bubble(a.page, item1.clientMessageId)).toHaveCount(0);
    await expect.poll(() => outcomes(callsFor(calls, item2.clientMessageId)), { timeout: STEP_TIMEOUT_MS }).toEqual([
      ['create', 403, null],
    ]);
    await expectUnsent(a.page, item2.clientMessageId, m2, 'não enviada');
    expect(outcomes(callsFor(calls, item1.clientMessageId)), 'nothing sent for m1 after "Apagar"').toEqual([['create', 403, null]]);
    expect((await readOutbox(a.page)).map((row) => row.clientMessageId)).toEqual([item2.clientMessageId]);

    // Re-added, m2 is delivered; m1 never is.
    await membership.restore(roomId, 'A');
    await retryButton(a.page, item2.clientMessageId).click();
    await expect.poll(async () => (await storedWithTexts(roomId, [m2])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    await a.page.waitForTimeout(2_000);
    expect(await storedWithTexts(roomId, [m1])).toHaveLength(0);
    expect(callsFor(calls, item1.clientMessageId)).toHaveLength(1);
  });

  test('AC-046: a reply whose target was deleted (400) and content over the limit (413) fail with their text and hold the conversation; "Apagar" lets the next item through', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    const parentText = `t9 parent ${randomUUID()}`;
    const parentId = await createViaApi(a.page, { conversationId: directId, content: parentText });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const replyText = `t9 reply to a deleted message ${randomUUID()}`;
    const largeText = `t9 too large ${randomUUID()} ${'x'.repeat(MAX_CONTENT_LENGTH)}`;
    const laterText = `t9 after the failures ${randomUUID()}`;
    await watchArrivals(b.page, [laterText]);

    await openConversation(a.page, directId);
    const calls = trackOutboxCalls(a.page);
    await goOffline(a.page);
    await a.page.getByTestId(`reply-button-${parentId}`).click();
    await expect(composer(a.page).getByTestId('reply-composer-preview')).toContainText(parentText);
    const reply = await queueOne(a.page, replyText, 1);
    expect(reply.replyToId).toBe(parentId);
    const large = await queueOne(a.page, largeText, 2);
    expect(large.content.length).toBeGreaterThan(MAX_CONTENT_LENGTH);
    const later = await queueOne(a.page, laterText, 3);

    // A deletes the reply's parent from another session before reconnecting.
    expect(await deleteOwnMessageFromAnotherSession(a.user, parentId)).toBe(1);
    await a.context.setOffline(false);

    // 400 INVALID_REPLY_TARGET: failed with its text; the later items wait unsent.
    await expectUnsent(a.page, reply.clientMessageId, replyText, 'não enviada');
    await expectWaiting(a.page, large.clientMessageId);
    await expectWaiting(a.page, later.clientMessageId);
    await a.page.waitForTimeout(3_000);
    expect(outcomes(creates(calls))).toEqual([['create', 400, null]]);
    expect(creates(calls)[0]).toMatchObject({ key: reply.clientMessageId, code: 'INVALID_REPLY_TARGET' });
    expect((await readOutbox(a.page))[0]).toMatchObject({ state: 'failed', failureReason: 'invalid_request' });

    // "Apagar": the next item is attempted — 413 CONTENT_TOO_LARGE, failed with its text.
    await discardButton(a.page, reply.clientMessageId).click();
    await expectUnsent(a.page, large.clientMessageId, largeText, 'não enviada');
    await expectWaiting(a.page, later.clientMessageId);
    await a.page.waitForTimeout(3_000);
    expect(outcomes(creates(calls))).toEqual([
      ['create', 400, null],
      ['create', 413, null],
    ]);
    expect(creates(calls)[1]).toMatchObject({ key: large.clientMessageId, code: 'CONTENT_TOO_LARGE' });
    expect((await readOutbox(a.page)).map((row) => [row.clientMessageId, row.state, row.failureReason])).toEqual([
      [large.clientMessageId, 'failed', 'content_too_large'],
      [later.clientMessageId, 'waiting', null],
    ]);

    // "Apagar" again: the later item is delivered, once.
    await discardButton(a.page, large.clientMessageId).click();
    await expect.poll(async () => (await storedWithTexts(directId, [laterText])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(0);
    const stored = await storedWithTexts(directId, [laterText]);
    expect(stored[0].key).toBe(later.clientMessageId);
    await expectDeliveredInFeed(a.page, stored);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[laterText]).toBe(1);
    expect(await storedWithTexts(directId, [replyText, largeText])).toHaveLength(0);
    expect(outcomes(creates(calls)).map(([, status]) => status)).toEqual([400, 413, 201]);
  });

  test('AC-043: an item rejected with CLIENT_MESSAGE_ID_REUSED is stored once under a new key by "Tentar de novo"; the conflicting message is unchanged', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t9 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const text = `t9 reused key ${randomUUID()}`;
    const conflictText = `t9 conflicting message ${randomUUID()}`;
    await watchArrivals(b.page, [text, conflictText]);

    // A queues the item offline, then closes the tab (the next one does not
    // reopen this conversation, so nothing but the create answers the item).
    await openConversation(a.page, directId);
    await goOffline(a.page);
    const [item] = await queueOffline(a, directId, [text]);
    await a.page.evaluate(() => window.localStorage.removeItem('messaging_active_conversation_id'));
    await a.page.close();

    // Meanwhile A's own earlier client stored another message under the same
    // key (a Phase 4 keyed create, without an attempt generation).
    await a.context.setOffline(false);
    const conflict = await a.context.request.post('/api/messages/create', {
      data: { conversationId: directId, content: conflictText, clientMessageId: item.clientMessageId },
    });
    expect(conflict.status()).toBe(201);
    const [conflictRow] = await storedWithTexts(directId, [conflictText]);
    expect(conflictRow.key).toBe(item.clientMessageId);

    const reopened = await a.newTab();
    const calls = trackOutboxCalls(reopened);
    await reopened.goto('/floor-plan');
    await expect.poll(() => outcomes(calls), { timeout: STEP_TIMEOUT_MS }).toEqual([['create', 409, null]]);
    expect(calls[0]).toMatchObject({ key: item.clientMessageId, generation: 1, code: 'CLIENT_MESSAGE_ID_REUSED' });

    // Failed with its text, now under a new key that was never sent.
    await expect.poll(async () => (await readOutbox(reopened))[0]?.state, { timeout: STEP_TIMEOUT_MS }).toBe('failed');
    const [failed] = await readOutbox(reopened);
    expect(failed).toMatchObject({
      content: text,
      conversationId: directId,
      failureReason: 'client_message_id_reused',
      attemptGeneration: 0,
      pressedSendAt: item.pressedSendAt,
      order: item.order,
    });
    expect(failed.clientMessageId).not.toBe(item.clientMessageId);
    expect(failed.clientMessageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    // The conflicting stored message, shown in A's feed, does not resolve it.
    await showConversation(reopened, directId);
    await expect(reopened.getByTestId(`message-${conflictRow.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expectUnsent(reopened, failed.clientMessageId, text, 'não enviada');
    await reopened.waitForTimeout(3_000);
    expect(await readOutbox(reopened)).toEqual([
      expect.objectContaining({ clientMessageId: failed.clientMessageId, state: 'failed' }),
    ]);
    expect(calls, 'no automatic attempt after the 409').toHaveLength(1);

    // "Tentar de novo": the content is stored once, under the new key.
    await retryButton(reopened, failed.clientMessageId).click();
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(async () => (await readOutbox(reopened)).length).toBe(0);
    expect(outcomes(calls)).toEqual([
      ['create', 409, null],
      ['create', 201, null],
    ]);
    expect(calls[1]).toMatchObject({ key: failed.clientMessageId, generation: 1 });
    const [storedText] = await storedWithTexts(directId, [text]);
    expect(storedText.key).toBe(failed.clientMessageId);
    expect(await storedWithTexts(directId, [conflictText]), 'conflicting message unchanged').toEqual([conflictRow]);
    await expectDeliveredInFeed(reopened, [storedText]);
    await expect(b.page.getByTestId(`message-${storedText.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await b.page.waitForTimeout(1_500);
    const arrivals = await readArrivals(b.page);
    expect([arrivals.max[text], arrivals.max[conflictText]]).toEqual([1, 1]);
  });

  test('AC-009: with the insertion quota exhausted, 12 queued items stay pending and retry in order under one backoff shared by two tabs; B sees all 12 once, in order', async ({
    phase5World,
    openDevice,
    budgets,
  }) => {
    test.setTimeout(240_000);
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t9 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const run = randomUUID().slice(0, 8);
    const texts = Array.from({ length: 12 }, (_, index) => `t9 quota ${run} #${String(index + 1).padStart(2, '0')}`);
    await watchArrivals(b.page, texts);

    await openConversation(a.page, directId);
    const tab2 = await a.newTab();
    await tab2.goto('/floor-plan');
    const calls = trackOutboxCalls(a.page);
    trackOutboxCalls(tab2, calls);
    await goOffline(a.page);
    const items = await queueOffline(a, directId, texts);
    const keys = items.map((item) => item.clientMessageId);

    await budgets.exhaust('A', 'message:create', { windows: 3 });
    await a.context.setOffline(false);

    // Only the oldest item is attempted, every attempt is a 429, and the
    // attempts of both tabs together keep the backoff (1, 2, 4, 8 s …).
    await expect.poll(() => creates(calls).filter((call) => call.status !== undefined).length, { timeout: 45_000 }).toBeGreaterThanOrEqual(5);
    const limited = creates(calls).filter((call) => call.status !== undefined);
    expect(limited.map((call) => [call.key, call.status])).toEqual(limited.map(() => [keys[0], 429]));
    expect(limited.every((call) => call.generation === limited.indexOf(call) + 1)).toBe(true);
    const gaps = limited.slice(1).map((call, index) => call.startedAt - limited[index].startedAt);
    gaps.forEach((gap, index) => {
      const backoff = Math.min(1_000 * 2 ** index, 15_000);
      expect(gap, `attempt ${index + 2} waits the shared ${backoff} ms backoff (gaps ${JSON.stringify(gaps)})`).toBeGreaterThanOrEqual(backoff - 250);
    });
    expect(calls.filter((call) => call.kind === 'fence'), 'a 429 is not an unknown outcome').toHaveLength(0);
    const queued = await readOutbox(a.page);
    expect(queued.map((row) => row.clientMessageId)).toEqual(keys);
    expect(queued.every((row) => row.state === 'waiting' || row.state === 'claimed')).toBe(true);
    for (const key of keys.slice(1)) await expectWaiting(a.page, key);
    expect(await storedWithTexts(directId, texts)).toHaveLength(0);

    // The quota is available again: all 12 are delivered, in order, once each.
    await budgets.reset(['A'], ['message:create']);
    await expect.poll(async () => (await storedWithTexts(directId, texts)).length, { timeout: 60_000 }).toBe(12);
    const stored = await storedWithTexts(directId, texts);
    expect(stored.map((row) => [row.content, row.key])).toEqual(texts.map((text, index) => [text, keys[index]]));
    await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    const order = creates(calls).map((call) => keys.indexOf(call.key as string));
    expect(order.every((index, position) => position === 0 || index >= order[position - 1]), `creates in order ${JSON.stringify(order)}`).toBe(true);
    expect(creates(calls).filter((call) => call.status === 201).map((call) => call.key)).toEqual(keys);
    await expectArrivedInOrder(b, texts);
    expect(await storedWithTexts(directId, texts)).toHaveLength(12);
  });

  test('AC-010: a never-dispatched item past its 24 h is fenced and shown "expirada" with no create; "Tentar de novo" keeps its key and send time, and through a 429 and an unknown outcome stores it once', async ({
    phase5World,
    openDevice,
    budgets,
  }) => {
    test.setTimeout(240_000);
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t9 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const text = `t9 expired ${randomUUID()}`;
    await watchArrivals(b.page, [text]);

    await openConversation(a.page, directId);
    const calls = trackOutboxCalls(a.page);
    await goOffline(a.page);
    const [item] = await queueOffline(a, directId, [text]);
    const key = item.clientMessageId;

    // 25 h later connectivity returns.
    await a.page.clock.setSystemTime(item.pressedSendAt + DAY_MS + HOUR_MS);
    await a.context.setOffline(false);
    await expectUnsent(a.page, key, text, 'expirada');
    await a.page.waitForTimeout(4_000);
    expect(outcomes(calls), 'fenced once, never created').toEqual([['fence', 200, 'not_stored']]);
    expect(await readOutbox(a.page)).toEqual([
      expect.objectContaining({
        clientMessageId: key,
        state: 'expired',
        failureReason: null,
        pressedSendAt: item.pressedSendAt,
        windowStartedAt: item.windowStartedAt,
      }),
    ]);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);

    // "Tentar de novo" under an exhausted quota: a 429 keeps it pending, then the
    // create that stores it is answered by a gateway 502 (unknown) and the fence
    // resolves it.
    await budgets.exhaust('A', 'message:create', { windows: 3 });
    const serverStatuses: number[] = [];
    await a.page.route('**/api/messages/create', async (route: Route) => {
      const response = await route.fetch();
      serverStatuses.push(response.status());
      if (response.status() === 201 && serverStatuses.filter((status) => status === 201).length === 1) {
        await route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' });
        return;
      }
      await route.fulfill({ response });
    });
    const retriedAt = await a.page.evaluate(() => Date.now());
    await retryButton(a.page, key).click();
    await expect.poll(() => serverStatuses.filter((status) => status === 429).length, { timeout: STEP_TIMEOUT_MS }).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => (await readOutbox(a.page))[0]?.state, { timeout: STEP_TIMEOUT_MS }).toBe('waiting');
    const [pending] = await readOutbox(a.page);
    expect(pending).toMatchObject({ clientMessageId: key, pressedSendAt: item.pressedSendAt, failureReason: null });
    expect(pending.windowStartedAt, 'a new 24 h window').toBeGreaterThanOrEqual(retriedAt);
    expect(pending.windowStartedAt).toBeGreaterThan(item.windowStartedAt + DAY_MS);
    expect(pending.retryNotBefore ?? 0).toBeGreaterThan(0);

    await budgets.reset(['A'], ['message:create']);
    await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: 45_000 }).toBe(0);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored).toHaveLength(1);
    expect(stored[0].key).toBe(key);
    expect(serverStatuses.filter((status) => status === 201), 'stored by one create').toHaveLength(1);
    // After the 502 the item is resolved by its stored message — the fence
    // ("stored") or A's own feed/Realtime, whichever comes first — never by
    // another create.
    await a.page.waitForTimeout(1_500);
    const answered = outcomes(calls);
    expect(answered.slice(0, 2)).toEqual([
      ['fence', 200, 'not_stored'],
      ['fence', 200, 'not_stored'],
    ]);
    const unknownAt = answered.findIndex(([kind, status]) => kind === 'create' && status === 502);
    expect(unknownAt, JSON.stringify(answered)).toBeGreaterThan(2);
    expect(answered.slice(2, unknownAt).every(([kind, status]) => kind === 'create' && status === 429)).toBe(true);
    const afterUnknown = outcomes(calls).slice(unknownAt + 1);
    expect(afterUnknown.every(([kind, , outcome]) => kind === 'fence' && outcome === 'stored'), JSON.stringify(afterUnknown)).toBe(true);
    expect(creates(calls), 'no create after the unknown outcome').toHaveLength(unknownAt - 1);
    expect(calls.every((call) => call.key === key)).toBe(true);
    await expectDeliveredInFeed(a.page, stored);
    await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
  });

  test('BR-006: an item waiting after a 429 whose 24 h pass is fenced and expires without another create', async ({
    phase5World,
    openDevice,
    budgets,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    await createViaApi(a.page, { conversationId: directId, content: `t9 warm-up ${randomUUID()}` });
    await openConversation(a.page, directId);
    const text = `t9 waiting past 24 h ${randomUUID()}`;
    const calls = trackOutboxCalls(a.page);

    await budgets.exhaust('A', 'message:create', { windows: 3 });
    await sendFromComposer(a.page, text);
    await expect.poll(() => creates(calls).filter((call) => call.status === 429).length, { timeout: STEP_TIMEOUT_MS }).toBeGreaterThanOrEqual(1);
    const [item] = await readOutbox(a.page);
    const key = item.clientMessageId;

    // The quota stays exhausted: the fence alone decides (a create in flight
    // at the jump can only get another 429).
    await a.page.clock.setSystemTime(item.windowStartedAt + DAY_MS + HOUR_MS);
    await expectUnsent(a.page, key, text, 'expirada');
    await a.page.waitForTimeout(4_000);
    const answered = outcomes(calls.filter((call) => call.status !== undefined));
    expect(answered.at(-1)).toEqual(['fence', 200, 'not_stored']);
    expect(answered.slice(0, -1).every(([kind, status]) => kind === 'create' && status === 429)).toBe(true);
    expect(calls.filter((call) => call.kind === 'fence'), 'one fence').toHaveLength(1);
    expect(calls.at(-1)?.kind, 'no create after the fence').toBe('fence');
    expect(await readOutbox(a.page)).toEqual([
      expect.objectContaining({ clientMessageId: key, state: 'expired', pressedSendAt: item.pressedSendAt }),
    ]);
    expect(await storedWithTexts(directId, [text])).toHaveLength(0);
  });
});
