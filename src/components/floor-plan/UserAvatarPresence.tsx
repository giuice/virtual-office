import React from 'react';
import { UserPresenceData } from '@/types/database';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarPresenceProps {
  user: UserPresenceData;
  onClick?: (userId: string) => void;
}

const getInitials = (name: string = '') =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const UserAvatarPresence: React.FC<UserAvatarPresenceProps> = ({ user, onClick }) => {
  const statusColor = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    busy: 'bg-red-500',
    offline: 'bg-gray-400',
  }[user.status || 'offline'] || 'bg-gray-400';

  const handleClick = () => {
    if (onClick) {
      onClick(user.id);
    }
  };

  return (
    <div
      className="relative inline-block"
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? `User ${user.display_name}` : undefined}
    >
      <Avatar className={cn('h-8 w-8', onClick && 'cursor-pointer')}>
        <AvatarImage src={user.avatar_url || undefined} alt={user.display_name || 'User Avatar'} />
        <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
      </Avatar>
      <span
        className={cn(
          'absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-background ring-1 ring-background',
          statusColor
        )}
        title={`Status: ${user.status || 'offline'}`}
      />
    </div>
  );
};

export default UserAvatarPresence;
