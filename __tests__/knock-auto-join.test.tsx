import { describe, it, vi } from 'vitest';
import type { KnockStatus } from '@/hooks/useKnock';
import type { KnockResponsePayload } from '@/hooks/realtime/useKnockSignaling';

vi.mock('@/hooks/useKnock', () => ({
  useKnock: () => ({
    status: 'idle',
    targetSpaceId: null,
    cooldownRemaining: 0,
    knock: vi.fn(),
    canKnock: vi.fn(() => true),
    handleApproval: vi.fn(),
    handleDenial: vi.fn(),
    reset: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    custom: vi.fn(),
  },
}));

vi.mock('@/components/floor-plan/modern/ModernFloorPlan', () => ({
  default: () => null,
}));

const fetchMock = vi.fn();
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

const mockDeniedStatus: KnockStatus = 'denied';

vi.stubGlobal('fetch', fetchMock);
void mockApprovalPayload;
void mockDeniedStatus;

describe('Knock Auto-Join Flow', () => {
  it.todo('auto-joins space when knock is approved');
  it.todo('shows "Approved by [Name]! Joining..." toast on approval');
  it.todo('shows "Access denied" toast on denial');
  it.todo('shows "No one responded" toast on 30-second timeout');
  it.todo('starts 60-second cooldown after denial');
  it.todo('starts 60-second cooldown after timeout');
  it.todo('clears knock banner from space card on approval');
  it.todo('clears knock banner from space card on denial');
});
