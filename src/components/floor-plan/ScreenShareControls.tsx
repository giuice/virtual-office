'use client';

import { MonitorUp } from 'lucide-react';
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
}

function stopInteractivePropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

export function ScreenShareControls({ isCurrentOccupant }: ScreenShareControlsProps) {
  const {
    activeScreenShare,
    screenShareError,
    screenShareStatus,
    startScreenShare,
  } = useAudio();

  if (!isCurrentOccupant) return null;

  const isStarting = screenShareStatus !== 'idle';
  const isAnotherPresenterActive = activeScreenShare !== null;
  const label = screenShareStatus === 'opening-picker'
    ? 'Opening screen pickerâ€¦'
    : screenShareStatus === 'claiming'
      ? 'Starting screen shareâ€¦'
      : 'Share screen';
  const tooltip = isAnotherPresenterActive
    ? `${activeScreenShare.presenterName} is sharing their screen`
    : 'Share your screen';

  return (
    <div
      className="flex min-w-0 flex-col items-start gap-1"
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
              aria-label="Share screen"
              disabled={isStarting || isAnotherPresenterActive}
              data-space-action
              onClick={() => void startScreenShare()}
            >
              <MonitorUp className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            onPointerDown={stopInteractivePropagation}
            onClick={stopInteractivePropagation}
          >
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="sr-only" aria-live="polite">
        {activeScreenShare ? tooltip : 'No one is sharing a screen'}
      </span>
      {screenShareError ? (
        <p className="max-w-80 text-xs text-destructive" role="alert">
          {screenShareError}
        </p>
      ) : null}
    </div>
  );
}
