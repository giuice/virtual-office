import React from 'react';
import { UserPresenceData } from '@/types/database';
import { EnhancedAvatar } from '@/components/ui/avatar-system';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface UserAvatarPresenceProps {
  user: UserPresenceData;
  onClick?: (userId: string) => void;
}

const UserAvatarPresence: React.FC<UserAvatarPresenceProps> = ({ user, onClick }) => {
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
            onClick={handleClick}
            role={onClick ? 'button' : undefined}
            aria-label={onClick ? `User ${user.displayName}` : undefined}
          >
            <EnhancedAvatar
              user={user}
              size="md"
              showStatus={true}
              status={user.status}
              fallbackName={user.displayName || 'User'}
              onClick={onClick ? () => onClick(user.id) : undefined}
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
