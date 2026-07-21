import type { Neighborhood, Space } from '@/types/database';

export const UNGROUPED_SECTION_ID = 'ungrouped';

export interface NeighborhoodSectionModel {
  id: string;
  name: string;
  color: string;
  index: number;
  neighborhood: Neighborhood | null;
  spaces: Space[];
}

export function buildNeighborhoodSections(
  spaces: Space[],
  neighborhoods: Neighborhood[]
): NeighborhoodSectionModel[] {
  const spacesByNeighborhood = new Map<string, Space[]>(
    neighborhoods.map((neighborhood) => [neighborhood.id, []])
  );
  const ungroupedSpaces: Space[] = [];

  spaces.forEach((space) => {
    const neighborhoodSpaces = space.neighborhoodId
      ? spacesByNeighborhood.get(space.neighborhoodId)
      : undefined;
    if (neighborhoodSpaces) {
      neighborhoodSpaces.push(space);
    } else {
      ungroupedSpaces.push(space);
    }
  });

  const sections: NeighborhoodSectionModel[] = neighborhoods.flatMap((neighborhood, index) => {
    const sectionSpaces = spacesByNeighborhood.get(neighborhood.id) ?? [];
    return sectionSpaces.length > 0
      ? [{
          id: neighborhood.id,
          name: neighborhood.name,
          color: neighborhood.color,
          index: index + 1,
          neighborhood,
          spaces: sectionSpaces,
        }]
      : [];
  });

  if (ungroupedSpaces.length > 0) {
    sections.push({
      id: UNGROUPED_SECTION_ID,
      name: 'Other',
      color: '--vo-text-dim',
      index: neighborhoods.length + 1,
      neighborhood: null,
      spaces: ungroupedSpaces,
    });
  }

  return sections;
}
