// src/lib/type-adapters.ts
import { Space, User, Reservation, AccessControl, Position } from '@/types/database';
import { UIUser } from '@/types/ui';

/**
 * Utility functions to convert between database types and UI types
 * This helps bridge the gap between your database models and UI components
 */

/**
 * Convert a database User to a UI User
 */
export function dbUserToUIUser(dbUser: User): UIUser {
  return {
    id: parseInt(dbUser.id, 10) || Math.floor(Math.random() * 10000), // Fallback to random ID if parsing fails
    name: dbUser.displayName,
    avatar: dbUser.avatarUrl || '',
    status: dbUser.status === 'online' ? 'active' : 
           dbUser.status === 'away' ? 'away' : 
           dbUser.status === 'busy' ? 'presenting' : 'viewing',
    activity: dbUser.statusMessage || ''
  };
}

/**
 * Convert a database Space to a UI-friendly Space with UIUsers
 * This is needed because the floor plan component expects users array instead of userIds
 */
export function dbSpaceToUISpace(dbSpace: Space, allUsers: User[] = []): Space & { users: UIUser[] } {
  // Find users that match the userIds in the space
  const users = dbSpace.userIds
    .map(userId => allUsers.find(u => u.id === userId))
    .filter(Boolean) // Remove undefined values
    .map(dbUser => dbUserToUIUser(dbUser!));

  return {
    ...dbSpace,
    users // Add the converted UIUser objects
  };
}

/**
 * Convert reservation dates from string to Date objects
 */
export function normalizeReservation(reservation: Reservation): Reservation {
  return {
    ...reservation,
    startTime: typeof reservation.startTime === 'string' ? new Date(reservation.startTime) : reservation.startTime,
    endTime: typeof reservation.endTime === 'string' ? new Date(reservation.endTime) : reservation.endTime
  };
}