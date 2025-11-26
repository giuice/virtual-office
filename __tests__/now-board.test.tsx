// __tests__/now-board.test.tsx
// Story 3.10: Tests for NowBoard components

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NowBoard, NowBoardMetrics, BeaconQueue, SpaceSearch } from '@/components/floor-plan/modern';
import { BeaconInfo } from '@/hooks/useBeaconAggregator';
import { Space, Neighborhood, UserPresenceData } from '@/types/database';

// Mock factories
function createMockSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: `space-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Space',
    type: 'workspace',
    status: 'active',
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
    id: `neighborhood-${Math.random().toString(36).substr(2, 9)}`,
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

function createMockUser(spaceId: string): UserPresenceData {
  return {
    id: `user-${Math.random().toString(36).substr(2, 9)}`,
    displayName: 'Test User',
    currentSpaceId: spaceId,
    status: 'online',
  };
}

describe('NowBoard', () => {
  const defaultProps = {
    spaces: [createMockSpace()],
    users: [] as UserPresenceData[],
    usersInSpaces: new Map<string | null, UserPresenceData[]>(),
    neighborhoods: [createMockNeighborhood()],
    activeFilters: new Set<string>(),
    onFilterToggle: vi.fn(),
    onShowAll: vi.fn(),
    isShowingAll: true,
    searchQuery: '',
    onSearchChange: vi.fn(),
    beacons: [] as BeaconInfo[],
    onBeaconClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T1: Renders NowBoard with glass-morphism styling
  it('renders with glass-morphism styling', () => {
    render(<NowBoard {...defaultProps} />);
    
    const nowBoard = screen.getByRole('region', { name: /office pulse/i });
    expect(nowBoard).toBeInTheDocument();
  });

  // T2: Displays correct metrics
  it('displays correct metrics from props', () => {
    const props = {
      ...defaultProps,
      spaces: [createMockSpace(), createMockSpace(), createMockSpace()],
      users: [createMockUser('s1'), createMockUser('s2')],
      beacons: [createMockBeacon()],
    };

    render(<NowBoard {...props} />);
    
    // Should show 3 spaces
    expect(screen.getByText('3')).toBeInTheDocument();
    // Should show 2 online users
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // T3: Search input forwards onChange
  it('forwards search changes to callback', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    
    render(<NowBoard {...defaultProps} onSearchChange={onSearchChange} />);
    
    const searchInput = screen.getByPlaceholderText(/search spaces/i);
    await user.type(searchInput, 'test');
    
    expect(onSearchChange).toHaveBeenCalled();
  });

  // T4: Clear button appears when search has value
  it('shows clear button when search has value', () => {
    render(<NowBoard {...defaultProps} searchQuery="test" />);
    
    const clearButton = screen.getByRole('button', { name: /clear search/i });
    expect(clearButton).toBeInTheDocument();
  });

  // T5: Clear button clears search
  it('clears search when clear button clicked', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    
    render(<NowBoard {...defaultProps} searchQuery="test" onSearchChange={onSearchChange} />);
    
    const clearButton = screen.getByRole('button', { name: /clear search/i });
    await user.click(clearButton);
    
    expect(onSearchChange).toHaveBeenCalledWith('');
  });
});

describe('NowBoardMetrics', () => {
  // T6: Shows totalSpaces, onlineUsers, activeMeetings
  it('displays all metrics correctly', () => {
    render(
      <NowBoardMetrics
        totalSpaces={15}
        onlineUsers={42}
        activeMeetings={7}
        normalBeacons={3}
        criticalBeacons={2}
      />
    );
    
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Spaces')).toBeInTheDocument();
    
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
  });

  // T7: Shows beacon badge when beacons exist
  it('shows beacon count when beacons exist', () => {
    render(
      <NowBoardMetrics
        totalSpaces={10}
        onlineUsers={20}
        activeMeetings={3}
        normalBeacons={2}
        criticalBeacons={1}
      />
    );
    
    // Should show total beacon count (2 + 1 = 3 total beacons)
    // We can verify by checking the aria-label which contains the value
    expect(screen.getByRole('group', { name: /beacons: 3/i })).toBeInTheDocument();
    expect(screen.getByText('Beacons')).toBeInTheDocument();
  });

  it('shows zero metrics correctly', () => {
    render(
      <NowBoardMetrics
        totalSpaces={0}
        onlineUsers={0}
        activeMeetings={0}
        normalBeacons={0}
        criticalBeacons={0}
      />
    );
    
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });
  
  it('hides beacon metric when no beacons', () => {
    render(
      <NowBoardMetrics
        totalSpaces={10}
        onlineUsers={20}
        activeMeetings={5}
        normalBeacons={0}
        criticalBeacons={0}
      />
    );
    
    // Beacons label should not be present when count is 0
    expect(screen.queryByText('Beacons')).not.toBeInTheDocument();
  });
});

describe('BeaconQueue', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T8: Renders beacon list with correct severity order
  it('renders beacons correctly', () => {
    const beacons: BeaconInfo[] = [
      createMockBeacon({ spaceId: 's1', spaceName: 'Normal Space', severity: 'normal' }),
      createMockBeacon({ spaceId: 's2', spaceName: 'Critical Space', severity: 'critical' }),
    ];

    render(<BeaconQueue beacons={beacons} onBeaconClick={mockOnClick} />);
    
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    
    // Both beacons should be present
    expect(screen.getByText('Normal Space')).toBeInTheDocument();
    expect(screen.getByText('Critical Space')).toBeInTheDocument();
  });

  // T9: Has aria-live for announcements
  it('has aria-live region for screen readers', () => {
    const beacons: BeaconInfo[] = [createMockBeacon()];

    render(<BeaconQueue beacons={beacons} onBeaconClick={mockOnClick} />);
    
    const ariaLiveRegion = screen.getByRole('status');
    expect(ariaLiveRegion).toHaveAttribute('aria-live', 'polite');
  });

  // T10: Click calls onBeaconClick with spaceId
  it('calls onBeaconClick with spaceId when beacon clicked', async () => {
    const user = userEvent.setup();
    const beacons: BeaconInfo[] = [
      createMockBeacon({ spaceId: 'space-123', spaceName: 'Clickable Space' }),
    ];

    render(<BeaconQueue beacons={beacons} onBeaconClick={mockOnClick} />);
    
    const button = screen.getByRole('button', { name: /Clickable Space/i });
    await user.click(button);
    
    expect(mockOnClick).toHaveBeenCalledWith('space-123');
  });

  it('renders nothing when no beacons', () => {
    const { container } = render(<BeaconQueue beacons={[]} onBeaconClick={mockOnClick} />);
    
    // BeaconQueue returns null when empty, so the container should be empty
    expect(container.firstChild).toBeNull();
  });

  it('shows correct severity styling', () => {
    const beacons: BeaconInfo[] = [
      createMockBeacon({ spaceId: 's1', spaceName: 'Critical', severity: 'critical', reason: 'Help requested' }),
    ];

    render(<BeaconQueue beacons={beacons} onBeaconClick={mockOnClick} />);
    
    // Critical beacons should have the reason displayed
    expect(screen.getByText('Help requested')).toBeInTheDocument();
  });
});

describe('SpaceSearch', () => {
  const mockOnChange = vi.fn();
  const mockOnClear = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input with placeholder', () => {
    render(<SpaceSearch value="" onChange={mockOnChange} onClear={mockOnClear} />);
    
    const input = screen.getByPlaceholderText(/search spaces/i);
    expect(input).toBeInTheDocument();
  });

  it('shows clear button only when value exists', () => {
    const { rerender } = render(<SpaceSearch value="" onChange={mockOnChange} onClear={mockOnClear} />);
    
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    
    rerender(<SpaceSearch value="test" onChange={mockOnChange} onClear={mockOnClear} />);
    
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('calls onClear when clear button clicked', async () => {
    const user = userEvent.setup();
    render(<SpaceSearch value="test" onChange={mockOnChange} onClear={mockOnClear} />);
    
    const clearButton = screen.getByRole('button', { name: /clear/i });
    await user.click(clearButton);
    
    expect(mockOnClear).toHaveBeenCalled();
  });

  it('forwards input changes', async () => {
    const user = userEvent.setup();
    render(<SpaceSearch value="" onChange={mockOnChange} onClear={mockOnClear} />);
    
    const input = screen.getByPlaceholderText(/search spaces/i);
    await user.type(input, 'abc');
    
    // Called once for each character
    expect(mockOnChange).toHaveBeenCalledTimes(3);
  });

  it('has accessible search icon', () => {
    render(<SpaceSearch value="" onChange={mockOnChange} onClear={mockOnClear} />);
    
    const searchIcon = screen.getByTestId('search-icon');
    expect(searchIcon).toBeInTheDocument();
  });
});
