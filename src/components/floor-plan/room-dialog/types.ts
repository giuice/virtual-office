// src/components/floor-plan/room-dialog/types.ts
import { Space, SpaceType, SpaceStatus, Reservation } from '@/types/database';
//import { User as LocalUser } from '../types';
import { UIUser as LocalUser } from '../types';

export interface RoomDialogProps {
  room: Space | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (newRoomData: Partial<Space>) => void;
  onUpdate?: (updatedRoom: Space) => void;
  isCreating?: boolean;
}

export interface RoomTabsProps {
  roomData: Partial<Space>;
  setRoomData: React.Dispatch<React.SetStateAction<Partial<Space>>>;
  errors: Record<string, string>;
  activeTab: string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  availableFeatures: Array<{ value: string; label: string }>;
}

export interface RoomFeatureCheckboxProps {
  features: string[] | undefined;
  onChange: (features: string[]) => void;
  availableFeatures: Array<{ value: string; label: string }>;
}

export interface RoomControlsProps {
  isMicActive: boolean;
  setIsMicActive: React.Dispatch<React.SetStateAction<boolean>>;
  isScreenSharing: boolean;
  setIsScreenSharing: React.Dispatch<React.SetStateAction<boolean>>;
  isRoomLocked: boolean;
  setIsRoomLocked: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface RoomPeopleTabProps {
  userIds: string[] | undefined;
  handleMessageUser: (user: LocalUser) => void;
}

export interface RoomReservationsTabProps {
  reservations: Reservation[] | undefined;
}

export interface RoomInfoTabProps {
  type: SpaceType | undefined;
  capacity: number | undefined;
  features: string[] | undefined;
  description: string | undefined;
  getRoomTypeLabel: (type: SpaceType) => string;
}

export const availableFeatures = [
  { value: 'video', label: 'Video Conferencing' },
  { value: 'screen-sharing', label: 'Screen Sharing' },
  { value: 'whiteboard', label: 'Whiteboard' },
  { value: 'screens', label: 'Multiple Screens' },
  { value: 'coffee', label: 'Coffee Machine' },
  { value: 'snacks', label: 'Snacks' },
  { value: 'desk', label: 'Desk' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'flexible-seating', label: 'Flexible Seating' },
  { value: 'projector', label: 'Projector' },
  { value: 'phone', label: 'Conference Phone' },
  { value: 'natural-light', label: 'Natural Light' },
  { value: 'quiet', label: 'Quiet Zone' },
  { value: 'accessible', label: 'Accessibility Features' }
];