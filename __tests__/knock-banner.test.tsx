import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnockBanner } from '@/components/floor-plan/modern/KnockBanner';
import ModernSpaceCard from '@/components/floor-plan/modern/ModernSpaceCard';
import type { Space, UserPresenceData } from '@/types/database';

vi.mock('@/components/ui/enhanced-avatar-v2', () => ({
  EnhancedAvatarV2: ({ user, 'aria-label': ariaLabel }: { user: { displayName?: string }; 'aria-label'?: string }) => (
    <div aria-label={ariaLabel}>{user.displayName}</div>
  ),
}));

vi.mock('lucide-react', () => ({
  Check: () => <span aria-hidden="true">check</span>,
  X: () => <span aria-hidden="true">x</span>,
  DoorOpen: () => <span aria-hidden="true">door-open</span>,
  DoorClosed: () => <span aria-hidden="true">door-closed</span>,
  Loader2: () => <span aria-hidden="true">loader</span>,
  ShieldX: () => <span aria-hidden="true">shield-x</span>,
  Clock: () => <span aria-hidden="true">clock</span>,
  Timer: () => <span aria-hidden="true">timer</span>,
}));

vi.mock('@/components/floor-plan/modern/AvatarGroup', () => ({
  default: () => <div>avatars</div>,
}));

vi.mock('@/components/floor-plan/modern/StatusIndicators', () => ({
  SpaceStatusBadge: () => <div>status</div>,
  SpaceTypeIndicator: () => <div>type</div>,
  CapacityIndicator: () => <div>capacity</div>,
}));

vi.mock('@/components/floor-plan/modern/FullBadge', () => ({
  FullBadge: () => <div>full</div>,
}));

vi.mock('@/components/floor-plan/modern/AttentionBeacon', () => ({
  default: () => <div>beacon</div>,
}));

vi.mock('@/components/floor-plan/modern/SpaceContextMenu', () => ({
  default: () => null,
}));

vi.mock('@/components/floor-plan/modern/SpaceDetailPanel', () => ({
  SpaceDetailPanel: () => null,
}));

vi.mock('@/components/floor-plan/modern/SpaceDetailBottomSheet', () => ({
  SpaceDetailBottomSheet: () => null,
}));

vi.mock('@/hooks/useAttentionBeacon', () => ({
  useAttentionBeacon: () => ({ active: false, severity: null, reason: null }),
}));

vi.mock('@/hooks/useSpaceDetails', () => ({
  useSpaceDetails: () => ({ agenda: null, activityLog: [], transcript: null, isLoading: false }),
}));

vi.mock('@/components/ui/glass-panel', () => ({
  GlassPanel: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div ref={ref} {...props} />
  )),
}));

const mockKnockRequest = {
  type: 'KNOCK_REQUEST' as const,
  requestId: 'request-1',
  spaceId: 'space-1',
  requesterId: 'user-1',
  requesterName: 'Taylor Knock',
  requesterAvatarUrl: 'https://example.com/avatar.png',
  timestamp: Date.now(),
};

const restrictedSpace: Space = {
  id: 'space-1',
  companyId: 'company-1',
  name: 'Focus Room',
  type: 'private_office',
  status: 'active',
  capacity: 4,
  features: [],
  position: { x: 0, y: 0, width: 4, height: 2 },
  accessControl: { isPublic: false },
};

const publicSpace: Space = {
  ...restrictedSpace,
  id: 'space-public',
  name: 'Open Workspace',
  accessControl: { isPublic: true },
};

const occupant: UserPresenceData = {
  id: 'occupant-1',
  displayName: 'Occupant One',
  avatarUrl: undefined,
  status: 'online',
  currentSpaceId: 'space-1',
  statusMessage: undefined,
};

function renderSpaceCard(overrides: Partial<React.ComponentProps<typeof ModernSpaceCard>> = {}) {
  return render(
    <ModernSpaceCard
      space={restrictedSpace}
      usersInSpace={[occupant]}
      onEnterSpace={vi.fn()}
      onKnock={vi.fn()}
      canDirectEnter={false}
      showDetailPanel={false}
      {...overrides}
    />
  );
}

describe('KnockBanner', () => {
  it('renders requester name and avatar', () => {
    render(<KnockBanner requesterName="Taylor Knock" requesterAvatarUrl="https://example.com/avatar.png" onApprove={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.getAllByText('Taylor Knock').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Taylor Knock avatar')).toBeInTheDocument();
  });

  it('renders Approve and Deny buttons', () => {
    render(<KnockBanner requesterName="Taylor Knock" onApprove={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.getByRole('button', { name: /let taylor knock in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deny taylor knock/i })).toBeInTheDocument();
  });

  it('has role="alert" and aria-live="polite" for accessibility', () => {
    render(<KnockBanner requesterName="Taylor Knock" onApprove={vi.fn()} onDeny={vi.fn()} />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveAttribute('aria-atomic', 'true');
  });

  it('has data-avatar-interactive on outer div', () => {
    render(<KnockBanner requesterName="Taylor Knock" onApprove={vi.fn()} onDeny={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveAttribute('data-avatar-interactive', 'true');
  });

  it('calls onApprove when Approve button clicked', () => {
    const onApprove = vi.fn();
    render(<KnockBanner requesterName="Taylor Knock" onApprove={onApprove} onDeny={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /let taylor knock in/i }));

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onDeny when Deny button clicked', () => {
    const onDeny = vi.fn();
    render(<KnockBanner requesterName="Taylor Knock" onApprove={vi.fn()} onDeny={onDeny} />);

    fireEvent.click(screen.getByRole('button', { name: /deny taylor knock/i }));

    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('stops event propagation on button clicks', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <KnockBanner requesterName="Taylor Knock" onApprove={vi.fn()} onDeny={vi.fn()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /let taylor knock in/i }));

    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe('ModernSpaceCard - Knock Button', () => {
  it('renders knock button on restricted spaces for non-occupants', () => {
    renderSpaceCard();

    expect(screen.getByRole('button', { name: 'Knock' })).toBeInTheDocument();
  });

  it('does not render knock button on public spaces', () => {
    renderSpaceCard({ space: publicSpace, canDirectEnter: true });

    expect(screen.queryByRole('button', { name: 'Knock' })).not.toBeInTheDocument();
  });

  it('does not render knock button for occupants of the space', () => {
    renderSpaceCard({ isUserInSpace: true, canDirectEnter: true });

    expect(screen.queryByRole('button', { name: 'Knock' })).not.toBeInTheDocument();
  });

  it('shows "Knocking..." state with spinner when knockStatus is knocking', () => {
    renderSpaceCard({ knockStatus: 'knocking' });

    expect(screen.getByRole('button', { name: 'Knocking...' })).toBeDisabled();
    expect(screen.getByText('Knocking...')).toBeInTheDocument();
  });

  it('shows disabled "Denied" state when knockStatus is denied', () => {
    renderSpaceCard({ knockStatus: 'denied' });

    expect(screen.getByRole('button', { name: 'Denied' })).toHaveTextContent('Denied');
  });

  it('shows cooldown countdown when knockStatus is cooldown', () => {
    renderSpaceCard({ knockStatus: 'cooldown', knockCooldownRemaining: 42 });

    const button = screen.getByRole('button', { name: 'Wait 42s' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Wait 42s');
  });

  it('knock button has data-avatar-interactive attribute', () => {
    renderSpaceCard();

    expect(screen.getByRole('button', { name: 'Knock' })).toHaveAttribute('data-avatar-interactive', 'true');
  });
});

void mockKnockRequest;
