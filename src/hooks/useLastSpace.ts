'use client';

import { useEffect, useCallback } from 'react'; // Added useCallback
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Space, User } from '@/types/database';
// Removed useUpdateSpace import
import { useToast } from '@/components/ui/use-toast';

/**
 * Hook to manage user's last space persistence across sessions.
 * IMPORTANT: This hook currently uses the deprecated space.userIds mechanism.
 * It should be refactored to use user.current_space_id updates via /api/users/location.
 * For now, we fix the immediate loop by calling the correct API.
 * @param currentUser The current user profile
 * @param spaces Array of available spaces
 * @returns Object with functions to manage last space
 */
export function useLastSpace(currentUser: User | null, spaces: Space[]) {
  const { toast } = useToast();
  const [lastSpaceId, setLastSpaceId] = useLocalStorage<string | null>('lastSpaceId', null);
  // Removed updateSpaceMutation

  // Define the function to call the correct API endpoint
  const updateUserLocation = useCallback(async (userId: string, spaceId: string | null, spaceName?: string) => {
    try {
      const response = await fetch('/api/users/location', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, spaceId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
        console.error(`[useLastSpace] Failed to update location to space ${spaceId}. Status: ${response.status}`, errorData);
        // Clear the stored space ID if we can't rejoin
        setLastSpaceId(null);
        toast({
          title: "Rejoin Failed",
          description: `Could not rejoin ${spaceName || 'last space'}. Error: ${errorData.message || response.statusText}`,
          variant: "destructive",
        });
      } else {
        if (spaceId && spaceName) {
          toast({
            title: "Rejoined Space",
            description: `You have rejoined ${spaceName}`
          });
        }
        // No need to manually update userIds, rely on presence updates
      }
    } catch (error) {
      console.error(`[useLastSpace] Network error updating location to space ${spaceId}:`, error);
      setLastSpaceId(null); // Clear on network error too
      toast({
        title: "Rejoin Failed",
        description: `Network error trying to rejoin ${spaceName || 'last space'}.`,
        variant: "destructive",
      });
    }
  }, [setLastSpaceId, toast]);


  // When user logs in and spaces are loaded, check if they were in a space
  // and rejoin it if it still exists by updating the user's location
  useEffect(() => {
    // Only proceed if we have a user, spaces are loaded, and we have a stored space ID
    if (!currentUser || !spaces.length || !lastSpaceId) {
      // If there's a user but no lastSpaceId, ensure their location is null if it isn't already
      if (currentUser && currentUser.currentSpaceId !== null) {
         // This might be too aggressive, consider if needed.
         // updateUserLocation(currentUser.id, null); 
      }
      return;
    }

    // Find the space in the current spaces list
    const spaceToRejoin = spaces.find(space => space.id === lastSpaceId);
    
    // If the space exists, attempt to set the user's location to it
    if (spaceToRejoin) {
      // Check if user's current_space_id already matches
      if (currentUser.currentSpaceId !== spaceToRejoin.id) {
        console.log(`[useLastSpace] Attempting to rejoin user ${currentUser.id} to space ${spaceToRejoin.id} (${spaceToRejoin.name})`);
        updateUserLocation(currentUser.id, spaceToRejoin.id, spaceToRejoin.name);
      } else {
        console.log(`[useLastSpace] User ${currentUser.id} already in last space ${spaceToRejoin.id}. No action needed.`);
      }
    } else {
      // If the space no longer exists, clear the stored space ID and ensure user location is null
      console.log(`[useLastSpace] Last space ${lastSpaceId} not found. Clearing stored ID.`);
      setLastSpaceId(null);
      if (currentUser.currentSpaceId !== null) {
        updateUserLocation(currentUser.id, null);
      }
    }
  // Depend on currentUser.id and currentUser.current_space_id for accurate checks
  }, [currentUser?.id, currentUser?.currentSpaceId, spaces, lastSpaceId, updateUserLocation, setLastSpaceId]); 

  /**
   * Save the current space ID when a user enters a space
   * @param spaceId The ID of the space to save
   */
  const saveLastSpace = (spaceId: string) => {
    setLastSpaceId(spaceId);
  };

  /**
   * Clear the saved space ID when a user leaves all spaces
   */
  const clearLastSpace = () => {
    setLastSpaceId(null);
  };

  return {
    lastSpaceId,
    saveLastSpace,
    clearLastSpace
  };
}
