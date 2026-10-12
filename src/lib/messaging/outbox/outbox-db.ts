// src/lib/messaging/outbox/outbox-db.ts
// Phase 5 T8: IndexedDB storage of the message outbox (SPEC §9).
//
// Database `vo-messaging-outbox` (version 1):
// - store `items`: one OutboxItem per (ownerId, clientMessageId) (key path);
//   index `byConversationOrder` [ownerId, conversationId, order] (the drain
//   reads a conversation's oldest item) and `byOwnerOrder` [ownerId, order];
// - store `meta`: per-owner counter `{ ownerId, nextOrder }` that gives items
//   their creation order inside the same transaction as the item write, so
//   the order is shared by every tab of the browser.
// The connection closes on `versionchange` (an upgrade or a deletion from
// another tab or test is never blocked).
import type { OutboxItem } from '@/types/message-outbox';

export const OUTBOX_DB_NAME = 'vo-messaging-outbox';
const OUTBOX_DB_VERSION = 1;
const ITEMS_STORE = 'items';
const META_STORE = 'meta';
const BY_CONVERSATION_ORDER = 'byConversationOrder';
const BY_OWNER_ORDER = 'byOwnerOrder';

interface OwnerMeta {
  ownerId: string;
  nextOrder: number;
  /**
   * Block B fix F3 (FR-004, AC-041): the owner's recovery epoch, shared by
   * every tab of the browser — advanced once per connectivity outage, when a
   * tab observes the recovery of an outage still open (see noteRecoveryObserved).
   * Absent: 0.
   */
  recoveryEpoch?: number;
  /** F3: a tab observed a connectivity loss that no recovery has closed yet. */
  outageOpen?: boolean;
}

const epochOf = (meta: OwnerMeta | undefined): number => meta?.recoveryEpoch ?? 0;

/** The outbox cannot be read or written (storage blocked, quota, failed write) — FR-033. */
export class OutboxStorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'OutboxStorageError';
  }
}

export function isOutboxStorageError(error: unknown): error is OutboxStorageError {
  return error instanceof OutboxStorageError;
}

let connection: Promise<IDBDatabase> | null = null;

function describe(error: unknown): string {
  if (error === null || error === undefined) return 'aborted';
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        throw new Error('IndexedDB is not available');
      }
      request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    } catch (error) {
      reject(new OutboxStorageError(`Outbox unavailable (${describe(error)})`, error));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        const items = db.createObjectStore(ITEMS_STORE, { keyPath: ['ownerId', 'clientMessageId'] });
        items.createIndex(BY_CONVERSATION_ORDER, ['ownerId', 'conversationId', 'order']);
        items.createIndex(BY_OWNER_ORDER, ['ownerId', 'order']);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'ownerId' });
      }
    };
    request.onblocked = () => {
      reject(new OutboxStorageError('Outbox upgrade blocked by another tab'));
    };
    request.onerror = () => {
      reject(new OutboxStorageError(`Outbox unavailable (${describe(request.error)})`, request.error));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      db.onclose = () => {
        connection = null;
      };
      resolve(db);
    };
  });
}

async function database(): Promise<IDBDatabase> {
  if (!connection) {
    const opening = openDatabase();
    connection = opening;
    opening.catch(() => {
      if (connection === opening) connection = null;
    });
  }
  return connection;
}

/**
 * Runs `work` in one transaction and resolves with its result once the
 * transaction COMMITTED (`complete`); rejects with OutboxStorageError if the
 * transaction errors or aborts (e.g. QuotaExceededError). Write transactions
 * use strict durability (the commit is flushed before `complete`) unless
 * `relaxed` is asked for a write whose loss after an OS crash is harmless.
 */
