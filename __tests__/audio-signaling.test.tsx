import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioSignaling } from '@/hooks/realtime/useAudioSignaling';
import type { WebRTCManager } from '@/lib/webrtc';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SPACE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PEER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER_ID = '88888888-8888-4888-8888-888888888888';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_SESSION_ID = '99999999-9999-4999-8999-999999999999';
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

function options(manager: WebRTCManager, overrides: Partial<Parameters<typeof useAudioSignaling>[0]> = {}): Parameters<typeof useAudioSignaling>[0] {
  return {
    companyId: COMPANY_ID,
    spaceId: SPACE_ID,
    currentUserId: USER_ID,
    presenceSessionId: SESSION_ID,
    accessToken: 'test-access-token',
    generation: 1,
    webrtcManager: manager,
    isMuted: true,
    ...overrides,
  } as Parameters<typeof useAudioSignaling>[0];
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
    mocks.channelApi.send.mockResolvedValue('ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(activeResponse()));
  });

  it('opens the exact private media topic and sends initial signaling only after SUBSCRIBED', async () => {
    const manager = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;

    const { result } = renderHook(() => useAudioSignaling(options(manager)));

    await waitFor(() => expect(mocks.client.channel).toHaveBeenCalledWith(
      `company:${COMPANY_ID}:space:${SPACE_ID}:media`,
      {
        config: {
          private: true,
          broadcast: { self: true, ack: true },
          presence: { key: `${USER_ID}:${SESSION_ID}` },
        },
      },
    ));
    expect(manager.broadcastHandshake).not.toHaveBeenCalled();

    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.broadcastHandshake).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(manager.setSignalingChannel).toHaveBeenCalledWith(mocks.channelApi, expect.any(Function));
    expect(mocks.channelApi.track).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      is_muted: true,
    }));

    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.broadcastHandshake).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(mocks.client.realtime.setAuth).toHaveBeenCalledTimes(1);
  });

  it('parses every broadcast before scope checks or manager dispatch', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const manager = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
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
    const localConnectionId = vi.mocked(manager.setSignalingIdentity).mock.calls[0]?.[1];
    if (!localConnectionId) throw new Error('local signaling identity was not installed');

    const description = {
      type: 'description',
      sourceUserId: PEER_ID,
      sourcePresenceSessionId: SESSION_ID,
      sourceConnectionId: '77777777-7777-4777-8777-777777777777',
      targetUserId: USER_ID,
      targetPresenceSessionId: SESSION_ID,
      targetConnectionId: localConnectionId,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: null,
      description: { type: 'offer', sdp: 'v=0' },
    };
    act(() => {
      handlers.get('broadcast:handshake')?.({ payload: { type: 'handshake', sourceUserId: 'not-a-uuid' } });
      handlers.get('broadcast:description')?.({ payload: { ...description, description: { type: 'offer' } } });
      handlers.get('broadcast:description')?.({ payload: { ...description, companyId: SHARE_ID } });
      handlers.get('broadcast:description')?.({ payload: { ...description, targetPresenceSessionId: SHARE_ID } });
      handlers.get('broadcast:description')?.({ payload: { ...description, targetConnectionId: '88888888-8888-4888-8888-888888888888' } });
      handlers.get('broadcast:ice')?.({ payload: { ...description, type: 'ice', candidate: { candidate: '' } } });
      handlers.get('broadcast:presenter-hint')?.({ payload: { ...description, type: 'presenter-hint' } });
      handlers.get('broadcast:presenter-invalidated')?.({ payload: { ...description, type: 'presenter-invalidated' } });
      handlers.get('broadcast:description')?.({ payload: description });
    });

    await waitFor(() => expect(manager.handleDescription).toHaveBeenCalledTimes(1));
    expect(manager.handleHandshake).not.toHaveBeenCalled();
    expect(manager.handleIceCandidate).not.toHaveBeenCalled();
    expect(manager.handleDescription).toHaveBeenCalledWith(PEER_ID, USER_ID, description.description, null, expect.any(String), expect.any(String), SESSION_ID, expect.any(String));
  });

  it('reconciles an exact room invalidation before any presenter handshake without treating its payload as authority', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const manager = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      handleHandshake: vi.fn().mockResolvedValue(undefined),
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
      .mockResolvedValueOnce(activeResponse(active))
      .mockResolvedValueOnce(activeResponse(null));

    const { result } = renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(result.current.activeShare).toEqual(active));
    expect(manager.handleHandshake).not.toHaveBeenCalled();

    act(() => handlers.get('broadcast:presenter-invalidated')?.({ payload: {
      type: 'presenter-invalidated',
      sourceUserId: PEER_ID,
      sourcePresenceSessionId: SESSION_ID,
      sourceConnectionId: '77777777-7777-4777-8777-777777777777',
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: OTHER_USER_ID,
    } }));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);

    act(() => handlers.get('broadcast:presenter-invalidated')?.({ payload: {
      type: 'presenter-invalidated',
      sourceUserId: PEER_ID,
      sourcePresenceSessionId: SESSION_ID,
      sourceConnectionId: '77777777-7777-4777-8777-777777777777',
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
    } }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.activeShare).toBeNull());
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/spaces/${SPACE_ID}/screen-share/active?presenceSessionId=${SESSION_ID}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(manager.handleHandshake).not.toHaveBeenCalled();
  });

  it.each([
    'lease expiry',
    'presenter exit/movement',
    'presenter revision/session authority change',
  ])('converges active to null on the 10-second authoritative cadence when %s is never delivered by Realtime', async () => {
    vi.useFakeTimers();
    try {
      const manager = {
        setSignalingIdentity: vi.fn(),
        setSignalingChannel: vi.fn(),
        renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
        broadcastHandshake: vi.fn().mockResolvedValue(undefined),
        getActiveShareId: vi.fn().mockReturnValue(null),
      } as unknown as WebRTCManager;
      const active = {
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        presenterUserId: PEER_ID,
        presenterName: 'Presenter',
        shareId: SHARE_ID,
        expiresAt: '2000-01-01T00:00:00.000Z',
      };
      vi.mocked(fetch)
        .mockResolvedValueOnce(activeResponse(active))
        .mockResolvedValueOnce(activeResponse(active))
        .mockResolvedValueOnce(activeResponse(null));

      const { result } = renderHook(() => useAudioSignaling(options(manager)));
      await act(async () => {});
      act(() => mocks.statusHandler?.('SUBSCRIBED'));
      await act(async () => {});
      expect(result.current.activeShare).toEqual(active);
      expect(fetch).toHaveBeenCalledTimes(1);

      await act(async () => vi.advanceTimersByTimeAsync(1_000));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.current.activeShare).toEqual(active);

      await act(async () => vi.advanceTimersByTimeAsync(8_999));
      expect(fetch).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.current.activeShare).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('replaces periodic ownership on repeated subscription and fences a deferred retired response', async () => {
    vi.useFakeTimers();
    try {
      const stalePeriodic = deferred<Response>();
      const active = {
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        presenterUserId: PEER_ID,
        presenterName: 'Presenter',
        shareId: SHARE_ID,
        expiresAt: '2030-01-01T00:00:00.000Z',
      };
      vi.mocked(fetch)
        .mockResolvedValueOnce(activeResponse(active))
        .mockResolvedValueOnce(activeResponse(active))
        .mockReturnValueOnce(stalePeriodic.promise)
        .mockResolvedValueOnce(activeResponse(null));
      const manager = {
        setSignalingIdentity: vi.fn(),
        setSignalingChannel: vi.fn(),
        renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
        broadcastHandshake: vi.fn().mockResolvedValue(undefined),
        getActiveShareId: vi.fn().mockReturnValue(null),
      } as unknown as WebRTCManager;
      const { result, unmount } = renderHook(() => useAudioSignaling(options(manager)));
      await act(async () => {});
      act(() => mocks.statusHandler?.('SUBSCRIBED'));
      await act(async () => {});
      expect(result.current.activeShare).toEqual(active);

      await act(async () => vi.advanceTimersByTimeAsync(1_000));
      expect(fetch).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(9_000));
      expect(fetch).toHaveBeenCalledTimes(3);
      const staleSignal = vi.mocked(fetch).mock.calls[2]?.[1]?.signal;
      expect(staleSignal?.aborted).toBe(false);

      act(() => mocks.statusHandler?.('TIMED_OUT'));
      expect(staleSignal?.aborted).toBe(true);
      act(() => mocks.statusHandler?.('SUBSCRIBED'));
      await act(async () => {});
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(result.current.activeShare).toBeNull();

      await act(async () => stalePeriodic.resolve(activeResponse(active)));
      expect(result.current.activeShare).toBeNull();
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
      expect(fetch).toHaveBeenCalledTimes(5);
      await act(async () => vi.advanceTimersByTimeAsync(8_999));
      expect(fetch).toHaveBeenCalledTimes(5);

      unmount();
      await act(async () => vi.advanceTimersByTimeAsync(20_000));
      expect(fetch).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts the exact self echo but rejects mixed same-user session generations', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const manager = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(SHARE_ID),
    } as unknown as WebRTCManager;
    const active = {
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      presenterUserId: USER_ID,
      presenterName: 'Current presenter',
      shareId: SHARE_ID,
      expiresAt: '2026-07-24T00:00:00.000Z',
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(activeResponse(active))
      .mockResolvedValueOnce(activeResponse(null));

    const { result } = renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(result.current.activeShare).toEqual(active));
    const connectionId = vi.mocked(manager.setSignalingIdentity).mock.calls[0]?.[1];
    if (!connectionId) throw new Error('local signaling identity was not installed');

    const ownedPayload = {
      type: 'presenter-invalidated',
      sourceUserId: USER_ID,
      sourcePresenceSessionId: SESSION_ID,
      sourceConnectionId: connectionId,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
    };
    act(() => handlers.get('broadcast:presenter-invalidated')?.({
      payload: { ...ownedPayload, sourceConnectionId: OTHER_USER_ID },
    }));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);

    act(() => handlers.get('broadcast:presenter-invalidated')?.({
      payload: { ...ownedPayload, sourcePresenceSessionId: OTHER_SESSION_ID },
    }));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);

    act(() => handlers.get('broadcast:presenter-invalidated')?.({ payload: ownedPayload }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.activeShare).toBeNull());
  });

  it('accepts a distinct same-user session and connection only in the current canonical room scope', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const manager = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(SHARE_ID),
    } as unknown as WebRTCManager;
    const active = {
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      presenterUserId: USER_ID,
      presenterName: 'Current presenter',
      shareId: SHARE_ID,
      expiresAt: '2026-07-24T00:00:00.000Z',
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(activeResponse(active))
      .mockResolvedValueOnce(activeResponse(null));

    const { result } = renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(result.current.activeShare).toEqual(active));
    const connectionId = vi.mocked(manager.setSignalingIdentity).mock.calls[0]?.[1];
    if (!connectionId) throw new Error('local signaling identity was not installed');

    const distinctSessionPayload = {
      type: 'presenter-invalidated',
      sourceUserId: USER_ID,
      sourcePresenceSessionId: OTHER_SESSION_ID,
      sourceConnectionId: OTHER_USER_ID,
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: SHARE_ID,
    };
    act(() => handlers.get('broadcast:presenter-invalidated')?.({
      payload: { ...distinctSessionPayload, spaceId: PEER_ID },
    }));
    act(() => handlers.get('broadcast:presenter-invalidated')?.({
      payload: { ...distinctSessionPayload, sourceConnectionId: connectionId },
    }));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);

    act(() => handlers.get('broadcast:presenter-invalidated')?.({
      payload: distinctSessionPayload,
    }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.activeShare).toBeNull());
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/spaces/${SPACE_ID}/screen-share/active?presenceSessionId=${SESSION_ID}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('fences deferred subscribe, fetch, remove, and callbacks from scope A after scope B starts', async () => {
    const tracked = deferred<string>();
    mocks.channelApi.track.mockReturnValue(tracked.promise);
    const managerA = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const managerB = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
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

  it('prevents every late scope-A callback and active read from mutating scope B', async () => {
    const makeChannel = () => {
      const handlers = new Map<string, (value: { payload: unknown }) => void>();
      let statusHandler: ((status: string) => void) | undefined;
      const api = {
        on: vi.fn(),
        subscribe: vi.fn(),
        track: vi.fn().mockResolvedValue('ok'),
        send: vi.fn().mockResolvedValue('ok'),
        presenceState: vi.fn(() => ({})),
      };
      api.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
        handlers.set(`${type}:${filter.event}`, handler);
        return api;
      });
      api.subscribe.mockImplementation((handler: (status: string) => void) => {
        statusHandler = handler;
        return api;
      });
      return { api, handlers, getStatusHandler: () => statusHandler };
    };
    const channelA = makeChannel();
    const channelB = makeChannel();
    mocks.client.channel
      .mockReturnValueOnce(channelA.api)
      .mockReturnValueOnce(channelB.api);
    const activeA = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(activeA.promise)
      .mockResolvedValueOnce(activeResponse(null));
    const removeA = deferred<string>();
    mocks.client.removeChannel.mockImplementation((channel: unknown) => (
      channel === channelA.api ? removeA.promise : Promise.resolve('ok')
    ));
    const managerA = {
      setSignalingIdentity: vi.fn(), setSignalingChannel: vi.fn(), renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined), handleHandshake: vi.fn().mockResolvedValue(undefined),
      handleDescription: vi.fn().mockResolvedValue(undefined), handleIceCandidate: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const managerB = {
      setSignalingIdentity: vi.fn(), setSignalingChannel: vi.fn(), renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined), handleHandshake: vi.fn().mockResolvedValue(undefined),
      handleDescription: vi.fn().mockResolvedValue(undefined), handleIceCandidate: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const { result, rerender } = renderHook(
      ({ manager, spaceId, currentUserId, generation, accessToken, isMuted }) => useAudioSignaling(options(manager, {
        spaceId,
        currentUserId,
        generation,
        accessToken,
        isMuted,
      })),
      {
        initialProps: {
          manager: managerA,
          spaceId: SPACE_ID,
          currentUserId: USER_ID,
          generation: 1,
          accessToken: 'token-a',
          isMuted: true,
        },
      },
    );
    await waitFor(() => expect(channelA.getStatusHandler()).toBeDefined());
    act(() => channelA.getStatusHandler()?.('SUBSCRIBED'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const connectionA = vi.mocked(managerA.setSignalingIdentity).mock.calls[0]?.[1];
    if (!connectionA) throw new Error('scope A signaling identity was not installed');

    rerender({
      manager: managerB,
      spaceId: SHARE_ID,
      currentUserId: OTHER_USER_ID,
      generation: 2,
      accessToken: 'token-b',
      isMuted: false,
    });
    await waitFor(() => expect(channelB.getStatusHandler()).toBeDefined());
    act(() => channelB.getStatusHandler()?.('SUBSCRIBED'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    const source = {
      sourceUserId: PEER_ID,
      sourcePresenceSessionId: SESSION_ID,
      sourceConnectionId: '77777777-7777-4777-8777-777777777777',
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      shareId: null,
    };
    const target = {
      targetUserId: USER_ID,
      targetPresenceSessionId: SESSION_ID,
      targetConnectionId: connectionA,
    };
    act(() => {
      channelA.handlers.get('broadcast:handshake')?.({ payload: { type: 'handshake', ...source } });
      channelA.handlers.get('broadcast:description')?.({
        payload: { type: 'description', ...source, ...target, description: { type: 'offer', sdp: 'late-a' } },
      });
      channelA.handlers.get('broadcast:ice')?.({
        payload: {
          type: 'ice',
          ...source,
          ...target,
          candidate: { candidate: 'late-a', sdpMid: '0', sdpMLineIndex: 0 },
        },
      });
      channelA.handlers.get('broadcast:presenter-hint')?.({
        payload: {
          type: 'presenter-hint',
          ...source,
          ...target,
          shareId: SHARE_ID,
          presenterUserId: PEER_ID,
          presenterName: 'Late A',
          expiresAt: '2026-07-24T00:00:00.000Z',
        },
      });
      channelA.handlers.get('broadcast:presenter-invalidated')?.({
        payload: { type: 'presenter-invalidated', ...source, shareId: SHARE_ID },
      });
    });
    await act(async () => {
      activeA.resolve(activeResponse({
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        presenterUserId: PEER_ID,
        presenterName: 'Late A',
        shareId: SHARE_ID,
        expiresAt: '2026-07-24T00:00:00.000Z',
      }));
      removeA.resolve('ok');
    });

    expect(managerA.handleHandshake).not.toHaveBeenCalled();
    expect(managerA.handleDescription).not.toHaveBeenCalled();
    expect(managerA.handleIceCandidate).not.toHaveBeenCalled();
    expect(result.current.activeShare).toBeNull();
    expect(managerB.setSignalingChannel).toHaveBeenCalledWith(channelB.api, expect.any(Function));
    expect(channelA.api.track).not.toHaveBeenCalledWith(expect.objectContaining({ user_id: OTHER_USER_ID }));
    expect(channelB.api.track).toHaveBeenCalledWith({ user_id: OTHER_USER_ID, is_muted: false });
    expect(mocks.client.removeChannel.mock.calls.filter(([channel]) => channel === channelA.api)).toHaveLength(1);
  });

  it('removes and recreates the private channel when the access token refreshes', async () => {
    const manager = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const { rerender } = renderHook(
      ({ accessToken }) => useAudioSignaling(options(manager, { accessToken })),
      { initialProps: { accessToken: 'token-a' } },
    );
    await waitFor(() => expect(mocks.client.realtime.setAuth).toHaveBeenCalledWith('token-a'));

    rerender({ accessToken: 'token-b' });

    await waitFor(() => expect(mocks.client.realtime.setAuth).toHaveBeenCalledWith('token-b'));
    expect(mocks.client.channel).toHaveBeenCalledTimes(2);
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('wraps manager signaling with validated scoped payloads and refuses sends before subscription', async () => {
    const manager = {
      setSignalingIdentity: vi.fn(),
      setSignalingChannel: vi.fn(),
      renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
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
      targetPresenceSessionId: SESSION_ID,
      targetConnectionId: '77777777-7777-4777-8777-777777777777',
      description: { type: 'offer', sdp: 'v=0' },
    });

    expect(mocks.channelApi.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'description',
      payload: {
        type: 'description',
        sourceUserId: USER_ID,
        sourcePresenceSessionId: SESSION_ID,
        sourceConnectionId: expect.any(String),
        targetUserId: PEER_ID,
        targetPresenceSessionId: SESSION_ID,
        targetConnectionId: '77777777-7777-4777-8777-777777777777',
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        shareId: SHARE_ID,
        description: { type: 'offer', sdp: 'v=0' },
      },
    });

    await sendSignal({
      type: 'presenter-invalidated',
      shareId: SHARE_ID,
    });

    expect(mocks.channelApi.send).toHaveBeenLastCalledWith({
      type: 'broadcast',
      event: 'presenter-invalidated',
      payload: {
        type: 'presenter-invalidated',
        sourceUserId: USER_ID,
        sourcePresenceSessionId: SESSION_ID,
        sourceConnectionId: expect.any(String),
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        shareId: SHARE_ID,
      },
    });
  });

  it('buffers non-null share media until the matching authorized presenter response while handshake and audio continue', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const active = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(active.promise);
    const manager = {
      setSignalingIdentity: vi.fn(), setSignalingChannel: vi.fn(), renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined), handleHandshake: vi.fn().mockResolvedValue(undefined),
      handleDescription: vi.fn().mockResolvedValue(undefined), handleIceCandidate: vi.fn().mockResolvedValue(undefined), getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.setSignalingIdentity).toHaveBeenCalledTimes(1));
    const localConnectionId = vi.mocked(manager.setSignalingIdentity).mock.calls[0]?.[1];
    if (!localConnectionId) throw new Error('local signaling identity was not installed');
    const target = { targetUserId: USER_ID, targetPresenceSessionId: SESSION_ID, targetConnectionId: localConnectionId };
    const source = { sourceUserId: PEER_ID, sourcePresenceSessionId: SESSION_ID, sourceConnectionId: '77777777-7777-4777-8777-777777777777', companyId: COMPANY_ID, spaceId: SPACE_ID };
    act(() => {
      handlers.get('broadcast:handshake')?.({ payload: { type: 'handshake', ...source, shareId: null } });
      handlers.get('broadcast:description')?.({ payload: { type: 'description', ...source, ...target, shareId: null, description: { type: 'offer', sdp: 'audio' } } });
      handlers.get('broadcast:description')?.({ payload: { type: 'description', ...source, ...target, shareId: SHARE_ID, description: { type: 'offer', sdp: 'display' } } });
    });
    await waitFor(() => expect(manager.handleHandshake).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(manager.handleDescription).toHaveBeenCalledTimes(1));
    active.resolve(activeResponse({ companyId: COMPANY_ID, spaceId: SPACE_ID, presenterUserId: PEER_ID, presenterName: 'Presenter', shareId: SHARE_ID, expiresAt: '2026-07-24T00:00:00.000Z' }));
    await waitFor(() => expect(manager.handleDescription).toHaveBeenCalledTimes(2));
    expect(manager.handleDescription).toHaveBeenLastCalledWith(PEER_ID, USER_ID, { type: 'offer', sdp: 'display' }, SHARE_ID, expect.any(String), expect.any(String), SESSION_ID, expect.any(String));
  });

  it('fails closed on ACK failure and terminal channel status so an old sender cannot send', async () => {
    const manager = {
      setSignalingIdentity: vi.fn(), setSignalingChannel: vi.fn(), renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined), getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const { result } = renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.setSignalingChannel).toHaveBeenCalled());
    const sender = vi.mocked(manager.setSignalingChannel).mock.calls[0][1];
    if (!sender) throw new Error('signal sender was not installed');
    mocks.channelApi.send.mockResolvedValueOnce('timed out');
    await expect(sender({ type: 'handshake', userId: USER_ID })).rejects.toMatchObject({
      code: 'SIGNALING_SEND_FAILED',
      deliveryStatus: 'timed out',
    });
    act(() => mocks.statusHandler?.('TIMED_OUT'));
    expect(manager.setSignalingChannel).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(result.current.isConnected).toBe(false));
    await expect(sender({ type: 'handshake', userId: USER_ID })).rejects.toThrow('SIGNALING_UNAVAILABLE');
  });

  it('performs one delayed canonical retry for a null active response, then discards that buffered batch', async () => {
    vi.useFakeTimers();
    try {
      const handlers = new Map<string, (value: { payload: unknown }) => void>();
      mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
        handlers.set(`${type}:${filter.event}`, handler);
        return mocks.channelApi;
      });
      const initialRead = deferred<Response>();
      vi.mocked(fetch).mockReturnValueOnce(initialRead.promise).mockResolvedValueOnce(activeResponse(null));
      const manager = {
        setSignalingIdentity: vi.fn(), setSignalingChannel: vi.fn(), renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
        broadcastHandshake: vi.fn().mockResolvedValue(undefined), handleDescription: vi.fn().mockResolvedValue(undefined), getActiveShareId: vi.fn().mockReturnValue(null),
      } as unknown as WebRTCManager;
      renderHook(() => useAudioSignaling(options(manager)));
      await act(async () => {});
      act(() => mocks.statusHandler?.('SUBSCRIBED'));
      await act(async () => {});
      const targetConnectionId = vi.mocked(manager.setSignalingIdentity).mock.calls[0]?.[1];
      if (!targetConnectionId) throw new Error('local signaling identity was not installed');
      const handler = handlers.get('broadcast:description');
      if (!handler) throw new Error('description handler was not installed');
      act(() => handler({ payload: {
        type: 'description', sourceUserId: PEER_ID, sourcePresenceSessionId: SESSION_ID,
        sourceConnectionId: '77777777-7777-4777-8777-777777777777', targetUserId: USER_ID,
        targetPresenceSessionId: SESSION_ID, targetConnectionId, companyId: COMPANY_ID, spaceId: SPACE_ID,
        shareId: SHARE_ID, description: { type: 'offer', sdp: 'display' },
      } }));
      await act(async () => initialRead.resolve(activeResponse(null)));
      expect(fetch).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
      expect(fetch).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(5_000));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(manager.handleDescription).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds serialized inbound work per source while preserving accepted signal order', async () => {
    const handlers = new Map<string, (value: { payload: unknown }) => void>();
    mocks.channelApi.on.mockImplementation((type: string, filter: { event: string }, handler: (value: { payload: unknown }) => void) => {
      handlers.set(`${type}:${filter.event}`, handler);
      return mocks.channelApi;
    });
    const gate = deferred<void>();
    const manager = {
      setSignalingIdentity: vi.fn(), setSignalingChannel: vi.fn(), renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined), handleDescription: vi.fn().mockImplementation(() => gate.promise),
      getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    const { result } = renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.setSignalingIdentity).toHaveBeenCalledTimes(1));
    const targetConnectionId = vi.mocked(manager.setSignalingIdentity).mock.calls[0]?.[1];
    if (!targetConnectionId) throw new Error('local signaling identity was not installed');
    const handler = handlers.get('broadcast:description');
    if (!handler) throw new Error('description handler was not installed');
    const payload = {
      type: 'description', sourceUserId: PEER_ID, sourcePresenceSessionId: SESSION_ID,
      sourceConnectionId: '77777777-7777-4777-8777-777777777777', targetUserId: USER_ID,
      targetPresenceSessionId: SESSION_ID, targetConnectionId, companyId: COMPANY_ID, spaceId: SPACE_ID,
      shareId: null, description: { type: 'offer', sdp: 'audio' },
    };
    act(() => {
      for (let index = 0; index < 33; index += 1) handler({ payload: { ...payload, description: { type: 'offer', sdp: `audio-${index}` } } });
    });
    await waitFor(() => expect(manager.handleDescription).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBe('Media signaling queue limit reached.');
    await act(async () => gate.resolve());
    await waitFor(() => expect(manager.handleDescription).toHaveBeenCalledTimes(32));
    expect(vi.mocked(manager.handleDescription).mock.calls.map((call) => call[2].sdp)).toEqual(
      Array.from({ length: 32 }, (_, index) => `audio-${index}`),
    );
  });

  it('retires terminal authorized access denial without treating transient failures as authorization', async () => {
    const cleanup = vi.fn();
    const terminal = vi.fn(cleanup);
    const manager = {
      setSignalingIdentity: vi.fn(), setSignalingChannel: vi.fn(), renegotiateExistingPeers: vi.fn().mockResolvedValue(undefined),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined), cleanup, getActiveShareId: vi.fn().mockReturnValue(null),
    } as unknown as WebRTCManager;
    vi.mocked(fetch).mockResolvedValueOnce(new Response('malformed authorization response', { status: 409 }));
    const { unmount } = renderHook(() => useAudioSignaling(options(manager, { onTerminalAuthorizationDenied: terminal })));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(terminal).toHaveBeenCalledTimes(1));
    expect(manager.setSignalingChannel).toHaveBeenLastCalledWith(null);
    unmount();
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(1);

    mocks.statusHandler = undefined;
    vi.mocked(fetch).mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    const retryManager = { ...manager, setSignalingChannel: vi.fn(), broadcastHandshake: vi.fn().mockResolvedValue(undefined), cleanup: vi.fn(), getActiveShareId: vi.fn().mockReturnValue(null) } as unknown as WebRTCManager;
    renderHook(() => useAudioSignaling(options(retryManager, { generation: 2, onTerminalAuthorizationDenied: vi.fn() })));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(retryManager.broadcastHandshake).toHaveBeenCalled());
    expect(retryManager.cleanup).not.toHaveBeenCalled();
  });
});
