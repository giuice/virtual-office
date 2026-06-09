// src/components/floor-plan/neighborhoods/NeighborhoodForm.tsx
'use client';

import React, { useRef, useState } from 'react';
import { Neighborhood, CreateNeighborhoodData, UpdateNeighborhoodData } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { 
  getAllNeighborhoodColors, 
  getNeighborhoodColorLabel,
  suggestNeighborhoodColor 
} from '@/lib/neighborhood-colors';
import { cn } from '@/lib/utils';

interface NeighborhoodFormProps {
  /** Existing neighborhood to edit, or undefined for create mode */
  neighborhood?: Neighborhood;
  /** Handler for form submission */
  onSubmit: (data: CreateNeighborhoodData | UpdateNeighborhoodData) => void;
  /** Handler for cancel */
  onCancel: () => void;
  /** Whether the form is submitting */
  isSubmitting?: boolean;
  /** Colors already in use (for suggesting available colors) */
  usedColors?: string[];
}

const EMPTY_USED_COLORS: string[] = [];

/**
 * NeighborhoodForm provides a form for creating/editing neighborhoods.
 * 
 * Story 3.9 - AC1: Neighborhood CRUD in Admin Settings
 */
export const NeighborhoodForm: React.FC<NeighborhoodFormProps> = ({
  neighborhood,
  onSubmit,
  onCancel,
  isSubmitting = false,
  usedColors = EMPTY_USED_COLORS,
}) => {
  const isEditing = !!neighborhood;
  const colors = getAllNeighborhoodColors();

  // Memoize the initial color suggestion to avoid recalculating on every render
  const initialColor = React.useMemo(
    () => neighborhood?.color || suggestNeighborhoodColor(usedColors),
    [neighborhood?.color, usedColors]
  );

  const [name, setName] = useState(neighborhood?.name || '');
  const [description, setDescription] = useState(neighborhood?.description || '');
  const [color, setColor] = useState(initialColor);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const previousNeighborhoodIdRef = useRef(neighborhood?.id);

  // Reset form only when the neighborhood ID changes (switching between edit targets)
  // Not on every parent re-render
  if (previousNeighborhoodIdRef.current !== neighborhood?.id) {
    previousNeighborhoodIdRef.current = neighborhood?.id;
    if (neighborhood) {
      setName(neighborhood.name);
      setDescription(neighborhood.description || '');
      setColor(neighborhood.color);
    } else {
      setName('');
      setDescription('');
      setColor(suggestNeighborhoodColor(usedColors));
    }
    setErrors({});
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.length > 50) {
      newErrors.name = 'Name must be 50 characters or less';
    }

    if (description && description.length > 200) {
      newErrors.description = 'Description must be 200 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name Field */}
      <div className="space-y-2">
        <Label htmlFor="neighborhood-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="neighborhood-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Engineering, Marketing"
          maxLength={50}
          disabled={isSubmitting}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {name.length}/50 characters
        </p>
      </div>

      {/* Description Field */}
      <div className="space-y-2">
        <Label htmlFor="neighborhood-description">Description</Label>
        <Textarea
          id="neighborhood-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description for this neighborhood"
          maxLength={200}
          rows={3}
          disabled={isSubmitting}
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        {errors.description && (
          <p id="description-error" className="text-sm text-destructive">
            {errors.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {description.length}/200 characters
        </p>
      </div>

      {/* Color Picker */}
      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Neighborhood color">
          {colors.map((colorToken) => {
            const isSelected = color === colorToken;
            const label = getNeighborhoodColorLabel(colorToken);

            return (
              <button
                key={colorToken}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={label}
                className={cn(
                  'size-8 rounded-full border-2 transition-all',
                  'hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected 
                    ? 'border-foreground ring-2 ring-ring ring-offset-2' 
                    : 'border-transparent'
                )}
                style={{ background: `var(${colorToken})` }}
                onClick={() => setColor(colorToken)}
                disabled={isSubmitting}
                title={label}
              />
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Selected: {getNeighborhoodColorLabel(color)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              {isEditing ? 'Saving...' : 'Creating...'}
            </>
          ) : (
            isEditing ? 'Save Changes' : 'Create Neighborhood'
          )}
        </Button>
      </div>
    </form>
  );
};
