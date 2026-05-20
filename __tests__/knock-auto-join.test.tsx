import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModernFloorPlan from '@/components/floor-plan/modern/ModernFloorPlan';
import type { KnockStatus } from '@/hooks/useKnock';
import type { KnockRequestPayload, KnockResponsePayload } from '@/hooks/realtime/useKnockSignaling';
import type { Space, User, UserPresenceData } from '@/types/database';

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
    onKnock,
    pendingKnockRequest,
    onKnockApprove,
    onKnockDeny,
  }: {
    space: Space;
    onKnock?: (spaceId: string) => void;
    pendingKnockRequest?: KnockRequestPayload | null;
    onKnockApprove?: (payload: KnockRequestPayload) => void;
    onKnockDeny?: (payload: KnockRequestPayload) => void;
  }) => (
    <div data-testid={`space-${space.id}`}>
      <button type="button" onClick={() => onKnock?.(space.id)}>Knock {space.name}</button>
      {pendingKnockRequest && (
        <div role="alert">
          Banner {pendingKnockRequest.requesterName}
          <button type="button" onClick={() => onKnockApprove?.(pendingKnockRequest)}>Approve</button>
          <button type="button" onClick={() => onKnockDeny?.(pendingKnockRequest)}>Deny</button>
        </div>
      )}
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
    mocks.sendKnockRequest.mockResolvedValue({ requestId: 'request-1', recipientCount: 1 });
    mocks.respondToKnock.mockResolvedValue(undefined);
    mocks.updateLocation.mockResolvedValue(undefined);
  });

  it('auto-joins space when knock is approved', async () => {
    mocks.knockState.status = 'knocking';
    mocks.knockState.targetSpaceId = 'space-1';
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));
    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalled());

    await act(async () => {
      mocks.capturedSignalingOptions?.onKnockResponse(mockApprovalPayload);
    });

    await waitFor(() => expect(mocks.updateLocation).toHaveBeenCalledWith('space-1'));
    expect(mocks.onSpaceSelect).toHaveBeenCalledWith(space);
  });

  it('shows "Approved by [Name]! Joining..." toast on approval', async () => {
    mocks.knockState.status = 'knocking';
    mocks.knockState.targetSpaceId = 'space-1';
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));
    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalled());

    await act(async () => {
      mocks.capturedSignalingOptions?.onKnockResponse(mockApprovalPayload);
    });

    expect(mocks.toast.success).toHaveBeenCalledWith('Approved by Morgan Approver! Joining...');
  });

  it('shows "Access denied" toast on denial', async () => {
    mocks.knockState.status = 'knocking';
    mocks.knockState.targetSpaceId = 'space-1';
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));
    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalled());

    act(() => {
      mocks.capturedSignalingOptions?.onKnockResponse(mockDenialPayload);
    });

    expect(mocks.toast.error).toHaveBeenCalledWith('Access denied to Focus Room');
  });

  it('shows "No one responded" toast on 30-second timeout', () => {
    vi.useFakeTimers();
    mocks.knockState.status = 'timeout';
    mocks.knockState.targetSpaceId = 'space-1';

    renderPlan();

    expect(mocks.toast).toHaveBeenCalledWith('No one responded. Try again later.');
  });

  it('starts 60-second cooldown after denial', async () => {
    mocks.knockState.status = 'knocking';
    mocks.knockState.targetSpaceId = 'space-1';
    renderPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Knock Focus Room' }));
    await waitFor(() => expect(mocks.sendKnockRequest).toHaveBeenCalled());

    act(() => {
      mocks.capturedSignalingOptions?.onKnockResponse(mockDenialPayload);
    });

    expect(mocks.handleDenial).toHaveBeenCalledTimes(1);
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

  it('clears knock banner from space card on approval', async () => {
    renderPlan();

    act(() => {
      mocks.capturedSignalingOptions?.onKnockRequest(mockKnockRequest);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Banner Riley Knocker');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('clears knock banner from space card on denial', async () => {
    renderPlan();

    act(() => {
      mocks.capturedSignalingOptions?.onKnockRequest(mockKnockRequest);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Banner Riley Knocker');

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
