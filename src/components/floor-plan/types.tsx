// src/components/floor-plan/types.tsx
export type SpaceType = 'workspace' | 'conference' | 'social' | 'breakout';
export type SpaceStatus = 'active' | 'available' | 'maintenance' | 'locked';
export type UserStatus = 'active' | 'away' | 'presenting' | 'viewing';

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface User {
  id: number;
  name: string;
  avatar: string;
  status: UserStatus;
  activity: string;
}

export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  status: SpaceStatus;
  capacity: number;
  features: string[];
  position: Position;
  users: User[];
}

export interface Announcement {
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
