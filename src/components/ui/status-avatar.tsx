// src/components/ui/status-avatar.tsx
'use client';

import { User } from '@/components/floor-plan/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils';

interface StatusAvatarProps {
  user: User;
  size?: 'sm' | 'md' | 'lg';
  showStatusIndicator?: boolean;
}

export function StatusAvatar({ 
  user, 
  size = 'md',
  showStatusIndicator = true 
}: StatusAvatarProps) {
  // Get status color using theme-aware colors
  const getStatusColor = (status: User['status']) => {
    switch (status) {
      case 'active': return 'hsl(var(--success))';
      case 'away': return 'hsl(var(--warning))';
      case 'presenting': return 'hsl(var(--primary))';
      case 'viewing': return 'hsl(var(--secondary))';
      default: return 'hsl(var(--muted-foreground))';
    }
  };

  // Size mappings
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12'
  };

  // Status indicator size mappings
  const indicatorSizes = {
    sm: 'h-3 w-3 border-2',
    md: 'h-4 w-4 border-2',
    lg: 'h-5 w-5 border-3' 
  };

  // Status glow effect based on status
  const statusColor = getStatusColor(user.status);
  
  return (
    <div className="relative">
      <Avatar className={`${sizeClasses[size]} ring-2 ring-offset-2 dark:ring-offset-gray-900 ring-offset-white ring-gray-100 dark:ring-gray-800`}>
        <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
        <AvatarFallback>{getUserInitials(user.name)}</AvatarFallback>
      </Avatar>
      
      {showStatusIndicator && (
        <span 
          className={`absolute bottom-0 right-0 ${indicatorSizes[size]} rounded-full border-2 border-white dark:border-gray-900 shadow-sm transition-all`}
          style={{ 
            backgroundColor: statusColor,
            boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${statusColor}20`
          }}
        />
      )}
    </div>
  );
}
