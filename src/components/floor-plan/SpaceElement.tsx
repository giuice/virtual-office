import React from 'react';
import { Space } from '@/types/database';
import { UserPresenceData } from '@/types/database';
import UserAvatarPresence from './UserAvatarPresence';

interface SpaceElementProps {
  space: Space;
  usersInSpace: UserPresenceData[];
  onEnterSpace: (spaceId: string) => void;
}

const SpaceElement: React.FC<SpaceElementProps> = ({ space, usersInSpace, onEnterSpace }) => {
  const handleClick = () => {
    onEnterSpace(space.id);
  };

  return (
    <div
      className="space-element bg-card border rounded p-2 absolute cursor-pointer hover:bg-muted/50"
      style={{
        top: `${space.position?.y ?? 0}px`,
        left: `${space.position?.x ?? 0}px`,
        width: `${space.position?.width ?? 100}px`,
        height: `${space.position?.height ?? 100}px`,
      }}
      onClick={handleClick}
      aria-label={`Enter space ${space.name}`}
      role="button"
    >
      <h3 className="font-semibold text-sm mb-1 truncate">{space.name}</h3>
      <div className="flex flex-wrap gap-1">
        {usersInSpace.map((user) => (
          <UserAvatarPresence key={user.id} user={user} />
        ))}
        {usersInSpace.length === 0 && (
          <span className="text-xs text-muted-foreground">Empty</span>
        )}
      </div>
    </div>
  );
};

export default SpaceElement;
