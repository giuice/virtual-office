'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudio } from '@/contexts/AudioContext';
import { Button } from '@/components/ui/button';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Skeleton } from '@/components/ui/skeleton';

const VIDEO_REGION_ID = 'floor-plan-presentation-video-region';
const FULLSCREEN_UNSUPPORTED_MESSAGE = 'Fullscreen is not supported in this browser. Use a current supported browser.';
const FULLSCREEN_ENTER_ERROR_MESSAGE = 'Fullscreen could not start. Check your browser settings, then try again.';
const FULLSCREEN_EXIT_ERROR_MESSAGE = 'Fullscreen could not exit. Press Escape or try again.';

interface FloorPlanPresentationStageProps {
  currentUserId?: string;
}

function stopInteractivePropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

function exitDocumentFullscreen(): Promise<void> {
  if (typeof document.exitFullscreen !== 'function') {
    return Promise.reject(new Error('Fullscreen exit is not supported'));
  }

  try {
    return Promise.resolve(document.exitFullscreen());
  } catch (error) {
    return Promise.reject(error);
  }
}

export function FloorPlanPresentationStage({
  currentUserId,
}: FloorPlanPresentationStageProps) {
  const { activeScreenShare, displayStream, stopScreenShare } = useAudio();
  const videoRef = useRef<HTMLVideoElement>(null);
  const presentationStageRef = useRef<HTMLElement | null>(null);
  const latestPresentationStageRef = useRef<HTMLElement | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const focusExpandAfterCollapseRef = useRef(false);
  const fullscreenExitFocusSuppressedRef = useRef(false);
  const fullscreenExitFocusRequestedRef = useRef(false);
  const isFullscreenRef = useRef(false);
  const activeShareIdRef = useRef<string | null>(null);
  const [collapsedShareId, setCollapsedShareId] = useState<string | null>(null);
  const [unavailableShareId, setUnavailableShareId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  activeShareIdRef.current = activeScreenShare?.shareId ?? null;

  const setPresentationStageRef = useCallback((element: HTMLElement | null): void => {
    presentationStageRef.current = element;
    if (element) latestPresentationStageRef.current = element;
  }, []);

  const matchingStream = activeScreenShare
    && displayStream?.presenterUserId === activeScreenShare.presenterUserId
    && displayStream.shareId === activeScreenShare.shareId
    ? displayStream.stream
    : null;
  const matchingTrack = matchingStream?.getVideoTracks()[0] ?? null;
  const isExpanded = activeScreenShare?.shareId !== collapsedShareId;
  const isCanonicalStreamLive = Boolean(
    activeScreenShare
    && matchingStream
    && matchingTrack?.readyState === 'live'
    && unavailableShareId !== activeScreenShare.shareId
  );
  const isUnavailable = Boolean(
    activeScreenShare
    && (
      unavailableShareId === activeScreenShare.shareId
      || (matchingTrack && matchingTrack.readyState !== 'live')
    )
  );
  const isOwner = Boolean(
    activeScreenShare
    && currentUserId
    && activeScreenShare.presenterUserId === currentUserId
  );

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      const stage = presentationStageRef.current;
      const wasFullscreen = isFullscreenRef.current;
      const nextIsFullscreen = Boolean(stage && document.fullscreenElement === stage);
      isFullscreenRef.current = nextIsFullscreen;
      setIsFullscreen(nextIsFullscreen);

      if (
        wasFullscreen
        && !nextIsFullscreen
        && !document.fullscreenElement
        && !fullscreenExitFocusSuppressedRef.current
        && (
          fullscreenExitFocusRequestedRef.current
          || stage?.contains(document.activeElement)
        )
      ) {
        fullscreenButtonRef.current?.focus();
      }
      fullscreenExitFocusRequestedRef.current = false;
      fullscreenExitFocusSuppressedRef.current = false;
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const stage = latestPresentationStageRef.current;

    return () => {
      if (stage && document.fullscreenElement === stage) {
        fullscreenExitFocusSuppressedRef.current = true;
        fullscreenExitFocusRequestedRef.current = false;
        void exitDocumentFullscreen().catch(() => undefined);
      }
    };
  }, [
    activeScreenShare?.presenterUserId,
    activeScreenShare?.shareId,
    activeScreenShare?.spaceId,
  ]);

  useEffect(() => {
    setFullscreenError(null);
  }, [
    activeScreenShare?.presenterUserId,
    activeScreenShare?.shareId,
    activeScreenShare?.spaceId,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !matchingStream || !matchingTrack || !isCanonicalStreamLive || !isExpanded) {
      if (video?.srcObject) video.srcObject = null;
      return;
    }

    video.srcObject = matchingStream;
    const handleEnded = () => {
      if (video.srcObject === matchingStream) video.srcObject = null;
      setUnavailableShareId(activeScreenShare?.shareId ?? null);
    };
    matchingTrack.addEventListener('ended', handleEnded);

    return () => {
      matchingTrack.removeEventListener('ended', handleEnded);
      if (video.srcObject === matchingStream) video.srcObject = null;
    };
  }, [
    activeScreenShare?.shareId,
    isCanonicalStreamLive,
    isExpanded,
    matchingStream,
    matchingTrack,
  ]);

  useEffect(() => {
    if (!activeScreenShare) {
      setCollapsedShareId(null);
      setUnavailableShareId(null);
      return;
    }
    if (collapsedShareId && collapsedShareId !== activeScreenShare.shareId) {
      setCollapsedShareId(null);
    }
    if (unavailableShareId && unavailableShareId !== activeScreenShare.shareId) {
      setUnavailableShareId(null);
    }
  }, [activeScreenShare, collapsedShareId, unavailableShareId]);

  useEffect(() => {
    if (!isExpanded && focusExpandAfterCollapseRef.current) {
      focusExpandAfterCollapseRef.current = false;
      expandButtonRef.current?.focus();
    }
  }, [isExpanded]);

  if (!activeScreenShare) return null;

  const enterFullscreen = async (): Promise<void> => {
    const stage = presentationStageRef.current;
    const shareId = activeShareIdRef.current;
    if (!stage) return;

    setFullscreenError(null);
    if (typeof stage.requestFullscreen !== 'function') {
      setFullscreenError(FULLSCREEN_UNSUPPORTED_MESSAGE);
      return;
    }

    try {
      await stage.requestFullscreen();
      if (
        activeShareIdRef.current !== shareId
        && document.fullscreenElement === stage
      ) {
        fullscreenExitFocusSuppressedRef.current = true;
        fullscreenExitFocusRequestedRef.current = false;
        try {
          await exitDocumentFullscreen();
        } catch {
          if (document.fullscreenElement === stage) {
            setFullscreenError(FULLSCREEN_EXIT_ERROR_MESSAGE);
          }
        }
      }
    } catch {
      if (activeShareIdRef.current === shareId) {
        setFullscreenError(FULLSCREEN_ENTER_ERROR_MESSAGE);
      }
    }
  };

  const exitFullscreen = async (): Promise<void> => {
    const stage = presentationStageRef.current;
    const shareId = activeShareIdRef.current;
    if (!stage || document.fullscreenElement !== stage) return;

    fullscreenExitFocusSuppressedRef.current = false;
    fullscreenExitFocusRequestedRef.current = true;
    setFullscreenError(null);
    try {
      await exitDocumentFullscreen();
    } catch {
      if (activeShareIdRef.current === shareId && document.fullscreenElement === stage) {
        setFullscreenError(FULLSCREEN_EXIT_ERROR_MESSAGE);
      }
    }
  };

  const collapse = async (returnFocus: boolean): Promise<void> => {
    const shareId = activeShareIdRef.current;
    focusExpandAfterCollapseRef.current = returnFocus;
    const stage = presentationStageRef.current;
    if (stage && document.fullscreenElement === stage) {
      fullscreenExitFocusSuppressedRef.current = true;
      fullscreenExitFocusRequestedRef.current = false;
      try {
        await exitDocumentFullscreen();
      } catch {
        fullscreenExitFocusSuppressedRef.current = false;
        if (activeShareIdRef.current === shareId) {
          setFullscreenError(FULLSCREEN_EXIT_ERROR_MESSAGE);
        }
        return;
      }
    }
    if (activeShareIdRef.current === shareId) setCollapsedShareId(shareId);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    stopInteractivePropagation(event);
    if (event.key === 'Escape' && isExpanded) {
      event.preventDefault();
      if (presentationStageRef.current && document.fullscreenElement === presentationStageRef.current) {
        void exitFullscreen();
        return;
      }
      void collapse(true);
    }
  };
  const stop = async (): Promise<void> => {
    await stopScreenShare('user-stop');
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-screen-share-trigger="true"]:not([disabled])')?.focus();
    });
  };
  const railStatus = isUnavailable
    ? 'Presentation unavailable'
    : !isCanonicalStreamLive
      ? 'Connecting…'
      : null;
  const actionClass = 'min-h-9 shrink-0 motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11';

  if (!isExpanded) {
    return (
      <section
        className="mb-4 flex min-h-12 w-full min-w-0 flex-wrap items-center gap-2 overflow-hidden rounded-[14px] border border-[var(--vo-line)] bg-[var(--vo-bg-2)] px-4 py-1 text-[var(--vo-text)] transition-[opacity,transform] duration-150 motion-reduce:transition-none max-md:min-h-[52px]"
        aria-label={`Screen shared by ${activeScreenShare.presenterName}`}
        data-testid="floor-plan-presentation-stage"
        onPointerDown={stopInteractivePropagation}
        onClick={stopInteractivePropagation}
        onKeyDown={handleKeyDown}
      >
        <span className="shrink-0 rounded-full bg-[var(--vo-mag-soft)] px-2 py-1 text-xs font-bold text-[var(--vo-mag)]">
          LIVE
        </span>
        <p
          className="min-w-0 flex-1 truncate text-sm leading-5"
          title={activeScreenShare.presenterName}
          aria-label={`${activeScreenShare.presenterName} is presenting`}
        >
          {activeScreenShare.presenterName} is presenting
        </p>
        {railStatus ? (
          <span
            className="min-w-0 break-words text-xs leading-5 text-[var(--vo-text-2)]"
            role={isUnavailable ? 'status' : undefined}
          >
            {railStatus}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
          <Button
            ref={expandButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            className={actionClass}
            data-space-action
            aria-expanded="false"
            aria-controls={VIDEO_REGION_ID}
            onClick={() => setCollapsedShareId(null)}
          >
            Expand presentation
          </Button>
          {isOwner ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={actionClass}
              data-space-action
              onClick={() => void stop()}
            >
              Stop sharing
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={setPresentationStageRef}
      className={isFullscreen
        ? 'mb-0 flex h-screen min-h-0 w-screen min-w-0 max-h-none max-w-none flex-col overflow-hidden rounded-none border-0 bg-[var(--vo-bg-2)] text-[var(--vo-text)] transition-[opacity,transform] duration-150 motion-reduce:transition-none'
        : 'mb-4 flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[14px] border border-[var(--vo-line)] bg-[var(--vo-bg-2)] text-[var(--vo-text)] transition-[opacity,transform] duration-150 motion-reduce:transition-none'}
      aria-label={`Screen shared by ${activeScreenShare.presenterName}`}
      data-testid="floor-plan-presentation-stage"
      data-fullscreen={isFullscreen ? 'true' : undefined}
      onPointerDown={stopInteractivePropagation}
      onClick={stopInteractivePropagation}
      onKeyDown={handleKeyDown}
    >
      <header className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 p-4">
        <span className="shrink-0 rounded-full bg-[var(--vo-mag-soft)] px-2 py-1 text-xs font-bold text-[var(--vo-mag)]">
          LIVE
        </span>
        <h2 className="shrink-0 font-[family-name:var(--font-manrope)] font-bold">
          Presentation
        </h2>
        <EnhancedAvatarV2
          user={null}
          fallbackName={activeScreenShare.presenterName}
          size="sm"
          display={{ status: false, speaking: false }}
          aria-label={activeScreenShare.presenterName}
        />
        <p
          className="min-w-0 flex-1 truncate text-sm leading-5 text-[var(--vo-text-2)]"
          title={activeScreenShare.presenterName}
          aria-label={`${activeScreenShare.presenterName} is sharing their screen`}
        >
          {activeScreenShare.presenterName} is sharing their screen
        </p>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={actionClass}
            data-space-action
            aria-expanded="true"
            aria-controls={VIDEO_REGION_ID}
            onClick={() => void collapse(false)}
          >
            Collapse presentation
          </Button>
          <Button
            ref={fullscreenButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            className={actionClass}
            data-space-action
            onClick={() => void (isFullscreen ? exitFullscreen() : enterFullscreen())}
          >
            {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          </Button>
          {isOwner ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={actionClass}
              data-space-action
              onClick={() => void stop()}
            >
              Stop sharing
            </Button>
          ) : null}
        </div>
      </header>
      {fullscreenError ? (
        <p
          className="mx-4 mb-2 max-w-full break-words rounded-md bg-[var(--vo-err)]/10 px-3 py-2 text-sm leading-5 text-[var(--vo-err)]"
          role="alert"
        >
          {fullscreenError}
        </p>
      ) : null}
      <div
        id={VIDEO_REGION_ID}
        className={isFullscreen
          ? 'relative min-h-0 min-w-0 flex-1 w-full max-w-none overflow-hidden break-words bg-black'
          : 'relative mx-auto aspect-video min-h-[180px] w-full max-w-full max-h-[44vh] overflow-hidden break-words bg-black md:max-h-[50vh] xl:max-h-[540px] xl:max-w-[960px]'}
        data-share-id={activeScreenShare.shareId}
        data-testid="presentation-video-region"
      >
        {isCanonicalStreamLive ? (
          <video
            ref={videoRef}
            className="size-full max-w-full object-contain"
            autoPlay
            playsInline
            muted
            data-testid="floor-plan-presentation-video"
          />
        ) : isUnavailable ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <p
              className="max-w-full break-words rounded-md bg-black/70 px-3 py-2 text-sm leading-5 text-white"
              role="alert"
            >
              Presentation unavailable. Ask {activeScreenShare.presenterName} to stop and share again.
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Skeleton className="absolute inset-0 size-full rounded-none motion-reduce:animate-none" />
            <p
              className="relative z-10 max-w-full break-words rounded-md bg-black/60 px-3 py-2 text-sm leading-5 text-white"
              aria-live="polite"
            >
              Connecting to {activeScreenShare.presenterName}&apos;s screen…
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
