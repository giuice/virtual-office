// src/hooks/useNeighborhoodFilters.ts
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Space, Neighborhood } from '@/types/database';

const STORAGE_KEY = 'vo-neighborhood-filters';

export interface NeighborhoodFiltersState {
  /** Set of active neighborhood IDs (empty means show all) */
  activeFilters: Set<string>;
  /** Toggle a specific neighborhood filter */
  toggleFilter: (neighborhoodId: string) => void;
  /** Show all spaces (clear all filters) */
  showAll: () => void;
  /** Show only a specific neighborhood */
  showOnly: (neighborhoodId: string) => void;
  /** Check if a neighborhood is active in the filter */
  isActive: (neighborhoodId: string) => boolean;
  /** Check if showing all (no filters active) */
  isShowingAll: boolean;
  /** Filter spaces based on current filter state */
  filterSpaces: (spaces: Space[]) => Space[];
  /** Number of active filters */
  activeCount: number;
}

/**
 * Hook for managing neighborhood filter state with session persistence.
 * 
 * Filter logic:
 * - If no filters are active (empty set), show ALL spaces
 * - If filters are active, show:
 *   - Spaces whose neighborhoodId is in activeFilters
 *   - Ungrouped spaces (no neighborhoodId) are shown when "All" is active (no filters)
 * 
 * @param neighborhoods Array of available neighborhoods (for validation)
 * @returns Filter state and actions
 */
export function useNeighborhoodFilters(
  neighborhoods: Neighborhood[] = []
): NeighborhoodFiltersState {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => {
    // Try to restore from sessionStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            return new Set(parsed);
          }
        }
      } catch {
        // Ignore storage errors
      }
    }
    return new Set();
  });

  // Persist to sessionStorage when filters change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...activeFilters]));
      } catch {
        // Ignore storage errors
      }
    }
  }, [activeFilters]);

  // Clean up filters when neighborhoods change (remove invalid IDs)
  useEffect(() => {
    if (neighborhoods.length > 0 && activeFilters.size > 0) {
      const validIds = new Set(neighborhoods.map(n => n.id));
      const cleanedFilters = new Set(
        [...activeFilters].filter(id => validIds.has(id))
      );
      if (cleanedFilters.size !== activeFilters.size) {
        setActiveFilters(cleanedFilters);
      }
    }
  }, [neighborhoods, activeFilters]);

  const toggleFilter = useCallback((neighborhoodId: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(neighborhoodId)) {
        next.delete(neighborhoodId);
      } else {
        next.add(neighborhoodId);
      }
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  const showOnly = useCallback((neighborhoodId: string) => {
    setActiveFilters(new Set([neighborhoodId]));
  }, []);

  const isActive = useCallback((neighborhoodId: string) => {
    return activeFilters.has(neighborhoodId);
  }, [activeFilters]);

  const isShowingAll = useMemo(() => {
    return activeFilters.size === 0;
  }, [activeFilters]);

  const filterSpaces = useCallback((spaces: Space[]): Space[] => {
    // If no filters active, show all spaces
    if (activeFilters.size === 0) {
      return spaces;
    }

    // Filter to only show spaces in selected neighborhoods
    return spaces.filter(space => {
      // If space has a neighborhoodId, check if it's in active filters
      if (space.neighborhoodId) {
        return activeFilters.has(space.neighborhoodId);
      }
      // Ungrouped spaces are hidden when specific filters are active
      return false;
    });
  }, [activeFilters]);

  const activeCount = useMemo(() => {
    return activeFilters.size;
  }, [activeFilters]);

  return {
    activeFilters,
    toggleFilter,
    showAll,
    showOnly,
    isActive,
    isShowingAll,
    filterSpaces,
    activeCount,
  };
}
