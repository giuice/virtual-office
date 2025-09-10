// src/hooks/useAutoRoomConversation.ts
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMessaging } from '@/contexts/messaging/MessagingContext';
import { useSpaces } from '@/hooks/queries/useSpaces';
import { useCompany } from '@/contexts/CompanyContext';

/**
 * Hook to automatically create or join room conversations when user enters spaces
 * Implements Phase 1 of the realtime message integration plan
 * 
 * @param spaceId The space ID the user is currently in
 */
export function useAutoRoomConversation(spaceId: string | null) {
  const { getOrCreateRoomConversation, setActiveConversation } = useMessaging();
  const { user } = useAuth();
  const { company } = useCompany();
  const { data: spaces } = useSpaces(company?.id);
  const lastProcessedSpaceId = useRef<string | null>(null);
  
  useEffect(() => {
    // Prevent duplicate processing for the same space
    if (spaceId && user && spaces && spaceId !== lastProcessedSpaceId.current) {
      console.log(`[useAutoRoomConversation] Auto-creating room conversation for space: ${spaceId}`);
      lastProcessedSpaceId.current = spaceId;
      
      // Find the space to get its name
      const space = spaces.find(s => s.id === spaceId);
      const spaceName = space?.name || 'Unknown Space';
      
      // Auto-create or join room conversation when user enters space
      getOrCreateRoomConversation(spaceId, spaceName)
        .then((conversation) => {
          console.log(`[useAutoRoomConversation] Successfully joined room conversation:`, conversation);
          setActiveConversation(conversation);
        })
        .catch((error) => {
          console.error(`[useAutoRoomConversation] Failed to create room conversation:`, error);
        });
    } else if (!spaceId) {
      // Reset when user leaves all spaces
      lastProcessedSpaceId.current = null;
    }
  }, [spaceId, user?.id, spaces, getOrCreateRoomConversation, setActiveConversation]);

  return { 
    spaceId,
    isEnabled: !!spaceId && !!user 
  };
}