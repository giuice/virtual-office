// src/repositories/interfaces/ISpaceRepository.ts
import { Space } from '@/types/database';
import { PaginationOptions } from '@/types/common';

export interface ISpaceRepository {
  /**
   * Finds a space by its unique identifier.
   * @param id The unique ID of the space.
   * @returns A promise that resolves to the Space object or null if not found.
   */
  findById(id: string): Promise<Space | null>;

  /**
   * Finds all spaces belonging to a specific company.
   * @param companyId The unique ID of the company.
   * @param options Optional pagination parameters.
   * @returns A promise that resolves to an array of Space objects.
   */
  findByCompany(companyId: string, options?: PaginationOptions): Promise<Space[]>;

  /**
   * Creates a new space.
   * @param spaceData Data for the new space, excluding id, createdAt, and updatedAt.
   * @returns A promise that resolves to the newly created Space object.
   */
  create(spaceData: Omit<Space, 'id' | 'createdAt' | 'updatedAt'>): Promise<Space>;

  /**
   * Updates an existing space.
   * @param id The unique ID of the space to update.
   * @param updates An object containing the fields to update (excluding id, createdAt). updatedAt will be handled by the implementation.
   * @returns A promise that resolves to the updated Space object or null if not found.
   */
  update(id: string, updates: Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Space | null>;


  /**
   * Deletes a space by its unique identifier.
   * @param id The unique ID of the space to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteById(id: string): Promise<boolean>;

  // Add other methods as needed, e.g., findByType, findByName, etc.
}