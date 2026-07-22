// src/components/floor-plan/modern/SpaceDetailBottomSheet.tsx
// Story 3.11 - AC8: Mobile Bottom Sheet Implementation
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SpaceDetailPanel, SpaceDetailPanelProps } from './SpaceDetailPanel';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

/**
 * Story 3.11 - AC8: Mobile Tap-to-Expand (Bottom Sheet Pattern)
 * - Mobile: tap to expand shows details in bottom sheet modal
 * - Bottom sheet slides up from bottom of screen
 * - Close button and swipe-down to dismiss
 * - Same content as SpaceDetailPanel
 * - Uses a non-modal Radix Dialog so the global Knock banner remains operable
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
  state,
  knockStatus,
  knockCooldownRemaining,
  onJoin,
  onLeave,
  onKnock,
  onUserClick,
  speakingUserIds,
  presentingUserId,
  mutedUserIds,
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
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPortal>
        <div
          aria-hidden="true"
          className="pointer-events-auto fixed inset-0 z-[49] bg-[var(--vo-bg)]/60 backdrop-blur-[2px]"
          data-testid="space-detail-backdrop"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            handleClose();
          }}
        />
      </DialogPortal>
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
        onPointerDownOutside={(event) => event.preventDefault()}
        data-avatar-interactive="true"
      >
        {/* Visually hidden title for accessibility */}
        <VisuallyHidden>
          <DialogTitle>Space Details: {space.name}</DialogTitle>
          <DialogDescription>
            Details for {space.name}, including its participant roster, audio, and available actions.
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
            state={state}
            knockStatus={knockStatus}
            knockCooldownRemaining={knockCooldownRemaining}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onKnock={handleKnock}
            onUserClick={onUserClick}
            onClose={handleClose}
            speakingUserIds={speakingUserIds}
            presentingUserId={presentingUserId}
            mutedUserIds={mutedUserIds}
            className="min-h-[min(72vh,560px)] rounded-none border-0 shadow-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpaceDetailBottomSheet;
