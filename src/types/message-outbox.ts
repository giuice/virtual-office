// src/types/message-outbox.ts
// Phase 5 T8 (FR-001..FR-003, BR-001..BR-003; SPEC §9 data outputs): one
// item of the browser's durable message outbox (IndexedDB), per application
// user (users.id) and browser.

/**
 * Item state (SPEC §9):
 * - `waiting`: stored, never dispatched or back to waiting after a transient
 *   outcome (browser offline, 429, 401);
 * - `claimed`: a tab holds it and its create request (generation
 *   `attemptGeneration`) may be in progress;
 * - `unknown`: an attempt ended without a usable response (network error,
 *   5xx, a superseded claim) — it may or may not be stored;
 * - `failed`: definitively rejected (`failureReason`); no automatic attempt,
 *   later items of the conversation wait (BR-003);
 * - `expired`: fenced as not stored after its 24 h delivery window (BR-006).
 */
export type OutboxItemState = 'waiting' | 'claimed' | 'unknown' | 'failed' | 'expired';

/** Why a `failed` item was rejected (BR-005 definitive classes). */
export type OutboxFailureReason =
  | 'not_participant'
  | 'sender_mismatch'
  | 'client_message_id_reused'
  | 'content_too_large'
  | 'invalid_request'
  | 'rejected';

/**
 * A text or reply message the user pressed send on (BR-002: never files or
 * voice). Written before it is dispatched; removed once the server confirmed
 * it (create response, or its stored key observed in the feed or Realtime).
 * Absence therefore means delivered, cancelled ("Cancelar") or deleted ("Apagar").
 */
export interface OutboxItem {
  /** Owner: the application user (users.id), never the Supabase auth uid. */
  ownerId: string;
  /** Stable composition key, lowercase UUID; every attempt reuses it (BR-004). */
  clientMessageId: string;
  conversationId: string;
  /** Trimmed text as sent. */
  content: string;
  replyToId: string | null;
  /** Requested mentions (users.id), resent unchanged on every attempt. */
  mentionIds: string[];
  /** When the user pressed send (epoch ms); kept across manual retries. */
  pressedSendAt: number;
  /** Start of the current 24 h delivery window (epoch ms; BR-006). */
  windowStartedAt: number;
  /** Per-owner creation order shared by every tab of the browser. */
  order: number;
  state: OutboxItemState;
  /** Set only when `state` is `failed`. */
  failureReason: OutboxFailureReason | null;
  /** Last dispatched generation (0 = never dispatched); monotonic per key. */
  attemptGeneration: number;
  /** Tab that claimed the item (cross-tab ownership, T10). */
  claimHolder: string | null;
  /** When that claim's lease ends (epoch ms; enforced by T10). */
  leaseExpiresAt: number | null;
  /**
   * T9 (FR-008): after a transient rejection (429, 401 with a valid session)
   * the earliest time (epoch ms) any tab may claim the item again, so the
   * backoff holds across the user's tabs. Absent or null: not deferred.
   */
  retryNotBefore?: number | null;
  /** T9: backoff (ms) of the last transient rejection; doubles on each consecutive one. */
  retryDelayMs?: number | null;
  /**
   * Block A fix F3: its stored message was already observed while a live
   * holder still claimed it. The item is delivered (never shown, counted or
   * sent again) but its row keeps the claim and lease, so the holder's lease
   * can still end and let another tab take the conversation over; the holder
   * (or the tab that takes over) removes it. Absent: not retired.
   */
  retired?: boolean;
  /**
   * Block B fix F3 (FR-004): the owner's shared recovery epoch (outbox-db)
   * under which the current claim was made — or re-stamped by its live holder
   * after a recovery. A live claim of an older epoch is a pre-outage attempt
   * another tab may supersede; absent: 0.
   */
  claimEpoch?: number;
  updatedAt: number;
  /** Item schema version (1). */
  schemaVersion: number;
}

/** What the composer hands to the outbox for one send. */
export interface OutboxEnqueueInput {
  conversationId: string;
  clientMessageId: string;
  content: string;
  replyToId?: string | null;
  /**
   * Conversation of the reply target when the caller knows it (the selected
   * message's). A different one than `conversationId` is refused before
   * anything is stored; an unknown one is left to the server.
   */
  replyToConversationId?: string | null;
  mentionIds?: readonly string[];
}
