// src/components/floor-plan/modern/ModernUserAvatar.tsx
import React from 'react';
import { UserPresenceData } from '@/types/database';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EnhancedAvatar } from '@/components/ui/avatar-system';
import { cn } from '@/lib/utils';
import { floorPlanTokens } from './designTokens';
import { AvatarUser } from '@/lib/avatar-utils';

interface ModernUserAvatarProps {
  // Ensure the user prop type is compatible with AvatarUser
  user: UserPresenceData & AvatarUser;
  onClick?: (userId: string) => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  className?: string;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  isOverlapping?: boolean; // Used when avatars are in a group
}

const ModernUserAvatar: React.FC<ModernUserAvatarProps> = ({ 
  user, 
  onClick, 
  size = 'sm',
  showStatus = true,
  className = '',
  tooltipPlacement = 'top',
  isOverlapping = false
}) => {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation(); // Prevent triggering parent click handlers
      onClick(user.id);
    }
  };

  // Map floor plan sizes to avatar sizes
  const avatarSize = size === 'xs' ? 'sm' : size === 'lg' ? 'lg' : 'md';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative inline-block",
              isOverlapping && "ring-2 ring-background",
              className
            )}
            onClick={handleClick}
            role={onClick ? 'button' : undefined}
            aria-label={onClick ? `User ${user.displayName}` : undefined}
          >
            <EnhancedAvatar
              user={user}
              size={avatarSize}
              showStatus={showStatus}
              status={user.status}
              fallbackName={user.displayName || 'User'}
              onClick={onClick ? () => onClick(user.id) : undefined}
              className={cn(
                "transition-all duration-200",
                onClick && "hover:ring-2 hover:ring-primary/50 cursor-pointer"
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side={tooltipPlacement} className="p-2 max-w-[200px]">
          <div className="text-center">
            <p className="font-medium">{user.displayName}</p>
            {user.status && (
              <p className="text-xs text-muted-foreground capitalize">
                {user.status}
              </p>
            )}
            {user.current_space_id && (
              <p className="text-xs text-muted-foreground mt-1">
                In a space
              </p>
            )}
            {process.env.NODE_ENV === 'development' && (
              <p className="text-[10px] text-muted-foreground mt-1">ID: {user.id}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ModernUserAvatar;
