// src/types/database.ts

// User role types
export type UserRole = 'admin' | 'member';

// User status types
export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

// UI-specific user status (different from database status)
export type UIUserStatus = 'active' | 'away' | 'presenting' | 'viewing';

// Space types
export type SpaceType = 'workspace' | 'conference' | 'social' | 'breakout' | 'private_office' | 'open_space' | 'lounge' | 'lab';
export type SpaceStatus = 'active' | 'available' | 'maintenance' | 'locked' | 'reserved' | 'in_use';

// Message types
export type MessageType = 'text' | 'image' | 'file' | 'transcript' | 'system' | 'announcement';
// Conversation types
export type ConversationType = 'direct' | 'group' | 'room';
// Announcement priority
export type AnnouncementPriority = 'low' | 'medium' | 'high';
// Note generator type
export type NoteGenerator = 'ai' | 'user';

import { MessageStatus } from '@/types/messaging'; // Added for Message status
// Define a TimeStamp type that works with both Firebase and DynamoDB
export type TimeStampType = string; // Supabase returns ISO strings for timestamps

// Company Collection
export interface Company {
  id: string;
  name: string;
  adminIds: string[];
  createdAt: TimeStampType;
  settings: {
    allowGuestAccess?: boolean;
    maxRooms?: number;
    defaultRoomSettings?: Partial<Space>; // Changed Room to Space
    theme?: string;
  };
}

// User Collection
export interface User {
  id: string;
  companyId: string;
  supabase_uid: string; // Now links to Supabase Auth
  email: string;
  displayName: string;
  avatarUrl?: string;
  status: UserStatus;
  statusMessage?: string;
  preferences: {
    theme?: string;
    notifications?: boolean;
    defaultRoom?: string;
  };
  role: UserRole;
  lastActive: TimeStampType;
  createdAt: TimeStampType;
  current_space_id?: string | null; // Reference to Space.id, nullable
}

export interface UserPresenceData {
  id: string;
  displayName: string;
  avatarUrl?: string;
  status?: 'online' | 'away' | 'busy' | 'offline';
  current_space_id?: string | null;
  // Added flag to track avatar loading state
  avatarLoading?: boolean;
  // Added flag to track avatar error state
  avatarError?: boolean;
}

// Position type for floor plan elements
export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Access Control for Spaces
export interface AccessControl {
  isPublic: boolean;
  allowedUsers?: string[]; // User IDs that have access
  allowedRoles?: string[]; // Roles that have access
  ownerId?: string; // User ID of the owner
}

// Reservation for Spaces
export interface Reservation {
  id: string;
  userId: string; // User ID who made the reservation
  userName: string; // User name (denormalized for display)
  startTime: string | Date;
  endTime: string | Date;
  purpose?: string;
}

// Space Collection (Replaces the simpler Room type)
export interface Space {
  id: string;
  companyId: string; // Link to company
  name: string;
  type: SpaceType;
  status: SpaceStatus;
  capacity: number;
  features: string[];
  position: Position;
  userIds: string[]; // User IDs currently in the space
  description?: string;
  accessControl: AccessControl;
  createdBy?: string; // User ID who created the room
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isTemplate?: boolean; // If this space is a template itself
  templateName?: string; // Name of the template used, if any
  // This property won't be stored directly in the spaces table
  // but will be populated when fetching a space with its reservations
  reservations?: Reservation[];
}


// Message Collection
export interface Message {
  id: string;
  roomId?: string; // For room messages
  recipientId?: string; // For direct messages
  senderId: string;
  content: string;
  timestamp: TimeStampType;
  type: MessageType;
  reactions?: { [emoji: string]: string[] }; // Map of emoji to user IDs
  status?: MessageStatus; // Added for read/delivered status
  attachments?: {
    url: string;
    type: string;
    name: string;
  }[];
}

// Announcement Collection
export interface Announcement {
  id: string;
  companyId: string;
  title: string;
  content: string;
  postedBy: string; // User ID
  timestamp: TimeStampType;
  expiration?: TimeStampType;
  priority?: 'low' | 'medium' | 'high';
}

// Action Item for Meeting Notes
export interface ActionItem {
  description: string;
  assignee?: string; // User ID
  dueDate?: TimeStampType;
  completed: boolean;
}

// Meeting Notes Collection
export interface MeetingNote {
  id: string;
  roomId: string;
  title: string;
  meetingDate: TimeStampType;
  transcript?: string;
  summary: string;
  actionItems?: ActionItem[]; // Use the exported ActionItem type
  generatedBy: 'ai' | 'user';
  editedBy?: string; // User ID who last edited
  createdAt: TimeStampType;
  updatedAt: TimeStampType;
}

// Invitation Collection
export interface Invitation {
  token: string; // Primary Key
  email: string;
  companyId: string;
  role: UserRole;
  expiresAt: number; // Unix timestamp (for TTL)
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string; // ISO String
}

// Room Template (Not stored in main DB, maybe separate config or derived)
// Note: This might not be stored directly in the main database
// but could be part of company settings or a separate collection.
export interface RoomTemplate {
  id: string;
  name: string;
  type: SpaceType;
  capacity: number;
  features: string[];
  description?: string;
  defaultWidth: number;
  defaultHeight: number;
  createdBy?: string; // User ID
  isPublic: boolean;
}
