import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emitPresenceEvent: vi.fn(),
}));

vi.mock('@/lib/presence/observability', () => ({
  emitPresenceEvent: mocks.emitPresenceEvent,
}));

import { fetchPresenceSnapshot } from '@/hooks/queries/usePresenceSnapshot';

const COMPANY_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('scoped Presence snapshot observability', () => {
  it('emits an allowlisted client query-error event for a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network detail')));

    await expect(fetchPresenceSnapshot(COMPANY_ID, USER_ID)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
    expect(mocks.emitPresenceEvent).toHaveBeenCalledOnce();
    expect(mocks.emitPresenceEvent).toHaveBeenCalledWith(expect.objectContaining({
      category: 'snapshot',
      action: 'query-error',
      resultCode: 'NETWORK_ERROR',
      companyId: COMPANY_ID,
      appUserId: USER_ID,
      retryable: true,
    }));
    expect(JSON.stringify(mocks.emitPresenceEvent.mock.calls)).not.toContain('network detail');
  });

  it('does not classify an intentional abort as a scoped query error', async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));

    await expect(
      fetchPresenceSnapshot(COMPANY_ID, USER_ID, { signal: controller.signal }),
    ).rejects.toBe(aborted);
    expect(mocks.emitPresenceEvent).not.toHaveBeenCalled();
  });
});
