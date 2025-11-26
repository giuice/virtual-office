// src/components/floor-plan/neighborhoods/NeighborhoodDeleteDialog.tsx
'use client';

import React from 'react';
import { Neighborhood } from '@/types/database';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';

interface NeighborhoodDeleteDialogProps {
  /** Neighborhood to delete */
  neighborhood: Neighborhood | null;
  /** Number of spaces that will be orphaned */
  spaceCount?: number;
  /** Whether the dialog is open */
  open: boolean;
  /** Handler for dialog open state change */
  onOpenChange: (open: boolean) => void;
  /** Handler for confirming deletion */
  onConfirm: () => void;
  /** Whether deletion is in progress */
  isDeleting?: boolean;
}

/**
 * NeighborhoodDeleteDialog provides a confirmation dialog for neighborhood deletion.
 * Warns about orphaned spaces that will lose their neighborhood assignment.
 * 
 * Story 3.9 - AC1: Neighborhood CRUD in Admin Settings
 */
export const NeighborhoodDeleteDialog: React.FC<NeighborhoodDeleteDialogProps> = ({
  neighborhood,
  spaceCount = 0,
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}) => {
  if (!neighborhood) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Neighborhood
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Are you sure you want to delete the neighborhood{' '}
                <strong>&quot;{neighborhood.name}&quot;</strong>?
              </p>
              
              {spaceCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md text-destructive-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
                  <div className="text-sm">
                    <p className="font-medium">
                      {spaceCount} space{spaceCount !== 1 ? 's' : ''} will become ungrouped
                    </p>
                    <p className="text-muted-foreground">
                      These spaces will no longer belong to any neighborhood and will appear
                      in the &quot;Other&quot; section.
                    </p>
                  </div>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                This action cannot be undone.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isDeleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Neighborhood'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default NeighborhoodDeleteDialog;
