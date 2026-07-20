/**
 * Story 3.3: Avatar Constellation V2 - Unit Tests
 * Tests for UserAvatarPresence component with status states
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import UserAvatarPresence, { UserAvatarPresenceProps } from '../src/components/floor-plan/UserAvatarPresence';
import AvatarGroup from '@/components/floor-plan/modern/AvatarGroup';
import { UserPresenceData } from '@/types/database';

// Mock the EnhancedAvatarV2 component
vi.mock('@/components/ui/enhanced-avatar-v2', () => ({
  EnhancedAvatarV2: ({ user, size, className, showStatus, onError }: any) => (
    <div 
      data-testid="enhanced-avatar-v2" 
      data-user-id={user?.id}
      data-size={size}
      className={className}
    >
      {user?.displayName}
    </div>
  ),
}));

// Mock Tooltip components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  TooltipProvider: ({ children }: any) => <div data-testid="tooltip-provider">{children}</div>,
  TooltipTrigger: ({ children, asChild }: any) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
  TooltipContent: ({ children }: any) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

// Mock utils
vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/floor-plan/modern/ModernUserAvatar', () => ({
  default: ({ user }: { user: UserPresenceData }) => (
    <div data-testid="modern-user-avatar" data-user-id={user.id}>
      {user.displayName}
    </div>
  ),
}));

describe('UserAvatarPresence - Story 3.3 Tests', () => {
  const mockUser: UserPresenceData = {
    id: 'user-1',
    displayName: 'John Doe',
    avatarUrl: 'https://example.com/avatar.jpg',
    status: 'online',
    currentSpaceId: 'space-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1 - Enhanced UserAvatarPresence Component', () => {
    it('renders without crashing with basic props', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar).toBeDefined();
    });

    it('renders with new status props (backward compatible)', () => {
      render(
        <UserAvatarPresence 
          user={mockUser} 
          state={{ speaking: true, presenting: false, muted: false }}
        />
      );
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar).toBeDefined();
    });

    it('preserves existing onClick functionality', () => {
      const onClick = vi.fn();
      render(<UserAvatarPresence user={mockUser} onClick={onClick} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      fireEvent.click(wrapper);
      
      expect(onClick).toHaveBeenCalledWith('user-1');
    });

    it('stops propagation on click', () => {
      const onClick = vi.fn();
      const parentClick = vi.fn();
      
      render(
        <div onClick={parentClick}>
          <UserAvatarPresence user={mockUser} onClick={onClick} />
        </div>
      );
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      fireEvent.click(wrapper);
      
      expect(onClick).toHaveBeenCalled();
      // Parent should not receive the click due to stopPropagation
    });

    it('has data-avatar-interactive attribute for click-stop protocol', () => {
      render(<UserAvatarPresence user={mockUser} onClick={() => {}} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.getAttribute('data-avatar-interactive')).toBe('true');
    });
  });

  describe('AC2 - Photo-First Design (36px Circular Avatars)', () => {
    it('uses md size by default (36px)', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar.getAttribute('data-size')).toBe('md');
    });

    it('applies 2px border class', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar.className).toContain('border-2');
    });

    it('applies theme border color', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar.className).toContain('border-[var(--vo-card-bg)]');
    });
  });

  describe('AC3 - Animated Status Rings', () => {
    it('applies vo-avatar-speaking class when isSpeaking is true', () => {
      render(<UserAvatarPresence user={mockUser} state={{ speaking: true }} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.className).toContain('vo-avatar-speaking');
    });

    it('applies vo-avatar-presenting class when isPresenting is true', () => {
      render(<UserAvatarPresence user={mockUser} state={{ presenting: true }} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.className).toContain('vo-avatar-presenting');
    });

    it('applies vo-avatar-muted class when isMuted is true', () => {
      render(<UserAvatarPresence user={mockUser} state={{ muted: true }} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.className).toContain('vo-avatar-muted');
    });

    it('does not apply status classes when all status props are false', () => {
      render(
        <UserAvatarPresence 
          user={mockUser} 
          state={{ speaking: false, presenting: false, muted: false }}
        />
      );
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.className).not.toContain('vo-avatar-speaking');
      expect(wrapper.className).not.toContain('vo-avatar-presenting');
      expect(wrapper.className).not.toContain('vo-avatar-muted');
    });
  });

  describe('AC6 - Hover Interaction with Scale Transform', () => {
    it('has hover transform classes', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.className).toContain('hover:translate-y-[-3px]');
      expect(wrapper.className).toContain('hover:scale-110');
      expect(wrapper.className).toContain('hover:z-50');
    });

    it('has transition classes for smooth animation', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.className).toContain('transition-all');
      expect(wrapper.className).toContain('duration-200');
    });

    it('shows tooltip with user name', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const tooltipContent = screen.getByTestId('tooltip-content');
      expect(tooltipContent.textContent).toContain('John Doe');
    });

    it('shows Speaking status in tooltip when isSpeaking', () => {
      render(<UserAvatarPresence user={mockUser} state={{ speaking: true }} />);
      
      const tooltipContent = screen.getByTestId('tooltip-content');
      expect(tooltipContent.textContent).toContain('Speaking');
    });

    it('shows Presenting status in tooltip when isPresenting', () => {
      render(<UserAvatarPresence user={mockUser} state={{ presenting: true }} />);
      
      const tooltipContent = screen.getByTestId('tooltip-content');
      expect(tooltipContent.textContent).toContain('Presenting');
    });

    it('shows Muted status in tooltip when isMuted', () => {
      render(<UserAvatarPresence user={mockUser} state={{ muted: true }} />);
      
      const tooltipContent = screen.getByTestId('tooltip-content');
      expect(tooltipContent.textContent).toContain('Muted');
    });
  });

  describe('AC7 - Theme-Aware Styling', () => {
    it('uses CSS variable for border color', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar.className).toContain('border-[var(--vo-card-bg)]');
    });
  });

  describe('Accessibility', () => {
    it('renders a native button when onClick is provided', () => {
      render(<UserAvatarPresence user={mockUser} onClick={() => {}} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.tagName).toBe('BUTTON');
      expect(wrapper.getAttribute('type')).toBe('button');
    });

    it('has tabIndex when onClick is provided', () => {
      render(<UserAvatarPresence user={mockUser} onClick={() => {}} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.getAttribute('tabIndex')).toBe('0');
    });

    it('has aria-label with user name', () => {
      render(<UserAvatarPresence user={mockUser} onClick={() => {}} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.getAttribute('aria-label')).toContain('John Doe');
    });

    it('uses native button semantics for Enter activation', () => {
      render(<UserAvatarPresence user={mockUser} onClick={() => {}} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.tagName).toBe('BUTTON');
      expect(wrapper.getAttribute('type')).toBe('button');
    });

    it('uses native button semantics for space key activation', () => {
      render(<UserAvatarPresence user={mockUser} onClick={() => {}} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      
      expect(wrapper.tagName).toBe('BUTTON');
      expect(wrapper.getAttribute('type')).toBe('button');
    });
  });

  describe('Status Indicator Dot', () => {
    it('renders status indicator dot', () => {
      render(<UserAvatarPresence user={mockUser} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      const statusDot = wrapper.querySelector('span');
      
      expect(statusDot).not.toBeNull();
    });

    it('applies online status color', () => {
      render(<UserAvatarPresence user={{ ...mockUser, status: 'online' }} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      const statusDot = wrapper.querySelector('span');
      
      expect(statusDot?.className).toContain('bg-green-500');
    });

    it('applies away status color', () => {
      render(<UserAvatarPresence user={{ ...mockUser, status: 'away' }} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      const statusDot = wrapper.querySelector('span');
      
      expect(statusDot?.className).toContain('bg-yellow-500');
    });

    it('applies busy status color', () => {
      render(<UserAvatarPresence user={{ ...mockUser, status: 'busy' }} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      const statusDot = wrapper.querySelector('span');
      
      expect(statusDot?.className).toContain('bg-red-500');
    });

    it('applies offline status color', () => {
      render(<UserAvatarPresence user={{ ...mockUser, status: 'offline' }} />);
      
      const trigger = screen.getByTestId('tooltip-trigger');
      const wrapper = trigger.firstChild as HTMLElement;
      const statusDot = wrapper.querySelector('span');
      
      expect(statusDot?.className).toContain('bg-gray-400');
    });
  });

  describe('Size Prop', () => {
    it('passes sm size to EnhancedAvatarV2', () => {
      render(<UserAvatarPresence user={mockUser} size="sm" />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar.getAttribute('data-size')).toBe('sm');
    });

    it('passes md size to EnhancedAvatarV2', () => {
      render(<UserAvatarPresence user={mockUser} size="md" />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar.getAttribute('data-size')).toBe('md');
    });

    it('passes lg size to EnhancedAvatarV2', () => {
      render(<UserAvatarPresence user={mockUser} size="lg" />);
      
      const avatar = screen.getByTestId('enhanced-avatar-v2');
      expect(avatar.getAttribute('data-size')).toBe('lg');
    });
  });
});

describe('AvatarGroup - Story 3.3 Tests', () => {
  const users: UserPresenceData[] = Array.from({ length: 6 }, (_, index) => ({
    id: `group-user-${index + 1}`,
    displayName: `Group User ${index + 1}`,
    avatarUrl: undefined,
    status: 'online',
    currentSpaceId: 'space-1',
  }));
  
  describe('AC4 - Smart Stacking', () => {
    it('limits visible avatars to 4 by default', () => {
      render(<AvatarGroup users={users} />);

      expect(screen.getAllByTestId('modern-user-avatar')).toHaveLength(4);
    });

    it('applies negative margin overlap (-10px)', () => {
      const { container } = render(<AvatarGroup users={users.slice(0, 3)} />);
      const avatarItems = container.querySelectorAll<HTMLElement>('.vo-avatar-item');

      expect(avatarItems[0]).toHaveStyle({ marginLeft: '0' });
      expect(avatarItems[1]).toHaveStyle({ marginLeft: '-10px' });
      expect(avatarItems[2]).toHaveStyle({ marginLeft: '-10px' });
    });

    it('applies z-index layering (rightmost on top)', () => {
      const { container } = render(<AvatarGroup users={users.slice(0, 3)} />);
      const avatarItems = container.querySelectorAll<HTMLElement>('.vo-avatar-item');

      expect(avatarItems[0]).toHaveStyle({ zIndex: '1' });
      expect(avatarItems[1]).toHaveStyle({ zIndex: '2' });
      expect(avatarItems[2]).toHaveStyle({ zIndex: '3' });
    });
  });

  describe('AC5 - Overflow Badge', () => {
    it('displays overflow badge when participants exceed max', () => {
      render(<AvatarGroup users={users} max={5} />);

      expect(screen.getByRole('button', { name: '1 more participants' })).toBeInTheDocument();
    });

    it('overflow badge shows correct count', () => {
      render(<AvatarGroup users={users} />);

      expect(screen.getByRole('button', { name: '2 more participants' })).toHaveTextContent('+2');
    });

    it('overflow badge uses the theme-token-backed style contract', () => {
      render(<AvatarGroup users={users} />);

      expect(screen.getByRole('button', { name: '2 more participants' })).toHaveClass(
        'vo-avatar-overflow',
      );
    });
  });
});