async function inTransaction<T>(
  mode: IDBTransactionMode,
  work: (stores: { items: IDBObjectStore; meta: IDBObjectStore }, done: (value: T) => void) => void,
  writeDurability: 'strict' | 'relaxed' = 'strict'
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([ITEMS_STORE, META_STORE], mode, {
        durability: mode === 'readwrite' ? writeDurability : 'default',
      });
    } catch (error) {
      if (connection) connection = null;
      reject(new OutboxStorageError(`Outbox transaction failed (${describe(error)})`, error));
      return;
    }
    let result: T | undefined;
    let settled = false;
    transaction.oncomplete = () => resolve(result as T);
    const fail = () => {
      reject(new OutboxStorageError(`Outbox transaction failed (${describe(transaction.error)})`, transaction.error));
    };
    transaction.onerror = (event) => {
      // The error event reaches the transaction before its abort; reject once.
      event.preventDefault();
      if (!settled) {
        settled = true;
        try {
          transaction.abort();
        } catch {
          // Already aborting.
        }
      }
    };
    transaction.onabort = fail;
    try {
      work(
        { items: transaction.objectStore(ITEMS_STORE), meta: transaction.objectStore(META_STORE) },
        (value) => {
          result = value;
        }
      );
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Already aborting.
      }
      reject(new OutboxStorageError(`Outbox transaction failed (${describe(error)})`, error));
    }
  });
}

/** Adds a new item, giving it the owner's next creation order. Resolves once committed. */
export function addOutboxItem(item: Omit<OutboxItem, 'order'>): Promise<OutboxItem> {
  return inTransaction<OutboxItem>('readwrite', ({ items, meta }, done) => {
    const metaRequest = meta.get(item.ownerId);
    metaRequest.onsuccess = () => {
      const current = metaRequest.result as OwnerMeta | undefined;
      const order = current?.nextOrder ?? 1;
      const stored: OutboxItem = { ...item, order };
      meta.put({ ...current, ownerId: item.ownerId, nextOrder: order + 1 } satisfies OwnerMeta);
      items.add(stored);
      done(stored);
    };
  });
}

/** The owner's items of one conversation (or of all), in creation order. */
export function listOutboxItems(ownerId: string, conversationId?: string): Promise<OutboxItem[]> {
  return inTransaction<OutboxItem[]>('readonly', ({ items }, done) => {
    const request = conversationId
      ? items
          .index(BY_CONVERSATION_ORDER)
          .getAll(IDBKeyRange.bound([ownerId, conversationId, -Infinity], [ownerId, conversationId, Infinity]))
      : items.index(BY_OWNER_ORDER).getAll(IDBKeyRange.bound([ownerId, -Infinity], [ownerId, Infinity]));
    request.onsuccess = () => done(request.result as OutboxItem[]);
  });
}

/**
 * Reads the item and replaces it with `change(item)` in one transaction
 * (`null` deletes it; `undefined` leaves it). Resolves with the stored result
 * (`null` when the item is missing or was deleted). A result with another
 * `clientMessageId` replaces the item under that new key (T9: the
 * CLIENT_MESSAGE_ID_REUSED retry); the new key must not exist yet. Relaxed
 * durability (the writes after a claim: losing one to an OS crash leaves the
 * item claimed, so it is fenced before anything is sent again), unless
 * `strict` is asked (a cancel must survive an OS crash: a cancelled item is
 * never dispatched, T10).
 */
export function updateOutboxItem(
  ownerId: string,
  clientMessageId: string,
  change: (item: OutboxItem) => OutboxItem | null | undefined,
  durability: 'strict' | 'relaxed' = 'relaxed'
): Promise<OutboxItem | null> {
  return inTransaction<OutboxItem | null>('readwrite', ({ items }, done) => {
    const request = items.get([ownerId, clientMessageId]);
    request.onsuccess = () => {
      const item = request.result as OutboxItem | undefined;
      if (!item) {
        done(null);
        return;
      }
      const next = change(item);
      if (next === undefined) {
        done(item);
      } else if (next === null) {
        items.delete([ownerId, clientMessageId]);
        done(null);
      } else if (next.ownerId !== ownerId) {
        throw new Error('An outbox item cannot change owner');
      } else if (next.clientMessageId !== clientMessageId) {
        items.delete([ownerId, clientMessageId]);
        items.add(next);
        done(next);
      } else {
        items.put(next);
        done(next);
      }
    };
  }, durability);
}

/**
 * Block A fix F4: a success of `generation` may remove its item unless the
 * item is now claimed by another holder at a newer generation (that holder
 * removes it). The server keeps at most one stored message per key either way.
 */
