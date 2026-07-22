import { useState } from 'react';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModernSpaceCard from '@/components/floor-plan/modern/ModernSpaceCard';
import type { Space, SpaceStatus, UserPresenceData } from '@/types/database';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'auth-viewer' } }),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({
    currentUserProfile: { id: 'viewer', role: 'member' },
    companyUsers: [],
  }),
}));

vi.mock('@/contexts/messaging/MessagingContext', () => ({
  useMessaging: () => ({
    getOrCreateUserConversation: vi.fn(),
    setActiveConversation: vi.fn(),
    openDrawer: vi.fn(),
  }),
}));

vi.mock('@/contexts/PresenceContext', () => ({
  usePresence: () => ({ usersInSpaces: new Map() }),
}));

vi.mock('@/components/floor-plan/modern/SpaceDetailPanel', () => ({
  SpaceDetailPanel: () => <div role="region" aria-label="Details for test space" />,
}));

vi.mock('@/components/floor-plan/modern/SpaceDetailBottomSheet', () => ({
  SpaceDetailBottomSheet: ({ open }: { open: boolean }) => open
    ? <div role="dialog" aria-label="Mobile details for test space" />
    : null,
}));

function createSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: 'space-1',
    companyId: 'company-1',
    name: 'Design Studio',
    type: 'workspace',
    status: 'available',
    capacity: 4,
    features: [],
    position: { x: 0, y: 0, width: 100, height: 100 },
    accessControl: { isPublic: true },
    ...overrides,
  };
}

function createUser(index: number, overrides: Partial<UserPresenceData> = {}): UserPresenceData {
  return {
    id: `user-${index}`,
    displayName: `User ${index}`,
    currentSpaceId: 'space-1',
    status: 'online',
    isConnected: true,
    isOccupyingCurrentSpace: true,
    ...overrides,
  };
}

function renderCard({
  space = createSpace(),
  users = [],
  onEnterSpace = vi.fn(),
  onKnock,
  onUserClick,
  state = { directEnter: true, detailPanel: false },
  ...props
}: {
  space?: Space;
  users?: UserPresenceData[];
  onEnterSpace?: (spaceId: string) => void;
  onKnock?: (spaceId: string) => void;
  onUserClick?: (userId: string) => void;
  state?: {
    highlighted?: boolean;
    userInSpace?: boolean;
    admin?: boolean;
    compact?: boolean;
    detailPanel?: boolean;
    directEnter?: boolean;
  };
  speakingUserIds?: string[];
  presentingUserId?: string;
  knockStatus?: 'idle' | 'knocking' | 'approved' | 'denied' | 'timeout' | 'cooldown';
  knockCooldownRemaining?: number;
}) {
  function ControlledCard() {
    const [detailOpen, setDetailOpen] = useState(false);
    return (
      <ModernSpaceCard
        space={space}
        usersInSpace={users}
        onEnterSpace={onEnterSpace}
        onKnock={onKnock}
        onUserClick={onUserClick}
        state={state}
        detailOpen={detailOpen}
        onDetailOpenChange={setDetailOpen}
        {...props}
      />
    );
  }

  const result = render(<ControlledCard />);
  return { ...result, onEnterSpace };
}

