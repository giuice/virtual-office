import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { UserPresenceData } from '@/types/database';

interface AvatarOverflowBadgeProps {
  remainingCount: number;
  visibleCount: number;
  users: UserPresenceData[];
  max: number;
}

export function AvatarOverflowBadge({
  remainingCount,
  visibleCount,
  users,
  max,
}: AvatarOverflowBadgeProps) {
  if (remainingCount <= 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="vo-avatar-overflow"
            style={{ zIndex: visibleCount + 1 }}
            aria-label={`${remainingCount} more participants`}
          >
            +{remainingCount}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-center">
            <p className="text-sm font-medium">
              {remainingCount} more {remainingCount === 1 ? 'participant' : 'participants'}
            </p>
            <div className="mt-1 text-xs text-muted-foreground max-w-[200px]">
              {users.slice(max).map(user => user.displayName).join(', ')}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
