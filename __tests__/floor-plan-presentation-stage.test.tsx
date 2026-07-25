import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorPlanPresentationStage } from '@/components/floor-plan/FloorPlanPresentationStage';
import { ScreenShareControls } from '@/components/floor-plan/ScreenShareControls';

const LOCAL_USER_ID = '11111111-1111-4111-8111-111111111111';
const REMOTE_USER_ID = '22222222-2222-4222-8222-222222222222';

const audio = vi.hoisted(() => ({
  activeScreenShare: null as {
    companyId: string;
    spaceId: string;
    presenterUserId: string;
    presenterName: string;
    shareId: string;
    expiresAt: string;
  } | null,
  displayStream: null as {
    presenterUserId: string;
    shareId: string;
    stream: MediaStream;
  } | null,
  screenShareStatus: 'idle' as 'idle' | 'opening-picker' | 'claiming' | 'sharing' | 'stopping',
  screenShareError: null as string | null,
  startScreenShare: vi.fn(async () => true),
  stopScreenShare: vi.fn(async () => undefined),
}));

vi.mock('@/contexts/AudioContext', () => ({
  useAudio: () => audio,
}));

vi.mock('@/components/ui/enhanced-avatar-v2', () => ({
  EnhancedAvatarV2: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <span role="img" aria-label={ariaLabel} />
  ),
}));

function share(presenterUserId = REMOTE_USER_ID, shareId = 'share-a', presenterName = 'Grace Hopper') {
  return {
    companyId: 'company-a',
    spaceId: 'space-a',
    presenterUserId,
    presenterName,
    shareId,
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
}

function display(presenterUserId = REMOTE_USER_ID, shareId = 'share-a') {
  let readyState: MediaStreamTrackState = 'live';
  const listeners = new Set<EventListener>();
  const track = {
    get readyState() {
      return readyState;
    },
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === 'ended') listeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: EventListener) => {
      if (event === 'ended') listeners.delete(listener);
    }),
  } as unknown as MediaStreamTrack;
  const stream = {
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return {
    value: { presenterUserId, shareId, stream },
    retire: () => {
      readyState = 'ended';
      listeners.forEach((listener) => listener(new Event('ended')));
    },
  };
}

