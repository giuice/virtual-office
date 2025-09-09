// src/components/floor-plan/user-hover-card.tsx
'use client'

import { UIUser, userStatusColors } from './types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Mic, MicOff, Monitor, Coffee } from 'lucide-react';
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils';

interface UserHoverCardProps {
  user: UIUser;
}

export function UserHoverCard({ user }: UserHoverCardProps) {
  const getStatusIcon = () => {
    switch (user.status) {
      case 'online':
        return <Mic className="h-3 w-3 mr-1 text-success" />;
      case 'busy':
        return <Monitor className="h-3 w-3 mr-1 text-primary" />;
      case 'away':
        return user.statusMessage?.toLowerCase().includes('break') 
          ? <Coffee className="h-3 w-3 mr-1 text-warning" />
          : <MicOff className="h-3 w-3 mr-1 text-warning" />;
      default:
        return <MicOff className="h-3 w-3 mr-1 text-muted-foreground" />;
    }
  };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="flex items-center space-x-2 cursor-pointer">
          <Avatar className="h-8 w-8">
            <AvatarImage src={getAvatarUrl(user)} alt={user.displayName} />
            <AvatarFallback>{getUserInitials(user.displayName)}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{user.displayName}</span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="flex justify-between space-x-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={getAvatarUrl(user)} alt={user.displayName} />
            <AvatarFallback>{getUserInitials(user.displayName)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1 flex-1">
            <h4 className="text-sm font-semibold">{user.displayName}</h4>
            <div className="flex items-center">
              <Badge variant="outline" className="mr-2 flex items-center">
                {getStatusIcon()}
                {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user.statusMessage}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
