// src/components/floor-plan/modern/NowBoard.tsx
// Story 3.10: NowBoard Component - Office pulse summary header
'use client';

import React from 'react';
import { Grid2X2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Space, UserPresenceData, Neighborhood } from '@/types/database';
import { NowBoardMetrics } from './NowBoardMetrics';
import { NeighborhoodFilters } from './NeighborhoodFilters';
import { SpaceSearch } from './SpaceSearch';

interface NowBoardProps {
  /** All spaces for total count */
  spaces: Space[];
  /** Online users */
  users: UserPresenceData[] | undefined;
  /** Users grouped by space ID */
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  /** Available neighborhoods */
  neighborhoods: Neighborhood[];
  /** Active filter IDs */
  activeFilters: Set<string>;
  /** Filter toggle handler */
  onFilterToggle: (id: string) => void;
  /** Show all handler */
  onShowAll: () => void;
  /** All filter state */
  isShowingAll: boolean;
  /** Current search value */
  searchQuery: string;
  /** Search change handler */
  onSearchChange: (query: string) => void;
  density: 'comfortable' | 'compact';
  onDensityToggle: () => void;
  /** Additional CSS classes */
  className?: string;
}

type EnterableSpace = Pick<Space, 'status'> & { capacity: number | null };

export function isSpaceEnterable(space: EnterableSpace, occupantCount: number) {
  const hasEnterableStatus = space.status === 'active' || space.status === 'available';
  const capacity = space.capacity;
  const isUncapped = !capacity || capacity <= 0;
  return hasEnterableStatus && (isUncapped || occupantCount < capacity);
}

/**
 * NowBoard - Office pulse summary header
 * 
 * Story 3.10 - AC1: NowBoard Component Structure
 * - Replaces existing Status Cards grid
 * - Shows: total spaces, active users, beacons count
 * - Relocates filter chips and search from controls bar
 * - Adds live beacon alerts queue
 * - Glass-morphism styling
 * - Responsive layout
 */
export const NowBoard: React.FC<NowBoardProps> = ({
  spaces,
  users,
  usersInSpaces,
  neighborhoods,
  activeFilters,
  onFilterToggle,
  onShowAll,
  isShowingAll,
  searchQuery,
  onSearchChange,
  density,
  onDensityToggle,
  className,
}) => {
  // Calculate metrics (AC2 - REUSE existing data)
  const onlineUsers = users?.filter((user) => user.isConnected === true).length ?? 0;
  
  // Active meetings = spaces with at least one user
  const activeSpaces = spaces.filter(
    (space) => (usersInSpaces.get(space.id)?.length ?? 0) > 0
  ).length;
  const freeSpaces = spaces.filter((space) => (
    isSpaceEnterable(space, usersInSpaces.get(space.id)?.length ?? 0)
  )).length;

  const handleSearchClear = () => {
    onSearchChange('');
  };

  return (
    <section
      className={cn(
        'now-board',
        // Base layout
        'flex flex-col lg:flex-row items-stretch lg:items-center gap-3',
        // Padding
        'px-3 py-2',
        // Glass-morphism styling (AC7)
        'rounded-xl',
        'border',
        'transition-all duration-300',
        className
      )}
      style={{
        backgroundColor: 'var(--vo-glass-bg)',
        borderColor: 'var(--vo-glass-border)',
        boxShadow: 'var(--vo-glass-shadow)',
        backdropFilter: 'blur(var(--vo-now-board-backdrop-blur, 12px))',
        WebkitBackdropFilter: 'blur(var(--vo-now-board-backdrop-blur, 12px))',
      }}
      aria-label="Office pulse summary"
    >
      {/* Left section: Metrics */}
      <div className="flex-shrink-0">
        <NowBoardMetrics
          onlineUsers={onlineUsers}
          activeSpaces={activeSpaces}
          freeSpaces={freeSpaces}
        />
      </div>

      {/* Right section: Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:ml-auto">
        {/* Neighborhood Filters (AC4 - RELOCATED) */}
        {neighborhoods.length > 0 && (
          <NeighborhoodFilters
            neighborhoods={neighborhoods}
            activeFilters={activeFilters}
            onToggle={onFilterToggle}
            onShowAll={onShowAll}
            isShowingAll={isShowingAll}
          />
        )}

        {/* Space Search (AC5 - RELOCATED & ENHANCED) */}
        <SpaceSearch
          value={searchQuery}
          onChange={onSearchChange}
          onClear={handleSearchClear}
          placeholder="Search spaces or people…"
          className="w-full sm:w-[220px]"
        />

        <button
          type="button"
          className="vo-density-toggle"
          onClick={onDensityToggle}
          aria-pressed={density === 'compact'}
          aria-label={density === 'compact' ? 'Use comfortable density' : 'Use compact density'}
          title="Toggle density"
        >
          <Grid2X2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};

export default NowBoard;
