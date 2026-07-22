// __tests__/space-detail-hover-panel.test.tsx
// Story 3.11: Unit and Integration Tests for Space Detail Hover Panel

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Components under test
import { SpaceDetailPanel } from '@/components/floor-plan/modern/SpaceDetailPanel';
import { SpaceDetailBottomSheet } from '@/components/floor-plan/modern/SpaceDetailBottomSheet';
import { ParticipantRoster } from '@/components/floor-plan/modern/ParticipantRoster';
import { SpaceActionButtons } from '@/components/floor-plan/modern/SpaceActionButtons';
import ModernSpaceCard from '@/components/floor-plan/modern/ModernSpaceCard';
import { KnockBannerHost } from '@/components/floor-plan/modern/KnockBanner';

// Types
import { Space, UserPresenceData, SpaceStatus, SpaceType } from '@/types/database';

// Mock ModernUserAvatar to avoid CompanyContext dependency
vi.mock('@/components/floor-plan/modern/ModernUserAvatar', () => ({
  default: ({ user, size }: { user: { displayName: string }; size?: string }) => (
    <div data-testid="mock-avatar" data-size={size}>
      {user.displayName.charAt(0)}
    </div>
  ),
}));

// Mock scroll-area component
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className, style, ...props }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <div className={className} style={style} data-testid="scroll-area" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/floor-plan/SpaceAudioControls', () => ({
  SpaceAudioControls: () => <button type="button" aria-label="Mock space audio">Audio</button>,
}));

// ============================================
// Test Data Fixtures
// ============================================

const createMockSpace = (overrides: Partial<Space> = {}): Space => ({
  id: 'space-1',
  name: 'Test Space',
  companyId: 'company-1',
  type: 'conference' as SpaceType,
  capacity: 10,
  status: 'active',
  description: 'A test space',
  features: [],
  position: { x: 0, y: 0, width: 100, height: 100 },
  accessControl: { isPublic: true },
  createdAt: new Date().toISOString(),
  ...overrides,
});

const createMockUser = (id: string, name: string): UserPresenceData => ({
  id,
  displayName: name,
  avatarUrl: undefined,
  status: 'online',
  currentSpaceId: 'space-1',
});

// ============================================
// SpaceDetailPanel Tests (AC1, AC9)
// ============================================

