import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLastSpace } from '@/hooks/useLastSpace';
import { presenceStorageKeys } from '@/lib/presence/storage-keys';
import type { PresenceSnapshot } from '@/lib/presence/contracts';
import type { LocationTransitionOutcome } from '@/lib/presence/location-transition-coordinator';
import type { Company, Space, UserPresenceData } from '@/types/database';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const USER_B_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SPACE_ID = '44444444-4444-4444-8444-444444444444';
const FALLBACK_ID = '66666666-6666-4666-8666-666666666666';
const storedValues = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storedValues.get(key) ?? null,
  setItem: (key: string, value: string) => storedValues.set(key, value),
  removeItem: (key: string) => storedValues.delete(key),
  clear: () => storedValues.clear(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });

const company: Company = {
  id: COMPANY_ID,
  name: 'Company',
  adminIds: [],
  createdAt: '2026-07-18T00:00:00.000Z',
  settings: { defaultSpaceId: SPACE_ID },
};
const spaces: Space[] = [
  {
    id: SPACE_ID,
    companyId: COMPANY_ID,
    name: 'Default workspace',
    type: 'workspace',
    status: 'active',
    capacity: 10,
    features: [],
    position: { x: 0, y: 0, width: 1, height: 1 },
    accessControl: { isPublic: true },
  },
  {
    id: FALLBACK_ID,
    companyId: COMPANY_ID,
    name: 'Fallback workspace',
    type: 'workspace',
    status: 'available',
    capacity: 10,
    features: [],
    position: { x: 1, y: 0, width: 1, height: 1 },
    accessControl: { isPublic: true },
  },
];
const currentUser: UserPresenceData = {
  id: USER_ID,
  displayName: 'User',
  currentSpaceId: null,
  locationVersion: 9,
};

function snapshot(
  initialPlacementCompletedAt: string | null,
  userId = USER_ID,
  currentSpaceId: string | null = null,
  locationVersion = 9
): PresenceSnapshot {
  return {
    serverTime: '2026-07-18T12:00:00.000Z',
    companyId: COMPANY_ID,
    viewerUserId: userId,
    currentUser: { initialPlacementCompletedAt },
    users: [{
      id: userId,
      displayName: 'User',
      avatarUrl: null,
      currentSpaceId,
      locationVersion,
      availabilityStatus: 'online',
      isConnected: true,
      isOccupyingCurrentSpace: false,
      displayStatus: 'online',
      statusMessage: null,
    }],
  };
}

function successfulOutcome(spaceId = SPACE_ID, locationVersion = 10): LocationTransitionOutcome {
  return {
    ok: true,
    response: {
      success: true,
      code: 'LOCATION_UPDATED',
      transitionId: '55555555-5555-4555-8555-555555555555',
      previousSpaceId: null,
      currentSpaceId: spaceId,
      locationVersion,
      alreadyApplied: false,
    },
    snapshot: { currentSpaceId: spaceId, locationVersion },
  };
}

