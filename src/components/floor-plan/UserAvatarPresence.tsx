import React from 'react';
import { UserPresenceData } from '@/types/database';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface UserAvatarPresenceProps {
  user: UserPresenceData;
  onClick?: (userId: string) => void;
}

const UserAvatarPresence: React.FC<UserAvatarPresenceProps> = ({ user, onClick }) => {
  const statusColor = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  }[user.status || 'offline'] || 'bg-gray-400';

  const handleClick = () => {
    if (onClick) {
      onClick(user.id);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="relative inline-block"
            onClick={handleClick}
            role={onClick ? 'button' : undefined}
            aria-label={onClick ? `User ${user.displayName}` : undefined}
          >
            <EnhancedAvatarV2
              user={user}
              size="md"
              showStatus={false}
              onError={(error) => {
                console.warn(`[UserAvatarPresence] Failed to load avatar for ${user.displayName}:`, error.message);
              }}
            />
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background',
                statusColor
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{user.displayName}</p>
          <p className="text-xs text-muted-foreground capitalize">{user.status}</p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-[10px] text-muted-foreground mt-1">ID: {user.id}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default UserAvatarPresence;
