// src/hooks/queries/useNeighborhoods.ts
import { useQuery } from '@tanstack/react-query';
import { Neighborhood } from '@/types/database';

export interface NeighborhoodWithCount extends Neighborhood {
  spaceCount: number;
}

/**
 * Fetches all neighborhoods for the current user's company.
 * @param enabled Optional flag to enable/disable the query. Defaults to true.
 * @returns The react-query query object with neighborhoods including space counts.
 */
export function useNeighborhoods(enabled: boolean = true) {
  return useQuery<NeighborhoodWithCount[], Error>({
    queryKey: ['neighborhoods'],
    queryFn: async () => {
      const response = await fetch('/api/neighborhoods');
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch neighborhoods');
      }

      return response.json();
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Fetches a single neighborhood by ID.
 * @param neighborhoodId The ID of the neighborhood to fetch.
 * @param enabled Optional flag to enable/disable the query. Defaults to true if neighborhoodId is provided.
 * @returns The react-query query object.
 */
export function useNeighborhood(neighborhoodId: string | undefined, enabled?: boolean) {
  return useQuery<NeighborhoodWithCount | null, Error>({
    queryKey: ['neighborhood', neighborhoodId],
    queryFn: async () => {
      if (!neighborhoodId) return null;

      const response = await fetch(`/api/neighborhoods/${neighborhoodId}`);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch neighborhood');
      }

      return response.json();
    },
    enabled: !!neighborhoodId && (enabled ?? true),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}
