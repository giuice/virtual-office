import React from 'react';
import { Neighborhood, Space } from '@/types/database';
import { NeighborhoodSection, UngroupedSection } from './NeighborhoodSection';

interface ModernFloorPlanGridProps {
  spaces: Space[];
  neighborhoods: Neighborhood[];
  enableNeighborhoodGrouping: boolean;
  perspective: 'orbit' | 'analyst' | 'cinema';
  gridLayoutClass: string;
  gridLayoutStyle: React.CSSProperties;
  renderSpaceCard: (space: Space, index: number) => React.ReactNode;
}

export const ModernFloorPlanGrid: React.FC<ModernFloorPlanGridProps> = ({
  spaces,
  neighborhoods,
  enableNeighborhoodGrouping,
  perspective,
  gridLayoutClass,
  gridLayoutStyle,
  renderSpaceCard,
}) => {
  const shouldGroup = enableNeighborhoodGrouping && neighborhoods.length > 0;

  if (!shouldGroup) {
    return (
      <div className={gridLayoutClass} style={gridLayoutStyle}>
        {spaces.map(renderSpaceCard)}

        {spaces.length === 0 && (
          <div className="col-span-full p-8 text-center rounded-lg border border-dashed border-muted-foreground/50">
            <p className="text-muted-foreground">No spaces available</p>
          </div>
        )}
      </div>
    );
  }

  const grouped = new Map<string, Space[]>();
  const ungrouped: Space[] = [];

  neighborhoods.forEach((neighborhood) => {
    grouped.set(neighborhood.id, []);
  });

  spaces.forEach((space) => {
    if (space.neighborhoodId && grouped.has(space.neighborhoodId)) {
      grouped.get(space.neighborhoodId)!.push(space);
    } else {
      ungrouped.push(space);
    }
  });

  return (
    <div className="space-y-6">
      {neighborhoods.map((neighborhood) => {
        const sectionSpaces = grouped.get(neighborhood.id) || [];
        if (sectionSpaces.length === 0) {
          return null;
        }

        return (
          <NeighborhoodSection
            key={neighborhood.id}
            neighborhood={neighborhood}
            spaces={sectionSpaces}
            variant={perspective}
          >
            <div className={gridLayoutClass} style={gridLayoutStyle}>
              {sectionSpaces.map(renderSpaceCard)}
            </div>
          </NeighborhoodSection>
        );
      })}

      {ungrouped.length > 0 && (
        <UngroupedSection spaces={ungrouped} variant={perspective}>
          <div className={gridLayoutClass} style={gridLayoutStyle}>
            {ungrouped.map(renderSpaceCard)}
          </div>
        </UngroupedSection>
      )}

      {spaces.length === 0 && (
        <div className="p-8 text-center rounded-lg border border-dashed border-muted-foreground/50">
          <p className="text-muted-foreground">No spaces available</p>
        </div>
      )}
    </div>
  );
};

export default ModernFloorPlanGrid;
