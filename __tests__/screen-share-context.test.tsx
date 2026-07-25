import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProvider, useAudio } from '@/contexts/AudioContext';
import type { ScreenSharePublicShare } from '@/lib/webrtc/screen-share-contract';

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';
const SESSION_A = '55555555-5555-4555-8555-555555555555';
const SESSION_B = '66666666-6666-4666-8666-666666666666';
const SPACE_A = '77777777-7777-4777-8777-777777777777';
const SPACE_B = '88888888-8888-4888-8888-888888888888';
const SHARE_A = '99999999-9999-4999-8999-999999999999';

interface FakeTrack {
  kind: 'video';
  readyState: MediaStreamTrackState;
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  end: () => void;
}

function createTrack(): FakeTrack {
  const listeners = new Set<() => void>();
  const track: FakeTrack = {
    kind: 'video',
    readyState: 'live',
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
    addEventListener: vi.fn((_event: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener as () => void);
    }),
    removeEventListener: vi.fn((_event: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener as () => void);
    }),
    end: () => {
      track.readyState = 'ended';
      [...listeners].forEach((listener) => listener());
    },
  };
  return track;
}

function createStream(track = createTrack()): MediaStream {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

const contextState = vi.hoisted(() => ({
  companyId: '11111111-1111-4111-8111-111111111111',
  presenceSessionId: '55555555-5555-4555-8555-555555555555' as string | null,
  accessToken: 'token-a',
  activeShare: null as ScreenSharePublicShare | null,
}));

const mocks = vi.hoisted(() => ({
  managers: [] as Array<{
    callbacks: {
      onLocalDisplayStopped?: (shareId: string, reason: string) => void;
      onRemoteDisplay?: (event: { peerId: string; shareId: string | null; stream: MediaStream }) => void;
      onPeerDisconnected?: (peerId: string) => void;
    };
    cleanup: ReturnType<typeof vi.fn>;
    startScreenShare: ReturnType<typeof vi.fn>;
    stopScreenShare: ReturnType<typeof vi.fn>;
    broadcastPresenterInvalidated: ReturnType<typeof vi.fn>;
    initializeLocalStream: ReturnType<typeof vi.fn>;
    setMuted: ReturnType<typeof vi.fn>;
  }>,
  getDisplayMedia: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    session: contextState.accessToken ? { access_token: contextState.accessToken } : null,
  }),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({
    company: contextState.companyId ? { id: contextState.companyId } : null,
  }),
}));

vi.mock('@/contexts/PresenceContext', () => ({
  usePresence: () => ({ presenceSessionId: contextState.presenceSessionId }),
}));

vi.mock('@/hooks/realtime/useAudioSignaling', () => ({
  useAudioSignaling: () => ({
    mutedUserIds: new Set<string>(['remote-muted']),
    activeShare: contextState.activeShare,
  }),
}));

vi.mock('@/lib/webrtc', () => {
  class MockWebRTCManager {
    readonly cleanup = vi.fn();
    readonly startScreenShare = vi.fn().mockResolvedValue(undefined);
    readonly stopScreenShare = vi.fn().mockImplementation(async (reason: string) => {
      const shareId = this.activeShareId;
      this.activeShareId = null;
      if (shareId) this.callbacks.onLocalDisplayStopped?.(shareId, reason);
    });
    readonly initializeLocalStream = vi.fn().mockResolvedValue(undefined);
    readonly resumeRemoteAudio = vi.fn();
    readonly setMuted = vi.fn();
    readonly setSignalingIdentity = vi.fn();
    readonly setSignalingChannel = vi.fn();
    readonly broadcastHandshake = vi.fn().mockResolvedValue(undefined);
    readonly broadcastPresenterInvalidated = vi.fn().mockResolvedValue(undefined);
    readonly renegotiateExistingPeers = vi.fn().mockResolvedValue(undefined);
    private activeShareId: string | null = null;

    constructor(
      _spaceId: string,
      _userId: string,
      readonly callbacks: {
        onLocalDisplayStopped?: (shareId: string, reason: string) => void;
        onRemoteDisplay?: (event: { peerId: string; shareId: string | null; stream: MediaStream }) => void;
        onPeerDisconnected?: (peerId: string) => void;
      },
    ) {
      this.startScreenShare.mockImplementation(async (_stream: MediaStream, shareId: string) => {
        this.activeShareId = shareId;
      });
      mocks.managers.push(this);
    }

    getActiveShareId(): string | null {
      return this.activeShareId;
    }
  }

  return {
    WebRTCManager: MockWebRTCManager,
    ROOM_LIMITS: { SOFT_WARNING: 8 },
  };
});

