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

// Theme configuration for consistent colors
export const spaceColors = {
  workspace: { color: '#22C55E', lightColor: '#F0FDF4' },
  conference: { color: '#0EA5E9', lightColor: '#E5F6FD' },
  social: { color: '#F59E0B', lightColor: '#FEF3C7' },
  breakout: { color: '#8B5CF6', lightColor: '#F3E8FF' },
  default: { color: '#6B7280', lightColor: '#F3F4F6' }
};

export const userStatusColors = {
  presenting: '#0EA5E9',
  active: '#22C55E',
  away: '#F59E0B',
  viewing: '#8B5CF6',
  default: '#6B7280'
};