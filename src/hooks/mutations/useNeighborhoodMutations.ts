// src/hooks/mutations/useNeighborhoodMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Neighborhood, CreateNeighborhoodData, UpdateNeighborhoodData } from '@/types/database';

// API functions
const createNeighborhood = async (data: CreateNeighborhoodData): Promise<Neighborhood> => {
  const response = await fetch('/api/neighborhoods', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create neighborhood');
  }

  return response.json();
};

const updateNeighborhood = async ({ 
  id, 
  updates 
}: { 
  id: string; 
  updates: UpdateNeighborhoodData 
}): Promise<Neighborhood> => {
  const response = await fetch(`/api/neighborhoods/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update neighborhood');
  }

  return response.json();
};

const deleteNeighborhood = async (id: string): Promise<void> => {
  const response = await fetch(`/api/neighborhoods/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete neighborhood');
  }
};

const assignSpaceToNeighborhood = async ({ 
  spaceId, 
  neighborhoodId 
}: { 
  spaceId: string; 
  neighborhoodId: string | null 
}): Promise<void> => {
  const response = await fetch(`/api/spaces/${spaceId}/neighborhood`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ neighborhoodId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to assign space to neighborhood');
  }
};

const batchAssignSpaces = async ({ 
  neighborhoodId, 
  spaceIds 
}: { 
  neighborhoodId: string; 
  spaceIds: string[] 
}): Promise<{ assigned: number; failed: number }> => {
  const response = await fetch(`/api/neighborhoods/${neighborhoodId}/spaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to batch assign spaces');
  }

  return response.json();
};

// Mutation hooks
export function useCreateNeighborhood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createNeighborhood,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
    },
  });
}

export function useUpdateNeighborhood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateNeighborhood,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
      queryClient.invalidateQueries({ queryKey: ['neighborhood', data.id] });
    },
  });
}

export function useDeleteNeighborhood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteNeighborhood,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
      // Also invalidate spaces since their neighborhood_id may have been nullified
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

export function useAssignSpaceToNeighborhood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: assignSpaceToNeighborhood,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
    },
  });
}

export function useBatchAssignSpaces() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: batchAssignSpaces,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      queryClient.invalidateQueries({ queryKey: ['neighborhoods'] });
    },
  });
}
