import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKnockSignaling } from '@/hooks/realtime/useKnockSignaling';

const mocks = vi.hoisted(() => {
  const channelApi = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };

  return {
    channelApi,
    channel: vi.fn(),
    removeChannel: vi.fn(),
    setAuth: vi.fn(),
    invalidationHandler: undefined as (() => void) | undefined,
  };
});

vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
    realtime: { setAuth: mocks.setAuth },
  }),
}));

describe('useKnockSignaling private invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidationHandler = undefined;
    mocks.channel.mockReturnValue(mocks.channelApi);
    mocks.channelApi.on.mockImplementation((_type, _filter, handler) => {
      mocks.invalidationHandler = handler as () => void;
      return mocks.channelApi;
    });
    mocks.setAuth.mockResolvedValue(undefined);
    mocks.removeChannel.mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ requests: [], status: 'pending' }),
    } as Response);
  });

  it('subscribes privately by company and accelerates both canonical polls', async () => {
    const { unmount } = renderHook(() => useKnockSignaling({
      companyId: 'company-1',
      occupiedSpaceId: 'space-1',
      activeRequestId: 'request-1',
      presenceSessionId: 'session-1',
      currentUserId: 'user-1',
    }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.channelApi.subscribe).toHaveBeenCalledTimes(1));

    expect(mocks.channel).toHaveBeenCalledWith('company:company-1:knock', {
      config: { private: true },
    });
    expect(mocks.channelApi.on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'knock-invalidated' },
      expect.any(Function),
    );

    act(() => mocks.invalidationHandler?.());
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(4));

    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channelApi);
  });
});
