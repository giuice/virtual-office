// src/repositories/interfaces/ISpaceReservationRepository.ts
import { Reservation } from '@/types/database';
import { PaginationOptions, PaginatedResult } from '@/types/common';

export interface ISpaceReservationRepository {
  /**
   * Finds a reservation by its unique identifier.
   * @param id The unique ID of the reservation.
   * @returns A promise that resolves to the Reservation object or null if not found.
   */
  findById(id: string): Promise<Reservation | null>;

  /**
   * Finds all reservations for a specific space.
   * @param spaceId The unique ID of the space.
   * @param options Optional pagination parameters.
   * @returns A promise that resolves to a paginated list of Reservation objects.
   */
  findBySpace(spaceId: string, options?: PaginationOptions): Promise<PaginatedResult<Reservation>>;

  /**
   * Finds all reservations made by a specific user.
   * @param userId The unique ID of the user.
   * @param options Optional pagination parameters.
   * @returns A promise that resolves to a paginated list of Reservation objects.
   */
  findByUser(userId: string, options?: PaginationOptions): Promise<PaginatedResult<Reservation>>;

  /**
   * Creates a new reservation.
   * @param reservationData Data for the new reservation, excluding id and createdAt.
   * @returns A promise that resolves to the newly created Reservation object.
   */
  create(reservationData: Omit<Reservation, 'id' | 'createdAt'>): Promise<Reservation>;

  /**
   * Updates an existing reservation.
   * @param id The unique ID of the reservation to update.
   * @param updates An object containing the fields to update.
   * @returns A promise that resolves to the updated Reservation object or null if not found.
   */
  update(id: string, updates: Partial<Omit<Reservation, 'id' | 'createdAt'>>): Promise<Reservation | null>;

  /**
   * Deletes a reservation by its unique identifier.
   * @param id The unique ID of the reservation to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  deleteById(id: string): Promise<boolean>;

  /**
   * Checks if a space is available during a specific time period.
   * @param spaceId The unique ID of the space.
   * @param startTime The start time of the period to check.
   * @param endTime The end time of the period to check.
   * @returns A promise that resolves to true if the space is available, false otherwise.
   */
  isSpaceAvailable(spaceId: string, startTime: string, endTime: string): Promise<boolean>;
}