// src/repositories/interfaces/ICompanyRepository.ts
import { Company } from '@/types/database';

export interface ICompanyRepository {
  /**
   * Finds a company by its unique identifier.
   * @param id The unique ID of the company.
   * @returns A promise that resolves to the Company object or null if not found.
   */
  findById(id: string): Promise<Company | null>;

  /**
   * Creates a new company.
   * @param companyData Data for the new company, excluding id and createdAt.
   * @returns A promise that resolves to the newly created Company object.
   */
  create(companyData: Omit<Company, 'id' | 'createdAt'>): Promise<Company>;

  /**
   * Updates an existing company.
   * @param id The unique ID of the company to update.
   * @param updates An object containing the fields to update.
   * @returns A promise that resolves to the updated Company object or null if not found.
   */
  update(id: string, updates: Partial<Omit<Company, 'id' | 'createdAt'>>): Promise<Company | null>;

  /**
   * Deletes a company by its unique identifier.
   * @param id The unique ID of the company to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteById(id: string): Promise<boolean>;

  // Add other methods as needed, e.g., findByName, listAll, etc.
}