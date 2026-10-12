import { randomUUID } from 'node:crypto';

import type { BrowserContext, Cookie, Page, Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { test, expect, type Phase5Device } from '../fixtures/messaging-phase5-faults';
import { login } from '../fixtures/messaging';
import { openDrawer, waitForRealtimeReady } from '../helpers/drawer-helpers';
import { LOCAL_SUPABASE_ANON_KEY, LOCAL_SUPABASE_API_URL } from '../helpers/local-supabase-mode';
import {
  STEP_TIMEOUT_MS,
  composerInput,
  createViaApi,
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
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T11 — identity fencing and session-end hold (FR-011, FR-012,
 * BR-001; AC-012, AC-044 client clauses, AC-047 switch and same-identity
 * clauses).
 *
 * Real accounts A, B and C in the real UI; the app, its IndexedDB outbox, the
 * create and fence routes, Supabase Auth and the local database are real.
 * Sessions end and switch the ways a shared browser sees them:
 *   - A's auth cookies cleared (site data cleared) — no auth event in any tab;
 *   - A signed out everywhere from another device (Auth's global sign-out
 *     revokes the browser's session; the next server check rejects it);
 *   - C signing in through the login page in another tab (the auth client
 *     tells the browser's other tabs);
 *   - C's session written into the browser's cookies without any auth event,
 *     as a sign-in completed by a server response (the OAuth/magic-link
 *     callback route) in another tab does — the cookies are C's real ones
 *     from C's own UI sign-in;
 *   - a 401 while the browser still holds A's valid session (SPEC edge case
 *     "Temporary Auth failure"): the Auth server keeps running; the browser's
 *     create is forwarded by the spec to the real route WITHOUT its auth
 *     cookie (a hop that drops the session), so the real route answers 401.
 *     This proves the client's valid-session/401 branch, not a real Auth
 *     outage (request shaping beyond SPEC §15's literal list).
 * Other faults are network shaping (SPEC §15): offline mode, a request held
 * in the browser or its real response held after pass-through and released
 * later, a request failed in transit, A's messages stream withheld (T25), and
 * presence heartbeats of a stale tab held. A hung tab is paused through CDP
 * (as in T10): a request of a live tab is aborted at its 30 s deadline.
 */

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
const LEASE_MS = 45_000;
/** Longer than the longest transient backoff (15 s). */
const QUIET_MS = 17_000;

const bubble = (page: Page, key: string) => page.getByTestId(`message-temp-${key}`);
const stateLabel = (page: Page, key: string) => page.getByTestId(`message-delivery-state-temp-${key}`);
const discardButton = (page: Page, key: string) => page.getByTestId(`message-discard-temp-${key}`);

/** [kind, generation, status | 'network-error', fence outcome] of each call. */
const summary = (calls: readonly OutboxApiCall[]) =>
  calls.map((call) => [call.kind, call.generation, call.failure ? 'network-error' : (call.status ?? null), call.outcome ?? null]);

/** Names (never values) of the browser's Supabase auth cookies. */
async function authCookieNames(context: BrowserContext): Promise<string[]> {
  return (await context.cookies()).filter((cookie) => AUTH_COOKIE.test(cookie.name)).map((cookie) => cookie.name);
}

/** The browser's auth cookies are cleared (site data cleared without "Sair"): no tab is told. */
async function clearAuthCookies(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: AUTH_COOKIE });
  expect(await authCookieNames(context)).toEqual([]);
}

/** A device's own auth cookies, from its real UI sign-in (values never printed). */
async function authCookies(context: BrowserContext): Promise<Cookie[]> {
  const cookies = (await context.cookies()).filter((cookie) => AUTH_COOKIE.test(cookie.name));
  expect(cookies.length, 'the device holds a session').toBeGreaterThan(0);
  return cookies;
}

/** The user signs out everywhere from another device: Auth revokes every session of the user. */
async function signOutEverywhere(user: { email: string; password: string }): Promise<void> {
  const client = createClient(LOCAL_SUPABASE_API_URL, LOCAL_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword(user);
  expect(signInError, 'the other device signs in').toBeNull();
  const { error } = await client.auth.signOut({ scope: 'global' });
  expect(error, 'global sign-out').toBeNull();
}

/**
 * Sends the held request to the real server itself, without the browser's
 * cookies (a hop that drops the session), and returns the server's real
 * answer. The browser's own cookie jar is never touched.
 */
async function forwardWithoutSession(route: Route): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const request = route.request();
  const headers = Object.fromEntries(
    Object.entries(await request.allHeaders()).filter(([name]) => !/^(cookie|host|content-length|connection)$/i.test(name)),
  );
  const response = await fetch(request.url(), { method: request.method(), headers, body: request.postData() ?? undefined });
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (!/^(set-cookie|content-encoding|content-length|transfer-encoding|connection)$/i.test(name)) responseHeaders[name] = value;
  });
  expect(response.headers.get('set-cookie'), 'the server did not end the browser session').toBeNull();
  return { status: response.status, headers: responseHeaders, body: Buffer.from(await response.arrayBuffer()) };
}

