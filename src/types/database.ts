// src/types/database.ts
import { Timestamp } from 'firebase/firestore';

// User role types
export type UserRole = 'admin' | 'member';

// User status types
export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

// Message types
export type MessageType = 'text' | 'image' | 'file' | 'transcript';

// Define a TimeStamp type that works with both Firebase and DynamoDB
export type TimeStampType = Timestamp | string;

// Company Collection
export interface Company {
  id: string;
  name: string;
  adminIds: string[];
  createdAt: TimeStampType;
  settings: {
    allowGuestAccess?: boolean;
    maxRooms?: number;
    defaultRoomSettings?: Partial<Room>;
    theme?: string;
  };
}

// User Collection
export interface User {
  id: string;
  companyId: string;
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
}

// Room Collection
export interface Room {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  isLocked: boolean;
  capacity?: number;
  occupants: string[]; // User IDs
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  createdBy: string; // User ID
  createdAt: TimeStampType;
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

// Meeting Notes Collection
export interface MeetingNote {
  id: string;
  roomId: string;
  title: string;
  meetingDate: TimeStampType;
  transcript?: string;
  summary: string;
  actionItems?: {
    description: string;
    assignee?: string; // User ID
    dueDate?: TimeStampType;
    completed: boolean;
  }[];
  generatedBy: 'ai' | 'user';
  editedBy?: string; // User ID who last edited
  createdAt: TimeStampType;
  updatedAt: TimeStampType;
}