// src/types/ui.ts
import { SpaceType, UIUserStatus } from './database';



/**
 * UI-specific interfaces and types that don't directly map to database entities
 */

// UI-specific user representation
export interface UIUser {
  id: string; // Now using string IDs for consistency with database
  displayName: string; // Renamed from 'name' to match database User
  avatarUrl: string; // Renamed from 'avatar' to match database User
  status: UIUserStatus;
  statusMessage?: string; // Renamed from 'activity' to align with database concepts
  
  // Legacy support - these will be deprecated
  name?: string; // For backward compatibility
  avatar?: string; // For backward compatibility
  activity?: string; // For backward compatibility
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
  presenting: 'hsl(var(--primary))',    // Primary color
  active: 'hsl(var(--success))',        // Success/green
  away: 'hsl(var(--warning))',          // Warning/amber
  viewing: 'hsl(var(--secondary))',     // Secondary color
  default: 'hsl(var(--muted-foreground))' // Muted foreground
};