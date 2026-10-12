import type { Page } from '@playwright/test';

/**
 * Phase 5 T24 — the messaging app's browser-side storage, and how tests clear it.
 *
 * Every Phase 5 device is a fresh, non-persistent Playwright browser context:
 * its localStorage, sessionStorage, IndexedDB, Cache Storage and cookies start
 * empty and are discarded when the context closes, so nothing a test (or an
 * interrupted run) leaves in a browser reaches a later test. Within one test,
 * clearMessagingBrowserState() empties the messaging state of one origin
 * without closing the context (e.g. to simulate a cleared browser).
 *
 * Keep this list in sync with the app (T8+ add the outbox here):
 *   localStorage
 *   - every key starting with `vo:messaging:` — desktop-notification
 *     preference `vo:messaging:desktop-notifications:<userId>`, cross-tab claims
 *     `vo:messaging:notified-messages`, per-tab conversation views
 *     `vo:messaging:notification-view:<users.id>:<tabId>` (T18; 30 s expiry, a
 *     viewing tab rewrites its key every 10 s); RESERVED prefix for new
 *     Phase 5 localStorage keys.
 *   - legacy Phase 4 drawer keys `messaging_drawer_minimized`,
 *     `messaging_drawer_active_view`, `messaging_active_conversation_id`:
 *     global to the browser; since T20 the app removes them on load and never
 *     reads them (still cleared here for state an older build left).
 *   IndexedDB
 *   - every database whose name starts with `vo-messaging` — RESERVED prefix
 *     for Phase 5. The app must close its connection on `versionchange`, or
 *     deletion stays blocked while a tab holds it open.
 *   - `vo-messaging-outbox` (T8, `src/lib/messaging/outbox/outbox-db.ts`):
 *     stores `items` (outbox items, key [ownerId, clientMessageId]) and `meta`
 *     (per-owner creation-order counter); closes on `versionchange`.
 *   Web Locks (not storage; released when the tab closes)
 *   - `vo-messaging-outbox:<users.id>:<conversationId>` — T8 drain lock.
 *   sessionStorage (per tab)
 *   - every key starting with `vo:messaging:` (reserved prefix) — drawer
 *     restore `vo:messaging:drawer:<users.id>` (T20,
 *     `src/lib/messaging/drawer-restore.ts`): present while that user's drawer
 *     is open in the tab; read once after a reload of that tab.
 *   BroadcastChannel (not storage): outbox coordination messages (T10, T11, T12).
 */
/** Legacy Phase 4 drawer keys (removed by the app since T20). */
export const MESSAGING_LOCAL_STORAGE_KEYS = [
  'messaging_drawer_minimized',
  'messaging_drawer_active_view',
  'messaging_active_conversation_id',
] as const;
export const MESSAGING_STORAGE_KEY_PREFIX = 'vo:messaging:';
export const MESSAGING_INDEXED_DB_PREFIX = 'vo-messaging';
/** The Phase 5 outbox database (T8); covered by MESSAGING_INDEXED_DB_PREFIX. */
export const MESSAGING_OUTBOX_DB_NAME = 'vo-messaging-outbox';

export interface MessagingBrowserStateSnapshot {
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  indexedDbNames: string[];
}

interface StorageSpec {
  keys: readonly string[];
  keyPrefix: string;
  dbPrefix: string;
}

const SPEC: StorageSpec = {
  keys: MESSAGING_LOCAL_STORAGE_KEYS,
  keyPrefix: MESSAGING_STORAGE_KEY_PREFIX,
  dbPrefix: MESSAGING_INDEXED_DB_PREFIX,
};

/**
 * The messaging keys and databases present on the page's origin (localStorage
 * and IndexedDB are shared by the context's tabs; sessionStorage is this tab's).
 */
