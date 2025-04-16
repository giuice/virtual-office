// src/hooks/queries/useCompany.ts
import { useQuery } from '@tanstack/react-query';
import { getCompany } from '@/lib/api';
import { Company } from '@/types/database';
import { companyQueryKeys } from '@/contexts/CompanyContext'; // Assuming query keys are exported from context

/**
 * Fetches company details by company ID.
 * @param companyId The ID of the company to fetch.
 * @param enabled Optional flag to enable/disable the query.
 */
export function useCompany(companyId: string | undefined, enabled?: boolean) {
  return useQuery<Company | null, Error>({
    queryKey: companyQueryKeys.detail(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      console.log(`[RQ Query] Fetching company details for ${companyId}`);
      return getCompany(companyId);
    },
    enabled: !!companyId && (enabled ?? true),
    staleTime: 10 * 60 * 1000, // Cache company details for 10 minutes
  });
}
