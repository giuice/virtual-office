// src/components/floor-plan/floor-tooltip.tsx
'use client'

import { User as DBUser } from '@/types/database'
import { UIUser, dbUserToUIUser } from '@/types/ui'
import { Space as LocalSpace } from './types'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from '@/components/ui/tooltip'
import { Users, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2'

// Type for the content prop
type TooltipContent = {
  type: 'space' | 'user';
  data: any; // Using any to accommodate different data structures
};

interface FloorTooltipProps {
  content: TooltipContent;
  position?: { x: number; y: number }; // Optional for canvas-based tooltips
  children?: React.ReactNode; // Optional for standard tooltips
}

export function FloorTooltip({ content, position, children }: FloorTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  // Add a small delay before showing the tooltip to prevent flickering
  useEffect(() => {
    if (position) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 100);
      
      return () => clearTimeout(timer);
    } else {
      // If no position is provided (using children), make it visible immediately
      setIsVisible(true);
    }
  }, [position, content]);

  // Get badge variant based on space status
  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'available': return 'outline';
      case 'maintenance': return 'destructive';
      case 'locked': return 'secondary';
      case 'online': return 'default';
      case 'away': return 'secondary';
      case 'busy': return 'destructive';
      case 'offline': return 'secondary';
      default: return 'outline';
    }
  }

  // Normalize user data to handle both database User and UIUser
  const normalizeUser = (userData: any): UIUser => {
    // Check if it's a database User (has displayName)
    if (userData && 'displayName' in userData) {
      return dbUserToUIUser(userData as DBUser);
    }
    // It's already a UIUser
    return userData as UIUser;
  };

  // Render content based on type
  const renderContent = () => {
    if (!content || !content.data) return null;

    if (content.type === 'space') {
      const space = content.data as LocalSpace;
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-base">{space.name}</h4>
            <Badge variant={getBadgeVariant(space.status)}>
              {space.status === 'locked' && <Lock className="h-3 w-3 mr-1" />}
              {space.status.charAt(0).toUpperCase() + space.status.slice(1)}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{space.users?.length || 0}/{space.capacity} people</span>
          </div>
          
          {space.description && (
            <div className="pt-1">
              <p className="text-sm">{space.description}</p>
            </div>
          )}
          
          {Array.isArray(space.users) && space.users.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">People in this space:</p>
              <div className="flex flex-col gap-2">
              {space.users.map(user => (
                  <div key={user.id} className="flex items-center gap-2">
                    <EnhancedAvatarV2 user={user} size="sm" showStatus={true} />
                    <div>
                      <p className="text-xs font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{user.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    } else {
      // Normalize user data to ensure compatibility
      const user = normalizeUser(content.data);
      
      return (
        <div className="flex items-center gap-3">
          <EnhancedAvatarV2 user={user} size="md" showStatus={true} />
          <div>
            <p className="font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.status}</p>
            {user.activity && (
              <p className="text-xs italic mt-1">{user.activity}</p>
            )}
          </div>
        </div>
      );
    }
  };

  // For canvas-based tooltips (position is provided)
  if (position) {
    if (!isVisible) return null;
    
    return (
      <div
        className="absolute z-[9999] bg-background border rounded-md shadow-md p-3 text-sm"
        style={{
          left: `${position.x + 10}px`,
          top: `${position.y + 10}px`,
          transform: 'translate(0, -50%)',
          maxWidth: '250px',
          pointerEvents: 'none', // Prevent tooltip from blocking interactions
        }}
      >
        {renderContent()}
      </div>
    );
  }

  // For standard tooltips (children is provided)
  if (!children) return null; // Safety check

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="bg-background dark:bg-gray-800 p-4 shadow-lg rounded-lg border max-w-xs z-[9999]">
          {renderContent()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}