export async function readMessagingBrowserState(page: Page): Promise<MessagingBrowserStateSnapshot> {
  return page.evaluate(async (spec: StorageSpec) => {
    const isMessagingKey = (key: string) => spec.keys.includes(key) || key.startsWith(spec.keyPrefix);
    const keysOf = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
        (key): key is string => key !== null && isMessagingKey(key),
      );
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    return {
      localStorageKeys: keysOf(window.localStorage).sort(),
      sessionStorageKeys: keysOf(window.sessionStorage)
        .filter((key) => key.startsWith(spec.keyPrefix))
        .sort(),
      indexedDbNames: databases
        .map((database) => database.name ?? '')
        .filter((name) => name.startsWith(spec.dbPrefix))
        .sort(),
    };
  }, SPEC);
}

/** sessionStorage is per tab: the other open tabs of `page`'s context on the same origin. */
function sameOriginTabs(page: Page): Page[] {
  const origin = new URL(page.url()).origin;
  return page
    .context()
    .pages()
    .filter((tab) => tab !== page && !tab.isClosed() && /^https?:/.test(tab.url()) && new URL(tab.url()).origin === origin);
}

async function clearTabSessionStorage(tab: Page, prefix: string): Promise<string[]> {
  return tab.evaluate((keyPrefix) => {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index)).filter(
      (key): key is string => key !== null && key.startsWith(keyPrefix),
    );
    for (const key of keys) window.sessionStorage.removeItem(key);
    return keys;
  }, prefix);
}

/**
 * Removes the messaging localStorage keys and deletes every messaging IndexedDB
 * database of the page's origin (shared by every tab of the context), and
 * removes the messaging sessionStorage keys of `page` and of every other open
 * same-origin tab of its context (sessionStorage is per tab). Fails when a
 * database deletion stays blocked by an open connection for `blockedTimeoutMs`,
 * and verifies that nothing is left in any of those tabs. Returns what it
 * removed (sessionStorage keys of all tabs, deduplicated).
 */
export async function clearMessagingBrowserState(
  page: Page,
  options: { blockedTimeoutMs?: number } = {},
): Promise<MessagingBrowserStateSnapshot> {
  const before = await readMessagingBrowserState(page);
  const blockedTimeoutMs = options.blockedTimeoutMs ?? 5_000;
  const failures = await page.evaluate(
    async ({ removed, timeoutMs }) => {
      for (const key of removed.localStorageKeys) window.localStorage.removeItem(key);
      for (const key of removed.sessionStorageKeys) window.sessionStorage.removeItem(key);
      const deleteDatabase = (name: string) =>
        new Promise<string | null>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          const timer = window.setTimeout(() => resolve(`${name}: still blocked after ${timeoutMs} ms`), timeoutMs);
          request.onsuccess = () => {
            window.clearTimeout(timer);
            resolve(null);
          };
          request.onerror = () => {
            window.clearTimeout(timer);
            resolve(`${name}: ${request.error?.message ?? 'delete failed'}`);
          };
        });
      const results = await Promise.all(removed.indexedDbNames.map(deleteDatabase));
      return results.filter((result): result is string => result !== null);
    },
    { removed: before, timeoutMs: blockedTimeoutMs },
  );
  if (failures.length > 0) {
    throw new Error(`Messaging IndexedDB cleanup failed: ${failures.join('; ')}`);
  }
  const otherTabs = sameOriginTabs(page);
  const otherSessionKeys: string[] = [];
  for (const tab of otherTabs) {
    otherSessionKeys.push(...(await clearTabSessionStorage(tab, MESSAGING_STORAGE_KEY_PREFIX)));
  }
  const left: string[] = [];
  for (const tab of [page, ...otherTabs]) {
    const after = await readMessagingBrowserState(tab);
    left.push(...after.localStorageKeys, ...after.sessionStorageKeys, ...after.indexedDbNames);
  }
  if (left.length > 0) {
    throw new Error(`Messaging browser state left after cleanup: ${[...new Set(left)].join(', ')}`);
  }
  return {
    ...before,
    sessionStorageKeys: [...new Set([...before.sessionStorageKeys, ...otherSessionKeys])].sort(),
  };
}
