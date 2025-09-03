// src/utils/user-type-adapters.ts
/**
 * User Type Adapters
 * 
 * This utility provides functions to convert between different user representations:
 * - Database User (from database.ts)
 * - UIUser (from ui.ts)
 * - UserPresenceData (from realtime presence)
 */

import { User, UserPresenceData, UserStatus, UIUserStatus } from '@/types/database';
import { UIUser } from '@/types/ui';

/**
 * Maps database UserStatus to UIUserStatus
 */
export function mapUserStatusToUIStatus(status: UserStatus): UIUserStatus {
  switch (status) {
    case 'online':
      return 'active';
    case 'away':
      return 'away';
    case 'busy':
      return 'presenting'; // Using 'presenting' for busy status
    case 'offline':
      return 'viewing'; // Default UI status for offline
    default:
      return 'viewing'; // Default fallback
  }
}

/**
 * Maps UIUserStatus to database UserStatus
 */
export function mapUIStatusToUserStatus(status: UIUserStatus): UserStatus {
  switch (status) {
    case 'active':
      return 'online';
    case 'away':
      return 'away';
    case 'presenting':
      return 'busy';
    case 'viewing':
      return 'offline';
    default:
      return 'offline'; // Default fallback
  }
}

/**
 * Converts a database User to a UIUser
 */
export function dbUserToUIUser(user: User): UIUser {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || '',
    status: mapUserStatusToUIStatus(user.status),
    statusMessage: user.statusMessage || '',
    
  };
}

/**
 * Converts UserPresenceData to UIUser
 */
export function presenceDataToUIUser(presenceData: UserPresenceData): UIUser {
  return {
    id: presenceData.id,
    displayName: presenceData.displayName,
    avatarUrl: presenceData.avatarUrl || '',
    status: presenceData.status ? mapUserStatusToUIStatus(presenceData.status) : 'viewing',
    statusMessage: '',
  };
}

/**
 * Converts a UIUser to a partial database User
 * (useful for updates)
 */
export function uiUserToPartialDbUser(uiUser: UIUser): Partial<User> {
  return {
    displayName: uiUser.displayName || uiUser.displayName,
    avatarUrl: uiUser.avatarUrl || uiUser.avatarUrl || null || undefined,
    status: mapUIStatusToUserStatus(uiUser.status),
    statusMessage: uiUser.statusMessage || uiUser.statusMessage
  };
}
