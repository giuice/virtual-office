/**
 * Story 3.13: Real-Time Presence Animation - Unit Tests
 * Tests for enter animations and status transitions (simplified approach)
 * 
 * Note: Exit animations were removed due to complexity causing bugs.
 * Enter animations only apply to truly NEW users added to a space.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import UserAvatarPresence from '../src/components/floor-plan/UserAvatarPresence';
import AvatarGroup from '../src/components/floor-plan/modern/AvatarGroup';
import { UserPresenceData } from '@/types/database';

// Mock the EnhancedAvatarV2 component
vi.mock('@/components/ui/enhanced-avatar-v2', () => ({
	EnhancedAvatarV2: ({ user, size, className }: any) => (
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

// Mock ModernUserAvatar component
vi.mock('../src/components/floor-plan/modern/ModernUserAvatar', () => ({
	default: ({ user, onClick }: any) => (
		<div
			data-testid={`modern-user-avatar-${user.id}`}
			onClick={() => onClick?.(user.id)}
		>
			{user.displayName}
		</div>
	),
}));

// Mock Tooltip components
vi.mock('@/components/ui/tooltip', () => ({
	Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
	TooltipProvider: ({ children }: any) => <div data-testid="tooltip-provider">{children}</div>,
	TooltipTrigger: ({ children }: any) => (
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

describe('Story 3.13: Real-Time Presence Animation', () => {
	const mockUser: UserPresenceData = {
		id: 'user-1',
		displayName: 'John Doe',
		avatarUrl: 'https://example.com/avatar.jpg',
		status: 'online',
		currentSpaceId: 'space-1',
	};

	const createMockUsers = (count: number): UserPresenceData[] =>
		Array.from({ length: count }, (_, i) => ({
			id: `user-${i + 1}`,
			displayName: `User ${i + 1}`,
			avatarUrl: `https://example.com/avatar${i + 1}.jpg`,
			status: 'online' as const,
			currentSpaceId: 'space-1',
		}));

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('AC3 - Smooth Status Transitions', () => {
		it('has vo-avatar-item class for status transitions', () => {
			render(<UserAvatarPresence user={mockUser} />);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('vo-avatar-item');
		});

		it('applies speaking status class', () => {
			render(<UserAvatarPresence user={mockUser} isSpeaking={true} />);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('vo-avatar-speaking');
			expect(wrapper.className).toContain('vo-avatar-item');
		});

		it('applies presenting status class', () => {
			render(<UserAvatarPresence user={mockUser} isPresenting={true} />);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('vo-avatar-presenting');
		});

		it('applies muted status class', () => {
			render(<UserAvatarPresence user={mockUser} isMuted={true} />);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('vo-avatar-muted');
		});

		it('has hover transform classes for interactive feedback', () => {
			render(<UserAvatarPresence user={mockUser} />);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('hover:translate-y-[-3px]');
			expect(wrapper.className).toContain('hover:scale-110');
		});
	});

	describe('AvatarGroup - Enter Animation', () => {
		it('does not apply enter animation on initial render', () => {
			const users = createMockUsers(2);
			render(<AvatarGroup users={users} />);

			// Initial render should not have enter animation (skipped for initial mount)
			const container = screen.getByTestId('modern-user-avatar-user-1').parentElement;
			expect(container?.className).toContain('vo-avatar-item');
			// No vo-avatar-enter on initial render
			expect(container?.className).not.toContain('vo-avatar-enter');
		});

		it('applies enter animation when new user is added', () => {
			const initialUsers = createMockUsers(1);
			const { rerender } = render(<AvatarGroup users={initialUsers} />);

			// Add a new user
			const updatedUsers = createMockUsers(2);
			rerender(<AvatarGroup users={updatedUsers} />);

			// The newly added user-2 should have enter animation
			const newUserContainer = screen.getByTestId('modern-user-avatar-user-2').parentElement;
			expect(newUserContainer?.className).toContain('vo-avatar-enter');
		});

		it('clears enter animation after 300ms', () => {
			const initialUsers = createMockUsers(1);
			const { rerender } = render(<AvatarGroup users={initialUsers} />);

			// Add a new user
			const updatedUsers = createMockUsers(2);
			rerender(<AvatarGroup users={updatedUsers} />);

			// Verify animation is applied
			let newUserContainer = screen.getByTestId('modern-user-avatar-user-2').parentElement;
			expect(newUserContainer?.className).toContain('vo-avatar-enter');

			// Fast-forward 300ms
			act(() => {
				vi.advanceTimersByTime(300);
			});

			// Re-render to reflect state update
			rerender(<AvatarGroup users={updatedUsers} />);

			// Animation should be cleared
			newUserContainer = screen.getByTestId('modern-user-avatar-user-2').parentElement;
			expect(newUserContainer?.className).not.toContain('vo-avatar-enter');
		});

		it('removed users disappear immediately (no exit animation)', () => {
			const initialUsers = createMockUsers(2);
			const { rerender } = render(<AvatarGroup users={initialUsers} />);

			// Remove one user
			const remainingUsers = [initialUsers[1]];
			rerender(<AvatarGroup users={remainingUsers} />);

			// Removed user should be gone immediately
			expect(screen.queryByTestId('modern-user-avatar-user-1')).toBeNull();
		});

		it('shows empty text when no users', () => {
			render(<AvatarGroup users={[]} emptyText="Empty" />);
			expect(screen.getByText('Empty')).toBeDefined();
		});
	});

	describe('AC6 - Reduced Motion Accessibility (CSS)', () => {
		// Note: Actual reduced motion behavior is handled by CSS media queries
		// which cannot be fully tested in jsdom. We verify the base classes exist.

		it('has vo-avatar-item base class that CSS reduced-motion rules target', () => {
			render(<UserAvatarPresence user={mockUser} />);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('vo-avatar-item');
		});
	});

	describe('Integration - Status Combined with Base Styles', () => {
		it('can combine speaking status with base item class', () => {
			render(
				<UserAvatarPresence
					user={mockUser}
					isSpeaking={true}
				/>
			);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('vo-avatar-speaking');
			expect(wrapper.className).toContain('vo-avatar-item');
		});

		it('can combine presenting status with base item class', () => {
			render(
				<UserAvatarPresence
					user={mockUser}
					isPresenting={true}
				/>
			);

			const trigger = screen.getByTestId('tooltip-trigger');
			const wrapper = trigger.firstChild as HTMLElement;

			expect(wrapper.className).toContain('vo-avatar-presenting');
			expect(wrapper.className).toContain('vo-avatar-item');
		});
	});
});
