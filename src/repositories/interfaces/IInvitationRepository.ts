// src/repositories/interfaces/IInvitationRepository.ts
import { Invitation } from '@/types/database';

export interface IInvitationRepository {
  /**
   * Finds an invitation by its unique token.
   * @param token The unique token identifying the invitation.
   * @returns A promise that resolves to the Invitation object or null if not found.
   */
  findByToken(token: string): Promise<Invitation | null>;

  /**
   * Creates a new invitation.
   * @param invitationData Data for the new invitation, excluding createdAt and status (which are typically managed by the implementation).
   * @returns A promise that resolves to the newly created Invitation object.
   */
  create(invitationData: Omit<Invitation, 'id' | 'createdAt' | 'status'>): Promise<Invitation>;

  /**
   * Updates the status of an existing invitation.
   * @param token The unique token of the invitation to update.
   * @param status The new status for the invitation.
   * @returns A promise that resolves to the updated Invitation object or null if not found or update failed.
   */
  updateStatus(token: string, status: Invitation['status']): Promise<Invitation | null>;

  /**
   * Deletes an invitation by its unique token.
   * (Optional, implement if needed for cleanup or revocation)
   * @param token The unique token of the invitation to delete.
   * @returns A promise that resolves to true if deletion was successful, false otherwise.
   */
  // deleteByToken(token: string): Promise<boolean>;

  // Add other methods as needed, e.g., findByEmail, findByCompany, listPending, etc.
}