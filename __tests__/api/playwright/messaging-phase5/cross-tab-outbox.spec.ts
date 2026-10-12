import { randomUUID } from 'node:crypto';

import type { Page, Request, Route } from '@playwright/test';
import { Client } from 'pg';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5-faults';
import { waitForRealtimeReady } from '../helpers/drawer-helpers';
import type { RealtimeFaultController } from '../helpers/realtime-stream-faults';
import { parseLoopbackDatabaseUrl } from '../helpers/local-db-url';
import { MESSAGING_LOCAL_DB_URL, withLocalMessagingDb } from '../helpers/messaging-local-db';
import {
  STEP_TIMEOUT_MS,
  createViaApi,
  goOffline,
  openConversation,
  queueOffline,
  readArrivals,
  readOutbox,
  sendFromComposer,
  storedWithTexts,
  watchArrivals,
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T10 — cross-tab outbox ownership and leases (FR-002, FR-004,
 * FR-005, BR-003, BR-007; AC-005, AC-006, AC-041, AC-045 E2E cases).
 *
 * Two real tabs of A (same browser context: one IndexedDB outbox, Web Locks,
 * BroadcastChannel) and B on another device. Everything is real: the app, the
 * create and fence routes, and the local database. Faults are network shaping
 * (SPEC §15): requests held in the browser (delayed pass-through, released
 * later with route.fetch), a request failed in transit, the context's offline
 * mode, and a database row lock that blocks a create inside its INSERT (as in
 * the T2 integration test). A hung tab is a tab whose main thread is paused
 * (CDP Debugger.pause): network shaping alone cannot hang a holder
 * past its lease, because every request of a claim is aborted at its 30 s
 * deadline, before the 45 s lease ends.
 */

const D1_DEADLINE_MS = 10_000;
const LEASE_MS = 45_000;

interface ApiCall {
  tab: string;
  kind: 'create' | 'fence';
  key: string;
  generation: number;
  conversationId: string;
  startSeq: number;
  startedAt: number;
  endSeq?: number;
  status?: number;
  outcome?: string;
  code?: string;
  failure?: string;
}

/** Every create and fence request of the tabs, with one shared start/end order. */
function trackApi(tabs: ReadonlyArray<readonly [string, Page]>): ApiCall[] {
  const calls: ApiCall[] = [];
  let seq = 0;
  for (const [tab, page] of tabs) {
    const byRequest = new Map<Request, ApiCall>();
    page.on('request', (request) => {
      if (request.method() !== 'POST') return;
      const path = new URL(request.url()).pathname;
      const kind = path === '/api/messages/create' ? 'create' : path === '/api/messages/fence' ? 'fence' : null;
      if (!kind) return;
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      seq += 1;
      const call: ApiCall = {
        tab,
        kind,
        key: String(body.clientMessageId),
        generation: Number(body.attemptGeneration),
        conversationId: String(body.conversationId),
        startSeq: seq,
        startedAt: Date.now(),
      };
      calls.push(call);
      byRequest.set(request, call);
    });
    page.on('requestfinished', (request) => {
      const call = byRequest.get(request);
      if (!call) return;
      seq += 1;
      call.endSeq = seq;
      void request.response().then(async (response) => {
        if (!response) return;
        const json = (await response.json().catch(() => null)) as { outcome?: string; code?: string } | null;
        call.outcome = json?.outcome;
        call.code = json?.code;
        call.status = response.status();
      });
    });
    page.on('requestfailed', (request) => {
      const call = byRequest.get(request);
      if (!call) return;
      seq += 1;
      call.endSeq = seq;
      call.failure = request.failure()?.errorText ?? 'failed';
    });
  }
  return calls;
}

/** [tab, kind, generation, status | 'failed', fence outcome] of the calls for `key`. */
const summary = (calls: readonly ApiCall[], key: string) =>
  calls
    .filter((call) => call.key === key)
    .map((call) => [call.tab, call.kind, call.generation, call.failure ? 'failed' : (call.status ?? null), call.outcome ?? null]);

/** No two create requests of the conversation were in progress at once, across all tabs (AC-005). */
function expectNoOverlappingCreates(calls: readonly ApiCall[], conversationId: string): void {
  const creates = calls.filter((call) => call.kind === 'create' && call.conversationId === conversationId);
  creates.sort((left, right) => left.startSeq - right.startSeq);
  for (let index = 1; index < creates.length; index += 1) {
    const previous = creates[index - 1];
    expect(previous.endSeq, `create ${index} ended`).toBeDefined();
    expect(previous.endSeq as number, `create ${index + 1} started after create ${index} ended`).toBeLessThan(
      creates[index].startSeq,
    );
  }
}

const bubble = (page: Page, key: string) => page.getByTestId(`message-temp-${key}`);
const stateLabel = (page: Page, key: string) => page.getByTestId(`message-delivery-state-temp-${key}`);
const cancelButton = (page: Page, key: string) => page.getByTestId(`message-cancel-temp-${key}`);

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface Setup {
  a: Phase5Device;
  b: Phase5Device;
  tab1: Page;
  tab2: Page;
  directId: string;
}

/**
 * A with two tabs on the DM and B watching it. `beforeTabs` runs on A's
 * device before its tabs open the DM (e.g. to route its Realtime sockets).
 */
async function twoTabs(
  phase5World: { conversations: { directId: string } },
  openDevice: (key: 'A' | 'B') => Promise<Phase5Device>,
  beforeTabs?: (a: Phase5Device) => Promise<void>,
): Promise<Setup> {
  const { directId } = phase5World.conversations;
  const a = await openDevice('A');
  if (beforeTabs) await beforeTabs(a);
  const b = await openDevice('B');
  await createViaApi(a.page, { conversationId: directId, content: `t10 warm-up ${randomUUID()}` });
  await openConversation(b.page, directId);
  await waitForRealtimeReady(b.page);
  await openConversation(a.page, directId);
  const tab2 = await a.newTab();
  await openConversation(tab2, directId);
  return { a, b, tab1: a.page, tab2, directId };
}

/**
 * Hangs the tab: its main thread is paused (CDP Debugger.pause — the next
 * script, timer or event of the page stops before it runs) until the returned
 * function resumes it. Its Web Lock stays held. (Page lifecycle freezing does
 * not stop timers of a visible page, so it cannot hang the holder.)
 */
async function freeze(page: Page): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Debugger.enable');
  await cdp.send('Debugger.pause');
  return async () => {
    await cdp.send('Debugger.resume').catch(() => undefined);
    await cdp.send('Debugger.disable').catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  };
}