/** `texts` reached B once each, in this order. */
async function expectArrivedInOrder(b: Phase5Device, texts: readonly string[]): Promise<void> {
  await expect
    .poll(async () => {
      const { first } = await readArrivals(b.page);
      return texts.filter((text) => first[text] !== undefined).length;
    }, { timeout: 2 * STEP_TIMEOUT_MS })
    .toBe(texts.length);
  await b.page.waitForTimeout(1_500);
  const arrivals = await readArrivals(b.page);
  for (let index = 1; index < texts.length; index += 1) {
    expect(arrivals.first[texts[index]], `${texts[index]} after ${texts[index - 1]}`).toBeGreaterThanOrEqual(
      arrivals.first[texts[index - 1]],
    );
  }
  for (const text of texts) expect(arrivals.max[text], `${text} shown once`).toBe(1);
}

/** The page shows none of `texts` and no pending copy of `keys` (its drawer open). */
async function expectNoneOf(page: Page, texts: readonly string[], keys: readonly string[]): Promise<void> {
  for (const key of keys) await expect(bubble(page, key)).toHaveCount(0);
  for (const text of texts) await expect(page.getByText(text, { exact: false })).toHaveCount(0);
}

/** Holds the page's presence requests in the browser (a stale tab's heartbeats never reach the server). */
async function holdPresenceRequests(page: Page): Promise<void> {
  await page.route('**/api/presence/**', () => undefined);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Pauses the tab's main thread (CDP) until the returned function resumes it (T10 helper). */
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

test.describe('Phase 5 T11 — identity fencing and session-end hold', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  for (const ending of ['cookies cleared', 'signed out everywhere'] as const) {
    test(`AC-012/AC-044: A's session ends without Sair (${ending}) while items wait — held, nothing is sent while signed out or while C is signed in, C sees none of them; A signs in again and they are delivered as A`, async ({
      phase5World,
      openDevice,
    }) => {
      const { groupId } = phase5World.conversations;
      const { A, C } = phase5World.users;
      const a = await openDevice('A');
      const b = await openDevice('B');
      await createViaApi(a.page, { conversationId: groupId, content: `t11 warm-up ${randomUUID()}` });
      await openConversation(b.page, groupId);
      await waitForRealtimeReady(b.page);
      const texts = [`t11 held m1 ${randomUUID()}`, `t11 held m2 ${randomUUID()}`];
      await watchArrivals(b.page, texts);

      // A's tab shows the group; a second tab of the same browser is where C, then A, sign in.
      await openConversation(a.page, groupId);
      const tab2 = await a.newTab();
      const calls = trackOutboxCalls(a.page);
      trackOutboxCalls(tab2, calls);

      // The drain is paused: the items wait while the browser is offline.
      await goOffline(a.page);
      const queued = await queueOffline(a, groupId, texts);
      const keys = queued.map((item) => item.clientMessageId);

      // A's session ends without "Sair"; A's tab is not told and still shows A.
      if (ending === 'cookies cleared') {
        await clearAuthCookies(a.context);
      } else {
        await signOutEverywhere(A);
      }
      await a.context.setOffline(false);

      if (ending === 'cookies cleared') {
        // The drain resumes on the online event and finds no session: nothing is sent; items unchanged.
        await a.page.waitForTimeout(4_000);
        expect(summary(calls), 'nothing sent without a session').toEqual([]);
        expect(await readOutbox(a.page)).toEqual(queued);
      } else {
        // The browser still holds A's (revoked) session: the first create is rejected by the
        // server, which also ends the session in the browser; the client now reports signed out.
        await expect.poll(() => authCookieNames(a.context), { timeout: 45_000, intervals: [250] }).toEqual([]);
      }
      const signedOutAt = Date.now();
      await a.page.waitForTimeout(QUIET_MS);
      const whileSignedOut = calls.filter((call) => call.startedAt > signedOutAt);
      expect(summary(whileSignedOut), 'nothing sent once the client reports signed out').toEqual([]);
      for (const call of calls) {
        expect([call.kind, call.status], 'every request before that was the rejected create').toEqual(['create', 401]);
      }
      const heldItems = await readOutbox(a.page);
      expect(heldItems.map((item) => [item.clientMessageId, item.content, item.failureReason])).toEqual(
        queued.map((item) => [item.clientMessageId, item.content, null]),
      );
      for (const item of heldItems) expect(['waiting', 'claimed'], 'held, not failed or expired').toContain(item.state);
      expect(await storedWithTexts(groupId, texts)).toEqual([]);

      // C signs in on the same browser (tab 2); tab 1 follows (the auth client tells it).
      const beforeC = calls.length;
      await login(tab2, C.email, C.password);
      for (const tab of [tab2, a.page]) {
        await openConversation(tab, groupId);
        await expect(tab.getByTestId('messages-feed')).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      }
      await a.page.waitForTimeout(5_000);
      for (const tab of [tab2, a.page]) await expectNoneOf(tab, texts, keys);
      expect(summary(calls.slice(beforeC)), 'no create or fence while C is signed in').toEqual([]);
      // C's outbox never touched A's items.
      expect(await readOutbox(a.page)).toEqual(heldItems);

      // C's session ends; A signs in again: A's items are delivered as A, once each, in order.
      await clearAuthCookies(a.context);
      const beforeA = calls.length;
      await login(tab2, A.email, A.password);
      await expectArrivedInOrder(b, texts);
      const stored = await storedWithTexts(groupId, texts);
      expect(stored.map((row) => [row.content, row.key, row.sender_id])).toEqual(
        texts.map((text, index) => [text, keys[index], A.userId]),
      );
      await expect.poll(async () => (await readOutbox(tab2)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
      const afterA = calls.slice(beforeA);
      expect(afterA.every((call) => call.status === 200 || call.status === 201), JSON.stringify(summary(afterA))).toBe(true);
      expect(afterA.filter((call) => call.kind === 'create' && call.status === 201)).toHaveLength(2);
      test.info().annotations.push({ type: 't11-calls', description: JSON.stringify(summary(calls)) });
    });
  }

  test('AC-012: a 401 while A still holds a valid session keeps the item pending and retries it under the backoff; delivered once when the server accepts the session again', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const a = await openDevice('A');
    const b = await openDevice('B');
    await createViaApi(a.page, { conversationId: directId, content: `t11 warm-up ${randomUUID()}` });
    await openConversation(b.page, directId);
    await waitForRealtimeReady(b.page);
    const text = `t11 transient 401 ${randomUUID()}`;
    await watchArrivals(b.page, [text]);
    await openConversation(a.page, directId);
    const calls = trackOutboxCalls(a.page);

    // The creates reach the real route without the session (a hop drops the auth cookie): the
    // server answers a real 401, while the browser keeps A's valid session untouched.
    let dropSession = true;
    await a.page.route('**/api/messages/create', async (route: Route) => {
      if (!dropSession) {
        await route.continue();
        return;
      }
      await route.fulfill(await forwardWithoutSession(route));
    });
    await sendFromComposer(a.page, text);
    await expect.poll(() => calls.filter((call) => call.status === 401).length, { timeout: STEP_TIMEOUT_MS }).toBeGreaterThanOrEqual(3);
    const [item] = await readOutbox(a.page);
    const key = item.clientMessageId;
    // Pending and retried under the shared backoff — not held, failed, or deleted.
    expect(item).toMatchObject({ content: text, failureReason: null });
    expect(['waiting', 'claimed']).toContain(item.state);
    await expect(stateLabel(a.page, key)).toHaveAttribute('data-delivery-state', /^(pending|sending)$/);
    expect(await authCookieNames(a.context), 'the browser session is untouched').not.toEqual([]);
    const rejected = calls.filter((call) => call.status === 401);
    expect(rejected.map((call) => [call.kind, call.code])).toEqual(rejected.map(() => ['create', 'UNAUTHORIZED']));
    for (let index = 2; index < rejected.length; index += 1) {
      expect(rejected[index].startedAt - rejected[index - 1].startedAt, 'the backoff grows').toBeGreaterThan(
        rejected[index - 1].startedAt - rejected[index - 2].startedAt,
      );
    }

    dropSession = false;
    await expect.poll(async () => (await storedWithTexts(directId, [text])).length, { timeout: 2 * STEP_TIMEOUT_MS }).toBe(1);
    const [stored] = await storedWithTexts(directId, [text]);
    expect([stored.key, stored.sender_id]).toEqual([key, phase5World.users.A.userId]);
    await expectArrivedInOrder(b, [text]);
    await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(0);
    const statuses = calls.map((call) => [call.kind, call.status]);
    expect(statuses.slice(0, -1).every(([kind, status]) => kind === 'create' && status === 401), JSON.stringify(statuses)).toBe(true);
    expect(statuses.at(-1)).toEqual(['create', 201]);
    test.info().annotations.push({ type: 't11-401-retries', description: JSON.stringify(rejected.map((call) => call.startedAt - rejected[0].startedAt)) });
  });

  for (const held of ['create', 'fence'] as const) {
    test(`AC-047: A's real ${held} response held while the browser switches to C (signed in by a server response, no auth event) is discarded — no request as C, item and claim unchanged, C sees nothing of A's; A signs in again and it is stored once`, async ({
      phase5World,
      openDevice,
      realtimeFaults,
    }) => {
      const { directId } = phase5World.conversations;
      const { A } = phase5World.users;
      const a = await openDevice('A');
      const b = await openDevice('B');
      const c = await openDevice('C');
      const cCookies = await authCookies(c.context);
      await createViaApi(a.page, { conversationId: directId, content: `t11 warm-up ${randomUUID()}` });
      await openConversation(b.page, directId);
      await waitForRealtimeReady(b.page);
      const text = `t11 late ${held} ${randomUUID()}`;
      await watchArrivals(b.page, [text]);

      // A cannot learn of a stored message through Realtime: only the responses matter.
      const aRealtime = await realtimeFaults.attach(a);
      await openConversation(a.page, directId);
      await aRealtime.waitForReady('messages');
      await aRealtime.fail('messages', 'error');
      const calls = trackOutboxCalls(a.page);

      const release = deferred();
      let heldStatus: number | null = null;
      let creates = 0;
      await a.page.route(/\/api\/messages\/(create|fence)$/, async (route: Route) => {
        const kind = route.request().url().endsWith('/create') ? 'create' : 'fence';
        if (kind === 'create') creates += 1;
        // Fence case: the first create fails in transit (never stored), so the next attempt starts with a fence.
        if (held === 'fence' && kind === 'create' && creates === 1) {
          await route.abort('failed');
          return;
        }
        if (kind !== held || heldStatus !== null) {
          await route.continue();
          return;
        }
        // The real server answers now; the browser gets the answer only when released.
        const response = await route.fetch();
        heldStatus = response.status();
        await release.promise;
        await route.fulfill({ response }).catch(() => undefined);
      });

      await sendFromComposer(a.page, text);
      await expect.poll(() => heldStatus, { timeout: STEP_TIMEOUT_MS }).toBe(held === 'create' ? 201 : 200);
      const heldGeneration = held === 'create' ? 1 : 2;
      const [before] = await readOutbox(a.page);
      expect(before).toMatchObject({ content: text, state: 'claimed', attemptGeneration: heldGeneration });
      const key = before.clientMessageId;
      expect(await storedWithTexts(directId, [text])).toHaveLength(held === 'create' ? 1 : 0);

      // Another tab completes a sign-in as C through a server response: the browser's auth
      // cookies are now C's and no tab is told. (This stale tab's presence heartbeats are held.)
      await holdPresenceRequests(a.page);
      await clearAuthCookies(a.context);
      await a.context.addCookies(cCookies);
      const switched = calls.length;
      release.resolve();
      await a.page.waitForTimeout(3_000);
      expect(summary(calls.slice(switched)), 'nothing sent as C').toEqual([]);
      expect(await readOutbox(a.page), 'item and claim unchanged').toEqual([before]);
      expect(await storedWithTexts(directId, [text])).toHaveLength(held === 'create' ? 1 : 0);

      // Block A fix F2 — the stale tab stays open under C's session. A's pending copy is gone from it.
      await expect(bubble(a.page, key), "A's copy hidden in the stale tab").toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
      await expect(a.page.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
      // C cannot queue a message under A there: nothing is stored or sent, and the draft stays.
      const cText = `t11 stale-tab send as C ${randomUUID()}`;
      await sendFromComposer(a.page, cText);
      await a.page.waitForTimeout(2_000);
      await expect(composerInput(a.page), 'the draft stays in the composer').toHaveValue(cText);
      await expect(a.page.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
      expect(await readOutbox(a.page), 'nothing queued under A').toEqual([before]);
      expect(summary(calls.slice(switched)), 'nothing sent from the stale tab').toEqual([]);
      expect(await storedWithTexts(directId, [cText])).toEqual([]);

      // C's view of this browser (a fresh tab) shows nothing of A's.
      const cTab = await a.newTab();
      trackOutboxCalls(cTab, calls);
      await cTab.goto('/floor-plan');
      await openDrawer(cTab);
      await expect(cTab.locator('[data-testid^="conversation-item-"]').first()).toBeVisible({ timeout: STEP_TIMEOUT_MS });
      await expect(cTab.getByTestId(`conversation-item-${directId}`)).toHaveCount(0);
      await cTab.waitForTimeout(3_000);
      await expectNoneOf(cTab, [text], [key]);
      expect(summary(calls.slice(switched)), 'no create or fence while C is signed in').toEqual([]);
      expect(await readOutbox(cTab)).toEqual([before]);

      // C signs out from the stale tab's account menu (its profile still reads A): C's sign-out
      // neither counts nor deletes A's items — no unsent-messages dialog, A's item intact.
      await a.page.unroute('**/api/presence/**');
      await a.page.getByTestId('account-menu-trigger').click();
      await a.page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await a.page.waitForURL(/\/login/, { timeout: STEP_TIMEOUT_MS });
      expect(await authCookieNames(a.context), "C's session ended").toEqual([]);
      await expect(a.page.getByTestId('sign-out-unsent-dialog')).toHaveCount(0);
      expect(await readOutbox(a.page), "C's sign-out left A's item intact").toEqual([before]);
      expect(summary(calls.slice(switched)), 'nothing sent during C sign-out').toEqual([]);
      await a.page.close();

      // A signs in again: the item is fenced and stored exactly once.
      aRealtime.restore();
      await clearAuthCookies(a.context);
      await login(cTab, A.email, A.password);
      await expect.poll(async () => (await readOutbox(cTab)).length, { timeout: 2 * STEP_TIMEOUT_MS }).toBe(0);
      const stored = await storedWithTexts(directId, [text]);
      expect(stored.map((row) => [row.key, row.sender_id])).toEqual([[key, A.userId]]);
      await expectArrivedInOrder(b, [text]);
      expect(summary(calls.slice(switched))).toEqual(
        held === 'create'
          ? [['fence', heldGeneration + 1, 200, 'stored']]
          : [
              ['fence', heldGeneration + 1, 200, 'not_stored'],
              ['create', heldGeneration + 1, 201, null],
            ],
      );
    });
  }

  test("AC-047 (same identity): a hung tab's held create released after another tab superseded the item and A deleted it — nothing reappears, nothing more is sent", async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { roomId } = phase5World.conversations;
    const a = await openDevice('A');
    await createViaApi(a.page, { conversationId: roomId, content: `t11 warm-up ${randomUUID()}` });
    await openConversation(a.page, roomId);
    const tab2 = await a.newTab();
    await openConversation(tab2, roomId);
    const calls = trackOutboxCalls(a.page);
    trackOutboxCalls(tab2, calls);
    const text = `t11 superseded ${randomUUID()}`;

    let heldRoute: Route | null = null;
    let holder: Page | null = null;
    await a.context.route('**/api/messages/create', async (route: Route) => {
      if (heldRoute) {
        await route.fallback();
        return;
      }
      // Held in the browser: it has not reached the server.
      heldRoute = route;
      holder = route.request().frame().page();
    });
    await sendFromComposer(a.page, text);
    await expect.poll(() => heldRoute !== null, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    const holderTab = holder as unknown as Page;
    const otherTab = holderTab === a.page ? tab2 : a.page;
    const unfreeze = await freeze(holderTab);
    let key = '';
    try {
      const [item] = await readOutbox(otherTab);
      expect(item).toMatchObject({ content: text, state: 'claimed', attemptGeneration: 1 });
      key = item.clientMessageId;
      // A loses access to the room; after the hung holder's lease the other tab fences (403) and fails it.
      expect(await membership.remove(roomId, 'A')).toBe(1);
      await expect(stateLabel(otherTab, key)).toHaveText('não enviada', { timeout: LEASE_MS + 2 * STEP_TIMEOUT_MS });
      expect(summary(calls)).toEqual([
        ['create', 1, null, null],
        ['fence', 2, 403, null],
      ]);
      // A deletes it ("Apagar"): gone in this tab and from the outbox.
      await discardButton(otherTab, key).click();
      await expect(bubble(otherTab, key)).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
      expect(await readOutbox(otherTab)).toEqual([]);

      // The hung tab's attempt reaches the server only now: rejected (older generation / no access).
      const response = await (heldRoute as unknown as Route).fetch();
      expect([403, 409]).toContain(response.status());
      await (heldRoute as unknown as Route).fulfill({ response }).catch(() => undefined);
    } finally {
      await unfreeze();
    }
    // The resumed tab applies nothing: the deleted item does not reappear, nothing more is sent.
    const settled = calls.length;
    await holderTab.waitForTimeout(QUIET_MS);
    for (const tab of [a.page, tab2]) await expect(bubble(tab, key)).toHaveCount(0);
    expect(await readOutbox(otherTab)).toEqual([]);
    expect(summary(calls.slice(settled)), 'nothing more sent').toEqual([]);
    expect(await storedWithTexts(roomId, [text])).toEqual([]);
  });
});
