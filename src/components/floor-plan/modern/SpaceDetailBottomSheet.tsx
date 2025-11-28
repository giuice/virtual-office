// src/components/floor-plan/modern/SpaceDetailBottomSheet.tsx
// Story 3.11 - AC8: Mobile Bottom Sheet Implementation
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Space, UserPresenceData } from '@/types/database';
import { SpaceDetailPanel, SpaceDetailPanelProps } from './SpaceDetailPanel';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

/**
 * Story 3.11 - AC8: Mobile Tap-to-Expand (Bottom Sheet Pattern)
 * - Mobile: tap to expand shows details in bottom sheet modal
 * - Bottom sheet slides up from bottom of screen
 * - Close button and swipe-down to dismiss
 * - Same content as SpaceDetailPanel
 * - Uses Radix Dialog for accessibility and focus trap
 */
export interface SpaceDetailBottomSheetProps extends Omit<SpaceDetailPanelProps, 'className'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SpaceDetailBottomSheet: React.FC<SpaceDetailBottomSheetProps> = ({
  open,
  onOpenChange,
  space,
  usersInSpace,
  agendaPhase,
  activityLog,
  transcript,
  isUserInSpace,
  isPrivate,
  isFull,
  onJoin,
  onLeave,
  onKnock,
  onUserClick,
  onViewAllActivity,
  speakingUserIds,
  presentingUserId,
  mutedUserIds,
  isLoading,
}) => {
  // Handle close
  const handleClose = () => {
    onOpenChange(false);
  };

  // Wrapped handlers to close sheet after action
  const handleJoin = () => {
    onJoin();
    handleClose();
  };

  const handleLeave = () => {
    onLeave();
    handleClose();
  };

  const handleKnock = onKnock ? () => {
    onKnock();
    handleClose();
  } : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Override default positioning for bottom sheet
          '!fixed !bottom-0 !left-0 !right-0 !top-auto',
          '!translate-x-0 !translate-y-0',
          '!max-w-full !w-full',
          '!rounded-t-2xl !rounded-b-none',
          // Glass-morphism styling
          '!p-0',
          // Bottom sheet slide animation
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          '!duration-300'
        )}
        style={{
          backgroundColor: 'var(--vo-detail-panel-bg)',
          borderColor: 'var(--vo-detail-panel-border)',
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(var(--vo-detail-panel-backdrop-blur, 16px))',
          WebkitBackdropFilter: 'blur(var(--vo-detail-panel-backdrop-blur, 16px))',
          maxHeight: '85vh',
        }}
        // AC8: Stop propagation to prevent card navigation
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        data-avatar-interactive="true"
      >
        {/* Visually hidden title for accessibility */}
        <VisuallyHidden>
          <DialogTitle>Space Details: {space.name}</DialogTitle>
          <DialogDescription>
            Detailed information about {space.name} including participants, agenda, and activity log.
          </DialogDescription>
        </VisuallyHidden>

        {/* Drag handle indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div 
            className="w-10 h-1 rounded-full bg-[var(--vo-border-subtle)]"
            aria-hidden="true"
          />
        </div>

        {/* Scrollable content area */}
        <div 
          className="overflow-y-auto overscroll-contain"
          style={{ maxHeight: 'calc(85vh - 40px)' }}
        >
          <SpaceDetailPanel
            space={space}
            usersInSpace={usersInSpace}
            agendaPhase={agendaPhase}
            activityLog={activityLog}
            transcript={transcript}
            isUserInSpace={isUserInSpace}
            isPrivate={isPrivate}
            isFull={isFull}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onKnock={handleKnock}
            onUserClick={onUserClick}
            onClose={handleClose}
            onViewAllActivity={onViewAllActivity}
            speakingUserIds={speakingUserIds}
            presentingUserId={presentingUserId}
            mutedUserIds={mutedUserIds}
            isLoading={isLoading}
            className="rounded-none border-none shadow-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpaceDetailBottomSheet;
