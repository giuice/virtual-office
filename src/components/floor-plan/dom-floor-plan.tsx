// src/components/floor-plan/DomFloorPlan.tsx
import React, { useState, useEffect } from 'react';
import { Space } from '@/types/database';
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
import SpaceElement from './SpaceElement';

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
      
      // Log presence data by space
      usersInSpaces.forEach((usersInSpace, spaceId) => {
        const spaceName = spaces.find(s => s.id === spaceId)?.name || 'Unknown';
        console.log(`Space "${spaceName}" (${spaceId}) has ${usersInSpace.length} users via presence system:`,
          usersInSpace.map(u => u.displayName).join(', '));
      });
      
      // For reference, also log legacy userIds arrays (being phased out)
      spaces.forEach(space => {
        // Check if userIds is actually an array (important!)
        const userIdsArray = Array.isArray(space.userIds) ? space.userIds : [];
        console.log(`Space "${space.name}" (${space.id}) legacy userIds array has ${userIdsArray.length} entries:`, 
          userIdsArray.length > 0 ? userIdsArray : 'NONE');
      });
    }
  }, [spaces, users, usersInSpaces]);
  
  // Check if current user is in space
  const isUserInSpace = (space: Space) => {
    if (!currentUserProfile?.id) return false;
    
    // Primary method: Check if user's current_space_id matches this space
    const currentUser = users?.find(u => u.id === currentUserProfile.id);
    
    // For debugging, log details about this check
    if (process.env.NODE_ENV === 'development' && currentUserProfile) {
      // Only log when active user is in focus to reduce noise
      if (hoveredSpaceId === space.id || lastRequestedSpaceId === space.id) {
        console.log(`[FloorPlan] User ${currentUserProfile.displayName} space check:`,
          {
            spaceId: space.id,
            spaceName: space.name,
            userCurrentSpaceId: currentUser?.current_space_id,
            match: currentUser?.current_space_id === space.id,
            inLegacyArray: space.userIds && Array.isArray(space.userIds) ? 
              space.userIds.includes(currentUserProfile.id) : false
          });
      }
    }
    
    if (currentUser?.current_space_id === space.id) {
      return true;
    }
    
    // Fallback method: Check legacy space.userIds (being phased out)
    if (space.userIds && Array.isArray(space.userIds)) {
      return space.userIds.includes(currentUserProfile.id);
    }
    
    return false;
  };

  const handleEnterSpace = async (spaceId: string) => {
    try {
      const currentUserId = currentUserProfile?.id;
      if (!currentUserId) {
        console.error('[FloorPlan] Cannot update location: currentUserProfile.id is missing');
        return;
      }
      
      const currentUser = users?.find(u => u.id === currentUserId);
      const currentSpaceId = currentUser?.current_space_id;

      // Avoid duplicate requests if already processing
      if (spaceId === lastRequestedSpaceId) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[FloorPlan] Already requested this space, skipping');
        }
        return;
      }

      // Only update if the user is not already in the target space
      if (currentSpaceId !== spaceId) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Updating location: ${currentSpaceId} -> ${spaceId}`);
        }
        setLastRequestedSpaceId(spaceId); // Set flag before async call
        try {
          await updateLocation(spaceId);
          // Reset lastRequestedSpaceId after successful update
          setTimeout(() => setLastRequestedSpaceId(null), 1000); // Clear after 1s to prevent rapid clicks
        } catch (updateError) {
          console.error('Error updating location:', updateError);
          // Reset immediately on error
          setLastRequestedSpaceId(null);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log(`User already in space ${spaceId}, skipping update`);
        }
      }

      const selectedSpace = spaces.find(s => s.id === spaceId);
      if (selectedSpace) {
        props.onSpaceSelect?.(selectedSpace);
        props.onOpenChat?.(selectedSpace);
      }
    } catch (error) {
      console.error('Failed to update location:', error);
    }
  };

  return (
    <div className="relative w-full h-[600px] p-4 bg-background rounded-lg border border-border overflow-auto">
      {/* Grid container for spaces */}
      <div className="grid grid-cols-3 gap-4 auto-rows-min">
        {spaces.map((space, index) => {
          // Ensure space.userIds is always treated as an array
          let spaceUserIds: string[] = [];
          
          if (space.userIds === null || space.userIds === undefined) {
            spaceUserIds = [];
          } else if (Array.isArray(space.userIds)) {
            spaceUserIds = space.userIds;
          } else {
            console.error(`Space ${space.name} has invalid userIds format:`, space.userIds);
            spaceUserIds = [];
          }
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`Rendering space ${space.name} (${space.id}) with user IDs:`, 
              spaceUserIds.length > 0 ? spaceUserIds : 'NO USERS');
          }
          
          // Only match users by exact ID match
          const spaceUsers = usersInSpaces.get(space.id) || [];
          
          const isHighlighted = props.highlightedSpaceId === space.id;
          const userInSpace = isUserInSpace(space);
          
          return (
            <SpaceElement
              key={space.id || index}
              space={space}
              usersInSpace={spaceUsers}
              onEnterSpace={handleEnterSpace}
              onOpenChat={props.onOpenChat}
              onSpaceDoubleClick={props.onSpaceDoubleClick}
              isHighlighted={isHighlighted}
              isUserInSpace={userInSpace}
            />
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
