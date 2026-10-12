// src/lib/messaging/outbox/message-outbox.ts
// Phase 5 T8 (FR-001, FR-002, FR-003, BR-002, BR-003): the signed-in user's
// durable outbox of text/reply messages and its ordered automatic delivery.
//
// - enqueue(): writes the item to IndexedDB (committed, strict durability)
//   BEFORE anything is dispatched and before the composer clears; a failed
//   write rejects with OutboxStorageError and nothing is sent (FR-033, D5).
// - Drain, per conversation, in creation order: only the oldest item is ever
//   eligible; one attempt at a time per conversation in this tab, and a Web
//   Lock per (owner, conversation) keeps other tabs of the browser from
//   draining the same conversation at the same time (released by the browser
//   when the tab closes or crashes).
// - Cross-tab (T10, FR-004, FR-005): every request of a claim ends within its
//   deadline (30 s, never past the claim's 45 s lease); a tab whose lock is
//   busy while the oldest item's lease has ended takes the lock over (Web
//   Lock `steal`) and fences that item under a newer generation; the browser
//   `online` event aborts this tab's requests still in flight, so an attempt
//   started before or during an outage is superseded at once (fenced and
//   sent again under a new generation). Every outbox write is announced on a
//   BroadcastChannel; the other tabs of the user re-read the conversation
//   (each item shown once, in every tab) and check its drain. Cancel removes
//   a never-dispatched waiting item in one transaction that excludes a claim.
// - Every attempt carries a new attempt generation and the owner as
//   expectedSenderId. An item whose earlier attempt may be stored (`unknown`,
//   or `claimed` by a tab that is gone) is first fenced under the new
//   generation (T27, FR-006): stored -> delivered; not stored -> sent under
//   that generation only while it is still this tab's claim and inside its
//   24 h window, else `expired`; a definitive refusal (403 NOT_PARTICIPANT
//   after access loss) -> `failed`, never treated as not stored.
// - T9 (FR-007..FR-009, BR-005, BR-006): a definitive rejection fails the
//   item (text kept, "Tentar de novo"/"Apagar") and holds the later items of
//   its conversation only; a CLIENT_MESSAGE_ID_REUSED item is moved to a new
//   key when it fails, so "Tentar de novo" sends its content under that key
//   and the conflicting stored message never resolves it. A transient
//   rejection (429, 401 with a valid session) keeps the item waiting under a
//   backoff stored on the item, so every tab respects it. Any item whose 24 h
//   window has ended (never dispatched and waiting ones included) is fenced
//   before anything is sent: not stored -> `expired`, never sent
//   automatically; "Tentar de novo" keeps its key and send time and opens a
//   new window.
// - T11 (FR-011, FR-012, BR-001): nothing is claimed for sending, fenced or
//   created unless the browser's authenticated user is the owner, checked
//   right before every request (outbox-identity.ts); a claim that then sends
//   nothing is put back as it was. A response that arrives once the browser
//   is signed out or signed in as another user is discarded: no item, claim
//   or view changes. Signed out, or another user, in any tab: this tab holds
//   — aborts its requests in flight, stops its drains and timers — and tells
//   the owner's other tabs to check (they also see the auth change); the
//   items stay as they are (never failed or deleted) and drain when the owner
//   is authenticated again. Another user's own tabs never read them (items
//   are keyed by owner); a stale tab of the owner whose browser is now signed
//   in as another user (block A fix F2) hides the owner's pending copies,
//   refuses to queue under the owner, and its sign-out neither counts nor
//   deletes the owner's items (outbox-sign-out.ts). A 401 while the owner's
//   session is still held stays a transient rejection (retried under the
//   shared backoff).
// - T12 (FR-013, BR-008): "Sair mesmo" stops every instance of the owner in
//   every tab of the browser before anything else (stopForSignOut, announced
//   on the same channel; outbox-sign-out.ts): requests in flight are aborted,
//   nothing is sent, applied or shown until the sign-out ends — then the
//   browser's identity decides as above (held once signed out). The items
//   are deleted while every drain is stopped, so a late response never
//   brings one back (updates never create items).
// - Triggers: start (page load), enqueue, the browser `online` event, an
//   auth state change, the messages Realtime stream's recovery (T13,
//   resumeDrains: the same drain path, so the owner check and the sign-out
//   stop apply), and a capped backoff after a transient or unknown outcome.
// - T13 (FR-004, AC-041; block A review #7) and block B fix F3: a holder
//   frozen across an outage cannot supersede its own attempt. The owner's
//   tabs share a recovery epoch (outbox-db): a tab that observes a
//   connectivity loss (browser `offline`, its Realtime socket down, a
//   create/fence network failure) opens an outage; the first tab to observe
//   its recovery (browser `online`, Realtime recovery, a create/fence
//   response after such a loss) closes it and advances the epoch, once per
//   outage. Every claim carries the epoch it was made under, and a live tab
//   re-stamps its own live claims on each recovery it observes or learns of
//   (announced on the channel). Once this tab has known the new epoch for a
//   short grace, a live claim of another tab under an OLDER epoch (a frozen
//   holder) is superseded: the lock is taken over and the item fenced and
//   sent under a newer generation, without waiting for that claim's lease. A
//   claim made or re-stamped under the current epoch is never replaced,
//   however late another tab processes its own connectivity events.
// - An item is confirmed — removed from the outbox and its pending copy
//   dropped — by a 200/201/410 response, or the first time its stored key is
//   observed in the feed or Realtime (observeStoredMessages), whichever comes
//   first; a confirmed key is never shown again. An observed item still under
//   a live claim is only marked retired, keeping the claim's lease (F3). A
//   confirmation whose stored message was deleted since (stored/null fence,
//   410) tells the other tabs to drop their copy at once (F8).
// - Block A fix F4: a claim never replaces a live claim made by a tab that
//   took the lock over, nor, after a steal, any live claim; a success removes
//   its item only if no newer holder claimed it; ownership, identity and the
//   sign-out stop are checked again right before every request.
// - T19 (FR-027, FR-028): metric events are recorded synchronously at the
//   trace points (enqueue offline, every answered attempt, a confirmation
//   observed in the feed, cancel; outbox-metrics.ts) and never awaited.
import type { QueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { messagingApi } from '@/lib/messaging-api';
import { normalizeClientMessageId, observeStoredMessages } from '@/lib/messaging/message-cache';
import { debugLogger } from '@/utils/debug-logger';
import type { Message } from '@/types/messaging';
import type { OutboxEnqueueInput, OutboxItem } from '@/types/message-outbox';
import {
  addOutboxItem,
  claimOldestOutboxItem,
  deleteConfirmedOutboxItem,
  listOutboxItems,
  noteOutageObserved,
  noteRecoveryObserved,
  readRecoveryState,
  restampLiveClaims,
  updateOutboxItem,
  type ConfirmedRemoval,
} from './outbox-db';
import type { OutboxIdentity, OutboxIdentityState } from './outbox-identity';
import {
  classifyAttemptResponse,
  classifyFenceResponse,
  type OutboxAttemptOutcome,
  type OutboxFenceOutcome,
  type OutboxRequestFailure,
} from './outbox-outcome';
import {
  recordAttemptMetrics,
  recordCancelledMetrics,
  recordDeliveredMetrics,
  recordQueuedOfflineMetric,
} from './outbox-metrics';
import { clearOutboxViews, publishOutboxItem, showConfirmedOutboxMessage, writeOutboxView } from './outbox-view';

/** Lease of a drain claim (FR-004): after it another tab may take the conversation over. */
const CLAIM_LEASE_MS = 45_000;
/** Request deadline of one create or fence (FR-004); never past the claim's lease. */
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;
/** Retry when another tab holds the conversation's drain lock. */
const LOCK_BUSY_RETRY_MS = 2_000;
/**
 * T13 (#7): after this tab learns of a new recovery epoch, how long a live
 * holder gets to supersede or re-stamp its own pre-outage claim (it does so
 * at once, on its own recovery event or the epoch announcement) before this
 * tab takes it over.
 */
const SUPERSEDE_GRACE_MS = 2_000;
const MAX_REMEMBERED_CONFIRMATIONS = 1_000;
/** BR-006: an item not stored 24 h after its window started is never sent automatically. */
const DELIVERY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const SCOPE = 'MessageOutbox';
/**
 * T12: longest stop for a "Sair mesmo" whose end is never announced (its tab
 * closed mid-sign-out); the sign-out itself takes at most about 16 s.
 */
const SIGN_OUT_STOP_MAX_MS = 60_000;

/** The owner's BroadcastChannel: outbox writes (T10), identity checks (T11), sign-out stop/end (T12). */
export const outboxChannelName = (ownerId: string): string => `vo-messaging-outbox:${ownerId}`;
/** T12: the cross-tab drain lock names of the owner (one per conversation) start with this. */
export const outboxDrainLockPrefix = (ownerId: string): string => `vo-messaging-outbox:${ownerId}:`;

interface ConversationDrain {
  running: boolean;
  rerun: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryDelayMs: number;
  viewSeq: number;
  keys: Set<string>;
  /** The items this tab last rendered (T10: kept while delivered by another tab, see render). */
  shown: Map<string, OutboxItem>;
}

const createTabId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A reply target the server can accept: a stored message id (UUID) of the
 * same conversation. A pending copy's `temp-<key>` id, or a message of another
 * conversation, is never one — queuing a reply to it would only end in a
 * definitive 400 that blocks the conversation (BR-003).
 */
export class OutboxInvalidReplyTargetError extends Error {
  constructor() {
    super('The reply target is not a sent message');
    this.name = 'OutboxInvalidReplyTargetError';
  }
}

/** The item under a new, never-dispatched key (T9: a CLIENT_MESSAGE_ID_REUSED item, FR-007). */
const withNewKey = (item: OutboxItem): OutboxItem => ({ ...item, clientMessageId: uuidv4(), attemptGeneration: 0 });

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * One hold of a conversation's drain lock; `lost` once another tab took the
 * lock over. `acquiredAt` / `stolen`: which live claims of other holders this
 * hold may take over (block A fix F4, outbox-db ClaimTakeover).
 */
interface DrainSession {
  lost: boolean;
  acquiredAt: number;
  stolen: boolean;
  /** T13 (#7), F3: a live claim of another tab under an older recovery epoch is a pre-outage attempt, superseded. */
  supersedeEpoch: number | null;
}

/** F3: where this tab observed a connectivity loss or its recovery. */
type ConnectivitySource = 'browser' | 'realtime' | 'http';

/** An item the server confirmed in this drain; `deleted`: its stored message was deleted since (F8). */
interface DrainConfirmation extends ConfirmedRemoval {
  deleted: boolean;
}

/**
 * Block A fix F2: enqueue refused because the browser is signed out or
 * signed in as another user. Nothing is stored; the composer keeps the draft.
 */
export class OutboxNotOwnerError extends Error {
  constructor() {
    super('The browser is not signed in as the owner of this outbox');
    this.name = 'OutboxNotOwnerError';
  }
}

const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/** T19 (metrics only): set when a create or fence was aborted by its own deadline. */
interface RequestDeadline {
  hit: boolean;
}

/** T19 (metrics only): why a create or fence got no answer. */
const requestFailure = (error: unknown, deadline: RequestDeadline): OutboxRequestFailure => {
  if (deadline.hit) return 'timeout';
  return isAbortError(error) || !isOnline() ? 'offline' : 'network';
};

/** T19: when the dispatch that may confirm an item started (a fence-first claim: its create). */
interface DispatchTiming {
  dispatchedAt: number;
}

export class MessageOutbox {
  /** T12: this tab's running instances, so "Sair mesmo" stops them at once. */
  private static readonly live = new Set<MessageOutbox>();

  /** T18: sign-out stops entered by this tab's instances, per owner. */
  private static readonly signOutStops = new Map<string, number>();

  /** T12: this tab's running outbox instances of `ownerId`. */
  static liveFor(ownerId: string): MessageOutbox[] {
    return [...MessageOutbox.live].filter((outbox) => outbox.ownerId === ownerId);
  }

  /**
   * T18 (FR-025): read synchronously by a pending desktop notification — how
   * many "Sair mesmo" stops of `ownerId` this tab has entered, and whether
   * one is in progress. A change, or an active stop, discards it.
   */
  static signOutStopState(ownerId: string): { stops: number; active: boolean } {
    return {
      stops: MessageOutbox.signOutStops.get(ownerId) ?? 0,
      active: MessageOutbox.liveFor(ownerId).some((outbox) => outbox.signOutStop !== null),
    };
  }

  readonly ownerId: string;
  private readonly queryClient: QueryClient;
  private readonly tabId = createTabId();
  private readonly conversations = new Map<string, ConversationDrain>();
  private readonly confirmed = new Set<string>();
  /** Confirmed by a response whose stored message the drain has not shown yet. */
  private readonly confirmedNotShown = new Set<string>();
  /**
   * Delivered and removed by another tab (T10) but not yet observed in this
   * tab's feed: the copy stays until the stored message shows here.
   */
  private readonly deliveredElsewhere = new Set<string>();
  private disposed = false;
  /**
   * T11: the browser is signed out or signed in as another user — nothing is
   * sent and no response is applied until the owner is authenticated again.
   */
  private held = false;
  /**
   * T12: set while a "Sair mesmo" of the owner is in progress in some tab —
   * nothing is sent, applied or shown, whoever is authenticated — until it
   * ends (endSignOutStop), the browser is seen signed out, or it expires.
   */
  private signOutStop: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeObservations: (() => void) | null = null;
  private unsubscribeIdentity: (() => void) | null = null;
  /** Announces this tab's outbox writes to the user's other tabs (T10). */
  private channel: BroadcastChannel | null = null;
  /** Create and fence requests of this tab still in flight. */
  private readonly inFlight = new Set<AbortController>();
  private readonly identity: OutboxIdentity;
  /** F3: the newest recovery epoch this tab knows, and when it learned of it. */
  private epochSeen: { epoch: number; at: number } | null = null;
  /** F3: this tab observed a connectivity loss whose recovery it has not observed yet. */
  private lossNoted = false;

  constructor(ownerId: string, queryClient: QueryClient, identity: OutboxIdentity) {
    this.ownerId = ownerId;
    this.queryClient = queryClient;
    this.identity = identity;
  }

  start(): void {
    // Pending views outlive an unmounted feed: they are the only copy on screen
    // of an item not yet delivered (they hold a few small messages per user).
    this.queryClient.setQueryDefaults(['messages-pending'], { gcTime: Infinity, staleTime: Infinity });
    MessageOutbox.live.add(this);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.unsubscribeObservations = observeStoredMessages(this.queryClient, this.handleStoredObserved);
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(outboxChannelName(this.ownerId));
      this.channel.onmessage = this.handleRemoteChange;
    }
    this.unsubscribeIdentity = this.identity.onChange(this.handleAuthChange);
    readRecoveryState(this.ownerId)
      .then((state) => this.learnEpoch(state.epoch))
      .catch((error) => this.trace('recovery-read-failed', { error: String(error) }));
    void this.loadAll();
  }

  /** Stops everything of this instance; requests still in flight are aborted and their outcome ignored. */
  dispose(): void {
    this.disposed = true;
    MessageOutbox.live.delete(this);
    if (this.signOutStop) clearTimeout(this.signOutStop);
    this.signOutStop = null;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.channel?.close();
    this.channel = null;
    this.unsubscribeObservations?.();
    this.unsubscribeObservations = null;
    this.unsubscribeIdentity?.();
    this.unsubscribeIdentity = null;
    this.abortInFlight();
    this.clearRetryTimers();
  }

  /**
   * Durably queues a text/reply message (never files or voice, BR-002) and
   * starts its delivery. Resolves once the item is committed to IndexedDB and
   * shown as pending; rejects with OutboxStorageError if it cannot be stored,
   * and with OutboxInvalidReplyTargetError (nothing stored) when the reply
   * target is not a stored message.
   */
  async enqueue(input: OutboxEnqueueInput): Promise<void> {
    if (this.disposed) throw new Error('The outbox of this user is closed');
    // T12: the user is signing out and this outbox is being deleted.
    if (this.signOutStop) throw new Error('Signing out: nothing more is queued');
    const clientMessageId = normalizeClientMessageId(input.clientMessageId);
    const content = input.content.trim();
    if (!clientMessageId || !content) throw new Error('Nothing to send');
    const replyToId = input.replyToId ?? null;
    // Nothing is written or dispatched; the composer keeps the draft.
    if (replyToId !== null && !UUID_PATTERN.test(replyToId)) throw new OutboxInvalidReplyTargetError();
    const replyConversationId = input.replyToConversationId ?? null;
    if (replyToId !== null && replyConversationId !== null && replyConversationId !== input.conversationId) {
      throw new OutboxInvalidReplyTargetError();
    }
    // Block A fix F2 (BR-001): never queued under this owner while the browser
    // is signed out or signed in as another user (a stale tab). A session that
    // cannot be read now (`unverified`, e.g. offline with an expired token)
    // does not stop an offline send.
    if (!(await this.verifyOwner()) && this.held) throw new OutboxNotOwnerError();
    if (this.disposed) throw new Error('The outbox of this user is closed');
    if (this.signOutStop) throw new Error('Signing out: nothing more is queued');
    const now = Date.now();
    const item = await addOutboxItem({
      ownerId: this.ownerId,
      clientMessageId,
      conversationId: input.conversationId,
      content,
      replyToId,
      mentionIds: [...(input.mentionIds ?? [])],
      pressedSendAt: now,
      windowStartedAt: now,
      state: 'waiting',
      failureReason: null,
      attemptGeneration: 0,
      claimHolder: null,
      leaseExpiresAt: null,
      updatedAt: now,
      schemaVersion: 1,
    });
    this.trace('enqueued', { conversationId: item.conversationId, order: item.order });
    if (!isOnline()) recordQueuedOfflineMetric();
    // The committed item is shown from the write itself, before the composer
    // clears: a later read of the outbox may fail, and the message must not
    // then be stored but invisible. The re-read only refreshes the others.
    this.showItem(item);
    this.announce(item.conversationId);
    void this.refreshView(item.conversationId);
    this.drainConversation(item.conversationId);
  }

  /**
   * "Tentar de novo" on a failed or expired item (T27, T9; FR-007, FR-009,
   * BR-006): back to the drain, which fences it first when an earlier attempt
   * may be stored (any dispatched item), so a stored message resolves as
   * delivered and a not-stored one is sent under the normal rules. The item
   * keeps its key and send time and gets a new 24 h window. A reused key is
   * never sent again: a CLIENT_MESSAGE_ID_REUSED item already got a new,
   * never-dispatched key when it failed (recordUndelivered); one that did not
   * gets it here.
   */
  async retry(clientMessageId: string): Promise<void> {
    // T11 (BR-001): only while the browser's user is the owner.
    if (this.disposed || !(await this.verifyOwner())) return;
    const now = Date.now();
    let rekeyed = false;
    const item = await updateOutboxItem(
      this.ownerId,
      clientMessageId,
      (stored) => {
        if (stored.state !== 'expired' && stored.state !== 'failed') return undefined;
        rekeyed =
          stored.state === 'failed' &&
          stored.failureReason === 'client_message_id_reused' &&
          stored.attemptGeneration > 0;
        const next = rekeyed ? withNewKey(stored) : stored;
        return {
          ...next,
          state: next.attemptGeneration > 0 ? 'unknown' : 'waiting',
          failureReason: null,
          windowStartedAt: now,
          retryNotBefore: null,
          retryDelayMs: null,
          updatedAt: now,
        };
      },
      'strict'
    );
    if (!item || this.disposed || (item.state !== 'unknown' && item.state !== 'waiting')) return;
    if (rekeyed) {
      await this.refreshView(item.conversationId);
    } else {
      this.showItem(item);
    }
    this.announce(item.conversationId);
    this.drain(item.conversationId).retryDelayMs = RETRY_BASE_MS;
    this.drainConversation(item.conversationId);
  }

  /**
   * "Cancelar" (T10; FR-005, BR-007) on an item known not to be stored: a
   * waiting item never dispatched (generation 0). It is removed in one
   * transaction that also checks its state, so it races a claim atomically —
   * either the cancel wins (the item is gone in every tab and never sent) or
   * the claim won (nothing changes; the item now shows "enviando").
   */
  async cancel(clientMessageId: string): Promise<void> {
    // T11 (BR-001): only while the browser's user is the owner.
    if (this.disposed || !(await this.verifyOwner())) return;
    let conversationId: string | null = null;
    let cancelled = false;
    await updateOutboxItem(
      this.ownerId,
      clientMessageId,
      (stored) => {
        conversationId = stored.conversationId;
        cancelled = stored.state === 'waiting' && stored.attemptGeneration === 0;
        return cancelled ? null : undefined;
      },
      'strict'
    );
    if (cancelled) recordCancelledMetrics();
    if (conversationId === null || this.disposed) return;
    this.announce(conversationId);
    await this.refreshView(conversationId);
    this.drainConversation(conversationId);
  }

  /**
   * "Apagar" on a failed or expired item: removes only the local item (no
   * request); the next item of the conversation proceeds.
   */
  async discard(clientMessageId: string): Promise<void> {
    // T11 (BR-001): only while the browser's user is the owner.
    if (this.disposed || !(await this.verifyOwner())) return;
    let conversationId: string | null = null;
    await updateOutboxItem(this.ownerId, clientMessageId, (stored) => {
      if (stored.state !== 'failed' && stored.state !== 'expired') return undefined;
      conversationId = stored.conversationId;
      return null;
    });
    if (conversationId === null || this.disposed) return;
    this.announce(conversationId);
    await this.refreshView(conversationId);
    this.drainConversation(conversationId);
  }

  /**
   * T12 (FR-013): "Sair mesmo" of the owner in this or another tab. Stops at
   * once — requests in flight aborted (their outcome ignored), drains and
   * retries stopped, pending copies cleared — and stays stopped until the
   * sign-out ends, whatever the auth state reads meanwhile.
   */
  stopForSignOut(): void {
    if (this.disposed) return;
    MessageOutbox.signOutStops.set(this.ownerId, (MessageOutbox.signOutStops.get(this.ownerId) ?? 0) + 1);
    if (this.signOutStop) clearTimeout(this.signOutStop);
    this.signOutStop = setTimeout(() => this.endSignOutStop(), SIGN_OUT_STOP_MAX_MS);
    this.held = true;
    this.abortInFlight();
    this.clearRetryTimers();
    this.conversations.forEach((drain) => {
      // A re-read already in flight must not show its items again.
      drain.viewSeq += 1;
      drain.keys.clear();
      drain.shown.clear();
    });
    clearOutboxViews(this.queryClient, this.ownerId);
    this.trace('sign-out-stop', {});
  }

  /**
   * T12: the sign-out ended (signed out, or it failed): the browser's identity
   * decides again — held while signed out (or another user), resumed when the
   * owner is still signed in.
   */
  endSignOutStop(): void {
    if (!this.signOutStop) return;
    clearTimeout(this.signOutStop);
    this.signOutStop = null;
    if (!this.disposed) void this.verifyOwner();
  }

  /**
   * T13 (FR-002): the messages Realtime stream recovered, so connectivity is
   * back for this tab. Every conversation drains again now (retry backoffs of
   * unknown outcomes are cut short; a transient rejection's shared backoff
   * still holds, see claimOldestOutboxItem) through drainConversation, so a
   * held tab only re-checks its owner and a "Sair mesmo" stop sends nothing.
   * Requests in flight are not aborted: the socket recovering says nothing
   * about them. F3: after a connectivity loss this tab observed (its socket
   * down), this is a recovery of that outage (recovery epoch), recorded
   * before the drains claim anything.
   */
  resumeDrains(): void {
    if (this.disposed) return;
    this.trace('realtime-recovered', {});
    this.clearRetryTimers();
    this.conversations.forEach((drain) => {
      drain.retryDelayMs = RETRY_BASE_MS;
    });
    void this.observeRecovery('realtime').finally(() => {
      if (!this.disposed) void this.loadAll();
    });
  }

  /**
   * F3: this tab observed a connectivity loss — the browser went offline, its
   * Realtime socket is down (MessagingContext), or a create/fence got no
   * response. Opens the owner's outage (once; a late, stale observation opens
   * nothing, see noteOutageObserved).
   */
  noteConnectivityLost(source: ConnectivitySource): void {
    if (this.disposed || this.lossNoted) return;
    this.lossNoted = true;
    noteOutageObserved(this.ownerId, this.epochSeen?.epoch ?? null)
      .then((state) => {
        this.learnEpoch(state.epoch);
        this.trace('connectivity-lost', { source, epoch: state.epoch, outageOpen: state.outageOpen });
      })
      .catch((error) => this.trace('recovery-note-failed', { error: String(error) }));
  }

  /**
   * F3: this tab observed connectivity return (`browser`: the `online` event;
   * `realtime` / `http`: only after a loss it observed itself). The first tab
   * to observe the recovery of an open outage advances the shared epoch and
   * announces it; this tab's own live claims are re-stamped either way.
   */
  private async observeRecovery(source: ConnectivitySource): Promise<void> {
    if (this.disposed || (source !== 'browser' && !this.lossNoted)) return;
    // T11: no item or claim changes (the re-stamp) unless the browser's user is the owner.
    if (this.held || this.signOutStop || !(await this.verifyOwner())) return;
    this.lossNoted = false;
    try {
      const { epoch, advanced } = await noteRecoveryObserved(this.ownerId, this.tabId);
      if (this.disposed) return;
      this.learnEpoch(epoch);
      if (!advanced) return;
      this.trace('recovery-epoch', { source, epoch });
      this.channel?.postMessage({ recoveryEpoch: epoch });
    } catch (error) {
      this.trace('recovery-note-failed', { error: String(error) });
    }
  }

  /** F3: the newest recovery epoch this tab knows (and when it first learned of it, for the takeover grace). */
  private learnEpoch(epoch: number): void {
    if (!this.epochSeen || epoch > this.epochSeen.epoch) this.epochSeen = { epoch, at: Date.now() };
  }

  private readonly handleOffline = () => {
    this.noteConnectivityLost('browser');
  };

  private readonly handleOnline = () => {
    if (this.disposed) return;
    // Requests still in flight started before connectivity returned: they are
    // superseded now (unknown → fenced and sent again under a new generation)
    // instead of holding the conversation until their deadline (FR-004, D1).
    this.abortInFlight();
    this.clearRetryTimers();
    this.conversations.forEach((drain) => {
      drain.retryDelayMs = RETRY_BASE_MS;
    });
    // F3: the recovery is recorded before the drains claim again, so their
    // new claims carry the new epoch.
    void this.observeRecovery('browser').finally(() => {
      if (!this.disposed) void this.loadAll();
    });
  };

  /** T11: the auth state changed in this tab or, through the auth client, in another one. */
  private readonly handleAuthChange = () => {
    void this.verifyOwner();
  };

  /**
   * T11 (FR-011): true only while the browser's authenticated user is the
   * owner. Otherwise this tab holds (see hold). A held tab whose owner is
   * authenticated again resumes its drains. `unverified` (the session could
   * not be read) holds nothing and sends nothing: the caller tries later.
   */
  private async verifyOwner(): Promise<boolean> {
    let state: OutboxIdentityState;
    try {
      state = await this.identity.check();
    } catch {
      state = 'unverified';
    }
    if (this.disposed) return false;
    if (this.signOutStop) {
      // T12: stopped for "Sair mesmo"; once the browser is signed out (or
      // another user), it is an ordinary hold that resumes for the owner.
      if (state === 'ended' || state === 'other') {
        clearTimeout(this.signOutStop);
        this.signOutStop = null;
        this.hold(state);
      }
      return false;
    }
    if (state === 'owner') {
      if (this.held) {
        this.held = false;
        this.trace('identity-resumed', {});
        void this.loadAll();
      }
      return true;
    }
    if (state !== 'unverified') this.hold(state);
    return false;
  }

  /**
   * T11 (FR-011, FR-012): the browser is signed out or signed in as another
   * user. This tab's requests in flight are aborted (their outcome is
   * ignored), its drains and retries stop, and the owner's other tabs are
   * told to check theirs. Items stay exactly as they are: held, not failed
   * or deleted, until the owner is authenticated again.
   */
  private hold(state: Exclude<OutboxIdentityState, 'owner' | 'unverified'>): void {
    const wasHeld = this.held;
    this.held = true;
    this.abortInFlight();
    this.clearRetryTimers();
    if (wasHeld) return;
    // Block A fix F2: whoever is authenticated now sees none of the owner's
    // pending copies in this tab (render shows nothing while held); they come
    // back when the owner is authenticated again (verifyOwner → loadAll).
    this.conversations.forEach((drain) => {
      drain.viewSeq += 1;
    });
    clearOutboxViews(this.queryClient, this.ownerId);
    this.trace('identity-hold', { state });
    try {
      this.channel?.postMessage({ identityCheck: true });
    } catch (error) {
      this.trace('announce-failed', { error: String(error) });
    }
  }

  private abortInFlight(): void {
    this.inFlight.forEach((controller) => controller.abort());
    this.inFlight.clear();
  }

  private clearRetryTimers(): void {
    this.conversations.forEach((drain) => {
      if (drain.retryTimer) clearTimeout(drain.retryTimer);
      drain.retryTimer = null;
    });
  }

  /**
   * A stored message with one of this owner's keys was observed: the item is
   * delivered. Block A fix F3: an item still claimed under a live lease (by
   * any tab) is only marked retired — its row keeps the claim, so a holder
   * that hangs still lets another tab take the conversation over once the
   * lease ends; the holder, or the tab that takes over, removes it.
   */
  private readonly handleStoredObserved = (conversationId: string, stored: readonly Message[]) => {
    // T11: no item changes while another user (or nobody) is authenticated.
    if (this.disposed || this.held) return;
    const drain = this.conversations.get(conversationId);
    if (!drain || drain.keys.size === 0) return;
    for (const message of stored) {
      const key = normalizeClientMessageId(message.clientMessageId);
      if (message.senderId !== this.ownerId || !key || !drain.keys.has(key)) continue;
      this.markConfirmed(key);
      // The feed now holds the stored message: the copy may go at once.
      this.confirmedNotShown.delete(key);
      this.deliveredElsewhere.delete(key);
      drain.keys.delete(key);
      const observed: { at: number; removed: OutboxItem | null } = { at: Date.now(), removed: null };
      void updateOutboxItem(this.ownerId, key, (item) => {
        observed.removed = null;
        const liveClaim = item.state === 'claimed' && item.leaseExpiresAt !== null && item.leaseExpiresAt > Date.now();
        if (!liveClaim) {
          observed.removed = item;
          return null;
        }
        return item.retired ? undefined : { ...item, retired: true };
      })
        .then(() => {
          // T19: confirmed here, not by an answer to a drain (whose holder records it).
          if (observed.removed) recordDeliveredMetrics(observed.removed, observed.at, null);
          this.announce(conversationId, key);
        })
        .catch((error) => this.trace('confirm-delete-failed', { error: String(error) }))
        .finally(() => void this.refreshView(conversationId));
    }
  };

  /** Another tab of this user wrote the conversation's items: show them, and check its drain soon. */
  private readonly handleRemoteChange = (event: MessageEvent) => {
    const data = event.data as {
      conversationId?: unknown;
      delivered?: unknown;
      deleted?: unknown;
      identityCheck?: unknown;
      signOutStop?: unknown;
      signOutDone?: unknown;
      recoveryEpoch?: unknown;
    } | null;
    if (this.disposed) return;
    // F3: another tab recorded a connectivity recovery: this tab is alive, so
    // its own live claims are not pre-outage attempts — re-stamped at once
    // (well within the other tabs' takeover grace).
    if (typeof data?.recoveryEpoch === 'number') {
      const epoch = data.recoveryEpoch;
      this.learnEpoch(epoch);
      this.lossNoted = false;
      // T11: no claim changes unless the browser's user is the owner.
      if (this.held || this.signOutStop) return;
      void this.verifyOwner()
        .then((owner) => (owner && !this.disposed ? restampLiveClaims(this.ownerId, this.tabId, epoch) : undefined))
        .catch((error) => this.trace('recovery-note-failed', { error: String(error) }));
      return;
    }
    // T11: another tab of the owner found the browser signed out or signed in as another user.
    if (data?.identityCheck === true) {
      void this.verifyOwner();
      return;
    }
    // T12: "Sair mesmo" started / ended in some tab (outbox-sign-out.ts).
    if (data?.signOutStop === true) {
      this.stopForSignOut();
      return;
    }
    if (data?.signOutDone === true) {
      this.endSignOutStop();
      return;
    }
    const conversationId = data?.conversationId;
    if (typeof conversationId !== 'string') return;
    const delivered = normalizeClientMessageId(typeof data?.delivered === 'string' ? data.delivered : null);
    if (delivered && data?.deleted === true) {
      // F8: delivered, and its stored message deleted since: no stored message
      // will ever be observed for it here — the copy goes now.
      this.markConfirmed(delivered);
      this.drain(conversationId).keys.delete(delivered);
    } else if (delivered && !this.confirmed.has(delivered) && this.deliveredElsewhere.size < MAX_REMEMBERED_CONFIRMATIONS) {
      this.deliveredElsewhere.add(delivered);
    }
    void this.refreshView(conversationId);
    // A holder that closes or crashes releases the lock silently: this tab
    // takes over when it finds the lock free (or the holder's lease ended).
    this.scheduleRetry(conversationId, LOCK_BUSY_RETRY_MS);
  };

  /**
   * Tells the other tabs the conversation's items changed (`delivered`: a key
   * removed as delivered; `deleted`: its stored message was deleted since, F8).
   */
  private announce(conversationId: string, delivered?: string, deleted = false): void {
    try {
      this.channel?.postMessage(
        delivered ? (deleted ? { conversationId, delivered, deleted: true } : { conversationId, delivered }) : { conversationId }
      );
    } catch (error) {
      this.trace('announce-failed', { error: String(error) });
    }
  }

  private drain(conversationId: string): ConversationDrain {
    let drain = this.conversations.get(conversationId);
    if (!drain) {
      drain = { running: false, rerun: false, retryTimer: null, retryDelayMs: RETRY_BASE_MS, viewSeq: 0, keys: new Set(), shown: new Map() };
      this.conversations.set(conversationId, drain);
    }
    return drain;
  }

  private markConfirmed(clientMessageId: string): void {
    this.deliveredElsewhere.delete(clientMessageId);
    this.confirmed.delete(clientMessageId);
    this.confirmed.add(clientMessageId);
    if (this.confirmed.size > MAX_REMEMBERED_CONFIRMATIONS) {
      const oldest = this.confirmed.values().next().value;
      if (oldest !== undefined) this.confirmed.delete(oldest);
    }
  }

  /** Shows every conversation's items and drains each one. */
  private async loadAll(): Promise<void> {
    let items: OutboxItem[];
    try {
      items = await listOutboxItems(this.ownerId);
    } catch (error) {
      this.trace('load-failed', { error: String(error) });
      return;
    }
    if (this.disposed) return;
    const conversationIds = new Set(items.map((item) => item.conversationId));
    this.conversations.forEach((_drain, conversationId) => conversationIds.add(conversationId));
    for (const conversationId of conversationIds) {
      this.render(conversationId, items.filter((item) => item.conversationId === conversationId));
      this.drainConversation(conversationId);
    }
  }

  /**
   * Renders the conversation's items as read from the outbox. A copy another
   * tab removed as delivered stays (as last shown) until its stored message is
   * observed here — never no bubble in any tab; a cancelled one goes at once.
   */
  private render(conversationId: string, stored: readonly OutboxItem[]): void {
    // T12: nothing is shown while "Sair mesmo" deletes the items; F2: nor
    // while the browser is signed out or signed in as another user.
    if (this.signOutStop || this.held) return;
    const drain = this.drain(conversationId);
    // F3: a retired item is delivered; its row only keeps a claim.
    const items = stored.filter((item) => !item.retired);
    const read = new Set(items.map((item) => item.clientMessageId));
    const kept = [...drain.shown.values()].filter(
      (item) => this.deliveredElsewhere.has(item.clientMessageId) && !read.has(item.clientMessageId)
    );
    const all = [...items, ...kept];
    drain.keys = new Set(all.map((item) => item.clientMessageId));
    drain.shown = new Map(all.map((item) => [item.clientMessageId, item]));
    writeOutboxView(this.queryClient, this.ownerId, conversationId, this.visible(all));
  }

  private visible(items: readonly OutboxItem[]): OutboxItem[] {
    // A copy stays until its stored message is shown (never no bubble).
    return items.filter(
      (item) => !this.confirmed.has(item.clientMessageId) || this.confirmedNotShown.has(item.clientMessageId)
    );
  }

  /** Re-reads the conversation's items and renders them (latest read wins). */
  private async refreshView(conversationId: string): Promise<void> {
    const drain = this.drain(conversationId);
    drain.viewSeq += 1;
    const seq = drain.viewSeq;
    let items: OutboxItem[];
    try {
      items = await listOutboxItems(this.ownerId, conversationId);
    } catch (error) {
      this.trace('view-read-failed', { error: String(error) });
      return;
    }
    if (this.disposed || seq !== drain.viewSeq) return;
    this.render(conversationId, items);
  }

  private drainConversation(conversationId: string): void {
    if (this.disposed) return;
    if (this.held) {
      // T11: drains again only once the owner is authenticated again (verifyOwner resumes them).
      void this.verifyOwner();
      return;
    }
    const drain = this.drain(conversationId);
    if (drain.running) {
      drain.rerun = true;
      return;
    }
    drain.running = true;
    drain.rerun = false;
    void this.withDrainLock(conversationId)
      .catch((error) => {
        this.trace('drain-failed', { error: String(error) });
        this.scheduleRetry(conversationId);
      })
      .finally(() => {
        drain.running = false;
        if (drain.rerun && !this.disposed) this.drainConversation(conversationId);
      });
  }

  /**
   * Runs the drain loop while holding the conversation's cross-tab lock (when
   * Web Locks exist). When another tab holds it and the oldest item's lease
   * has ended (a hung holder), the lock is taken over (FR-004).
   */
  private async withDrainLock(conversationId: string): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) {
      await this.drainLoop(conversationId, { lost: false, acquiredAt: Date.now(), stolen: false, supersedeEpoch: null });
      return;
    }
    const name = `${outboxDrainLockPrefix(this.ownerId)}${conversationId}`;
    if (await this.drainLocked(locks, name, { ifAvailable: true }, conversationId, null)) return;
    const takeover = await this.holderTakeover(conversationId);
    if (takeover.kind === 'lease-ended') {
      this.trace('lease-takeover', { conversationId });
      await this.drainLocked(locks, name, { steal: true }, conversationId, null);
      return;
    }
    if (takeover.kind === 'supersede') {
      this.trace('outage-supersede', { conversationId });
      await this.drainLocked(locks, name, { steal: true }, conversationId, takeover.supersedeEpoch);
      return;
    }
    this.scheduleRetry(conversationId, takeover.kind === 'grace' ? takeover.retryInMs : LOCK_BUSY_RETRY_MS);
  }

  /** Holds the lock (false when it was busy) and drains; stops once another tab took the lock over. */
  private async drainLocked(
    locks: LockManager,
    name: string,
    options: LockOptions,
    conversationId: string,
    supersedeEpoch: number | null
  ): Promise<boolean> {
    const session: DrainSession = { lost: false, acquiredAt: 0, stolen: options.steal === true, supersedeEpoch };
    const run: { loop: Promise<void> | null } = { loop: null };
    try {
      return await locks.request(name, options, async (lock) => {
        if (!lock) return false;
        session.acquiredAt = Date.now();
        run.loop = this.drainLoop(conversationId, session);
        await run.loop;
        return true;
      });
    } catch (error) {
      if (!run.loop || !isAbortError(error)) throw error;
      // The lock was taken over (this tab's lease ended): the loop dispatches nothing more.
      session.lost = true;
      await run.loop;
      return true;
    }
  }

  /**
   * Whether this tab may take the busy lock over: the conversation's oldest
   * item is claimed by another tab whose lease has ended, or (T13 #7, F3)
   * whose claim is of an older recovery epoch than the current one, once the
   * grace for a live holder to supersede or re-stamp it has passed since this
   * tab learned of that epoch (`grace`: check again then).
   */
  private async holderTakeover(conversationId: string): Promise<
    | { kind: 'none' }
    | { kind: 'lease-ended' }
    | { kind: 'supersede'; supersedeEpoch: number }
    | { kind: 'grace'; retryInMs: number }
  > {
    const [[oldest], recovery] = await Promise.all([
      listOutboxItems(this.ownerId, conversationId),
      readRecoveryState(this.ownerId),
    ]);
    const now = Date.now();
    if (oldest?.state !== 'claimed' || oldest.claimHolder === this.tabId || oldest.leaseExpiresAt === null) {
      return { kind: 'none' };
    }
    if (oldest.leaseExpiresAt <= now) return { kind: 'lease-ended' };
    if (!isOnline()) return { kind: 'none' };
    this.learnEpoch(recovery.epoch);
    if ((oldest.claimEpoch ?? 0) >= recovery.epoch) return { kind: 'none' };
    const learnedAt = this.epochSeen?.epoch === recovery.epoch ? this.epochSeen.at : now;
    const graceLeft = learnedAt + SUPERSEDE_GRACE_MS - now;
    if (graceLeft > 0) return { kind: 'grace', retryInMs: graceLeft };
    return { kind: 'supersede', supersedeEpoch: recovery.epoch };
  }

  /**
   * Block A fixes F4/F5: this drain may still start a request — not disposed,
   * not held (identity), not stopped for "Sair mesmo", and its lock not taken
   * over. Checked after every await that precedes a dispatch.
   */
  private mayDispatch(session: DrainSession): boolean {
    return !this.disposed && !this.held && !this.signOutStop && !session.lost;
  }

  private async drainLoop(conversationId: string, session: DrainSession): Promise<void> {
    // A delivered item is removed together with the next claim (one
    // transaction), or on its own when the drain stops before that. Its
    // stored message is shown right after the next create is dispatched, so
    // rendering it does not delay that create (D1).
    let confirmed: DrainConfirmation | null = null;
    let showConfirmed: (() => void) | null = null;
    const flushShow = () => {
      showConfirmed?.();
      showConfirmed = null;
    };
    try {
      while (!this.disposed && !this.held && !session.lost && isOnline()) {
        const claim = await claimOldestOutboxItem(
          this.ownerId,
          conversationId,
          this.tabId,
          CLAIM_LEASE_MS,
          session,
          confirmed,
          RETRY_MAX_MS
        );
        if (claim.kind === 'claimed' || confirmed !== null) {
          this.announce(conversationId, confirmed?.key, confirmed?.deleted);
        }
        confirmed = null;
        // Taken over meanwhile: the new holder fences whatever this claim took.
        if (session.lost) return;
        if (claim.kind !== 'claimed') {
          if (claim.kind === 'empty') this.drain(conversationId).retryDelayMs = RETRY_BASE_MS;
          if (claim.kind === 'deferred') this.scheduleRetry(conversationId, claim.retryInMs);
          // F4: another tab's live claim (it took the lock, or claimed before a steal).
          if (claim.kind === 'busy') this.scheduleRetry(conversationId, LOCK_BUSY_RETRY_MS);
          return;
        }
        const { item, previous } = claim;
        // T11 (FR-011): nothing is sent unless the browser's authenticated
        // user is the owner; the claim is then put back as it was. F4/F5: nor
        // once this drain lost its lock or was stopped during that check.
        if (!(await this.verifyOwner()) || !this.mayDispatch(session)) {
          await this.releaseUnsentClaim(item, previous);
          this.announce(conversationId);
          if (!session.lost) this.scheduleRetry(conversationId);
          return;
        }
        this.showItem(item);
        // Fenced first when an earlier attempt may be stored, or when the
        // item's 24 h window has ended (BR-006): not stored -> expired, and
        // no create is ever sent past the window without a manual retry.
        const fenceFirst =
          previous.state === 'unknown' ||
          previous.state === 'claimed' ||
          Date.now() >= item.windowStartedAt + DELIVERY_WINDOW_MS;
        const timing: DispatchTiming = { dispatchedAt: Date.now() };
        const attempt = fenceFirst ? this.fenceThenAttempt(item, session, timing) : this.attempt(item);
        flushShow();
        const outcome = await attempt;
        const answeredAt = Date.now();
        if (this.disposed) return;
        // T11 (FR-011): a response that arrives once the browser's user is no
        // longer the owner is discarded — no item, claim or view changes (the
        // claim is fenced when the owner drains again).
        if (this.held || !(await this.verifyOwner())) {
          this.scheduleRetry(conversationId);
          return;
        }
        this.trace('attempt', { conversationId, generation: item.attemptGeneration, outcome: outcome.kind });
        recordAttemptMetrics(item, outcome, timing.dispatchedAt, answeredAt);
        if (outcome.kind === 'delivered') {
          const { message } = outcome;
          this.confirmDelivered(item);
          this.confirmedNotShown.add(item.clientMessageId);
          showConfirmed = () => {
            this.confirmedNotShown.delete(item.clientMessageId);
            showConfirmedOutboxMessage(this.queryClient, this.ownerId, conversationId, item.clientMessageId, message);
          };
          // F4: removed only if no newer holder claimed it meanwhile (outbox-db).
          confirmed = { key: item.clientMessageId, generation: item.attemptGeneration, deleted: message === null };
          continue;
        }
        await this.recordUndelivered(item, outcome);
        return;
      }
    } finally {
      if (!this.disposed && !this.held) flushShow();
      if (confirmed !== null) {
        await deleteConfirmedOutboxItem(this.ownerId, confirmed.key, this.tabId, confirmed.generation);
        this.announce(conversationId, confirmed.key, confirmed.deleted);
      }
    }
  }

  /**
   * Runs one create or fence request of `item`'s claim, aborted at its
   * deadline (30 s, and never past the claim's lease) or when connectivity
   * returns (handleOnline); an aborted request rejects like a network error.
   */
  private async withDeadline<T>(
    item: OutboxItem,
    send: (signal: AbortSignal) => Promise<T>,
    deadline: RequestDeadline
  ): Promise<T> {
    const controller = new AbortController();
    const leaseLeft = (item.leaseExpiresAt ?? Number.POSITIVE_INFINITY) - Date.now();
    const timer = setTimeout(() => {
      deadline.hit = true;
      controller.abort();
    }, Math.max(0, Math.min(REQUEST_TIMEOUT_MS, leaseLeft)));
    this.inFlight.add(controller);
    try {
      return await send(controller.signal);
    } finally {
      clearTimeout(timer);
      this.inFlight.delete(controller);
    }
  }

  private async attempt(item: OutboxItem): Promise<OutboxAttemptOutcome> {
    const deadline: RequestDeadline = { hit: false };
    try {
      const response = await this.withDeadline(item, (signal) =>
        messagingApi.createMessageAttempt(
          {
            conversationId: item.conversationId,
            content: item.content,
            replyToId: item.replyToId,
            clientMessageId: item.clientMessageId,
            attemptGeneration: item.attemptGeneration,
            expectedSenderId: this.ownerId,
            mentionIds: item.mentionIds,
          },
          signal
        ),
        deadline
      );
      this.observeResponse();
      return classifyAttemptResponse(response, {
        senderId: this.ownerId,
        conversationId: item.conversationId,
        clientMessageId: item.clientMessageId,
      });
    } catch (error) {
      // No response (network error, the browser went offline mid-request, deadline).
      this.observeRequestFailure(error);
      return { kind: 'unknown', status: null, failure: requestFailure(error, deadline) };
    }
  }

  /** F3: a create/fence got a response — after a loss this tab observed, a recovery. */
  private observeResponse(): void {
    if (this.lossNoted) void this.observeRecovery('http');
  }

  /** F3: a create/fence got no response for a network reason (not this tab's own abort or deadline). */
  private observeRequestFailure(error: unknown): void {
    if (!isAbortError(error)) this.noteConnectivityLost('http');
  }

  /**
   * T27 (FR-006, FR-009, BR-005): an earlier attempt of `item` may be stored.
   * Fences the key under the item's new generation before anything else;
   * only a not-stored answer lets the item be sent, and only while it is
   * still this tab's claim and inside its delivery window, and this drain may
   * still dispatch (F4/F5: not held, stopped, or taken over meanwhile).
   */
  private async fenceThenAttempt(
    item: OutboxItem,
    session: DrainSession,
    timing: DispatchTiming
  ): Promise<OutboxAttemptOutcome> {
    let fence: OutboxFenceOutcome;
    const deadline: RequestDeadline = { hit: false };
    try {
      const response = await this.withDeadline(item, (signal) =>
        messagingApi.fenceMessageAttempt(
          {
            conversationId: item.conversationId,
            clientMessageId: item.clientMessageId,
            attemptGeneration: item.attemptGeneration,
            expectedSenderId: this.ownerId,
          },
          signal
        ),
        deadline
      );
      this.observeResponse();
      fence = classifyFenceResponse(response, {
        senderId: this.ownerId,
        conversationId: item.conversationId,
        clientMessageId: item.clientMessageId,
      });
    } catch (error) {
      this.observeRequestFailure(error);
      fence = { kind: 'unknown', status: null, failure: requestFailure(error, deadline) };
    }
    this.trace('fence', { conversationId: item.conversationId, generation: item.attemptGeneration, outcome: fence.kind });
    if (fence.kind !== 'not_stored') return fence;
    if (Date.now() >= item.windowStartedAt + DELIVERY_WINDOW_MS) return { kind: 'expired' };
    // T11 (FR-011): the create is a new dispatch; the drain discards this outcome when the owner is gone.
    if (!(await this.verifyOwner())) return { kind: 'superseded' };
    const current = await updateOutboxItem(this.ownerId, item.clientMessageId, () => undefined);
    if (
      !this.mayDispatch(session) ||
      current?.state !== 'claimed' ||
      current.claimHolder !== this.tabId ||
      current.attemptGeneration !== item.attemptGeneration
    ) {
      return { kind: 'superseded' };
    }
    // The fence's generation is now the key's current one: the create may commit under it.
    timing.dispatchedAt = Date.now();
    return this.attempt(item);
  }

  /**
   * The server confirmed the item: from now on it is never shown again as
   * pending (its stored message is shown by the drain, showConfirmedOutboxMessage).
   */
  private confirmDelivered(item: OutboxItem): void {
    const { conversationId, clientMessageId } = item;
    this.markConfirmed(clientMessageId);
    this.drain(conversationId).keys.delete(clientMessageId);
    this.drain(conversationId).retryDelayMs = RETRY_BASE_MS;
  }

  /**
   * T11: puts back a claim that sent nothing (the browser's user was not the
   * owner) — the item as it was before the claim, unless it changed since
   * (a retired mark made meanwhile is kept, F3).
   */
  private async releaseUnsentClaim(claimed: OutboxItem, previous: OutboxItem): Promise<void> {
    try {
      await updateOutboxItem(this.ownerId, claimed.clientMessageId, (stored) => {
        if (
          stored.state !== 'claimed' ||
          stored.claimHolder !== this.tabId ||
          stored.attemptGeneration !== claimed.attemptGeneration
        ) {
          return undefined;
        }
        return stored.retired ? { ...previous, retired: true } : previous;
      });
    } catch (error) {
      // Left claimed: the next drain fences it before anything is sent.
      this.trace('release-failed', { error: String(error) });
    }
  }

  /** Records an outcome other than delivered; the drain of the conversation stops. */
  private async recordUndelivered(
    item: OutboxItem,
    outcome: Exclude<OutboxAttemptOutcome, { kind: 'delivered' }>
  ): Promise<void> {
    const { conversationId, clientMessageId } = item;
    const ownAttempt = (current: OutboxItem) =>
      current.claimHolder === this.tabId && current.attemptGeneration === item.attemptGeneration;
    const now = Date.now();
    const released = { claimHolder: null, leaseExpiresAt: null, retryNotBefore: null, retryDelayMs: null, updatedAt: now };
    if (outcome.kind === 'failed' || outcome.kind === 'expired') {
      // No automatic attempt: the item waits for "Tentar de novo" / "Apagar".
      const state = outcome.kind;
      const failureReason = outcome.kind === 'failed' ? outcome.reason : null;
      // A reused key already names another stored message: the item moves to a
      // new key now, so observing that message never resolves it (FR-007).
      const rekey = failureReason === 'client_message_id_reused';
      let retiredEnded = false;
      const current = await updateOutboxItem(
        this.ownerId,
        clientMessageId,
        (stored) => {
          if (!ownAttempt(stored)) return undefined;
          // F3: its stored message was already observed: delivered, the claim ends with the item.
          if (stored.retired) {
            retiredEnded = true;
            return null;
          }
          const failed: OutboxItem = { ...stored, ...released, state, failureReason };
          return rekey ? withNewKey(failed) : failed;
        },
        rekey ? 'strict' : 'relaxed'
      );
      this.announce(conversationId);
      if (rekey || retiredEnded) {
        await this.refreshView(conversationId);
      } else {
        await this.showStored(conversationId, current);
      }
      // The later items of the conversation are not held behind a delivered item.
      if (retiredEnded) this.scheduleRetry(conversationId, RETRY_BASE_MS);
      return;
    }
    if (outcome.kind === 'transient') {
      // Waiting again, claimable by any tab only after the backoff (FR-008).
      let delayMs = RETRY_BASE_MS;
      const current = await updateOutboxItem(this.ownerId, clientMessageId, (stored) => {
        if (!ownAttempt(stored)) return undefined;
        const previous = stored.retryDelayMs;
        delayMs = typeof previous === 'number' && previous > 0 ? Math.min(previous * 2, RETRY_MAX_MS) : RETRY_BASE_MS;
        return { ...stored, ...released, state: 'waiting', retryNotBefore: now + delayMs, retryDelayMs: delayMs };
      });
      this.announce(conversationId);
      await this.showStored(conversationId, current);
      this.scheduleRetry(conversationId, delayMs);
      return;
    }
    // unknown / superseded → unknown (it may be stored).
    const current = await updateOutboxItem(this.ownerId, clientMessageId, (stored) =>
      ownAttempt(stored) ? { ...stored, ...released, state: 'unknown' } : undefined
    );
    this.announce(conversationId);
    await this.showStored(conversationId, current);
    this.scheduleRetry(conversationId);
  }

  /**
   * Shows `item` as just read or written by this tab, without reading the
   * outbox again (unless it was confirmed meanwhile). An older re-read still
   * in flight is superseded, so it cannot put back a previous state.
   */
  private showItem(item: OutboxItem): void {
    if (this.disposed || this.signOutStop || this.held || this.confirmed.has(item.clientMessageId)) return;
    const drain = this.drain(item.conversationId);
    drain.viewSeq += 1;
    drain.keys.add(item.clientMessageId);
    drain.shown.set(item.clientMessageId, item);
    publishOutboxItem(this.queryClient, item);
  }

  /** Shows the item's stored state after an update; re-reads when it is gone. */
  private async showStored(conversationId: string, item: OutboxItem | null): Promise<void> {
    if (item) {
      this.showItem(item);
    } else {
      await this.refreshView(conversationId);
    }
  }

  private scheduleRetry(conversationId: string, delayMs?: number): void {
    if (this.disposed || this.held) return;
    const drain = this.drain(conversationId);
    if (drain.retryTimer) return;
    const delay = delayMs ?? drain.retryDelayMs;
    if (delayMs === undefined) drain.retryDelayMs = Math.min(drain.retryDelayMs * 2, RETRY_MAX_MS);
    drain.retryTimer = setTimeout(() => {
      drain.retryTimer = null;
      this.drainConversation(conversationId);
    }, delay);
  }

  private trace(event: string, details: Record<string, unknown>): void {
    if (debugLogger.messaging.enabled()) {
      debugLogger.messaging.event(SCOPE, event, details);
    }
  }
}