/**
 * T13: the tab's own network only (CDP network emulation of that tab, as the
 * context's offline mode does for every tab): `navigator.onLine` and the
 * browser's online/offline events follow, other tabs are untouched.
 */
async function tabNetwork(page: Page): Promise<{ setOffline: (offline: boolean) => Promise<void>; detach: () => Promise<void> }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  return {
    async setOffline(offline: boolean) {
      await cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(!offline);
    },
    detach: () => cdp.detach().catch(() => undefined),
  };
}

/** Holds FOR UPDATE on a message row: a create replying to it blocks inside its INSERT. */
async function holdMessageRowLock(messageId: string): Promise<{ pid: number; release: () => Promise<void> }> {
  const holder = new Client({
    ...parseLoopbackDatabaseUrl(MESSAGING_LOCAL_DB_URL),
    ssl: false,
    application_name: 'vo-messaging-e2e-t10-row-lock',
    options: '-c default_transaction_read_only=off -c statement_timeout=0',
  });
  await holder.connect();
  await holder.query('begin');
  await holder.query('select id from public.messages where id = $1 for update', [messageId]);
  const pid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
  let released = false;
  return {
    pid,
    async release() {
      if (released) return;
      released = true;
      await holder.query('rollback').catch(() => undefined);
      await holder.end();
    },
  };
}

async function waitForBlockedCreate(holderPid: number): Promise<void> {
  await expect
    .poll(
      () =>
        withLocalMessagingDb(async (db) => {
          const { rows } = await db.query<{ waiting: number }>(
            `select count(*)::int as waiting from pg_catalog.pg_stat_activity
              where pid <> $1 and wait_event_type = 'Lock' and query ilike '%create_message_attempt%'`,
            [holderPid],
          );
          return rows[0].waiting;
        }),
      { timeout: 5_000, intervals: [50] },
    )
    .toBe(1);
}

/** Sends a held request to the server now (the release of a request held in the browser). */
async function releaseLate(route: Route): Promise<{ status: number; code?: string }> {
  const response = await route.fetch();
  const json = (await response.json().catch(() => null)) as { code?: string } | null;
  await route.fulfill({ response }).catch(() => undefined);
  return { status: response.status(), code: json?.code };
}

