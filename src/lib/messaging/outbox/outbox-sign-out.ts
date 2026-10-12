// src/lib/messaging/outbox/outbox-sign-out.ts
// Phase 5 T12 (FR-013, BR-008): the outbox side of an explicit sign-out.
//
// - countUnsentOutboxItems(): the owner's unsent items in this browser (every
//   conversation and tab: they share one IndexedDB outbox), for the "Sair"
//   confirmation.
// - beginOutboxSignOut(): "Sair mesmo". Stops every outbox instance of the
//   owner in every tab of the browser FIRST — this tab's at once, the others
//   through the owner's BroadcastChannel — then waits (bounded) until no tab
//   holds a drain lock of the owner, so no drain is between a claim and its
//   request, and only then deletes every item of the owner and clears the
//   pending views. The caller then runs the existing sign-out (Presence
//   logout sequence unchanged) and calls release() whatever its outcome:
//   every tab then lets the browser's identity decide again (held while
//   signed out; resumed, with an empty outbox, if the sign-out failed).
// Late create/fence responses cannot bring an item back: they are ignored
// while stopped, and an update never creates a missing item.
// Block A fix F2: both the count and the deletion first check that the
// browser is signed in as the owner (`isOwner`); otherwise — a stale tab of
// the owner whose browser now holds another user's session, or none — the
// count is 0 and nothing is deleted: that user's sign-out never touches the
// owner's items.
import type { QueryClient } from '@tanstack/react-query';

import { debugLogger } from '@/utils/debug-logger';
import { deleteAllOutboxItems, listOutboxItems } from './outbox-db';
import { MessageOutbox, outboxChannelName, outboxDrainLockPrefix } from './message-outbox';
import { recordCancelledMetrics } from './outbox-metrics';
import { clearOutboxViews } from './outbox-view';

/** Longest wait for other tabs' drains to stop (a hung tab cannot delay the sign-out longer). */
const DRAIN_STOP_WAIT_MS = 3_000;
/**
 * Longest wait for one outbox read or delete before the sign-out: an
 * IndexedDB open or transaction that never settles must not keep the user
 * signed in (local storage never blocks the sign-out).
 */
const STORAGE_WAIT_MS = 3_000;
const SCOPE = 'OutboxSignOut';

class OutboxSignOutTimeoutError extends Error {
  constructor(step: string) {
    super(`The outbox ${step} did not finish in time`);
    this.name = 'OutboxSignOutTimeoutError';
  }
}

/** `work`, or a rejection after `ms` (the work itself is not cancelled). */
function within<T>(work: Promise<T>, ms: number, step: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new OutboxSignOutTimeoutError(step)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export interface OutboxSignOut {
  /**
   * Waits (at most 3 s) for the drains to stop, then deletes every item of the
   * owner if the browser is still signed in as the owner (F2; else deletes
   * nothing); rejects if the delete fails or takes more than 3 s.
   */
  discard(): Promise<void>;
  /** The sign-out ended (or failed): every tab's outbox follows the browser's identity again. Idempotent. */
  release(): void;
}

/** Whether the browser is signed in as the owner now (its users.supabase_uid), read from its session. */
export type OutboxOwnerCheck = () => Promise<boolean>;

/**
 * The owner's unsent outbox items in this browser (all conversations, all
 * tabs); 0 unless the browser is signed in as the owner (F2). Rejects when
 * the identity check or the read takes more than 3 s.
 */
export async function countUnsentOutboxItems(ownerId: string, isOwner: OutboxOwnerCheck): Promise<number> {
  if (!(await within(isOwner(), STORAGE_WAIT_MS, 'identity check'))) return 0;
  const items = await within(listOutboxItems(ownerId), STORAGE_WAIT_MS, 'read');
  // F3: a retired item is already delivered.
  return items.filter((item) => !item.retired).length;
}

/** Waits until no tab holds (or waits for) a drain lock of the owner, at most `maxMs`. */
async function waitForDrainsToStop(ownerId: string, maxMs: number): Promise<void> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return;
  const prefix = outboxDrainLockPrefix(ownerId);
  let names: string[];
  try {
    const snapshot = await locks.query();
    names = [...(snapshot.held ?? []), ...(snapshot.pending ?? [])]
      .map((lock) => lock.name ?? '')
      .filter((name) => name.startsWith(prefix));
  } catch {
    return;
  }
  const deadline = AbortSignal.timeout(maxMs);
  // Taking each lock in turn means its holder's drain loop has returned.
  await Promise.allSettled([...new Set(names)].map((name) => locks.request(name, { signal: deadline }, async () => undefined)));
}

/** "Sair mesmo": stops every drain of the owner in this browser now (see the file header). */
export function beginOutboxSignOut(ownerId: string, queryClient: QueryClient, isOwner: OutboxOwnerCheck): OutboxSignOut {
  const local = MessageOutbox.liveFor(ownerId);
  local.forEach((outbox) => outbox.stopForSignOut());
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(outboxChannelName(ownerId)) : null;
  const post = (message: { signOutStop: true } | { signOutDone: true }) => {
    try {
      channel?.postMessage(message);
    } catch {
      // The other tabs then stop on the auth change (signed out) or their stop expires.
    }
  };
  post({ signOutStop: true });
  clearOutboxViews(queryClient, ownerId);
  let released = false;
  return {
    async discard() {
      // Past the wait the delete goes ahead anyway (a frozen tab cannot hold the sign-out).
      await within(waitForDrainsToStop(ownerId, DRAIN_STOP_WAIT_MS), DRAIN_STOP_WAIT_MS + 500, 'drain stop').catch(
        () => undefined
      );
      // F2: deleted only if the browser is still signed in as the owner when "Sair mesmo" runs.
      const owner = await within(isOwner(), STORAGE_WAIT_MS, 'identity check').catch(() => false);
      if (!owner) {
        if (debugLogger.messaging.enabled()) debugLogger.messaging.event(SCOPE, 'outbox-kept-not-owner', {});
        return;
      }
      const removed = await within(deleteAllOutboxItems(ownerId), STORAGE_WAIT_MS, 'delete');
      clearOutboxViews(queryClient, ownerId);
      // T19: the unsent items the user chose to drop (delivered only if the session still allows).
      recordCancelledMetrics(removed);
      if (debugLogger.messaging.enabled()) {
        debugLogger.messaging.event(SCOPE, 'outbox-deleted', { removed });
      }
    },
    release() {
      if (released) return;
      released = true;
      post({ signOutDone: true });
      channel?.close();
      local.forEach((outbox) => outbox.endSignOutStop());
    },
  };
}
