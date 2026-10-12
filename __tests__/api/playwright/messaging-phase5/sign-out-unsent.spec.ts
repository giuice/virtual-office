import { randomUUID } from 'node:crypto';

import type { BrowserContext, Page, Route } from '@playwright/test';

import { test, expect } from '../fixtures/messaging-phase5-faults';
import { login } from '../fixtures/messaging';
import {
  STEP_TIMEOUT_MS,
  createViaApi,
  openConversation,
  readOutbox,
  sendFromComposer,
  storedWithTexts,
  trackOutboxCalls,
  type OutboxApiCall,
} from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T12 — sign-out confirmation with unsent messages (FR-013, BR-008;
 * AC-013, AC-037 dialog clause, AC-047 "Sair mesmo" clause).
 *
 * Reachable in-app sign-out controls (enumerated at task start): one — the
 * account menu's "Sign out" (EnhancedUserMenu), rendered by the header of
 * every DashboardShell page (/floor-plan, /dashboard, /dashboard/profile,
 * /settings, /company). DashboardHeader's own signOut handler is not wired to
 * any control. The control is exercised from /floor-plan, /dashboard/profile
 * and /settings.
 *
 * Real accounts in the real UI; the IndexedDB outbox, the create/fence and
 * Presence logout routes, Supabase Auth and the local database are real.
 * Faults are network shaping (SPEC §15): requests failed in transit, a request
 * held in the browser, a real response held after pass-through and released
 * later, and the Presence logout request held in the browser for a moment.
 */

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
const SIGNED_OUT_NOTICE = 'Successfully signed out!';
/** Longer than the longest transient backoff (15 s) would be pointless here: nothing may run at all. */
const QUIET_MS = 6_000;

const bubble = (page: Page, key: string) => page.getByTestId(`message-temp-${key}`);
const dialog = (page: Page) => page.getByTestId('sign-out-unsent-dialog');
const unsentText = (count: number) => `Você tem ${count} mensagens não enviadas. Sair apaga essas mensagens.`;

async function authCookieNames(context: BrowserContext): Promise<string[]> {
  return (await context.cookies()).filter((cookie) => AUTH_COOKIE.test(cookie.name)).map((cookie) => cookie.name);
}

interface LogoutCall {
  startedAt: number;
  status?: number;
  body?: Record<string, unknown> | null;
}

/** Every Presence logout request of the browser (all tabs), with its answer. */
function trackPresenceLogout(context: BrowserContext): LogoutCall[] {
  const calls: LogoutCall[] = [];
  const byRequest = new Map<unknown, LogoutCall>();
  context.on('request', (request) => {
    if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/presence/logout') return;
    const call: LogoutCall = { startedAt: Date.now() };
    calls.push(call);
    byRequest.set(request, call);
  });
  context.on('requestfinished', (request) => {
    const call = byRequest.get(request);
    if (!call) return;
    void request.response().then(async (response) => {
      if (!response) return;
      call.body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      call.status = response.status();
    });
  });
  return calls;
}

/** The single, successful Presence logout of an unchanged sign-out sequence. */
async function expectOnePresenceLogout(calls: readonly LogoutCall[]): Promise<void> {
  await expect.poll(() => calls.map((call) => call.status ?? null), { timeout: STEP_TIMEOUT_MS }).toEqual([200]);
  expect(calls[0].body).toMatchObject({ success: true });
  expect(['LOCATION_UPDATED', 'LOCATION_UNCHANGED']).toContain(calls[0].body?.code);
}

/** Opens the account menu with the mouse and clicks "Sign out". */
async function clickSignOut(page: Page): Promise<void> {
  await page.getByTestId('account-menu-trigger').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
}

