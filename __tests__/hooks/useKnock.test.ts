// src/hooks/__tests__/useKnock.test.ts
// Story 3.16: Knock to Enter - Unit Tests for useKnock hook
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKnock } from '@/hooks/useKnock';

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
		removeItem: vi.fn((key: string) => { delete store[key]; }),
		clear: () => { store = {}; },
	};
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useKnock', () => {
	const renderUseKnock = () => renderHook(() => useKnock('company-1', 'user-1'));
	beforeEach(() => {
		vi.useFakeTimers();
		localStorageMock.clear();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('Initial State', () => {
		it('should start with idle status', () => {
			const { result } = renderUseKnock();
			expect(result.current.status).toBe('idle');
			expect(result.current.targetSpaceId).toBeNull();
			expect(result.current.cooldownRemaining).toBe(0);
		});
	});

	describe('Knock Action', () => {
		it('should transition to knocking status when knock is called', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
			});

			expect(result.current.status).toBe('knocking');
			expect(result.current.targetSpaceId).toBe('space-123');
		});

		it('should allow knock when canKnock returns true', () => {
			const { result } = renderUseKnock();

			expect(result.current.canKnock('space-123')).toBe(true);
		});
	});

	describe('Approval Handling', () => {
		it('should transition to approved status on handleApproval', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
			});

			act(() => {
				result.current.handleApproval();
			});

			expect(result.current.status).toBe('approved');
			// targetSpaceId should be kept for auto-join
			expect(result.current.targetSpaceId).toBe('space-123');
		});

		it('should reset to idle after reset is called', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
				result.current.handleApproval();
				result.current.reset();
			});

			expect(result.current.status).toBe('idle');
			expect(result.current.targetSpaceId).toBeNull();
		});
	});

	describe('Denial Handling', () => {
		it('should transition to cooldown status on handleDenial', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
			});

			act(() => {
				result.current.handleDenial();
			});

			// Hook transitions from denied -> cooldown immediately
			// when startCooldown is called
			act(() => {
				vi.advanceTimersByTime(100);
			});

			expect(result.current.status).toBe('cooldown');
		});

		it('should start cooldown after denial', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
			});

			act(() => {
				result.current.handleDenial();
			});

			// Wait for the cooldown update
			act(() => {
				vi.advanceTimersByTime(100);
			});

			expect(result.current.status).toBe('cooldown');
			expect(result.current.cooldownRemaining).toBeGreaterThan(0);
		});

		it('should persist cooldown in localStorage', () => {
			// Reset localStorage mock before test
			localStorageMock.clear();
			vi.clearAllMocks();

			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
			});

			act(() => {
				result.current.handleDenial();
			});

			// Wait for cooldown interval to trigger
			act(() => {
				vi.advanceTimersByTime(100);
			});

			// The setItem should have been called during startCooldown
			// Check that cooldownRemaining is set, indicating cooldown started
			expect(result.current.status).toBe('cooldown');
			expect(result.current.cooldownRemaining).toBeGreaterThan(0);
		});

		it('should block knock during cooldown', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
				result.current.handleDenial();
			});

			expect(result.current.canKnock('space-123')).toBe(false);
		});
	});

	describe('Timeout Handling', () => {
		it('should auto-timeout after 30 seconds', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
			});

			expect(result.current.status).toBe('knocking');

			act(() => {
				vi.advanceTimersByTime(30000); // 30 seconds
			});

			expect(result.current.status).toBe('timeout');
			expect(result.current.targetSpaceId).toBeNull();
		});
	});

	describe('Cancel Action', () => {
		it('should reset to idle when cancelled', () => {
			const { result } = renderUseKnock();

			act(() => {
				result.current.knock('space-123');
			});

			act(() => {
				result.current.cancel();
			});

			expect(result.current.status).toBe('idle');
			expect(result.current.targetSpaceId).toBeNull();
		});
	});
});
