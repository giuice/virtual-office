{/* src/hooks/queries/useSpaces.ts */}
import { useQuery } from '@tanstack/react-query';
import { ISpaceRepository } from '@/repositories/interfaces/ISpaceRepository';
import { Space } from '@/types/database';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository'; // Assuming Supabase implementation

// TODO: Replace with proper dependency injection or service locator pattern
// For now, we instantiate it directly. Consider moving instantiation
// to a central place or using a context if needed elsewhere.
const spaceRepository: ISpaceRepository = new SupabaseSpaceRepository();

/**
 * Fetches all spaces for a given company.
 * @param companyId The ID of the company whose spaces to fetch.
 * @param enabled Optional flag to enable/disable the query. Defaults to true if companyId is provided.
 * @returns The react-query query object.
 */
export function useSpaces(companyId: string | undefined, enabled?: boolean) {
  return useQuery<Space[], Error>({
    // Ensure queryKey is always an array, even if companyId is undefined initially
    queryKey: ['spaces', companyId || 'all'], 
    queryFn: async () => {
      if (!companyId) {
        // Handle the case where companyId is not yet available
        // Depending on requirements, you might return empty array, 
        // throw an error, or wait. Returning empty array for now.
        console.warn('useSpaces called without companyId, returning empty array.');
        return []; 
      }
      // TODO: Add pagination support later if needed
      return await spaceRepository.findByCompany(companyId);
    },
    // Enable the query only when companyId is truthy and the enabled prop is not explicitly false.
    enabled: !!companyId && (enabled ?? true),
    staleTime: 1000 * 60 * 5, // 5 minutes, can override default if needed
  });
}

/**
 * Fetches a single space by its ID.
 * @param spaceId The ID of the space to fetch.
 * @param enabled Optional flag to enable/disable the query. Defaults to true if spaceId is provided.
 * @returns The react-query query object.
 */
export function useSpace(spaceId: string | undefined, enabled?: boolean) {
  return useQuery<Space | null, Error>({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      if (!spaceId) {
        // If spaceId is not provided, return null or handle as needed
        return null;
      }
      return await spaceRepository.findById(spaceId);
    },
    // Enable the query only when spaceId is truthy and the enabled prop is not explicitly false.
    enabled: !!spaceId && (enabled ?? true),
    staleTime: 1000 * 60 * 10, // 10 minutes for single space, potentially less frequently changing
  });
}