async function expectDialog(page: Page, count: number): Promise<void> {
  await expect(dialog(page)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await expect(page.getByTestId('sign-out-unsent-message')).toHaveText(unsentText(count));
  await expect(page.getByTestId('sign-out-unsent-cancel')).toHaveText('Cancelar');
  await expect(page.getByTestId('sign-out-unsent-confirm')).toHaveText('Sair mesmo');
}

/** "Sair" then "Sair mesmo" (mouse); returns once the browser left for the login page. */
async function signOutDiscarding(page: Page, count: number): Promise<void> {
  await clickSignOut(page);
  await expectDialog(page, count);
  await page.getByTestId('sign-out-unsent-confirm').click();
}

const focusedTestId = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const focusInDialog = (page: Page) =>
  page.evaluate(() => {
    const element = document.querySelector('[data-testid="sign-out-unsent-dialog"]');
    return Boolean(element && element.contains(document.activeElement));
  });

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const summary = (calls: readonly OutboxApiCall[]) =>
  calls.map((call) => [call.kind, call.generation, call.failure ? 'network-error' : (call.status ?? null)]);

test.describe('Phase 5 T12 — sign-out confirmation with unsent messages', () => {
  test.beforeEach(async ({ budgets }) => {
    await budgets.reset();
  });

  test('AC-013/AC-037: with 2 unsent items (two conversations, two tabs) Sair asks first on every page; Cancelar and Esc change nothing; the dialog traps focus; "Sair mesmo" by keyboard deletes the outbox and signs out through Presence logout', async ({
    phase5World,
    openDevice,
  }) => {
    const { groupId, directId } = phase5World.conversations;
    const a = await openDevice('A');
    await createViaApi(a.page, { conversationId: groupId, content: `t12 warm-up ${randomUUID()}` });
    const logout = trackPresenceLogout(a.context);
    // The network fails every create and fence: the items stay unsent (retried under the backoff).
    await a.context.route(/\/api\/messages\/(create|fence)$/, (route: Route) => route.abort('failed'));

    const texts = [`t12 group ${randomUUID()}`, `t12 direct ${randomUUID()}`];
    await openConversation(a.page, groupId);
    await sendFromComposer(a.page, texts[0]);
    const tab2 = await a.newTab();
    await openConversation(tab2, directId);
    await sendFromComposer(tab2, texts[1]);
    await expect.poll(async () => (await readOutbox(a.page)).map((item) => item.content).sort(), { timeout: STEP_TIMEOUT_MS }).toEqual(
      [...texts].sort(),
    );
    const keys = (await readOutbox(a.page)).map((item) => item.clientMessageId).sort();
    const cookies = await authCookieNames(a.context);
    expect(cookies.length).toBeGreaterThan(0);

    const expectNothingHappened = async (page: Page, url: string) => {
      await expect(dialog(page)).toHaveCount(0);
      await page.waitForTimeout(1_500);
      expect(logout, 'no logout request').toEqual([]);
      await expect(page.getByText(SIGNED_OUT_NOTICE)).toHaveCount(0);
      expect(page.url(), 'no navigation').toBe(url);
      expect(await authCookieNames(a.context), 'still signed in').toEqual(cookies);
      expect((await readOutbox(page)).map((item) => item.clientMessageId).sort(), 'items unchanged').toEqual(keys);
    };

    // /floor-plan, mouse: Cancelar.
    await clickSignOut(a.page);
    await expectDialog(a.page, 2);
    await a.page.getByTestId('sign-out-unsent-cancel').click();
    await expectNothingHappened(a.page, a.page.url());
    const groupItem = (await readOutbox(a.page)).find((item) => item.content === texts[0]);
    await expect(bubble(a.page, groupItem?.clientMessageId ?? 'missing'), 'still shown as unsent').toBeVisible();

    // /dashboard/profile, mouse: Esc means Cancelar.
    await a.page.goto('/dashboard/profile');
    await clickSignOut(a.page);
    await expectDialog(a.page, 2);
    await a.page.keyboard.press('Escape');
    await expectNothingHappened(a.page, a.page.url());

    // /settings, keyboard only: the control, the focus trap, Esc, then "Sair mesmo".
    await a.page.goto('/settings');
    const trigger = a.page.getByTestId('account-menu-trigger');
    await trigger.focus();
    await a.page.keyboard.press('Enter');
    const signOutButton = a.page.getByRole('button', { name: 'Sign out', exact: true });
    await expect(signOutButton).toBeVisible();
    await signOutButton.focus();
    await a.page.keyboard.press('Enter');
    await expectDialog(a.page, 2);
    expect(await focusedTestId(a.page), 'focus starts on Cancelar').toBe('sign-out-unsent-cancel');
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await a.page.keyboard.press(key);
      expect(await focusInDialog(a.page), `focus stays in the dialog after ${key}`).toBe(true);
    }
    await a.page.keyboard.press('Escape');
    await expectNothingHappened(a.page, a.page.url());

    await trigger.focus();
    await a.page.keyboard.press('Enter');
    await signOutButton.focus();
    await a.page.keyboard.press('Enter');
    await expectDialog(a.page, 2);
    await a.page.keyboard.press('Tab');
    expect(await focusedTestId(a.page)).toBe('sign-out-unsent-confirm');
    await a.page.keyboard.press('Enter');
    await a.page.waitForURL(/\/login/, { timeout: 2 * STEP_TIMEOUT_MS });
    await expectOnePresenceLogout(logout);
    expect(await authCookieNames(a.context), 'signed out').toEqual([]);
    expect(await readOutbox(a.page), 'the outbox is deleted').toEqual([]);
    expect(await storedWithTexts(groupId, [texts[0]])).toEqual([]);
    expect(await storedWithTexts(directId, [texts[1]])).toEqual([]);
  });

  test('AC-013: with 0 unsent items Sair signs out at once — no dialog, the same Presence logout', async ({ openDevice }) => {
    const a = await openDevice('A');
    const logout = trackPresenceLogout(a.context);
    expect(await readOutbox(a.page)).toEqual([]);
    // Records, across the navigation, whether the confirmation ever showed.
    await a.page.evaluate(() => {
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="sign-out-unsent-dialog"]')) sessionStorage.setItem('t12-dialog-seen', '1');
      }).observe(document.body, { subtree: true, childList: true });
    });
    await clickSignOut(a.page);
    await a.page.waitForURL(/\/login/, { timeout: 2 * STEP_TIMEOUT_MS });
    expect(await a.page.evaluate(() => sessionStorage.getItem('t12-dialog-seen'))).toBeNull();
    await expectOnePresenceLogout(logout);
    expect(await authCookieNames(a.context)).toEqual([]);
  });

  test('AC-013 (stop first): "Sair mesmo" stops a drain in flight in another tab before the Presence logout — its create, held in that tab and released while the logout is still pending, never reaches the server; A signs in again to an empty outbox', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId } = phase5World.conversations;
    const { A } = phase5World.users;
    const a = await openDevice('A');
    await createViaApi(a.page, { conversationId: directId, content: `t12 warm-up ${randomUUID()}` });
    await openConversation(a.page, directId);
    const tab2 = await a.newTab();
    await openConversation(tab2, directId);
    const calls = trackOutboxCalls(a.page);
    trackOutboxCalls(tab2, calls);
    const logout = trackPresenceLogout(a.context);
    const texts = [`t12 in flight ${randomUUID()}`, `t12 waiting ${randomUUID()}`];

    // The first create is held in the browser of the tab that drains it: it has not reached the server.
    let heldRoute: Route | null = null;
    let holder: Page | null = null;
    await a.context.route('**/api/messages/create', async (route: Route) => {
      if (heldRoute) {
        await route.fallback();
        return;
      }
      heldRoute = route;
      holder = route.request().frame().page();
    });
    await sendFromComposer(a.page, texts[0]);
    await expect.poll(() => heldRoute !== null, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    await sendFromComposer(a.page, texts[1]);
    await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
    const holderTab = holder as unknown as Page;
    const otherTab = holderTab === a.page ? tab2 : a.page;

    // The sign-out's Presence logout is held in the browser for a moment (well under its 5 s attempt timeout).
    const releaseLogout = deferred();
    await a.context.route('**/api/presence/logout', async (route: Route) => {
      await releaseLogout.promise;
      await route.continue();
    });
    await signOutDiscarding(otherTab, 2);
    await expect.poll(() => logout.length, { timeout: STEP_TIMEOUT_MS }).toBe(1);
    // By now every drain stopped and the outbox is deleted, while A's session is still valid on the server.
    expect(await readOutbox(otherTab), 'deleted before the Presence logout').toEqual([]);
    const atLogout = calls.length;
    await (heldRoute as unknown as Route).continue().catch(() => undefined);
    await otherTab.waitForTimeout(2_000);
    releaseLogout.resolve();
    await otherTab.waitForURL(/\/login/, { timeout: 2 * STEP_TIMEOUT_MS });
    await expectOnePresenceLogout(logout);
    expect(await storedWithTexts(directId, texts), 'the held create never reached the server').toEqual([]);
    expect(summary(calls.slice(atLogout)), 'nothing sent from the Presence logout on').toEqual([]);
    expect(await readOutbox(otherTab)).toEqual([]);

    // A signs in again: the outbox is empty and nothing is sent.
    await login(otherTab, A.email, A.password);
    await openConversation(otherTab, directId);
    await otherTab.waitForTimeout(QUIET_MS);
    expect(await readOutbox(otherTab)).toEqual([]);
    expect(summary(calls.slice(atLogout)), 'nothing sent after signing in again').toEqual([]);
    expect(await storedWithTexts(directId, texts)).toEqual([]);
    await expect(otherTab.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
  });

  for (const held of ['create', 'fence'] as const) {
    test(`AC-047 (Sair mesmo): A's real ${held} response, held in another tab while A confirms "Sair mesmo", is released after the sign-out — no item reappears, nothing more is sent; A signs in again to an empty outbox`, async ({
      phase5World,
      openDevice,
      realtimeFaults,
    }) => {
      const { directId } = phase5World.conversations;
      const { A } = phase5World.users;
      const a = await openDevice('A');
      await createViaApi(a.page, { conversationId: directId, content: `t12 warm-up ${randomUUID()}` });
      // A cannot learn of a stored message through Realtime in either tab: only the responses matter.
      const aRealtime = await realtimeFaults.attach(a);
      await openConversation(a.page, directId);
      const tab2 = await a.newTab();
      await openConversation(tab2, directId);
      await aRealtime.waitForReady('messages');
      await expect.poll(() => aRealtime.joinedTopics('messages').length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
      await aRealtime.fail('messages', 'error');
      const calls = trackOutboxCalls(a.page);
      trackOutboxCalls(tab2, calls);
      const logout = trackPresenceLogout(a.context);
      const texts = [`t12 held ${held} ${randomUUID()}`, `t12 behind ${held} ${randomUUID()}`];

      const release = deferred();
      let heldStatus: number | null = null;
      let holder: Page | null = null;
      let creates = 0;
      await a.context.route(/\/api\/messages\/(create|fence)$/, async (route: Route) => {
        const kind = route.request().url().endsWith('/create') ? 'create' : 'fence';
        if (kind === 'create') creates += 1;
        // Fence case: the first create fails in transit (never stored), so the next attempt starts with a fence.
        if (held === 'fence' && kind === 'create' && creates === 1) {
          await route.abort('failed');
          return;
        }
        if (kind !== held || holder !== null) {
          await route.fallback();
          return;
        }
        holder = route.request().frame().page();
        // The real server answers now; the tab gets the answer only when released.
        const response = await route.fetch();
        heldStatus = response.status();
        await release.promise;
        await route.fulfill({ response }).catch(() => undefined);
      });

      await sendFromComposer(a.page, texts[0]);
      await expect.poll(() => heldStatus, { timeout: STEP_TIMEOUT_MS }).toBe(held === 'create' ? 201 : 200);
      await sendFromComposer(a.page, texts[1]);
      await expect.poll(async () => (await readOutbox(a.page)).length, { timeout: STEP_TIMEOUT_MS }).toBe(2);
      const keys = (await readOutbox(a.page)).map((item) => item.clientMessageId);
      const holderTab = holder as unknown as Page;
      const otherTab = holderTab === a.page ? tab2 : a.page;

      await signOutDiscarding(otherTab, 2);
      await otherTab.waitForURL(/\/login/, { timeout: 2 * STEP_TIMEOUT_MS });
      await expectOnePresenceLogout(logout);
      const signedOut = calls.length;
      expect(await readOutbox(otherTab)).toEqual([]);

      // The held answer reaches the stopped tab only now.
      release.resolve();
      await holderTab.waitForTimeout(3_000);
      expect(await readOutbox(holderTab), 'nothing comes back').toEqual([]);
      for (const key of keys) await expect(bubble(holderTab, key)).toHaveCount(0);
      expect(summary(calls.slice(signedOut)), 'nothing more sent').toEqual([]);
      const storedBefore = await storedWithTexts(directId, texts);
      expect(storedBefore.map((row) => [row.content, row.key, row.sender_id])).toEqual(
        held === 'create' ? [[texts[0], keys[0], A.userId]] : [],
      );

      // A signs in again: the outbox is empty, nothing is sent, nothing pending shows.
      await login(otherTab, A.email, A.password);
      await openConversation(otherTab, directId);
      await otherTab.waitForTimeout(QUIET_MS);
      expect(await readOutbox(otherTab)).toEqual([]);
      for (const key of keys) await expect(bubble(otherTab, key)).toHaveCount(0);
      expect(summary(calls.slice(signedOut)), 'nothing sent after signing in again').toEqual([]);
      expect(await storedWithTexts(directId, texts)).toEqual(storedBefore);
    });
  }
});
