export type SpaceType = 'workspace' | 'conference' | 'social' | 'breakout' | 'private_office' | 'open_space' | 'lounge' | 'lab';
export type SpaceStatus = 'active' | 'available' | 'maintenance' | 'locked' | 'reserved' | 'in_use';
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

export interface AccessControl {
  isPublic: boolean;
  allowedUsers?: number[]; // User IDs that have access
  allowedRoles?: string[]; // Roles that have access
  ownerId?: number; // User ID of the owner
}

export interface Reservation {
  id: string;
  userId: number;
  userName: string;
  startTime: Date;
  endTime: Date;
  purpose: string;
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
  description?: string;
  accessControl?: AccessControl;
  reservations?: Reservation[];
  createdBy?: number; // User ID who created the room
  createdAt?: Date;
  updatedAt?: Date;
  isTemplate?: boolean;
  templateName?: string;
}

export interface RoomTemplate {
  id: string;
  name: string;
  type: SpaceType;
  capacity: number;
  features: string[];
  description?: string;
  defaultWidth: number;
  defaultHeight: number;
  createdBy?: number;
  isPublic: boolean;
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
