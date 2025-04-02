// src/repositories/interfaces/IMeetingNoteActionItemRepository.ts
import { ActionItem, TimeStampType } from '@/types/database';

// Define a type that includes the database ID and foreign key
export interface ActionItemRecord extends ActionItem {
  id: string;
  noteId: string;
  createdAt: TimeStampType; // Assuming DB has this, adjust if not
}

export interface IMeetingNoteActionItemRepository {
  /**
   * Finds all action items associated with a specific meeting note.
   * @param noteId - The ID of the meeting note.
   * @returns A promise that resolves to an array of action items.
   */
  findByNoteId(noteId: string): Promise<ActionItemRecord[]>;

  /**
   * Creates a new action item for a specific meeting note.
   * @param noteId - The ID of the meeting note to associate with.
   * @param actionItemData - The data for the new action item (excluding id, noteId, createdAt).
   * @returns A promise that resolves to the newly created action item record.
   */
  create(noteId: string, actionItemData: Omit<ActionItemRecord, 'id' | 'noteId' | 'createdAt'>): Promise<ActionItemRecord>;

  /**
   * Updates an existing action item.
   * @param id - The ID of the action item to update.
   * @param updates - The partial data to update.
   * @returns A promise that resolves to the updated action item record, or null if not found.
   */
  update(id: string, updates: Partial<Omit<ActionItemRecord, 'id' | 'noteId' | 'createdAt'>>): Promise<ActionItemRecord | null>;

  /**
   * Deletes an action item by its ID.
   * @param id - The ID of the action item to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteById(id: string): Promise<boolean>;

  /**
   * Deletes all action items associated with a specific meeting note.
   * @param noteId - The ID of the meeting note whose action items should be deleted.
   * @returns A promise that resolves to the number of items deleted.
   */
  deleteByNoteId(noteId: string): Promise<number>;
}