describe('provider-scoped automatic placement', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('runs once per registered session in one provider instance', async () => {
    const transitionLocation = vi.fn(async () => successfulOutcome());
    const options = { sessionId: SESSION_ID, snapshot: snapshot(null), transitionLocation };
    const hook = renderHook(() => useLastSpace(currentUser, spaces, company, options));

    await waitFor(() => expect(transitionLocation).toHaveBeenCalledTimes(1));
    expect(transitionLocation).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      reason: 'auto-first-placement',
      expectedLocationVersion: 9,
    });
    hook.rerender();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transitionLocation).toHaveBeenCalledTimes(1);
  });

  it('waits to claim the session until a placement candidate becomes eligible', async () => {
    const transitionLocation = vi.fn(async () => successfulOutcome());
    const unavailableSpaces: Space[] = spaces.map((space) => ({
      ...space,
      status: 'maintenance',
    }));
    const hook = renderHook(
      ({ availableSpaces }) => useLastSpace(currentUser, availableSpaces, company, {
        sessionId: SESSION_ID,
        snapshot: snapshot(null),
        transitionLocation,
      }),
      { initialProps: { availableSpaces: unavailableSpaces } },
    );

    await act(async () => undefined);
    expect(transitionLocation).not.toHaveBeenCalled();

    hook.rerender({ availableSpaces: spaces });
    await waitFor(() => expect(transitionLocation).toHaveBeenCalledTimes(1));
    expect(transitionLocation).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      reason: 'auto-first-placement',
      expectedLocationVersion: 9,
    });
  });

  it('same-target rejoins a persisted placement to align a new lease', async () => {
    const transitionLocation = vi.fn(async () => successfulOutcome(SPACE_ID, 10));
    renderHook(() => useLastSpace(
      { ...currentUser, currentSpaceId: SPACE_ID },
      spaces,
      company,
      { sessionId: SESSION_ID, snapshot: snapshot('2026-07-01T00:00:00.000Z', USER_ID, SPACE_ID), transitionLocation }
    ));

    await waitFor(() => expect(transitionLocation).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      reason: 'auto-rejoin',
      expectedLocationVersion: 9,
    }));
  });

  it('keeps explicit leave suppressed across later session rotation in the same identity', async () => {
    const transitionLocation = vi.fn(async () => successfulOutcome());
    const hook = renderHook(
      ({ sessionId }) => useLastSpace(currentUser, spaces, company, {
        sessionId,
        snapshot: snapshot('2026-07-01T00:00:00.000Z'),
        transitionLocation,
      }),
      { initialProps: { sessionId: null as string | null } }
    );
    window.localStorage.setItem(presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID), SPACE_ID);
    act(() => hook.result.current.suppressAutoPlacement());
    hook.rerender({ sessionId: SESSION_B_ID });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transitionLocation).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID))).toBeNull();
  });

  it('manual re-entry clears Leave suppression so a later lease can same-target rejoin', async () => {
    const transitionLocation = vi.fn(async () => successfulOutcome());
    const hook = renderHook(
      ({ sessionId, currentSpaceId }) => useLastSpace(
        { ...currentUser, currentSpaceId },
        spaces,
        company,
        {
          sessionId,
          snapshot: snapshot('2026-07-01T00:00:00.000Z', USER_ID, currentSpaceId),
          transitionLocation,
        }
      ),
      { initialProps: { sessionId: null as string | null, currentSpaceId: null as string | null } }
    );
    act(() => {
      hook.result.current.suppressAutoPlacement();
      hook.result.current.resumeAutoPlacement();
    });
    hook.rerender({ sessionId: SESSION_B_ID, currentSpaceId: SPACE_ID });

    await waitFor(() => expect(transitionLocation).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      reason: 'auto-rejoin',
      expectedLocationVersion: 9,
    }));
  });

  it('does not duplicate initialization while SESSION_INVALID recovery owns the new lease', async () => {
    const transitionLocation = vi.fn(async () => successfulOutcome());
    const hook = renderHook(
      ({ recovering, confirmed }) => useLastSpace(currentUser, spaces, company, {
        sessionId: SESSION_B_ID,
        snapshot: snapshot(null),
        transitionLocation,
        isSessionRecoveryInProgress: recovering,
        confirmedSessionId: confirmed,
      }),
      { initialProps: { recovering: true, confirmed: null as string | null } }
    );
    hook.rerender({ recovering: false, confirmed: SESSION_B_ID });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transitionLocation).not.toHaveBeenCalled();
  });

  it('does not enqueue auto work while a superseding manual transition owns the new lease', async () => {
    const transitionLocation = vi.fn(async () => successfulOutcome());
    const hook = renderHook(
      ({ pending, confirmed }) => useLastSpace(currentUser, spaces, company, {
        sessionId: SESSION_B_ID,
        snapshot: snapshot(null),
        transitionLocation,
        isTransitionPending: pending,
        confirmedSessionId: confirmed,
      }),
      { initialProps: { pending: true, confirmed: null as string | null } }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transitionLocation).not.toHaveBeenCalled();

    hook.rerender({ pending: false, confirmed: SESSION_B_ID });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transitionLocation).not.toHaveBeenCalled();
  });

  it('never recreates null server placement from a scoped hint', async () => {
    window.localStorage.setItem(presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID), SPACE_ID);
    const transitionLocation = vi.fn(async () => successfulOutcome());
    renderHook(() => useLastSpace(currentUser, spaces, company, {
      sessionId: SESSION_ID,
      snapshot: snapshot('2026-07-01T00:00:00.000Z'),
      transitionLocation,
    }));

    await waitFor(() => expect(transitionLocation).toHaveBeenCalledTimes(1));
    expect(transitionLocation).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      reason: 'auto-fallback',
      expectedLocationVersion: 9,
    });
  });

  it('hydrates a changed identity before initializing and never uses the prior hint', async () => {
    window.localStorage.setItem(presenceStorageKeys.lastSpace(COMPANY_ID, USER_ID), SPACE_ID);
    window.localStorage.setItem(presenceStorageKeys.lastSpace(COMPANY_ID, USER_B_ID), FALLBACK_ID);
    const transitionLocation = vi.fn(async () => successfulOutcome());
    const hook = renderHook(
      ({ userId }) => useLastSpace(
        { ...currentUser, id: userId },
        spaces,
        { ...company, settings: { homeSpaces: { [USER_B_ID]: FALLBACK_ID } } },
        {
          sessionId: SESSION_ID,
          snapshot: snapshot('2026-07-01T00:00:00.000Z', userId),
          transitionLocation,
        }
      ),
      { initialProps: { userId: USER_ID } }
    );
    await waitFor(() => expect(transitionLocation).toHaveBeenCalledTimes(1));
    transitionLocation.mockClear();
    hook.rerender({ userId: USER_B_ID });
    await waitFor(() => expect(transitionLocation).toHaveBeenCalledTimes(1));
    expect(transitionLocation).toHaveBeenCalledWith(expect.objectContaining({ spaceId: FALLBACK_ID }));
  });

  it('advances typed fallbacks only when reconcile confirms the observed version is unchanged', async () => {
    const transitionLocation = vi
      .fn<() => Promise<LocationTransitionOutcome>>()
      .mockResolvedValueOnce({
        ok: false,
        code: 'SPACE_FULL',
        message: 'full',
        retryable: false,
        skipped: false,
        snapshot: { currentSpaceId: null, locationVersion: 9 },
      })
      .mockResolvedValueOnce(successfulOutcome(FALLBACK_ID, 13));
    renderHook(() => useLastSpace(currentUser, spaces, company, {
      sessionId: SESSION_ID,
      snapshot: snapshot(null),
      transitionLocation,
    }));

    await waitFor(() => expect(transitionLocation).toHaveBeenCalledTimes(2));
    expect(transitionLocation).toHaveBeenNthCalledWith(2, {
      spaceId: FALLBACK_ID,
      reason: 'auto-first-placement',
      expectedLocationVersion: 9,
    });
  });

  it('stops fallback when a cross-tab manual move changes placement during reconcile', async () => {
    const transitionLocation = vi.fn(async (): Promise<LocationTransitionOutcome> => ({
      ok: false,
      code: 'SPACE_FULL',
      message: 'full',
      retryable: false,
      skipped: false,
      snapshot: { currentSpaceId: FALLBACK_ID, locationVersion: 10 },
    }));
    renderHook(() => useLastSpace(currentUser, spaces, company, {
      sessionId: SESSION_ID,
      snapshot: snapshot(null),
      transitionLocation,
    }));

    await waitFor(() => expect(transitionLocation).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transitionLocation).toHaveBeenCalledTimes(1);
  });
});
