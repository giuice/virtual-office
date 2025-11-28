// src/components/floor-plan/modern/SpaceDetailPanel.tsx
// Story 3.11: Space Detail Hover Panel - Main container component
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Space, UserPresenceData } from '@/types/database';
import { ParticipantRoster } from './ParticipantRoster';
import { AgendaPhaseDisplay } from './AgendaPhaseDisplay';
import { ActivityLogPreview, type ActivityLogEntry } from './ActivityLogPreview';
import { TranscriptSnippet } from './TranscriptSnippet';
import { SpaceActionButtons } from './SpaceActionButtons';
import { CapacityIndicator } from './StatusIndicators';

/**
 * Story 3.11 - AC1: Hover Reveals Expanded Details
 * Story 3.11 - AC9: Theme-Aware Styling with glass-morphism
 * Story 3.12 - AC6: Capacity Display in SpaceDetailPanel
 */
export interface SpaceDetailPanelProps {
  space: Space;
  usersInSpace: UserPresenceData[];
  agendaPhase?: { 
    current: number; 
    total: number; 
    name: string; 
    description?: string;
  };
  activityLog?: ActivityLogEntry[];
  transcript?: { 
    text: string; 
    speaker: string; 
    timestamp: Date;
  };
  isUserInSpace: boolean;
  isPrivate?: boolean;
  /** Story 3.12 - AC3: Whether space is at full capacity */
  isFull?: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onKnock?: () => void;
  onUserClick?: (userId: string) => void;
  onClose?: () => void;
  onViewAllActivity?: () => void;
  /** Speaking user IDs for status display */
  speakingUserIds?: string[];
  /** Presenting user ID for status display */
  presentingUserId?: string;
  /** Muted user IDs for dimmed display */
  mutedUserIds?: string[];
  className?: string;
  /** Loading state while fetching details */
  isLoading?: boolean;
}

/**
 * SpaceDetailPanel - Expanded details overlay for space cards
 * 
 * Features:
 * - Full participant roster (AC2)
 * - Agenda phase display (AC3)
 * - Activity log preview (AC4)
 * - Transcript snippet (AC5)
 * - Action buttons (AC6)
 * - Click-stop protocol compliance (AC7)
 * - Glass-morphism styling (AC9)
 * - 200ms expand animation (AC1)
 */
export const SpaceDetailPanel: React.FC<SpaceDetailPanelProps> = ({
  space,
  usersInSpace,
  agendaPhase,
  activityLog,
  transcript,
  isUserInSpace,
  isPrivate = false,
  isFull = false,
  onJoin,
  onLeave,
  onKnock,
  onUserClick,
  onClose,
  onViewAllActivity,
  speakingUserIds,
  presentingUserId,
  mutedUserIds,
  className,
  isLoading = false,
}) => {
  return (
    <div
      className={cn(
        'space-detail-panel',
        // Base layout
        'flex flex-col gap-3',
        // Padding
        'p-4',
        // Glass-morphism styling (AC9)
        'rounded-xl',
        'border',
        // Animation (AC1)
        'animate-in fade-in-0 zoom-in-95 duration-200',
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
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="region"
      aria-label={`Details for ${space.name}`}
    >
      {/* Loading state */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Space name header */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground truncate">
              {space.name}
            </h4>
            {onClose && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label="Close panel"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Story 3.12 - AC6: Capacity Display */}
          {space.capacity > 0 && (
            <div className="flex items-center justify-between text-sm">
              <CapacityIndicator 
                current={usersInSpace.length} 
                capacity={space.capacity} 
                size="md"
              />
              {isFull && (
                <span className="text-xs text-destructive font-medium">
                  At capacity
                </span>
              )}
            </div>
          )}

          {/* AC2: Full Participant Roster */}
          <ParticipantRoster
            users={usersInSpace}
            onUserClick={onUserClick}
            speakingUserIds={speakingUserIds}
            presentingUserId={presentingUserId}
            mutedUserIds={mutedUserIds}
            maxHeight={160}
          />

          {/* AC3: Agenda Phase Display */}
          {agendaPhase && (
            <AgendaPhaseDisplay
              currentPhase={agendaPhase.current}
              totalPhases={agendaPhase.total}
              phaseName={agendaPhase.name}
              phaseDescription={agendaPhase.description}
            />
          )}

          {/* AC4: Activity Log Preview */}
          {activityLog && activityLog.length > 0 && (
            <ActivityLogPreview
              entries={activityLog}
              maxEntries={3}
              onViewAll={onViewAllActivity}
            />
          )}

          {/* AC5: Transcript Snippet */}
          {transcript && (
            <TranscriptSnippet
              text={transcript.text}
              speaker={transcript.speaker}
              timestamp={transcript.timestamp}
            />
          )}

          {/* AC6: Action Buttons */}
          <SpaceActionButtons
            isUserInSpace={isUserInSpace}
            isPrivate={isPrivate}
            isFull={isFull}
            onJoin={onJoin}
            onLeave={onLeave}
            onKnock={onKnock}
          />
        </>
      )}
    </div>
  );
};

export default SpaceDetailPanel;
