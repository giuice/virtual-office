import { SpaceType, SpaceStatus, Position } from '@/types/database';
import { UIUser } from '@/types/ui';
import { spaceColors, userStatusColors } from '@/types/ui';

// Re-export types needed by the floor plan components
export type { SpaceType, SpaceStatus, Position, UIUser };
export { spaceColors, userStatusColors };

// We keep a local Space interface for backward compatibility
// This will be removed in a future refactoring
export interface Space {
  id: string;
  name: string;
  type: SpaceType;
  status: SpaceStatus;
  capacity: number;
  features: string[];
  position: Position;
  users: UIUser[];
  description?: string;
  accessControl?: {
    isPublic: boolean;
    allowedUsers?: number[]; // User IDs that have access
    allowedRoles?: string[]; // Roles that have access
    ownerId?: number; // User ID of the owner
  };
  reservations?: {
    id: string;
    userId: number;
    userName: string;
    startTime: Date;
    endTime: Date;
    purpose: string;
  }[];
  createdBy?: number; // User ID who created the room
  createdAt?: Date;
  updatedAt?: Date;
  isTemplate?: boolean;
  templateName?: string;
}
