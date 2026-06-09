// src/contexts/CallingContext.tsx
'use client';

import React, { createContext, use, ReactNode } from 'react';
import { useUserCalling } from '@/hooks/useUserCalling';

interface CallingContextType extends ReturnType<typeof useUserCalling> {}

const CallingContext = createContext<CallingContextType | undefined>(undefined);

export const CallingProvider = ({ children }: { children: ReactNode }) => { const callingState = useUserCalling();

  return (
    <CallingContext.Provider value={callingState }>
      {children}
    </CallingContext.Provider>
  );
};

export function useCalling(): CallingContextType { const context = use(CallingContext);
  if (!context) {
    throw new Error('useCalling must be used within a CallingProvider'); }
  return context;
}