import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioSignaling } from '@/hooks/realtime/useAudioSignaling';
import type { WebRTCManager } from '@/lib/webrtc';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PEER_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SHARE_ID = '66666666-6666-4666-8666-666666666666';

const mocks = vi.hoisted(() => {
  const channelApi = {
    on: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn(),
    send: vi.fn(),
    presenceState: vi.fn(() => ({})),
  };
  const client = {
    channel: vi.fn(),
    removeChannel: vi.fn(),
    realtime: { setAuth: vi.fn() },
  };

  return {
    channelApi,
    client,
    statusHandler: undefined as ((status: string) => void) | undefined,
  };
});

vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => mocks.client,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function activeResponse(active: unknown = null): Response {
  return new Response(JSON.stringify({ success: true, code: 'ACTIVE_READ', active }), { status: 200 });
}

function options(manager: WebRTCManager, overrides: Partial<Parameters<typeof useAudioSignaling>[0]> = {}) {
  return {
    companyId: COMPANY_ID,
    spaceId: SPACE_ID,
    currentUserId: USER_ID,
    presenceSessionId: SESSION_ID,
    generation: 1,
    webrtcManager: manager,
    isMuted: true,
    ...overrides,
  };
}

describe('useAudioSignaling private media lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statusHandler = undefined;
    mocks.client.channel.mockReturnValue(mocks.channelApi);
    mocks.client.removeChannel.mockResolvedValue('ok');
    mocks.client.realtime.setAuth.mockResolvedValue(undefined);
    mocks.channelApi.on.mockReturnValue(mocks.channelApi);
    mocks.channelApi.subscribe.mockImplementation((handler: (status: string) => void) => {
      mocks.statusHandler = handler;
      return mocks.channelApi;
    });
    mocks.channelApi.track.mockResolvedValue('ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(activeResponse()));
  });

  it('opens the exact private media topic and sends initial signaling only after SUBSCRIBED', async () => {
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;

    renderHook(() => useAudioSignaling(options(manager)));

    await waitFor(() => expect(mocks.client.channel).toHaveBeenCalledWith(
      `company:${COMPANY_ID}:space:${SPACE_ID}:media`,
      {
        config: {
          private: true,
          broadcast: { self: false, ack: true },
          presence: { key: `${USER_ID}:${SESSION_ID}` },
        },
      },
    ));
    expect(manager.broadcastHandshake).not.toHaveBeenCalled();

    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.broadcastHandshake).toHaveBeenCalledTimes(1));
    expect(manager.setSignalingChannel).toHaveBeenCalledWith(mocks.channelApi, expect.any(Function));
    expect(mocks.channelApi.track).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      is_muted: true,
    }));
  });

  it('parses every broadcast before scope checks or manager dispatch', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      handleDescription: vi.fn().mockResolvedValue(undefined),
      handleIceCandidate: vi.fn().mockResolvedValue(undefined),
      handleHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;

    renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.broadcastHandshake).toHaveBeenCalledTimes(1));

    const description = {
      type: 'description',
      sourceUserId: PEER_ID,
      targetUserId: USER_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: null,
      description: { type: 'offer', sdp: 'v=0' },
    };
    act(() => {
      handlers.get('broadcast:description')?.({ payload: { ...description, description: { type: 'offer' } } });
      handlers.get('broadcast:description')?.({ payload: { ...description, companyId: SHARE_ID } });
      handlers.get('broadcast:description')?.({ payload: description });
    });

    await waitFor(() => expect(manager.handleDescription).toHaveBeenCalledTimes(1));
    expect(manager.handleDescription).toHaveBeenCalledWith(PEER_ID, USER_ID, description.description, null);
  });

  it('uses the authorized active route after subscribe and invalidation instead of treating hints as presenter authority', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const active = {
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      presenterUserId: PEER_ID,
      presenterName: 'Presenter',
      shareId: SHARE_ID,
      expiresAt: '2026-07-24T00:00:00.000Z',
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(activeResponse(null))
      .mockResolvedValueOnce(activeResponse(active));

    const { result } = renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    act(() => handlers.get('broadcast:presenter-invalidated')?.({ payload: {
      type: 'presenter-invalidated',
      sourceUserId: PEER_ID,
      targetUserId: USER_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
    } }));
    await waitFor(() => expect(result.current.activeShare).toEqual(active));
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/spaces/${SPACE_ID}/screen-share/active?presenceSessionId=${SESSION_ID}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('fences deferred subscribe, fetch, remove, and callbacks from scope A after scope B starts', async () => {
    const tracked = deferred<string>();
    mocks.channelApi.track.mockReturnValue(tracked.promise);
    const managerA = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const managerB = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;

    const { rerender } = renderHook(
      ({ manager, spaceId, generation }) => useAudioSignaling(options(manager, { spaceId, generation })),
      { initialProps: { manager: managerA, spaceId: SPACE_ID, generation: 1 } },
    );
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    rerender({ manager: managerB, spaceId: SHARE_ID, generation: 2 });
    await act(async () => tracked.resolve('ok'));

    expect(managerA.broadcastHandshake).not.toHaveBeenCalled();
    expect(managerA.setSignalingChannel).toHaveBeenLastCalledWith(null);
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(mocks.channelApi);
  });

  it('wraps manager signaling with validated scoped payloads and refuses sends before subscription', async () => {
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(SHARE_ID),
    } as unknown as WebRTCManager;

    renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(manager.setSignalingChannel).not.toHaveBeenCalled());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.setSignalingChannel).toHaveBeenCalled());
    const sendSignal = vi.mocked(manager.setSignalingChannel).mock.calls[0][1];
    if (!sendSignal) throw new Error('signal sender was not installed');

    await sendSignal({
      type: 'description',
      senderId: USER_ID,
      targetUserId: PEER_ID,
      description: { type: 'offer', sdp: 'v=0' },
    });

    expect(mocks.channelApi.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'description',
      payload: {
        type: 'description',
        sourceUserId: USER_ID,
        targetUserId: PEER_ID,
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        shareId: SHARE_ID,
        description: { type: 'offer', sdp: 'v=0' },
      },
    });
  });
});
