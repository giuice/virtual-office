import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModernFloorPlanGrid } from '@/components/floor-plan/modern/ModernFloorPlanGrid';
import { NeighborhoodIndexRail } from '@/components/floor-plan/modern/NeighborhoodIndexRail';
import type { Neighborhood, Space, UserPresenceData } from '@/types/database';

const neighborhoods: Neighborhood[] = [
  {
    id: 'engineering',
    company_id: 'company-1',
    name: 'Engineering',
    color: '--vo-neighborhood-1',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: 'product',
    company_id: 'company-1',
    name: 'Product',
    color: '--vo-neighborhood-2',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

function createSpace(id: string, name: string, neighborhoodId?: string): Space {
  return {
    id,
    companyId: 'company-1',
    name,
    type: 'workspace',
    status: 'available',
    capacity: 5,
    features: [],
    position: { x: 0, y: 0, width: 1, height: 1 },
    accessControl: { isPublic: true },
    neighborhoodId,
  };
}

const spaces = [
  createSpace('space-1', 'Engineering Room', 'engineering'),
  createSpace('space-2', 'Product Room', 'product'),
  createSpace('space-3', 'Open Lounge'),
];

const engineer: UserPresenceData = {
  id: 'user-1',
  displayName: 'Carla',
  currentSpaceId: 'space-1',
  status: 'online',
};

const loungeUser: UserPresenceData = {
  id: 'user-2',
  displayName: 'Morgan',
  currentSpaceId: 'space-3',
  status: 'online',
};

const usersInSpaces = new Map<string | null, UserPresenceData[]>([
  ['space-1', [engineer]],
  ['space-3', [loungeUser]],
]);

interface NavigationFixtureProps {
  visibleSpaces: Space[];
  visibleNeighborhoods?: Neighborhood[];
  currentSpaceId?: string;
  collapsedNeighborhoodIds?: ReadonlySet<string>;
  isShowingAll?: boolean;
  onShowAll?: () => void;
  onExpandNeighborhood?: (id: string) => void;
}

function NavigationFixture({
  visibleSpaces,
  visibleNeighborhoods = neighborhoods,
  currentSpaceId,
  collapsedNeighborhoodIds = new Set(),
  isShowingAll = true,
  onShowAll = vi.fn(),
  onExpandNeighborhood = vi.fn(),
}: NavigationFixtureProps): ReactNode {
  return (
    <>
      <NeighborhoodIndexRail
        neighborhoods={visibleNeighborhoods}
        spaces={visibleSpaces}
        usersInSpaces={usersInSpaces}
        currentSpaceId={currentSpaceId}
        enableNeighborhoodGrouping
        collapsedNeighborhoodIds={collapsedNeighborhoodIds}
        isShowingAll={isShowingAll}
        onShowAll={onShowAll}
        onExpandNeighborhood={onExpandNeighborhood}
      />
      <ModernFloorPlanGrid
        spaces={visibleSpaces}
        neighborhoods={visibleNeighborhoods}
        usersInSpaces={usersInSpaces}
        enableNeighborhoodGrouping
        collapsedNeighborhoodIds={collapsedNeighborhoodIds}
        onToggleNeighborhood={vi.fn()}
        renderSpaceCard={(space) => <article key={space.id}>{space.name}</article>}
      />
    </>
  );
}

describe('NeighborhoodIndexRail', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  it('matches filtered grid sections, includes Other, and never exposes a missing anchor', () => {
    render(
      <NavigationFixture
        visibleSpaces={[spaces[0], spaces[2]]}
        currentSpaceId="space-3"
      />
    );

    const rail = screen.getByRole('navigation', { name: 'Jump to group' });
    expect(within(rail).getByRole('button', { name: /Engineering/ })).toHaveTextContent('1');
    expect(within(rail).queryByRole('button', { name: /Product/ })).not.toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /Other/ })).toHaveTextContent('◉ you');

    within(rail).getAllByRole('button').forEach((button) => {
      const anchorId = button.getAttribute('aria-controls');
      expect(anchorId).toBeTruthy();
      expect(document.getElementById(anchorId ?? '')).toBeInTheDocument();
    });
  });

  it('does not render rail targets when the grid has no neighborhood sections', () => {
    render(
      <NavigationFixture
        visibleSpaces={[spaces[0], spaces[2]]}
        visibleNeighborhoods={[]}
        currentSpaceId={spaces[2].id}
      />
    );

    expect(screen.queryByRole('navigation', { name: 'Jump to group' })).not.toBeInTheDocument();
    expect(document.querySelector('[id^="nb-sec-"]')).not.toBeInTheDocument();
  });

  it('clears a blocking filter, expands the section, and scrolls to the real grid anchor', async () => {
    const user = userEvent.setup();
    const onShowAll = vi.fn();
    const onExpandNeighborhood = vi.fn();
    render(
      <NavigationFixture
        visibleSpaces={spaces}
        collapsedNeighborhoodIds={new Set(['product'])}
        isShowingAll={false}
        onShowAll={onShowAll}
        onExpandNeighborhood={onExpandNeighborhood}
      />
    );

    const rail = screen.getByRole('navigation', { name: 'Jump to group' });
    await user.click(within(rail).getByRole('button', { name: /Product/ }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
    expect(onExpandNeighborhood).toHaveBeenCalledWith('product');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
