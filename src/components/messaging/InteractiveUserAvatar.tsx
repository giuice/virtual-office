// src/components/messaging/InteractiveUserAvatar.tsx
'use client';

import React from 'react';
import { UserInteractionMenu } from './UserInteractionMenu';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { User } from '@/types/database';

interface InteractiveUserAvatarProps {
  user: User;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showStatus?: boolean;
  showInteractionMenu?: boolean;
  onCall?: (userId: string) => void;
  onTeleport?: (spaceId: string) => void;
  onViewProfile?: (userId: string) => void;
  showCallActions?: boolean;
  showTeleportActions?: boolean;
  'aria-label'?: string;
}

/**
 * Interactive User Avatar - Combines the enhanced avatar with user interaction menu
 * 
 * This component provides:
 * - Click to open interaction menu with messaging, calling, and teleportation options
 * - Status indicator showing online/away/busy/offline
 * - Hover effects and accessibility features
 * - Integration with messaging system for direct conversations
 * 
 * Usage:
 * ```tsx
 * <InteractiveUserAvatar 
 *   user={user} 
 *   onCall={handleCall}
 *   onTeleport={handleTeleport}
 *   showStatus={true}
 * />
 * ```
 */
export function InteractiveUserAvatar({
  user,
  size = 'md',
  className,
  showStatus = true,
  showInteractionMenu = true,
  onCall,
  onTeleport,
  onViewProfile,
  showCallActions = true,
  showTeleportActions = true,
  'aria-label': ariaLabel,
}: InteractiveUserAvatarProps) {
  
  console.log('[InteractiveUserAvatar] Debug:', {
    userDisplayName: user.displayName,
    userId: user.id,
    showInteractionMenu,
    willRenderMenu: showInteractionMenu
  });

  if (!showInteractionMenu) {
    console.log('[InteractiveUserAvatar] Rendering NON-interactive avatar for:', user.displayName);
    // Render non-interactive avatar
    return (
      <EnhancedAvatarV2
        user={user}
        size={size}
        className={className}
        showStatus={showStatus}
        status={user.status}
        aria-label={ariaLabel || `${user.displayName}'s avatar`}
      />
    );
  }

  console.log('[InteractiveUserAvatar] Rendering INTERACTIVE avatar with menu for:', user.displayName);

  // Render interactive avatar with menu
  return (
    <UserInteractionMenu
      user={user}
      onCall={onCall}
      onTeleport={onTeleport}
      onViewProfile={onViewProfile}
      showCallActions={showCallActions}
      showTeleportActions={showTeleportActions}
      className={className}
    >
      <button 
        type="button"
        className="cursor-pointer border-none bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded"
        onClick={(e) => {
          console.log('[InteractiveUserAvatar] Button clicked for user:', user.displayName);
          // Temporarily remove stopPropagation to test
          // e.stopPropagation();
        }}
        aria-label={ariaLabel || `${user.displayName}'s avatar - click for options`}
      >
        <EnhancedAvatarV2
          user={user}
          size={size}
          showStatus={showStatus}
          status={user.status}
        />
      </button>
    </UserInteractionMenu>
  );
}