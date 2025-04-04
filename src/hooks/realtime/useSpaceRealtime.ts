import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { Space } from '@/types/database';

/**
 * Hook to subscribe to real-time updates for spaces
 * Automatically invalidates React Query cache when spaces are updated
 * 
 * @param companyId Optional company ID to filter space updates by company
 * @returns void
 */
export function useSpaceRealtime(companyId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Set up subscription for the spaces table
    const subscription = supabase
      .channel('spaces-changes')
      .on('postgres_changes', {
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'spaces',
        // Optional filter by company_id if provided
        ...(companyId ? { filter: `company_id=eq.${companyId}` } : {})
      }, (payload) => {
        console.log('Supabase real-time update:', payload);
        
        // Handle different event types
        switch (payload.eventType) {
          case 'INSERT':
            // Invalidate spaces list query
            queryClient.invalidateQueries({ queryKey: ['spaces', companyId || 'all'] });
            break;
            
          case 'UPDATE':
            // Invalidate both the specific space query and the spaces list query
            const updatedSpace = payload.new as any;
            queryClient.invalidateQueries({ queryKey: ['space', updatedSpace.id] });
            queryClient.invalidateQueries({ queryKey: ['spaces', companyId || 'all'] });
            
            // Update the space in the cache if it exists
            queryClient.setQueryData(['space', updatedSpace.id], (oldData: Space | undefined) => {
              if (!oldData) return oldData;
              
              // Map from snake_case to camelCase
              return {
                id: updatedSpace.id,
                companyId: updatedSpace.company_id,
                name: updatedSpace.name,
                type: updatedSpace.type,
                status: updatedSpace.status,
                capacity: updatedSpace.capacity,
                features: updatedSpace.features,
                position: updatedSpace.position,
                userIds: updatedSpace.user_ids,
                description: updatedSpace.description,
                accessControl: updatedSpace.access_control,
                createdBy: updatedSpace.created_by,
                isTemplate: updatedSpace.is_template,
                templateName: updatedSpace.template_name,
                createdAt: updatedSpace.created_at,
                updatedAt: updatedSpace.updated_at
              };
            });
            break;
            
          case 'DELETE':
            // Invalidate spaces list query
            queryClient.invalidateQueries({ queryKey: ['spaces', companyId || 'all'] });
            
            // Remove the deleted space from the cache
            const deletedSpace = payload.old as any;
            queryClient.removeQueries({ queryKey: ['space', deletedSpace.id] });
            break;
        }
      })
      .subscribe();

    // Clean up subscription when component unmounts
    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient, companyId]);
}
