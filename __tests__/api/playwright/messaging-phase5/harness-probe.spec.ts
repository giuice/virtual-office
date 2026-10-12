import { randomUUID } from 'node:crypto';

import type { BrowserContext, Page } from '@playwright/test';

import {
  test,
  expect,
  PHASE5_USER_KEYS,
  cleanupPhase5World,
  seedPhase5World,
  type Phase5Device,
} from '../fixtures/messaging-phase5';
import { guardLocalSupabaseTraffic, login, removeSeededMember } from '../fixtures/messaging';
import {
  openDrawer,
  selectConversation,
  sendMessage,
  waitForRealtimeMessage,
  waitForRealtimeReady,
} from '../helpers/drawer-helpers';
import {
  MESSAGING_INDEXED_DB_PREFIX,
  MESSAGING_STORAGE_KEY_PREFIX,
  clearMessagingBrowserState,
  readMessagingBrowserState,
} from '../helpers/messaging-browser-state';
import { countMessagingServerState, findTestAccountUserIds, withLocalMessagingDb } from '../helpers/messaging-local-db';
import messagingPhase5GlobalSetup from '../helpers/messaging-phase5-global-setup';

/**
 * Phase 5 T24 — harness probe (BR-015, AC-036). Exercises every Phase 5
 * fixture against the real app, routes and local Supabase in the project's
 * real browser (Chrome or Edge): users A–E and the three conversations, second
 * devices and tabs, administrative removal and authorized re-add, budget
 * exhaustion and reset, server and browser state cleanup (including after an
 * interrupted run), and the raw server log.
 */

const RECV_TIMEOUT_MS = 15_000;

/** Opens the drawer on a conversation, as the Phase 4 specs do. */
async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.goto('/floor-plan');
  await page.waitForLoadState('networkidle');
  await openDrawer(page);
  await waitForRealtimeReady(page);
  await selectConversation(page, { id: conversationId });
}

/** The Supabase session id (JWT `session_id`) of a browser context's auth cookie. */
async function sessionIdOf(context: BrowserContext): Promise<string> {
  const cookies = (await context.cookies()).filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
  expect(cookies.length, 'Supabase auth cookie').toBeGreaterThan(0);
  const chunkIndex = (name: string) => Number(/\.(\d+)$/.exec(name)?.[1] ?? 0);
  const raw = cookies
    .sort((left, right) => chunkIndex(left.name) - chunkIndex(right.name))
    .map((cookie) => cookie.value)
    .join('');
  const json = raw.startsWith('base64-') ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8') : raw;
  const accessToken = (JSON.parse(json) as { access_token: string }).access_token;
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')) as {
    session_id?: string;
  };
  expect(payload.session_id, 'session_id claim').toBeTruthy();
  return payload.session_id as string;
}

async function memberIdsVia(page: Page, conversationId: string): Promise<{ status: number; ids: string[] }> {
  const response = await page.request.get(`/api/conversations/members?conversationId=${conversationId}`);
  if (response.status() !== 200) return { status: response.status(), ids: [] };
  const body = (await response.json()) as { members: Array<{ userId: string }> };
  return { status: 200, ids: body.members.map((member) => member.userId).sort() };
}

