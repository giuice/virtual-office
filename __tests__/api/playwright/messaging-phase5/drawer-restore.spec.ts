import { randomUUID } from 'node:crypto';

import type { BrowserContext, Page, Request } from '@playwright/test';

import { test, expect, type Phase5User } from '../fixtures/messaging-phase5';
import { login } from '../fixtures/messaging';
import { backToConversationList, openDrawer } from '../helpers/drawer-helpers';
import { STEP_TIMEOUT_MS, openConversation, sendFromComposer } from '../helpers/messaging-outbox-e2e';

/**
 * Phase 5 T20 — the messaging drawer after a reload, per user (FR-031,
 * BR-016; AC-032), and the same-browser tab jump found in T16.
 *
 * Real accounts A and C, the real app, local Supabase. The drawer of a tab is
 * saved for the signed-in user (users.id) in that tab's sessionStorage
 * (`vo:messaging:drawer:<users.id>`, src/lib/messaging/drawer-restore.ts) and
 * read once, when the conversation list of a reloaded page arrives.
 *
 * "C signs in on that browser" is covered both ways a browser sees it: in the
 * same tab after A signed out (with the login page reloaded first, so C's
 * sign-in happens on a reloaded page — the one load that reads a saved
 * drawer), and in another tab while A's tab stays open (that tab switches to C
 * in place).
 */

const LIST_PATH = '/api/conversations/get';
/** After the list has arrived: long enough for a restore to have rendered. */
const SETTLE_MS = 1_500;
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

const drawer = (page: Page) => page.getByTestId('messaging-drawer');
const drawerTitle = (page: Page) => page.getByTestId('messaging-drawer-title');
const feed = (page: Page) => page.getByTestId('messages-feed');
const trigger = (page: Page) => page.getByTestId('messaging-drawer-trigger');
const listItem = (page: Page, conversationId: string) => page.getByTestId(`conversation-item-${conversationId}`);

interface ListLoad {
  request: Request;
  startedAt: number;
  finished: boolean;
}

/** Every conversation-list request of `page` (all its documents), with when it started. */
function trackListLoads(page: Page): ListLoad[] {
  const loads: ListLoad[] = [];
  const isList = (request: Request) => request.method() === 'GET' && new URL(request.url()).pathname === LIST_PATH;
  page.on('request', (request) => {
    if (isList(request)) loads.push({ request, startedAt: Date.now(), finished: false });
  });
  const finish = (request: Request) => {
    const load = loads.find((entry) => entry.request === request);
    if (load) load.finished = true;
  };
  page.on('requestfinished', finish);
  page.on('requestfailed', finish);
  return loads;
}

/** Waits until a list request that started at or after `since` has finished, then lets the page settle. */
async function listLoadedSince(page: Page, loads: ListLoad[], since: number): Promise<void> {
  await expect
    .poll(() => loads.some((load) => load.startedAt >= since && load.finished), { timeout: STEP_TIMEOUT_MS })
    .toBe(true);
  await page.waitForTimeout(SETTLE_MS);
}

async function reloadAndWaitForList(page: Page, loads: ListLoad[]): Promise<void> {
  const since = Date.now();
  await page.reload();
  await listLoadedSince(page, loads, since);
}

/** The drawer `userId` left saved in this tab (sessionStorage), or null. */
async function savedDrawer(page: Page, userId: string): Promise<Record<string, unknown> | null> {
  const raw = await page.evaluate((key) => window.sessionStorage.getItem(key), `vo:messaging:drawer:${userId}`);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

async function expectDrawerClosed(page: Page): Promise<void> {
  await expect(drawer(page)).toHaveCount(0);
  await expect(trigger(page)).toBeVisible();
}

/** "Sign out" in the account menu (nothing unsent: no confirmation); ends on the login page. */
async function signOut(page: Page): Promise<void> {
  await page.getByTestId('account-menu-trigger').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(/\/login/, { timeout: STEP_TIMEOUT_MS });
}

/** Signs in on the login page already shown (no navigation of its own, unlike fixtures `login`). */
async function signInOnThisPage(page: Page, user: Phase5User, loads: ListLoad[]): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel(/^email$/i).fill(user.email);
  await page.getByLabel(/^(password|senha)$/i).fill(user.password);
  const since = Date.now();
  await page.getByRole('button', { name: /^(sign in|entrar)$/i }).click();
  await page.waitForURL(/dashboard|floor-plan/, { timeout: 30_000 });
  await listLoadedSince(page, loads, since);
}