test.describe('Phase 5 T10 — cross-tab outbox ownership and leases', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-005: two tabs online together send m1 then m2, one create at a time, each stored and shown once', async ({
    phase5World,
    openDevice,
  }) => {
    const { a, b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
    const texts = [`t10 m1 ${randomUUID()}`, `t10 m2 ${randomUUID()}`];
    await watchArrivals(b.page, texts);
    await goOffline(tab1);
    const items = await queueOffline(a, directId, texts);
    const [m1, m2] = items.map((item) => item.clientMessageId);

    // Both items appear once in tab 2 too, waiting, and may be cancelled there.
    for (const tab of [tab1, tab2]) {
      for (const key of [m1, m2]) {
        await expect(bubble(tab, key)).toHaveCount(1, { timeout: STEP_TIMEOUT_MS });
        await expect(stateLabel(tab, key)).toHaveText('pendente');
        await expect(cancelButton(tab, key)).toBeVisible();
      }
    }

    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);
    const gate = deferred();
    let heldM1 = 0;
    await a.context.route('**/api/messages/create', async (route: Route) => {
      const body = (route.request().postDataJSON() ?? {}) as { clientMessageId?: string };
      if (body.clientMessageId === m1 && heldM1 === 0) {
        heldM1 += 1;
        await gate.promise;
      }
      await route.continue().catch(() => undefined);
    });

    // Both tabs come back online at the same time; m1's create is held.
    await a.context.setOffline(false);
    await expect.poll(() => heldM1, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    // AC-006: a dispatched item shows "enviando" without cancel, in both tabs.
    for (const tab of [tab1, tab2]) {
      await expect(stateLabel(tab, m1)).toHaveText('enviando', { timeout: STEP_TIMEOUT_MS });
      await expect(cancelButton(tab, m1)).toHaveCount(0);
      await expect(stateLabel(tab, m2)).toHaveText('pendente');
    }
    await tab1.waitForTimeout(3_000);
    expect(calls.filter((call) => call.key === m2), 'no tab sends m2 while m1 is unresolved').toHaveLength(0);
    expect(calls.filter((call) => call.kind === 'create'), 'one create in progress').toHaveLength(1);

    gate.resolve();
    await expect.poll(async () => (await storedWithTexts(directId, texts)).length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
    const stored = await storedWithTexts(directId, texts);
    expect(stored.map((row) => row.key)).toEqual([m1, m2]);
    expect(stored.map((row) => row.content)).toEqual(texts);
    for (const row of stored) {
      await expect(b.page.getByTestId(`message-${row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      for (const tab of [tab1, tab2]) {
        await expect(tab.getByTestId(`message-${row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
        await expect(bubble(tab, row.key as string)).toHaveCount(0);
      }
    }
    await b.page.waitForTimeout(1_500);
    const arrivals = await readArrivals(b.page);
    expect(arrivals.max[texts[0]]).toBe(1);
    expect(arrivals.max[texts[1]]).toBe(1);
    expect(arrivals.first[texts[0]]).toBeLessThanOrEqual(arrivals.first[texts[1]]);
    expect(calls.filter((call) => call.kind === 'create').map((call) => [call.key, call.status])).toEqual([
      [m1, 201],
      [m2, 201],
    ]);
    expectNoOverlappingCreates(calls, directId);
    expect(await readOutbox(tab2)).toHaveLength(0);
  });

  test('AC-006: cancel in tab 2 removes a never-dispatched item in both tabs; racing a claim, exactly one wins', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const { a, b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);
    await goOffline(tab1);

    // Without a race: the cancel wins, in both tabs, and nothing is ever sent.
    const cancelledText = `t10 cancelled ${randomUUID()}`;
    const [cancelled] = await queueOffline(a, directId, [cancelledText]);
    await expect(cancelButton(tab2, cancelled.clientMessageId)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await cancelButton(tab2, cancelled.clientMessageId).click();
    for (const tab of [tab1, tab2]) {
      await expect(bubble(tab, cancelled.clientMessageId)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    }
    expect(await readOutbox(tab1)).toHaveLength(0);

    // Racing: tab 2 cancels at the moment both tabs come online and try to claim.
    // Each round accepts either winner (cancel or claim) and checks that branch's
    // guarantees; it does NOT enforce that both branches occur across the three
    // rounds (all three may pick the same winner). The rounds' winners are
    // recorded in the `t10-cancel-race` annotation.
    const outcomes: Array<{ round: number; clicked: boolean; winner: 'cancel' | 'claim' }> = [];
    const raceTexts: string[] = [];
    for (let round = 0; round < 3; round += 1) {
      const text = `t10 race ${round} ${randomUUID()}`;
      raceTexts.push(text);
      const [item] = await queueOffline(a, directId, [text]);
      const key = item.clientMessageId;
      await expect(cancelButton(tab2, key)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      const click = cancelButton(tab2, key)
        .click({ timeout: 3_000 })
        .then(
          () => true,
          () => false,
        );
      if (round === 1) await tab2.waitForTimeout(25);
      const [clicked] = await Promise.all([click, a.context.setOffline(false)]);
      await expect.poll(async () => (await readOutbox(tab1)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
      await tab1.waitForTimeout(1_000);
      const rows = await storedWithTexts(directId, [text]);
      const creates = calls.filter((call) => call.key === key && call.kind === 'create');
      if (rows.length === 1) {
        // The claim won: the item was delivered once.
        expect(rows[0].key).toBe(key);
        expect(creates.length).toBeGreaterThanOrEqual(1);
        await expect(b.page.getByTestId(`message-${rows[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
        outcomes.push({ round, clicked, winner: 'claim' });
      } else {
        // The cancel won: gone from both tabs and no create request was ever sent.
        expect(rows).toHaveLength(0);
        expect(clicked).toBe(true);
        expect(calls.filter((call) => call.key === key)).toHaveLength(0);
        for (const tab of [tab1, tab2]) await expect(bubble(tab, key)).toHaveCount(0);
        outcomes.push({ round, clicked, winner: 'cancel' });
      }
      await goOffline(tab1);
    }
    testInfo.annotations.push({ type: 't10-cancel-race', description: JSON.stringify(outcomes) });

    // Online for a while: a cancelled item is never dispatched afterwards.
    await a.context.setOffline(false);
    await tab1.waitForTimeout(3_000);
    expect(calls.filter((call) => call.key === cancelled.clientMessageId)).toHaveLength(0);
    expect(await storedWithTexts(directId, [cancelledText])).toHaveLength(0);
    for (const outcome of outcomes) {
      expect(await storedWithTexts(directId, [raceTexts[outcome.round]])).toHaveLength(outcome.winner === 'claim' ? 1 : 0);
    }
    expect(await readOutbox(tab2)).toHaveLength(0);
  });

  test('AC-041/AC-045(a): while tab 1 holds the claim tab 2 stays quiet; after tab 1 closes, tab 2 fences and the blocked attempt never commits', async ({
    phase5World,
    openDevice,
  }) => {
    const { b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
    const parentId = await createViaApi(tab1, { conversationId: directId, content: `t10 parent ${randomUUID()}` });
    await expect(tab1.getByTestId(`reply-button-${parentId}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    const text = `t10 blocked then closed ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);

    // Tab 1's create passes through to the server (route.fetch), where it blocks.
    const attempt1: { status?: number; code?: string; error?: string } = {};
    await tab1.route('**/api/messages/create', async (route: Route) => {
      try {
        const response = await route.fetch({ timeout: 60_000 });
        const json = (await response.json().catch(() => null)) as { code?: string } | null;
        attempt1.status = response.status();
        attempt1.code = json?.code;
        await route.fulfill({ response }).catch(() => undefined);
      } catch (error) {
        attempt1.error = String(error);
      }
    });

    const lock = await holdMessageRowLock(parentId);
    let key = '';
    try {
      await tab1.getByTestId(`reply-button-${parentId}`).click();
      await sendFromComposer(tab1, text);
      await waitForBlockedCreate(lock.pid);
      const [item] = await readOutbox(tab2);
      expect(item).toMatchObject({ content: text, state: 'claimed', attemptGeneration: 1, replyToId: parentId });
      key = item.clientMessageId;
      // Tab 1's lease is live: tab 2 sends nothing for the conversation.
      await tab2.waitForTimeout(1_500);
      expect(calls.filter((call) => call.tab === 'tab2'), 'tab 2 waits while the lease is live').toHaveLength(0);

      await tab1.close();
      // Tab 2 fences (its create then blocks too, until the lock is released).
      await expect
        .poll(() => summary(calls, key).filter(([tab]) => tab === 'tab2')[0] ?? null, { timeout: 5_000, intervals: [100] })
        .toEqual(['tab2', 'fence', 2, 200, 'not_stored']);
    } finally {
      await lock.release();
    }

    // Attempt 1 resumes after the fence: it is rejected as stale and never commits.
    await expect.poll(() => attempt1.status ?? attempt1.error, { timeout: STEP_TIMEOUT_MS }).toBe(409);
    expect(attempt1.code).toBe('ATTEMPT_SUPERSEDED');
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    await expect.poll(() => summary(calls, key).filter(([tab]) => tab === 'tab2')).toEqual([
      ['tab2', 'fence', 2, 200, 'not_stored'],
      ['tab2', 'create', 2, 201, null],
    ]);
    expect(calls.filter((call) => call.key === key && call.tab === 'tab1').map((call) => [call.kind, call.generation])).toEqual([
      ['create', 1],
    ]);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored[0]).toMatchObject({ key, reply_to_id: parentId });
    // The reply is threaded under its parent: one reply, shown once the thread is opened.
    for (const page of [b.page, tab2]) {
      await expect(page.getByTestId(`reply-count-${parentId}`)).toHaveText(/1 reply/, { timeout: STEP_TIMEOUT_MS });
      await page.getByTestId(`reply-count-${parentId}`).click();
      await expect(page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    }
    await expect.poll(async () => (await readOutbox(tab2)).length).toBe(0);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
  });

  for (const held of ['create', 'fence'] as const) {
    const title =
      held === 'create'
        ? "AC-041/AC-045(b): a hung tab's held create — tab 2 waits for the lease, fences, sends once; the held create is rejected as stale"
        : "AC-045(c): a hung tab's held fence — tab 2 takes over after the lease and commits; the stale fence is rejected";
    test(title, async ({ phase5World, openDevice }) => {
      const { b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
      const text = `t10 hung ${held} ${randomUUID()}`;
      await watchArrivals(b.page, [text]);
      const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);

      if (held === 'fence') {
        // The first create fails in transit (unknown), so the next attempt starts with a fence.
        let creates = 0;
        await tab1.context().route('**/api/messages/create', async (route: Route) => {
          creates += 1;
          if (creates === 1) await route.abort('failed');
          else await route.continue();
        });
      }
      let heldRoute: Route | null = null;
      let holder: Page | null = null;
      await tab1.context().route(`**/api/messages/${held}`, async (route: Route) => {
        if (heldRoute) {
          await route.fallback();
          return;
        }
        heldRoute = route;
        holder = route.request().frame().page();
        // Held in the browser: it has not reached the server.
      });

      await sendFromComposer(tab1, text);
      await expect.poll(() => heldRoute !== null, { timeout: STEP_TIMEOUT_MS }).toBe(true);
      const holderTab = holder as unknown as Page;
      const takerTab = holderTab === tab1 ? tab2 : tab1;
      const takerLabel = takerTab === tab1 ? 'tab1' : 'tab2';
      const heldGeneration = held === 'create' ? 1 : 2;
      let key = '';
      const unfreeze = await freeze(holderTab);
      try {
        const [item] = await readOutbox(takerTab);
        expect(item).toMatchObject({ content: text, state: 'claimed', attemptGeneration: heldGeneration });
        const leaseEnd = item.leaseExpiresAt as number;
        expect(leaseEnd, 'the claim carries a live lease').toBeGreaterThan(Date.now());
        key = item.clientMessageId;
        const takeover = () => calls.filter((call) => call.key === key && call.generation > heldGeneration);

        // The holder hangs: no tab sends anything before the lease ends; then the other tab fences and sends once.
        await expect
          .poll(() => takeover().length, { timeout: LEASE_MS + STEP_TIMEOUT_MS, intervals: [250] })
          .toBeGreaterThanOrEqual(1);
        expect(takeover()[0].startedAt, `no takeover before the lease ends ${JSON.stringify(summary(calls, key))}`).toBeGreaterThanOrEqual(leaseEnd);
        await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
        await expect
          .poll(() => summary(takeover(), key))
          .toEqual([
            [takerLabel, 'fence', heldGeneration + 1, 200, 'not_stored'],
            [takerLabel, 'create', heldGeneration + 1, 201, null],
          ]);

        // The held request reaches the server only now: it is rejected as stale.
        const late = await releaseLate(heldRoute as unknown as Route);
        expect(late).toEqual({ status: 409, code: 'ATTEMPT_SUPERSEDED' });
        const stored = await storedWithTexts(directId, [text]);
        expect(stored).toHaveLength(1);
        expect(stored[0].key).toBe(key);
        await expect(b.page.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      } finally {
        await unfreeze();
      }
      // The resumed tab sends nothing more for the key; both tabs show the message once.
      await holderTab.waitForTimeout(2_000);
      const stored = await storedWithTexts(directId, [text]);
      expect(stored).toHaveLength(1);
      // Only the held generation's requests (create 1; or create 1 + fence 2), then the takeover's two.
      expect(calls.filter((call) => call.key === key && call.generation <= heldGeneration)).toHaveLength(heldGeneration);
      expect(calls.filter((call) => call.key === key)).toHaveLength(heldGeneration + 2);
      for (const tab of [tab1, tab2]) {
        await expect(tab.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
        await expect(bubble(tab, stored[0].key as string)).toHaveCount(0);
      }
      expect(await readOutbox(tab1)).toHaveLength(0);
      await b.page.waitForTimeout(1_500);
      expect((await readArrivals(b.page)).max[text]).toBe(1);
    });
  }

  test("AC-041/AC-045 (block A fix F3): a hung holder whose stored m1 the other tab already observed still lets that tab take over after the lease — m2 delivered once without resuming the holder", async ({
    phase5World,
    openDevice,
  }) => {
    const { b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
    await waitForRealtimeReady(tab2);
    const texts = [`t10 observed m1 ${randomUUID()}`, `t10 after hung holder m2 ${randomUUID()}`];
    await watchArrivals(b.page, texts);
    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);

    // m1's create reaches the real server (stored, INSERT published); its real 201 is held in the browser.
    const releaseM1 = deferred();
    let m1Status: number | null = null;
    let holder: Page | null = null;
    await tab1.context().route('**/api/messages/create', async (route: Route) => {
      if (holder) {
        await route.continue().catch(() => undefined);
        return;
      }
      holder = route.request().frame().page();
      const response = await route.fetch();
      m1Status = response.status();
      await releaseM1.promise;
      await route.fulfill({ response }).catch(() => undefined);
    });

    await sendFromComposer(tab1, texts[0]);
    await expect.poll(() => m1Status, { timeout: STEP_TIMEOUT_MS }).toBe(201);
    const holderTab = holder as unknown as Page;
    const takerTab = holderTab === tab1 ? tab2 : tab1;
    const [m1Row] = await storedWithTexts(directId, [texts[0]]);
    const m1 = m1Row.key as string;
    // The other tab observes m1 stored (Realtime) while the holder still waits for its response.
    await expect(takerTab.getByTestId(`message-${m1Row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(bubble(takerTab, m1)).toHaveCount(0);
    const m1Create = calls.find((call) => call.key === m1 && call.kind === 'create') as ApiCall;
    // The holder observed it too and settles: a tab paused inside an IndexedDB transaction
    // (CDP pauses at the next script) would block every tab's outbox writes, which a hung
    // holder awaiting its response does not do.
    await expect(holderTab.getByTestId(`message-${m1Row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await holderTab.waitForTimeout(2_000);

    // The holder hangs before its held response is handled; m2 is queued in the other tab.
    const unfreeze = await freeze(holderTab);
    let m2 = '';
    try {
      await sendFromComposer(takerTab, texts[1]);
      await expect
        .poll(async () => (await readOutbox(takerTab)).find((row) => row.content === texts[1])?.clientMessageId ?? null, {
          timeout: STEP_TIMEOUT_MS,
        })
        .not.toBeNull();
      m2 = (await readOutbox(takerTab)).find((row) => row.content === texts[1])?.clientMessageId as string;

      // Without resuming the holder, m2 is stored once after the holder's lease ends.
      await expect
        .poll(async () => (await storedWithTexts(directId, [texts[1]])).length, {
          timeout: LEASE_MS + 2 * STEP_TIMEOUT_MS,
          intervals: [500],
        })
        .toBe(1);
      // The row commits before its 201 reaches the browser (status is recorded after the
      // body is read): wait for the recorded answer.
      const m2CreateCalls = () => calls.filter((call) => call.key === m2 && call.kind === 'create');
      await expect
        .poll(() => m2CreateCalls().map((call) => [call.tab, call.generation, call.status ?? null]), { timeout: STEP_TIMEOUT_MS })
        .toEqual([[takerTab === tab1 ? 'tab1' : 'tab2', 1, 201]]);
      const m2Creates = m2CreateCalls();
      expect(m2Creates[0].startedAt, 'm2 waited for the hung holder lease').toBeGreaterThanOrEqual(m1Create.startedAt + LEASE_MS - 1_000);
      await expect(bubble(takerTab, m2)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    } finally {
      releaseM1.resolve();
      await unfreeze();
    }

    // The resumed holder sends nothing more; each message is stored and shown once.
    await holderTab.waitForTimeout(2_000);
    const stored = await storedWithTexts(directId, texts);
    expect(stored.map((row) => [row.content, row.key])).toEqual([
      [texts[0], m1],
      [texts[1], m2],
    ]);
    await expect
      .poll(() => summary(calls, m1).map(([, kind, generation, status]) => [kind, generation, status]))
      .toEqual([['create', 1, 201]]);
    expect(calls.filter((call) => call.key === m2)).toHaveLength(1);
    await expect.poll(async () => (await readOutbox(tab1)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    for (const row of stored) await expect(b.page.getByTestId(`message-${row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await b.page.waitForTimeout(1_500);
    const arrivals = await readArrivals(b.page);
    for (const text of texts) expect(arrivals.max[text], `${text} shown once`).toBe(1);
  });

  test('AC-041: an attempt started during an outage is superseded when connectivity returns and delivered within 10 s', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const { a, b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
    const text = `t10 outage ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);

    // The outage: A's requests to the server get no answer (held in the browser).
    let outage = true;
    const black: Route[] = [];
    await a.context.route(/\/api\/messages\/(create|fence)$/, async (route: Route) => {
      if (outage) {
        black.push(route);
        return;
      }
      await route.continue();
    });
    await sendFromComposer(tab1, text);
    await expect.poll(() => black.length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    const [item] = await readOutbox(tab2);
    expect(item).toMatchObject({ content: text, state: 'claimed', attemptGeneration: 1 });
    // The browser notices the outage, then connectivity returns.
    await goOffline(tab1);
    await tab1.waitForTimeout(1_500);
    outage = false;
    const recoveredAt = Date.now();
    await a.context.setOffline(false);

    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: D1_DEADLINE_MS + 5_000 }).toBe(1);
    await expect.poll(async () => (await readArrivals(b.page)).first[text] ?? null, { timeout: STEP_TIMEOUT_MS }).not.toBeNull();
    const deliveredAfterMs = (await readArrivals(b.page)).first[text] - recoveredAt;
    testInfo.annotations.push({ type: 't10-outage-delivery-ms', description: String(deliveredAfterMs) });
    expect(deliveredAfterMs, 'delivered within 10 s of recovery (D1)').toBeLessThanOrEqual(D1_DEADLINE_MS);

    const key = item.clientMessageId;
    const after = summary(calls, key).map(([, kind, generation, status, outcome]) => [kind, generation, status, outcome]);
    expect(after).toEqual([
      ['create', 1, 'failed', null],
      ['fence', 2, 200, 'not_stored'],
      ['create', 2, 201, null],
    ]);
    expectNoOverlappingCreates(calls, directId);

    // The superseded attempt reaches the server late: it is rejected as stale.
    const late = await releaseLate(black[0]);
    expect(late).toEqual({ status: 409, code: 'ATTEMPT_SUPERSEDED' });
    const stored = await storedWithTexts(directId, [text]);
    expect(stored).toHaveLength(1);
    expect(stored[0].key).toBe(key);
    for (const tab of [tab1, tab2]) {
      await expect(tab.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await expect(bubble(tab, key)).toHaveCount(0);
    }
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
  });

  test('AC-041 (T13, block A review #7): a holder frozen across an outage is superseded by the active tab when connectivity returns — delivered within 10 s, long before the frozen claim\'s lease ends, once', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const { b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
    const text = `t13 frozen holder outage ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);

    // The holder's create is held in the browser (it has not reached the server).
    let heldRoute: Route | null = null;
    let holder: Page | null = null;
    await tab1.context().route('**/api/messages/create', async (route: Route) => {
      if (heldRoute) {
        await route.fallback();
        return;
      }
      heldRoute = route;
      holder = route.request().frame().page();
    });
    await sendFromComposer(tab1, text);
    await expect.poll(() => heldRoute !== null, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    const holderTab = holder as unknown as Page;
    const takerTab = holderTab === tab1 ? tab2 : tab1;
    const takerLabel = takerTab === tab1 ? 'tab1' : 'tab2';
    const [item] = await readOutbox(takerTab);
    expect(item).toMatchObject({ content: text, state: 'claimed', attemptGeneration: 1 });
    const key = item.clientMessageId;
    const leaseEnd = item.leaseExpiresAt as number;
    // The holder settles (awaiting its response, no IndexedDB transaction open), then hangs.
    await holderTab.waitForTimeout(2_000);
    const unfreeze = await freeze(holderTab);
    const takerNetwork = await tabNetwork(takerTab);
    try {
      // The outage: the active tab is offline and the holder's request dies in transit.
      await takerNetwork.setOffline(true);
      await (heldRoute as unknown as Route).abort('internetdisconnected');
      const holderRequestEndedAt = Date.now();
      await takerTab.waitForTimeout(3_000);

      // Connectivity returns to the active tab; the frozen holder cannot notice it.
      const recoveredAt = Date.now();
      await takerNetwork.setOffline(false);
      await expect
        .poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: D1_DEADLINE_MS + 5_000 })
        .toBe(1);
      expect(Date.now(), "delivered while the frozen holder's lease was still live").toBeLessThan(leaseEnd);
      await expect.poll(async () => (await readArrivals(b.page)).first[text] ?? null, { timeout: STEP_TIMEOUT_MS }).not.toBeNull();
      const deliveredAfterMs = (await readArrivals(b.page)).first[text] - recoveredAt;
      testInfo.annotations.push({ type: 't13-frozen-holder-delivery-ms', description: String(deliveredAfterMs) });
      expect(deliveredAfterMs, 'delivered within 10 s of recovery (D1)').toBeLessThanOrEqual(D1_DEADLINE_MS);

      // The active tab fenced the pre-outage attempt under a new generation, then sent it once.
      const takeover = () => calls.filter((call) => call.key === key && call.generation > 1);
      await expect
        .poll(() => summary(takeover(), key))
        .toEqual([
          [takerLabel, 'fence', 2, 200, 'not_stored'],
          [takerLabel, 'create', 2, 201, null],
        ]);
      const takerCreate = takeover().find((call) => call.kind === 'create') as ApiCall;
      expect(takerCreate.startedAt, "the holder's create had ended (no two creates in flight)").toBeGreaterThan(
        holderRequestEndedAt,
      );
    } finally {
      await takerNetwork.setOffline(false).catch(() => undefined);
      await takerNetwork.detach();
      await unfreeze();
    }

    // The resumed holder sends nothing more; the message is stored and shown once.
    await holderTab.waitForTimeout(2_000);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored).toHaveLength(1);
    expect(stored[0].key).toBe(key);
    expect(calls.filter((call) => call.key === key).map((call) => [call.tab, call.kind, call.generation])).toEqual([
      [holderTab === tab1 ? 'tab1' : 'tab2', 'create', 1],
      [takerLabel, 'fence', 2],
      [takerLabel, 'create', 2],
    ]);
    for (const tab of [tab1, tab2]) {
      await expect(tab.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await expect(bubble(tab, key)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    }
    await expect.poll(async () => (await readOutbox(tab1)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
  });

  test('AC-041 (block B fix F3, review #4): the browser stays online while HTTP and Realtime fail and come back — the active tab supersedes the frozen holder\'s attempt within 10 s, once', async ({
    phase5World,
    openDevice,
    realtimeFaults,
  }, testInfo) => {
    let harness: RealtimeFaultController | null = null;
    // A's Realtime sockets (both tabs) go through the fault harness.
    const { b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice, async (a) => {
      harness = await realtimeFaults.attach(a);
    });
    const faults = harness as unknown as RealtimeFaultController;
    const text = `f3 online outage frozen holder ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);
    await waitForRealtimeReady(tab1);
    await waitForRealtimeReady(tab2);

    // The holder's create is held in the browser (it has not reached the server);
    // during the outage every other create/fence fails in transit.
    let httpDown = false;
    let heldRoute: Route | null = null;
    let holder: Page | null = null;
    await tab1.context().route(/\/api\/messages\/(create|fence)$/, async (route: Route) => {
      if (!heldRoute && new URL(route.request().url()).pathname === '/api/messages/create') {
        heldRoute = route;
        holder = route.request().frame().page();
        return;
      }
      if (httpDown) {
        await route.abort('internetdisconnected');
        return;
      }
      await route.fallback();
    });
    await sendFromComposer(tab1, text);
    await expect.poll(() => heldRoute !== null, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    const holderTab = holder as unknown as Page;
    const takerTab = holderTab === tab1 ? tab2 : tab1;
    const takerLabel = takerTab === tab1 ? 'tab1' : 'tab2';
    const [item] = await readOutbox(takerTab);
    expect(item).toMatchObject({ content: text, state: 'claimed', attemptGeneration: 1 });
    const key = item.clientMessageId;
    const leaseEnd = item.leaseExpiresAt as number;
    // The holder settles (awaiting its response, no IndexedDB transaction open).
    await holderTab.waitForTimeout(2_000);
    // The outage, the browser online throughout: every Realtime socket drops
    // (reconnects refused) and every create/fence fails in transit. The sockets
    // are dropped while both tabs run (a paused page cannot process its routed
    // socket's close).
    httpDown = true;
    const refusedBefore = faults.refusedConnections();
    await faults.dropConnection();
    // A reconnect attempt is refused: the tabs saw their sockets go.
    await expect.poll(() => faults.refusedConnections(), { timeout: 10_000 }).toBeGreaterThan(refusedBefore);
    // The holder hangs (between its socket's reconnect attempts), and its request dies in transit.
    const unfreeze = await freeze(holderTab);
    let holderRequestEndedAt = 0;
    try {
      await (heldRoute as unknown as Route).abort('internetdisconnected');
      holderRequestEndedAt = Date.now();

      // Connectivity returns (no browser online event).
      httpDown = false;
      const recoveredAt = Date.now();
      faults.restoreConnection();
      await expect
        .poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: D1_DEADLINE_MS + 5_000 })
        .toBe(1);
      expect(Date.now(), "delivered while the frozen holder's lease was still live").toBeLessThan(leaseEnd);
      await expect.poll(async () => (await readArrivals(b.page)).first[text] ?? null, { timeout: STEP_TIMEOUT_MS }).not.toBeNull();
      const deliveredAfterMs = (await readArrivals(b.page)).first[text] - recoveredAt;
      testInfo.annotations.push({ type: 'f3-online-outage-delivery-ms', description: String(deliveredAfterMs) });
      expect(deliveredAfterMs, 'delivered within 10 s of recovery (D1)').toBeLessThanOrEqual(D1_DEADLINE_MS);

      // The active tab fenced the pre-outage attempt under a new generation, then sent it once.
      const takeover = () => calls.filter((call) => call.key === key && call.generation > 1);
      await expect
        .poll(() => summary(takeover(), key))
        .toEqual([
          [takerLabel, 'fence', 2, 200, 'not_stored'],
          [takerLabel, 'create', 2, 201, null],
        ]);
      const takerCreate = takeover().find((call) => call.kind === 'create') as ApiCall;
      expect(takerCreate.startedAt, "the holder's create had ended (no two creates in flight)").toBeGreaterThan(
        holderRequestEndedAt,
      );
    } finally {
      await unfreeze();
    }

    // The resumed holder sends nothing more; the message is stored and shown once.
    await holderTab.waitForTimeout(2_000);
    for (const tab of [tab1, tab2]) expect(await tab.evaluate(() => navigator.onLine), 'the browser stayed online').toBe(true);
    const stored = await storedWithTexts(directId, [text]);
    expect(stored).toHaveLength(1);
    expect(stored[0].key).toBe(key);
    expect(calls.filter((call) => call.key === key).map((call) => [call.tab, call.kind, call.generation])).toEqual([
      [holderTab === tab1 ? 'tab1' : 'tab2', 'create', 1],
      [takerLabel, 'fence', 2],
      [takerLabel, 'create', 2],
    ]);
    for (const tab of [tab1, tab2]) {
      await expect(tab.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await expect(bubble(tab, key)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
    }
    await expect.poll(async () => (await readOutbox(tab1)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    await b.page.waitForTimeout(1_500);
    expect((await readArrivals(b.page)).max[text]).toBe(1);
  });

  test('FR-004 (block B fix F3, review #3): a claim made after the recovery is never replaced — a tab that processes the outage late sends no fence or create while that create is in flight', async ({
    phase5World,
    openDevice,
  }, testInfo) => {
    const { a, b, tab1, tab2, directId } = await twoTabs(phase5World, openDevice);
    const text = `f3 fresh claim late tab ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    const calls = trackApi([['tab1', tab1], ['tab2', tab2]]);

    // Tab 2 hangs while quiescent: it will process the outage's offline and online events late.
    await tab2.waitForTimeout(2_000);
    const unfreezeTab2 = await freeze(tab2);
    let tab2Frozen = true;
    try {
      // The outage: A sends from tab 1 while offline.
      await goOffline(tab1);
      const [queued] = await queueOffline(a, directId, [text]);
      const key = queued.clientMessageId;
      // Connectivity returns: tab 1 claims at once (a fresh, post-recovery claim);
      // its create is held in the browser.
      const held: Route[] = [];
      await a.context.route('**/api/messages/create', async (route: Route) => {
        if (held.length === 0) {
          held.push(route);
          return;
        }
        await route.fallback();
      });
      await a.context.setOffline(false);
      await expect.poll(() => held.length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
      const claimedSeenAt = Date.now();
      const [claimed] = await readOutbox(tab1);
      expect(claimed).toMatchObject({ clientMessageId: key, state: 'claimed', attemptGeneration: 1 });
      // Tab 2 resumes well after the recovery and processes it late.
      await tab1.waitForTimeout(3_000);
      const resumedAt = Date.now();
      await unfreezeTab2();
      tab2Frozen = false;
      // Longer than the takeover grace (2 s) plus two lock-busy retries (2 s each).
      await tab1.waitForTimeout(8_000);
      expect(
        calls.filter((call) => call.tab === 'tab2'),
        'tab 2 sends no fence or create while the fresh create is in flight',
      ).toEqual([]);
      expect(summary(calls, key), 'only the fresh create, still in flight').toEqual([['tab1', 'create', 1, null, null]]);
      const [still] = await readOutbox(tab1);
      expect(still, 'no replacement claim').toMatchObject({
        state: 'claimed',
        attemptGeneration: 1,
        claimHolder: claimed.claimHolder,
      });

      // The held create is answered: stored and shown once.
      await held[0].fallback();
      await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
      await expect.poll(() => summary(calls, key), { timeout: STEP_TIMEOUT_MS }).toEqual([['tab1', 'create', 1, 201, null]]);
      const stored = await storedWithTexts(directId, [text]);
      for (const tab of [tab1, tab2]) {
        await expect(tab.getByTestId(`message-${stored[0].id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
        await expect(bubble(tab, key)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
      }
      await b.page.waitForTimeout(1_500);
      expect((await readArrivals(b.page)).max[text]).toBe(1);
      expect(calls.filter((call) => call.key === key)).toHaveLength(1);
      testInfo.annotations.push({ type: 'f3-late-tab-resumed-after-ms', description: String(resumedAt - claimedSeenAt) });
    } finally {
      if (tab2Frozen) await unfreezeTab2();
    }
  });
});