let latestAudio: ReturnType<typeof useAudio> | null = null;

function Probe() {
  latestAudio = useAudio();
  return null;
}

function currentAudio(): ReturnType<typeof useAudio> {
  if (!latestAudio) throw new Error('AudioProvider probe is not ready');
  return latestAudio;
}

function claimed(expiresAt = new Date(Date.now() + 30_000).toISOString()): Response {
  return new Response(JSON.stringify({
    success: true,
    code: 'CLAIMED',
    share: {
      companyId: contextState.companyId,
      spaceId: SPACE_A,
      presenterUserId: USER_A,
      presenterName: 'Presenter A',
      shareId: SHARE_A,
      expiresAt,
    },
  }), { status: 200 });
}

function renewed(expiresAt = new Date(Date.now() + 30_000).toISOString()): Response {
  return new Response(JSON.stringify({
    success: true,
    code: 'RENEWED',
    shareId: SHARE_A,
    expiresAt,
  }), { status: 200 });
}

function released(): Response {
  return new Response(JSON.stringify({
    success: true,
    code: 'RELEASED',
    alreadyReleased: false,
  }), { status: 200 });
}

function renderProvider(props: { spaceId?: string; userId?: string } = {}) {
  return render(
    <AudioProvider spaceId={props.spaceId ?? SPACE_A} userId={props.userId ?? USER_A}>
      <Probe />
    </AudioProvider>,
  );
}

