'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Space, User } from '@/types/database';
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
  const [isRejoinInProgress, setIsRejoinInProgress] = useState(false);
  const [rejoinAttempts, setRejoinAttempts] = useState(0);
  const isUpdatingRef = useRef(false);
  const lastUpdateRef = useRef<string | null>(null);

  // Define the function to call the correct API endpoint with race condition protection
  const updateUserLocation = useCallback(async (userId: string, spaceId: string | null, spaceName?: string) => {
    // Prevent multiple simultaneous updates
    if (isUpdatingRef.current) {
      // console.log(`[useLastSpace] Update already in progress, skipping duplicate request`);
      return;
    }

    // Check if this is the same update we just made
    const updateKey = `${userId}-${spaceId}`;
    if (lastUpdateRef.current === updateKey) {
      // console.log(`[useLastSpace] Same update already processed, skipping: ${updateKey}`);
      return;
    }

    isUpdatingRef.current = true;
    setIsRejoinInProgress(true);
    
    try {
      const response = await fetch('/api/users/location', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, spaceId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
        // console.error(`[useLastSpace] Failed to update location to space ${spaceId}. Status: ${response.status}`, errorData);
        
        // Implement exponential backoff for retries
        const newAttempts = rejoinAttempts + 1;
        setRejoinAttempts(newAttempts);
        
        if (newAttempts < 3) {
          const backoffDelay = Math.pow(2, newAttempts) * 1000;
          // console.log(`[useLastSpace] Retrying in ${backoffDelay}ms (attempt ${newAttempts})`);
          setTimeout(() => {
            updateUserLocation(userId, spaceId, spaceName);
          }, backoffDelay);
          return;
        } else {
          // Clear the stored space ID if we can't rejoin after retries
          setLastSpaceId(null);
          setRejoinAttempts(0);
          toast({
            title: "Rejoin Failed",
            description: `Could not rejoin ${spaceName || 'last space'} after multiple attempts. Error: ${errorData.message || response.statusText}`,
            variant: "destructive",
          });
        }
      } else {
        // Success - mark this update as completed
        lastUpdateRef.current = updateKey;
        setRejoinAttempts(0);
        
        if (spaceId && spaceName) {
          toast({
            title: "Rejoined Space",
            description: `You have rejoined ${spaceName}`
          });
        }
      }
    } catch (error) {
      // console.error(`[useLastSpace] Network error updating location to space ${spaceId}:`, error);
      
      const newAttempts = rejoinAttempts + 1;
      setRejoinAttempts(newAttempts);
      
      if (newAttempts < 3) {
        const backoffDelay = Math.pow(2, newAttempts) * 1000;
        setTimeout(() => {
          updateUserLocation(userId, spaceId, spaceName);
        }, backoffDelay);
        return;
      } else {
        setLastSpaceId(null);
        setRejoinAttempts(0);
        toast({
          title: "Rejoin Failed",
          description: `Network error trying to rejoin ${spaceName || 'last space'} after multiple attempts.`,
          variant: "destructive",
        });
      }
    } finally {
      isUpdatingRef.current = false;
      setIsRejoinInProgress(false);
    }
  }, [setLastSpaceId, toast, rejoinAttempts]);


  // When user logs in and spaces are loaded, check if they were in a space
  // and rejoin it if it still exists by updating the user's location
  useEffect(() => {
    // Prevent execution if already updating or during a rejoin process
    if (isUpdatingRef.current || isRejoinInProgress) {
      // console.log(`[useLastSpace] Update in progress, skipping useEffect execution`);
      return;
    }

    // Only proceed if we have a user, spaces are loaded, and we have a stored space ID
    if (!currentUser || !spaces.length || !lastSpaceId) {
      // If there's a user but no lastSpaceId, ensure their location is null if it isn't already
      if (currentUser && currentUser.currentSpaceId !== null && !isUpdatingRef.current) {
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
        // console.log(`[useLastSpace] Attempting to rejoin user ${currentUser.id} to space ${spaceToRejoin.id} (${spaceToRejoin.name})`);
        updateUserLocation(currentUser.id, spaceToRejoin.id, spaceToRejoin.name);
      } else {
        // console.log(`[useLastSpace] User ${currentUser.id} already in last space ${spaceToRejoin.id}. No action needed.`);
        // Mark this as processed to prevent re-execution
        lastUpdateRef.current = `${currentUser.id}-${spaceToRejoin.id}`;
      }
    } else {
      // If the space no longer exists, clear the stored space ID and ensure user location is null
      // console.log(`[useLastSpace] Last space ${lastSpaceId} not found. Clearing stored ID.`);
      setLastSpaceId(null);
      if (currentUser.currentSpaceId !== null) {
        updateUserLocation(currentUser.id, null);
      }
    }
  // Use stable dependencies and add the new state variables
  }, [currentUser?.id, currentUser?.currentSpaceId, spaces.length, lastSpaceId, updateUserLocation, setLastSpaceId, isRejoinInProgress]); 

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
    clearLastSpace,
    isRejoinInProgress,
    rejoinAttempts
  };
}
