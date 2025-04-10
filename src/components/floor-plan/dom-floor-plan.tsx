// src/components/floor-plan/DomFloorPlan.tsx
import React, { useState, useEffect } from 'react';
import { Space, User } from '@/types/database';
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';


interface DomFloorPlanProps {
  spaces: Space[];
  onSpaceSelect?: (space: Space) => void;
  onSpaceDoubleClick?: (space: Space) => void;
  highlightedSpaceId?: string | null;
  isEditable?: boolean;
  onOpenChat?: (space: Space) => void; // added optional chat callback
}

export default function DomFloorPlan(props: DomFloorPlanProps) {
  const spaces = props.spaces || [];
  const { currentUserProfile } = useCompany();
  const { users, usersInSpaces, isLoading, updateLocation } = usePresence();
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [lastRequestedSpaceId, setLastRequestedSpaceId] = useState<string | null>(null);

  // Log space and user data for debugging (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('--- DOM Floor Plan Debug Info ---');
      console.log('Total spaces:', spaces.length);
      console.log('Total users:', users?.length ?? 0);
      
      // Clearly log all spaces and their assigned users for debugging
      spaces.forEach(space => {
        // Check if userIds is actually an array (important!)
        const userIdsArray = Array.isArray(space.userIds) ? space.userIds : [];
        console.log(`Space "${space.name}" (${space.id}) has ${userIdsArray.length} assigned users:`, 
          userIdsArray.length > 0 ? userIdsArray : 'NONE');
      });
    }
  }, [spaces, users]);
  
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

  // Get user status color
  const getUserStatusClass = (status: string): string => {
    switch(status) {
      case 'online': return 'bg-success';
      case 'busy': return 'bg-destructive';
      case 'away': return 'bg-warning';
      case 'offline': return 'bg-muted-foreground';
      default: return 'bg-muted-foreground';
    }
  };

  // Check if current user is in space
  const isUserInSpace = (space: Space) => {
    if (!currentUserProfile?.id || !space.userIds) return false;
    return space.userIds.includes(currentUserProfile.id);
  };

  return (
    <div className="relative w-full h-[600px] p-4 bg-background rounded-lg border border-border overflow-auto">
      {/* Grid container for spaces */}
      <div className="grid grid-cols-3 gap-4 auto-rows-min">
        {spaces.map((space, index) => {
          // Ensure space.userIds is always treated as an array
          // This is critical - if userIds comes as a string or other format, it must be handled
          let spaceUserIds: string[] = [];
          
          if (space.userIds === null || space.userIds === undefined) {
            spaceUserIds = [];
          } else if (Array.isArray(space.userIds)) {
            spaceUserIds = space.userIds;
          } else {
            // If somehow userIds came in as a different format, log and use empty array
            console.error(`Space ${space.name} has invalid userIds format:`, space.userIds);
            spaceUserIds = [];
          }
          // Log the actual userIds after validation (only in development)
          if (process.env.NODE_ENV === 'development') {
            console.log(`Rendering space ${space.name} (${space.id}) with user IDs:`, 
              spaceUserIds.length > 0 ? spaceUserIds : 'NO USERS');
          }
          
          // Only match users by exact ID match
          const spaceUsers = usersInSpaces.get(space.id) || [];
          
          const isHighlighted = props.highlightedSpaceId === space.id;
          const isHovered = hoveredSpaceId === space.id;
          const userInSpace = isUserInSpace(space);
          
          return (
            <div
              key={space.id || index}
              className={cn(
                "p-4 rounded-lg border-2 shadow-sm transition-all",
                getSpaceColorClass(space.type),
                isHighlighted && "ring-2 ring-primary",
                userInSpace && "ring-1 ring-blue-400",
                isHovered && "shadow-md scale-[1.02]",
                "hover:shadow-md"
              )}
              style={{
                minHeight: "140px",
                position: "relative",
              }}
              onClick={async () => {
                try {
                  const currentUserId = currentUserProfile?.id;
                  const currentUser = users?.find(u => u.id === currentUserId);
                  const currentSpaceId = currentUser?.current_space_id;

                  // Avoid duplicate requests if already processing
                  if (space.id === lastRequestedSpaceId) {
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[FloorPlan] Already requested this space, skipping');
                    }
                    return;
                  }

                  // Only update if the user is not already in the target space
                  if (currentSpaceId !== space.id) {
                     if (process.env.NODE_ENV === 'development') {
                       console.log(`Updating location: ${currentSpaceId} -> ${space.id}`);
                     }
                    setLastRequestedSpaceId(space.id); // Set flag before async call
                    await updateLocation(space.id);
                    // Consider resetting lastRequestedSpaceId on success/failure if needed
                  } else {
                     if (process.env.NODE_ENV === 'development') {
                       console.log(`User already in space ${space.id}, skipping update`);
                     }
                  }

                  props.onSpaceSelect?.(space);
                  props.onOpenChat?.(space);
                } catch (error) {
                  console.error('Failed to update location:', error);
                }
              }}
              onDoubleClick={() => props.onSpaceDoubleClick?.(space)}
              onMouseEnter={() => setHoveredSpaceId(space.id)}
              onMouseLeave={() => setHoveredSpaceId(null)}
            >
              {/* Space Name and Type */}
              <div className="mb-2">
                <h3 className="font-semibold text-foreground">{space.name}</h3>
                <p className="text-xs text-muted-foreground capitalize">{space.type?.replace('_', ' ')}</p>
                
                {/* For debugging only - show user IDs in this space */}
                {process.env.NODE_ENV === 'development' && (
                  <p className="text-[10px] text-muted-foreground mt-1 overflow-hidden text-ellipsis">
                    IDs: {spaceUserIds.join(', ')}
                  </p>
                )}
              </div>
              
              {/* User count badge */}
              {spaceUsers.length > 0 && (
                <Badge 
                  variant="secondary" 
                  className="absolute top-2 right-2"
                >
                  {spaceUsers.length}
                </Badge>
              )}
              
              {/* User avatars */}
              <div className="flex flex-wrap gap-1 mt-3">
                <TooltipProvider>
                  {spaceUsers.slice(0, 8).map(user => (
                    <Tooltip key={user.id}>
                      <TooltipTrigger asChild>
                        <div className="relative">
                          <Avatar className="h-8 w-8 border border-border">
                            {user.avatarUrl ? (
                              <AvatarImage src={user.avatarUrl} alt={user.displayName || 'User'} />
                            ) : (
                              <AvatarFallback className="text-xs">
                                {user.displayName ? user.displayName.substring(0, 2).toUpperCase() : 'U'}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          
                          {/* Status indicator */}
                          <span 
                            className={cn(
                              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-background",
                              getUserStatusClass(user.status || 'offline')
                            )} 
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{user.displayName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{user.status}</p>
                        {/* Show ID in development for debugging */}
                        {process.env.NODE_ENV === 'development' && (
                          <p className="text-[10px] text-muted-foreground mt-1">ID: {user.id}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  
                  {/* Show +X more if there are many users */}
                  {spaceUsers.length > 8 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="cursor-default h-8 rounded-full px-2">
                          +{spaceUsers.length - 8}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{spaceUsers.length - 8} more users in this space</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TooltipProvider>
              </div>
            </div>
          );
        })}
        
        {/* Empty state */}
        {spaces.length === 0 && (
          <div className="col-span-3 p-8 text-center rounded-lg border border-dashed border-muted-foreground/50">
            <p className="text-muted-foreground">No spaces match your filter criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}
