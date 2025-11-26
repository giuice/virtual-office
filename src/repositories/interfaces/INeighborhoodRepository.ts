// src/repositories/interfaces/INeighborhoodRepository.ts
import { Neighborhood, CreateNeighborhoodData, UpdateNeighborhoodData } from '@/types/database';

export interface INeighborhoodRepository {
  /**
   * Finds all neighborhoods belonging to a specific company.
   * @param companyId The unique ID of the company.
   * @returns A promise that resolves to an array of Neighborhood objects.
   */
  getByCompanyId(companyId: string): Promise<Neighborhood[]>;

  /**
   * Finds a neighborhood by its unique identifier.
   * @param id The unique ID of the neighborhood.
   * @returns A promise that resolves to the Neighborhood object or null if not found.
   */
  getById(id: string): Promise<Neighborhood | null>;

  /**
   * Creates a new neighborhood.
   * @param companyId The ID of the company this neighborhood belongs to.
   * @param data Data for the new neighborhood.
   * @returns A promise that resolves to the newly created Neighborhood object.
   */
  create(companyId: string, data: CreateNeighborhoodData): Promise<Neighborhood>;

  /**
   * Updates an existing neighborhood.
   * @param id The unique ID of the neighborhood to update.
   * @param data An object containing the fields to update.
   * @returns A promise that resolves to the updated Neighborhood object or null if not found.
   */
  update(id: string, data: UpdateNeighborhoodData): Promise<Neighborhood | null>;

  /**
   * Deletes a neighborhood by its unique identifier.
   * Spaces assigned to this neighborhood will have their neighborhood_id set to NULL.
   * @param id The unique ID of the neighborhood to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  delete(id: string): Promise<boolean>;

  /**
   * Gets the count of spaces assigned to a neighborhood.
   * @param neighborhoodId The unique ID of the neighborhood.
   * @returns A promise that resolves to the count of spaces.
   */
  getSpaceCount(neighborhoodId: string): Promise<number>;
}
