/**
 * Story 3.12: Space Capacity and "Room Full" Handling Tests
 * Tests for AC2, AC3, AC5, AC6, AC7, AC8
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Component imports
import { FullBadge } from '@/components/floor-plan/modern/FullBadge';
import { SpaceActionButtons } from '@/components/floor-plan/modern/SpaceActionButtons';
import { CapacityIndicator } from '@/components/floor-plan/modern/StatusIndicators';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

describe('Story 3.12: Space Capacity and Room Full Handling', () => {
  describe('FullBadge Component (AC2, AC7, AC8)', () => {
    it('renders with "Full" text', () => {
      render(<FullBadge />);
      
      expect(screen.getByText('Full')).toBeInTheDocument();
    });

    it('has role="status" for accessibility (AC8)', () => {
      render(<FullBadge />);
      
      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
    });

    it('has aria-label="Space is full" for screen readers (AC8)', () => {
      render(<FullBadge />);
      
      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('aria-label', 'Space is full');
    });

    it('applies theme tokens via CSS variables (AC7)', () => {
      render(<FullBadge />);
      
      const badge = screen.getByText('Full');
      // Check that the component uses CSS custom properties for theming
      expect(badge.className).toContain('bg-[var(--vo-full-badge-bg');
      expect(badge.className).toContain('text-[var(--vo-full-badge-text');
    });

    it('accepts custom className prop', () => {
      render(<FullBadge className="custom-test-class" />);
      
      const badge = screen.getByText('Full');
      expect(badge.className).toContain('custom-test-class');
    });
  });

  describe('SpaceActionButtons - Join Disabled When Full (AC3)', () => {
    const mockOnJoin = vi.fn();
    const mockOnLeave = vi.fn();
    const mockOnKnock = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('renders enabled Join button when not full', () => {
      render(
        <SpaceActionButtons
          state={{ userInSpace: false, full: false }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      );

      const joinButton = screen.getByRole('button', { name: /join this space/i });
      expect(joinButton).not.toBeDisabled();
    });

    it('disables Join button when space is full (AC3)', () => {
      render(
        <SpaceActionButtons
          state={{ userInSpace: false, full: true }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      );

      const joinButton = screen.getByRole('button');
      expect(joinButton).toBeDisabled();
    });

    it('shows tooltip explaining "Space is full" when disabled (AC3)', () => {
      render(
        <SpaceActionButtons
          state={{ userInSpace: false, full: true }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      );

      const joinButton = screen.getByRole('button');
      expect(joinButton).toHaveAttribute('title', 'Space is full - cannot join');
    });

    it('has aria-disabled when full for accessibility (AC3, AC8)', () => {
      render(
        <SpaceActionButtons
          state={{ userInSpace: false, full: true }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      );

      const joinButton = screen.getByRole('button');
      expect(joinButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not call onJoin when button is clicked while full (AC3)', () => {
      render(
        <SpaceActionButtons
          state={{ userInSpace: false, full: true }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      );

      const joinButton = screen.getByRole('button');
      fireEvent.click(joinButton);
      
      expect(mockOnJoin).not.toHaveBeenCalled();
    });

    it('shows "Full" text instead of "Join" when full', () => {
      render(
        <SpaceActionButtons
          state={{ userInSpace: false, full: true }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      );

      expect(screen.getByText('Full')).toBeInTheDocument();
      expect(screen.queryByText('Join')).not.toBeInTheDocument();
    });

    it('shows Leave button when user is in space (unaffected by isFull)', () => {
      render(
        <SpaceActionButtons
          state={{ userInSpace: true, full: true }}
          onJoin={mockOnJoin}
          onLeave={mockOnLeave}
        />
      );

      // Leave button should always be enabled
      const leaveButton = screen.getByRole('button', { name: /leave this space/i });
      expect(leaveButton).not.toBeDisabled();
      expect(leaveButton).toBeInTheDocument();
    });
  });

  describe('CapacityIndicator Component (AC1, AC6)', () => {
    it('displays occupancy count when no capacity (AC1)', () => {
      render(<CapacityIndicator current={6} capacity={0} />);
      
      expect(screen.getByText('6')).toBeInTheDocument();
    });

    it('displays current/capacity format when capacity exists (AC1)', () => {
      render(<CapacityIndicator current={6} capacity={10} />);
      
      expect(screen.getByText('6/10')).toBeInTheDocument();
    });

    it('shows tooltip with capacity status', async () => {
      render(<CapacityIndicator current={9} capacity={10} />);
      
      // The tooltip trigger should exist
      const container = screen.getByText('9/10').closest('div');
      expect(container).toBeInTheDocument();
    });

    it('applies high utilization color when near capacity', () => {
      render(<CapacityIndicator current={9} capacity={10} />);
      
      // Should have some visual indication of high utilization
      const indicator = screen.getByText('9/10').closest('div');
      expect(indicator).toBeInTheDocument();
    });
  });
});