describe('SpaceDetailPanel', () => {
  const mockSpace = createMockSpace();
  const mockUsers = [createMockUser('1', 'Alice'), createMockUser('2', 'Bob')];
  const mockOnJoin = vi.fn();
  const mockOnLeave = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only real space data and omits legacy detail sections', () => {
    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        state={{ userInSpace: false }}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    // Check space name
    expect(screen.getByText('Test Space')).toBeInTheDocument();
    
    // Check participants section header
    expect(screen.getByText(/Participants \(2\)/i)).toBeInTheDocument();
    
    expect(screen.queryByText(/agenda/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/activity log/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/transcript/i)).not.toBeInTheDocument();
    
    // Check Join button
    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument();
  });

  it('has data-avatar-interactive attribute for click-stop protocol (AC7)', () => {
    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        state={{ userInSpace: false }}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    const panel = screen.getByRole('region');
    expect(panel).toHaveAttribute('data-avatar-interactive', 'true');
  });

  it('marks clicks for the parent click-stop protocol (AC7)', () => {
    const parentClickHandler = vi.fn();
    const guardedParentClickHandler = (event: React.MouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('[data-avatar-interactive]')) {
        return;
      }
      parentClickHandler();
    };
    
    render(
      <div onClick={guardedParentClickHandler}>
        <SpaceDetailPanel
          space={mockSpace}
          usersInSpace={mockUsers}
          state={{ userInSpace: false }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      </div>
    );

    const panel = screen.getByRole('region');
    fireEvent.click(panel);
    
    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it('renders audio controls if and only if the viewer is in the space', () => {
    const { rerender } = render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        state={{ userInSpace: false }}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    expect(screen.queryByTestId('space-detail-audio')).not.toBeInTheDocument();
    rerender(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        state={{ userInSpace: true }}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );
    expect(screen.getByTestId('space-detail-audio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mock space audio' })).toBeInTheDocument();
  });

  it('lists all 35 participants inside a scrollable roster', () => {
    const users = Array.from({ length: 35 }, (_, index) => (
      createMockUser(`user-${index}`, `Participant ${index + 1}`)
    ));
    render(
      <SpaceDetailPanel
        space={createMockSpace({ capacity: 50 })}
        usersInSpace={users}
        state={{ userInSpace: false }}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    expect(screen.getByText('Participant 1')).toBeInTheDocument();
    expect(screen.getByText('Participant 35')).toBeInTheDocument();
    expect(screen.getByTestId('participant-roster-scroll')).toHaveAttribute('data-scrollable', 'true');
    expect(screen.getByTestId('participant-roster-scroll')).toHaveStyle({ height: '320px' });
  });

  it.each([
    ['active', true],
    ['available', true],
    ['maintenance', false],
    ['locked', false],
    ['reserved', false],
    ['in_use', false],
  ] satisfies Array<[SpaceStatus, boolean]>)('uses the shared entry availability for %s', (status, enterable) => {
    render(
      <SpaceDetailPanel
        space={createMockSpace({ status })}
        usersInSpace={[]}
        state={{ userInSpace: false, canDirectEnter: true }}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    if (enterable) expect(screen.getByRole('button', { name: /join this space/i })).toBeEnabled();
    else expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  });

  it('applies glass-morphism styles (AC9)', () => {
    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        state={{ userInSpace: false }}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    const panel = screen.getByRole('region');
    const styles = panel.style;
    
    expect(styles.backgroundColor).toContain('var(--vo-detail-panel-bg)');
    expect(styles.backdropFilter).toContain('blur');
  });
});

// ============================================
// ParticipantRoster Tests (AC2)
// ============================================

describe('ParticipantRoster', () => {
  it('displays all users without max limit (AC2)', () => {
    const users = Array.from({ length: 10 }, (_, i) => 
      createMockUser(`user-${i}`, `User ${i}`)
    );

    render(<ParticipantRoster users={users} />);

    // All 10 users should be visible (not limited to 4 like card view)
    users.forEach(user => {
      expect(screen.getByText(user.displayName)).toBeInTheDocument();
    });
  });

  it('shows participant count', () => {
    const users = [createMockUser('1', 'Alice'), createMockUser('2', 'Bob')];
    
    render(<ParticipantRoster users={users} />);
    
    expect(screen.getByText('Participants (2)')).toBeInTheDocument();
  });

  it('shows user status indicators (AC2)', () => {
    const users = [createMockUser('1', 'Alice')];
    
    render(
      <ParticipantRoster 
        users={users} 
        speakingUserIds={['1']} 
      />
    );

    // Alice should have speaking class
    const aliceRow = screen.getByRole('button', { name: /Alice, Speaking/i });
    expect(aliceRow).toBeInTheDocument();
  });

  it('handles muted state (AC2)', () => {
    const users = [createMockUser('1', 'Alice')];
    
    render(
      <ParticipantRoster 
        users={users} 
        mutedUserIds={['1']} 
      />
    );

    const aliceRow = screen.getByRole('button', { name: /Alice, Muted/i });
    expect(aliceRow).toBeInTheDocument();
  });

  it('shows empty state when no users', () => {
    render(<ParticipantRoster users={[]} />);
    
    expect(screen.getByText('No participants')).toBeInTheDocument();
  });

  it('triggers onUserClick when avatar clicked (AC2)', async () => {
    const users = [createMockUser('1', 'Alice')];
    const onUserClick = vi.fn();
    
    render(<ParticipantRoster users={users} onUserClick={onUserClick} />);
    
    const aliceRow = screen.getByRole('button', { name: /Alice/i });
    await userEvent.click(aliceRow);
    
    expect(onUserClick).toHaveBeenCalledWith('1');
  });
});

describe('SpaceDetailBottomSheet', () => {
  it('reuses the real-data panel with full roster and in-space audio', () => {
    const users = Array.from({ length: 35 }, (_, index) => (
      createMockUser(`sheet-user-${index}`, `Sheet Participant ${index + 1}`)
    ));

    render(
      <SpaceDetailBottomSheet
        open
        onOpenChange={vi.fn()}
        space={createMockSpace({ capacity: 50 })}
        usersInSpace={users}
        state={{ userInSpace: true, canDirectEnter: true }}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Sheet Participant 1')).toBeInTheDocument();
    expect(screen.getByText('Sheet Participant 35')).toBeInTheDocument();
    expect(screen.getByTestId('participant-roster-scroll')).toHaveAttribute('data-scrollable', 'true');
    expect(screen.getByTestId('space-detail-audio')).toBeInTheDocument();
    expect(screen.queryByText(/agenda/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/activity log/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/transcript/i)).not.toBeInTheDocument();
  });

  it('keeps the global Knock banner operable while the sheet is open', async () => {
    const onApprove = vi.fn();
    const request = {
      type: 'KNOCK_REQUEST' as const,
      requestId: 'sheet-knock-1',
      spaceId: 'space-1',
      requesterId: 'requester-1',
      requesterName: 'Morgan',
      timestamp: Date.now(),
    };

    render(
      <>
        <SpaceDetailBottomSheet
          open
          onOpenChange={vi.fn()}
          space={createMockSpace()}
          usersInSpace={[createMockUser('sheet-owner', 'Sheet Owner')]}
          state={{ userInSpace: true }}
          onJoin={vi.fn()}
          onLeave={vi.fn()}
        />
        <KnockBannerHost
          pendingKnockRequests={new Map([[request.requestId, request]])}
          respondingKnockRequestIds={new Set()}
          onApprove={onApprove}
          onDeny={vi.fn()}
        />
      </>
    );

    const approve = screen.getByRole('button', { name: 'Let Morgan in' });
    const backdrop = screen.getByTestId('space-detail-backdrop');
    const bannerHost = screen.getByTestId('global-knock-banner-host');
    expect(backdrop).toHaveClass('z-[49]');
    expect(bannerHost).toHaveClass('z-[2147483647]');
    expect(approve).not.toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(approve);
    expect(onApprove).toHaveBeenCalledWith(request);
  });

  it('closes from the backdrop without activating background card actions', async () => {
    const onEnterSpace = vi.fn();
    const onKnock = vi.fn();
    const onOtherSheetOpen = vi.fn();
    const onOpenChange = vi.fn();

    function BackdropHarness() {
      const [open, setOpen] = React.useState(true);
      return (
        <div onClick={onEnterSpace}>
          <button type="button" onClick={onOtherSheetOpen}>Open another sheet</button>
          <SpaceDetailBottomSheet
            open={open}
            onOpenChange={(nextOpen) => {
              onOpenChange(nextOpen);
              setOpen(nextOpen);
            }}
            space={createMockSpace()}
            usersInSpace={[createMockUser('sheet-owner', 'Sheet Owner')]}
            state={{ userInSpace: false, privateSpace: true }}
            onJoin={onEnterSpace}
            onLeave={vi.fn()}
            onKnock={onKnock}
          />
        </div>
      );
    }

    render(<BackdropHarness />);
    await userEvent.click(screen.getByTestId('space-detail-backdrop'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onEnterSpace).not.toHaveBeenCalled();
    expect(onKnock).not.toHaveBeenCalled();
    expect(onOtherSheetOpen).not.toHaveBeenCalled();
  });
});

// ============================================
// SpaceActionButtons Tests (AC6)
// ============================================

describe('SpaceActionButtons', () => {
  it('shows Join button when user not in space (AC6)', () => {
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    
    render(
      <SpaceActionButtons
        state={{ userInSpace: false }}
        onJoin={onJoin}
        onLeave={onLeave}
      />
    );

    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /leave/i })).not.toBeInTheDocument();
  });

  it('shows Leave button when user in space (AC6)', () => {
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    
    render(
      <SpaceActionButtons
        state={{ userInSpace: true }}
        onJoin={onJoin}
        onLeave={onLeave}
      />
    );

    expect(screen.getByRole('button', { name: /leave/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
  });

  it('shows Knock button for private spaces (AC6)', () => {
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    const onKnock = vi.fn();
    
    render(
      <SpaceActionButtons
        state={{ userInSpace: false, privateSpace: true, canDirectEnter: false }}
        onJoin={onJoin}
        onLeave={onLeave}
        onKnock={onKnock}
      />
    );

    expect(screen.getByRole('button', { name: /knock/i })).toBeInTheDocument();
  });

  it('preserves Knock when entry status is unavailable but a responder exists', () => {
    render(
      <SpaceActionButtons
        state={{
          userInSpace: false,
          hasOccupants: true,
          canDirectEnter: true,
          isDirectEntryAvailable: false,
        }}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
        onKnock={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Knock to request entry' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /join this space/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unavailable' })).not.toBeInTheDocument();
  });

  it('calls onJoin when Join clicked', async () => {
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    
    render(
      <SpaceActionButtons
        state={{ userInSpace: false }}
        onJoin={onJoin}
        onLeave={onLeave}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /join/i }));
    
    expect(onJoin).toHaveBeenCalled();
  });

  it('stops propagation on button click', () => {
    const parentClick = vi.fn();
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    
    render(
      <div onClick={parentClick}>
        <SpaceActionButtons
          state={{ userInSpace: false }}
          onJoin={onJoin}
          onLeave={onLeave}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    
    expect(parentClick).not.toHaveBeenCalled();
    expect(onJoin).toHaveBeenCalled();
  });

  it('has data-space-action attribute for click-stop exemption', () => {
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    
    render(
      <SpaceActionButtons
        state={{ userInSpace: false }}
        onJoin={onJoin}
        onLeave={onLeave}
      />
    );

    const button = screen.getByRole('button', { name: /join/i });
    expect(button).toHaveAttribute('data-space-action', 'true');
  });
});

// ============================================
// ModernSpaceCard with Hover Panel Tests (AC1, AC7)
// ============================================

function ControlledModernSpaceCard(props: React.ComponentProps<typeof ModernSpaceCard>) {
  const [detailOpen, setDetailOpen] = React.useState(false);
  return (
    <ModernSpaceCard
      {...props}
      detailOpen={detailOpen}
      onDetailOpenChange={setDetailOpen}
    />
  );
}

describe('ModernSpaceCard explicit detail panel', () => {
  const mockSpace = createMockSpace();
  const mockUsers = [createMockUser('1', 'Alice')];
  const mockOnEnterSpace = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset viewport to desktop
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('opens desktop details from the card body instead of entering or knocking', () => {
    const mockOnKnock = vi.fn();

    render(
      <ControlledModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        onKnock={mockOnKnock}
        state={{ userInSpace: false, detailPanel: true }}
      />
    );

    const card = screen.getByTestId('space-space-1');
    fireEvent.click(card);

    expect(screen.getByRole('region', { name: /details for/i })).toBeInTheDocument();
    expect(mockOnKnock).not.toHaveBeenCalled();
    expect(mockOnEnterSpace).not.toHaveBeenCalled();
  });

  it('keeps direct entry on the footer action', () => {
    const mockOnOpenChat = vi.fn();

    render(
      <ControlledModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        onOpenChat={mockOnOpenChat}
        state={{ userInSpace: false, directEnter: true, detailPanel: true }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));

    expect(mockOnEnterSpace).toHaveBeenCalledWith('space-1');
    expect(mockOnOpenChat).not.toHaveBeenCalled();
  });

  it('does not open the panel on hover after the former 300ms delay', () => {
    vi.useFakeTimers();

    render(
      <ControlledModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        state={{ detailPanel: true }}
      />
    );

    const card = screen.getByTestId('space-space-1');
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(card).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: /details for/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('focus alone stays closed while Enter and Space explicitly open the panel', () => {
    render(
      <ControlledModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        state={{ detailPanel: true }}
      />
    );

    const card = screen.getByTestId('space-space-1');
    fireEvent.focus(card);
    expect(card).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(card).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(card, { key: 'Escape' });
    expect(card).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(card, { key: ' ' });
    expect(card).toHaveAttribute('aria-expanded', 'true');
  });

  it('Escape key closes panel (AC10)', async () => {
    vi.useFakeTimers();
    
    render(
      <ControlledModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        state={{ detailPanel: true }}
      />
    );

    const card = screen.getByTestId('space-space-1');
    
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(card).toHaveAttribute('aria-expanded', 'true');
    
    // Press Escape
    fireEvent.keyDown(card, { key: 'Escape' });
    
    expect(card).toHaveAttribute('aria-expanded', 'false');
    
    vi.useRealTimers();
  });

  it('clicks inside panel do not trigger card navigation (AC7)', async () => {
    vi.useFakeTimers();
    
    render(
      <ControlledModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        state={{ detailPanel: true }}
      />
    );

    const card = screen.getByTestId('space-space-1');
    
    fireEvent.click(card);
    
    // Find the panel region
    const panel = screen.getByRole('region', { name: /details for/i });
    
    // Click inside panel
    fireEvent.click(panel);
    
    // Navigation should not be triggered
    expect(mockOnEnterSpace).not.toHaveBeenCalled();
    
    vi.useRealTimers();
  });
});

// ============================================
// Theme Testing (AC9)
// ============================================

describe('Theme Compatibility (AC9)', () => {
  const themes = ['neon', 'zen', 'obsidian', 'paper'];
  
  themes.forEach(theme => {
    it(`renders correctly in ${theme} theme`, () => {
      // Set theme attribute
      document.documentElement.setAttribute('data-theme', theme);
      
      const mockSpace = createMockSpace();
      const mockUsers = [createMockUser('1', 'Alice')];
      
      render(
        <SpaceDetailPanel
          space={mockSpace}
          usersInSpace={mockUsers}
          state={{ userInSpace: false }}
          onJoin={vi.fn()}
          onLeave={vi.fn()}
        />
      );

      const panel = screen.getByRole('region');
      
      // Panel should render
      expect(panel).toBeInTheDocument();
      
      // Should have glass-morphism style vars
      expect(panel.style.backgroundColor).toContain('var(--vo-detail-panel-bg)');
      
      // Cleanup
      document.documentElement.removeAttribute('data-theme');
    });
  });
});

// ============================================
// Accessibility Tests (AC10)
// ============================================

describe('Accessibility (AC10)', () => {
  it('SpaceDetailPanel has proper role and aria-label', () => {
    const mockSpace = createMockSpace({ name: 'Engineering Room' });
    
    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={[]}
        state={{ userInSpace: false }}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    const panel = screen.getByRole('region');
    expect(panel).toHaveAttribute('aria-label', 'Details for Engineering Room');
  });

  it('ParticipantRoster items are keyboard navigable', async () => {
    const users = [createMockUser('1', 'Alice')];
    const onUserClick = vi.fn();
    
    render(<ParticipantRoster users={users} onUserClick={onUserClick} />);
    
    const item = screen.getByRole('button', { name: /Alice/i });
    
    // Focus and press Enter
    item.focus();
    fireEvent.keyDown(item, { key: 'Enter' });
    
    expect(onUserClick).toHaveBeenCalledWith('1');
  });

  it('SpaceActionButtons have proper aria-labels', () => {
    render(
      <SpaceActionButtons
        state={{ userInSpace: false }}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /join this space/i })).toBeInTheDocument();
  });
});
