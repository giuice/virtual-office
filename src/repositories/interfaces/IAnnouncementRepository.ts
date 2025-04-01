// src/repositories/interfaces/IAnnouncementRepository.ts
import { Announcement } from '@/types/database';
import { PaginationOptions, PaginatedResult } from '@/types/common';

export interface IAnnouncementRepository {
  /**
   * Finds an announcement by its unique identifier.
   * @param id The unique ID of the announcement.
   * @returns A promise that resolves to the Announcement object or null if not found.
   */
  findById(id: string): Promise<Announcement | null>;

  /**
   * Finds announcements for a specific company, usually ordered by timestamp descending.
   * @param companyId The unique ID of the company.
   * @param options Optional pagination and sorting parameters.
   * @returns A promise that resolves to a paginated list of Announcement objects.
   */
  findByCompany(companyId: string, options?: PaginationOptions): Promise<PaginatedResult<Announcement>>;

  /**
   * Creates a new announcement.
   * @param announcementData Data for the new announcement, excluding id and timestamp.
   * @returns A promise that resolves to the newly created Announcement object.
   */
  create(announcementData: Omit<Announcement, 'id' | 'timestamp'>): Promise<Announcement>;

  /**
   * Updates an existing announcement.
   * @param id The unique ID of the announcement to update.
   * @param updates An object containing the fields to update (e.g., content, level).
   * @returns A promise that resolves to the updated Announcement object or null if not found.
   */
  update(id: string, updates: Partial<Omit<Announcement, 'id' | 'timestamp' | 'companyId' | 'userId'>>): Promise<Announcement | null>;

  /**
   * Deletes an announcement by its unique identifier.
   * @param id The unique ID of the announcement to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteById(id: string): Promise<boolean>;

  // Add other methods as needed, e.g., findByUser, findByLevel, etc.
}