// src/components/floor-plan/neighborhoods/NeighborhoodManager.tsx
'use client';

import React, { useState } from 'react';
import { Neighborhood, CreateNeighborhoodData, UpdateNeighborhoodData } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Loader2, FolderOpen } from 'lucide-react';
import { useNeighborhoods, NeighborhoodWithCount } from '@/hooks/queries/useNeighborhoods';
import {
  useCreateNeighborhood,
  useUpdateNeighborhood,
  useDeleteNeighborhood,
} from '@/hooks/mutations/useNeighborhoodMutations';
import { NeighborhoodForm } from './NeighborhoodForm';
import { NeighborhoodDeleteDialog } from './NeighborhoodDeleteDialog';
import { cn } from '@/lib/utils';

interface NeighborhoodManagerProps {
  /** Callback when a neighborhood is selected (for selection mode) */
  onSelect?: (neighborhood: Neighborhood) => void;
  /** Mode: 'manage' for full CRUD, 'select' for selection only */
  mode?: 'manage' | 'select';
  /** Optional additional class names */
  className?: string;
}

/**
 * NeighborhoodManager provides a reusable component for neighborhood CRUD.
 * Can be embedded in existing dialogs or used standalone.
 * 
 * Story 3.9 - AC1: Neighborhood CRUD in Admin Settings
 */
export const NeighborhoodManager: React.FC<NeighborhoodManagerProps> = ({
  onSelect,
  mode = 'manage',
  className,
}) => {
  const { data: neighborhoods = [], isLoading } = useNeighborhoods();
  const createNeighborhood = useCreateNeighborhood();
  const updateNeighborhood = useUpdateNeighborhood();
  const deleteNeighborhood = useDeleteNeighborhood();

  const [showForm, setShowForm] = useState(false);
  const [editingNeighborhood, setEditingNeighborhood] = useState<Neighborhood | undefined>();
  const [deletingNeighborhood, setDeletingNeighborhood] = useState<NeighborhoodWithCount | null>(null);

  const usedColors = neighborhoods.map(n => n.color);

  const handleCreate = async (data: CreateNeighborhoodData | UpdateNeighborhoodData) => {
    // For create, name is required - cast to CreateNeighborhoodData
    if (!data.name) return;
    try {
      await createNeighborhood.mutateAsync(data as CreateNeighborhoodData);
      setShowForm(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdate = async (data: CreateNeighborhoodData | UpdateNeighborhoodData) => {
    if (!editingNeighborhood) return;

    try {
      await updateNeighborhood.mutateAsync({
        id: editingNeighborhood.id,
        updates: data,
      });
      setEditingNeighborhood(undefined);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!deletingNeighborhood) return;

    try {
      await deleteNeighborhood.mutateAsync(deletingNeighborhood.id);
      setDeletingNeighborhood(null);
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show form for create/edit
  if (showForm || editingNeighborhood) {
    return (
      <div className={className}>
        <h3 className="text-lg font-semibold mb-4">
          {editingNeighborhood ? 'Edit Neighborhood' : 'Create Neighborhood'}
        </h3>
        <NeighborhoodForm
          neighborhood={editingNeighborhood}
          onSubmit={editingNeighborhood ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false);
            setEditingNeighborhood(undefined);
          }}
          isSubmitting={createNeighborhood.isPending || updateNeighborhood.isPending}
          usedColors={usedColors}
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Neighborhoods</h3>
        {mode === 'manage' && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-4 mr-2" />
            Add Neighborhood
          </Button>
        )}
      </div>

      {/* Neighborhoods List */}
      {neighborhoods.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <FolderOpen className="size-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              No neighborhoods created yet.
            </p>
            {mode === 'manage' && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="size-4 mr-2" />
                Create Your First Neighborhood
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {neighborhoods.map((neighborhood) => (
            <Card
              key={neighborhood.id}
              className={cn(
                'transition-colors',
                mode === 'select' && 'cursor-pointer hover:bg-accent'
              )}
              onClick={mode === 'select' ? () => onSelect?.(neighborhood) : undefined}
            >
              <CardContent className="flex items-center gap-4 py-3">
                {/* Color Indicator */}
                <div
                  className="size-4 rounded-full flex-shrink-0"
                  style={{ background: `var(${neighborhood.color})` }}
                  aria-hidden="true"
                />

                {/* Name & Description */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{neighborhood.name}</p>
                  {neighborhood.description && (
                    <p className="text-sm text-muted-foreground truncate">
                      {neighborhood.description}
                    </p>
                  )}
                </div>

                {/* Space Count */}
                <span className="text-sm text-muted-foreground flex-shrink-0">
                  {neighborhood.spaceCount} space{neighborhood.spaceCount !== 1 ? 's' : ''}
                </span>

                {/* Actions (manage mode only) */}
                {mode === 'manage' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNeighborhood(neighborhood);
                      }}
                      aria-label={`Edit ${neighborhood.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingNeighborhood(neighborhood);
                      }}
                      aria-label={`Delete ${neighborhood.name}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <NeighborhoodDeleteDialog
        neighborhood={deletingNeighborhood}
        spaceCount={deletingNeighborhood?.spaceCount}
        open={!!deletingNeighborhood}
        onOpenChange={(open) => !open && setDeletingNeighborhood(null)}
        onConfirm={handleDelete}
        isDeleting={deleteNeighborhood.isPending}
      />
    </div>
  );
};
