// src/components/floor-plan/modern/NeighborhoodSection.tsx
'use client';

import React from 'react';
import { Space, Neighborhood } from '@/types/database';
import { FloorPlanPerspective } from './ModernFloorPlan';
import { cn } from '@/lib/utils';

interface NeighborhoodSectionProps {
  /** The neighborhood this section represents */
  neighborhood: Neighborhood;
  /** Spaces in this neighborhood */
  spaces: Space[];
  /** Current floor plan perspective */
  variant: FloorPlanPerspective;
  /** Children to render (space cards) */
  children: React.ReactNode;
  /** Optional additional class names */
  className?: string;
}

/**
 * NeighborhoodSection wraps a group of space cards with a styled header.
 * Adapts header size based on the current perspective (orbit/analyst/cinema).
 * 
 * Story 3.9 - AC3: Visual Neighborhood Grouping in Grid
 */
export const NeighborhoodSection: React.FC<NeighborhoodSectionProps> = ({
  neighborhood,
  spaces,
  variant,
  children,
  className,
}) => {
  const isCompact = variant === 'analyst';
  const headingId = `neighborhood-${neighborhood.id}`;

  return (
    <section
      className={cn('vo-neighborhood-section', className)}
      aria-labelledby={headingId}
      style={{
        '--neighborhood-color': `var(${neighborhood.color})`,
      } as React.CSSProperties}
    >
      {/* Section Header */}
      <header
        className={cn(
          'vo-neighborhood-header',
          isCompact && 'vo-neighborhood-header-compact'
        )}
        role="heading"
        aria-level={2}
      >
        <span className="vo-neighborhood-color-dot" aria-hidden="true" />
        <h2 id={headingId} className="vo-neighborhood-name">
          {neighborhood.name}
        </h2>
        <span className="vo-neighborhood-count" aria-label={`${spaces.length} spaces`}>
          {spaces.length}
        </span>
      </header>

      {/* Space Cards Grid */}
      {children}
    </section>
  );
};

/**
 * UngroupedSection for spaces without a neighborhood assignment.
 * Uses "Other" as the section name per AC3.
 */
interface UngroupedSectionProps {
  /** Ungrouped spaces */
  spaces: Space[];
  /** Current floor plan perspective */
  variant: FloorPlanPerspective;
  /** Children to render (space cards) */
  children: React.ReactNode;
  /** Optional additional class names */
  className?: string;
}

export const UngroupedSection: React.FC<UngroupedSectionProps> = ({
  spaces,
  variant,
  children,
  className,
}) => {
  const isCompact = variant === 'analyst';

  if (spaces.length === 0) {
    return null;
  }

  return (
    <section
      className={cn('vo-neighborhood-section', className)}
      aria-labelledby="ungrouped-spaces"
    >
      {/* Section Header */}
      <header
        className={cn(
          'vo-neighborhood-header',
          isCompact && 'vo-neighborhood-header-compact'
        )}
        style={{
          '--neighborhood-color': 'var(--vo-text-muted)',
        } as React.CSSProperties}
        role="heading"
        aria-level={2}
      >
        <span className="vo-neighborhood-color-dot" aria-hidden="true" />
        <h2 id="ungrouped-spaces" className="vo-neighborhood-name">
          Other
        </h2>
        <span className="vo-neighborhood-count" aria-label={`${spaces.length} spaces`}>
          {spaces.length}
        </span>
      </header>

      {/* Space Cards Grid */}
      {children}
    </section>
  );
};

export default NeighborhoodSection;
