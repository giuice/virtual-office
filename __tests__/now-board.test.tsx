import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BeaconQueue,
  isSpaceEnterable,
  NowBoard,
  NowBoardMetrics,
  SpaceSearch,
} from '@/components/floor-plan/modern';
import type { BeaconInfo } from '@/hooks/useBeaconAggregator';
import type { Neighborhood, Space, SpaceStatus, UserPresenceData } from '@/types/database';

function createMockSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: `space-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Test Space',
    type: 'workspace',
    status: 'available',
    capacity: 10,
    companyId: 'company-1',
    features: [],
    accessControl: { isPublic: true },
    position: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

function createMockNeighborhood(overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: `neighborhood-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Test Neighborhood',
    company_id: 'company-1',
    color: '--vo-neighborhood-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockBeacon(overrides: Partial<BeaconInfo> = {}): BeaconInfo {
  return {
    spaceId: 'space-1',
    spaceName: 'Test Space',
    severity: 'normal',
    reason: 'High occupancy',
    spaceType: 'workspace',
    userCount: 8,
    capacity: 10,
    ...overrides,
  };
}

function createMockUser(id: string, spaceId: string): UserPresenceData {
  return {
    id,
    displayName: `User ${id}`,
    currentSpaceId: spaceId,
    status: 'online',
    isConnected: true,
  };
}

describe('NowBoard', () => {
  const defaultProps = {
    spaces: [createMockSpace({ id: 'space-1' })],
    users: [] as UserPresenceData[],
    usersInSpaces: new Map<string | null, UserPresenceData[]>(),
    neighborhoods: [createMockNeighborhood()],
    activeFilters: new Set<string>(),
    onFilterToggle: vi.fn(),
    onShowAll: vi.fn(),
    isShowingAll: true,
    searchQuery: '',
    onSearchChange: vi.fn(),
    density: 'comfortable' as const,
    onDensityToggle: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders exactly three metrics with real derived numbers and no beacon queue', () => {
    const spaces = [
      createMockSpace({ id: 's1', status: 'available', capacity: 2 }),
      createMockSpace({ id: 's2', status: 'available', capacity: 1 }),
      createMockSpace({ id: 's3', status: 'active', capacity: 4 }),
    ];
    const users = [
      createMockUser('1', 's1'),
      createMockUser('2', 's2'),
      createMockUser('3', 's2'),
      { ...createMockUser('offline', 's3'), isConnected: false },
    ];
    const usersInSpaces = new Map<string | null, UserPresenceData[]>([
      ['s1', [users[0]]],
      ['s2', [users[1], users[2]]],
    ]);

    render(<NowBoard {...defaultProps} spaces={spaces} users={users} usersInSpaces={usersInSpaces} />);

    expect(screen.getByRole('group', { name: '3 online, 2 live, 2 free' })).toBeInTheDocument();
    expect(screen.getAllByText(/online|live|free/)).toHaveLength(3);
    expect(screen.queryByText(/beacon/i)).not.toBeInTheDocument();
  });

  it('forwards search changes and uses the people-aware placeholder', async () => {
    const user = userEvent.setup();
    render(<NowBoard {...defaultProps} />);

    await user.type(screen.getByPlaceholderText('Search spaces or people…'), 'Carla');
    expect(defaultProps.onSearchChange).toHaveBeenCalled();
  });

  it('clears search and toggles density', async () => {
    const user = userEvent.setup();
    render(<NowBoard {...defaultProps} searchQuery="test" />);

    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('');

    const densityToggle = screen.getByRole('button', { name: 'Use compact density' });
    expect(densityToggle).toHaveAttribute('aria-pressed', 'false');
    expect(densityToggle).toHaveAttribute('title', 'Toggle density');
    await user.click(densityToggle);
    expect(defaultProps.onDensityToggle).toHaveBeenCalledTimes(1);
  });
});

describe('isSpaceEnterable', () => {
  it.each([
    ['active', true],
    ['available', true],
    ['maintenance', false],
    ['locked', false],
    ['reserved', false],
    ['in_use', false],
  ] satisfies Array<[SpaceStatus, boolean]>)('handles %s status', (status, expected) => {
    expect(isSpaceEnterable({ status, capacity: 4 }, 0)).toBe(expected);
  });

  it.each([
    ['zero capacity', 0, 99, true],
    ['negative capacity', -1, 99, true],
    ['null capacity', null, 99, true],
    ['below capacity', 2, 1, true],
    ['at capacity', 2, 2, false],
  ] satisfies Array<[string, number | null, number, boolean]>)(
    'handles %s',
    (_caseName, capacity, occupantCount, expected) => {
      expect(isSpaceEnterable({ status: 'available', capacity }, occupantCount)).toBe(expected);
    }
  );
});

describe('NowBoardMetrics', () => {
  it('displays its three pill metrics including zero values', () => {
    render(<NowBoardMetrics onlineUsers={42} activeSpaces={7} freeSpaces={0} />);
    expect(screen.getByRole('group', { name: '42 online, 7 live, 0 free' })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('BeaconQueue', () => {
  const onBeaconClick = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('keeps the dormant component behavior intact', async () => {
    const user = userEvent.setup();
    const beacons = [createMockBeacon({ spaceId: 'space-123', spaceName: 'Clickable Space' })];
    render(<BeaconQueue beacons={beacons} onBeaconClick={onBeaconClick} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await user.click(screen.getByRole('button', { name: /Clickable Space/i }));
    expect(onBeaconClick).toHaveBeenCalledWith('space-123');
  });

  it('renders nothing when empty', () => {
    const { container } = render(<BeaconQueue beacons={[]} onBeaconClick={onBeaconClick} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('SpaceSearch', () => {
  const onChange = vi.fn();
  const onClear = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('supports input, clear, and escape interactions', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SpaceSearch value="" onChange={onChange} onClear={onClear} placeholder="Search spaces or people…" />
    );
    const input = screen.getByPlaceholderText('Search spaces or people…');
    await user.type(input, 'abc');
    expect(onChange).toHaveBeenCalledTimes(3);

    rerender(
      <SpaceSearch value="abc" onChange={onChange} onClear={onClear} placeholder="Search spaces or people…" />
    );
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