const confirmedRemovable = (item: OutboxItem, claimHolder: string, generation: number): boolean =>
  !(item.state === 'claimed' && item.claimHolder !== claimHolder && item.attemptGeneration > generation);

/**
 * Removes an item the server confirmed under `generation` (see
 * confirmedRemovable). Relaxed durability: if the removal were lost (OS
 * crash), the item would only be fenced under a newer generation and
 * resolved as the already stored message.
 */
export async function deleteConfirmedOutboxItem(
  ownerId: string,
  clientMessageId: string,
  claimHolder: string,
  generation: number
): Promise<void> {
  await updateOutboxItem(ownerId, clientMessageId, (item) =>
    confirmedRemovable(item, claimHolder, generation) ? null : undefined
  );
}

/**
 * T12 (FR-013, BR-008): removes every item of the owner ("Sair mesmo").
 * Strict durability: a deleted item must never come back after a crash and be
 * sent when the owner signs in again. Resolves with the number of items removed.
 */
export function deleteAllOutboxItems(ownerId: string): Promise<number> {
  return inTransaction<number>('readwrite', ({ items }, done) => {
    const range = IDBKeyRange.bound([ownerId, -Infinity], [ownerId, Infinity]);
    const request = items.index(BY_OWNER_ORDER).getAllKeys(range);
    request.onsuccess = () => {
      const keys = request.result;
      for (const key of keys) items.delete(key);
      done(keys.length);
    };
  });
}

export type OutboxClaim =
  /**
   * `previous`: the item as it was before this claim. A `previous.state` of
   * `unknown`, or `claimed` (a holder that is gone), means an earlier attempt
   * may have been stored: the item must be fenced before it is sent again
   * (T27). T11: a claim that sends nothing (the browser's user is not the
   * owner) puts `previous` back.
   */
  | { kind: 'claimed'; item: OutboxItem; previous: OutboxItem }
  | { kind: 'empty' }
  /** The oldest unresolved item is failed or expired: later items wait (BR-003). */
  | { kind: 'blocked'; item: OutboxItem }
  /**
   * T9 (FR-008): the oldest item is waiting out the backoff of a transient
   * rejection (`retryNotBefore`, shared by every tab); claim again in `retryInMs`.
   */
  | { kind: 'deferred'; item: OutboxItem; retryInMs: number }
  /**
   * Block A fix F4: the oldest item is claimed by another holder whose claim
   * must not be replaced (see ClaimTakeover); nothing changed.
   */
  | { kind: 'busy'; item: OutboxItem };

/**
 * Block A fix F4: which live claim of another holder this drain may take over.
 * - `acquiredAt`: when this drain got the conversation's lock. A live claim
 *   made before it belongs to a holder that let the lock go without ending
 *   its claim (tab closed or crashed): taken over. A live claim made at or
 *   after it was made by a tab that took the lock from this one: never replaced.
 * - `stolen`: this drain took the lock over from a holder whose lease had
 *   ended; only a claim whose lease has ended is replaced (the steal checked
 *   that lease, not a claim made meanwhile).
 * - `supersedeEpoch` (T13 #7, block B fix F3; FR-004): this drain took the
 *   lock over after a connectivity recovery that advanced the owner's shared
 *   recovery epoch to this value; a live claim of an OLDER epoch is a
 *   pre-outage attempt of a holder that neither superseded nor re-stamped it
 *   (frozen): it is replaced under a newer generation (fenced first). A claim
 *   made — or re-stamped by its live holder — under this epoch is never
 *   replaced, however late any tab processes its own recovery.
 */
export interface ClaimTakeover {
  acquiredAt: number;
  stolen: boolean;
  supersedeEpoch?: number | null;
}

/** F3: the owner's shared recovery state. */
export interface RecoveryState {
  epoch: number;
  outageOpen: boolean;
}

/** F3: reads the owner's recovery epoch. */
export function readRecoveryState(ownerId: string): Promise<RecoveryState> {
  return inTransaction<RecoveryState>('readonly', ({ meta }, done) => {
    const request = meta.get(ownerId);
    request.onsuccess = () => {
      const current = request.result as OwnerMeta | undefined;
      done({ epoch: epochOf(current), outageOpen: current?.outageOpen === true });
    };
  });
}

