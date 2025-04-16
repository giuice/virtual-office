import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Space, SpaceType } from "@/types/database";
import type { RoomTemplate } from "@/components/floor-plan/types";
// Existing mutation types
type SpaceCreateData = Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>;
type SpaceUpdateData = Partial<Omit<Space, 'id' | 'createdAt' | 'updatedAt' | 'reservations'>>;



// Create from template type
type CreateFromTemplateData = {
  template: RoomTemplate;
  companyId: string;
  position?: { x: number; y: number; width: number; height: number };
};

// API functions
const createSpace = async (data: SpaceCreateData): Promise<Space> => {
  const response = await fetch('/api/spaces/create', {
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
  const response = await fetch('/api/spaces/update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });

  if (!response.ok) {
    const error = await response.json();
    // Handle 404 specifically - space not found
    if (response.status === 404) {
      console.warn(`Space with ID ${id} not found for update.`);
      // Depending on desired behavior, you might return null or re-throw a specific error
      // For now, let's throw a more specific error to differentiate
      throw new Error(`Space with ID ${id} not found`); 
    }
    // Throw for other non-ok statuses
    throw new Error(error.message || `Failed to update space (status: ${response.status})`);
  }

  return response.json();
};

const createFromTemplate = async ({ template, companyId, position }: CreateFromTemplateData): Promise<Space> => {
  // Convert template to SpaceCreateData
  const spaceData: SpaceCreateData = {
    companyId,
    name: template.name,
    type: template.type as SpaceType,
    status: 'available',
    capacity: template.capacity,
    features: template.features,
    position: position || {
      x: 100,
      y: 100,
      width: template.defaultWidth,
      height: template.defaultHeight
    },
    description: template.description,
    accessControl: { isPublic: template.isPublic },
    isTemplate: false,
  };

  return createSpace(spaceData);
};

const deleteSpace = async (spaceId: string): Promise<string> => {
  const response = await fetch(`/api/spaces/delete?spaceId=${spaceId}`, {
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
    // Destructure variables to get companyId
    onSuccess: (data, variables) => {
      // Invalidate the specific query for the spaces of the relevant company
      // Key structure: ['companies', 'detail', companyId, 'spaces']
      if (variables.companyId) {
        queryClient.invalidateQueries({
          queryKey: ['companies', 'detail', variables.companyId, 'spaces']
        });
        console.log(`Invalidated spaces query for company: ${variables.companyId}`);
      } else {
        // Fallback or warning if companyId wasn't in variables for some reason
        console.warn('Company ID not found in mutation variables, could not invalidate specific spaces query.');
        // Optionally invalidate a broader key, but this might be too aggressive
        // queryClient.invalidateQueries({ queryKey: ['companies', 'detail'] });
      }
    },
    onError: (error) => {
      // Log error for debugging
      console.error("Failed to create space:", error);
    }
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

export function useCreateSpaceFromTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createFromTemplate,
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
