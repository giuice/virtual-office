'use client';

import { useEffect, useRef, useState } from 'react';
import { useAudio } from '@/contexts/AudioContext';
import { Button } from '@/components/ui/button';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { Skeleton } from '@/components/ui/skeleton';

const VIDEO_REGION_ID = 'floor-plan-presentation-video-region';

export function FloorPlanPresentationStage() {
  const { activeScreenShare, displayStream } = useAudio();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [retiredStream, setRetiredStream] = useState<MediaStream | null>(null);
  const [collapsedShareId, setCollapsedShareId] = useState<string | null>(null);

  const matchingStream = activeScreenShare
    && displayStream?.presenterUserId === activeScreenShare.presenterUserId
    && displayStream.shareId === activeScreenShare.shareId
    ? displayStream.stream
    : null;
  const matchingTrack = matchingStream?.getVideoTracks()[0] ?? null;
  const isExpanded = activeScreenShare?.shareId !== collapsedShareId;
  const isCanonicalStreamLive = Boolean(
    matchingStream
    && matchingTrack?.readyState === 'live'
    && matchingStream !== retiredStream
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !matchingStream || !matchingTrack || !isCanonicalStreamLive || !isExpanded) {
      if (video?.srcObject) video.srcObject = null;
      return;
    }

    video.srcObject = matchingStream;
    const handleEnded = () => {
      if (video.srcObject === matchingStream) video.srcObject = null;
      setRetiredStream(matchingStream);
    };
    matchingTrack.addEventListener('ended', handleEnded);

    return () => {
      matchingTrack.removeEventListener('ended', handleEnded);
      if (video.srcObject === matchingStream) video.srcObject = null;
    };
  }, [isCanonicalStreamLive, isExpanded, matchingStream, matchingTrack]);

  if (!activeScreenShare) return null;

  if (!isExpanded) {
    return (
      <section
        className="mb-4 flex min-h-12 w-full min-w-0 items-center gap-2 rounded-[14px] border border-[var(--vo-line)] bg-[var(--vo-bg-2)] px-4"
        aria-label={`Screen shared by ${activeScreenShare.presenterName}`}
        data-testid="floor-plan-presentation-stage"
      >
        <span className="rounded-full bg-[var(--vo-mag-soft)] px-2 py-1 text-xs font-bold text-[var(--vo-mag)]">
          LIVE
        </span>
        <p className="min-w-0 flex-1 truncate text-sm" title={activeScreenShare.presenterName}>
          {activeScreenShare.presenterName} is presenting
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-space-action
          aria-expanded="false"
          aria-controls={VIDEO_REGION_ID}
          onClick={() => setCollapsedShareId(null)}
        >
          Expand presentation
        </Button>
      </section>
    );
  }

  return (
    <section
      className="mb-4 w-full overflow-hidden rounded-[14px] border border-[var(--vo-line)] bg-[var(--vo-bg-2)]"
      aria-label={`Screen shared by ${activeScreenShare.presenterName}`}
      data-testid="floor-plan-presentation-stage"
    >
      <header className="flex min-w-0 flex-wrap items-center gap-2 p-4">
        <span className="rounded-full bg-[var(--vo-mag-soft)] px-2 py-1 text-xs font-bold text-[var(--vo-mag)]">
          LIVE
        </span>
        <h2 className="font-bold">Presentation</h2>
        <EnhancedAvatarV2
          user={null}
          fallbackName={activeScreenShare.presenterName}
          size="sm"
          display={{ status: false, speaking: false }}
          aria-label={activeScreenShare.presenterName}
        />
        <p
          className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
          title={activeScreenShare.presenterName}
        >
          {activeScreenShare.presenterName} is sharing their screen
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-space-action
          aria-expanded="true"
          aria-controls={VIDEO_REGION_ID}
          onClick={() => setCollapsedShareId(activeScreenShare.shareId)}
        >
          Collapse presentation
        </Button>
      </header>
      <div
        id={VIDEO_REGION_ID}
        className="relative aspect-video w-full bg-black"
        data-share-id={activeScreenShare.shareId}
      >
        {isCanonicalStreamLive ? (
          <video
            ref={videoRef}
            className="size-full object-contain"
            autoPlay
            playsInline
            muted
            data-testid="floor-plan-presentation-video"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="absolute inset-0 size-full rounded-none" />
            <p className="relative z-10 rounded-md bg-black/60 px-3 py-2 text-sm text-white">
              Connecting to {activeScreenShare.presenterName}&apos;s screen…
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