/**
 * F3: a tab observed a connectivity loss (the browser `offline` event, its
 * Realtime socket down, or a create/fence network failure). Opens the
 * owner's outage unless one is open already — and only if the tab is current
 * (`knownEpoch` is the epoch it last saw, null if none yet): a tab that
 * processes a loss late, after another tab already recorded the recovery of
 * that outage, opens nothing. Resolves with the state after the call.
 */
export function noteOutageObserved(ownerId: string, knownEpoch: number | null): Promise<RecoveryState> {
  return inTransaction<RecoveryState>('readwrite', ({ meta }, done) => {
    const request = meta.get(ownerId);
    request.onsuccess = () => {
      const current = request.result as OwnerMeta | undefined;
      const epoch = epochOf(current);
      if (current?.outageOpen === true) {
        done({ epoch, outageOpen: true });
        return;
      }
      if (knownEpoch !== null && knownEpoch !== epoch) {
        done({ epoch, outageOpen: false });
        return;
      }
      meta.put({ ...current, ownerId, nextOrder: current?.nextOrder ?? 1, outageOpen: true } satisfies OwnerMeta);
      done({ epoch, outageOpen: true });
    };
  });
}

/** Re-stamps `claimHolder`'s live claims older than `epoch` (they belong to a tab that is evidently alive). */
function restampLiveClaimsIn(items: IDBObjectStore, ownerId: string, claimHolder: string, epoch: number): void {
  const now = Date.now();
  const range = IDBKeyRange.bound([ownerId, -Infinity], [ownerId, Infinity]);
  const request = items.index(BY_OWNER_ORDER).openCursor(range);
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const item = cursor.value as OutboxItem;
    if (
      item.state === 'claimed' &&
      item.claimHolder === claimHolder &&
      item.leaseExpiresAt !== null &&
      item.leaseExpiresAt > now &&
      (item.claimEpoch ?? 0) < epoch
    ) {
      cursor.update({ ...item, claimEpoch: epoch });
    }
    cursor.continue();
  };
}

/**
 * F3: a tab observed connectivity return (the browser `online` event, or a
 * Realtime or create/fence recovery after a loss it observed). If an outage is
 * open, closes it and advances the owner's recovery epoch — once per outage:
 * a tab that processes the same recovery later finds it closed and advances
 * nothing. Either way `claimHolder`'s own live claims are re-stamped with the
 * current epoch (this tab is alive: its claims are not pre-outage attempts of
 * a frozen holder). Resolves with the epoch and whether it advanced.
 */
export function noteRecoveryObserved(
  ownerId: string,
  claimHolder: string
): Promise<{ epoch: number; advanced: boolean }> {
  return inTransaction<{ epoch: number; advanced: boolean }>('readwrite', ({ items, meta }, done) => {
    const request = meta.get(ownerId);
    request.onsuccess = () => {
      const current = request.result as OwnerMeta | undefined;
      let epoch = epochOf(current);
      const advanced = current?.outageOpen === true;
      if (advanced) {
        epoch += 1;
        meta.put({ ...current, ownerId, nextOrder: current?.nextOrder ?? 1, recoveryEpoch: epoch, outageOpen: false } satisfies OwnerMeta);
      }
      restampLiveClaimsIn(items, ownerId, claimHolder, epoch);
      done({ epoch, advanced });
    };
  });
}

/** F3: another tab advanced the epoch to `epoch`; `claimHolder`'s live claims are re-stamped (see noteRecoveryObserved). */
export function restampLiveClaims(ownerId: string, claimHolder: string, epoch: number): Promise<void> {
  return inTransaction<void>('readwrite', ({ items }, done) => {
    restampLiveClaimsIn(items, ownerId, claimHolder, epoch);
    done(undefined);
  });
}

/** The server confirmed `key` under `generation`: removed in the claim's transaction (see confirmedRemovable). */
export interface ConfirmedRemoval {
  key: string;
  generation: number;
}

