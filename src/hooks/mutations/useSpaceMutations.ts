import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Space } from '@/types/database';
import { SupabaseSpaceRepository } from '@/repositories/implementations/supabase/SupabaseSpaceRepository'; // Corrected import

// Define types based on ISpaceRepository methods
type SpaceCreateData = Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>; // Exclude reservations as it's handled separately
type SpaceUpdateData = Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>>;

// Instantiate the repository
const spaceRepository = new SupabaseSpaceRepository(); // Added instantiation

/**
 * Hook for creating a new space.
 */
export function useCreateSpace() {
  const queryClient = useQueryClient();

  return useMutation<Space, Error, SpaceCreateData>({
    mutationFn: (spaceData) => spaceRepository.create(spaceData),
    onSuccess: (data) => {
      // Invalidate the list of spaces for the specific company
      queryClient.invalidateQueries({ queryKey: ['spaces', data.companyId] });
      // Optionally, you could pre-populate the cache for the new space:
      // queryClient.setQueryData(['space', data.id], data);
    },
    // onError: (error) => { /* Handle error, e.g., show toast */ }
  });
}

/**
 * Hook for updating an existing space.
 */
export function useUpdateSpace() {
  const queryClient = useQueryClient();

  return useMutation<
    Space | null, // Repository update returns Space | null
    Error,
    { id: string; updates: SpaceUpdateData }
  >({
    mutationFn: ({ id, updates }) => spaceRepository.update(id, updates),
    onSuccess: (data, variables) => {
      if (data) {
        // Invalidate the list of spaces for the company
        queryClient.invalidateQueries({ queryKey: ['spaces', data.companyId] });
        // Invalidate the specific space query
        queryClient.invalidateQueries({ queryKey: ['space', variables.id] });
        // Optionally, update the cache directly
        // queryClient.setQueryData(['space', variables.id], data);
      }
    },
    // onError: (error, variables) => { /* Handle error */ }
    // onMutate: async (variables) => { /* Optional: Optimistic update logic */ }
  });
}

/**
 * Hook for deleting a space.
 */
export function useDeleteSpace() {
  const queryClient = useQueryClient();

  return useMutation<
    boolean, // Repository deleteById returns boolean
    Error,
    { id: string; companyId: string } // Need companyId for invalidation
  >({
    mutationFn: ({ id }) => spaceRepository.deleteById(id),
    onSuccess: (data, variables) => {
      if (data) { // Check if deletion was successful
        // Invalidate the list of spaces for the company
        queryClient.invalidateQueries({ queryKey: ['spaces', variables.companyId] });
        // Remove the specific space query from cache if it exists
        queryClient.removeQueries({ queryKey: ['space', variables.id] });
      }
    },
    // onError: (error, variables) => { /* Handle error */ }
  });
}