async function createVia(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post('/api/messages/create', { data });
  return { status: response.status(), body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
}

test.describe('Phase 5 E2E harness probe', () => {
  test('runs in the real installed browser of its project', async ({ browser, page, browserName }, testInfo) => {
    const channel = testInfo.project.use.channel;
    expect(['chrome', 'msedge'], 'Phase 5 projects use an installed channel').toContain(channel);
    expect(browserName).toBe('chromium');
    await page.goto('/login');
    const identity = await page.evaluate(async () => {
      const data = (navigator as Navigator & {
        userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ fullVersionList?: Array<{ brand: string; version: string }> }> };
      }).userAgentData;
      const values = data ? await data.getHighEntropyValues(['fullVersionList']) : {};
      return { userAgent: navigator.userAgent, brands: (values.fullVersionList ?? []).map((entry) => entry.brand) };
    });
    testInfo.annotations.push({
      type: 'browser',
      description: `${channel} ${browser.version()} — ${identity.userAgent} — brands: ${identity.brands.join(', ')}`,
    });
    const major = browser.version().split('.')[0];
    expect(identity.userAgent).toContain(`/${major}.`);
    if (channel === 'msedge') {
      expect(identity.userAgent).toContain(' Edg/');
      expect(identity.brands).toContain('Microsoft Edge');
    } else {
      expect(identity.userAgent).not.toContain('Edg/');
      expect(identity.brands).toContain('Google Chrome');
    }
  });

  test('signs in A–E with their conversations, second devices and tabs', async ({ phase5World, openDevice }) => {
    const { users, conversations } = phase5World;
    const allIds = PHASE5_USER_KEYS.map((key) => users[key].userId).sort();

    const companies = await withLocalMessagingDb(async (db) => {
      const { rows } = await db.query<{ company_id: string }>(
        'select distinct company_id::text from public.users where id = any($1::uuid[])',
        [allIds],
      );
      return rows.map((row) => row.company_id);
    });
    expect(companies, 'A–E share one company').toEqual([phase5World.companyId]);

    const devices: Phase5Device[] = [];
    for (const key of PHASE5_USER_KEYS) {
      devices.push(await openDevice(key));
    }
    const [a, b, , , e] = devices;
    for (const device of devices) {
      expect(await memberIdsVia(device.page, conversations.groupId)).toEqual({ status: 200, ids: allIds });
      expect(await memberIdsVia(device.page, conversations.roomId)).toEqual({ status: 200, ids: allIds });
    }
    const pair = [users.A.userId, users.B.userId].sort();
    expect(await memberIdsVia(a.page, conversations.directId)).toEqual({ status: 200, ids: pair });
    expect(await memberIdsVia(b.page, conversations.directId)).toEqual({ status: 200, ids: pair });
    expect((await memberIdsVia(e.page, conversations.directId)).status, 'E is not in the A–B DM').toBe(403);

    // Real UI: A sends in the group; E receives it live.
    await openConversation(e.page, conversations.groupId);
    await openConversation(a.page, conversations.groupId);
    const text = `Phase 5 probe group ${phase5World.runId}`;
    await sendMessage(a.page, text);
    await waitForRealtimeMessage(e.page, text, { timeout: RECV_TIMEOUT_MS });

    // A second device of A has its own session; a tab shares the device's session.
    const aSecond = await openDevice('A');
    expect(aSecond.label).toBe('A#2');
    expect(aSecond.context).not.toBe(a.context);
    const firstSession = await sessionIdOf(a.context);
    expect(await sessionIdOf(aSecond.context)).not.toBe(firstSession);
    await openConversation(aSecond.page, conversations.groupId);
    await expect(aSecond.page.locator('[data-testid^="message-"]', { hasText: text })).toBeVisible();

    const tab = await a.newTab();
    expect(tab.context()).toBe(a.context);
    await openConversation(tab, conversations.groupId);
    await expect(tab.locator('[data-testid^="message-"]', { hasText: text })).toBeVisible();
    expect(await sessionIdOf(a.context)).toBe(firstSession);
  });

  test('removes and re-adds members, exhausts and resets the create quota, and cleans server state', async ({
    phase5World,
    openDevice,
    membership,
    budgets,
    request,
  }) => {
    const { users, conversations } = phase5World;
    const a = await openDevice('A');
    const d = await openDevice('D');
    const e = await openDevice('E');

    // Room: administrative removal is a revocation; restore re-adds for real.
    expect((await memberIdsVia(e.page, conversations.roomId)).status).toBe(200);
    expect(await membership.remove(conversations.roomId, 'E')).toBe(1);
    expect(await membership.isMember(conversations.roomId, 'E')).toBe(false);
    expect(await membership.isRevoked(conversations.roomId, 'E')).toBe(true);
    expect((await memberIdsVia(e.page, conversations.roomId)).status, 'removed E loses access').toBe(403);
    const join = await e.page.request.post('/api/conversations/join', { data: { conversationId: conversations.roomId } });
    expect(join.status(), 'a revoked user cannot rejoin by the join route').toBe(403);
    await membership.restore(conversations.roomId, 'E');
    expect(await membership.isMember(conversations.roomId, 'E')).toBe(true);
    expect(await membership.isRevoked(conversations.roomId, 'E')).toBe(false);
    expect((await memberIdsVia(e.page, conversations.roomId)).status, 're-added E has access').toBe(200);

    // Group: the same for D (original participant branch).
    expect(await membership.remove(conversations.groupId, 'D')).toBe(1);
    expect((await memberIdsVia(d.page, conversations.groupId)).status).toBe(403);
    await membership.restore(conversations.groupId, 'D');
    expect((await memberIdsVia(d.page, conversations.groupId)).status).toBe(200);

    // Insertion quota: exhausted through the real limiter, then reset.
    const exhausted = await budgets.exhaust('A');
    expect(exhausted.exhaustedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(await budgets.count('A', 'message:create')).toBeGreaterThan(30);
    const refused = await createVia(a.page, {
      conversationId: conversations.groupId,
      content: `quota refused ${phase5World.runId}`,
      clientMessageId: randomUUID(),
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(429);
    expect(await budgets.reset(['A'], ['message:create'])).toBeGreaterThan(0);
    expect(await budgets.count('A', 'message:create')).toBe(0);

    // Fence budget held over two windows; a later exhaust still targets the current window.
    const held = await budgets.exhaust('A', 'message:fence', { windows: 2 });
    expect(held.exhaustedUntil.getTime() - held.windowStart.getTime()).toBe(120_000);
    const again = await budgets.exhaust('A', 'message:fence');
    expect(again.windowStart.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
    const fenceRefused = await a.page.request.post('/api/messages/fence', {
      data: {
        conversationId: conversations.groupId,
        clientMessageId: randomUUID(),
        attemptGeneration: 1,
        expectedSenderId: users.A.userId,
      },
    });
    expect(fenceRefused.status()).toBe(429);
    expect(await budgets.reset(['A'], ['message:fence'])).toBeGreaterThanOrEqual(1);
    expect(await budgets.count('A', 'message:fence')).toBe(0);

    // Fence state, a mention and budget counters through the real routes.
    const key = randomUUID();
    const created = await createVia(a.page, {
      conversationId: conversations.groupId,
      content: `@${users.B.displayName} probe mention ${phase5World.runId}`,
      clientMessageId: key,
      attemptGeneration: 1,
      expectedSenderId: users.A.userId,
      mentionIds: [users.B.userId],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((created.body?.message as { mentionedUserIds?: string[] }).mentionedUserIds).toEqual([users.B.userId]);
    const fence = await a.page.request.post('/api/messages/fence', {
      data: {
        conversationId: conversations.groupId,
        clientMessageId: randomUUID(),
        attemptGeneration: 1,
        expectedSenderId: users.A.userId,
      },
    });
    expect(fence.status()).toBe(200);
    expect(((await fence.json()) as { outcome: string }).outcome).toBe('not_stored');
    expect(await membership.remove(conversations.roomId, 'E')).toBe(1);

    const worldIds = PHASE5_USER_KEYS.map((userKey) => users[userKey].userId);
    const before = await withLocalMessagingDb((db) => countMessagingServerState(db, worldIds));
    expect(before.attemptRows).toBeGreaterThanOrEqual(2);
    expect(before.mentions).toBeGreaterThanOrEqual(1);
    expect(before.revocations).toBeGreaterThanOrEqual(1);
    expect(before.budgetCounters).toBeGreaterThanOrEqual(3);

    // The fixture's own cleanup (it runs again, idempotently, after the test).
    const after = await cleanupPhase5World(request, phase5World);
    expect(after).toEqual({
      left: { budgetCounters: 0, attemptRows: 0, revocations: 0, mentions: 0 },
      conversationsLeft: 0,
    });
  });

  test('reads raw local server log lines', async ({ phase5World, openDevice, serverLog }) => {
    const a = await openDevice('A');
    const mark = serverLog.mark();
    const response = await a.page.request.post('/api/messages/metrics', {
      data: { events: [{ type: 'send_latency', conversationType: 'group', durationMs: 1234 }] },
    });
    expect(response.status()).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1, dropped: 0 });
    const metricLine = await serverLog.waitForLine((line) => line.includes('"type":"send_latency"'), { since: mark });
    // Exactly what the route printed: a bare JSON line, untouched by the capture.
    const parsed = JSON.parse(metricLine) as Record<string, unknown>;
    expect(metricLine).toBe(JSON.stringify(parsed));
    expect(parsed).toMatchObject({ type: 'send_latency', conversationType: 'group', durationMs: 1234 });
    expect(typeof parsed.appVersion).toBe('string');
    expect(serverLog.linesSince(mark)).toContain(metricLine);
    // Next's own request line, with its terminal colour codes: nothing is stripped.
    const requestLine = await serverLog.waitForLine((line) => line.includes('POST /api/messages/metrics'), {
      since: mark,
    });
    expect(requestLine).toContain('\u001b[');
    expect(requestLine).toContain('202');
    // Lines from before a mark are not returned (the app keeps logging, so
    // later lines may appear; the metric line must not).
    expect(serverLog.linesSince(serverLog.mark())).not.toContain(metricLine);
    expect(phase5World.users.A.userId).toBeTruthy();
  });

  test('clears messaging browser state; new devices start without it', async ({ openDevice }) => {
    const a = await openDevice('A');
    const probeDb = `${MESSAGING_INDEXED_DB_PREFIX}-probe`;
    const probeKey = `${MESSAGING_STORAGE_KEY_PREFIX}probe`;
    await a.page.evaluate(
      async ({ dbName, key }) => {
        window.localStorage.setItem(key, 'outbox-item');
        window.sessionStorage.setItem(key, 'session');
        await new Promise<void>((resolve, reject) => {
          const open = indexedDB.open(dbName, 1);
          open.onupgradeneeded = () => open.result.createObjectStore('items', { keyPath: 'id' });
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const write = db.transaction('items', 'readwrite');
            write.objectStore('items').put({ id: 'probe', text: 'pending' });
            write.oncomplete = () => {
              db.close();
              resolve();
            };
            write.onerror = () => reject(write.error);
          };
        });
      },
      { dbName: probeDb, key: probeKey },
    );

    // Another tab of the device holds the database open, closing it on versionchange.
    const tab = await a.newTab();
    await tab.goto('/login');
    await tab.evaluate(
      (dbName) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open(dbName);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            open.result.onversionchange = () => open.result.close();
            resolve();
          };
        }),
      probeDb,
    );
    // sessionStorage is per tab: this tab has its own messaging key.
    const tabSessionKey = `${probeKey}-tab`;
    await tab.evaluate((key) => window.sessionStorage.setItem(key, 'tab-session'), tabSessionKey);
    const shared = await readMessagingBrowserState(tab);
    expect(shared.indexedDbNames).toContain(probeDb);
    expect(shared.sessionStorageKeys).toEqual([tabSessionKey]);
    // The probe key (the app writes no messaging localStorage key on load; T20).
    expect(shared.localStorageKeys).toEqual(expect.arrayContaining([probeKey]));

    const removed = await clearMessagingBrowserState(a.page);
    // The app's own outbox database (T8, opened on load) is messaging state too.
    expect(removed.indexedDbNames).toEqual(expect.arrayContaining([probeDb]));
    expect(removed.localStorageKeys).toEqual(expect.arrayContaining([probeKey]));
    expect(removed.sessionStorageKeys).toEqual([probeKey, tabSessionKey].sort());
    const afterInTab = await readMessagingBrowserState(tab);
    expect(afterInTab.indexedDbNames).toEqual([]);
    expect(afterInTab.sessionStorageKeys).toEqual([]);
    expect(afterInTab.localStorageKeys).not.toContain(probeKey);

    // A new device of the same user is a fresh browser profile.
    const second = await openDevice('A');
    const fresh = await readMessagingBrowserState(second.page);
    // The app opens its own empty outbox database on load (T8); nothing is inherited.
    expect(fresh.indexedDbNames).not.toContain(probeDb);
    expect(fresh.localStorageKeys).not.toContain(probeKey);
  });

  test('sweeps server state that an interrupted run left behind', async ({ page, request }) => {
    // A world whose test "crashed" before its cleanup: no fixture teardown runs.
    const world = await seedPhase5World(request);
    const verifyTraffic = guardLocalSupabaseTraffic(page, 'A (interrupted run)');
    await login(page, world.users.A.email, world.users.A.password);
    const created = await createVia(page, {
      conversationId: world.conversations.groupId,
      content: `interrupted mention ${world.runId}`,
      clientMessageId: randomUUID(),
      attemptGeneration: 1,
      expectedSenderId: world.users.A.userId,
      mentionIds: [world.users.C.userId],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(
      await removeSeededMember(request, { conversationId: world.conversations.roomId, userId: world.users.E.userId }),
    ).toBe(1);
    const accountIds = await withLocalMessagingDb((db) => findTestAccountUserIds(db));
    const conversationIds = [world.conversations.directId, world.conversations.groupId, world.conversations.roomId];
    const left = await withLocalMessagingDb((db) => countMessagingServerState(db, accountIds));
    expect(left.attemptRows).toBeGreaterThanOrEqual(1);
    expect(left.mentions).toBeGreaterThanOrEqual(1);
    expect(left.revocations).toBeGreaterThanOrEqual(1);
    expect(left.budgetCounters).toBeGreaterThanOrEqual(1);

    // The next run's global setup removes it.
    await messagingPhase5GlobalSetup();
    const swept = await withLocalMessagingDb(async (db) => ({
      state: await countMessagingServerState(db, accountIds),
      conversations: (
        await db.query<{ count: number }>('select count(*)::int as count from public.conversations where id = any($1::uuid[])', [
          conversationIds,
        ])
      ).rows[0].count,
    }));
    expect(swept).toEqual({
      state: { budgetCounters: 0, attemptRows: 0, revocations: 0, mentions: 0 },
      conversations: 0,
    });
    verifyTraffic();
  });
});
