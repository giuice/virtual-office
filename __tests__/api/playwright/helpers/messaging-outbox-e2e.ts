// Phase 5 outbox E2E helpers shared by the messaging-phase5 specs (moved from
// durable-outbox.spec.ts for T27): the page's IndexedDB outbox (inspection
// only), stored rows in the local database, the drawer composer, and B's
// arrival watcher. Everything they touch is real (no mocks).
import { expect, type Page, type Request } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Phase5Device } from '../fixtures/messaging-phase5';
import { openDrawer } from './drawer-helpers';
import { LOCAL_SUPABASE_ANON_KEY, LOCAL_SUPABASE_API_URL } from './local-supabase-mode';
import { MESSAGING_OUTBOX_DB_NAME } from './messaging-browser-state';
import { withLocalMessagingDb } from './messaging-local-db';

export const STEP_TIMEOUT_MS = 20_000;
export interface OutboxRow {
  ownerId: string;
  clientMessageId: string;
  conversationId: string;
  content: string;
  replyToId: string | null;
  mentionIds: string[];
  pressedSendAt: number;
  windowStartedAt: number;
  order: number;
  state: string;
  failureReason: string | null;
  attemptGeneration: number;
  claimHolder: string | null;
  leaseExpiresAt: number | null;
  /** T9: transient-rejection backoff shared by the tabs (absent until a 429/401). */
  retryNotBefore?: number | null;
  retryDelayMs?: number | null;
  schemaVersion: number;
}

/** The page's outbox items, in creation order (read-only; never creates the database). */
export async function readOutbox(page: Page): Promise<OutboxRow[]> {
  const rows = await page.evaluate(async (name: string) => {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    if (!databases.some((database) => database.name === name)) return [];
    return new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('items')) {
          db.close();
          resolve([]);
          return;
        }
        const read = db.transaction('items', 'readonly').objectStore('items').getAll();
        read.onsuccess = () => {
          db.close();
          resolve(read.result);
        };
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
      };
    });
  }, MESSAGING_OUTBOX_DB_NAME);
  return (rows as OutboxRow[]).sort((a, b) => a.order - b.order);
}

export interface StoredRow {
  id: string;
  key: string | null;
  content: string;
  reply_to_id: string | null;
  sender_id: string;
}

/** Every stored message of the conversation with one of `texts` (any key), oldest first. */
export async function storedWithTexts(conversationId: string, texts: readonly string[]): Promise<StoredRow[]> {
  return withLocalMessagingDb(async (db) => {
    const result = await db.query<StoredRow>(
      `select id::text as id, client_message_id::text as key, content, reply_to_id::text as reply_to_id,
              sender_id::text as sender_id
         from public.messages
        where conversation_id = $1 and content = any($2::text[])
        order by "timestamp", id`,
      [conversationId, [...texts]],
    );
    return result.rows;
  });
}

/** Opens the conversation in the drawer (also when the drawer restores it directly). */
export async function openConversation(page: Page, conversationId: string): Promise<void> {
  if (!page.url().includes('/floor-plan')) await page.goto('/floor-plan');
  await openDrawer(page);
  const item = page.locator(`[data-testid="conversation-item-${conversationId}"]`);
  const feed = page.getByTestId('messages-feed');
  await expect(item.or(feed).first()).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  if (await item.isVisible()) await item.click();
  await expect(feed).toBeVisible({ timeout: STEP_TIMEOUT_MS });
}

export const composer = (page: Page) => page.getByTestId('composer');
export const composerInput = (page: Page) => composer(page).locator('textarea').first();

export async function sendFromComposer(page: Page, text: string): Promise<void> {
  await composerInput(page).fill(text);
  await composer(page).getByTestId('message-send-button').click();
}

/** A's own API create (warms the create route; gives a reply target). */
export async function createViaApi(page: Page, data: Record<string, unknown>): Promise<string> {
  const response = await page.request.post('/api/messages/create', { data });
  const body = (await response.json().catch(() => null)) as { message?: { id?: string } } | null;
  expect(response.status(), JSON.stringify(body)).toBe(201);
  return body?.message?.id as string;
}

export interface ArrivalState {
  evaluations: number;
  first: Record<string, number>;
  max: Record<string, number>;
}

