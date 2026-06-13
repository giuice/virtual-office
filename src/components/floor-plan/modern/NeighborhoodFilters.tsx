// src/components/floor-plan/modern/NeighborhoodFilters.tsx
'use client';

import React, { useCallback } from 'react';
import { Neighborhood } from '@/types/database';
import { cn } from '@/lib/utils';

interface NeighborhoodFiltersProps {
  /** Available neighborhoods to filter by */
  neighborhoods: Neighborhood[];
  /** Set of active neighborhood IDs */
  activeFilters: Set<string>;
  /** Handler for toggling a filter */
  onToggle: (neighborhoodId: string) => void;
  /** Handler for showing all */
  onShowAll: () => void;
  /** Whether showing all (no filters active) */
  isShowingAll: boolean;
  /** Optional additional class names */
  className?: string;
}

/**
 * NeighborhoodFilters renders filter chips for neighborhood visibility toggle.
 * 
 * Story 3.9 - AC5: Filter Chips in Now Board
 * - Filter chips to show/hide neighborhoods
 * - Multiple neighborhoods can be toggled simultaneously
 * - "All" filter shows all spaces regardless of neighborhood
 * - Keyboard accessible with visible focus states
 */
export const NeighborhoodFilters: React.FC<NeighborhoodFiltersProps> = ({
  neighborhoods,
  activeFilters,
  onToggle,
  onShowAll,
  isShowingAll,
  className,
}) => {
  const handleChipClick = useCallback((e: React.MouseEvent | React.KeyboardEvent, neighborhoodId: string) => {
    e.preventDefault();
    onToggle(neighborhoodId);
  }, [onToggle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, neighborhoodId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(neighborhoodId);
    }
  }, [onToggle]);

  const handleAllClick = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    onShowAll();
  }, [onShowAll]);

  const handleAllKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onShowAll();
    }
  }, [onShowAll]);

  // Don't render if no neighborhoods
  if (neighborhoods.length === 0) {
    return null;
  }

  return (
    <address
      className={cn('vo-neighborhood-filters', className)}
      aria-label="Filter by neighborhood"
    >
      {/* All Chip */}
      <button
        type="button"
        className="vo-neighborhood-chip"
        data-active={isShowingAll}
        onClick={handleAllClick}
        onKeyDown={handleAllKeyDown}
        aria-pressed={isShowingAll}
      >
        All
      </button>

      {/* Neighborhood Chips */}
      {neighborhoods.map(neighborhood => {
        const isActive = activeFilters.has(neighborhood.id);
        
        return (
          <button
            key={neighborhood.id}
            type="button"
            className="vo-neighborhood-chip"
            data-active={isActive}
            onClick={(e) => handleChipClick(e, neighborhood.id)}
            onKeyDown={(e) => handleKeyDown(e, neighborhood.id)}
            aria-pressed={isActive}
            style={{
              '--chip-color': `var(${neighborhood.color})`,
            } as React.CSSProperties}
          >
            <span className="vo-neighborhood-chip-dot" aria-hidden="true" />
            {neighborhood.name}
          </button>
        );
      })}

      {/* Screen reader announcement for filter changes */}
      <output
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isShowingAll
          ? 'Showing all neighborhoods'
          : `Showing ${activeFilters.size} neighborhood${activeFilters.size !== 1 ? 's' : ''}`
        }
      </output>
    </address>
  );
};

export default NeighborhoodFilters;
