'use client';
import React, { createContext, useContext, ReactNode } from 'react';
import { useUserPresence } from '@/hooks/useUserPresence';
import { useAutoRoomConversation } from '@/hooks/useAutoRoomConversation';
import { useCompany } from '@/contexts/CompanyContext';
import type { UserPresenceData } from '@/types/database';

interface PresenceContextType {
  users: UserPresenceData[] | undefined;
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  isLoading: boolean;
  error: unknown;
  updateLocation: (spaceId: string | null) => Promise<void>;
  currentUserSpaceId: string | null;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider = ({ children }: { children: ReactNode }) => {
  // Get current user ID from CompanyContext
  const { currentUserProfile } = useCompany();
  const currentUserId = currentUserProfile?.id;

  // Pass the current user ID to useUserPresence
  const {
    users,
    usersInSpaces,
    isLoading,
    error,
    updateLocation,
  } = useUserPresence(currentUserId);

  // Get current user's space ID for messaging integration
  const currentUserSpaceId = users?.find(u => u.id === currentUserId)?.currentSpaceId || null;

  // DISABLED: Auto-manage room conversations based on presence
  // This was causing drawer to auto-open on dashboard with persisted space data
  // TODO: Move conversation opening to floor plan click handlers for explicit navigation only
  // useAutoRoomConversation(currentUserSpaceId);

  // Log for debugging purposes
  if (process.env.NODE_ENV === 'development') {
    // console.log(`[PresenceContext] Current user ID: ${currentUserId || 'not set'}`);
    // console.log(`[PresenceContext] Current user space ID: ${currentUserSpaceId || 'not in space'}`);
  }

  return (
    <PresenceContext.Provider
      value={{
        users,
        usersInSpaces,
        isLoading,
        error,
        updateLocation,
        currentUserSpaceId,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
};

export function usePresence(): PresenceContextType {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return context;
}