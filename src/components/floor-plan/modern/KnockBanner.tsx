'use client';

import React from 'react';
import { Check, DoorOpen, X } from 'lucide-react';
import { EnhancedAvatarV2 } from '@/components/ui/enhanced-avatar-v2';
import { cn } from '@/lib/utils';

interface KnockBannerProps {
  requesterName: string;
  requesterAvatarUrl?: string;
  onApprove: () => void;
  onDeny: () => void;
  responding?: boolean;
}

export const KnockBanner: React.FC<KnockBannerProps> = ({
  requesterName,
  requesterAvatarUrl,
  onApprove,
  onDeny,
  responding = false,
}) => {
  const handleApprove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onApprove();
  };

  const handleDeny = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDeny();
  };

  const stopPointerDownPropagation = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      data-avatar-interactive="true"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'relative z-[60] flex items-center gap-3 p-3 rounded-lg border',
        'bg-[var(--vo-signal-success)]/10 border-[var(--vo-signal-success)]/30',
        'animate-in slide-in-from-top-2 duration-300 motion-reduce:animate-none'
      )}
    >
      <div className="relative flex-shrink-0">
        <EnhancedAvatarV2
          user={{
            id: `knock-${requesterName}`,
            displayName: requesterName,
            avatarUrl: requesterAvatarUrl,
          }}
          size="md"
          fallbackName={requesterName}
          className="size-10"
          aria-label={`${requesterName} avatar`}
        />
        {!requesterAvatarUrl && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
            <DoorOpen className="size-4" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="truncate">
          <span className="text-sm font-semibold text-foreground">{requesterName}</span>
          <span className="text-sm font-normal text-foreground"> is knocking</span>
        </p>
        <p className="text-xs font-normal text-muted-foreground">Requesting access to this space</p>
      </div>

      <button
        type="button"
        data-avatar-interactive="true"
        onPointerDown={stopPointerDownPropagation}
        onClick={handleApprove}
        disabled={responding}
        className="size-9 rounded-lg bg-[var(--vo-signal-success)]/20 hover:bg-[var(--vo-signal-success)]/30 text-[var(--vo-signal-success)] flex items-center justify-center disabled:cursor-wait disabled:opacity-50"
        aria-label={`Let ${requesterName} in`}
      >
        <Check className="size-4" />
      </button>

      <button
        type="button"
        data-avatar-interactive="true"
        onPointerDown={stopPointerDownPropagation}
        onClick={handleDeny}
        disabled={responding}
        className="size-9 rounded-lg bg-[var(--vo-signal-critical)]/20 hover:bg-[var(--vo-signal-critical)]/30 text-[var(--vo-signal-critical)] flex items-center justify-center disabled:cursor-wait disabled:opacity-50"
        aria-label={`Deny ${requesterName}`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
};
