import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyBootstrapError } from '@/contexts/CompanyContext';
import type { Space, UserPresenceData } from '@/types/database';
import { FloorPlan } from '@/components/floor-plan/floor-plan';
import { ModernFloorPlanGrid } from '@/components/floor-plan/modern/ModernFloorPlanGrid';

const mocks = vi.hoisted(() => ({
  companyState: {
    company: null,
    spaces: [] as Space[],
    companyUsers: [],
    isLoading: false,
    currentUserProfile: null,
    bootstrapError: null as CompanyBootstrapError | null,
    refreshCompanyData: vi.fn(async () => undefined),
  },
  presenceState: {
    users: [] as UserPresenceData[] | undefined,
    usersInSpaces: new Map<string | null, UserPresenceData[]>(),
    error: null as unknown,
    retryPresence: vi.fn(),
    realtimeConnectionStatus: 'subscribed',
    saveLastSpace: vi.fn(),
  },
  routerPush: vi.fn(),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => mocks.companyState,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthReady: true }),
}));

vi.mock('@/contexts/PresenceContext', () => ({
  usePresence: () => mocks.presenceState,
}));

vi.mock('@/contexts/messaging/MessagingContext', () => ({
  useMessaging: () => ({
    getOrCreateRoomConversation: vi.fn(),
    setActiveConversation: vi.fn(),
    activeConversation: null,
    setActiveView: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLastSpace', () => ({
  getReconnectionContext: () => ({ spaceId: null }),
  useLastSpace: () => ({
    lastSpaceId: null,
    saveLastSpace: vi.fn(),
    clearLastSpace: vi.fn(),
  }),
}));

vi.mock('@/hooks/queries/useNeighborhoods', () => ({
  useNeighborhoods: () => ({ data: [] }),
}));

vi.mock('@/hooks/useNeighborhoodFilters', () => ({
  useNeighborhoodFilters: () => ({
    activeFilters: new Set(),
    filterSpaces: (spaces: Space[]) => spaces,
    toggleFilter: vi.fn(),
    showAll: vi.fn(),
    isShowingAll: true,
  }),
}));

vi.mock('@/hooks/mutations/useSpaceMutations', () => ({
  useDeleteSpace: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/utils/debug-logger', () => ({
  debugLogger: { log: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/contexts/AudioContext', () => ({
  AudioProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/floor-plan/modern/ModernFloorPlan', () => ({
  default: ({ spaces }: { spaces: Space[] }) => (
    <div data-testid="modern-floor-plan">
      spaces:{spaces.length}:{spaces.map((item) => item.name).join(',')}
    </div>
  ),
}));

vi.mock('@/components/floor-plan/modern/NowBoard', () => ({
  NowBoard: ({ onSearchChange }: { onSearchChange: (query: string) => void }) => (
    <button type="button" onClick={() => onSearchChange('carla')}>Search Carla</button>
  ),
}));
vi.mock('@/components/floor-plan/FloorPlanToolbar', () => ({ FloorPlanToolbar: () => null }));
vi.mock('@/components/floor-plan/space-debug-panel', () => ({ SpaceDebugPanel: () => null }));
vi.mock('@/components/floor-plan/room-dialog/index', () => ({ RoomDialog: () => null }));
vi.mock('@/components/floor-plan/room-management', () => ({ RoomManagement: () => null }));
vi.mock('@/components/floor-plan/room-templates', () => ({ RoomTemplates: () => null }));
vi.mock('@/components/floor-plan/neighborhoods/NeighborhoodManager', () => ({
  NeighborhoodManager: () => null,
}));

const space: Space = {
  id: 'space-1',
  companyId: 'company-1',
  name: 'Studio',
  type: 'workspace',
  status: 'active',
  capacity: 10,
  features: [],
  position: { x: 0, y: 0, width: 1, height: 1 },
  accessControl: { isPublic: true },
};

describe('FloorPlan bootstrap states', () => {
  beforeEach(() => {
    mocks.companyState.spaces = [];
    mocks.companyState.bootstrapError = null;
    mocks.companyState.isLoading = false;
    mocks.companyState.refreshCompanyData.mockClear();
    mocks.presenceState.users = [];
    mocks.presenceState.usersInSpaces = new Map();
    mocks.presenceState.error = null;
    mocks.presenceState.realtimeConnectionStatus = 'subscribed';
    mocks.presenceState.retryPresence.mockClear();
    mocks.routerPush.mockClear();
  });

  afterEach(() => cleanup());

  it('shows a sign-in action when the session is unauthenticated', async () => {
    mocks.companyState.bootstrapError = {
      kind: 'unauthenticated',
      message: 'Unauthorized',
      correlationId: 'corr-auth',
    };

    render(<FloorPlan />);

    expect(screen.getByRole('alert')).toHaveTextContent('Your session has expired');
    expect(screen.queryByText('No spaces available')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.routerPush).toHaveBeenCalledWith('/login');
  });

  it('shows a retryable wait state when bootstrap is rate limited', async () => {
    mocks.companyState.bootstrapError = {
      kind: 'rate-limited',
      message: 'Request rate limit reached',
      correlationId: 'corr-rate',
    };

    render(<FloorPlan />);

    expect(screen.getByRole('alert')).toHaveTextContent('temporarily busy');
    expect(screen.getByRole('alert')).toHaveTextContent('Please wait a moment');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.companyState.refreshCompanyData).toHaveBeenCalledTimes(1);
  });

  it('shows the server message and correlation reference when no spaces were confirmed', () => {
    mocks.companyState.bootstrapError = {
      kind: 'server',
      message: 'Database unavailable',
      correlationId: 'corr-server',
    };

    render(<FloorPlan />);

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your office");
    expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('corr-server');
  });

  it('renders retained spaces with a non-blocking retry banner', () => {
    mocks.companyState.spaces = [space];
    mocks.companyState.bootstrapError = {
      kind: 'server',
      message: 'Refresh failed',
      correlationId: 'corr-retained',
    };

    render(<FloorPlan />);

    expect(screen.getByRole('alert')).toHaveTextContent('Showing saved office data');
    expect(screen.getByRole('alert')).toHaveTextContent('corr-retained');
    expect(screen.getByTestId('modern-floor-plan')).toHaveTextContent('spaces:1');
  });

  it('shows stale presence only while realtime is degraded', () => {
    mocks.companyState.spaces = [space];
    mocks.presenceState.realtimeConnectionStatus = 'degraded';
    const { rerender } = render(<FloorPlan />);

    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting — presence may be out of date');

    mocks.presenceState.realtimeConnectionStatus = 'connecting';
    rerender(<FloorPlan />);
    expect(screen.queryByText('Reconnecting — presence may be out of date')).not.toBeInTheDocument();

    mocks.presenceState.realtimeConnectionStatus = 'subscribed';
    rerender(<FloorPlan />);
    expect(screen.queryByText('Reconnecting — presence may be out of date')).not.toBeInTheDocument();
  });

  it('matches a space when search finds a current occupant name', async () => {
    const secondSpace = { ...space, id: 'space-2', name: 'Lounge' };
    const carla: UserPresenceData = {
      id: 'user-carla',
      displayName: 'Carla Mendes',
      currentSpaceId: secondSpace.id,
      status: 'online',
    };
    mocks.companyState.spaces = [space, secondSpace];
    mocks.presenceState.users = [carla];
    mocks.presenceState.usersInSpaces = new Map([[secondSpace.id, [carla]]]);

    render(<FloorPlan />);
    expect(screen.getByTestId('modern-floor-plan')).toHaveTextContent('spaces:2:Studio,Lounge');
    await userEvent.click(screen.getByRole('button', { name: 'Search Carla' }));
    expect(screen.getByTestId('modern-floor-plan')).toHaveTextContent('spaces:1:Lounge');
  });

  it('blocks an empty-avatar floor plan when the initial Presence snapshot fails', async () => {
    mocks.companyState.spaces = [space];
    mocks.presenceState.users = undefined;
    mocks.presenceState.error = new Error('snapshot unavailable');

    render(<FloorPlan />);

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load live presence");
    expect(screen.queryByTestId('modern-floor-plan')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry live presence' }));
    expect(mocks.presenceState.retryPresence).toHaveBeenCalledTimes(1);
  });

  it('renders the genuine empty state only when bootstrap succeeded', () => {
    render(
      <ModernFloorPlanGrid
        spaces={[]}
        neighborhoods={[]}
        usersInSpaces={new Map()}
        enableNeighborhoodGrouping={false}
        collapsedNeighborhoodIds={new Set()}
        onToggleNeighborhood={vi.fn()}
        renderSpaceCard={() => null}
        emptyState={<p>Build your first space</p>}
      />
    );

    expect(screen.getByText('Build your first space')).toBeInTheDocument();
    expect(screen.queryByText('No spaces available')).not.toBeInTheDocument();
  });
});
