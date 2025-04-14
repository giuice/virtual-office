// src/components/floor-plan/modern/ModernFloorPlan.tsx
import React, { useState, useEffect } from 'react';
import { Space } from '@/types/database';
import { useCompany } from '@/contexts/CompanyContext';
import { usePresence } from '@/contexts/PresenceContext';
import ModernSpaceCard from './ModernSpaceCard';
import { floorPlanTokens } from './designTokens';
import { cn } from '@/lib/utils';

interface ModernFloorPlanProps {
  spaces: Space[];
  onSpaceSelect?: (space: Space) => void;
  onSpaceDoubleClick?: (space: Space) => void;
  onUserClick?: (userId: string) => void;
  highlightedSpaceId?: string | null;
  isEditable?: boolean;
  onOpenChat?: (space: Space) => void;
  layout?: 'default' | 'compact' | 'spaced';
  className?: string;
  compactCards?: boolean;
}

const ModernFloorPlan: React.FC<ModernFloorPlanProps> = ({
  spaces = [],
  onSpaceSelect,
  onSpaceDoubleClick,
  onUserClick,
  highlightedSpaceId = null,
  isEditable = false,
  onOpenChat,
  layout = 'default',
  className = '',
  compactCards = false
}) => {
  const { currentUserProfile } = useCompany();
  const { users, usersInSpaces, isLoading, updateLocation } = usePresence();
  const [lastRequestedSpaceId, setLastRequestedSpaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Log space and user data for debugging (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('--- Modern Floor Plan Debug Info ---');
      console.log('Total spaces:', spaces.length);
      console.log('Total users:', users?.length ?? 0);
      
      // Log presence data by space
      usersInSpaces.forEach((usersInSpace, spaceId) => {
        const spaceName = spaces.find(s => s.id === spaceId)?.name || 'Unknown';
        console.log(`Space "${spaceName}" (${spaceId}) has ${usersInSpace.length} users via presence system:`,
          usersInSpace.map(u => u.displayName).join(', '));
      });
    }
  }, [spaces, users, usersInSpaces]);
  
  // Check if current user is in space
  const isUserInSpace = (space: Space) => {
    if (!currentUserProfile?.id) return false;
    
    // Primary method: Check if user's current_space_id matches this space
    const currentUser = users?.find(u => u.id === currentUserProfile.id);
    
    if (currentUser?.current_space_id === space.id) {
      return true;
    }
    
    return false;
  };

  const handleEnterSpace = async (spaceId: string) => {
    try {
      if (!currentUserProfile?.id) {
        throw new Error('Cannot update location: user ID missing');
      }
  
      const selectedSpace = spaces.find(s => s.id === spaceId);
      if (!selectedSpace) {
        throw new Error('Space not found');
      }
  
      // Space validation checks
      if (selectedSpace.capacity && usersInSpaces.get(spaceId)?.length >= selectedSpace.capacity) {
        setError('This space is at full capacity');
        return;
      }
  
      if (selectedSpace.status !== 'available' && selectedSpace.status !== 'active') {
        setError(`This space is currently ${selectedSpace.status}`);
        return;
      }
  
      const currentUser = users?.find(u => u.id === currentUserProfile.id);
      if (currentUser && currentUser.current_space_id === spaceId) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`User already in space ${spaceId}`);
        }
        return;
      }
  
      setLastRequestedSpaceId(spaceId);  // Set loading state
      setError(null);
      
      try {
        await updateLocation(spaceId);
        setLastRequestedSpaceId(null);  // Reset after success
      } catch (error) {
        console.error('Error updating location:', error);
        setLastRequestedSpaceId(null);
        setError('Failed to enter space. Please try again.');
        if (error instanceof Error) {
          throw error;
        } else {
          throw new Error('Unknown error during location update');
        }
      }
  
      if (selectedSpace) {
        onSpaceSelect?.(selectedSpace);
        onOpenChat?.(selectedSpace);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Space transition failed:', error.message);
        setError(error.message);
      } else {
        console.error('Space transition failed: Unknown error');
        setError('An unknown error occurred');
      }
    }
  };

  // Get grid layout based on selected layout type
  const gridLayoutClass = floorPlanTokens.floorPlanLayout.grid[layout];

  return (
    <div className={cn(
      floorPlanTokens.floorPlanLayout.container.base,
      floorPlanTokens.floorPlanLayout.container.scrollBehavior,
      className
    )}>
      {/* Error message display */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm shadow-md">
            {error}
            <button 
              className="ml-2 font-bold" 
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Grid container for spaces */}
      <div className={gridLayoutClass}>
        {spaces.map((space, index) => {
          // Get users in this space from presence system
          const spaceUsers = usersInSpaces.get(space.id) || [];
          
          const isHighlighted = highlightedSpaceId === space.id;
          const userInSpace = isUserInSpace(space);
          
          return (
            <ModernSpaceCard
              key={space.id || index}
              space={space}
              usersInSpace={spaceUsers}
              onEnterSpace={handleEnterSpace}
              onOpenChat={onOpenChat}
              onUserClick={onUserClick}
              onSpaceDoubleClick={onSpaceDoubleClick}
              isHighlighted={isHighlighted}
              isUserInSpace={userInSpace}
              compact={compactCards}
            />
          );
        })}
        
        {/* Empty state */}
        {spaces.length === 0 && (
          <div className="col-span-full p-8 text-center rounded-lg border border-dashed border-muted-foreground/50">
            <p className="text-muted-foreground">No spaces available</p>
          </div>
        )}
      </div>
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
};

export default ModernFloorPlan;
