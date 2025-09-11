// src/components/floor-plan/modern/ModernSpaceCard.tsx
import React, { useState } from 'react';
import { Space } from '@/types/database';
import { UserPresenceData } from '@/types/database';
import AvatarGroup from './AvatarGroup';
import { SpaceStatusBadge, SpaceTypeIndicator, CapacityIndicator } from './StatusIndicators';
import { cn } from '@/lib/utils';
import { floorPlanTokens, floorPlanHelpers } from './designTokens';

interface ModernSpaceCardProps {
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
}

const ModernSpaceCard: React.FC<ModernSpaceCardProps> = ({ 
  space, 
  usersInSpace, 
  onEnterSpace, 
  onOpenChat, 
  onUserClick,
  onSpaceDoubleClick,
  isHighlighted = false,
  isUserInSpace = false,
  className = '',
  compact = false
}) => {
  const [hovered, setHovered] = useState(false);
  
  const handleClick = (e?: React.MouseEvent<HTMLDivElement>) => {
    if (e) {
      const target = e.target as HTMLElement;
      // Prevent clicks on interactive elements within the card from triggering navigation
      if (target.closest('[data-avatar-interactive="true"]') || target.closest('a, button:not([data-space-action])')) {
        e.stopPropagation();
        return;
      }
    }
    onEnterSpace(space.id);
    if (onOpenChat) {
      onOpenChat(space);
    }
  };  // Get type and status-based styling
  const typeClasses = floorPlanHelpers.getSpaceTypeClasses(space.type);
  const statusClasses = floorPlanHelpers.getSpaceStatusClasses(
    space.status, 
    usersInSpace.length > 0
  );

  // Functions to format space properties
  const formatSpaceType = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  return (
    <div
      className={cn(
        "flex flex-col relative rounded-lg border-2 p-4",
        floorPlanTokens.spaceCard.shadow.default,
        floorPlanTokens.spaceCard.transition,
        typeClasses,
        hovered && [
          floorPlanTokens.spaceCard.shadow.hover,
          floorPlanTokens.spaceCard.hoverScale
        ],
        isHighlighted && "ring-2 ring-primary",
        isUserInSpace && "ring-1 ring-blue-400",
        compact ? "min-h-[120px]" : "min-h-[160px]",
        className
      )}
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-avatar-interactive]')) {
          e.stopPropagation();
        }
      }}
      onClick={(e) => handleClick(e)}
      onDoubleClick={() => onSpaceDoubleClick?.(space)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Enter space ${space.name}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {/* Header section */}
      <div className={floorPlanTokens.spaceCard.content.header}>
        {/* Space badges at top right */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {/* Only show status badge if not compact mode */}
          {!compact && (
            <SpaceStatusBadge status={space.status} showIcon size="sm" />
          )}
          
          {/* Always show capacity indicator */}
          <CapacityIndicator 
            current={usersInSpace.length} 
            capacity={space.capacity} 
            size="sm"
          />
        </div>

        {/* Space name and type */}
        <h3 className="font-medium text-foreground pr-16 truncate">{space.name}</h3>
        
        {/* Only show type indicator if not compact mode */}
        {!compact && (
          <div className="mt-1">
            <SpaceTypeIndicator type={space.type} showLabel size="sm" />
          </div>
        )}
      </div>
      
      {/* Description (if not compact mode) */}
      {!compact && space.description && (
        <div className={floorPlanTokens.spaceCard.content.body}>
          <p className="text-xs text-muted-foreground line-clamp-2">{space.description}</p>
        </div>
      )}
      
      {/* Push user avatars to bottom */}
      <div className={floorPlanTokens.spaceCard.content.footer}>
        {/* User avatars */}
        <AvatarGroup
          users={usersInSpace}
          max={compact ? 4 : 6}
          size={'sm'}
          onUserClick={onUserClick}
          emptyText="Empty"
          className="mt-2"
        />
      </div>
    </div>
  );
};

export default ModernSpaceCard;
