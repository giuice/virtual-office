// src/repositories/interfaces/IConversationRepository.ts
import { Conversation, ConversationMember, ConversationType, ConversationPreferences } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';

/** Refusal codes of public.join_room_conversation (Phase 5 T28). */
export type ConversationMembershipErrorCode =
  | 'CONVERSATION_NOT_FOUND'
  | 'ROOM_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'JOIN_FORBIDDEN'
  | 'MEMBERSHIP_REVOKED'
  | 'ROOM_ACCESS_DENIED';

/** The database refused a membership grant (join/rejoin) with `code`. */
export class ConversationMembershipError extends Error {
  readonly code: ConversationMembershipErrorCode;

  constructor(code: ConversationMembershipErrorCode) {
    super(code);
    this.name = 'ConversationMembershipError';
    this.code = code;
  }

  /** 404 for a missing conversation, room or user; 403 for every refusal. */
  get status(): 403 | 404 {
    return this.code === 'CONVERSATION_NOT_FOUND' || this.code === 'ROOM_NOT_FOUND' || this.code === 'USER_NOT_FOUND'
      ? 404
      : 403;
  }
}

export interface IConversationRepository {
  /**
   * Finds a conversation by its unique identifier.
   * @param id The unique ID of the conversation.
   * @returns A promise that resolves to the Conversation object or null if not found.
   */
  findById(id: string): Promise<Conversation | null>;

  /**
   * Finds conversations involving a specific user, with pagination.
   * @param userId The unique ID of the user.
   * @param options Optional pagination parameters.
   * @returns A promise that resolves to a paginated list of Conversation objects.
   */
  findByUser(
    userId: string,
    options?: PaginationOptions & { type?: ConversationType; includeArchived?: boolean }
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Creates a new conversation.
   * @param conversationData Data for the new conversation, typically participants. Excludes managed fields like id, timestamps, unreadCount.
   * @returns A promise that resolves to the newly created Conversation object.
   */
  create(conversationData: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageTimestamp' | 'unreadCount'> & {
    participantsFingerprint?: string;
  }): Promise<Conversation>;

  /**
   * Updates general properties of an existing conversation (e.g., title).
   * @param id The unique ID of the conversation to update.
   * @param updates An object containing the fields to update (e.g., { name: 'New Name' }). Excludes managed fields.
   * @returns A promise that resolves to the updated Conversation object or null if not found.
   */
  update(id: string, updates: Partial<Pick<Conversation, 'name' /* add other updatable fields if any */ >>): Promise<Conversation | null>;

  /**
   * Deletes a conversation by its unique identifier.
   * @param id The unique ID of the conversation to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteById(id: string): Promise<boolean>;

  /**
   * Sets the global archive status for a conversation.
   * @param id The unique ID of the conversation.
   * @param isArchived The desired archive status.
   * @returns A promise that resolves to the updated Conversation object or null if not found.
   */
  setArchiveStatus(id: string, isArchived: boolean): Promise<Conversation | null>;

  /**
   * Marks a conversation as read for a specific user: sets their
   * conversation_members.last_read_at cursor and writes per-message read
   * receipts atomically (mark_conversation_read RPC). Requires a
   * service-role client; callers must authorize the user first.
   * @param id The unique ID of the conversation.
   * @param userId The DB user ID (users.id) marking the conversation read.
   * @returns A promise that resolves to true if the operation was successful, false otherwise.
   * @throws NotParticipantError when the user has no membership row (Phase 5 T28).
   */
  markConversationRead(id: string, userId: string): Promise<boolean>;

  /**
   * Records read receipts for the given visible message ids of a conversation
   * (mark_messages_read RPC): ids outside the conversation and the user's own
   * messages are ignored; repeats are idempotent; last_read_at is not moved.
   * Requires a service-role client; callers must authorize the user first.
   * @param id The unique ID of the conversation.
   * @param userId The DB user ID (users.id) who saw the messages.
   * @param messageIds Visible message ids (at most 100 per call; the RPC rejects more).
   * @returns The number of receipts newly recorded.
   * @throws NotParticipantError when the user has no membership row (Phase 5 T28).
   */
  markMessagesRead(id: string, userId: string, messageIds: readonly string[]): Promise<number>;

   /**
   * Updates the timestamp of the last message in the conversation.
   * Should typically be called when a new message is added.
   * @param id The unique ID of the conversation.
   * Updates the last activity timestamp of the conversation.
   * Should typically be called when a new message is added or activity occurs.
   * @param id The unique ID of the conversation.
   * @param timestamp Optional ISO timestamp string. Defaults to current time if omitted.
   * @returns A promise that resolves to the updated Conversation object or null if not found.
   */
   updateLastActivityTimestamp(id: string, timestamp?: string): Promise<Conversation | null>;

  /**
   * Phase 5 T28: joins (or confirms) `userId` as a member of the ROOM
   * conversation `id` through public.join_room_conversation, which re-checks
   * the room's access rules and the user's revocations under row locks when
   * the membership is written. Requires a service-role client; callers must
   * authenticate the user first. Resolves true when a membership was created,
   * false when the user already was a member; throws ConversationMembershipError
   * for a refusal.
   */
  joinRoomConversation(id: string, userId: string): Promise<boolean>;

  /**
   * Finds a direct conversation by the sorted participant fingerprint.
   */
  findDirectByFingerprint(fingerprint: string): Promise<Conversation | null>;

  /**
   * Finds a room conversation by the associated room identifier.
   */
  findRoomByRoomId(roomId: string): Promise<Conversation | null>;

  // ============================================================================
  // NEW METHODS: Per-user Conversation Preferences (Task 1.2)
  // ============================================================================

  /**
   * Updates per-user conversation preferences (pin, star, archive,
   * notifications) of an EXISTING membership. Never creates one (Phase 5 T28):
   * throws NotParticipantError when the user has no membership row (e.g. it was
   * removed after the caller authorized the request).
   * @param conversationId The unique ID of the conversation.
   * @param userId The unique ID of the user.
   * @param preferences Partial preferences to set or update.
   * @returns A promise that resolves to the updated ConversationPreferences object.
   */
  setUserPreference(
    conversationId: string,
    userId: string,
    preferences: Partial<Omit<ConversationPreferences, 'id' | 'conversationId' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ConversationPreferences>;

  /**
   * Gets per-user conversation preferences for a specific user and conversation.
   * @param conversationId The unique ID of the conversation.
   * @param userId The unique ID of the user.
   * @returns A promise that resolves to the ConversationPreferences object or null if not found.
   */
  getUserPreference(conversationId: string, userId: string): Promise<ConversationPreferences | null>;

  /**
   * Finds conversations pinned by a specific user, ordered by pinned_order.
   * @param userId The unique ID of the user.
   * @returns A promise that resolves to an array of pinned Conversation objects in user-defined order.
   */
  findPinnedByUser(userId: string): Promise<Conversation[]>;

  /**
   * Phase 5 T4 (FR-023): the conversation's current members
   * (conversation_members: removed members are excluded) with display name and
   * avatar. Use the user-scoped client: the database answers only a caller who
   * is a current member and throws NotParticipantError otherwise.
   */
  listMembers(conversationId: string): Promise<ConversationMember[]>;
}
