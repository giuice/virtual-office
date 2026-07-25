/**
 * Mock-bounded production tracer for the screen-share wiring contract.
 *
 * These tests prove application branching across the real AudioProvider and
 * screen-share control. They do not prove RLS, Realtime delivery, P2P media,
 * TURN traversal, or two-user browser isolation.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProvider, useAudio } from '@/contexts/AudioContext';
import { FloorPlanPresentationStage } from '@/components/floor-plan/FloorPlanPresentationStage';
import { ScreenShareControls } from '@/components/floor-plan/ScreenShareControls';
import { screenSharePublicErrorSchema } from '@/lib/webrtc/screen-share-contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const SPACE_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const SHARE_ID = '55555555-5555-4555-8555-555555555555';
const REMOTE_USER_ID = '66666666-6666-4666-8666-666666666666';
const PRESENTER_BUSY_RESPONSE = {
  success: false,
  code: 'PRESENTER_BUSY',
  error: 'Another participant is already sharing this space.',
};

interface ManagerCallbacks {
  onRemoteDisplay: (event: { peerId: string; shareId: string | null; stream: MediaStream }) => void;
}

const mocks = vi.hoisted(() => ({
  managers: [] as Array<{
    startScreenShare: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
    initializeLocalStream: ReturnType<typeof vi.fn>;
    setMuted: ReturnType<typeof vi.fn>;
    resumeRemoteAudio: ReturnType<typeof vi.fn>;
    emitRemoteDisplay: (peerId: string, shareId: string | null, stream: MediaStream) => void;
  }>,
  activeShare: null as null | {
    companyId: string;
    spaceId: string;
    presenterUserId: string;
    presenterName: string;
    shareId: string;
    expiresAt: string;
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'test-access-token' } }),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({ company: { id: COMPANY_ID } }),
}));

vi.mock('@/contexts/PresenceContext', () => ({
  usePresence: () => ({ presenceSessionId: SESSION_ID }),
}));

vi.mock('@/hooks/realtime/useAudioSignaling', () => ({
  useAudioSignaling: () => ({
    mutedUserIds: new Set<string>(),
    activeShare: mocks.activeShare,
    error: null,
    isConnected: true,
  }),
}));

vi.mock('@/lib/webrtc', () => ({
  ROOM_LIMITS: { SOFT_WARNING: 8 },
  WebRTCManager: class {
    private readonly callbacks: ManagerCallbacks;

    startScreenShare = vi.fn(async () => undefined);
    cleanup = vi.fn();
    initializeLocalStream = vi.fn(async () => new MediaStream());
    setMuted = vi.fn();
    resumeRemoteAudio = vi.fn();
    emitRemoteDisplay = (peerId: string, shareId: string | null, stream: MediaStream) => {
      this.callbacks.onRemoteDisplay({ peerId, shareId, stream });
    };

    constructor(_spaceId: string, _userId: string, callbacks: ManagerCallbacks) {
      this.callbacks = callbacks;
      mocks.managers.push(this);
    }
  },
}));

function AudioStateProbe() {
  const audio = useAudio();
  return (
    <output
      data-testid="audio-state"
      data-muted={String(audio.isMuted)}
      data-audio-enabled={String(audio.isAudioEnabled)}
      data-share-id={audio.activeScreenShare?.shareId ?? ''}
      data-display-live={String(audio.displayStream?.stream.getVideoTracks()[0]?.readyState === 'live')}
    />
  );
}

function TracerHarness({ isCurrentOccupant = true }: { isCurrentOccupant?: boolean }) {
  return (
    <AudioProvider spaceId={SPACE_ID} userId={USER_ID}>
      <ScreenShareControls isCurrentOccupant={isCurrentOccupant} />
      <FloorPlanPresentationStage />
      <AudioStateProbe />
    </AudioProvider>
  );
}

function createDisplayStream(): {
  stream: MediaStream;
  track: MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
  retire: () => void;
} {
  let readyState: MediaStreamTrackState = 'live';
  const endedListeners = new Set<EventListener>();
  const track = {
    kind: 'video',
    get readyState() {
      return readyState;
    },
    stop: vi.fn(),
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === 'ended') endedListeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === 'ended') endedListeners.delete(listener);
    }),
  } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return {
    stream,
    track,
    retire: () => {
      readyState = 'ended';
      endedListeners.forEach((listener) => listener(new Event('ended')));
    },
  };
}

describe('screen-share production tracer (mock-bounded wiring evidence)', () => {
  beforeEach(() => {
    mocks.managers.length = 0;
    mocks.activeShare = null;
    vi.restoreAllMocks();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => SHARE_ID) });
  });

  it('keeps the presenter-busy tracer fixture aligned with the strict public API contract', () => {
    expect(screenSharePublicErrorSchema.safeParse(PRESENTER_BUSY_RESPONSE).success).toBe(true);
  });

  it('captures video-only from the direct click, claims, and attaches the exact stream without touching microphone state', async () => {
    const { stream, track } = createDisplayStream();
    const getDisplayMedia = vi.fn(async () => stream);
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getDisplayMedia, getUserMedia },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      code: 'CLAIMED',
      share: {
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        presenterUserId: USER_ID,
        presenterName: 'Ada Lovelace',
        shareId: SHARE_ID,
        expiresAt: '2026-07-24T18:00:00.000Z',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    render(<TracerHarness />);
    await waitFor(() => expect(mocks.managers).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));

    await waitFor(() => expect(mocks.managers[0].startScreenShare).toHaveBeenCalledWith(stream, SHARE_ID));
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(screen.getByTestId('audio-state')).toHaveAttribute('data-muted', 'true');
    expect(screen.getByTestId('audio-state')).toHaveAttribute('data-audio-enabled', 'false');
    expect(screen.getByTestId('audio-state')).toHaveAttribute('data-share-id', SHARE_ID);
    expect(screen.getByTestId('audio-state')).toHaveAttribute('data-display-live', 'true');
    expect(screen.getByTestId('floor-plan-presentation-stage')).toBeInTheDocument();
    expect(screen.getByTestId('floor-plan-presentation-video')).toHaveProperty('srcObject', stream);
  });

  it('stops every losing display track before exposing PRESENTER_BUSY feedback', async () => {
    const { stream, track } = createDisplayStream();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getDisplayMedia: vi.fn(async () => stream), getUserMedia: vi.fn() },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(PRESENTER_BUSY_RESPONSE),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    )));

    render(<TracerHarness />);
    await waitFor(() => expect(mocks.managers).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('already sharing'));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mocks.managers[0].startScreenShare).not.toHaveBeenCalled();
  });

  it('hides the capture action for a non-occupant and cannot touch browser or network boundaries', async () => {
    const getDisplayMedia = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getDisplayMedia, getUserMedia: vi.fn() },
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<TracerHarness isCurrentOccupant={false} />);
    });

    expect(screen.queryByRole('button', { name: 'Share screen' })).not.toBeInTheDocument();
    expect(getDisplayMedia).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders zero stage space without a canonical share', async () => {
    render(<TracerHarness />);

    await waitFor(() => expect(mocks.managers).toHaveLength(1));
    expect(screen.queryByTestId('floor-plan-presentation-stage')).not.toBeInTheDocument();
  });

  it('attaches only the exact canonical live remote stream and clears srcObject on retirement', async () => {
    mocks.activeShare = {
      companyId: COMPANY_ID,
      spaceId: SPACE_ID,
      presenterUserId: REMOTE_USER_ID,
      presenterName: 'Grace Hopper',
      shareId: SHARE_ID,
      expiresAt: '2026-07-24T18:00:00.000Z',
    };
    const mismatched = createDisplayStream();
    const canonical = createDisplayStream();

    render(<TracerHarness />);
    await waitFor(() => expect(mocks.managers).toHaveLength(1));

    act(() => {
      mocks.managers[0].emitRemoteDisplay(REMOTE_USER_ID, '77777777-7777-4777-8777-777777777777', mismatched.stream);
    });
    expect(screen.getByTestId('floor-plan-presentation-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('floor-plan-presentation-video')).not.toBeInTheDocument();
    expect(screen.getByText("Connecting to Grace Hopper's screen…")).toBeInTheDocument();

    act(() => {
      mocks.managers[0].emitRemoteDisplay(REMOTE_USER_ID, SHARE_ID, canonical.stream);
    });
    const video = await screen.findByTestId('floor-plan-presentation-video');
    expect(video).toHaveProperty('srcObject', canonical.stream);
    expect(video).not.toHaveProperty('srcObject', mismatched.stream);

    act(() => canonical.retire());
    await waitFor(() => expect(screen.queryByTestId('floor-plan-presentation-video')).not.toBeInTheDocument());
    expect(video).toHaveProperty('srcObject', null);
  });

  it('clears the attached canonical stream when the stage unmounts', async () => {
    const { stream } = createDisplayStream();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getDisplayMedia: vi.fn(async () => stream), getUserMedia: vi.fn() },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: true,
      code: 'CLAIMED',
      share: {
        companyId: COMPANY_ID,
        spaceId: SPACE_ID,
        presenterUserId: USER_ID,
        presenterName: 'Ada Lovelace',
        shareId: SHARE_ID,
        expiresAt: '2026-07-24T18:00:00.000Z',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const view = render(<TracerHarness />);
    await waitFor(() => expect(mocks.managers).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));
    const video = await screen.findByTestId('floor-plan-presentation-video');
    expect(video).toHaveProperty('srcObject', stream);

    view.unmount();
    expect(video).toHaveProperty('srcObject', null);
  });
});