const navigationType = (page: Page) =>
  page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? null);

async function clearAuthCookies(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: AUTH_COOKIE });
  expect((await context.cookies()).filter((cookie) => AUTH_COOKIE.test(cookie.name))).toEqual([]);
}

test.describe('Phase 5 T20 — drawer restore after reload, per user', () => {
  test('AC-032: an open drawer reopens on its conversation after a reload of its tab; another tab never moves it; a closed drawer stays closed; a user switch in place drops the conversation', async ({
    phase5World,
    openDevice,
  }) => {
    const { directId, groupId } = phase5World.conversations;
    const { C } = phase5World.users;
    const a = await openDevice('A');
    const loads1 = trackListLoads(a.page);

    // A opens the group; after a reload the drawer reopens on it.
    await openConversation(a.page, groupId);
    const groupTitle = (await drawerTitle(a.page).innerText()).trim();
    expect(groupTitle).not.toBe('Messages');
    await reloadAndWaitForList(a.page, loads1);
    await expect(feed(a.page)).toBeVisible();
    await expect(drawerTitle(a.page)).toHaveText(groupTitle);

    // A second tab of the same browser starts closed, then shows the list.
    const tab2 = await a.newTab();
    const loads2 = trackListLoads(tab2);
    const tab2Opened = Date.now();
    await tab2.goto('/floor-plan');
    await listLoadedSince(tab2, loads2, tab2Opened);
    await expectDrawerClosed(tab2);
    await openDrawer(tab2);
    await expect(listItem(tab2, directId)).toBeVisible({ timeout: STEP_TIMEOUT_MS });

    // Tab 1 opens the DM and sends there: tab 2's list is refetched (the DM's
    // activity changed) and tab 2 stays on its list (T16 tab jump).
    await backToConversationList(a.page, groupId);
    await listItem(a.page, directId).click();
    await expect(feed(a.page)).toBeVisible();
    const directTitle = (await drawerTitle(a.page).innerText()).trim();
    expect(directTitle).not.toBe(groupTitle);
    const created = a.page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/messages/create' && response.status() === 201,
      { timeout: STEP_TIMEOUT_MS },
    );
    const beforeSend = Date.now();
    await sendFromComposer(a.page, `t20 tab jump ${randomUUID()}`);
    await created;
    await listLoadedSince(tab2, loads2, beforeSend);
    await expect(drawerTitle(tab2)).toHaveText('Messages');
    await expect(feed(tab2)).toHaveCount(0);
    await expect(listItem(tab2, directId)).toBeVisible();

    // Each tab reloads to its own drawer: tab 1 to the DM, tab 2 to its list.
    await reloadAndWaitForList(a.page, loads1);
    await expect(feed(a.page)).toBeVisible();
    await expect(drawerTitle(a.page)).toHaveText(directTitle);
    await reloadAndWaitForList(tab2, loads2);
    await expect(drawerTitle(tab2)).toHaveText('Messages');
    await expect(feed(tab2)).toHaveCount(0);

    // A closes the drawer in tab 1: it stays closed after a reload.
    await a.page.getByTestId('messaging-drawer-close').click();
    await expectDrawerClosed(a.page);
    await reloadAndWaitForList(a.page, loads1);
    await expectDrawerClosed(a.page);

    // Tab 1 shows the group again; C signs in in tab 2 (A's session gone from
    // the browser, A's tab not told). Tab 1 follows C in place: its drawer
    // drops A's conversation and shows C's list (C is a member of the group,
    // so keeping it would show C what A had open).
    await openConversation(a.page, groupId);
    await expect(drawerTitle(a.page)).toHaveText(groupTitle);
    await clearAuthCookies(a.context);
    await login(tab2, C.email, C.password);
    await expect(listItem(a.page, directId), "tab 1 now shows C's list (C is not in A's DM)").toHaveCount(0, {
      timeout: STEP_TIMEOUT_MS,
    });
    await expect(feed(a.page)).toHaveCount(0);
    await expect(drawerTitle(a.page)).toHaveText('Messages');
    await expect(listItem(a.page, groupId)).toBeVisible();
  });

  test('AC-032: a conversation A lost access to reopens as the list without an error; C signing in on that tab never gets A\'s drawer, and A gets it back', async ({
    phase5World,
    openDevice,
    membership,
  }) => {
    const { groupId, roomId } = phase5World.conversations;
    const { A, C } = phase5World.users;
    const a = await openDevice('A');
    const loads = trackListLoads(a.page);

    // A has the group open; A is then removed from it (administrative removal).
    await openConversation(a.page, groupId);
    expect(await membership.remove(groupId, 'A')).toBe(1);
    expect(await savedDrawer(a.page, A.userId), 'the saved drawer still names the group').toEqual({
      minimized: false,
      view: 'conversation',
      conversationId: groupId,
    });

    const problems: string[] = [];
    let watching = false;
    a.page.on('pageerror', (error) => {
      if (watching) problems.push(`pageerror: ${error.message}`);
    });
    a.page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (watching && /^\/api\/(messages|conversations)\//.test(path) && response.status() >= 400) {
        problems.push(`${response.status()} ${response.request().method()} ${path}`);
      }
    });
    a.page.on('console', (message) => {
      if (watching && message.type() === 'error' && /messag|conversa|forbidden|403/i.test(message.text())) {
        problems.push(`console: ${message.text().slice(0, 200)}`);
      }
    });
    watching = true;
    await reloadAndWaitForList(a.page, loads);
    await expect(drawer(a.page)).toBeVisible();
    await expect(drawerTitle(a.page)).toHaveText('Messages');
    await expect(listItem(a.page, roomId)).toBeVisible();
    await expect(listItem(a.page, groupId)).toHaveCount(0);
    await expect(feed(a.page)).toHaveCount(0);
    watching = false;
    expect(problems, 'no error after the reload').toEqual([]);
    expect(await savedDrawer(a.page, A.userId)).toEqual({ minimized: false, view: 'list', conversationId: null });

    // A opens the room conversation (C is a member too) and signs out.
    await listItem(a.page, roomId).click();
    await expect(feed(a.page)).toBeVisible();
    const roomTitle = (await drawerTitle(a.page).innerText()).trim();
    expect(roomTitle).not.toBe('Messages');
    await signOut(a.page);

    // C signs in on the same tab, on a reloaded login page: no drawer of A's.
    await a.page.reload();
    expect(await navigationType(a.page)).toBe('reload');
    await signInOnThisPage(a.page, C, loads);
    expect(await navigationType(a.page), 'C signed in on the reloaded page').toBe('reload');
    await expectDrawerClosed(a.page);
    expect(await savedDrawer(a.page, C.userId)).toBeNull();
    await reloadAndWaitForList(a.page, loads);
    await expectDrawerClosed(a.page);
    // C can open the room conversation, so this is not a lack of access.
    await openDrawer(a.page);
    await expect(drawerTitle(a.page)).toHaveText('Messages');
    await expect(listItem(a.page, roomId)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(feed(a.page)).toHaveCount(0);

    // A signs in again the same way: A's own drawer is back, on the room.
    await signOut(a.page);
    await a.page.reload();
    await signInOnThisPage(a.page, A, loads);
    await expect(feed(a.page)).toBeVisible();
    await expect(drawerTitle(a.page)).toHaveText(roomTitle);
  });
});
