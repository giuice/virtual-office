// src/hooks/queries/useUserProfile.ts
import { useQuery } from '@tanstack/react-query';
import { getUserById } from '@/lib/api';
import { User } from '@/types/database';
import { companyQueryKeys } from '@/contexts/CompanyContext'; // Assuming query keys are exported from context for now

/**
 * Fetches the user profile for the given Supabase Auth User ID.
 * @param userId The Supabase Auth User ID.
 * @param enabled Optional flag to enable/disable the query.
 */
export function useUserProfile(userId: string | undefined, enabled?: boolean) {
  return useQuery<User | null, Error>({
    // Use the query key defined in CompanyContext (or move keys to a central place)
    queryKey: companyQueryKeys.profile(userId),
    queryFn: async () => {
      if (!userId) return null;
      console.log(`[RQ Query] Fetching user profile for ${userId}`);
      // This function should handle the logic of fetching/syncing the user profile
      // based on the Supabase Auth ID.
      return getUserById(userId);
    },
    enabled: !!userId && (enabled ?? true), // Enable only when userId is available
    staleTime: 5 * 60 * 1000, // Cache profile for 5 minutes
    refetchOnWindowFocus: true,
  });
}
