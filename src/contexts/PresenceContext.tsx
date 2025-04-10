'use client';
import React, { createContext, useContext, ReactNode } from 'react';
import { useUserPresence } from '@/hooks/useUserPresence';
import type { UserPresenceData } from '@/types/database';

interface PresenceContextType {
  users: UserPresenceData[] | undefined;
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  isLoading: boolean;
  error: unknown;
  updateLocation: (spaceId: string | null) => Promise<void>;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider = ({ children }: { children: ReactNode }) => {
  const {
    users,
    usersInSpaces,
    isLoading,
    error,
    updateLocation,
  } = useUserPresence();

  return (
    <PresenceContext.Provider
      value={{
        users,
        usersInSpaces,
        isLoading,
        error,
        updateLocation,
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