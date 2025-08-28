// src/components/floor-plan/modern/SpaceCard.tsx
import React from 'react';
import ModernSpaceCard from './ModernSpaceCard';
import { Space, UserPresenceData } from '@/types/database';

export interface SpaceCardProps {
  space: Space;
  usersInSpace: UserPresenceData[];
  onEnterSpace: (spaceId: string) => void;
  onOpenChat?: (space: Space) => void;
  onUserClick?: (userId: string) => void;
  onSpaceDoubleClick?: (space: Space) => void;
  isHighlighted?: boolean;
  isUserInSpace?: boolean;
  className?: string;
  compact?: boolean;
  // New optional states
  isLoading?: boolean;
  isError?: boolean;
  empty?: boolean;
  href?: string;
}

const SpaceCard: React.FC<SpaceCardProps> = (props) => {
  return <ModernSpaceCard {...props} />;
};

export default React.memo(SpaceCard);
