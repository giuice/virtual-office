import type { ReactNode } from 'react';
import type { Neighborhood, Space, UserPresenceData } from '@/types/database';
import { NeighborhoodSection, UngroupedSection } from './NeighborhoodSection';
import { buildNeighborhoodSections } from './neighborhoodSections';

export interface ModernFloorPlanGridProps {
  spaces: Space[];
  neighborhoods: Neighborhood[];
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  enableNeighborhoodGrouping: boolean;
  collapsedNeighborhoodIds: ReadonlySet<string>;
  onToggleNeighborhood: (neighborhoodId: string) => void;
  renderSpaceCard: (space: Space, index: number) => ReactNode;
  emptyState?: ReactNode;
}

const DEFAULT_EMPTY_STATE = (
  <div className="vo-neighborhood-empty">
    <p>No spaces available</p>
  </div>
);

function peopleInSpaces(
  spaces: Space[],
  usersInSpaces: Map<string | null, UserPresenceData[]>
) {
  return spaces.reduce(
    (total, space) => total + (usersInSpaces.get(space.id)?.length ?? 0),
    0
  );
}

export function ModernFloorPlanGrid({
  spaces,
  neighborhoods,
  usersInSpaces,
  enableNeighborhoodGrouping,
  collapsedNeighborhoodIds,
  onToggleNeighborhood,
  renderSpaceCard,
  emptyState,
}: ModernFloorPlanGridProps) {
  const shouldGroup = enableNeighborhoodGrouping && neighborhoods.length > 0;
  const resolvedEmptyState = emptyState ?? DEFAULT_EMPTY_STATE;

  if (!shouldGroup) {
    return (
      <div className="vo-floor-plan-grid">
        {spaces.map(renderSpaceCard)}
        {spaces.length === 0 ? resolvedEmptyState : null}
      </div>
    );
  }

  const sections = buildNeighborhoodSections(spaces, neighborhoods);

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const sharedProps = {
          spaces: section.spaces,
          index: section.index,
          peopleCount: peopleInSpaces(section.spaces, usersInSpaces),
          capacity: section.spaces.reduce((total, space) => total + space.capacity, 0),
          isCollapsed: collapsedNeighborhoodIds.has(section.id),
          onToggleCollapsed: () => onToggleNeighborhood(section.id),
          children: (
            <div className="vo-floor-plan-grid">
              {section.spaces.map(renderSpaceCard)}
            </div>
          ),
        };

        return section.neighborhood ? (
          <NeighborhoodSection
            key={section.id}
            neighborhood={section.neighborhood}
            {...sharedProps}
          />
        ) : (
          <UngroupedSection key={section.id} {...sharedProps} />
        );
      })}

      {spaces.length === 0 ? resolvedEmptyState : null}
    </div>
  );
}

export default ModernFloorPlanGrid;
