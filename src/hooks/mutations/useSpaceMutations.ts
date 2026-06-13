import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Space } from "@/types/database";
// Existing mutation types
type SpaceCreateData = Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>;
type SpaceUpdateData = Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>>;

// API functions
const createSpace = async (data: SpaceCreateData): Promise<Space> => {
  const response = await fetch('/api/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create space');
  }

  return response.json();
};

const updateSpace = async ({ id, updates }: { id: string; updates: SpaceUpdateData }): Promise<Space> => {
  const response = await fetch('/api/spaces', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });

  if (!response.ok) {
    // Handle 404 specifically - space not found
    if (response.status === 404) {
      console.warn(`Space with ID ${id} not found for update.`);
      // Depending on desired behavior, you might return null or re-throw a specific error
      // For now, let's throw a more specific error to differentiate
      throw new Error(`Space with ID ${id} not found`); 
    }
    const error = await response.json();
    // Throw for other non-ok statuses
    throw new Error(error.message || `Failed to update space (status: ${response.status})`);
  }

  return response.json();
};

const deleteSpace = async (spaceId: string): Promise<string> => {
  const response = await fetch(`/api/spaces?id=${spaceId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete space');
  }

  return spaceId;
};

// Mutation hooks
export function useCreateSpace() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createSpace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

export function useUpdateSpace() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateSpace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

export function useDeleteSpace() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteSpace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}