/** Records, in the page, when each text first shows in the feed and the most bubbles it ever had at once. */
export async function watchArrivals(page: Page, texts: readonly string[]): Promise<void> {
  await page.evaluate((tracked: string[]) => {
    const state = { evaluations: 0, first: {} as Record<string, number>, max: {} as Record<string, number> };
    const evaluate = () => {
      state.evaluations += 1;
      const counts: Record<string, number> = {};
      const feed = document.querySelector('[data-testid="messages-feed"]');
      for (const item of feed ? Array.from(feed.querySelectorAll('[data-testid^="message-"][data-thread-depth]')) : []) {
        const own = Array.from(item.querySelectorAll('p')).map((paragraph) => paragraph.textContent ?? '');
        for (const text of tracked) {
          if (own.includes(text)) counts[text] = (counts[text] ?? 0) + 1;
        }
      }
      const now = Date.now();
      for (const text of tracked) {
        const count = counts[text] ?? 0;
        if (count > 0 && state.first[text] === undefined) state.first[text] = now;
        state.max[text] = Math.max(state.max[text] ?? 0, count);
      }
    };
    (window as unknown as { __t8Arrivals?: typeof state }).__t8Arrivals = state;
    evaluate();
    new MutationObserver(evaluate).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, [...texts]);
}

export async function readArrivals(page: Page): Promise<ArrivalState> {
  return page.evaluate(() => (window as unknown as { __t8Arrivals: ArrivalState }).__t8Arrivals);
}

/** The pending copy of `key` in A's feed shows `label` as text. */
export async function expectPendingLabel(page: Page, key: string, state: 'pending' | 'sending', label: string): Promise<void> {
  const bubble = page.getByTestId(`message-temp-${key}`);
  await expect(bubble).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  const stateLabel = bubble.getByTestId(`message-delivery-state-temp-${key}`);
  await expect(stateLabel).toHaveText(label);
  await expect(stateLabel).toHaveAttribute('data-delivery-state', state);
}

/** A's feed holds exactly one bubble of each text: the stored one, no pending copy. */
export async function expectDeliveredInFeed(page: Page, rows: readonly StoredRow[]): Promise<void> {
  for (const row of rows) {
    await expect(page.getByTestId(`message-${row.id}`)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
    await expect(
      page.locator('[data-testid="messages-feed"] [data-testid^="message-"][data-thread-depth]', { hasText: row.content }),
    ).toHaveCount(1);
  }
  await expect(page.locator('[data-testid="messages-feed"] [data-testid^="message-temp-"]')).toHaveCount(0);
}

export interface OutboxApiCall {
  kind: 'create' | 'fence';
  key: unknown;
  generation: unknown;
  /** Test-runner time (ms) when the page started the request. */
  startedAt: number;
  status?: number;
  /** Error code of a JSON error answer. */
  code?: string;
  outcome?: string;
  failure?: string;
}

/** Every create and fence request of the page (moved from the T27 spec), in the order they started. */
export function trackOutboxCalls(page: Page, calls: OutboxApiCall[] = []): OutboxApiCall[] {
  const byRequest = new Map<Request, OutboxApiCall>();
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    const kind = path === '/api/messages/create' ? 'create' : path === '/api/messages/fence' ? 'fence' : null;
    if (!kind) return;
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    const call: OutboxApiCall = { kind, key: body.clientMessageId, generation: body.attemptGeneration, startedAt: Date.now() };
    calls.push(call);
    byRequest.set(request, call);
  });
  page.on('requestfinished', (request) => {
    const call = byRequest.get(request);
    if (!call) return;
    void request.response().then(async (response) => {
      if (!response) return;
      const json = (await response.json().catch(() => null)) as { outcome?: string; code?: string } | null;
      if (call.kind === 'fence') call.outcome = json?.outcome;
      call.code = json?.code;
      call.status = response.status();
    });
  });
  page.on('requestfailed', (request) => {
    const call = byRequest.get(request);
    if (call) call.failure = request.failure()?.errorText ?? 'failed';
  });
  return calls;
}

/**
 * A user's own delete from ANOTHER authorized session (a fresh sign-in, not
 * the browser's): the Data API under RLS (`delete_own_messages`), a deletion a
 * real sender can make. Returns the rows deleted.
 */
export async function deleteOwnMessageFromAnotherSession(
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
    // Ends only this session; the browser's session stays signed in.
    await client.auth.signOut({ scope: 'local' });
  }
}

export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

/** Sends `texts` offline from A's composer; each one is stored as a waiting item and shown as "pendente". */
export async function queueOffline(a: Phase5Device, conversationId: string, texts: readonly string[]): Promise<OutboxRow[]> {
  for (const [index, text] of texts.entries()) {
    await sendFromComposer(a.page, text);
    await expect(composerInput(a.page)).toHaveValue('');
    await expect.poll(async () => (await readOutbox(a.page)).length).toBe(index + 1);
  }
  const items = await readOutbox(a.page);
  expect(items.map((item) => item.content)).toEqual(texts);
  for (const item of items) {
    expect(item).toMatchObject({
      ownerId: a.user.userId,
      conversationId,
      state: 'waiting',
      attemptGeneration: 0,
      failureReason: null,
      mentionIds: [],
      schemaVersion: 1,
    });
    expect(item.clientMessageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(item.windowStartedAt).toBe(item.pressedSendAt);
    await expectPendingLabel(a.page, item.clientMessageId, 'pending', 'pendente');
  }
  for (let index = 1; index < items.length; index += 1) {
    expect(items[index].order).toBeGreaterThan(items[index - 1].order);
    expect(items[index].pressedSendAt).toBeGreaterThanOrEqual(items[index - 1].pressedSendAt);
  }
  return items;
}
