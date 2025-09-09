// src/components/floor-plan/modern/ModernUserAvatar.tsx
import React from 'react';
import { UserPresenceData } from '@/types/database';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { InteractiveUserAvatar } from '@/components/messaging/InteractiveUserAvatar';
import { cn } from '@/lib/utils';
import { floorPlanTokens } from './designTokens';
// Import the AvatarUser type
import { AvatarUser } from '@/lib/avatar-utils';

interface ModernUserAvatarProps {
  // Ensure the user prop type is compatible with AvatarUser
  user: UserPresenceData & AvatarUser;
  onClick?: (userId: string) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
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

  const avatarCore = (
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
      {onClick ? (
        <EnhancedAvatarV2
          user={user}
          size={size}
          showStatus={showStatus}
          onClick={() => onClick(user.id)}
          className={cn(
            "transition-all duration-200 border border-border",
            "hover:ring-2 hover:ring-primary/50 cursor-pointer"
          )}
          onError={(error) => {
            const message = (error as any)?.additionalInfo?.message || String(error);
            console.warn(
              `[ModernUserAvatar] Failed to load avatar for ${user.displayName}:`,
              message
            );
          }}
        />
      ) : (
        <InteractiveUserAvatar
          user={{
            // The InteractiveUserAvatar expects a `User` shape
            id: user.id,
            companyId: null,
            supabase_uid: '',
            email: '',
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            status: (user.status as any) || 'offline',
            statusMessage: user.statusMessage,
            preferences: {},
            role: 'member',
            lastActive: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            currentSpaceId: user.currentSpaceId,
          }}
          size={size}
          showStatus={showStatus}
          showInteractionMenu={true}
          className={cn("transition-all duration-200 border border-border")}
        />
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{avatarCore}</TooltipTrigger>
        <TooltipContent side={tooltipPlacement} className="p-2 max-w-[200px]">
          <div className="text-center">
            <p className="font-medium">{user.displayName}</p>
            {user.status && (
              <p className="text-xs text-muted-foreground capitalize">{user.status}</p>
            )}
            {user.currentSpaceId && (
              <p className="text-xs text-muted-foreground mt-1">In a space</p>
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
