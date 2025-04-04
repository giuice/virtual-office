'use client';

import { useSpaceRealtime } from '@/hooks/realtime';
import { useCompany } from '@/contexts/CompanyContext';

/**
 * Provider component that sets up real-time subscriptions for spaces
 * This component doesn't render anything visible, it just sets up the subscription
 */
export function SpaceRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { company } = useCompany();
  
  // Set up the real-time subscription using the hook
  // This will automatically invalidate React Query caches when spaces change
  useSpaceRealtime(company?.id);
  
  // Just render children - this component doesn't add any UI
  return <>{children}</>;
}
