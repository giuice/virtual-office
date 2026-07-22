import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModernFloorPlan from '@/components/floor-plan/modern/ModernFloorPlan';
import type { KnockStatus } from '@/hooks/useKnock';
import type { KnockRequestPayload, KnockResponsePayload } from '@/hooks/realtime/useKnockSignaling';
import type { Space, User, UserPresenceData } from '@/types/database';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });

  return {
    toast,
    updateLocation: vi.fn(),
    onSpaceSelect: vi.fn(),
    sendKnockRequest: vi.fn(),
    respondToKnock: vi.fn(),
    handleApproval: vi.fn(),
    handleDenial: vi.fn(),
    reset: vi.fn(),
    knock: vi.fn(),
    canKnock: vi.fn(),
    getCooldownRemaining: vi.fn(),
    releaseManualIntent: vi.fn(),
    capturedSignalingOptions: undefined as undefined | {
      onKnockRequest: (payload: KnockRequestPayload) => void;
      onKnockResponse: (payload: KnockResponsePayload) => void;
    },
    knockState: {
      status: 'idle' as KnockStatus,
      targetSpaceId: null as string | null,
      cooldownRemaining: 0,
    },
  };
});

vi.mock('sonner', () => ({
  toast: mocks.toast,
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({
    currentUserProfile: currentUser,
  }),
}));

vi.mock('@/contexts/PresenceContext', () => ({
  usePresence: () => ({
    users: [currentUserPresence],
    usersInSpaces,
    isLoading: false,
    updateLocation: mocks.updateLocation,
    beginManualIntent: () => 42,
    releaseManualIntent: mocks.releaseManualIntent,
    presenceSessionId: '22222222-2222-4222-8222-222222222222',
  }),
}));

vi.mock('@/contexts/AudioContext', () => ({
  useAudio: () => ({
    speakingUsers: new Map(),
    mutedUserIds: new Set(),
  }),
}));

vi.mock('@/hooks/useKnock', () => ({
  useKnock: () => ({
    status: mocks.knockState.status,
    targetSpaceId: mocks.knockState.targetSpaceId,
    cooldownRemaining: mocks.knockState.cooldownRemaining,
    knock: mocks.knock,
    canKnock: mocks.canKnock,
    getCooldownRemaining: mocks.getCooldownRemaining,
    handleApproval: mocks.handleApproval,
    handleDenial: mocks.handleDenial,
    reset: mocks.reset,
    cancel: vi.fn(),
    handleTimeout: vi.fn(),
  }),
}));

vi.mock('@/hooks/realtime/useKnockSignaling', () => ({
  useKnockSignaling: (options: {
    onKnockRequest: (payload: KnockRequestPayload) => void;
    onKnockResponse: (payload: KnockResponsePayload) => void;
  }) => {
    mocks.capturedSignalingOptions = options;
    return {
      occupiedChannelStatus: 'SUBSCRIBED',
      sendKnockRequest: mocks.sendKnockRequest,
      respondToKnock: mocks.respondToKnock,
    };
  },
}));

vi.mock('@/components/floor-plan/modern/ModernSpaceCard', () => ({
  default: ({
    space,
    onEnterSpace,
    onKnock,
    state,
  }: {
    space: Space;
    onEnterSpace: (spaceId: string) => void;
    onKnock?: (spaceId: string) => void;
    state?: { directEnter?: boolean };
  }) => (
    <div data-testid={`space-${space.id}`}>
      <div data-testid={`space-state-${space.id}`}>{`direct:${Boolean(state?.directEnter)} knock:${Boolean(onKnock)}`}</div>
      <button type="button" onClick={() => onEnterSpace(space.id)}>Enter {space.name}</button>
      <button type="button" onClick={() => onKnock?.(space.id)}>Knock {space.name}</button>
    </div>
  ),
}));

const currentUser: User = {
  id: 'user-1',
  companyId: 'company-1',
  supabase_uid: 'supabase-user-1',
  email: 'requester@example.com',
  displayName: 'Taylor Requester',
  avatarUrl: undefined,
  status: 'online',
  preferences: {},
  role: 'member',
  lastActive: '2026-03-19T00:00:00.000Z',
  createdAt: '2026-03-19T00:00:00.000Z',
  currentSpaceId: null,
};

const currentUserPresence: UserPresenceData = {
  id: currentUser.id,
  displayName: currentUser.displayName,
  avatarUrl: undefined,
  status: 'online',
  currentSpaceId: null,
  statusMessage: undefined,
};

