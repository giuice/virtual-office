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
    allowedUsers?: string[]; // User IDs that have access (Changed to string[])
    allowedRoles?: string[]; // Roles that have access
    ownerId?: string; // User ID of the owner (Changed to string)
  };
  reservations?: {
    id: string;
    userId: string; // Changed to string
    userName: string;
    startTime: string | Date; // Changed to string | Date
    endTime: string | Date;   // Changed to string | Date
    purpose?: string; // Changed to optional
  }[];
  createdBy?: string; // User ID who created the room (Changed to string)
  createdAt?: string | Date; // Changed to string | Date
  updatedAt?: string | Date; // Changed to string | Date
  isTemplate?: boolean;
  templateName?: string;
}
