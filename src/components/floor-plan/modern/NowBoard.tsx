// src/components/floor-plan/modern/NowBoard.tsx
// Story 3.10: NowBoard Component - Office pulse summary header
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Space, UserPresenceData, Neighborhood } from '@/types/database';
import { BeaconInfo } from '@/hooks/useBeaconAggregator';
import { NowBoardMetrics } from './NowBoardMetrics';
import { BeaconQueue } from './BeaconQueue';
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
  /** Aggregated beacon list */
  beacons: BeaconInfo[];
  /** Beacon click handler */
  onBeaconClick: (spaceId: string) => void;
  /** Additional CSS classes */
  className?: string;
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
  beacons,
  onBeaconClick,
  className,
}) => {
  // Calculate metrics (AC2 - REUSE existing data)
  const totalSpaces = spaces.length;
  const onlineUsers = users?.length || 0;
  
  // Active meetings = spaces with at least one user
  const activeMeetings = Array.from(usersInSpaces.entries())
    .filter(([spaceId, spaceUsers]) => spaceId !== null && spaceUsers.length > 0)
    .length;

  // Beacon counts from aggregated data
  const normalBeacons = beacons.filter(b => b.severity === 'normal').length;
  const criticalBeacons = beacons.filter(b => b.severity === 'critical').length;

  const handleSearchClear = () => {
    onSearchChange('');
  };

  return (
    <section
      className={cn(
        'now-board',
        // Base layout
        'flex flex-col lg:flex-row items-stretch lg:items-center gap-4 lg:gap-6',
        // Padding
        'p-4 lg:p-5',
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
          totalSpaces={totalSpaces}
          onlineUsers={onlineUsers}
          activeMeetings={activeMeetings}
          normalBeacons={normalBeacons}
          criticalBeacons={criticalBeacons}
        />
      </div>

      {/* Center section: Beacon Queue (if any beacons) */}
      {beacons.length > 0 && (
        <div className="flex-shrink-0 lg:border-l lg:border-r border-[var(--vo-border-subtle)] lg:px-4">
          <BeaconQueue
            beacons={beacons}
            onBeaconClick={onBeaconClick}
            maxVisible={3}
            className="min-w-[180px] max-w-[280px]"
          />
        </div>
      )}

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
          placeholder="Search spaces..."
          className="w-full sm:w-[200px]"
        />
      </div>
    </section>
  );
};

export default NowBoard;
