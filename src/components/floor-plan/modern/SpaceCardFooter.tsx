import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import type { KnockStatus } from '@/hooks/useKnock';
import { cn } from '@/lib/utils';

interface SpaceCardFooterProps {
  occupantCount: number;
  capacity: number;
  isFull: boolean;
  isDirectEntryAvailable: boolean;
  isUserInSpace: boolean;
  canDirectEnter: boolean;
  onEnter: () => void;
  onKnock?: () => void;
  knockStatus?: KnockStatus;
  knockCooldownRemaining?: number;
}

function stopActionPropagation(event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) {
  event.stopPropagation();
}

function getKnockAction(status: KnockStatus, cooldownRemaining: number) {
  if (status === 'knocking') return { label: 'Knocking...', disabled: true, waiting: true };
  if (status === 'cooldown' && cooldownRemaining > 0) {
    return { label: `Wait ${cooldownRemaining}s`, disabled: true, waiting: true };
  }
  if (status === 'denied') return { label: 'Denied', disabled: false, waiting: false };
  if (status === 'timeout') return { label: 'No response', disabled: false, waiting: false };
  return { label: 'Knock', disabled: false, waiting: false };
}

export function SpaceCardFooter({
  occupantCount,
  capacity,
  isFull,
  isDirectEntryAvailable,
  isUserInSpace,
  canDirectEnter,
  onEnter,
  onKnock,
  knockStatus = 'idle',
  knockCooldownRemaining = 0,
}: SpaceCardFooterProps) {
  const hasCapacityLimit = capacity > 0;
  const capacityPercent = hasCapacityLimit
    ? Math.min(100, Math.round((occupantCount / capacity) * 100))
    : 0;
  const isKnockOnly = !isUserInSpace && Boolean(onKnock) && !canDirectEnter;
  const knockAction = getKnockAction(knockStatus, knockCooldownRemaining);

  let actionLabel = 'Enter';
  let actionDisabled = false;
  let actionKind: 'enter' | 'knock' | 'disabled' = 'enter';
  let actionWaiting = false;

  if (isUserInSpace) {
    actionLabel = "You're here";
    actionDisabled = true;
    actionKind = 'disabled';
  } else if (isKnockOnly) {
    actionLabel = knockAction.label;
    actionDisabled = knockAction.disabled;
    actionWaiting = knockAction.waiting;
    actionKind = 'knock';
  } else if (!isDirectEntryAvailable) {
    actionLabel = 'Unavailable';
    actionDisabled = true;
    actionKind = 'disabled';
  } else if (isFull) {
    actionLabel = 'Full';
    actionDisabled = true;
    actionKind = 'disabled';
  }

  const handleAction = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (actionDisabled) return;
    if (actionKind === 'knock') {
      onKnock?.();
      return;
    }
    onEnter();
  };

  return (
    <footer className="vo-space-card-footer">
      <span
        className={cn('vo-space-card-capacity', isFull && 'vo-space-card-capacity--full')}
        data-testid="space-card-capacity"
        aria-label={hasCapacityLimit
          ? `${occupantCount} of ${capacity} places occupied`
          : `${occupantCount} people, unlimited capacity`}
      >
        <span>{hasCapacityLimit ? `${occupantCount}/${capacity}` : occupantCount}</span>
        {hasCapacityLimit ? (
          <span className="vo-space-card-capbar" data-testid="space-card-capbar" aria-hidden="true">
            <span style={{ '--capacity-width': `${capacityPercent}%` } as CSSProperties} />
          </span>
        ) : null}
      </span>

      <button
        type="button"
        className={cn(
          'vo-space-card-action',
          actionKind === 'knock' && 'vo-space-card-action--knock',
          actionWaiting && 'vo-space-card-action--waiting'
        )}
        data-testid="space-card-action"
        data-space-action="true"
        data-avatar-interactive={actionKind === 'knock' ? 'true' : undefined}
        onClick={handleAction}
        onPointerDown={stopActionPropagation}
        disabled={actionDisabled}
        aria-disabled={actionDisabled}
        aria-label={actionLabel}
      >
        {actionKind === 'knock' && actionLabel === 'Knock' ? (
          <>
            <span aria-hidden="true">🚪</span>{' '}
            Knock
          </>
        ) : actionLabel}
      </button>
    </footer>
  );
}