const space: Space = {
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

const usersInSpaces = new Map<string, UserPresenceData[]>([
  [space.id, [{ ...currentUserPresence, id: 'occupant-1', displayName: 'Morgan Occupant', currentSpaceId: space.id }]],
]);

const mockApprovalPayload: KnockResponsePayload = {
  type: 'KNOCK_RESPONSE',
  requestId: 'request-1',
  spaceId: 'space-1',
  requesterId: 'user-1',
  responderId: 'user-2',
  responderName: 'Morgan Approver',
  responderValidated: true,
  decision: 'APPROVE',
  timestamp: Date.now(),
  requesterLocationVersion: 7,
};

const mockDenialPayload: KnockResponsePayload = {
  ...mockApprovalPayload,
  decision: 'DENY',
};

const mockKnockRequest: KnockRequestPayload = {
  type: 'KNOCK_REQUEST',
  requestId: 'request-1',
  spaceId: 'space-1',
  requesterId: 'user-3',
  requesterName: 'Riley Knocker',
  requesterAvatarUrl: undefined,
  timestamp: Date.now(),
};

function renderPlan() {
  return render(
    <ModernFloorPlan
      spaces={[space]}
      onSpaceSelect={mocks.onSpaceSelect}
      enableNeighborhoodGrouping={false}
    />
  );
}

function placeCurrentUserInResponderSpace() {
  currentUserPresence.currentSpaceId = space.id;
  currentUserPresence.isOccupyingCurrentSpace = true;
  usersInSpaces.set(space.id, [
    currentUserPresence,
    { ...currentUserPresence, id: 'occupant-1', displayName: 'Morgan Occupant' },
  ]);
}

describe('Knock Auto-Join Flow', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.capturedSignalingOptions = undefined;
    mocks.knockState.status = 'idle';
    mocks.knockState.targetSpaceId = null;
    mocks.knockState.cooldownRemaining = 0;
    mocks.canKnock.mockReturnValue(true);
    mocks.getCooldownRemaining.mockReturnValue(0);
    mocks.sendKnockRequest.mockResolvedValue({
      requestId: 'request-1',
      recipientCount: 1,
      requesterLocationVersion: 7,
    });
    mocks.respondToKnock.mockResolvedValue(undefined);
    mocks.updateLocation.mockResolvedValue({ ok: true });
    currentUser.role = 'member';
    currentUserPresence.currentSpaceId = null;
    currentUserPresence.isOccupyingCurrentSpace = false;
    space.capacity = 4;
    space.accessControl = { isPublic: false };
    usersInSpaces.clear();
    usersInSpaces.set(space.id, [{ ...currentUserPresence, id: 'occupant-1', displayName: 'Morgan Occupant', currentSpaceId: space.id }]);
  });

  it('starts the server-owned knock flow for an occupied room', async () => {
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));

    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalledWith('space-1', {
      id: 'user-1',
      name: 'Taylor Requester',
      avatarUrl: undefined,
    }));
    expect(mocks.updateLocation).not.toHaveBeenCalled();
  });

  it('does not process approval or denial signaling while disabled', () => {
    mocks.knockState.targetSpaceId = 'space-1';
    renderPlan();

    act(() => {
      mocks.capturedSignalingOptions?.onKnockResponse(mockApprovalPayload);
      mocks.capturedSignalingOptions?.onKnockResponse(mockDenialPayload);
    });

    expect(mocks.updateLocation).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('shows "No one responded" toast on 30-second timeout', () => {
    vi.useFakeTimers();
    mocks.knockState.status = 'timeout';
    mocks.knockState.targetSpaceId = 'space-1';

    renderPlan();

    expect(mocks.toast).toHaveBeenCalledWith('No one responded. Try again later.');
  });

  it('explains that an inaccessible private room requires an approved knock', async () => {
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Enter Focus Room' }));

    expect(await screen.findByText('This private room requires an approved knock before entry.')).toBeInTheDocument();
    expect(mocks.updateLocation).not.toHaveBeenCalled();
  });

  it('resets requester timeout presentation after timeout', () => {
    vi.useFakeTimers();
    mocks.knockState.status = 'timeout';
    mocks.knockState.targetSpaceId = 'space-1';
    renderPlan();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mocks.reset).toHaveBeenCalledTimes(1);
  });

  it('shows canonical knock banners when polling returns a request', async () => {
    placeCurrentUserInResponderSpace();
    renderPlan();

    act(() => {
      mocks.capturedSignalingOptions?.onKnockRequest(mockKnockRequest);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Riley Knocker');
  });

  it('hides a pending banner immediately when the responder leaves its space', () => {
    placeCurrentUserInResponderSpace();
    const { rerender } = renderPlan();

    act(() => {
      mocks.capturedSignalingOptions?.onKnockRequest(mockKnockRequest);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    currentUserPresence.currentSpaceId = null;
    currentUserPresence.isOccupyingCurrentSpace = false;
    rerender(
      <ModernFloorPlan
        spaces={[space]}
        onSpaceSelect={mocks.onSpaceSelect}
        enableNeighborhoodGrouping={false}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.respondToKnock).not.toHaveBeenCalled();
  });

  it('serializes rapid responder decisions for the same request', async () => {
    placeCurrentUserInResponderSpace();
    const response = deferred<void>();
    mocks.respondToKnock.mockReturnValue(response.promise);
    renderPlan();

    act(() => {
      mocks.capturedSignalingOptions?.onKnockRequest(mockKnockRequest);
    });
    const approve = screen.getByRole('button', { name: 'Let Riley Knocker in' });
    fireEvent.click(approve);
    fireEvent.click(approve);

    expect(mocks.respondToKnock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Let Riley Knocker in' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny Riley Knocker' })).toBeDisabled();

    await act(async () => response.resolve());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it.each(['resolve', 'reject'] as const)(
    'does not update responder UI when a pending decision %s after unmount',
    async (settlement) => {
      placeCurrentUserInResponderSpace();
      const response = deferred<void>();
      mocks.respondToKnock.mockReturnValue(response.promise);
      const { unmount } = renderPlan();
      act(() => {
        mocks.capturedSignalingOptions?.onKnockRequest(mockKnockRequest);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Let Riley Knocker in' }));
      unmount();

      await act(async () => {
        if (settlement === 'resolve') response.resolve();
        else response.reject(new Error('late failure'));
        await response.promise.catch(() => undefined);
      });

      expect(mocks.toast.success).not.toHaveBeenCalled();
      expect(mocks.toast.info).not.toHaveBeenCalled();
      expect(mocks.toast.error).not.toHaveBeenCalled();
    },
  );

  it('does not make a private space knockable when only a stale offline occupant exists', () => {
    // The authoritative selector excludes disconnected/stale placements before
    // responder logic consumes the occupant map.
    usersInSpaces.clear();
    renderPlan();

    expect(screen.getByTestId('space-state-space-1')).toHaveTextContent('direct:false knock:false');

    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));

    expect(mocks.sendKnockRequest).not.toHaveBeenCalled();
    expect(mocks.knock).not.toHaveBeenCalled();
  });

  it('allows direct entry to an empty private space when access rules allow the user', async () => {
    usersInSpaces.clear();
    space.accessControl = { isPublic: false, allowedUsers: [currentUser.id] };
    renderPlan();

    expect(screen.getByTestId('space-state-space-1')).toHaveTextContent('direct:true knock:false');

    fireEvent.click(screen.getByRole('button', { name: 'Enter Focus Room' }));

    await waitFor(() => expect(mocks.updateLocation).toHaveBeenCalledWith('space-1', {
      reason: 'manual-enter',
    }));
    expect(mocks.sendKnockRequest).not.toHaveBeenCalled();
  });

  it('does not count stale offline occupants against client-side capacity', async () => {
    space.capacity = 1;
    space.accessControl = { isPublic: false, allowedUsers: [currentUser.id] };
    usersInSpaces.clear();

    renderPlan();

    fireEvent.click(screen.getByRole('button', { name: 'Enter Focus Room' }));

    await waitFor(() => expect(mocks.updateLocation).toHaveBeenCalledWith('space-1', {
      reason: 'manual-enter',
    }));
  });

  it('offers knocking whenever another online occupant is present', async () => {
    renderPlan();

    expect(screen.getByTestId('space-state-space-1')).toHaveTextContent('direct:false knock:true');

    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));

    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalledTimes(1));
  });

  it('offers both Enter and Knock when direct access exists and the room is occupied', () => {
    space.accessControl = { isPublic: false, allowedUsers: [currentUser.id] };
    renderPlan();

    expect(screen.getByTestId('space-state-space-1')).toHaveTextContent('direct:true knock:true');
  });

  it('auto-joins with the exact approved request id', async () => {
    mocks.knockState.targetSpaceId = 'space-1';
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));
    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalledTimes(1));

    act(() => {
      mocks.capturedSignalingOptions?.onKnockResponse(mockApprovalPayload);
    });

    await waitFor(() => expect(mocks.updateLocation).toHaveBeenCalledWith('space-1', {
      reason: 'knock-enter',
      knockRequestId: 'request-1',
      expectedLocationVersion: 7,
      intentGeneration: 42,
    }));
    expect(mocks.releaseManualIntent).toHaveBeenCalledWith(42);
  });

  it('does not select the room when an approved knock was superseded by another move', async () => {
    mocks.knockState.targetSpaceId = 'space-1';
    mocks.updateLocation.mockResolvedValue({
      ok: false,
      code: 'LOCATION_SUPERSEDED',
      message: 'Location transition was superseded',
      retryable: false,
      skipped: true,
    });
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));
    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalledTimes(1));

    act(() => {
      mocks.capturedSignalingOptions?.onKnockResponse(mockApprovalPayload);
    });

    await waitFor(() => expect(mocks.updateLocation).toHaveBeenCalledWith('space-1', {
      reason: 'knock-enter',
      knockRequestId: 'request-1',
      expectedLocationVersion: 7,
      intentGeneration: 42,
    }));
    expect(mocks.onSpaceSelect).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});
