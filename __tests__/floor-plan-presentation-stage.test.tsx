import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorPlanPresentationStage } from '@/components/floor-plan/FloorPlanPresentationStage';
import { ScreenShareControls } from '@/components/floor-plan/ScreenShareControls';
import { FloorPlanToolbar } from '@/components/floor-plan/FloorPlanToolbar';
import { SpaceDetailPanel } from '@/components/floor-plan/modern/SpaceDetailPanel';
import type { Space } from '@/types/database';

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

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: () => ({ currentUserProfile: { id: LOCAL_USER_ID } }),
}));

vi.mock('@/components/floor-plan/SpaceAudioControls', () => ({
  SpaceAudioControls: () => <button type="button" aria-label="Space audio" data-space-action />,
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

const SPACE = {
  id: 'space-a',
  companyId: 'company-a',
  name: 'Engineering',
  type: 'conference',
  status: 'active',
  capacity: 12,
  features: [],
  position: { x: 0, y: 0, width: 1, height: 1 },
  accessControl: { isPublic: true },
  createdAt: '2030-01-01T00:00:00.000Z',
} as Space;

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
    expect(await screen.findAllByText('Opening screen picker…')).toHaveLength(2);
    audio.screenShareStatus = 'opening-picker';
    view.rerender(
      <>
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
      </>,
    );
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
    const view = render(
      <>
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
        <FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse presentation' }));
    expect(screen.getByTitle('Grace Hopper')).toHaveClass('truncate');
    const stop = screen.getAllByRole('button', { name: 'Stop sharing' })[1];
    expect(stop.className).toContain('[@media(pointer:coarse)]:min-h-11');
    fireEvent.click(stop);
    await waitFor(() => expect(audio.stopScreenShare).toHaveBeenCalledWith('user-stop'));
    audio.activeScreenShare = null;
    view.rerender(
      <>
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
        <FloorPlanPresentationStage currentUserId={LOCAL_USER_ID} />
      </>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share screen' })).toHaveFocus());
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

describe('authoritative floor-plan media integration', () => {
  beforeEach(() => {
    audio.activeScreenShare = null;
    audio.displayStream = null;
    audio.screenShareStatus = 'idle';
    audio.screenShareError = null;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn() },
    });
  });

  const toolbarProps = {
    filterType: 'all',
    isAdmin: false,
    onFilterTypeChange: vi.fn(),
    onOpenRoomManagement: vi.fn(),
    onOpenTemplateDialog: vi.fn(),
    onCreateRoom: vi.fn(),
    onOpenNeighborhoodManager: vi.fn(),
    onOpenSelectedChat: vi.fn(),
    currentUserId: LOCAL_USER_ID,
  };

  it('gates toolbar media by authoritative occupancy while selectedSpace controls only chat', () => {
    const view = render(
      <FloorPlanToolbar
        {...toolbarProps}
        selectedSpace={SPACE}
        isCurrentOccupant={false}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Share screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Space audio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat in Room' })).toBeInTheDocument();

    view.rerender(
      <FloorPlanToolbar
        {...toolbarProps}
        selectedSpace={null}
        isCurrentOccupant
      />,
    );
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Space audio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chat in Room' })).not.toBeInTheDocument();
  });

  it('shows one shared Audio & presentation state only for the authoritative current card', () => {
    const baseProps = {
      space: SPACE,
      usersInSpace: [],
      onJoin: vi.fn(),
      onLeave: vi.fn(),
    };
    const view = render(
      <SpaceDetailPanel {...baseProps} state={{ userInSpace: false }} />,
    );
    expect(screen.queryByText('Audio & presentation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share screen' })).not.toBeInTheDocument();

    view.rerender(
      <SpaceDetailPanel {...baseProps} state={{ userInSpace: true }} />,
    );
    expect(screen.getByText('Audio & presentation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Space audio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument();
  });

  it('prevents pointer, click, and keyboard media interactions from reaching a clickable card', () => {
    const parentClick = vi.fn();
    const parentKeyDown = vi.fn();
    render(
      <div onClick={parentClick} onKeyDown={parentKeyDown}>
        <ScreenShareControls isCurrentOccupant currentUserId={LOCAL_USER_ID} />
      </div>,
    );
    const shareButton = screen.getByRole('button', { name: 'Share screen' });
    fireEvent.pointerDown(shareButton);
    fireEvent.click(shareButton);
    fireEvent.keyDown(shareButton, { key: 'Enter' });
    expect(parentClick).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});
