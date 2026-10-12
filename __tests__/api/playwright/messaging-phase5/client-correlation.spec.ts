import { randomUUID } from 'node:crypto';

import type { Page, Request, Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5-faults';
import { openDrawer, selectConversation, waitForRealtimeReady } from '../helpers/drawer-helpers';
import { LOCAL_SUPABASE_ANON_KEY, LOCAL_SUPABASE_API_URL } from '../helpers/local-supabase-mode';
import { withLocalMessagingDb } from '../helpers/messaging-local-db';
import { readOutbox } from '../helpers/messaging-outbox-e2e';
import type { RealtimeFaultController } from '../helpers/realtime-stream-faults';

/**
 * Phase 5 T7 — client correlation by clientMessageId (FR-034, AC-050).
 *
 * A sends messages with IDENTICAL text — one plain, one replying to a message
 * — while A has two tabs of the same session open on the conversation. Each
 * message must show as exactly one bubble in both tabs throughout: no
 * duplicate, no flash of two bubbles, no lost bubble, and the reply keeps its
 * quoted parent.
 *
 * Ordering is produced by network shaping only: the create request reaches
 * the real server (route.fetch), the real server stores the message and the
 * real Realtime INSERT is published, and the HTTP response is held until the
 * spec has seen that INSERT reach BOTH tabs' sockets (fault-harness frame
 * log, passed frames only) and the stored bubble in both tabs; only then is
 * the real response released (route.fulfill). The release time is compared
 * with the frame times, so the order is proven, not assumed.
 *
 * "Throughout" is measured in the page: a MutationObserver re-counts the
 * bubbles of each tracked message class (text + plain/reply) after every DOM
 * change of each tab and keeps the maximum, whether a seen bubble ever
 * disappeared, and whether a reply bubble ever lacked its parent quote.
 *
 *   1. one tab sends the plain message, then the reply (literal AC-050);
 *   2. both messages are pending at once, one in each tab (the plain one's
 *      request held before the server; the reply queued in the shared
 *      outbox and, per BR-003 (T8), dispatched only after the plain one is
 *      resolved, so the plain one's INSERT reaches the reply's tab while the
 *      reply is still pending): they must never be taken for each other;
 *   3. the stored message reaches both tabs through a feed fetch, not
 *      Realtime (the messages stream is faulted during the send; its
 *      recovery catch-up refetches the feed) before the HTTP response: the
 *      feed's own copy of the key must hide the pending one;
 *   4. the stored message is deleted (A's own delete from another session,
 *      through the Data API under RLS) after Realtime delivered it and before
 *      its held HTTP response: it must never come back, as pending or stored,
 *      in either tab;
 *   5. a keyed message already loaded in an OLDER page is delivered again —
 *      its real INSERT frame redelivered unchanged on the same channel, then
 *      a refetch of every loaded page while newer messages shift the page
 *      boundaries: one bubble, and no message id ever rendered twice;
 *   6. (block A fix F8) both tabs miss the stored INSERT (messages stream
 *      dark), the create's answer is lost in transit, and the stored message
 *      is deleted (A's own delete from another session) before the real
 *      fence that follows answers stored / deleted: the tab that did not
 *      fence drops its pending copy too, without a reload.
 */

const STEP_TIMEOUT_MS = 20_000;
/** Bubbles keep being sampled for a while after each step settles. */
const SETTLE_SAMPLING_MS = 1_500;
/** Local Realtime publishes a commit well within this (typically < 0.5 s). */
const PUBLISH_SETTLE_MS = 3_000;

type BubbleClass = 'plain' | 'reply';

interface ClassSample {
  max: number;
  current: number;
  seen: boolean;
  lost: number;
  quoteMissing: number;
  ids: string[];
}

interface SamplerState {
  evaluations: number;
  /** Most times any one message id was rendered at once (whole feed). */
  maxSameId: number;
  classes: Record<BubbleClass, ClassSample>;
  history: Array<{ t: number; plain: string[]; reply: string[] }>;
}

interface CreateResponseBody {
  clientMessageId?: string;
  message?: { id?: string; clientMessageId?: string; replyToId?: string };
}

interface HeldCreate {
  request: Record<string, unknown>;
  capturedAt: number;
  /** Set when the real server answered (the message is stored). */
  fetchedAt?: number;
  status?: number;
  body?: CreateResponseBody;
  /** When the held real response was handed to the page. */
  releasedAt?: number;
  letRequestThrough(): void;
  release(): void;
  fetched: Promise<void>;
  fulfilled: Promise<void>;
}

interface CreateHold {
  next(): Promise<HeldCreate>;
  all(): HeldCreate[];
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Holds every create of this tab: optionally before it reaches the server
 * (`holdRequest`), and always after the real server answered, until
 * `release()` hands the real response to the page. Nothing is mocked.
 */
async function holdCreates(page: Page, { holdRequest = false }: { holdRequest?: boolean } = {}): Promise<CreateHold> {
  const held: HeldCreate[] = [];
  const waiters: Array<(entry: HeldCreate) => void> = [];
  let handedOut = 0;
  await page.route('**/api/messages/create', async (route: Route) => {
    const requestGate = deferred();
    const releaseGate = deferred();
    const fetched = deferred();
    const fulfilled = deferred();
    const entry: HeldCreate = {
      request: (route.request().postDataJSON() ?? {}) as Record<string, unknown>,
      capturedAt: Date.now(),
      letRequestThrough: requestGate.resolve,
      release: releaseGate.resolve,
      fetched: fetched.promise,
      fulfilled: fulfilled.promise,
    };
    held.push(entry);
    waiters.shift()?.(entry);
    if (!holdRequest) requestGate.resolve();
    await requestGate.promise;
    const response = await route.fetch();
    entry.status = response.status();
    entry.body = (await response.json().catch(() => ({}))) as CreateResponseBody;
    entry.fetchedAt = Date.now();
    fetched.resolve();
    await releaseGate.promise;
    entry.releasedAt = Date.now();
    await route.fulfill({ response });
    fulfilled.resolve();
  });
  return {
    next: () => {
      const index = handedOut;
      handedOut += 1;
      if (held[index]) return Promise.resolve(held[index]);
      return new Promise<HeldCreate>((resolve) => waiters.push(resolve));
    },
    all: () => [...held],
  };
}

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await page.waitForLoadState('networkidle');
  await openDrawer(page);
  await waitForRealtimeReady(page);
  await selectConversation(page, { id: conversationId });
}

function composerInput(page: Page) {
  return page.locator('[data-testid="composer"] textarea').first();
}

async function createAs(page: Page, data: Record<string, unknown>): Promise<string> {
  const response = await page.request.post('/api/messages/create', { data });
  const body = (await response.json().catch(() => null)) as { message?: { id?: string } } | null;
  expect(response.status(), JSON.stringify(body)).toBe(201);
  expect(body?.message?.id).toBeTruthy();
  return body?.message?.id as string;
}

/** The single open routed socket that appeared since `knownIds`. */
function newOpenConnection(harness: RealtimeFaultController, knownIds: number[]): number {
  const open = harness
    .connections()
    .filter((connection) => connection.closedSeq === null && !knownIds.includes(connection.id));
  expect(open, 'exactly one new Realtime socket').toHaveLength(1);
  return open[0].id;
}

async function waitForMessagesStream(harness: RealtimeFaultController, connection: number, since = 0): Promise<void> {
  await expect
    .poll(
      () =>
        harness
          .frames({ stream: 'messages', direction: 'in', action: 'pass', events: ['system'], since })
          .some(
            (frame) =>
              frame.connection === connection &&
              frame.detail.extension === 'postgres_changes' &&
              frame.detail.status === 'ok',
          ),
      { timeout: STEP_TIMEOUT_MS, message: `messages changes stream confirmed on socket ${connection}` },
    )
    .toBe(true);
}

/** Time the INSERT of `messageId` was passed to (or, `dropped`, withheld from) the page on `connection`. */
function insertPassedAt(
  harness: RealtimeFaultController,
  connection: number,
  messageId: string,
  action: 'pass' | 'drop' = 'pass',
): number | undefined {
  return harness
    .frames({ stream: 'messages', direction: 'in', action, events: ['postgres_changes'] })
    .find(
      (frame) =>
        frame.connection === connection &&
        frame.detail.table === 'messages' &&
        frame.detail.type === 'INSERT' &&
        frame.detail.recordId === messageId,
    )?.at;
}

async function waitForInsert(harness: RealtimeFaultController, connection: number, messageId: string): Promise<number> {
  await expect
    .poll(() => insertPassedAt(harness, connection, messageId) !== undefined, {
      timeout: STEP_TIMEOUT_MS,
      message: `INSERT ${messageId} reached socket ${connection}`,
    })
    .toBe(true);
  return insertPassedAt(harness, connection, messageId) as number;
}

/** The stored bubble (real id, not the pending temp- copy) is in the tab's feed. */
async function waitForStoredBubble(page: Page, messageId: string, what: string): Promise<void> {
  await expect(
    page.locator(`[data-testid="messages-feed"] [data-testid="message-${messageId}"]`),
    what,
  ).toBeVisible({ timeout: STEP_TIMEOUT_MS });
}

/** Counts the bubbles of `text` (plain / reply) after every DOM change of the tab. */
async function installBubbleSampler(page: Page, text: string, parentText: string): Promise<void> {
  await page.evaluate(
    ({ text: trackedText, parentText: quotedParent }) => {
      const classes = ['plain', 'reply'] as const;
      const state = {
        evaluations: 0,
        maxSameId: 0,
        classes: Object.fromEntries(
          classes.map((name) => [name, { max: 0, current: 0, seen: false, lost: 0, quoteMissing: 0, ids: [] as string[] }]),
        ),
        history: [] as Array<{ t: number; plain: string[]; reply: string[] }>,
      };
      let lastSignature = '';
      const evaluate = () => {
        state.evaluations += 1;
        const ids: Record<string, string[]> = { plain: [], reply: [] };
        const feed = document.querySelector('[data-testid="messages-feed"]');
        const wrappers = feed ? Array.from(feed.querySelectorAll('[data-message-id]')) : [];
        const rendered = new Map<string, number>();
        for (const wrapper of wrappers) {
          const id = wrapper.getAttribute('data-message-id') ?? '';
          const item = Array.from(wrapper.children).find(
            (child) => child.getAttribute('data-testid') === `message-${id}`,
          );
          if (!item) continue;
          rendered.set(id, (rendered.get(id) ?? 0) + 1);
          state.maxSameId = Math.max(state.maxSameId, rendered.get(id) ?? 0);
          const hasText = Array.from(item.querySelectorAll('p')).some(
            (paragraph) => paragraph.textContent === trackedText,
          );
          if (!hasText) continue;
          const quote = item.querySelector(`[data-testid="reply-context-${id}"]`);
          const name = quote ? 'reply' : 'plain';
          ids[name].push(id);
          if (quote && !(quote.textContent ?? '').includes(quotedParent)) {
            state.classes[name].quoteMissing += 1;
          }
        }
        for (const name of classes) {
          const sample = state.classes[name];
          const count = ids[name].length;
          if (sample.seen && count === 0) sample.lost += 1;
          if (count > 0) sample.seen = true;
          sample.current = count;
          sample.max = Math.max(sample.max, count);
          sample.ids = ids[name];
        }
        const signature = JSON.stringify(ids);
        if (signature !== lastSignature && state.history.length < 200) {
          lastSignature = signature;
          state.history.push({ t: Math.round(performance.now()), plain: ids.plain, reply: ids.reply });
        }
      };
      (window as unknown as { __t7Bubbles?: typeof state }).__t7Bubbles = state;
      // Starts a new observation window (after an expected disappearance).
      (window as unknown as { __t7ResetBubbles?: () => void }).__t7ResetBubbles = () => {
        for (const name of classes) {
          const sample = state.classes[name];
          sample.max = sample.current;
          sample.seen = sample.current > 0;
          sample.lost = 0;
        }
      };
      evaluate();
      new MutationObserver(evaluate).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-message-id', 'data-testid'],
      });
    },
    { text, parentText },
  );
}

