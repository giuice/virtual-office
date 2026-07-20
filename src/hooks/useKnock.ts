// src/hooks/useKnock.ts
// Story 3.16: Knock to Enter Workflow - Client-Side State Machine
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { presenceStorageKeys } from '@/lib/presence/storage-keys';

/**
 * The status of a knock request.
 */
export type KnockStatus = 'idle' | 'knocking' | 'approved' | 'denied' | 'timeout' | 'cooldown';

/**
 * The return type of the useKnock hook.
 */
export interface UseKnockReturn {
	/** Current knock status */
	status: KnockStatus;
	/** Remaining cooldown time in seconds (0 when not in cooldown) */
	cooldownRemaining: number;
	/** The space ID for the current knock request, or null if idle */
	targetSpaceId: string | null;
	/** Initiate a knock to the specified space. Transitions to 'knocking' state. */
	knock: (spaceId: string) => void;
	/** Cancel the current knock request. Resets to 'idle'. */
	cancel: () => void;
	/** Reset status after handling approval/denial/timeout. */
	reset: () => void;
	/** Check if a knock is allowed (not in cooldown for a given space). */
	canKnock: (spaceId: string) => boolean;
	/** Get cooldown remaining (in seconds) for a specific space. */
	getCooldownRemaining: (spaceId: string) => number;
	/** Called externally when an approval is received. */
	handleApproval: () => void;
	/** Called externally when a denial is received. Starts cooldown. */
	handleDenial: () => void;
	/** Called externally when a timeout occurs. */
	handleTimeout: () => void;
}

const COOLDOWN_DURATION_MS = 60 * 1000; // 60 seconds cooldown after denial
const TIMEOUT_DURATION_MS = 30 * 1000; // 30 seconds wait for response
function getCooldownStorageKey(
	companyId: string | null,
	userId: string | null,
	spaceId: string
): string | null {
	return companyId && userId ? presenceStorageKeys.knockCooldown(companyId, userId, spaceId) : null;
}

/**
 * Get cooldown expiry timestamp from localStorage for a given space.
 */
function getCooldownExpiry(companyId: string | null, userId: string | null, spaceId: string): number | null {
	if (typeof window === 'undefined') return null;
	const key = getCooldownStorageKey(companyId, userId, spaceId);
	if (!key) return null;
	const stored = localStorage.getItem(key);
	if (!stored) return null;
	return parseInt(stored, 10);
}

/**
 * Set cooldown expiry timestamp in localStorage for a given space.
 */
function setCooldownExpiry(
	companyId: string | null,
	userId: string | null,
	spaceId: string,
	expiryTimestamp: number
): void {
	if (typeof window === 'undefined') return;
	const key = getCooldownStorageKey(companyId, userId, spaceId);
	if (key) localStorage.setItem(key, expiryTimestamp.toString());
}

/**
 * Clear cooldown from localStorage for a given space.
 */
function clearCooldownExpiry(companyId: string | null, userId: string | null, spaceId: string): void {
	if (typeof window === 'undefined') return;
	const key = getCooldownStorageKey(companyId, userId, spaceId);
	if (key) localStorage.removeItem(key);
}

/**
 * Get remaining cooldown in seconds for a given space.
 */
function getRemainingCooldownSeconds(
	companyId: string | null,
	userId: string | null,
	spaceId: string
): number {
	const expiry = getCooldownExpiry(companyId, userId, spaceId);
	if (!expiry) return 0;
	const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
	if (remaining <= 0) {
		clearCooldownExpiry(companyId, userId, spaceId);
	}
	return remaining;
}

/**
 * useKnock - Manages the client-side state machine for the "Knock to Enter" workflow.
 *
 * States: idle -> knocking -> (approved | denied | timeout)
 * Denial triggers a cooldown period (persisted in localStorage).
 */
