// src/hooks/useGroupedSpaces.ts
import { useMemo } from 'react';
import { Space, Neighborhood } from '@/types/database';

export interface GroupedSpacesResult {
  /** Map of neighborhood ID to spaces in that neighborhood */
  grouped: Map<string, Space[]>;
  /** Spaces without a neighborhood assignment */
  ungrouped: Space[];
  /** All neighborhoods in order */
  neighborhoods: Neighborhood[];
  /** Total count of spaces */
  totalCount: number;
}

/**
 * Groups spaces by their neighborhood_id for rendering.
 * Maintains consistent ordering based on the provided neighborhoods array.
 * 
 * @param spaces Array of spaces to group
 * @param neighborhoods Array of neighborhoods (determines ordering)
 * @returns Object with grouped spaces, ungrouped spaces, and neighborhoods
 */
export function useGroupedSpaces(
  spaces: Space[],
  neighborhoods: Neighborhood[]
): GroupedSpacesResult {
  return useMemo(() => {
    // Create a map for grouped spaces
    const grouped = new Map<string, Space[]>();
    const ungrouped: Space[] = [];

    // Initialize the map with empty arrays for each neighborhood (maintains order)
    neighborhoods.forEach(neighborhood => {
      grouped.set(neighborhood.id, []);
    });

    // Group spaces
    spaces.forEach(space => {
      if (space.neighborhoodId && grouped.has(space.neighborhoodId)) {
        grouped.get(space.neighborhoodId)!.push(space);
      } else if (space.neighborhoodId) {
        // Space has a neighborhood_id but it's not in the neighborhoods array
        // This could happen if a neighborhood was deleted
        ungrouped.push(space);
      } else {
        // No neighborhood assigned
        ungrouped.push(space);
      }
    });

    // Sort spaces within each group by name for consistency
    grouped.forEach((groupSpaces, key) => {
      grouped.set(key, groupSpaces.sort((a, b) => a.name.localeCompare(b.name)));
    });

    // Sort ungrouped spaces by name
    ungrouped.sort((a, b) => a.name.localeCompare(b.name));

    return {
      grouped,
      ungrouped,
      neighborhoods,
      totalCount: spaces.length,
    };
  }, [spaces, neighborhoods]);
}

/**
 * Flattens grouped spaces back into a single array in neighborhood order.
 * Useful for rendering a flat list with section headers.
 * 
 * @param groupedResult The result from useGroupedSpaces
 * @returns Array of items that are either neighborhood headers or spaces
 */
export type GroupedSpaceItem = 
  | { type: 'header'; neighborhood: Neighborhood; count: number }
  | { type: 'space'; space: Space }
  | { type: 'ungrouped-header'; count: number };

function flattenGroupedSpaces(
  groupedResult: GroupedSpacesResult
): GroupedSpaceItem[] {
  const items: GroupedSpaceItem[] = [];

  // Add grouped spaces with headers
  groupedResult.neighborhoods.forEach(neighborhood => {
    const spaces = groupedResult.grouped.get(neighborhood.id) || [];
    if (spaces.length > 0) {
      items.push({ type: 'header', neighborhood, count: spaces.length });
      spaces.forEach(space => {
        items.push({ type: 'space', space });
      });
    }
  });

  // Add ungrouped spaces
  if (groupedResult.ungrouped.length > 0) {
    items.push({ type: 'ungrouped-header', count: groupedResult.ungrouped.length });
    groupedResult.ungrouped.forEach(space => {
      items.push({ type: 'space', space });
    });
  }

  return items;
}
