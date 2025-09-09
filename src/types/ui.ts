// src/types/ui.ts
import { SpaceType, UIUserStatus, User, UserStatus } from './database';



/**
 * UI-specific interfaces and types that don't directly map to database entities
 */

// UI-specific user representation (aligned with database User interface)
export interface UIUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null; // Match database User nullability
  status: UserStatus;
  statusMessage?: string;
  // Optional fields for UI-specific features
  current_space_id?: string | null;
  role?: 'admin' | 'member';
}

// UI-specific announcement format
export interface UIAnnouncement {
  id: number;
  author: string;
  role: string;
  avatar: string;
  message: string;
  time: string;
}

// Theme-aware space colors using CSS variables
export const spaceColors = {
  workspace: { 
    color: 'hsl(var(--success))', 
    lightColor: 'hsl(var(--success) / 0.15)' // Green with transparency
  },
  conference: { 
    color: 'hsl(var(--primary))', 
    lightColor: 'hsl(var(--primary) / 0.15)' // Primary color with transparency
  },
  social: { 
    color: 'hsl(var(--warning))', 
    lightColor: 'hsl(var(--warning) / 0.15)' // Warning color with transparency
  },
  breakout: { 
    color: 'hsl(var(--secondary))', 
    lightColor: 'hsl(var(--secondary) / 0.15)' // Secondary color with transparency
  },
  private_office: {
    color: 'hsl(var(--destructive))',
    lightColor: 'hsl(var(--destructive) / 0.15)' // Red with transparency
  },
  open_space: {
    color: 'hsl(var(--accent))',
    lightColor: 'hsl(var(--accent) / 0.15)' // Accent color with transparency
  },
  lounge: {
    color: 'hsl(var(--popover))',
    lightColor: 'hsl(var(--popover) / 0.15)' // Popover color with transparency
  },
  lab: {
    color: 'hsl(var(--card))',
    lightColor: 'hsl(var(--card) / 0.15)' // Card color with transparency
  },
  default: { 
    color: 'hsl(var(--muted-foreground))', 
    lightColor: 'hsl(var(--muted) / 0.5)' // Muted color with transparency
  }
};

// Theme-aware user status colors
export const userStatusColors = {
  viewing: 'hsl(var(--primary))',    // Primary color
  online: 'hsl(var(--success))',        // Success/green
  away: 'hsl(var(--warning))',          // Warning/amber
  busy: 'hsl(var(--secondary))',     // Secondary color
  offline: 'hsl(var(--muted-foreground))' // Muted foreground
};

// Type utilities for user type consolidation

// Convert database User to UIUser
export function dbUserToUIUser(user: User): UIUser {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    statusMessage: user.statusMessage,
    current_space_id: user.currentSpaceId,
    role: user.role,
  };
}

// Convert UIUser to partial User data (for updates)
export function uiUserToDbUser(uiUser: UIUser): Partial<User> {
  return {
    id: uiUser.id,
    displayName: uiUser.displayName,
    avatarUrl: uiUser.avatarUrl || null || undefined,
    statusMessage: uiUser.statusMessage,
    currentSpaceId: uiUser.current_space_id,
    role: uiUser.role,
  };
}

// Convert database UserStatus to UIUserStatus
function convertUserStatusToUIStatus(status: 'online' | 'away' | 'busy' | 'offline'): UIUserStatus {
  switch (status) {
    case 'online': return 'active';
    case 'away': return 'away';
    case 'busy': return 'presenting'; // Map busy to presenting for UI
    case 'offline': return 'viewing'; // Map offline to viewing for UI
    default: return 'active';
  }
}

// Legacy support functions (for backward compatibility during transition)
export function legacyUserToUIUser(legacyUser: any): UIUser {
  return {
    id: legacyUser.id,
    displayName: legacyUser.displayName || legacyUser.name,
    avatarUrl: legacyUser.avatarUrl || legacyUser.avatar,
    status: 'online', // Default status
    statusMessage: legacyUser.statusMessage || legacyUser.activity,
    current_space_id: legacyUser.current_space_id,
    role: legacyUser.role,
  };
}