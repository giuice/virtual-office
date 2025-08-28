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
  isLoading?: boolean;
  isError?: boolean;
  empty?: boolean;
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
  compact = false,
  isLoading = false,
  isError = false,
  empty = false,
}) => {
  const [hovered, setHovered] = useState(false);
  
  const handleClick = () => {
    if (isLoading || isError) return;
    onEnterSpace(space.id);
    if (onOpenChat) {
      onOpenChat(space);
    }
  };

  // Get type and status-based styling
  const typeClasses = floorPlanHelpers.getSpaceTypeClasses(space.type);
  const statusClasses = floorPlanHelpers.getSpaceStatusClasses(
    space.status, 
    usersInSpace.length > 0
  );


  return (
    <div
      className={cn(
        "flex flex-col relative rounded-lg border-2 p-4",
        floorPlanTokens.spaceCard.shadow.default,
        floorPlanTokens.spaceCard.transition,
        // Respect reduced motion preferences
        "motion-reduce:transition-none motion-reduce:transform-none",
        // Accessible focus styles
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
        typeClasses,
        statusClasses,
        hovered && [
          floorPlanTokens.spaceCard.shadow.hover,
          floorPlanTokens.spaceCard.hoverScale
        ],
        isHighlighted && "ring-2 ring-primary",
        isUserInSpace && "ring-1 ring-blue-400",
        compact ? "min-h-[120px]" : "min-h-[160px]",
        className
      )}
      onClick={handleClick}
      onDoubleClick={() => onSpaceDoubleClick?.(space)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
  aria-label={`Enter space ${space.name}`}
      aria-busy={isLoading || undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      {/* Error state banner */}
      {isError && (
        <div className="mb-2 rounded-md bg-warning/15 text-warning-foreground border border-warning/30 px-3 py-2 text-sm">
          Couldn’t load this space. Please try again.
        </div>
      )}

      {/* Loading skeleton state */}
      {isLoading ? (
        <div className="flex flex-col gap-3 animate-pulse">
          <div className="h-4 w-1/3 bg-muted rounded" />
          {!compact && <div className="h-3 w-2/3 bg-muted rounded" />}
          <div className="mt-auto flex items-center gap-2">
            <div className="h-6 w-24 bg-muted rounded" />
            <div className="h-6 w-16 bg-muted rounded" />
          </div>
        </div>
  ) : (
  <>
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
      
      {/* Occupancy meter for a11y */}
      <div className="mt-1" aria-hidden="true" id={`occupancy-${space.id}`}>
        {space.capacity ? (
          <div className="h-1.5 w-full rounded bg-muted overflow-hidden" aria-hidden>
            <div
              className={cn(
                "h-full transition-base",
                usersInSpace.length / (space.capacity || 1) < 0.66
                  ? "bg-success"
                  : usersInSpace.length / (space.capacity || 1) < 1
                  ? "bg-warning"
                  : "bg-status-busy"
              )}
              style={{ width: `${Math.min(100, (usersInSpace.length / (space.capacity || 1)) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* Push user avatars to bottom */}
  <div className={floorPlanTokens.spaceCard.content.footer} aria-describedby={space.capacity ? `occupancy-${space.id}` : undefined}>
        {/* Empty state */}
        {empty && usersInSpace.length === 0 ? (
          <div className="mt-2 text-xs text-muted-foreground">Empty</div>
        ) : (
          <AvatarGroup
            users={usersInSpace}
            max={compact ? 4 : 6}
            size={compact ? 'xs' : 'sm'}
            onUserClick={onUserClick}
            emptyText="Empty"
            className="mt-2"
          />
        )}
      </div>
      </>
      )}
    </div>
  );
};

export default ModernSpaceCard;
