import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProvider, useAudio } from '@/contexts/AudioContext';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';

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

const contextState = vi.hoisted(() => ({
  companyId: '11111111-1111-4111-8111-111111111111',
  authUserId: 'auth-user',
  presenceSessionId: '55555555-5555-4555-8555-555555555555' as string | null,
  accessToken: 'test-access-token',
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: contextState.authUserId ? { id: contextState.authUserId } : null, session: contextState.accessToken ? { access_token: contextState.accessToken } : null }),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({ company: contextState.companyId ? { id: contextState.companyId } : null }),
}));

vi.mock('@/contexts/PresenceContext', () => ({
  usePresence: () => ({ presenceSessionId: contextState.presenceSessionId }),
}));

vi.mock('@/lib/webrtc', () => {
  class MockWebRTCManager {
    readonly broadcastHandshake = vi.fn().mockResolvedValue(undefined);
    readonly cleanup = vi.fn();
    readonly resumeRemoteAudio = vi.fn();
    readonly initializeLocalStream = vi.fn().mockResolvedValue(undefined);
    readonly setMuted = vi.fn();
    readonly setSignalingIdentity = vi.fn();
    readonly setSignalingChannel = vi.fn();
    readonly renegotiateExistingPeers = vi.fn().mockResolvedValue(undefined);
    readonly getActiveShareId = vi.fn().mockReturnValue(null);

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

vi.mock('@/lib/supabase/browser-client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
  }),
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
    contextState.companyId = COMPANY_ID;
    contextState.authUserId = 'auth-user';
    contextState.presenceSessionId = SESSION_ID;
    contextState.accessToken = 'test-access-token';
    latestAudio = null;
    mocks.removeChannel.mockResolvedValue('ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 'ACTIVE_READ',
      active: null,
    }), { status: 200 })));
    mocks.channel.mockImplementation(() => createChannel());
  });

  it('subscribes and handshakes exactly once with the manager owned by each room', async () => {
    const { rerender } = render(
      <AudioProvider spaceId="room-a" userId={USER_ID}>
        <AudioStateProbe />
      </AudioProvider>,
    );

    await waitFor(() => expect(mocks.channel).toHaveBeenCalledWith(
      `company:${COMPANY_ID}:space:room-a:media`,
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
      <AudioProvider spaceId="room-b" userId={USER_ID}>
        <AudioStateProbe />
      </AudioProvider>,
    );

    await waitFor(() => expect(mocks.channel).toHaveBeenCalledWith(
      `company:${COMPANY_ID}:space:room-b:media`,
      expect.any(Object),
    ));
    const managerB = mocks.managers.find((manager) => manager.spaceId === 'room-b');
    if (!managerB) throw new Error('room B manager was not created');
    await waitFor(() => expect(managerB.broadcastHandshake).toHaveBeenCalledTimes(1));

    expect(mocks.channel.mock.calls.filter(([name]) => name === `company:${COMPANY_ID}:space:room-b:media`)).toHaveLength(1);
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

  it('retires session A before B, creates no manager without a complete identity, and fences stale callbacks', async () => {
    const { rerender } = render(<AudioProvider spaceId="room-a" userId={USER_ID}><AudioStateProbe /></AudioProvider>);
    await waitFor(() => expect(mocks.managers).toHaveLength(1));
    const managerA = mocks.managers[0];
    contextState.presenceSessionId = null;
    rerender(<AudioProvider spaceId="room-a" userId={USER_ID}><AudioStateProbe /></AudioProvider>);
    await waitFor(() => expect(managerA.cleanup).toHaveBeenCalledTimes(1));
    expect(mocks.managers).toHaveLength(1);
    expect(latestAudio?.webrtcManager).toBeNull();

    contextState.presenceSessionId = '66666666-6666-4666-8666-666666666666';
    contextState.accessToken = 'rotated-access-token';
    rerender(<AudioProvider spaceId="room-a" userId={USER_ID}><AudioStateProbe /></AudioProvider>);
    await waitFor(() => expect(mocks.managers).toHaveLength(2));
    const managerB = mocks.managers[1];
    expect(managerA.cleanup).toHaveBeenCalledTimes(1);
    act(() => managerA.callbacks.onPeerSpeaking('stale-peer', true));
    expect(latestAudio?.speakingUsers.has('stale-peer')).toBe(false);
    expect(managerB.cleanup).not.toHaveBeenCalled();
    contextState.companyId = '77777777-7777-4777-8777-777777777777';
    rerender(<AudioProvider spaceId="room-b" userId="88888888-8888-4888-8888-888888888888"><AudioStateProbe /></AudioProvider>);
    await waitFor(() => expect(mocks.managers).toHaveLength(3));
    expect(managerB.cleanup).toHaveBeenCalledTimes(1);
  });
});
