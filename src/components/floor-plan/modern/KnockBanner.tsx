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
}

export const KnockBanner: React.FC<KnockBannerProps> = ({
  requesterName,
  requesterAvatarUrl,
  onApprove,
  onDeny,
}) => {
  const handleApprove = (event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onApprove();
  };

  const handleDeny = (event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDeny();
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
        'flex items-center gap-3 p-3 rounded-lg border',
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
          className="w-10 h-10"
          aria-label={`${requesterName} avatar`}
        />
        {!requesterAvatarUrl && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
            <DoorOpen className="w-4 h-4" />
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
        onPointerDown={handleApprove}
        onClick={handleApprove}
        className="w-9 h-9 rounded-lg bg-[var(--vo-signal-success)]/20 hover:bg-[var(--vo-signal-success)]/30 text-[var(--vo-signal-success)] flex items-center justify-center"
        aria-label={`Let ${requesterName} in`}
      >
        <Check className="w-4 h-4" />
      </button>

      <button
        type="button"
        data-avatar-interactive="true"
        onPointerDown={handleDeny}
        onClick={handleDeny}
        className="w-9 h-9 rounded-lg bg-[var(--vo-signal-critical)]/20 hover:bg-[var(--vo-signal-critical)]/30 text-[var(--vo-signal-critical)] flex items-center justify-center"
        aria-label={`Deny ${requesterName}`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default KnockBanner;
