'use client';

import type { CSSProperties } from 'react';
import type { Neighborhood, Space, UserPresenceData } from '@/types/database';
import { buildNeighborhoodSections } from './neighborhoodSections';

export interface NeighborhoodIndexRailProps {
  neighborhoods: Neighborhood[];
  spaces: Space[];
  usersInSpaces: Map<string | null, UserPresenceData[]>;
  currentSpaceId?: string;
  enableNeighborhoodGrouping: boolean;
  collapsedNeighborhoodIds: ReadonlySet<string>;
  isShowingAll: boolean;
  onShowAll: () => void;
  onExpandNeighborhood: (neighborhoodId: string) => void;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function NeighborhoodIndexRail({
  neighborhoods,
  spaces,
  usersInSpaces,
  currentSpaceId,
  enableNeighborhoodGrouping,
  collapsedNeighborhoodIds,
  isShowingAll,
  onShowAll,
  onExpandNeighborhood,
}: NeighborhoodIndexRailProps) {
  const shouldGroup = enableNeighborhoodGrouping && neighborhoods.length > 0;
  const sections = shouldGroup
    ? buildNeighborhoodSections(spaces, neighborhoods)
    : [];
  const currentSectionId = currentSpaceId
    ? sections.find((section) => section.spaces.some((space) => space.id === currentSpaceId))?.id
    : undefined;

  const jumpToSection = (sectionId: string) => {
    if (!isShowingAll) {
      onShowAll();
    }
    if (collapsedNeighborhoodIds.has(sectionId)) {
      onExpandNeighborhood(sectionId);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const section = document.getElementById(`nb-sec-${sectionId}`);
        if (!section) {
          console.error(`[NeighborhoodIndexRail] Missing section anchor: ${sectionId}`);
          return;
        }
        section.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    });
  };

  if (sections.length === 0) {
    return null;
  }

  return (
    <nav className="vo-neighborhood-index-rail" aria-label="Jump to group">
      {sections.map((section) => {
        const peopleCount = section.spaces.reduce(
          (total, space) => total + (usersInSpaces.get(space.id)?.length ?? 0),
          0
        );
        const colorStyle = { '--nbc': `var(${section.color})` } as CSSProperties;

        return (
          <button
            key={section.id}
            type="button"
            className="vo-neighborhood-index-button"
            style={colorStyle}
            onClick={() => jumpToSection(section.id)}
            aria-controls={`nb-sec-${section.id}`}
          >
            <span className="vo-neighborhood-index-dot" aria-hidden="true" />
            <span>{section.name}</span>
            <span className="vo-neighborhood-index-count" aria-label={`${peopleCount} people`}>
              {peopleCount}
            </span>
            {currentSectionId === section.id ? (
              <span className="vo-neighborhood-index-you">◉ you</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default NeighborhoodIndexRail;
