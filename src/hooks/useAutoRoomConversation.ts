// src/hooks/useAutoRoomConversation.ts
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';

/**
 * Hook to automatically create or join room conversations when user enters spaces
 * Implements Phase 1 of the realtime message integration plan
 * 
 * @param spaceId The space ID the user is currently in
 */
export function useAutoRoomConversation(spaceId: string | null) {
  const { getOrCreateRoomConversation } = useMessaging();
  const { user } = useAuth();
  
  useEffect(() => {
    if (spaceId && user) {
      console.log(`[useAutoRoomConversation] Auto-creating room conversation for space: ${spaceId}`);
      
      // Auto-create or join room conversation when user enters space
      getOrCreateRoomConversation(spaceId)
        .then((conversation) => {
          console.log(`[useAutoRoomConversation] Successfully joined room conversation:`, conversation);
        })
        .catch((error) => {
          console.error(`[useAutoRoomConversation] Failed to create room conversation:`, error);
        });
    }
  }, [spaceId, user?.id, getOrCreateRoomConversation]);

  return { 
    spaceId,
    isEnabled: !!spaceId && !!user 
  };
}