import React, { useState } from 'react';
import { Space } from '@/types/database';
import { UserPresenceData } from '@/types/database';
import UserAvatarPresence from './UserAvatarPresence';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SpaceElementProps {
  space: Space;
  usersInSpace: UserPresenceData[];
  onEnterSpace: (spaceId: string) => void;
  onOpenChat?: (space: Space) => void;
  onSpaceDoubleClick?: (space: Space) => void;
  isHighlighted?: boolean;
  isUserInSpace?: boolean;
}

const SpaceElement: React.FC<SpaceElementProps> = ({ 
  space, 
  usersInSpace, 
  onEnterSpace, 
  onOpenChat, 
  onSpaceDoubleClick,
  isHighlighted = false,
  isUserInSpace = false
}) => {
  const [hovered, setHovered] = useState(false);
  
  const handleClick = () => {
    onEnterSpace(space.id);
    if (onOpenChat) {
      onOpenChat(space);
    }
  };

  // Get space color based on type
  const getSpaceColorClass = (type: Space['type']): string => {
    switch(type) {
      case 'workspace': return 'bg-success/15 border-success';
      case 'conference': return 'bg-primary/15 border-primary';
      case 'social': return 'bg-warning/15 border-warning';
      case 'breakout': return 'bg-secondary/15 border-secondary';
      case 'private_office': return 'bg-destructive/15 border-destructive';
      case 'open_space': return 'bg-accent/15 border-accent';
      case 'lounge': return 'bg-popover/15 border-popover';
      case 'lab': return 'bg-card/15 border-card';
      default: return 'bg-muted/50 border-muted-foreground';
    }
  };

  return (
    <div
      className={cn(
        "p-4 rounded-lg border-2 shadow-sm transition-all",
        getSpaceColorClass(space.type),
        isHighlighted && "ring-2 ring-primary",
        isUserInSpace && "ring-1 ring-blue-400",
        hovered && "shadow-md scale-[1.02]",
        "hover:shadow-md"
      )}
      style={{
        minHeight: "140px",
        position: "relative",
      }}
      onClick={handleClick}
      onDoubleClick={() => onSpaceDoubleClick?.(space)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`Enter space ${space.name}`}
      role="button"
    >
      {/* Space Name and Type */}
      <div className="mb-2">
        <h3 className="font-semibold text-foreground">{space.name}</h3>
        <p className="text-xs text-muted-foreground capitalize">{space.type?.replace('_', ' ')}</p>
      </div>
      
      {/* User count badge */}
      {usersInSpace.length > 0 && (
        <Badge 
          variant="secondary" 
          className="absolute top-2 right-2"
        >
          {usersInSpace.length}
        </Badge>
      )}
      
      {/* User avatars */}
      <div className="flex flex-wrap gap-1 mt-3">
        <TooltipProvider>
          {usersInSpace.slice(0, 8).map(user => (
            <UserAvatarPresence key={user.id} user={user} />
          ))}
          
          {/* Show +X more if there are many users */}
          {usersInSpace.length > 8 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="cursor-default h-8 rounded-full px-2">
                  +{usersInSpace.length - 8}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{usersInSpace.length - 8} more users in this space</p>
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
        {usersInSpace.length === 0 && (
          <span className="text-xs text-muted-foreground">Empty</span>
        )}
      </div>
    </div>
  );
};

export default SpaceElement;
