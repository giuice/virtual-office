// src/components/floor-plan/modern/SpaceDetailPanel.tsx
// Space detail surface shared by the desktop panel and mobile bottom sheet.
'use client';

import React from 'react';
import { DoorClosed, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Space, UserPresenceData } from '@/types/database';
import { ParticipantRoster } from './ParticipantRoster';
import { SpaceActionButtons } from './SpaceActionButtons';
import { CapacityIndicator } from './StatusIndicators';
import type { KnockStatus } from '@/hooks/useKnock';
import { SpaceAudioControls } from '../SpaceAudioControls';
import { SpaceTypeIndicator } from './SpaceTypeIndicator';
import { isSpaceStatusEnterable } from './NowBoard';

/**
 * Real-data-only detail contract: space metadata, roster, audio, and actions.
 */
export interface SpaceDetailPanelProps {
  space: Space;
  usersInSpace: UserPresenceData[];
  state: {
    userInSpace: boolean;
    privateSpace?: boolean;
    /** Story 3.12 - AC3: Whether space is at full capacity */
    full?: boolean;
    /** Whether direct join/enter is currently allowed */
    canDirectEnter?: boolean;
  };
  /** Story 3.16: Current knock status for this space */
  knockStatus?: KnockStatus;
  /** Story 3.16: Current cooldown remaining for this space */
  knockCooldownRemaining?: number;
  onJoin: () => void;
  onLeave: () => void;
  onKnock?: () => void;
  onUserClick?: (userId: string) => void;
  onClose?: () => void;
  /** Speaking user IDs for status display */
  speakingUserIds?: string[];
  /** Presenting user ID for status display */
  presentingUserId?: string;
  /** Muted user IDs for dimmed display */
  mutedUserIds?: string[];
  className?: string;
}

/**
 * SpaceDetailPanel - Expanded real-data details for a space.
 */
export const SpaceDetailPanel: React.FC<SpaceDetailPanelProps> = ({
  space,
  usersInSpace,
  state,
  knockStatus = 'idle',
  knockCooldownRemaining = 0,
  onJoin,
  onLeave,
  onKnock,
  onUserClick,
  onClose,
  speakingUserIds,
  presentingUserId,
  mutedUserIds,
  className,
}) => {
  const {
    userInSpace,
    privateSpace = false,
    full = false,
    canDirectEnter = true,
  } = state;
  const isDirectEntryAvailable = isSpaceStatusEnterable(space.status);
  const formattedType = space.type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return (
    <section
      className={cn(
        'space-detail-panel',
        'flex h-full flex-col overflow-hidden border-l',
        'animate-in slide-in-from-right-full duration-200 motion-reduce:animate-none',
        className
      )}
      style={{
        backgroundColor: 'var(--vo-detail-panel-bg)',
        borderColor: 'var(--vo-detail-panel-border)',
        boxShadow: 'var(--vo-detail-panel-shadow)',
        backdropFilter: 'blur(var(--vo-detail-panel-backdrop-blur, 16px))',
        WebkitBackdropFilter: 'blur(var(--vo-detail-panel-backdrop-blur, 16px))',
      }}
      // AC7: Click-stop protocol compliance
      data-avatar-interactive="true"
      aria-label={`Details for ${space.name}`}
    >
      <header className="border-b border-[var(--vo-line-soft)] px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 flex-none place-items-center rounded-xl border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)]" aria-hidden="true">
            <SpaceTypeIndicator type={space.type} showLabel={false} size="md" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-base font-bold text-foreground">{space.name}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{formattedType}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{space.status.replace('_', ' ')}</span>
              {privateSpace ? <DoorClosed className="size-3.5 text-[var(--vo-warn)]" aria-label="Private space" /> : null}
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 flex-none place-items-center rounded-lg border border-[var(--vo-line)] text-muted-foreground transition-colors hover:border-[var(--vo-err)] hover:text-[var(--vo-err)]"
              aria-label="Close panel"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            {usersInSpace.length} {usersInSpace.length === 1 ? 'participant' : 'participants'}
          </span>
          {space.capacity > 0 ? (
            <div className="flex items-center gap-2">
              <CapacityIndicator current={usersInSpace.length} capacity={space.capacity} size="md" />
              {full ? <span className="text-xs font-medium text-destructive">At capacity</span> : null}
            </div>
          ) : <span className="text-xs text-muted-foreground">Unlimited</span>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {userInSpace ? (
          <div aria-labelledby={`space-audio-${space.id}`}>
            <h4 id={`space-audio-${space.id}`} className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Audio
            </h4>
            <div className="flex items-center justify-between rounded-xl border border-[var(--vo-line-soft)] bg-[var(--vo-bg-2)] p-2.5" data-testid="space-detail-audio">
              <p className="text-xs text-muted-foreground">Space audio controls</p>
              <SpaceAudioControls />
            </div>
          </div>
        ) : null}

        <div className="min-h-0" aria-labelledby={`space-roster-${space.id}`}>
          <h4 id={`space-roster-${space.id}`} className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            People
          </h4>
          <ParticipantRoster
            users={usersInSpace}
            onUserClick={onUserClick}
            speakingUserIds={speakingUserIds}
            presentingUserId={presentingUserId}
            mutedUserIds={mutedUserIds}
            maxHeight={320}
          />
        </div>
      </div>

      <footer className="border-t border-[var(--vo-line-soft)] px-4 py-3">
        <SpaceActionButtons
          state={{
            userInSpace,
            privateSpace,
            hasOccupants: usersInSpace.length > 0,
            full,
            canDirectEnter,
            isDirectEntryAvailable,
          }}
          onJoin={onJoin}
          onLeave={onLeave}
          onKnock={onKnock}
          knockStatus={knockStatus}
          knockCooldownRemaining={knockCooldownRemaining}
        />
      </footer>
    </section>
  );
};

export default SpaceDetailPanel;
