// src/hooks/queries/useCompanyUsers.ts
import { useQuery } from '@tanstack/react-query';
import { getUsersByCompany } from '@/lib/api';
import { User } from '@/types/database';
import { companyQueryKeys } from '@/contexts/CompanyContext'; // Assuming query keys are exported from context

/**
 * Fetches all users belonging to a specific company.
 * @param companyId The ID of the company.
 * @param enabled Optional flag to enable/disable the query.
 */
export function useCompanyUsers(companyId: string | undefined, enabled?: boolean) {
  return useQuery<User[], Error>({
    queryKey: companyQueryKeys.users(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      console.log(`[RQ Query] Fetching users for company ${companyId}`);
      return getUsersByCompany(companyId);
    },
    enabled: !!companyId && (enabled ?? true),
    staleTime: 5 * 60 * 1000, // Cache user list for 5 minutes
  });
}
