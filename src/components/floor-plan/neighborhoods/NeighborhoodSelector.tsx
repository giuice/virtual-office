// src/components/floor-plan/neighborhoods/NeighborhoodSelector.tsx
'use client';

import React, { useState } from 'react';
import { Neighborhood } from '@/types/database';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Loader2 } from 'lucide-react';
import { useNeighborhoods } from '@/hooks/queries/useNeighborhoods';
import { useCreateNeighborhood } from '@/hooks/mutations/useNeighborhoodMutations';
import { suggestNeighborhoodColor } from '@/lib/neighborhood-colors';
import { cn } from '@/lib/utils';

interface NeighborhoodSelectorProps {
  /** Currently selected neighborhood ID */
  value: string | null | undefined;
  /** Handler for selection change */
  onChange: (neighborhoodId: string | null) => void;
  /** Optional placeholder text */
  placeholder?: string;
  /** Optional additional class names */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * NeighborhoodSelector provides a dropdown to select or create a neighborhood.
 * Used in RoomDialog for assigning spaces to neighborhoods.
 * 
 * Story 3.9 - AC2: Space Assignment to Neighborhoods
 */
export const NeighborhoodSelector: React.FC<NeighborhoodSelectorProps> = ({
  value,
  onChange,
  placeholder = 'Select neighborhood',
  className,
  disabled = false,
}) => {
  const { data: neighborhoods = [], isLoading } = useNeighborhoods();
  const createNeighborhood = useCreateNeighborhood();
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const usedColors = neighborhoods.map(n => n.color);
    const color = suggestNeighborhoodColor(usedColors);

    try {
      const created = await createNeighborhood.mutateAsync({
        name: newName.trim(),
        color,
      });
      onChange(created.id);
      setNewName('');
      setShowCreateForm(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      setShowCreateForm(false);
      setNewName('');
    }
  };

  if (showCreateForm) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Neighborhood name"
          className="flex-1"
          autoFocus
          disabled={createNeighborhood.isPending}
        />
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          disabled={!newName.trim() || createNeighborhood.isPending}
        >
          {createNeighborhood.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            'Add'
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setShowCreateForm(false);
            setNewName('');
          }}
          disabled={createNeighborhood.isPending}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || 'none'}
      onValueChange={(val) => onChange(val === 'none' ? null : val)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? 'Loading...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <span className="text-muted-foreground">None</span>
        </SelectItem>
        
        {neighborhoods.map((neighborhood) => (
          <SelectItem key={neighborhood.id} value={neighborhood.id}>
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: `var(${neighborhood.color})` }}
              />
              {neighborhood.name}
            </div>
          </SelectItem>
        ))}

        <div className="border-t my-1" />
        
        <button
          type="button"
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowCreateForm(true);
          }}
        >
          <Plus className="size-4" />
          Create New
        </button>
      </SelectContent>
    </Select>
  );
};