async function resetSampler(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __t7ResetBubbles: () => void }).__t7ResetBubbles());
}

/**
 * A's own delete from ANOTHER authorized session (a fresh sign-in, not the
 * browser's): the Data API under RLS (`delete_own_messages`) — the deletion
 * path the app's security model grants a sender. Returns the rows deleted.
 */
async function deleteOwnMessageFromAnotherSession(
  user: { email: string; password: string },
  messageId: string,
): Promise<number> {
  const client = createClient(LOCAL_SUPABASE_API_URL, LOCAL_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword(user);
  expect(signInError, 'second session signs in').toBeNull();
  try {
    const { data, error } = await client.from('messages').delete().eq('id', messageId).select('id');
    expect(error, 'own delete allowed').toBeNull();
    return data?.length ?? 0;
  } finally {
    // Ends only this session; A's browser session stays signed in.
    await client.auth.signOut({ scope: 'local' });
  }
}

function deletePassedAt(harness: RealtimeFaultController, connection: number, messageId: string): number | undefined {
  return harness
    .frames({ stream: 'messages', direction: 'in', action: 'pass', events: ['postgres_changes'] })
    .find(
      (frame) =>
        frame.connection === connection &&
        frame.detail.table === 'messages' &&
        frame.detail.type === 'DELETE' &&
        frame.detail.recordId === messageId,
    )?.at;
}

async function readSampler(page: Page): Promise<SamplerState> {
  return page.evaluate(() => (window as unknown as { __t7Bubbles: SamplerState }).__t7Bubbles);
}

function expectOneBubbleThroughout(
  label: string,
  state: SamplerState,
  expected: Record<BubbleClass, string | null>,
): void {
  const history = JSON.stringify(state.history);
  expect(state.evaluations, `${label}: sampler ran`).toBeGreaterThan(1);
  for (const name of ['plain', 'reply'] as const) {
    const sample = state.classes[name];
    const id = expected[name];
    if (id === null) {
      expect(sample.max, `${label}: no ${name} bubble expected; history ${history}`).toBe(0);
      continue;
    }
    expect(sample.max, `${label}: never two ${name} bubbles; history ${history}`).toBeLessThanOrEqual(1);
    expect(sample.lost, `${label}: the ${name} bubble never disappeared; history ${history}`).toBe(0);
    expect(sample.quoteMissing, `${label}: the ${name} bubble always quoted its parent; history ${history}`).toBe(0);
    expect(sample.ids, `${label}: exactly one ${name} bubble, the stored one; history ${history}`).toEqual([id]);
  }
}

interface SenderTabs {
  a: Phase5Device;
  harness: RealtimeFaultController;
  tab1: Page;
  tab2: Page;
  conn1: number;
  conn2: number;
  parentId: string;
  parentText: string;
}

/**
 * A's two tabs (same device and session) on the DM, with a parent message
 * whose thread (it already has one reply) is expanded in both tabs, so a
 * reply renders with its parent quote.
 */
async function openSenderTabs(
  phase5World: { conversations: { directId: string } },
  openDevice: (key: 'A') => Promise<Phase5Device>,
  attach: (device: Phase5Device, options?: { reload?: boolean }) => Promise<RealtimeFaultController>,
): Promise<SenderTabs> {
  const { directId } = phase5World.conversations;
  const a = await openDevice('A');
  const harness = await attach(a, { reload: false });

  const parentText = `t7 parent ${randomUUID()}`;
  const parentId = await createAs(a.page, { conversationId: directId, content: parentText });
  await createAs(a.page, { conversationId: directId, content: `t7 earlier reply ${randomUUID()}`, replyToId: parentId });

  const tab1 = a.page;
  await openConversation(tab1, directId);
  const conn1 = newOpenConnection(harness, []);
  await waitForMessagesStream(harness, conn1);

  const tab2 = await a.newTab();
  harness.watchPage(tab2, `${a.label} tab 2`);
  await openConversation(tab2, directId);
  const conn2 = newOpenConnection(harness, [conn1]);
  await waitForMessagesStream(harness, conn2);

  for (const tab of [tab1, tab2]) {
    await tab.locator(`[data-testid="reply-count-${parentId}"]`).click();
    await expect(tab.locator(`[data-testid="thread-panel-${parentId}"]`)).toBeVisible();
  }
  return { a, harness, tab1, tab2, conn1, conn2, parentId, parentText };
}

function storedId(entry: HeldCreate): string {
  const id = entry.body?.message?.id;
  expect(entry.status, JSON.stringify(entry.body)).toBe(201);
  expect(id, 'create response carries the stored id').toBeTruthy();
  return id as string;
}

function expectKeyCarried(entry: HeldCreate): void {
  const sent = entry.request.clientMessageId;
  expect(typeof sent, 'the create is keyed').toBe('string');
  expect(entry.body?.clientMessageId).toBe(String(sent).toLowerCase());
  expect(entry.body?.message?.clientMessageId).toBe(String(sent).toLowerCase());
}

test.describe('Phase 5 T7 — one bubble per message, matched by clientMessageId (AC-050)', () => {
  test('one tab sends a plain message and a reply with identical text; Realtime precedes each HTTP response', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const tabs = await openSenderTabs(phase5World, openDevice, realtimeFaults.attach);
    const { harness, tab1, tab2, conn1, conn2, parentId, parentText } = tabs;
    const text = `t7 same text ${randomUUID()}`;
    // Each request is held briefly before the server so the pending bubble is
    // observed deterministically, then held again after the server answered.
    const hold = await holdCreates(tab1, { holdRequest: true });
    for (const tab of [tab1, tab2]) await installBubbleSampler(tab, text, parentText);

    const evidence: Array<Record<string, unknown>> = [];
    const sendAndHold = async (kind: BubbleClass) => {
      if (kind === 'reply') await tab1.locator(`[data-testid="reply-button-${parentId}"]`).click();
      const input = composerInput(tab1);
      await input.fill(text);
      await input.press('Enter');
      const entry = await hold.next();
      expect(entry.request.replyToId ?? null).toBe(kind === 'reply' ? parentId : null);
      // Pending in the sending tab while the request is in flight.
      await expect(tab1.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(1);
      entry.letRequestThrough();
      await entry.fetched;
      const id = storedId(entry);
      expectKeyCarried(entry);
      const at1 = await waitForInsert(harness, conn1, id);
      const at2 = await waitForInsert(harness, conn2, id);
      await waitForStoredBubble(tab1, id, 'sending tab shows the stored message before its HTTP response');
      await waitForStoredBubble(tab2, id, 'other tab shows the stored message');
      await expect(tab1.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
      await tab1.waitForTimeout(SETTLE_SAMPLING_MS);
      entry.release();
      await entry.fulfilled;
      await expect(input, 'the send resolved with the released response').toHaveValue('');
      expect(entry.releasedAt as number).toBeGreaterThan(Math.max(at1, at2));
      evidence.push({ kind, id, insertTab1: at1, insertTab2: at2, released: entry.releasedAt });
      return id;
    };

    const plainId = await sendAndHold('plain');
    const replyId = await sendAndHold('reply');
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);

    for (const [label, tab] of [['tab 1', tab1], ['tab 2', tab2]] as const) {
      expectOneBubbleThroughout(label, await readSampler(tab), { plain: plainId, reply: replyId });
      await expect(tab.locator(`[data-testid="reply-context-${replyId}"]`)).toContainText(parentText);
    }
    testInfo.annotations.push({ type: 't7-order', description: JSON.stringify(evidence) });
  });

  test('identical texts pending at once in two tabs are never taken for each other', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const tabs = await openSenderTabs(phase5World, openDevice, realtimeFaults.attach);
    const { harness, tab1, tab2, conn1, conn2, parentId, parentText } = tabs;
    const text = `t7 concurrent ${randomUUID()}`;
    const hold1 = await holdCreates(tab1, { holdRequest: true });
    const hold2 = await holdCreates(tab2, { holdRequest: true });
    for (const tab of [tab1, tab2]) await installBubbleSampler(tab, text, parentText);

    // Tab 2 prepares the reply; tab 1 the plain message with the same text.
    await tab2.locator(`[data-testid="reply-button-${parentId}"]`).click();
    await composerInput(tab2).fill(text);
    await composerInput(tab1).fill(text);

    // Tab 1 sends; its request is held before the server, so its message is
    // pending (not stored). Tab 2 then sends the reply: it is queued in the
    // shared outbox but not dispatched while the conversation's earlier
    // create is in progress (Phase 5 T8, BR-003) — both are pending at once.
    await composerInput(tab1).press('Enter');
    const plainEntry = await hold1.next();
    expect(plainEntry.request.replyToId ?? null).toBeNull();
    await composerInput(tab2).press('Enter');
    await expect(composerInput(tab2)).toHaveValue('');
    await expect(tab2.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(2);
    await tab2.waitForTimeout(SETTLE_SAMPLING_MS);
    expect(hold1.all().length + hold2.all().length, 'no second create of the conversation while one is in progress').toBe(1);

    // The plain message is stored and published while the identical-text
    // reply is still pending: the stored plain message must not take the
    // reply's place in either tab.
    plainEntry.letRequestThrough();
    await plainEntry.fetched;
    const plainId = storedId(plainEntry);
    expectKeyCarried(plainEntry);
    const plainAt1 = await waitForInsert(harness, conn1, plainId);
    const plainAt2 = await waitForInsert(harness, conn2, plainId);
    await waitForStoredBubble(tab1, plainId, 'tab 1 shows its stored message before its HTTP response');
    await waitForStoredBubble(tab2, plainId, 'tab 2 shows the stored plain message next to its pending reply');
    await expect(tab2.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(1);
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);
    expect(hold1.all().length + hold2.all().length, 'the reply waits for the plain message to resolve').toBe(1);
    plainEntry.release();
    await plainEntry.fulfilled;
    await expect(composerInput(tab1)).toHaveValue('');

    // Only now is the reply dispatched (by whichever tab drains the conversation).
    await expect.poll(() => hold1.all().length + hold2.all().length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
    const replyEntry = [...hold1.all(), ...hold2.all()].find((entry) => entry !== plainEntry) as HeldCreate;
    expect(replyEntry.request.replyToId).toBe(parentId);
    expect(plainEntry.request.clientMessageId).not.toBe(replyEntry.request.clientMessageId);
    replyEntry.letRequestThrough();
    await replyEntry.fetched;
    const replyId = storedId(replyEntry);
    expectKeyCarried(replyEntry);
    const replyAt1 = await waitForInsert(harness, conn1, replyId);
    const replyAt2 = await waitForInsert(harness, conn2, replyId);
    await waitForStoredBubble(tab1, replyId, 'tab 1 shows the stored reply before its HTTP response');
    await waitForStoredBubble(tab2, replyId, 'tab 2 shows its stored reply before its HTTP response');
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);
    replyEntry.release();
    await replyEntry.fulfilled;
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);

    expect(replyEntry.releasedAt as number).toBeGreaterThan(Math.max(replyAt1, replyAt2));
    expect(plainEntry.releasedAt as number).toBeGreaterThan(Math.max(plainAt1, plainAt2));
    expect(hold1.all().length + hold2.all().length, 'one create per message').toBe(2);
    for (const [label, tab] of [['tab 1', tab1], ['tab 2', tab2]] as const) {
      expectOneBubbleThroughout(label, await readSampler(tab), { plain: plainId, reply: replyId });
      await expect(tab.locator(`[data-testid="reply-context-${replyId}"]`)).toContainText(parentText);
      await expect(tab.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
    }
    testInfo.annotations.push({
      type: 't7-order',
      description: JSON.stringify({ plainId, plainAt1, plainAt2, plainReleased: plainEntry.releasedAt, replyId, replyAt1, replyAt2, replyReleased: replyEntry.releasedAt }),
    });
  });

  test('a stored message reaching both tabs by a feed fetch before the HTTP response is matched by its key', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const tabs = await openSenderTabs(phase5World, openDevice, realtimeFaults.attach);
    const { harness, tab1, tab2, conn1, conn2, parentText } = tabs;
    const { directId } = phase5World.conversations;
    const text = `t7 fetched ${randomUUID()}`;
    const hold = await holdCreates(tab1);
    for (const tab of [tab1, tab2]) await installBubbleSampler(tab, text, parentText);
    const feedFetches = new Map<Page, number[]>([[tab1, []], [tab2, []]]);
    for (const tab of [tab1, tab2]) {
      tab.on('request', (request: Request) => {
        const url = new URL(request.url());
        if (url.pathname === '/api/messages/get' && url.searchParams.get('conversationId') === directId) {
          feedFetches.get(tab)?.push(Date.now());
        }
      });
    }

    // Both tabs' messages stream goes dark: the INSERT will not be delivered.
    const fault = await harness.fail('messages', 'error');
    expect(fault.kicked).toBeGreaterThan(0);

    const input = composerInput(tab1);
    await input.fill(text);
    await input.press('Enter');
    const entry = await hold.next();
    await entry.fetched;
    const id = storedId(entry);
    expectKeyCarried(entry);
    await expect(tab1.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(1);
    // Whatever the server publishes for this commit while the stream is dark
    // (an INSERT per server-side channel joined at that moment, or none if
    // the app was between retries) is withheld; Realtime never replays it to
    // a channel joined later.
    await tab1.waitForTimeout(PUBLISH_SETTLE_MS);

    // Recovery: the stream rejoins and its catch-up refetches both feeds.
    const restoredAt = Date.now();
    const restoreMark = harness.restore('messages');
    await waitForMessagesStream(harness, conn1, restoreMark);
    await waitForMessagesStream(harness, conn2, restoreMark);
    await waitForStoredBubble(tab1, id, 'sending tab shows the fetched stored message before its HTTP response');
    await waitForStoredBubble(tab2, id, 'other tab shows the fetched stored message');
    await expect(tab1.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
    // No copy of the INSERT reached either tab: both got the message from
    // the fetch.
    const insertDelivered = () =>
      harness
        .frames({ stream: 'messages', direction: 'in', action: 'pass', events: ['postgres_changes'] })
        .filter((frame) => frame.detail.recordId === id);
    expect(insertDelivered(), 'no Realtime INSERT reached either tab').toEqual([]);
    for (const tab of [tab1, tab2]) {
      expect(feedFetches.get(tab)?.some((at) => at >= restoredAt), 'the feed was refetched after recovery').toBe(true);
    }
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);
    entry.release();
    await entry.fulfilled;
    await expect(input).toHaveValue('');
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);
    expect(insertDelivered(), 'the INSERT never reached either tab').toEqual([]);

    for (const [label, tab] of [['tab 1', tab1], ['tab 2', tab2]] as const) {
      expectOneBubbleThroughout(label, await readSampler(tab), { plain: id, reply: null });
    }
    testInfo.annotations.push({
      type: 't7-order',
      description: JSON.stringify({
        id,
        restoredAt,
        released: entry.releasedAt,
        fetchesTab1: feedFetches.get(tab1),
        fetchesTab2: feedFetches.get(tab2),
        insertWithheld: [conn1, conn2].map((connection) => insertPassedAt(harness, connection, id, 'drop') ?? null),
      }),
    });
  });
  test('a stored message deleted before its held HTTP response never comes back, as pending or stored', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const tabs = await openSenderTabs(phase5World, openDevice, realtimeFaults.attach);
    const { a, harness, tab1, tab2, conn1, conn2, parentText } = tabs;
    const text = `t7 deleted ${randomUUID()}`;
    const hold = await holdCreates(tab1, { holdRequest: true });
    for (const tab of [tab1, tab2]) await installBubbleSampler(tab, text, parentText);
    const pendingIn = (tab: Page) => tab.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]');

    const input = composerInput(tab1);
    await input.fill(text);
    await input.press('Enter');
    const entry = await hold.next();
    await expect(pendingIn(tab1)).toHaveCount(1);
    entry.letRequestThrough();
    await entry.fetched;
    const id = storedId(entry);
    expectKeyCarried(entry);
    const insertAt1 = await waitForInsert(harness, conn1, id);
    const insertAt2 = await waitForInsert(harness, conn2, id);
    await waitForStoredBubble(tab1, id, 'sending tab shows the stored message before its HTTP response');
    await waitForStoredBubble(tab2, id, 'other tab shows the stored message');
    await expect(pendingIn(tab1)).toHaveCount(0);
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);
    for (const [label, tab] of [['tab 1', tab1], ['tab 2', tab2]] as const) {
      expectOneBubbleThroughout(`${label} before the deletion`, await readSampler(tab), { plain: id, reply: null });
    }

    // Another authorized session of A deletes the stored message.
    expect(await deleteOwnMessageFromAnotherSession(a.user, id), 'one row deleted').toBe(1);
    await expect
      .poll(() => [conn1, conn2].every((connection) => deletePassedAt(harness, connection, id) !== undefined), {
        timeout: STEP_TIMEOUT_MS,
        message: 'the DELETE reached both tabs',
      })
      .toBe(true);
    for (const tab of [tab1, tab2]) {
      await expect(tab.locator(`[data-testid="messages-feed"] [data-testid="message-${id}"]`)).toHaveCount(0);
      await expect(pendingIn(tab)).toHaveCount(0);
      await resetSampler(tab);
    }

    // The held (pre-deletion) 201 is handed to the page now.
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS);
    entry.release();
    await entry.fulfilled;
    await expect(input, 'the send resolved with the released response').toHaveValue('');
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS * 2);

    for (const [label, tab] of [['tab 1', tab1], ['tab 2', tab2]] as const) {
      const state = await readSampler(tab);
      expect(state.classes.plain.max, `${label}: the deleted message never came back; history ${JSON.stringify(state.history)}`).toBe(0);
      await expect(pendingIn(tab)).toHaveCount(0);
    }
    expect(entry.releasedAt as number).toBeGreaterThan(Math.max(insertAt1, insertAt2));
    testInfo.annotations.push({
      type: 't7-order',
      description: JSON.stringify({
        id,
        insertTab1: insertAt1,
        insertTab2: insertAt2,
        deleteTab1: deletePassedAt(harness, conn1, id),
        deleteTab2: deletePassedAt(harness, conn2, id),
        released: entry.releasedAt,
      }),
    });
  });

  test('a delivered message deleted while both tabs missed its INSERT: the fence answers stored/deleted and the other tab drops its pending copy without a reload', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { a, harness, tab1, tab2 } = await openSenderTabs(phase5World, openDevice, realtimeFaults.attach);
    const { directId } = phase5World.conversations;
    const text = `t7 deleted unseen ${randomUUID()}`;
    const pendingIn = (tab: Page) => tab.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]');

    // Both tabs' messages stream goes dark: neither tab sees the INSERT (nor the DELETE).
    const fault = await harness.fail('messages', 'error');
    expect(fault.kicked).toBeGreaterThan(0);

    // The first create is stored by the real server, but its answer is lost in transit (unknown);
    // the fence that follows is held in the browser until the stored message has been deleted.
    let storedMessageId: string | null = null;
    let creates = 0;
    let fenceRequested = false;
    const fenceGate = deferred();
    const fences: Array<{ tab: string; status: number; outcome?: string; message?: unknown }> = [];
    await a.context.route(/\/api\/messages\/(create|fence)$/, async (route: Route) => {
      const page = route.request().frame().page();
      if (route.request().url().endsWith('/create')) {
        creates += 1;
        if (creates > 1) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const body = (await response.json().catch(() => null)) as CreateResponseBody | null;
        storedMessageId = response.status() === 201 ? (body?.message?.id ?? null) : null;
        await route.abort('failed');
        return;
      }
      fenceRequested = true;
      await fenceGate.promise;
      const response = await route.fetch();
      const body = (await response.json().catch(() => null)) as { outcome?: string; message?: unknown } | null;
      fences.push({ tab: page === tab1 ? 'tab 1' : 'tab 2', status: response.status(), outcome: body?.outcome, message: body?.message });
      await route.fulfill({ response }).catch(() => undefined);
    });

    const input = composerInput(tab1);
    await input.fill(text);
    await input.press('Enter');
    await expect.poll(() => storedMessageId, { timeout: STEP_TIMEOUT_MS }).not.toBeNull();
    // Both tabs show the pending copy (the second through the shared outbox).
    for (const tab of [tab1, tab2]) await expect(pendingIn(tab)).toHaveCount(1, { timeout: STEP_TIMEOUT_MS });

    // Another authorized session of A deletes the stored message; only then does the fence reach the server.
    expect(await deleteOwnMessageFromAnotherSession(a.user, storedMessageId as unknown as string), 'one row deleted').toBe(1);
    await expect.poll(() => fenceRequested, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    for (const tab of [tab1, tab2]) await expect(pendingIn(tab)).toHaveCount(1);
    fenceGate.resolve();
    await expect.poll(() => fences.length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    expect(fences[0]).toMatchObject({ status: 200, outcome: 'stored', message: null });

    // Both tabs drop their pending copy — the one that did not fence included — without a reload.
    for (const tab of [tab1, tab2]) await expect(pendingIn(tab)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    await tab1.waitForTimeout(SETTLE_SAMPLING_MS * 2);
    for (const tab of [tab1, tab2]) {
      await expect(pendingIn(tab)).toHaveCount(0);
      await expect(tab.locator(`[data-testid="messages-feed"] [data-testid="message-${storedMessageId}"]`)).toHaveCount(0);
    }
    expect(await readOutbox(tab1)).toEqual([]);
    expect([creates, fences.length], 'one create, one fence').toEqual([1, 1]);
    const rows = await withLocalMessagingDb(async (db) =>
      (
        await db.query<{ id: string }>(
          'select id::text as id from public.messages where conversation_id = $1 and content = $2',
          [directId, text],
        )
      ).rows,
    );
    expect(rows, 'the deleted message stays deleted').toEqual([]);
    testInfo.annotations.push({ type: 't7-f8-fence', description: JSON.stringify({ fencedBy: fences[0].tab, storedMessageId }) });
  });

  test('a keyed message in an older page shows once when its INSERT is delivered again and when every page is refetched', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    const { directId } = phase5World.conversations;
    const senderB = phase5World.users.B.userId;
    const a = await openDevice('A');
    const harness = await realtimeFaults.attach(a, { reload: false });
    const tab = a.page;
    const feed = tab.locator('[data-testid="messages-feed"]');
    const insertFillers = (count: number, label: string) =>
      withLocalMessagingDb(async (db) => {
        const { rowCount } = await db.query(
          `insert into public.messages (conversation_id, sender_id, content, type, status, timestamp)
           select $1::uuid, $2::uuid, $3 || ' ' || n, 'text', 'sent', clock_timestamp()
           from generate_series(1, $4::int) as n`,
          [directId, senderB, label, count],
        );
        return rowCount;
      });

    await openConversation(tab, directId);
    const conn = newOpenConnection(harness, []);
    await waitForMessagesStream(harness, conn);
    const feedFetches: Array<{ at: number; older: boolean }> = [];
    tab.on('request', (request: Request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/messages/get' && url.searchParams.get('conversationId') === directId) {
        feedFetches.push({ at: Date.now(), older: url.searchParams.has('cursorBefore') });
      }
    });

    // A keyed message of A (real create): its real INSERT frame reaches the
    // tab and is kept for redelivery.
    const text = `t7 older page ${randomUUID()}`;
    const keyedId = await createAs(tab, { conversationId: directId, content: text, clientMessageId: randomUUID() });
    await waitForInsert(harness, conn, keyedId);
    const insertFrame = harness
      .frames({ stream: 'messages', direction: 'in', action: 'pass', events: ['postgres_changes'] })
      .find((frame) => frame.connection === conn && frame.detail.type === 'INSERT' && frame.detail.recordId === keyedId);
    expect(insertFrame, 'captured INSERT').toBeTruthy();
    const keyedBubble = feed.locator(`[data-testid="message-${keyedId}"]`);
    await expect(keyedBubble).toHaveCount(1);

    // 25 newer messages of B (appended to the newest page by Realtime), then a
    // real refetch re-pages the feed (A adds and removes a reaction: the
    // reaction DELETE invalidates the feeds): the keyed message is no longer
    // in the newest page; "Load more" loads it in the older page.
    const fillerLabel = `t7 filler ${randomUUID()}`;
    expect(await insertFillers(25, fillerLabel)).toBe(25);
    await expect(feed.locator('p', { hasText: fillerLabel })).toHaveCount(25, { timeout: STEP_TIMEOUT_MS });
    const reactedAt = Date.now();
    for (let toggle = 0; toggle < 2; toggle += 1) {
      const reaction = await tab.request.post('/api/messages/react', { data: { messageId: keyedId, emoji: '👍' } });
      expect(reaction.ok(), await reaction.text()).toBe(true);
    }
    await expect
      .poll(() => feedFetches.some((fetch) => fetch.at >= reactedAt && !fetch.older), {
        timeout: STEP_TIMEOUT_MS,
        message: 'the newest page was refetched',
      })
      .toBe(true);
    await expect(keyedBubble, 'not in the refetched newest page').toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    // A "Load more" that lands while a feed refetch is still settling can be
    // superseded by it, so the click is repeated until the older page holds
    // the keyed message. A slow earlier click may already have loaded it (and
    // exhausted history, removing the button), so check before each click.
    await expect(async () => {
      if ((await keyedBubble.count()) === 0) {
        await tab.getByRole('button', { name: 'Load more messages' }).click({ timeout: 3_000 });
      }
      await expect(keyedBubble, 'loaded with the older page').toHaveCount(1, { timeout: 3_000 });
    }).toPass({ timeout: STEP_TIMEOUT_MS });
    expect(feedFetches.some((fetch) => fetch.at >= reactedAt && fetch.older), 'an older page was fetched').toBe(true);
    await installBubbleSampler(tab, text, '');

    // 1) The real INSERT of the keyed message is delivered again (same
    // socket, topic, join and payload) while the message sits in the older
    // page: the merge must find it there and add nothing.
    expect(harness.joinedTopics('messages'), 'the INSERT\'s channel is still the app\'s channel').toContain(
      insertFrame?.topic,
    );
    const redelivered = harness.redeliver(insertFrame?.seq as number);
    await tab.waitForTimeout(SETTLE_SAMPLING_MS);
    await expect(keyedBubble).toHaveCount(1);
    // (A correct merge changes nothing, so the sampler may have run only once.)
    const afterRedelivery = await readSampler(tab);
    const redeliveryHistory = JSON.stringify(afterRedelivery.history);
    expect(afterRedelivery.classes.plain.max, `one bubble after the redelivery; ${redeliveryHistory}`).toBe(1);
    expect(afterRedelivery.classes.plain.lost, `never lost; ${redeliveryHistory}`).toBe(0);
    expect(afterRedelivery.classes.plain.ids).toEqual([keyedId]);
    expect(afterRedelivery.maxSameId, 'no message id rendered twice after the redelivery').toBe(1);

    // 2) Newer messages arrive by Realtime (page boundaries shift), then the
    // stream drops and recovers; its catch-up refetches every loaded page.
    const shiftLabel = `t7 shift ${randomUUID()}`;
    expect(await insertFillers(3, shiftLabel)).toBe(3);
    await expect(feed.locator('p', { hasText: shiftLabel })).toHaveCount(3, { timeout: STEP_TIMEOUT_MS });
    const fault = await harness.fail('messages', 'error');
    expect(fault.kicked).toBeGreaterThan(0);
    await tab.waitForTimeout(SETTLE_SAMPLING_MS);
    const restoredAt = Date.now();
    const restoreMark = harness.restore('messages');
    await waitForMessagesStream(harness, conn, restoreMark);
    await expect
      .poll(() => feedFetches.filter((fetch) => fetch.at >= restoredAt).map((fetch) => fetch.older).sort(), {
        timeout: STEP_TIMEOUT_MS,
        message: 'newest and older pages refetched',
      })
      .toEqual(expect.arrayContaining([false, true]));
    await tab.waitForTimeout(SETTLE_SAMPLING_MS * 2);

    const state = await readSampler(tab);
    expectOneBubbleThroughout('older page', state, { plain: keyedId, reply: null });
    expect(state.maxSameId, 'no message id rendered twice').toBe(1);
    testInfo.annotations.push({
      type: 't7-older-page',
      description: JSON.stringify({
        keyedId,
        insertFrame: { seq: insertFrame?.seq, at: insertFrame?.at, topic: insertFrame?.topic },
        redelivered: { seq: redelivered.seq, at: redelivered.at, topic: redelivered.topic },
        restoredAt,
        fetches: feedFetches,
      }),
    });
  });
});
