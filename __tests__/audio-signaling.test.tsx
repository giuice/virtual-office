import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioSignaling } from '@/hooks/realtime/useAudioSignaling';
import type { WebRTCManager } from '@/lib/webrtc';
import type { RealtimeChannel } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => {
  const channelApi = {
    on: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn(),
    unsubscribe: vi.fn(),
    presenceState: vi.fn(() => ({})),
  };

  return {
    channelApi,
    channel: vi.fn(),
    removeChannel: vi.fn(),
    statusHandler: undefined as ((status: string) => void) | undefined,
  };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: { channel: mocks.channel, removeChannel: mocks.removeChannel },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useAudioSignaling subscription lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statusHandler = undefined;
    mocks.channel.mockReturnValue(mocks.channelApi);
    mocks.channelApi.on.mockReturnValue(mocks.channelApi);
    mocks.channelApi.subscribe.mockImplementation((handler: (status: string) => void) => {
      mocks.statusHandler = handler;
      return mocks.channelApi;
    });
    mocks.channelApi.unsubscribe.mockResolvedValue('ok');
    mocks.removeChannel.mockResolvedValue('ok');
  });

  it('tracks then handshakes once for the current subscription', async () => {
    mocks.channelApi.track.mockResolvedValue('ok');
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebRTCManager;

    renderHook(() => useAudioSignaling({
      spaceId: 'space-1',
      currentUserId: 'user-1',
      webrtcManager: manager,
      isMuted: true,
    }));

    act(() => mocks.statusHandler?.('SUBSCRIBED'));

    await waitFor(() => expect(manager.broadcastHandshake).toHaveBeenCalledTimes(1));
    expect(manager.setSignalingChannel).toHaveBeenCalledWith(mocks.channelApi);
    expect(mocks.channelApi.track).toHaveBeenCalledTimes(1);
  });

  it('does not handshake after cleanup retires an in-flight subscription', async () => {
    const tracked = deferred<string>();
    mocks.channelApi.track.mockReturnValue(tracked.promise);
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebRTCManager;

    const { unmount } = renderHook(() => useAudioSignaling({
      spaceId: 'space-1',
      currentUserId: 'user-1',
      webrtcManager: manager,
      isMuted: true,
    }));

    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    unmount();
    await act(async () => tracked.resolve('ok'));

    expect(manager.broadcastHandshake).not.toHaveBeenCalled();
    expect(manager.setSignalingChannel).toHaveBeenLastCalledWith(null);
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channelApi);
  });

  it('updates mute tracking without recreating the signaling subscription', async () => {
    mocks.channelApi.track.mockResolvedValue('ok');
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebRTCManager;

    const { rerender } = renderHook(
      ({ isMuted }) => useAudioSignaling({
        spaceId: 'space-1',
        currentUserId: 'user-1',
        webrtcManager: manager,
        isMuted,
      }),
      { initialProps: { isMuted: true } },
    );

    act(() => mocks.statusHandler?.('SUBSCRIBED'));
    await waitFor(() => expect(manager.broadcastHandshake).toHaveBeenCalledTimes(1));

    rerender({ isMuted: false });
    await waitFor(() => expect(mocks.channelApi.track).toHaveBeenCalledTimes(2));

    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(manager.broadcastHandshake).toHaveBeenCalledTimes(1);
    expect(mocks.channelApi.track).toHaveBeenLastCalledWith(expect.objectContaining({
      user_id: 'user-1',
      is_muted: false,
    }));
    expect(mocks.removeChannel).not.toHaveBeenCalled();
  });

  it('ignores queued events from a channel retired by a room transition', async () => {
    const createChannel = (presenceState: Record<string, unknown>) => {
      const handlers = new Map<string, (payload: unknown) => void>();
      const channel = {
        on: vi.fn((type: string, filter: { event: string }, handler: (payload: unknown) => void) => {
          handlers.set(`${type}:${filter.event}`, handler);
          return channel;
        }),
        subscribe: vi.fn(() => channel),
        track: vi.fn().mockResolvedValue('ok'),
        presenceState: vi.fn(() => presenceState),
      } as unknown as RealtimeChannel;
      return { channel, handlers };
    };
    const oldRoom = createChannel({
      old: [{ user_id: 'old-user', is_muted: true, online_at: '2026-07-18T00:00:00.000Z' }],
    });
    const newRoom = createChannel({});
    mocks.channel
      .mockReturnValueOnce(oldRoom.channel)
      .mockReturnValueOnce(newRoom.channel);
    const manager = {
      setSignalingChannel: vi.fn(),
      broadcastHandshake: vi.fn().mockResolvedValue(undefined),
      handleHandshake: vi.fn().mockResolvedValue(undefined),
      handleOffer: vi.fn().mockResolvedValue(undefined),
      handleAnswer: vi.fn().mockResolvedValue(undefined),
      handleIceCandidate: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebRTCManager;

    const { result, rerender } = renderHook(
      ({ spaceId }) => useAudioSignaling({
        spaceId,
        currentUserId: 'user-1',
        webrtcManager: manager,
        isMuted: false,
      }),
      { initialProps: { spaceId: 'space-1' } },
    );
    rerender({ spaceId: 'space-2' });

    act(() => {
      oldRoom.handlers.get('broadcast:handshake')?.({ payload: { userId: 'old-user' } });
      oldRoom.handlers.get('presence:sync')?.({});
    });
    await act(async () => Promise.resolve());

    expect(manager.handleHandshake).not.toHaveBeenCalled();
    expect(result.current.mutedUserIds.has('old-user')).toBe(false);
    expect(mocks.removeChannel).toHaveBeenCalledWith(oldRoom.channel);
  });
});