/**
 * Atomically takes the conversation's OLDEST item for a new attempt: the next
 * generation, state `claimed`, `claimHolder`, lease expiry. Only the oldest
 * item is ever eligible (BR-003). The caller must hold the conversation's
 * drain lock (Web Lock, T10); a `claimed` item of another holder is taken over
 * under a newer generation only as `takeover` allows, else `busy`. Retired
 * items (F3: delivered, kept only for their claim) are removed on the way,
 * unless their claim may not be replaced (`busy`).
 *
 * Strict durability (block A fix F1): the claim — the item's new generation
 * and dispatched state — is flushed before its request can leave the
 * machine, so an OS crash can never bring back an earlier state (e.g. a
 * cancellable generation 0) of an item whose attempt may be stored.
 *
 * `confirmed`: an item of this owner just confirmed by the server, removed in
 * the same transaction before the next one is taken. `maxDeferMs`: the
 * longest transient backoff; a waiting item whose `retryNotBefore` is at most
 * that far ahead is not claimed yet (`deferred`).
 */
export function claimOldestOutboxItem(
  ownerId: string,
  conversationId: string,
  claimHolder: string,
  leaseMs: number,
  takeover: ClaimTakeover,
  confirmed: ConfirmedRemoval | null = null,
  maxDeferMs = 0
): Promise<OutboxClaim> {
  return inTransaction<OutboxClaim>(
    'readwrite',
    ({ items, meta }, done) => {
      const now = Date.now();
      // F3: the claim carries the owner's recovery epoch, read in this transaction.
      let epoch = 0;
      /** A live claim of another holder that this drain must leave alone (F4, F3). */
      const untouchable = (item: OutboxItem): boolean =>
        item.state === 'claimed' &&
        item.claimHolder !== null &&
        item.claimHolder !== claimHolder &&
        item.leaseExpiresAt !== null &&
        item.leaseExpiresAt > now &&
        (takeover.stolen || item.updatedAt >= takeover.acquiredAt) &&
        !(typeof takeover.supersedeEpoch === 'number' && (item.claimEpoch ?? 0) < takeover.supersedeEpoch);
      const claimOldest = () => {
        const range = IDBKeyRange.bound([ownerId, conversationId, -Infinity], [ownerId, conversationId, Infinity]);
        const request = items.index(BY_CONVERSATION_ORDER).openCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            done({ kind: 'empty' });
            return;
          }
          const item = cursor.value as OutboxItem;
          if (untouchable(item)) {
            done({ kind: 'busy', item });
            return;
          }
          if (item.retired) {
            // Delivered (F3) and its claim may end now: removed; the next item follows.
            cursor.delete();
            cursor.continue();
            return;
          }
          if (item.state === 'failed' || item.state === 'expired') {
            done({ kind: 'blocked', item });
            return;
          }
          // A backoff longer than the longest one possible means the clock went
          // back: the item is due now rather than held indefinitely.
          const retryInMs =
            item.state === 'waiting' && typeof item.retryNotBefore === 'number' ? item.retryNotBefore - now : 0;
          if (retryInMs > 0 && retryInMs <= maxDeferMs) {
            done({ kind: 'deferred', item, retryInMs });
            return;
          }
          const claimed: OutboxItem = {
            ...item,
            state: 'claimed',
            attemptGeneration: item.attemptGeneration + 1,
            claimHolder,
            leaseExpiresAt: now + leaseMs,
            claimEpoch: epoch,
            updatedAt: now,
          };
          cursor.update(claimed);
          done({ kind: 'claimed', item: claimed, previous: item });
        };
      };
      const metaRequest = meta.get(ownerId);
      metaRequest.onsuccess = () => {
        epoch = epochOf(metaRequest.result as OwnerMeta | undefined);
        if (confirmed === null) {
          claimOldest();
          return;
        }
        // The confirmed item is removed (or left to a newer holder) before the oldest is read.
        const confirmedRequest = items.get([ownerId, confirmed.key]);
        confirmedRequest.onsuccess = () => {
          const item = confirmedRequest.result as OutboxItem | undefined;
          if (item && confirmedRemovable(item, claimHolder, confirmed.generation)) items.delete([ownerId, confirmed.key]);
          claimOldest();
        };
      };
    },
    'strict'
  );
}
