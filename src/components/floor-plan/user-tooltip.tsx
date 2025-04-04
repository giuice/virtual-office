// src/components/floor-plan/user-tooltip.tsx
import { User } from '@/types/database';
import { useEffect, useState } from 'react';

interface UserTooltipProps {
  user: User;
  position: { x: number; y: number };
}

export function UserTooltip({ user, position }: UserTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Add a small delay before showing the tooltip to prevent flickering
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    return () => clearTimeout(timer);
  }, [user.id]);

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-50 bg-background border rounded-md shadow-md p-2 text-sm"
      style={{
        left: `${position.x + 10}px`,
        top: `${position.y + 10}px`,
        transform: 'translate(0, -50%)',
        maxWidth: '200px',
      }}
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-medium">
                {user.displayName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <span 
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background ${
              user.status === 'online' 
                ? 'bg-success' 
                : user.status === 'busy' 
                ? 'bg-destructive' 
                : user.status === 'away' 
                ? 'bg-warning' 
                : 'bg-muted-foreground'
            }`}
          />
        </div>
        <div>
          <p className="font-medium">{user.displayName}</p>
          <p className="text-xs text-muted-foreground capitalize">{user.status}</p>
          {user.statusMessage && (
            <p className="text-xs italic mt-1">{user.statusMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
