// src/repositories/interfaces/IMeetingNoteRepository.ts
import { MeetingNote, ActionItem } from '@/types/database';
import { PaginationOptions, PaginatedResult } from '@/types/common';

export interface IMeetingNoteRepository {
  /**
   * Finds a meeting note by its unique identifier.
   * @param id The unique ID of the meeting note.
   * @returns A promise that resolves to the MeetingNote object or null if not found.
   */
  findById(id: string): Promise<MeetingNote | null>;

  /**
   * Finds meeting notes for a specific room, usually ordered by meeting date descending.
   * @param roomId The unique ID of the room (or space).
   * @param options Optional pagination and sorting parameters.
   * @returns A promise that resolves to a paginated list of MeetingNote objects.
   */
  findByRoom(roomId: string, options?: PaginationOptions): Promise<PaginatedResult<MeetingNote>>;

  /**
   * Creates a new meeting note.
   * @param noteData Data for the new meeting note, excluding id, createdAt, and updatedAt.
   * @returns A promise that resolves to the newly created MeetingNote object.
   */
  create(noteData: Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<MeetingNote>;

  /**
   * Updates an existing meeting note.
   * @param id The unique ID of the meeting note to update.
   * @param updates An object containing the fields to update (e.g., title, content, actionItems). Excludes id, createdAt. updatedAt handled by implementation.
   * @returns A promise that resolves to the updated MeetingNote object or null if not found.
   */
  update(id: string, updates: Partial<Omit<MeetingNote, 'id' | 'createdAt' | 'updatedAt'>>): Promise<MeetingNote | null>;

  /**
   * Deletes a meeting note by its unique identifier.
   * @param id The unique ID of the meeting note to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteById(id: string): Promise<boolean>;

  // Potentially add methods for managing ActionItems if not handled within update,
  // e.g., addActionItem, updateActionItemStatus, etc.
  // For now, assume actionItems array is updated via the main update method.
}