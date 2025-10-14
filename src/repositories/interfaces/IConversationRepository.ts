// src/repositories/interfaces/IConversationRepository.ts
import { Conversation, ConversationType, ConversationPreferences, GroupedConversations, UnreadSummary } from '@/types/messaging';
import { PaginationOptions, PaginatedResult } from '@/types/common';

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
   * Marks a conversation as read for a specific user by setting their unread count to 0.
   * @param id The unique ID of the conversation.
   * @param userId The unique ID of the user for whom the conversation should be marked as read.
   * @returns A promise that resolves to true if the operation was successful, false otherwise.
   */
  markAsRead(id: string, userId: string): Promise<boolean>;

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
   * Increments the unread count for specified participants in a conversation.
   * Should typically be called when a new message is added.
   * @param id The unique ID of the conversation.
   * @param userIdsToIncrement An array of user IDs whose unread count should be incremented.
   * @returns A promise that resolves to true if the operation was successful, false otherwise.
   */
  incrementUnreadCount(id: string, userIdsToIncrement: string[]): Promise<boolean>;

  // Add other methods as needed, e.g., findByParticipants, addParticipant, removeParticipant

  /**
   * Adds a participant (by database user ID) to a conversation's participants list.
   * No-op if the user is already a participant.
   */
  addParticipant(id: string, userId: string): Promise<Conversation | null>;

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
   * Sets or updates per-user conversation preferences (pin, star, archive, notifications).
   * Creates a new preferences record if none exists for this user/conversation pair.
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
   * Finds conversations for a user, grouped by type (direct vs rooms).
   * Optionally includes archived conversations and respects per-user archive preferences.
   * @param userId The unique ID of the user.
   * @param options Optional parameters for filtering (includeArchived).
   * @returns A promise that resolves to a GroupedConversations object with direct and room arrays.
   */
  findByUserGrouped(
    userId: string,
    options?: { includeArchived?: boolean }
  ): Promise<GroupedConversations>;

  /**
   * Finds conversations pinned by a specific user, ordered by pinned_order.
   * @param userId The unique ID of the user.
   * @returns A promise that resolves to an array of pinned Conversation objects in user-defined order.
   */
  findPinnedByUser(userId: string): Promise<Conversation[]>;

  /**
   * Gets aggregated unread counts for a user, broken down by conversation type.
   * @param userId The unique ID of the user.
   * @returns A promise that resolves to an UnreadSummary object with total, direct, and room unread counts.
   */
  getUnreadSummary(userId: string): Promise<UnreadSummary>;
}
