import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { getSpacesByCompany } from '@/lib/api';
import { Space } from '@/types/database';
import { companyQueryKeys } from '@/contexts/CompanyContext'; // Import query keys

/**
 * Hook to fetch spaces for a given company ID.
 * @param companyId The ID of the company.
 * @param enabled Controls whether the query should execute (defaults to true if companyId is provided).
 */
export const useSpaces = (
  companyId: string | undefined,
  enabled: boolean = !!companyId // Enable query only if companyId is truthy
): UseQueryResult<Space[], Error> => {
  return useQuery<Space[], Error>({
    // Use the query key defined in CompanyContext
    queryKey: companyQueryKeys.spaces(companyId),
    queryFn: async () => {
      if (!companyId) {
        // Should not happen if 'enabled' is working correctly, but good practice
        throw new Error('Company ID is required to fetch spaces.');
      }
      return getSpacesByCompany(companyId);
    },
    enabled: enabled, // Control query execution based on the enabled flag
    staleTime: 1000 * 60 * 5, // Cache data for 5 minutes
    refetchOnWindowFocus: false, // Optional: prevent refetching on window focus
  });
};
