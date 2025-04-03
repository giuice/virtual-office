// src/components/floor-plan/room-dialog/utils.ts
import { SpaceType } from '@/types/database';
import { spaceColors } from '../types';

/**
 * Helper function to get room color based on type
 */
export const getRoomColor = (type: SpaceType = 'workspace') => {
  return spaceColors[type] || spaceColors.default;
};

/**
 * Helper function to get readable room type label
 */
export const getRoomTypeLabel = (type: SpaceType) => {
  switch (type) {
    case 'workspace': return 'Workspace';
    case 'conference': return 'Conference Room';
    case 'social': return 'Social Space';
    case 'breakout': return 'Breakout Room';
    case 'private_office': return 'Private Office';
    case 'open_space': return 'Open Space';
    case 'lounge': return 'Lounge';
    case 'lab': return 'Lab';
    default: return 'Room';
  }
};