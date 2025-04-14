// src/components/floor-plan/modern/ModernUserAvatar.tsx
import React from 'react';
import { UserPresenceData } from '@/types/database';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { floorPlanTokens } from './designTokens';
// Import the centralized utility and the AvatarUser type
import { getUserInitials, getAvatarUrl, AvatarUser } from '@/lib/avatar-utils';

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
  // Get status color from design system
  const statusColor = floorPlanTokens.avatar.statusIndicator[user.status as keyof typeof floorPlanTokens.avatar.statusIndicator] || 
    floorPlanTokens.avatar.statusIndicator.offline;

  // Get size class from design system
  const sizeClass = floorPlanTokens.avatar.size[size];

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation(); // Prevent triggering parent click handlers
      onClick(user.id);
    }
  };

  // Render avatar with tooltip
  // Get appropriate size class for the avatar
  const avatarSizeClass = {
    'xs': 'h-6 w-6',
    'sm': 'h-8 w-8',
    'md': 'h-10 w-10',
    'lg': 'h-12 w-12'
  }[size];

  // Get initials for the fallback
  const initials = getUserInitials(user.displayName || 'User');

  // Use the centralized getAvatarUrl function
  const avatarSrc = getAvatarUrl(user);

  // Determine if avatar URL is a real image or a generated one
  const hasRealAvatar = !!avatarSrc && !avatarSrc.startsWith('data:image/svg+xml');

  // Track loading and error states ONLY for real avatars
  const [isLoading, setIsLoading] = React.useState(hasRealAvatar);
  const [hasError, setHasError] = React.useState(false);

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
            <Avatar 
              className={cn(
                avatarSizeClass,
                "transition-all duration-200 border border-border",
                onClick && "hover:ring-2 hover:ring-primary/50 cursor-pointer"
              )}
            >
              {/* Only attempt to load AvatarImage if it's a real URL */}
              {hasRealAvatar && !hasError && (
                <AvatarImage
                  src={avatarSrc} // Use the resolved avatarSrc
                  alt={user.displayName || 'User'}
                  onLoad={() => {
                    setIsLoading(false);
                    setHasError(false);
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`[ModernUserAvatar] Avatar loaded for ${user.displayName}`);
                    }
                  }}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                    console.warn(`[ModernUserAvatar] Failed to load avatar for ${user.displayName}`);
                  }}
                />
              )}
              
              {/* Show loading state */}
              {isLoading && (
                <AvatarFallback className="animate-pulse bg-muted/50">
                  <span className="sr-only">Loading...</span>
                </AvatarFallback>
              )}
              
              {/* Show fallback for generated avatars, errors, or while loading real avatars */}
              {(!hasRealAvatar || hasError || isLoading) && (
                <AvatarFallback
                  className={cn(
                    "bg-primary/20 text-primary-foreground",
                    size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : 'text-base'
                  )}
                >
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
            
            {/* Status indicator dot */}
            {showStatus && (
              <span
                className={cn(
                  'absolute ring-2 ring-background rounded-full',
                  floorPlanTokens.avatar.statusIndicator.size,
                  floorPlanTokens.avatar.statusIndicator.position,
                  statusColor
                )}
                aria-hidden="true"
              />
            )}
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