export function useKnock(companyId: string | null = null, userId: string | null = null): UseKnockReturn {
	const [status, setStatus] = useState<KnockStatus>('idle');
	const [targetSpaceId, setTargetSpaceId] = useState<string | null>(null);
	const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

		const timeoutRef = useRef<NodeJS.Timeout | null>(null);
		const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

		// Cleanup timeouts on unmount
		useEffect(() => {
			const clearKnockTimers = () => {
				if (timeoutRef.current) clearTimeout(timeoutRef.current);
				if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
			};
			return clearKnockTimers;
		}, []);

	/**
	 * Check if a knock is allowed for a specific space.
	 * Returns false if the user is in cooldown for that space.
	 */
	const canKnock = useCallback((spaceId: string): boolean => {
		const remaining = getRemainingCooldownSeconds(companyId, userId, spaceId);
		if (remaining > 0) {
			setStatus('cooldown');
			setTargetSpaceId(spaceId);
			setCooldownRemaining(remaining);
			return false; // Still in cooldown
		}
		return status === 'idle' || status === 'cooldown';
	}, [companyId, status, userId]);

	/**
	 * Get the remaining cooldown for a space in seconds.
	 */
	const getCooldownRemaining = useCallback((spaceId: string): number => {
		return getRemainingCooldownSeconds(companyId, userId, spaceId);
	}, [companyId, userId]);

	/**
	 * Start or update a cooldown timer for a space.
	 */
	const startCooldown = useCallback((spaceId: string) => {
		const expiryTimestamp = Date.now() + COOLDOWN_DURATION_MS;
		setCooldownExpiry(companyId, userId, spaceId, expiryTimestamp);
		setStatus('cooldown');

		// Update remaining time every second
		const updateRemaining = () => {
			const expiry = getCooldownExpiry(companyId, userId, spaceId);
			if (expiry) {
				const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
				setCooldownRemaining(remaining);
				if (remaining <= 0) {
					clearCooldownExpiry(companyId, userId, spaceId);
					setStatus('idle');
					if (cooldownIntervalRef.current) {
						clearInterval(cooldownIntervalRef.current);
						cooldownIntervalRef.current = null;
					}
				}
			}
		};

		updateRemaining(); // Initial update
		cooldownIntervalRef.current = setInterval(updateRemaining, 1000);
	}, [companyId, userId]);

	/**
	 * Start the timeout timer for a knock request.
	 */
	const startTimeoutTimer = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(() => {
			setStatus('timeout');
			setTargetSpaceId(null);
		}, TIMEOUT_DURATION_MS);
	}, []);

	/**
	 * Initiate a knock request to the specified space.
	 */
	const knock = useCallback((spaceId: string) => {
		// Check for existing cooldown
		if (!canKnock(spaceId)) {
			console.log('[useKnock] Knock blocked: user is in cooldown for space', spaceId);
			return;
		}

		// Clear any existing timers
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);

		setTargetSpaceId(spaceId);
		setStatus('knocking');
		setCooldownRemaining(0);
		startTimeoutTimer();
	}, [canKnock, startTimeoutTimer]);

	/**
	 * Cancel the current knock request.
	 */
	const cancel = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setStatus('idle');
		setTargetSpaceId(null);
	}, []);

	/**
	 * Reset the hook to idle state after handling a result.
	 */
	const reset = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		// Do not clear cooldown timer - it runs independently
		setStatus('idle');
		setTargetSpaceId(null);
	}, []);

	/**
	 * Handle an approval response.
	 */
	const handleApproval = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setStatus('approved');
		// targetSpaceId is kept so the caller can use it to join
	}, []);

	/**
	 * Handle a denial response. Starts the cooldown timer.
	 */
	const handleDenial = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setStatus('denied');
		if (targetSpaceId) {
			startCooldown(targetSpaceId);
		}
		setTargetSpaceId(null);
	}, [targetSpaceId, startCooldown]);

	/**
	 * Handle a timeout (no response received in time).
	 */
	const handleTimeout = useCallback(() => {
		// Status is already set by the timeout timer
		// This is here for external calls if needed
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setStatus('timeout');
		setTargetSpaceId(null);
	}, []);

	return {
		status,
		cooldownRemaining,
		targetSpaceId,
		knock,
		cancel,
		reset,
		canKnock,
		getCooldownRemaining,
		handleApproval,
		handleDenial,
		handleTimeout,
	};
}

export default useKnock;
