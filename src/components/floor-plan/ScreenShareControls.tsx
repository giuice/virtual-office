'use client';

import { useState } from 'react';
import { AlertCircle, MonitorOff, MonitorUp } from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ScreenShareControlsProps {
  isCurrentOccupant: boolean;
  currentUserId?: string;
}

const CANCELLED_COPY = 'Screen sharing was cancelled.';
const UNSUPPORTED_COPY = "Screen sharing isn’t supported in this browser. Use a current supported browser.";

function stopInteractivePropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

function isCaptureSupported(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

export function ScreenShareControls({
  isCurrentOccupant,
  currentUserId,
}: ScreenShareControlsProps) {
  const {
    activeScreenShare,
    screenShareError,
    screenShareStatus,
    startScreenShare,
    stopScreenShare,
    currentUserId: contextCurrentUserId,
  } = useAudio();
  const [isLocalStartPending, setIsLocalStartPending] = useState(false);

  if (!isCurrentOccupant) return null;

  const resolvedCurrentUserId = currentUserId ?? contextCurrentUserId;
  const isOwner = Boolean(
    activeScreenShare
    && resolvedCurrentUserId
    && activeScreenShare.presenterUserId === resolvedCurrentUserId,
  );
  const supported = isCaptureSupported();
  const isCanonicalBusy = screenShareStatus === 'opening-picker'
    || screenShareStatus === 'claiming'
    || screenShareStatus === 'stopping';
  const localProgress = isLocalStartPending
    ? screenShareStatus === 'claiming'
      ? 'Starting screen share…'
      : 'Opening screen picker…'
    : null;
  const statusCopy = activeScreenShare
    ? `${activeScreenShare.presenterName} is sharing their screen`
    : screenShareError ?? 'No one is sharing a screen';
  const isCancellation = screenShareError === CANCELLED_COPY;
  const actionableError = screenShareError && !isCancellation
    ? screenShareError
    : !supported
      ? UNSUPPORTED_COPY
      : null;

  const handleStart = async (): Promise<void> => {
    setIsLocalStartPending(true);
    try {
      await startScreenShare();
    } finally {
      setIsLocalStartPending(false);
    }
  };

  const handleStop = (): void => {
    void stopScreenShare('user-stop');
  };

  const buttonLabel = isOwner
    ? 'Stop sharing'
    : localProgress ?? 'Share screen';
  const tooltip = isOwner
    ? 'Stop sharing'
    : !supported
      ? UNSUPPORTED_COPY
      : activeScreenShare
        ? `${activeScreenShare.presenterName} is sharing their screen`
        : 'Share your screen';
  const Icon = isOwner ? MonitorOff : !supported ? AlertCircle : MonitorUp;

  return (
    <div
      className="flex min-w-0 max-w-full flex-col items-start gap-1"
      data-space-action
      onPointerDown={stopInteractivePropagation}
      onClick={stopInteractivePropagation}
      onKeyDown={stopInteractivePropagation}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9 max-w-full motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
              aria-label={isOwner ? 'Stop sharing' : 'Share screen'}
              disabled={!isOwner && (!supported || isCanonicalBusy || Boolean(activeScreenShare))}
              data-screen-share-trigger={!isOwner ? 'true' : undefined}
              data-space-action
              onClick={isOwner ? handleStop : () => void handleStart()}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden truncate md:inline">{buttonLabel}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            data-space-action
            onPointerDown={stopInteractivePropagation}
            onClick={stopInteractivePropagation}
            onKeyDown={stopInteractivePropagation}
          >
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {localProgress ? (
        <span className="max-w-full break-words text-xs leading-5" aria-live="polite">
          {localProgress}
        </span>
      ) : null}
      {isCancellation ? (
        <span className="max-w-full break-words text-xs leading-5" aria-live="polite">
          {CANCELLED_COPY}
        </span>
      ) : (
        <span className="sr-only" aria-live="polite">
          {statusCopy}
        </span>
      )}
      {actionableError ? (
        <p className="max-w-full break-words text-xs leading-5 text-destructive" role="alert">
          {actionableError}
        </p>
      ) : null}
    </div>
  );
}
