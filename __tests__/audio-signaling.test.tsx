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
      handlers.get('broadcast:description')?.({ payload: { ...description, description: { type: 'offer' } } });
      handlers.get('broadcast:description')?.({ payload: { ...description, companyId: SHARE_ID } });
      handlers.get('broadcast:description')?.({ payload: { ...description, targetPresenceSessionId: SHARE_ID } });
      handlers.get('broadcast:description')?.({ payload: { ...description, targetConnectionId: '88888888-8888-4888-8888-888888888888' } });
      handlers.get('broadcast:description')?.({ payload: description });
    });

    await waitFor(() => expect(manager.handleDescription).toHaveBeenCalledTimes(1));
    expect(manager.handleDescription).toHaveBeenCalledWith(PEER_ID, USER_ID, description.description, null, expect.any(String), expect.any(String), SESSION_ID, expect.any(String));
  });

  it('uses the authorized active route after subscribe and invalidation instead of treating hints as presenter authority', async () => {
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
    const localConnectionId = vi.mocked(manager.setSignalingIdentity).mock.calls[0]?.[1];
    if (!localConnectionId) throw new Error('local signaling identity was not installed');

    act(() => handlers.get('broadcast:presenter-invalidated')?.({ payload: {
      type: 'presenter-invalidated',
      sourceUserId: PEER_ID,
      sourcePresenceSessionId: SESSION_ID,
      sourceConnectionId: '77777777-7777-4777-8777-777777777777',
      targetUserId: USER_ID,
      targetPresenceSessionId: SESSION_ID,
      targetConnectionId: localConnectionId,
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
    renderHook(() => useAudioSignaling(options(manager)));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.setSignalingChannel).toHaveBeenCalled());
    const sender = vi.mocked(manager.setSignalingChannel).mock.calls[0][1];
    if (!sender) throw new Error('signal sender was not installed');
    mocks.channelApi.send.mockResolvedValueOnce('timed out');
    await expect(sender({ type: 'handshake', userId: USER_ID })).rejects.toThrow('SIGNALING_SEND_FAILED');
    act(() => mocks.statusHandler?.('TIMED_OUT'));
    expect(manager.setSignalingChannel).toHaveBeenLastCalledWith(null);
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
    renderHook(() => useAudioSignaling(options(manager, { onTerminalAuthorizationDenied: terminal })));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(terminal).toHaveBeenCalledTimes(1));
    expect(manager.setSignalingChannel).toHaveBeenLastCalledWith(null);

    vi.mocked(fetch).mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    const retryManager = { ...manager, setSignalingChannel: vi.fn(), broadcastHandshake: vi.fn().mockResolvedValue(undefined), cleanup: vi.fn(), getActiveShareId: vi.fn().mockReturnValue(null) } as unknown as WebRTCManager;
    renderHook(() => useAudioSignaling(options(retryManager, { generation: 2, onTerminalAuthorizationDenied: vi.fn() })));
    await waitFor(() => expect(mocks.statusHandler).toBeDefined());
    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(retryManager.broadcastHandshake).toHaveBeenCalled());
    expect(retryManager.cleanup).not.toHaveBeenCalled();
  });
});