describe('ModernSpaceCard 2B', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
    document.documentElement.dataset.density = 'comfortable';
  });

  it('renders an empty slot, capacity bar, and a single Enter action', async () => {
    const user = userEvent.setup();
    const onEnterSpace = vi.fn();
    renderCard({ onEnterSpace });

    expect(screen.getByText('Empty — available')).toBeInTheDocument();
    expect(screen.getByText('✨ Empty — be the first')).toBeInTheDocument();
    expect(screen.getByTestId('space-card-capacity')).toHaveTextContent('0/4');
    expect(screen.getByTestId('space-card-capbar')).toBeInTheDocument();
    expect(screen.getAllByTestId('space-card-action')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(onEnterSpace).toHaveBeenCalledWith('space-1');
  });

  it('renders occupants, first-name activity, and truthful count', () => {
    renderCard({ users: [createUser(1, { displayName: 'Alice Santos' })] });

    expect(screen.getByText('Alice is here')).toBeInTheDocument();
    expect(screen.getByLabelText("Alice Santos's avatar - click for options")).toBeInTheDocument();
    expect(screen.getByTestId('space-card-capacity')).toHaveTextContent('1/4');
  });

  it.each([
    ['active', true],
    ['available', true],
    ['maintenance', false],
    ['locked', false],
    ['reserved', false],
    ['in_use', false],
  ] satisfies Array<[SpaceStatus, boolean]>)('uses truthful public action for %s', (status, enterable) => {
    renderCard({ space: createSpace({ status, accessControl: { isPublic: true } }) });

    if (enterable) {
      expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled();
    } else {
      expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    }
  });

  it.each([
    'active',
    'available',
    'maintenance',
    'locked',
    'reserved',
    'in_use',
  ] satisfies SpaceStatus[])('preserves Knock for a private %s space', (status) => {
    renderCard({
      space: createSpace({ status, accessControl: { isPublic: false } }),
      onKnock: vi.fn(),
      state: { directEnter: false, detailPanel: false },
    });

    expect(screen.getByRole('button', { name: 'Knock' })).toBeEnabled();
  });

  it.each(['locked', 'maintenance', 'reserved'] as const)(
    'keeps the exceptional %s status visible',
    (status) => {
      renderCard({ space: createSpace({ status }) });
      expect(screen.getByText(new RegExp(status, 'i'))).toBeInTheDocument();
    }
  );

  it('shows FULL and disables entry at the real capacity limit', () => {
    renderCard({
      space: createSpace({ capacity: 2 }),
      users: [createUser(1), createUser(2)],
    });

    expect(screen.getByRole('status')).toHaveTextContent('FULL');
    expect(screen.getByText('Full', { selector: '.vo-space-card-activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full' })).toBeDisabled();
    expect(screen.getByTestId('space-card-capacity')).toHaveClass('vo-space-card-capacity--full');
  });

  it.each([
    ['zero', 0],
    ['null', null],
  ])('treats %s capacity as unlimited', (_caseName, capacity) => {
    renderCard({
      space: createSpace({ capacity: capacity as unknown as number }),
      users: [createUser(1), createUser(2)],
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('space-card-capbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('space-card-capacity')).toHaveTextContent(/^2$/);
    expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled();
  });

  it('uses the knock-only action and never calls Enter from it', async () => {
    const user = userEvent.setup();
    const onEnterSpace = vi.fn();
    const onKnock = vi.fn();
    renderCard({
      space: createSpace({ accessControl: { isPublic: false } }),
      users: [createUser(1)],
      onEnterSpace,
      onKnock,
      state: { directEnter: false, detailPanel: false },
    });

    expect(screen.getByLabelText('Private space')).toBeInTheDocument();
    const knockButton = screen.getByRole('button', { name: 'Knock' });
    expect(knockButton).toHaveTextContent('🚪 Knock');
    await user.click(knockButton);
    expect(onKnock).toHaveBeenCalledWith('space-1');
    expect(onEnterSpace).not.toHaveBeenCalled();
  });

  it.each([
    ['knocking', 0, 'Knocking...'],
    ['cooldown', 17, 'Wait 17s'],
  ] as const)('disables knock while %s', (knockStatus, knockCooldownRemaining, label) => {
    renderCard({
      users: [createUser(1)],
      onKnock: vi.fn(),
      state: { directEnter: false, detailPanel: false },
      knockStatus,
      knockCooldownRemaining,
    });

    expect(screen.getByRole('button', { name: label })).toBeDisabled();
  });

  it('marks the current space with YOU and a disabled action', () => {
    renderCard({
      users: [createUser(1, { id: 'viewer', displayName: 'Current User' })],
      state: { directEnter: true, userInSpace: true, detailPanel: false },
    });

    expect(screen.getByText('YOU')).toBeInTheDocument();
    expect(screen.getByText("You're here", { selector: '.vo-space-card-activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "You're here" })).toBeDisabled();
    expect(screen.getByTestId('space-space-1')).toHaveClass('vo-space-card--own');
  });

  it('shows LIVE for the production speaking signal', () => {
    renderCard({ users: [createUser(1)], speakingUserIds: ['user-1'] });

    expect(screen.getByRole('status')).toHaveTextContent('LIVE');
    expect(screen.getByText('Live meeting')).toBeInTheDocument();
  });

  it('keeps presentingUserId as a future prop-contract signal', () => {
    // ModernFloorPlan does not provide presenter data today; production LIVE comes from speakingUserIds.
    renderCard({ users: [createUser(1)], presentingUserId: 'user-1' });

    expect(screen.getByRole('status')).toHaveTextContent('LIVE');
    expect(screen.getByText('Live meeting')).toBeInTheDocument();
  });

  it('omits LIVE without active audio and ignores signals from non-occupants', () => {
    renderCard({ users: [createUser(1)], speakingUserIds: ['someone-else'] });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Live meeting')).not.toBeInTheDocument();
  });

  it('prioritizes LIVE over FULL when both real states apply', () => {
    renderCard({
      space: createSpace({ capacity: 1 }),
      users: [createUser(1)],
      speakingUserIds: ['user-1'],
    });

    expect(screen.getByRole('status')).toHaveTextContent('LIVE');
    expect(screen.queryByText('FULL')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full' })).toBeDisabled();
  });

  it('shows the exact overflow for 30 occupants', () => {
    renderCard({
      space: createSpace({ capacity: 40 }),
      users: Array.from({ length: 30 }, (_, index) => createUser(index + 1)),
    });

    expect(screen.getByRole('button', { name: '23 more participants' })).toHaveTextContent('+23');
    expect(screen.getByTestId('space-card-capacity')).toHaveTextContent('30/40');
  });

  it('routes avatar clicks to the person action without entering the space', async () => {
    const user = userEvent.setup();
    const onEnterSpace = vi.fn();
    const onUserClick = vi.fn();
    renderCard({
      users: [createUser(1, { displayName: 'Alice Santos' })],
      onEnterSpace,
      onUserClick,
    });

    expect(screen.queryByRole('button', {
      name: "Alice Santos's avatar - click for options",
    })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'User Alice Santos' }));
    expect(onUserClick).toHaveBeenCalledWith('user-1');
    expect(onEnterSpace).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('space-space-1'));
    expect(onEnterSpace).toHaveBeenCalledWith('space-1');
  });

  it('opens the desktop detail panel from a body click without entering', async () => {
    const user = userEvent.setup();
    const onEnterSpace = vi.fn();
    const onKnock = vi.fn();
    renderCard({
      users: [createUser(1)],
      onEnterSpace,
      onKnock,
      state: { directEnter: false, detailPanel: true },
    });

    await user.click(screen.getByTestId('space-space-1'));
    expect(screen.getByRole('region', { name: 'Details for test space' })).toBeInTheDocument();
    expect(onEnterSpace).not.toHaveBeenCalled();
    expect(onKnock).not.toHaveBeenCalled();
  });

  it('opens the mobile bottom sheet from a card tap', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 640, writable: true });
    window.dispatchEvent(new Event('resize'));
    const user = userEvent.setup();
    const onEnterSpace = vi.fn();
    renderCard({
      onEnterSpace,
      state: { directEnter: true, detailPanel: true },
    });

    await user.click(screen.getByTestId('space-space-1'));
    expect(screen.getByRole('dialog', { name: 'Mobile details for test space' })).toBeInTheDocument();
    expect(onEnterSpace).not.toHaveBeenCalled();
  });

  it('keeps legacy per-card Knock banner props out of the public interface', () => {
    type CardProps = React.ComponentProps<typeof ModernSpaceCard>;
    type RemovedProps = Extract<
      keyof CardProps,
      'pendingKnockRequest' | 'knockResponsePending' | 'onKnockApprove' | 'onKnockDeny'
    >;
    expectTypeOf<RemovedProps>().toEqualTypeOf<never>();
  });

  it('keeps the interaction menu as the only avatar action without onUserClick', async () => {
    const user = userEvent.setup();
    const onEnterSpace = vi.fn();
    renderCard({
      users: [createUser(1, { displayName: 'Alice Santos' })],
      onEnterSpace,
    });

    const menuTrigger = screen.getByRole('button', {
      name: "Alice Santos's avatar - click for options",
    });
    await user.click(menuTrigger);

    expect(onEnterSpace).not.toHaveBeenCalled();
  });

  it('keeps body clicks routed to knock when direct entry is unavailable', async () => {
    const user = userEvent.setup();
    const onEnterSpace = vi.fn();
    const onKnock = vi.fn();
    renderCard({
      users: [createUser(1)],
      onEnterSpace,
      onKnock,
      state: { directEnter: false, detailPanel: false },
    });

    await user.click(screen.getByTestId('space-space-1'));
    expect(onKnock).toHaveBeenCalledWith('space-1');
    expect(onEnterSpace).not.toHaveBeenCalled();
  });

  it('renders compact density with avatars and without legacy sparkline content', () => {
    document.documentElement.dataset.density = 'compact';
    const { container } = renderCard({
      users: [createUser(1)],
      state: { compact: true, directEnter: true, detailPanel: false },
    });

    expect(screen.getByTestId('space-space-1')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByLabelText("User 1's avatar - click for options")).toBeVisible();
    expect(container.querySelector('.cursor-crosshair')).not.toBeInTheDocument();
    expect(screen.queryByText(/Activity:/)).not.toBeInTheDocument();
  });
});