describe('AudioProvider screen-share lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.managers.length = 0;
    latestAudio = null;
    contextState.companyId = COMPANY_A;
    contextState.presenceSessionId = SESSION_A;
    contextState.accessToken = 'token-a';
    contextState.activeShare = null;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: mocks.getDisplayMedia },
    });
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => SHARE_A) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('captures video-only, claims before publishing, renews once below TTL, and stops through one exact release boundary', async () => {
    vi.useFakeTimers();
    const track = createTrack();
    const stream = createStream(track);
    mocks.getDisplayMedia.mockResolvedValue(stream);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/claim')) return claimed();
      if (url.endsWith('/renew')) return renewed();
      if (url.endsWith('/release')) return released();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();
    await act(async () => {});
    const manager = mocks.managers[0];
    const audioBefore = {
      muted: latestAudio?.isMuted,
      enabled: latestAudio?.isAudioEnabled,
      speaking: latestAudio?.speakingUsers,
      mutedUsers: latestAudio?.mutedUserIds,
    };

    await act(async () => {
      expect(await latestAudio?.startScreenShare()).toBe(true);
    });

    expect(mocks.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(manager.startScreenShare).toHaveBeenCalledWith(stream, SHARE_A);
    expect(latestAudio?.activeScreenShare?.shareId).toBe(SHARE_A);
    expect(latestAudio?.displayStream?.stream).toBe(stream);
    expect(track.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function), { once: true });
    expect(latestAudio?.isMuted).toBe(audioBefore.muted);
    expect(latestAudio?.isAudioEnabled).toBe(audioBefore.enabled);
    expect(latestAudio?.speakingUsers).toBe(audioBefore.speaking);
    expect(latestAudio?.mutedUserIds).toEqual(audioBefore.mutedUsers);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/renew'))).toHaveLength(1);

    await act(async () => {
      await latestAudio?.stopScreenShare('user-stop');
    });
    expect(manager.stopScreenShare).toHaveBeenCalledTimes(1);
    expect(manager.broadcastPresenterInvalidated).toHaveBeenCalledWith(SHARE_A);
    expect(track.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/release'))).toHaveLength(1);
    expect(latestAudio?.activeScreenShare).toBeNull();
    expect(latestAudio?.displayStream).toBeNull();
    expect(latestAudio?.screenShareStatus).toBe('idle');
  });

  it.each([
    ['NotAllowedError', 'We couldn’t start screen sharing. Check your browser permission, then try again.'],
    ['InvalidStateError', 'We couldn’t start screen sharing. Check your browser permission, then try again.'],
    ['AbortError', 'Screen sharing was cancelled.'],
    ['NotFoundError', 'No screen is available to share. Connect a display or choose another source, then try again.'],
    ['NotReadableError', 'We couldn’t start screen sharing. Try again. If the problem continues, rejoin the space.'],
  ])('maps %s capture failure to literal copy without touching audio', async (name, copy) => {
    mocks.getDisplayMedia.mockRejectedValue(new DOMException('capture failed', name));
    vi.stubGlobal('fetch', vi.fn());
    renderProvider();
    await waitFor(() => expect(mocks.managers).toHaveLength(1));
    const manager = mocks.managers[0];

    await act(async () => {
      expect(await latestAudio?.startScreenShare()).toBe(false);
    });

    expect(latestAudio?.screenShareError).toBe(copy);
    expect(latestAudio?.screenShareStatus).toBe('idle');
    expect(manager.initializeLocalStream).not.toHaveBeenCalled();
    expect(manager.setMuted).not.toHaveBeenCalled();
  });

  it('retires a deferred scope-A capture before scope B can claim or publish it', async () => {
    let resolveCapture!: (stream: MediaStream) => void;
    mocks.getDisplayMedia.mockReturnValue(new Promise<MediaStream>((resolve) => {
      resolveCapture = resolve;
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = renderProvider();
    await waitFor(() => expect(mocks.managers).toHaveLength(1));

    let startPromise!: Promise<boolean>;
    act(() => {
      startPromise = currentAudio().startScreenShare();
    });
    contextState.companyId = COMPANY_B;
    contextState.presenceSessionId = SESSION_B;
    contextState.accessToken = 'token-b';
    view.rerender(
      <AudioProvider spaceId={SPACE_B} userId={USER_B}>
        <Probe />
      </AudioProvider>,
    );
    await waitFor(() => expect(mocks.managers).toHaveLength(2));
    const retiredTrack = createTrack();
    await act(async () => {
      resolveCapture(createStream(retiredTrack));
      expect(await startPromise).toBe(false);
    });

    expect(retiredTrack.stop).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.managers[0].startScreenShare).not.toHaveBeenCalled();
    expect(latestAudio?.activeScreenShare).toBeNull();
  });

  it('compensates a deferred scope-A claim and ignores its deferred release completion in scope B', async () => {
    const track = createTrack();
    mocks.getDisplayMedia.mockResolvedValue(createStream(track));
    let resolveClaim!: (response: Response) => void;
    let resolveRelease!: (response: Response) => void;
    const claimPromise = new Promise<Response>((resolve) => {
      resolveClaim = resolve;
    });
    const releasePromise = new Promise<Response>((resolve) => {
      resolveRelease = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/claim')) return claimPromise;
      if (url.endsWith('/release')) return releasePromise;
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderProvider();
    await waitFor(() => expect(mocks.managers).toHaveLength(1));

    let startPromise!: Promise<boolean>;
    act(() => {
      startPromise = currentAudio().startScreenShare();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    contextState.companyId = COMPANY_B;
    contextState.presenceSessionId = SESSION_B;
    contextState.accessToken = 'token-b';
    view.rerender(
      <AudioProvider spaceId={SPACE_B} userId={USER_B}>
        <Probe />
      </AudioProvider>,
    );
    await waitFor(() => expect(mocks.managers).toHaveLength(2));

    await act(async () => {
      resolveClaim(new Response(JSON.stringify({
        success: true,
        code: 'CLAIMED',
        share: {
          companyId: COMPANY_A,
          spaceId: SPACE_A,
          presenterUserId: USER_A,
          presenterName: 'Presenter A',
          shareId: SHARE_A,
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        },
      }), { status: 200 }));
      expect(await startPromise).toBe(false);
    });

    const releaseCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/release'));
    expect(releaseCall).toBeDefined();
    expect(JSON.parse(releaseCall?.[1]?.body as string)).toEqual({
      presenceSessionId: SESSION_A,
      shareId: SHARE_A,
      stopReason: 'scope-changed',
    });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.managers[0].startScreenShare).not.toHaveBeenCalled();
    expect(latestAudio?.activeScreenShare).toBeNull();
    expect(latestAudio?.webrtcManager).toBe(mocks.managers[1]);

    await act(async () => {
      resolveRelease(released());
      await releasePromise;
    });
    expect(latestAudio?.activeScreenShare).toBeNull();
    expect(latestAudio?.webrtcManager).toBe(mocks.managers[1]);
  });

  it('keeps an aborted old-claim release attempt best-effort when the replacement auth scope rejects it', async () => {
    const track = createTrack();
    mocks.getDisplayMedia.mockResolvedValue(createStream(track));
    let serverClaimCommitted = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/claim')) {
        serverClaimCommitted = true;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('retired request', 'AbortError'));
          }, { once: true });
        });
      }
      if (url.endsWith('/release')) {
        expect(serverClaimCommitted).toBe(true);
        return Promise.resolve(new Response(JSON.stringify({
          success: false,
          code: 'SESSION_INVALID',
          error: 'The original auth session is no longer active.',
          retryable: false,
        }), { status: 409 }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderProvider();
    await waitFor(() => expect(mocks.managers).toHaveLength(1));

    let startPromise!: Promise<boolean>;
    act(() => {
      startPromise = currentAudio().startScreenShare();
    });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/claim'))).toBe(true));
    contextState.companyId = COMPANY_B;
    contextState.presenceSessionId = SESSION_B;
    contextState.accessToken = 'token-b';
    view.rerender(
      <AudioProvider spaceId={SPACE_B} userId={USER_B}>
        <Probe />
      </AudioProvider>,
    );

    await act(async () => {
      expect(await startPromise).toBe(false);
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/release'))).toHaveLength(1);
    });
    const releaseCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/release'));
    expect(JSON.parse(releaseCall?.[1]?.body as string)).toEqual({
      presenceSessionId: SESSION_A,
      shareId: SHARE_A,
      stopReason: 'scope-changed',
    });
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.managers[0].startScreenShare).not.toHaveBeenCalled();
    expect(mocks.managers).toHaveLength(2);
    expect(latestAudio?.webrtcManager).toBe(mocks.managers[1]);
    expect(latestAudio?.activeScreenShare).toBeNull();
    expect(latestAudio?.displayStream).toBeNull();
  });

  it.each([
    ['far ahead', '2035-01-01T00:00:00.000Z'],
    ['far behind', '2020-01-01T00:00:00.000Z'],
  ])('renews on a fixed conservative cadence when the client clock is %s', async (_label, clientNow) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(clientNow));
    const track = createTrack();
    mocks.getDisplayMedia.mockResolvedValue(createStream(track));
    const serverExpiry = '2026-07-25T12:00:30.000Z';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/claim')) return claimed(serverExpiry);
      if (url.endsWith('/renew')) return renewed(serverExpiry);
      if (url.endsWith('/release')) return released();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProvider();
    await act(async () => {});

    await act(async () => {
      expect(await latestAudio?.startScreenShare()).toBe(true);
      await vi.advanceTimersByTimeAsync(10_500);
    });

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/renew'))).toHaveLength(1);
    expect(mocks.managers[0].stopScreenShare).not.toHaveBeenCalled();
    expect(latestAudio?.activeScreenShare?.shareId).toBe(SHARE_A);
    expect(latestAudio?.displayStream?.stream.getVideoTracks()[0]).toBe(track);
  });

  it('converges track-ended and rejected renewal on idempotent local stop plus exact release', async () => {
    vi.useFakeTimers();
    const track = createTrack();
    mocks.getDisplayMedia.mockResolvedValue(createStream(track));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/claim')) return claimed();
      if (url.endsWith('/renew')) {
        return new Response(JSON.stringify({
          success: false,
          code: 'LEASE_STALE',
          error: 'stale',
          retryable: false,
        }), { status: 409 });
      }
      if (url.endsWith('/release')) return released();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderProvider();
    await act(async () => {});

    await act(async () => {
      expect(await latestAudio?.startScreenShare()).toBe(true);
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(mocks.managers[0].stopScreenShare).toHaveBeenCalledTimes(1);
    expect(latestAudio?.activeScreenShare).toBeNull();
    expect(latestAudio?.displayStream).toBeNull();

    act(() => track.end());
    await act(async () => {});
    expect(mocks.managers[0].stopScreenShare).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/release'))).toHaveLength(1);
  });

  it('clears remote display candidates when canonical reconciliation retires or replaces the presenter', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const view = renderProvider();
    await waitFor(() => expect(mocks.managers).toHaveLength(1));
    const remoteStream = createStream();
    act(() => {
      mocks.managers[0].callbacks.onRemoteDisplay?.({
        peerId: USER_B,
        shareId: SHARE_A,
        stream: remoteStream,
      });
    });
    expect(latestAudio?.displayStream?.stream).toBe(remoteStream);

    contextState.activeShare = {
      companyId: COMPANY_A,
      spaceId: SPACE_A,
      presenterUserId: USER_B,
      presenterName: 'Presenter B',
      shareId: SHARE_A,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    view.rerender(<AudioProvider spaceId={SPACE_A} userId={USER_A}><Probe /></AudioProvider>);
    expect(latestAudio?.displayStream?.stream).toBe(remoteStream);

    contextState.activeShare = null;
    view.rerender(<AudioProvider spaceId={SPACE_A} userId={USER_A}><Probe /></AudioProvider>);
    await waitFor(() => expect(latestAudio?.displayStream).toBeNull());
  });
});
