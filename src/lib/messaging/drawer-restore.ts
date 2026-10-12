// src/lib/messaging/drawer-restore.ts
//
// Phase 5 T20 (FR-031, BR-016): the messaging drawer is restored after a page
// reload, per application user (users.id), in the tab that was reloaded.
//
// Storage: sessionStorage `vo:messaging:drawer:<users.id>`, present only while
// that user's drawer is open in this tab: `{ minimized, view, conversationId }`
// (`conversationId` only for the conversation view). sessionStorage survives a
// reload of the same tab and is not shared with other tabs, so a reload
// restores what that tab showed, and another tab's drawer never moves it.
// The record is read once per page load, and only when the document was
// loaded by a reload or a back/forward navigation (FR-031 "after a page
// reload"): a new tab, a typed URL or a sign-in redirect starts closed.
//
// The Phase 4 keys (localStorage `messaging_drawer_minimized`,
// `messaging_drawer_active_view`, `messaging_active_conversation_id`) were
// global to the browser, so any user signing in inherited them; they are
// removed and never read.

export const DRAWER_RESTORE_KEY_PREFIX = 'vo:messaging:drawer:';

const LEGACY_DRAWER_KEYS = [
  'messaging_drawer_minimized',
  'messaging_drawer_active_view',
  'messaging_active_conversation_id',
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An open drawer as one user left it in this tab. */
export interface SavedDrawer {
  minimized: boolean;
  /** The drawer view to reopen ('search' is saved as 'list'). */
  view: 'list' | 'conversation';
  /** The conversation shown, only for the conversation view. */
  conversationId: string | null;
}

const keyFor = (ownerId: string) => `${DRAWER_RESTORE_KEY_PREFIX}${ownerId}`;

function tabStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Whether this document was loaded by a reload (or a back/forward navigation). */
export function isRestoringPageLoad(): boolean {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return false;
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return navigation?.type === 'reload' || navigation?.type === 'back_forward';
  } catch {
    return false;
  }
}

/** The drawer `ownerId` left open in this tab, or null (closed, absent, or unreadable). */
export function readSavedDrawer(ownerId: string): SavedDrawer | null {
  const storage = tabStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(keyFor(ownerId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const view = record.view === 'conversation' ? 'conversation' : 'list';
    const conversationId =
      view === 'conversation' && typeof record.conversationId === 'string' && UUID_PATTERN.test(record.conversationId)
        ? record.conversationId
        : null;
    return { minimized: record.minimized === true, view: conversationId ? view : 'list', conversationId };
  } catch {
    return null;
  }
}

/** Saves `ownerId`'s drawer for this tab; `null` (closed) removes the record. */
export function saveDrawer(ownerId: string, drawer: SavedDrawer | null): void {
  const storage = tabStorage();
  if (!storage) return;
  try {
    if (drawer) {
      storage.setItem(keyFor(ownerId), JSON.stringify(drawer));
    } else {
      storage.removeItem(keyFor(ownerId));
    }
  } catch {
    // Storage full or blocked: the drawer simply is not restored.
  }
}

/** Removes the Phase 4 browser-wide drawer keys (never read: they belong to no user). */
export function removeLegacyDrawerKeys(): void {
  try {
    if (typeof window === 'undefined') return;
    for (const key of LEGACY_DRAWER_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Blocked storage: nothing to remove.
  }
}
