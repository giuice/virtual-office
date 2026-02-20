// __tests__/space-detail-hover-panel.test.tsx
// Story 3.11: Unit and Integration Tests for Space Detail Hover Panel

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Components under test
import { SpaceDetailPanel } from '@/components/floor-plan/modern/SpaceDetailPanel';
import { ParticipantRoster } from '@/components/floor-plan/modern/ParticipantRoster';
import { AgendaPhaseDisplay } from '@/components/floor-plan/modern/AgendaPhaseDisplay';
import { ActivityLogPreview, ActivityLogEntry } from '@/components/floor-plan/modern/ActivityLogPreview';
import { TranscriptSnippet } from '@/components/floor-plan/modern/TranscriptSnippet';
import { SpaceActionButtons } from '@/components/floor-plan/modern/SpaceActionButtons';
import ModernSpaceCard from '@/components/floor-plan/modern/ModernSpaceCard';

// Types
import { Space, UserPresenceData, SpaceType } from '@/types/database';

// Mock useSpaceDetails hook
vi.mock('@/hooks/useSpaceDetails', () => ({
  useSpaceDetails: vi.fn(() => ({
    agenda: null,
    activityLog: [],
    transcript: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
  default: vi.fn(() => ({
    agenda: null,
    activityLog: [],
    transcript: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

// Mock useAttentionBeacon hook
vi.mock('@/hooks/useAttentionBeacon', () => ({
  useAttentionBeacon: vi.fn(() => ({
    active: false,
    severity: 'normal',
    reason: null,
  })),
}));

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
  ScrollArea: ({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <div className={className} style={style} data-testid="scroll-area">
      {children}
    </div>
  ),
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

const createMockActivityLog = (count: number): ActivityLogEntry[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`,
    timestamp: new Date(Date.now() - i * 60000), // 1 minute apart
    author: `User ${i}`,
    authorId: `user-${i}`,
    summary: `Activity item ${i}`,
    type: ['decision', 'action', 'note', 'blocker'][i % 4] as ActivityLogEntry['type'],
  }));
};

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

  it('renders all sub-components when data is provided (AC1)', () => {
    const agenda = { current: 2, total: 4, name: 'Discussion', description: 'Main topic' };
    const activityLog = createMockActivityLog(3);
    const transcript = { text: 'Hello world', speaker: 'Speaker1', timestamp: new Date() };

    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        agendaPhase={agenda}
        activityLog={activityLog}
        transcript={transcript}
        isUserInSpace={false}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    // Check space name
    expect(screen.getByText('Test Space')).toBeInTheDocument();
    
    // Check participants section header
    expect(screen.getByText(/Participants \(2\)/i)).toBeInTheDocument();
    
    // Check agenda section
    expect(screen.getByText('Discussion')).toBeInTheDocument();
    expect(screen.getByText('Phase 2 of 4')).toBeInTheDocument();
    
    // Check activity log
    expect(screen.getByText('Activity Log')).toBeInTheDocument();
    
    // Check transcript
    expect(screen.getByText(/Hello world/)).toBeInTheDocument();
    
    // Check Join button
    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument();
  });

  it('has data-avatar-interactive attribute for click-stop protocol (AC7)', () => {
    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        isUserInSpace={false}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
      />
    );

    const panel = screen.getByRole('region');
    expect(panel).toHaveAttribute('data-avatar-interactive', 'true');
  });

  it('stops event propagation on click (AC7)', () => {
    const parentClickHandler = vi.fn();
    
    render(
      <div onClick={parentClickHandler}>
        <SpaceDetailPanel
          space={mockSpace}
          usersInSpace={mockUsers}
          isUserInSpace={false}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      </div>
    );

    const panel = screen.getByRole('region');
    fireEvent.click(panel);
    
    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it('shows loading state when isLoading is true', () => {
    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        isUserInSpace={false}
        onJoin={mockOnJoin}
        onLeave={mockOnLeave}
        isLoading={true}
      />
    );

    // Should not show content when loading
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('applies glass-morphism styles (AC9)', () => {
    render(
      <SpaceDetailPanel
        space={mockSpace}
        usersInSpace={mockUsers}
        isUserInSpace={false}
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

// ============================================
// AgendaPhaseDisplay Tests (AC3)
// ============================================

describe('AgendaPhaseDisplay', () => {
  it('shows correct phase progress (AC3)', () => {
    render(
      <AgendaPhaseDisplay
        currentPhase={2}
        totalPhases={4}
        phaseName="Discussion"
      />
    );

    expect(screen.getByText('Phase 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('Discussion')).toBeInTheDocument();
  });

  it('shows description when provided (AC3)', () => {
    render(
      <AgendaPhaseDisplay
        currentPhase={1}
        totalPhases={3}
        phaseName="Introduction"
        phaseDescription="Welcome and overview"
      />
    );

    expect(screen.getByText('Welcome and overview')).toBeInTheDocument();
  });

  it('renders progress bar with correct width', () => {
    render(
      <AgendaPhaseDisplay
        currentPhase={2}
        totalPhases={4}
        phaseName="Test"
      />
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '2');
    expect(progressBar).toHaveAttribute('aria-valuemax', '4');
  });

  it('handles graceful absence - returns null for invalid data (AC3)', () => {
    const { container } = render(
      <AgendaPhaseDisplay
        currentPhase={0}
        totalPhases={0}
        phaseName="Test"
      />
    );

    expect(container.firstChild).toBeNull();
  });
});

// ============================================
// ActivityLogPreview Tests (AC4)
// ============================================

describe('ActivityLogPreview', () => {
  it('shows correct number of entries (default 5) (AC4)', () => {
    const entries = createMockActivityLog(10);
    
    render(<ActivityLogPreview entries={entries} />);

    // Should show max 5 entries
    expect(screen.getByText('Activity item 0')).toBeInTheDocument();
    expect(screen.getByText('Activity item 4')).toBeInTheDocument();
    expect(screen.queryByText('Activity item 5')).not.toBeInTheDocument();
  });

  it('respects maxEntries prop (AC4)', () => {
    const entries = createMockActivityLog(10);
    
    render(<ActivityLogPreview entries={entries} maxEntries={3} />);

    expect(screen.getByText('Activity item 2')).toBeInTheDocument();
    expect(screen.queryByText('Activity item 3')).not.toBeInTheDocument();
  });

  it('uses monospace font class (AC4)', () => {
    const entries = createMockActivityLog(1);
    
    const { container } = render(<ActivityLogPreview entries={entries} />);

    // Check for font-mono class
    const monoElements = container.querySelectorAll('.font-mono');
    expect(monoElements.length).toBeGreaterThan(0);
  });

  it('shows View All button when onViewAll provided', async () => {
    const entries = createMockActivityLog(3);
    const onViewAll = vi.fn();
    
    render(<ActivityLogPreview entries={entries} onViewAll={onViewAll} />);

    const viewAllButton = screen.getByText('View All');
    await userEvent.click(viewAllButton);
    
    expect(onViewAll).toHaveBeenCalled();
  });

  it('returns null when no entries', () => {
    const { container } = render(<ActivityLogPreview entries={[]} />);
    
    expect(container.firstChild).toBeNull();
  });
});

// ============================================
// TranscriptSnippet Tests (AC5)
// ============================================

describe('TranscriptSnippet', () => {
  it('shows speaker and text (AC5)', () => {
    render(
      <TranscriptSnippet
        text="This is a test message that should be displayed"
        speaker="Alice"
        timestamp={new Date()}
      />
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/This is a test message/)).toBeInTheDocument();
  });

  it('applies line-clamp-3 for truncation (AC5)', () => {
    const longText = 'This is a very long message. '.repeat(20);
    
    const { container } = render(
      <TranscriptSnippet
        text={longText}
        speaker="Alice"
        timestamp={new Date()}
      />
    );

    const textElement = container.querySelector('.line-clamp-3');
    expect(textElement).toBeInTheDocument();
  });

  it('uses monospace font (AC5)', () => {
    const { container } = render(
      <TranscriptSnippet
        text="Test message"
        speaker="Alice"
        timestamp={new Date()}
      />
    );

    const monoElement = container.querySelector('.font-mono');
    expect(monoElement).toBeInTheDocument();
  });

  it('returns null when no text', () => {
    const { container } = render(
      <TranscriptSnippet
        text=""
        speaker="Alice"
        timestamp={new Date()}
      />
    );

    expect(container.firstChild).toBeNull();
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
        isUserInSpace={false}
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
        isUserInSpace={true}
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
        isUserInSpace={false}
        isPrivate={true}
        onJoin={onJoin}
        onLeave={onLeave}
        onKnock={onKnock}
      />
    );

    expect(screen.getByRole('button', { name: /knock/i })).toBeInTheDocument();
  });

  it('calls onJoin when Join clicked', async () => {
    const onJoin = vi.fn();
    const onLeave = vi.fn();
    
    render(
      <SpaceActionButtons
        isUserInSpace={false}
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
          isUserInSpace={false}
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
        isUserInSpace={false}
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

describe('ModernSpaceCard with Hover Panel', () => {
  const mockSpace = createMockSpace();
  const mockUsers = [createMockUser('1', 'Alice')];
  const mockOnEnterSpace = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset viewport to desktop
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('routes desktop card click to knock flow when onKnock is provided', () => {
    const mockOnKnock = vi.fn();

    render(
      <ModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        onKnock={mockOnKnock}
        isUserInSpace={false}
      />
    );

    const card = screen.getByTestId('space-space-1');
    fireEvent.click(card);

    expect(mockOnKnock).toHaveBeenCalledWith('space-1');
    expect(mockOnEnterSpace).not.toHaveBeenCalled();
  });

  it('shows aria-expanded attribute when panel visible (AC10)', async () => {
    vi.useFakeTimers();
    
    render(
      <ModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        showDetailPanel={true}
      />
    );

    const card = screen.getByTestId('space-space-1');
    
    // Initially not expanded
    expect(card).toHaveAttribute('aria-expanded', 'false');
    
    // Hover to trigger panel
    fireEvent.mouseEnter(card);
    
    // Advance timer past the 300ms delay
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    // Should be expanded now
    expect(card).toHaveAttribute('aria-expanded', 'true');
    
    vi.useRealTimers();
  });

  it('keyboard focus shows panel (AC10)', async () => {
    vi.useFakeTimers();
    
    render(
      <ModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        showDetailPanel={true}
      />
    );

    const card = screen.getByTestId('space-space-1');
    
    // Focus the card
    fireEvent.focus(card);
    
    // Panel should show on focus (no delay for keyboard)
    expect(card).toHaveAttribute('aria-expanded', 'true');
    
    vi.useRealTimers();
  });

  it('Escape key closes panel (AC10)', async () => {
    vi.useFakeTimers();
    
    render(
      <ModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        showDetailPanel={true}
      />
    );

    const card = screen.getByTestId('space-space-1');
    
    // Focus to show panel
    fireEvent.focus(card);
    expect(card).toHaveAttribute('aria-expanded', 'true');
    
    // Press Escape
    fireEvent.keyDown(card, { key: 'Escape' });
    
    expect(card).toHaveAttribute('aria-expanded', 'false');
    
    vi.useRealTimers();
  });

  it('panel does not show in analyst variant', async () => {
    vi.useFakeTimers();
    
    render(
      <ModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        showDetailPanel={true}
        variant="analyst"
      />
    );

    const card = screen.getByTestId('space-space-1');
    
    // Hover
    fireEvent.mouseEnter(card);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    
    // Should not show panel in analyst mode
    expect(card).toHaveAttribute('aria-expanded', 'false');
    
    vi.useRealTimers();
  });

  it('clicks inside panel do not trigger card navigation (AC7)', async () => {
    vi.useFakeTimers();
    
    render(
      <ModernSpaceCard
        space={mockSpace}
        usersInSpace={mockUsers}
        onEnterSpace={mockOnEnterSpace}
        showDetailPanel={true}
      />
    );

    const card = screen.getByTestId('space-space-1');
    
    // Show panel
    fireEvent.focus(card);
    
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
          isUserInSpace={false}
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
        isUserInSpace={false}
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

  it('AgendaPhaseDisplay has proper aria attributes', () => {
    render(
      <AgendaPhaseDisplay
        currentPhase={2}
        totalPhases={4}
        phaseName="Discussion"
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Meeting phase: Discussion, 2 of 4');
  });

  it('SpaceActionButtons have proper aria-labels', () => {
    render(
      <SpaceActionButtons
        isUserInSpace={false}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /join this space/i })).toBeInTheDocument();
  });
});
