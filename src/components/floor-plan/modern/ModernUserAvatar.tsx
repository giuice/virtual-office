// src/components/floor-plan/modern/ModernUserAvatar.tsx
import React from 'react';
import { UserPresenceData } from '@/types/database';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
// EnhancedAvatarV2 is used internally by InteractiveUserAvatar
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
  // Only stop click bubbling so space card onClick doesn't fire.
  // Avoid capture-phase / pointerdown interception which broke Radix Dropdown trigger.
  const stopPropagationHandlers = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  } as const;

  const avatarCore = (
    <div
      className={cn(
        "relative inline-block",
        isOverlapping && "ring-2 ring-background",
        className
      )}
      data-avatar-interactive
      {...stopPropagationHandlers}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? `User ${user.displayName}` : undefined}
    >
      <InteractiveUserAvatar
        user={{
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
        aria-label={`${user.displayName}'s avatar - click for options`}
      />
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
