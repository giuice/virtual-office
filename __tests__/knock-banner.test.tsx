import { describe, it, vi } from 'vitest';
import type { KnockStatus } from '@/hooks/useKnock';
import type { KnockRequestPayload } from '@/hooks/realtime/useKnockSignaling';

vi.mock('@/components/ui/enhanced-avatar-v2', () => ({
  EnhancedAvatarV2: () => null,
}));

vi.mock('lucide-react', () => ({
  Check: () => null,
  X: () => null,
  Loader2: () => null,
  Hand: () => null,
}));

vi.mock('@/components/floor-plan/modern/KnockBanner', () => ({
  KnockBanner: () => null,
  default: () => null,
}));

vi.mock('@/components/floor-plan/modern/ModernSpaceCard', () => ({
  default: () => null,
}));

const mockKnockRequest: KnockRequestPayload = {
  requestId: 'request-1',
  spaceId: 'space-1',
  requesterId: 'user-1',
  requesterName: 'Taylor Knock',
  requesterAvatarUrl: 'https://example.com/avatar.png',
};

const mockKnockStatus: KnockStatus = 'knocking';

void mockKnockRequest;
void mockKnockStatus;

describe('KnockBanner', () => {
  it.todo('renders requester name and avatar');
  it.todo('renders Approve and Deny buttons');
  it.todo('has role="alert" and aria-live="polite" for accessibility');
  it.todo('has data-avatar-interactive on outer div');
  it.todo('calls onApprove when Approve button clicked');
  it.todo('calls onDeny when Deny button clicked');
  it.todo('stops event propagation on button clicks');
});

describe('ModernSpaceCard - Knock Button', () => {
  it.todo('renders knock button on restricted spaces for non-occupants');
  it.todo('does not render knock button on public spaces');
  it.todo('does not render knock button for occupants of the space');
  it.todo('shows "Knocking..." state with spinner when knockStatus is knocking');
  it.todo('shows disabled "Denied" state when knockStatus is denied');
  it.todo('shows cooldown countdown when knockStatus is cooldown');
  it.todo('knock button has data-avatar-interactive attribute');
});
