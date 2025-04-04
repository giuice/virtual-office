'use client';

import { useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Space, User } from '@/types/database';
import { useUpdateSpace } from './mutations/useSpaceMutations';
import { useToast } from '@/components/ui/use-toast';

/**
 * Hook to manage user's last space persistence across sessions
 * @param currentUser The current user profile
 * @param spaces Array of available spaces
 * @returns Object with functions to manage last space
 */
export function useLastSpace(currentUser: User | null, spaces: Space[]) {
  const { toast } = useToast();
  const [lastSpaceId, setLastSpaceId] = useLocalStorage<string | null>('lastSpaceId', null);
  const updateSpaceMutation = useUpdateSpace();

  // When user logs in and spaces are loaded, check if they were in a space
  // and rejoin it if it still exists
  useEffect(() => {
    const rejoinLastSpace = async () => {
      // Only proceed if we have a user, spaces are loaded, and we have a stored space ID
      if (!currentUser || !spaces.length || !lastSpaceId) return;

      // Find the space in the current spaces list
      const spaceToRejoin = spaces.find(space => space.id === lastSpaceId);
      
      // If the space exists, add the user to it
      if (spaceToRejoin) {
        // Check if user is already in the space
        const isUserInSpace = spaceToRejoin.userIds?.includes(currentUser.id);
        
        if (!isUserInSpace) {
          // Add user to the space
          const updatedUserIds = [...(spaceToRejoin.userIds || []), currentUser.id];
          
          updateSpaceMutation.mutate({
            id: spaceToRejoin.id,
            updates: { userIds: updatedUserIds }
          }, {
            onSuccess: () => {
              toast({
                title: "Rejoined Space",
                description: `You have rejoined ${spaceToRejoin.name}`
              });
            },
            onError: (error: Error) => {
              console.error("Failed to rejoin space:", error);
              // Clear the stored space ID if we can't rejoin
              setLastSpaceId(null);
            }
          });
        }
      } else {
        // If the space no longer exists, clear the stored space ID
        setLastSpaceId(null);
      }
    };

    rejoinLastSpace();
  }, [currentUser, spaces, lastSpaceId, updateSpaceMutation, toast, setLastSpaceId]);

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
