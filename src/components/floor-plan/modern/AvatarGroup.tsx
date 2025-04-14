// src/components/floor-plan/modern/AvatarGroup.tsx
import React from 'react';
import { UserPresenceData } from '@/types/database';
import ModernUserAvatar from './ModernUserAvatar';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AvatarGroupProps {
  users: UserPresenceData[];
  max?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  onUserClick?: (userId: string) => void;
  showEmpty?: boolean;
  emptyText?: string;
}

const AvatarGroup: React.FC<AvatarGroupProps> = ({
  users,
  max = 5,
  size = 'sm',
  className = '',
  onUserClick,
  showEmpty = true,
  emptyText = 'No users'
}) => {
  // If no users are present
  if (users.length === 0 && showEmpty) {
    return (
      <div className={cn("flex items-center", className)}>
        <span className="text-xs text-muted-foreground">{emptyText}</span>
      </div>
    );
  }

  // Display empty div if no users and showEmpty is false
  if (users.length === 0 && !showEmpty) {
    return <div className={className} />;
  }

  // Calculate how many users to show and how many are remaining
  const visibleUsers = users.slice(0, max);
  const remainingCount = users.length - max;

  return (
    <div className={cn("flex items-center", className)}>
      {/* Visible avatars with overlap styling */}
      <div className="flex">
        {visibleUsers.map((user, index) => (
          <ModernUserAvatar
            key={user.id}
            user={user}
            size={size}
            onClick={onUserClick}
            isOverlapping={index > 0}
            tooltipPlacement="top"
          />
        ))}
      </div>

      {/* "More users" indicator */}
      {remainingCount > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={cn(
                  "ml-1 cursor-default rounded-full",
                  size === 'xs' && "h-5 text-[10px] px-1.5",
                  size === 'sm' && "h-6 text-xs px-2",
                  size === 'md' && "h-8 text-sm px-2",
                  size === 'lg' && "h-10 text-base px-3",
                )}
              >
                +{remainingCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-center">
                <p className="text-sm font-medium">{remainingCount} more {remainingCount === 1 ? 'user' : 'users'}</p>
                <div className="mt-1 text-xs text-muted-foreground">
                  {users.slice(max).map(user => user.displayName).join(', ')}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

export default AvatarGroup;
