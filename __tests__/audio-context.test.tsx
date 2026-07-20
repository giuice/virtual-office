import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProvider, useAudio } from '@/contexts/AudioContext';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
  managers: [] as Array<{
    spaceId: string;
    broadcastHandshake: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    callbacks: {
      onPeerConnected: (peerId: string) => void;
      onPeerSpeaking: (peerId: string, isSpeaking: boolean) => void;
      onError: (error: Error) => void;
    };
  }>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'auth-user' } }),
}));

vi.mock('@/lib/webrtc', () => {
  class MockWebRTCManager {
    readonly broadcastHandshake = vi.fn().mockResolvedValue(undefined);
    readonly cleanup = vi.fn();
    readonly resumeRemoteAudio = vi.fn();
    readonly initializeLocalStream = vi.fn().mockResolvedValue(undefined);
    readonly setMuted = vi.fn();
    readonly setSignalingChannel = vi.fn();

    constructor(
      readonly spaceId: string,
      _userId: string,
      readonly callbacks: {
        onPeerConnected: (peerId: string) => void;
        onPeerSpeaking: (peerId: string, isSpeaking: boolean) => void;
        onError: (error: Error) => void;
      },
    ) {
      mocks.managers.push(this);
    }
  }

  return {
    WebRTCManager: MockWebRTCManager,
    ROOM_LIMITS: { SOFT_WARNING: 8 },
  };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

function createChannel() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((handler: (status: string) => void) => {
      queueMicrotask(() => handler('SUBSCRIBED'));
      return channel;
    }),
    track: vi.fn().mockResolvedValue('ok'),
    presenceState: vi.fn(() => ({})),
  };
  return channel;
}

let latestAudio: ReturnType<typeof useAudio> | null = null;

function AudioStateProbe() {
  latestAudio = useAudio();
  return null;
}

describe('AudioProvider manager ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.managers.length = 0;
    latestAudio = null;
    mocks.removeChannel.mockResolvedValue('ok');
    mocks.channel.mockImplementation(() => createChannel());
  });

  it('subscribes and handshakes exactly once with the manager owned by each room', async () => {
    const { rerender } = render(
      <AudioProvider spaceId="room-a" userId="user-1">
        <AudioStateProbe />
      </AudioProvider>,
    );

    await waitFor(() => expect(mocks.channel).toHaveBeenCalledWith(
      'room:audio:room-a',
      expect.any(Object),
    ));
    const managerA = mocks.managers.find((manager) => manager.spaceId === 'room-a');
    if (!managerA) throw new Error('room A manager was not created');
    await waitFor(() => expect(managerA.broadcastHandshake).toHaveBeenCalledTimes(1));

    await act(async () => {
      await latestAudio?.initializeAudio();
      managerA.callbacks.onPeerSpeaking('peer-a', true);
    });
    expect(latestAudio?.isMuted).toBe(false);
    expect(latestAudio?.speakingUsers.has('peer-a')).toBe(true);

    rerender(
      <AudioProvider spaceId="room-b" userId="user-1">
        <AudioStateProbe />
      </AudioProvider>,
    );

    await waitFor(() => expect(mocks.channel).toHaveBeenCalledWith(
      'room:audio:room-b',
      expect.any(Object),
    ));
    const managerB = mocks.managers.find((manager) => manager.spaceId === 'room-b');
    if (!managerB) throw new Error('room B manager was not created');
    await waitFor(() => expect(managerB.broadcastHandshake).toHaveBeenCalledTimes(1));

    expect(mocks.channel.mock.calls.filter(([name]) => name === 'room:audio:room-b')).toHaveLength(1);
    expect(managerA.broadcastHandshake).toHaveBeenCalledTimes(1);
    expect(managerA.cleanup).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(latestAudio?.isMuted).toBe(true);
      expect(latestAudio?.isAudioEnabled).toBe(false);
      expect(latestAudio?.speakingUsers.size).toBe(0);
    });

    act(() => {
      managerA.callbacks.onPeerConnected('late-peer-a');
      managerA.callbacks.onPeerSpeaking('late-peer-a', true);
      managerA.callbacks.onError(new Error('late room A error'));
    });
    expect(latestAudio?.peerCount).toBe(0);
    expect(latestAudio?.speakingUsers.size).toBe(0);
    expect(latestAudio?.error).toBeNull();
  });
});