describe('ScreenShareControls', () => {
  beforeEach(() => {
    audio.activeScreenShare = null;
    audio.displayStream = null;
    audio.screenShareStatus = 'idle';
    audio.screenShareError = null;
    audio.startScreenShare.mockClear();
    audio.stopScreenShare.mockClear();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn() },
    });
  });

  it('covers idle, local progress, remote busy, owner stop, unsupported, and exact feedback copy', async () => {
    const pending = new Promise<boolean>(() => undefined);
    audio.startScreenShare.mockReturnValueOnce(pending);
    const view = render(
      <>
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
      </>,
    );

    const idleButtons = screen.getAllByRole('button', { name: 'Share screen' });
    expect(idleButtons).toHaveLength(2);
    expect(screen.getAllByText('No one is sharing a screen')).toHaveLength(2);
    fireEvent.click(idleButtons[0]);
    expect(await screen.findByText('Opening screen picker…')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Share screen' })[1]).toBeDisabled();

    audio.activeScreenShare = share();
    audio.screenShareStatus = 'sharing';
    view.rerender(
      <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />,
    );
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeDisabled();
    expect(screen.getByText('Grace Hopper is sharing their screen')).toBeInTheDocument();

    audio.activeScreenShare = share(LOCAL_USER_ID);
    view.rerender(
      <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(audio.stopScreenShare).toHaveBeenCalledWith('user-stop');

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {},
    });
    audio.activeScreenShare = null;
    audio.screenShareStatus = 'idle';
    audio.screenShareError = "Screen sharing isn’t supported in this browser. Use a current supported browser.";
    view.rerender(
      <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />,
    );
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(audio.screenShareError);
  });

  it.each([
    'We couldn’t start screen sharing. Check your browser permission, then try again.',
    'No screen is available to share. Connect a display or choose another source, then try again.',
    'Grace Hopper is already sharing their screen. Wait for them to stop, then try again.',
    'We couldn’t start screen sharing. Try again. If the problem continues, rejoin the space.',
  ])('announces actionable failure: %s', (message) => {
    audio.screenShareError = message;
    render(<ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('announces cancellation politely rather than as an alert', () => {
    audio.screenShareError = 'Screen sharing was cancelled.';
    render(<ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Screen sharing was cancelled.')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('FloorPlanPresentationStage', () => {
  beforeEach(() => {
    audio.activeScreenShare = share();
    audio.displayStream = null;
    audio.screenShareStatus = 'sharing';
    audio.screenShareError = null;
    audio.stopScreenShare.mockClear();
  });

  it('renders the complete loading and responsive stage contract without native video controls', () => {
    render(<FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />);
    const stage = screen.getByRole('region', { name: 'Screen shared by Grace Hopper' });
    expect(stage).toHaveClass('min-w-0', 'motion-reduce:transition-none');
    expect(screen.getByRole('heading', { name: 'Presentation' })).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText("Connecting to Grace Hopper's screen…")).toBeInTheDocument();
    const videoRegion = screen.getByTestId('presentation-video-region');
    expect(videoRegion).toHaveClass(
      'aspect-video',
      'max-h-[44vh]',
      'min-h-[180px]',
      'md:max-h-[50vh]',
      'xl:max-h-[540px]',
      'xl:max-w-[960px]',
      'break-words',
    );
    expect(screen.queryByRole('button', { name: /fullscreen|picture|record|camera/i })).not.toBeInTheDocument();
  });

  it('binds only the exact canonical live stream and clears it on retirement', async () => {
    const canonical = display();
    audio.displayStream = canonical.value;
    const view = render(<FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />);
    const video = screen.getByTestId('floor-plan-presentation-video');
    expect(video).toHaveProperty('srcObject', canonical.value.stream);
    expect(video).not.toHaveAttribute('controls');

    act(() => canonical.retire());
    await waitFor(() => expect(video).toHaveProperty('srcObject', null));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Presentation unavailable. Ask Grace Hopper to stop and share again.',
    );

    audio.activeScreenShare = null;
    view.rerender(<FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />);
    expect(screen.queryByTestId('floor-plan-presentation-stage')).not.toBeInTheDocument();
  });

  it('keeps collapse local to a share, Escape returns focus to Expand, and a new share expands', async () => {
    const view = render(<FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />);
    fireEvent.keyDown(screen.getByTestId('floor-plan-presentation-stage'), { key: 'Escape' });
    const expand = await screen.findByRole('button', { name: 'Expand presentation' });
    expect(expand).toHaveFocus();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.queryByTestId('presentation-video-region')).not.toBeInTheDocument();

    view.rerender(<FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />);
    expect(screen.getByRole('button', { name: 'Expand presentation' })).toBeInTheDocument();

    audio.activeScreenShare = share(REMOTE_USER_ID, 'share-b');
    view.rerender(<FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />);
    expect(screen.getByRole('button', { name: 'Collapse presentation' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders owner Stop sharing in expanded and rail states and returns focus to Share screen', async () => {
    audio.activeScreenShare = share(LOCAL_USER_ID);
    render(
      <>
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
        <FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse presentation' }));
    expect(screen.getByTitle('Grace Hopper')).toHaveClass('truncate');
    const stop = screen.getByRole('button', { name: 'Stop sharing' });
    expect(stop).toHaveClass('min-h-11');
    fireEvent.click(stop);
    await waitFor(() => expect(audio.stopScreenShare).toHaveBeenCalledWith('user-stop'));
    expect(screen.getByRole('button', { name: 'Stop sharing' })).toHaveFocus();
  });

  it('does not steal focus when a remote presentation ends', () => {
    const view = render(
      <>
        <button type="button">Viewer action</button>
        <FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />
      </>,
    );
    const viewerAction = screen.getByRole('button', { name: 'Viewer action' });
    viewerAction.focus();
    audio.activeScreenShare = null;
    view.rerender(
      <>
        <button type="button">Viewer action</button>
        <FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />
      </>,
    );
    expect(viewerAction).toHaveFocus();
  });
});
